import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIrcLine, toChatMessage, toUserNotice, stripEmotes } from '../src/twitch/irc-parser.js';
import { sanitize, splitMessage } from '../src/twitch/irc.js';
import { Templates } from '../src/core/template.js';
import { normalizeConfig, ConfigError } from '../src/config.js';
import { findLinks, capsPercent, Moderator } from '../src/core/moderation.js';
import { TimerManager } from '../src/core/timers.js';
import { formatDuration } from '../src/core/format.js';
import { matchName } from '../src/obs/obs.js';

test('IRC: PRIVMSG mit Tags, Escapes, Badges und Emotes', () => {
    const line =
        '@badge-info=subscriber/14;badges=moderator/1,subscriber/12;display-name=Max\\sMuster;emotes=25:0-4,12-16;first-msg=1;id=abc;mod=1;user-id=42;room-id=1 :max!max@max.tmi.twitch.tv PRIVMSG #sevx :Kappa hallo Kappa';
    const msg = toChatMessage(parseIrcLine(line));
    assert.equal(msg.text, 'Kappa hallo Kappa');
    assert.equal(msg.displayName, 'Max Muster');
    assert.equal(msg.login, 'max');
    assert.equal(msg.channel, 'sevx');
    assert.ok(msg.isMod && msg.isSubscriber && msg.isFirstMessage && !msg.isBroadcaster);
    assert.equal(msg.emotes.length, 2);
    assert.equal(stripEmotes(msg.text, msg.emotes), 'hallo');
    assert.equal(msg.fromSharedChat, false);
});

test('IRC: /me, PING, Shared Chat und USERNOTICE', () => {
    const action = toChatMessage(parseIrcLine(':a!a@a.tmi.twitch.tv PRIVMSG #x :\u0001ACTION tanzt\u0001'));
    assert.equal(action.text, 'tanzt');
    assert.ok(action.isAction);

    const ping = parseIrcLine('PING :tmi.twitch.tv');
    assert.equal(ping.command, 'PING');
    assert.deepEqual(ping.params, ['tmi.twitch.tv']);

    const shared = toChatMessage(parseIrcLine('@room-id=1;source-room-id=2 :a!a@a.tmi.twitch.tv PRIVMSG #x :hi'));
    assert.ok(shared.fromSharedChat);

    const resub = toUserNotice(
        parseIrcLine(
            '@msg-id=resub;login=anna;display-name=Anna;msg-param-cumulative-months=7;msg-param-sub-plan=2000;system-msg=Anna\\ssubscribed :tmi.twitch.tv USERNOTICE #x :Hallo!'
        )
    );
    assert.equal(resub.type, 'resub');
    assert.equal(resub.months, 7);
    assert.equal(resub.message, 'Hallo!');
    assert.equal(resub.systemMessage, 'Anna subscribed');
    const anon = toUserNotice(parseIrcLine('@msg-id=subgift;login=ananonymousgifter;display-name=AnAnonymousGifter :tmi.twitch.tv USERNOTICE #x'));
    assert.equal(anon.displayName, 'Anonym');
});

test('Ausgehende Nachrichten: keine Chat-Befehle, keine Zeilenumbrüche, max. 500 Zeichen', () => {
    assert.equal(sanitize('/ban jemand'), '​/ban jemand');
    assert.equal(sanitize('.timeout x'), '​.timeout x');
    assert.equal(sanitize('/me winkt'), '/me winkt');
    assert.equal(sanitize('Zeile1\r\nPRIVMSG #x :hack'), 'Zeile1 PRIVMSG #x :hack');
    const long = 'wort '.repeat(250).trim();
    const parts = splitMessage(long);
    assert.ok(parts.length === 3 && parts.every((p) => p.length <= 500 && !p.startsWith(' ')));
    assert.equal(parts.join(' '), long);
    assert.equal(splitMessage('😀'.repeat(600)).length, 2); // Emojis zählen als ein Zeichen
});

test('Platzhalter werden nur einmal ausgewertet (kein Einschleusen über Chat-Text)', async () => {
    const t = new Templates();
    t.register('counter', (name) => (name === 'tode' ? 3 : 0));
    assert.equal(
        await t.render('{user} sagt {args} ({1}|{3}) {counter:tode} {unbekannt}', { user: 'Max', args: 'a {counter:tode}', argv: ['a', '{counter:tode}'] }),
        'Max sagt a {counter:tode} (a|) 3 {unbekannt}'
    );
    for (let i = 0; i < 50; i++) {
        const n = Number(await t.render('{random:5-7}'));
        assert.ok(n >= 5 && n <= 7);
        assert.ok(['x', 'y'].includes(await t.render('{pick:x|y}')));
    }
});

test('Konfiguration: verständliche Fehler bei Tippfehlern', () => {
    const base = { twitch: { channel: 'sevx' } };
    assert.throws(() => normalizeConfig({}), /twitch.channel/);
    assert.throws(
        () => normalizeConfig({ ...base, commands: { x: { actions: [{ szene: 'Pause' }] } } }),
        /"commands.x.actions\[0\]": unbekannte Aktion "szene"/
    );
    assert.throws(() => normalizeConfig({ ...base, commands: { x: { actions: [{ say: 'a', scene: 'b' }] } } }), /genau eine Aktion/);
    assert.throws(() => normalizeConfig({ ...base, commands: { x: { response: 'a', permission: 'admin' } } }), /unbekannte Berechtigung "admin"/);
    assert.throws(() => normalizeConfig({ ...base, commands: { x: {} } }), ConfigError);

    const c = normalizeConfig({
        ...base,
        commands: { '!Lurk': 'bye', mods: { response: 'x', permission: 'mod' } },
        events: { follow: [{ say: 'hi' }], folow: [], redemptions: { 'Hydrieren!': [{ wait: 1 }] } },
        moderation: { enabled: true, links: true, caps: { enabled: false } }
    });
    assert.equal(c.commands[0].name, 'lurk');
    assert.equal(c.commands[1].permission, 'moderator');
    assert.ok(c.events.follow && c.events.redemptions['hydrieren!']);
    assert.match(c.warnings[0], /events.folow/);
    assert.ok(c.moderation.links.enabled && !c.moderation.caps.enabled && !c.moderation.length.enabled);
});

test('Link-Erkennung ohne Fehlalarme bei normalem Text', () => {
    assert.deepEqual(findLinks('schau auf www.Example.com/abc und https://bit.ly/x'), ['bit.ly', 'example.com']);
    assert.deepEqual(findLinks('kauft auf cheap-viewers.de!'), ['cheap-viewers.de']);
    for (const ok of ['z.B. heute', 'ca. 5 Minuten', 'usw.', 'Version 1.2.3', 'mail an max@web.de', 'Ende.Neuer Satz', '...']) {
        assert.deepEqual(findLinks(ok), [], ok);
    }
});

test('Moderation: Ausnahmen, Caps ohne Emotes, Strafstufen', () => {
    const config = normalizeConfig({
        twitch: { channel: 'x' },
        moderation: {
            enabled: true,
            links: {},
            caps: { minLength: 10, maxPercent: 60 },
            bannedWords: { words: ['böse', '/\\bspam+\\b/'] },
            punishment: { steps: ['delete', 30], resetAfter: 1 }
        }
    }).moderation;
    let now = 0;
    const mod = new Moderator({ config, now: () => now });
    const msg = (text, extra = {}) => ({ text, login: 'u', userId: '1', emotes: [], ...extra });

    assert.equal(mod.check(msg('HALLO WIE GEHTS EUCH ALLEN')).rule, 'caps');
    assert.equal(mod.check(msg('KEKW KEKW KEKW KEKW lol', { emotes: [0, 5, 10, 15].map((s) => ({ start: s, end: s + 3 })) })), null);
    assert.equal(mod.check(msg('das ist BÖSE')).rule, 'words');
    assert.equal(mod.check(msg('spammmm')).rule, 'words');
    assert.equal(mod.check(msg('ein spammer')), null);
    assert.equal(mod.check(msg('link.com', { isMod: true })), null);
    assert.equal(mod.check(msg('link.com', { isVip: true })), null);
    assert.equal(mod.check(msg('link.com', { isSubscriber: true })).rule, 'links');

    assert.equal(mod.nextPunishment(msg('x'), { rule: 'links' }), 'delete');
    assert.equal(mod.nextPunishment(msg('x'), { rule: 'links' }), 30);
    assert.equal(mod.nextPunishment(msg('x'), { rule: 'links' }), 30);
    now += 61_000; // Verstöße nach resetAfter vergessen
    assert.equal(mod.nextPunishment(msg('x'), { rule: 'links' }), 'delete');

    mod.permit('u');
    assert.equal(mod.check(msg('link.com')), null);
    assert.equal(mod.check(msg('link.com')).rule, 'links'); // Erlaubnis gilt nur für einen Link
    assert.ok(capsPercent('ÄÖÜ abc').percent === 50);
});

test('Timer: Intervall, Mindestaktivität, nur live, Reihenfolge', async () => {
    let now = 0;
    let live = false;
    const said = [];
    const timers = new TimerManager({
        timers: normalizeConfig({ twitch: { channel: 'x' }, timers: [{ interval: 10, minChatLines: 2, messages: ['A', 'B'] }] }).timers,
        chat: { say: (t) => said.push(t) },
        actions: { run: async () => {} },
        templates: new Templates(),
        isLive: () => live,
        now: () => now
    });
    now = 11 * 60_000;
    timers.onChatMessage();
    timers.onChatMessage();
    await timers.tick();
    assert.deepEqual(said, []); // offline
    live = true;
    await timers.tick();
    assert.deepEqual(said, ['A']);
    now += 11 * 60_000;
    await timers.tick();
    assert.deepEqual(said, ['A']); // zu wenig Chat
    timers.onChatMessage();
    timers.onChatMessage();
    await timers.tick();
    assert.deepEqual(said, ['A', 'B']);
});

test('Hilfsfunktionen: Dauer (Dativ) und unscharfe Namenssuche', () => {
    assert.equal(formatDuration(45_000), '45 Sekunden');
    assert.equal(formatDuration((3600 + 61) * 1000), '1 Stunde und 1 Minute');
    assert.equal(formatDuration(2 * 86400_000 + 3 * 3600_000 + 5000), '2 Tagen und 3 Stunden');
    const scenes = ['Hauptszene', 'Pause', 'Just Chatting', 'Chat Only'];
    assert.equal(matchName(scenes, 'pause'), 'Pause');
    assert.equal(matchName(scenes, 'haupt'), 'Hauptszene');
    assert.equal(matchName(scenes, 'chat'), 'Chat Only'); // Anfang des Namens hat Vorrang
    assert.equal(matchName(scenes, 'at'), null); // mehrdeutig
    assert.equal(matchName(scenes, 'just'), 'Just Chatting');
});
