// Zerlegt Twitch-IRC-Zeilen wie
// "@badges=moderator/1;display-name=Max :max!max@max.tmi.twitch.tv PRIVMSG #kanal :Hallo"

const TAG_ESCAPES = { ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n' };

export function unescapeTag(value) {
    return value.replace(/\\(.?)/g, (_, c) => (c === '' ? '' : (TAG_ESCAPES[c] ?? c)));
}

export function parseIrcLine(line) {
    if (!line) return null;
    const msg = { raw: line, tags: {}, prefix: null, nick: null, command: '', params: [] };
    let pos = 0;

    const skipSpaces = () => {
        while (line[pos] === ' ') pos++;
    };
    const nextToken = () => {
        let end = line.indexOf(' ', pos);
        if (end === -1) end = line.length;
        const token = line.slice(pos, end);
        pos = end;
        skipSpaces();
        return token;
    };

    if (line[pos] === '@') {
        pos++;
        for (const pair of nextToken().split(';')) {
            if (!pair) continue;
            const eq = pair.indexOf('=');
            if (eq === -1) msg.tags[pair] = '';
            else msg.tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
        }
    }

    if (line[pos] === ':') {
        pos++;
        msg.prefix = nextToken();
        const bang = msg.prefix.indexOf('!');
        if (bang !== -1) msg.nick = msg.prefix.slice(0, bang);
        else if (!msg.prefix.includes('.')) msg.nick = msg.prefix;
    }

    msg.command = nextToken();

    while (pos < line.length) {
        if (line[pos] === ':') {
            msg.params.push(line.slice(pos + 1));
            break;
        }
        msg.params.push(nextToken());
    }
    return msg;
}

/** "subscriber/12,premium/1" → { subscriber: "12", premium: "1" } */
export function parseBadges(value) {
    const badges = {};
    if (!value) return badges;
    for (const part of value.split(',')) {
        const [name, version = ''] = part.split('/');
        if (name) badges[name] = version;
    }
    return badges;
}

/** "25:0-4,12-16/1902:6-10" → [{ id: "25", start: 0, end: 4 }, …] (Positionen in Unicode-Zeichen) */
export function parseEmotes(value) {
    const emotes = [];
    if (!value) return emotes;
    for (const group of value.split('/')) {
        const [id, ranges] = group.split(':');
        if (!ranges) continue;
        for (const range of ranges.split(',')) {
            const [start, end] = range.split('-').map(Number);
            if (Number.isInteger(start) && Number.isInteger(end)) emotes.push({ id, start, end });
        }
    }
    return emotes;
}

/** Entfernt Emotes aus dem Text (z.B. damit "KEKW" nicht als Großschreibung zählt). */
export function stripEmotes(text, emotes) {
    if (!emotes?.length) return text;
    const chars = Array.from(text);
    for (const { start, end } of emotes) {
        for (let i = start; i <= end && i < chars.length; i++) chars[i] = '';
    }
    return chars.join('').replace(/\s+/g, ' ').trim();
}

export function toChatMessage(msg) {
    const tags = msg.tags;
    let text = msg.params[1] ?? '';
    let isAction = false;
    if (text.startsWith('\u0001ACTION ') && text.endsWith('\u0001')) {
        text = text.slice(8, -1);
        isAction = true;
    }
    const badges = parseBadges(tags.badges);
    const login = (tags.login || msg.nick || '').toLowerCase();
    return {
        id: tags.id,
        channel: (msg.params[0] ?? '').replace(/^#/, ''),
        text,
        isAction,
        userId: tags['user-id'],
        login,
        displayName: tags['display-name'] || login,
        badges,
        isBroadcaster: 'broadcaster' in badges,
        isMod: tags.mod === '1' || 'moderator' in badges,
        isVip: tags.vip === '1' || 'vip' in badges,
        isSubscriber: tags.subscriber === '1' || 'subscriber' in badges || 'founder' in badges,
        isFirstMessage: tags['first-msg'] === '1',
        // Nachrichten aus anderen Kanälen einer "Shared Chat"-Sitzung
        fromSharedChat: Boolean(tags['source-room-id'] && tags['room-id'] && tags['source-room-id'] !== tags['room-id']),
        bits: Number(tags.bits || 0),
        emotes: parseEmotes(tags.emotes),
        tags
    };
}

export function toUserNotice(msg) {
    const t = msg.tags;
    const login = (t.login || '').toLowerCase();
    const anonymous = login === 'ananonymousgifter' || String(t['msg-id']).startsWith('anon');
    return {
        type: t['msg-id'],
        login,
        userId: t['user-id'],
        displayName: anonymous ? 'Anonym' : t['display-name'] || login,
        anonymous,
        message: msg.params[1] ?? '',
        systemMessage: t['system-msg'] ?? '',
        months: Number(t['msg-param-cumulative-months'] || t['msg-param-months'] || 0),
        streak: Number(t['msg-param-streak-months'] || 0),
        plan: t['msg-param-sub-plan'],
        recipient: t['msg-param-recipient-display-name'] || t['msg-param-recipient-user-name'] || '',
        giftCount: Number(t['msg-param-mass-gift-count'] || 0),
        viewers: Number(t['msg-param-viewerCount'] || 0),
        fromSharedChat: Boolean(t['source-room-id'] && t['room-id'] && t['source-room-id'] !== t['room-id']),
        tags: t
    };
}
