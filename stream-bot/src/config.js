// Lädt config.yml + .env und prüft alles, damit Tippfehler früh und verständlich auffallen.

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export class ConfigError extends Error {}

export const PERMISSIONS = ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster'];

const PERMISSION_ALIASES = {
    alle: 'everyone',
    jeder: 'everyone',
    sub: 'subscriber',
    subs: 'subscriber',
    abonnent: 'subscriber',
    mod: 'moderator',
    mods: 'moderator',
    streamer: 'broadcaster'
};

export const EVENT_TYPES = ['follow', 'sub', 'resub', 'subgift', 'giftbomb', 'raid', 'cheer', 'firstMessage'];

/** Lädt die .env-Datei (falls vorhanden) in process.env. */
export function loadEnvFile(file) {
    if (!fs.existsSync(file)) return false;
    if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(file);
        return true;
    }
    // Fallback für ältere Node-Versionen
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return true;
}

export function loadConfigFile(file, env = process.env) {
    if (!fs.existsSync(file)) {
        throw new ConfigError(`Konfiguration nicht gefunden: ${file}\n` + `Kopiere "config.example.yml" nach "config.yml" und passe sie an.`);
    }
    let raw;
    try {
        raw = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
    } catch (err) {
        throw new ConfigError(`config.yml ist kein gültiges YAML: ${err.message}`);
    }
    return normalizeConfig(raw, env, path.dirname(path.resolve(file)));
}

export function normalizeConfig(raw, env = {}, baseDir = process.cwd()) {
    const warnings = [];
    const twitchRaw = obj(raw.twitch, 'twitch');
    const channel = String(twitchRaw.channel ?? '')
        .trim()
        .replace(/^#/, '')
        .toLowerCase();
    if (!channel || channel === 'deinkanal') {
        throw new ConfigError('Bitte trage in config.yml unter "twitch.channel" deinen Twitch-Kanal ein.');
    }

    const botRaw = obj(raw.bot, 'bot');
    const obsRaw = obj(raw.obs, 'obs');

    const config = {
        baseDir,
        dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(baseDir, 'data'),
        twitch: {
            channel,
            clientId: env.TWITCH_CLIENT_ID || undefined,
            clientSecret: env.TWITCH_CLIENT_SECRET || undefined,
            botToken: env.TWITCH_BOT_TOKEN || undefined,
            broadcasterToken: env.TWITCH_BROADCASTER_TOKEN || undefined
        },
        bot: {
            prefix: String(botRaw.prefix ?? '!'),
            modsIgnoreCooldown: botRaw.modsIgnoreCooldown !== false,
            noPermissionMessage: botRaw.noPermissionMessage ? String(botRaw.noPermissionMessage) : '',
            greetOnJoin: botRaw.greetOnJoin ? String(botRaw.greetOnJoin) : ''
        },
        obs: {
            enabled: obsRaw.enabled !== false,
            url: String(obsRaw.url ?? 'ws://127.0.0.1:4455'),
            password: env.OBS_PASSWORD || (obsRaw.password ? String(obsRaw.password) : undefined),
            defaultMic: obsRaw.defaultMic ? String(obsRaw.defaultMic) : undefined
        },
        messages: stringMap(raw.messages, 'messages'),
        builtins: normalizeBuiltins(raw.builtins),
        commands: normalizeCommands(raw.commands),
        timers: normalizeTimers(raw.timers),
        moderation: normalizeModeration(raw.moderation),
        events: normalizeEvents(raw.events, warnings),
        warnings
    };
    if (config.bot.prefix.length === 0 || /\s/.test(config.bot.prefix)) {
        throw new ConfigError('"bot.prefix" darf nicht leer sein und keine Leerzeichen enthalten.');
    }
    return config;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen

function obj(value, where) {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ConfigError(`"${where}" muss ein Objekt (Schlüssel: Wert) sein.`);
    }
    return value;
}

function list(value, where) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new ConfigError(`"${where}" muss eine Liste sein.`);
    return value;
}

function stringMap(value, where) {
    const result = {};
    for (const [k, v] of Object.entries(obj(value, where))) result[k] = String(v);
    return result;
}

function num(value, where, { min = 0, def } = {}) {
    if (value === undefined || value === null) return def;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min) throw new ConfigError(`"${where}" muss eine Zahl ≥ ${min} sein.`);
    return n;
}

export function normalizePermission(value, where, def = 'everyone') {
    if (value === undefined || value === null) return def;
    const p = String(value).toLowerCase();
    const resolved = PERMISSION_ALIASES[p] ?? p;
    if (!PERMISSIONS.includes(resolved)) {
        throw new ConfigError(`"${where}": unbekannte Berechtigung "${value}". Erlaubt: ${PERMISSIONS.join(', ')}.`);
    }
    return resolved;
}

export function normalizeCommandName(name) {
    return String(name).trim().toLowerCase().replace(/^!/, '');
}

function names(value, where) {
    return list(value, where).map(normalizeCommandName).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Aktionen (Schritte, die bei Befehlen, Events oder Timern ausgeführt werden)

const TOGGLE_VALUES = { true: true, false: false, an: true, aus: false, on: true, off: false, toggle: 'toggle' };

function toggleValue(value, where, def) {
    if (value === undefined || value === null) return def;
    const v = TOGGLE_VALUES[String(value).toLowerCase()];
    if (v === undefined) throw new ConfigError(`"${where}" muss true, false oder toggle sein.`);
    return v;
}

function requireString(value, where) {
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new ConfigError(`"${where}" fehlt.`);
    }
    return String(value);
}

const STEP_PARSERS = {
    say: (v, w) => ({ text: requireString(v, w) }),
    scene: (v, w) => ({ scene: requireString(v, w) }),
    source: (v, w) => {
        const o = typeof v === 'string' ? { source: v } : obj(v, w);
        return {
            source: requireString(o.source, `${w}.source`),
            scene: o.scene ? String(o.scene) : undefined,
            visible: toggleValue(o.visible, `${w}.visible`, true),
            duration: num(o.duration, `${w}.duration`, { def: 0 })
        };
    },
    mute: (v, w) => ({ input: requireString(v, w), mute: true }),
    unmute: (v, w) => ({ input: requireString(v, w), mute: false }),
    toggleMute: (v, w) => ({ input: requireString(v, w), mute: 'toggle' }),
    text: (v, w) => {
        const o = obj(v, w);
        return { source: requireString(o.source, `${w}.source`), text: String(o.text ?? '') };
    },
    media: (v, w) => {
        const o = typeof v === 'string' ? { source: v } : obj(v, w);
        const action = String(o.action ?? 'restart').toLowerCase();
        if (!['restart', 'play', 'pause', 'stop'].includes(action)) {
            throw new ConfigError(`"${w}.action" muss restart, play, pause oder stop sein.`);
        }
        return { source: requireString(o.source, `${w}.source`), action };
    },
    filter: (v, w) => {
        const o = obj(v, w);
        return {
            source: requireString(o.source, `${w}.source`),
            filter: requireString(o.filter, `${w}.filter`),
            enabled: toggleValue(o.enabled, `${w}.enabled`, 'toggle')
        };
    },
    replay: () => ({}),
    wait: (v, w) => ({ seconds: num(v, w) }),
    counter: (v, w) => {
        const o = typeof v === 'string' ? { name: v } : obj(v, w);
        const step = { name: requireString(o.name, `${w}.name`).toLowerCase() };
        if (o.set !== undefined) step.set = num(o.set, `${w}.set`, { min: -Infinity });
        else step.add = num(o.add, `${w}.add`, { min: -Infinity, def: 1 });
        return step;
    },
    shoutout: (v, w) => ({ user: requireString(v, w) }),
    timeout: (v, w) => {
        const o = obj(v, w);
        return {
            user: requireString(o.user, `${w}.user`),
            seconds: num(o.seconds, `${w}.seconds`, { min: 1, def: 60 }),
            reason: o.reason ? String(o.reason) : ''
        };
    }
};

export const STEP_TYPES = Object.keys(STEP_PARSERS);

export function normalizeSteps(value, where) {
    return list(value, where).map((step, i) => {
        const w = `${where}[${i}]`;
        const entry = obj(step, w);
        const keys = Object.keys(entry);
        if (keys.length !== 1) {
            throw new ConfigError(`"${w}" muss genau eine Aktion enthalten (z.B. "- say: Hallo"), gefunden: ${keys.join(', ') || 'nichts'}.`);
        }
        const type = keys[0];
        const parser = STEP_PARSERS[type];
        if (!parser) throw new ConfigError(`"${w}": unbekannte Aktion "${type}". Erlaubt: ${STEP_TYPES.join(', ')}.`);
        return { type, ...parser(entry[type], `${w}.${type}`) };
    });
}

// ---------------------------------------------------------------------------
// Befehle

function normalizeBuiltins(raw) {
    const result = {};
    for (const [name, value] of Object.entries(obj(raw, 'builtins'))) {
        const where = `builtins.${name}`;
        if (value === false) {
            result[normalizeCommandName(name)] = { enabled: false };
            continue;
        }
        const o = obj(value, where);
        result[normalizeCommandName(name)] = {
            enabled: o.enabled !== false,
            permission: o.permission === undefined ? undefined : normalizePermission(o.permission, `${where}.permission`),
            aliases: o.aliases === undefined ? undefined : names(o.aliases, `${where}.aliases`),
            cooldown: num(o.cooldown, `${where}.cooldown`),
            userCooldown: num(o.userCooldown, `${where}.userCooldown`)
        };
    }
    return result;
}

function normalizeCommands(raw) {
    const commands = [];
    for (const [rawName, value] of Object.entries(obj(raw, 'commands'))) {
        const name = normalizeCommandName(rawName);
        const where = `commands.${rawName}`;
        const o = typeof value === 'string' ? { response: value } : obj(value, where);
        const responses = o.response === undefined ? [] : Array.isArray(o.response) ? o.response.map(String) : [String(o.response)];
        const actions = normalizeSteps(o.actions, `${where}.actions`);
        if (responses.length === 0 && actions.length === 0) {
            throw new ConfigError(`"${where}" braucht "response" oder "actions".`);
        }
        commands.push({
            name,
            aliases: names(o.aliases, `${where}.aliases`),
            responses,
            actions,
            permission: normalizePermission(o.permission, `${where}.permission`),
            cooldown: num(o.cooldown, `${where}.cooldown`, { def: 5 }),
            userCooldown: num(o.userCooldown, `${where}.userCooldown`, { def: 0 }),
            enabled: o.enabled !== false
        });
    }
    return commands;
}

function normalizeTimers(raw) {
    return list(raw, 'timers').map((t, i) => {
        const where = `timers[${i}]`;
        const o = obj(t, where);
        const messages = o.messages === undefined ? (o.message === undefined ? [] : [String(o.message)]) : list(o.messages, `${where}.messages`).map(String);
        const actions = normalizeSteps(o.actions, `${where}.actions`);
        if (messages.length === 0 && actions.length === 0) throw new ConfigError(`"${where}" braucht "messages" oder "actions".`);
        return {
            name: String(o.name ?? `timer${i + 1}`),
            interval: num(o.interval, `${where}.interval`, { min: 1, def: 15 }),
            minChatLines: num(o.minChatLines, `${where}.minChatLines`, { def: 5 }),
            onlyWhenLive: o.onlyWhenLive !== false,
            random: o.random === true,
            messages,
            actions,
            enabled: o.enabled !== false
        };
    });
}

// ---------------------------------------------------------------------------
// Moderation

function normalizeModeration(raw) {
    const o = obj(raw, 'moderation');
    // Ein Filter ist aktiv, sobald sein Abschnitt existiert (oder "true" ist) und nicht "enabled: false" hat.
    const section = (key) => {
        const v = o[key];
        if (v === undefined || v === null || v === false) return { on: false, cfg: {} };
        const cfg = v === true ? {} : obj(v, `moderation.${key}`);
        return { on: cfg.enabled !== false, cfg };
    };
    const { on: linksOn, cfg: links } = section('links');
    const { on: capsOn, cfg: caps } = section('caps');
    const { on: wordsOn, cfg: words } = section('bannedWords');
    const { on: lengthOn, cfg: length } = section('length');
    const { on: emotesOn, cfg: emotes } = section('emotes');
    const punishment = obj(o.punishment, 'moderation.punishment');

    const steps = list(punishment.steps ?? ['delete', 60, 600], 'moderation.punishment.steps').map((s, i) => {
        if (String(s).toLowerCase() === 'delete') return 'delete';
        return num(s, `moderation.punishment.steps[${i}]`, { min: 1 });
    });
    if (steps.length === 0) throw new ConfigError('"moderation.punishment.steps" darf nicht leer sein.');

    return {
        enabled: o.enabled === true,
        exempt: list(o.exempt ?? ['moderator', 'vip'], 'moderation.exempt').map((p, i) => normalizePermission(p, `moderation.exempt[${i}]`)),
        links: {
            enabled: linksOn,
            allowSubscribers: links.allowSubscribers === true,
            whitelist: list(links.whitelist, 'moderation.links.whitelist').map((d) =>
                String(d)
                    .toLowerCase()
                    .replace(/^www\./, '')
            ),
            permitSeconds: num(links.permitSeconds, 'moderation.links.permitSeconds', { min: 1, def: 60 })
        },
        caps: {
            enabled: capsOn,
            minLength: num(caps.minLength, 'moderation.caps.minLength', { def: 15 }),
            maxPercent: num(caps.maxPercent, 'moderation.caps.maxPercent', { def: 70 })
        },
        bannedWords: {
            enabled: wordsOn,
            words: list(words.words, 'moderation.bannedWords.words').map((w, i) => compileWord(w, `moderation.bannedWords.words[${i}]`)),
            timeout: num(words.timeout, 'moderation.bannedWords.timeout', { min: 1 })
        },
        length: {
            enabled: lengthOn,
            max: num(length.max, 'moderation.length.max', { min: 1, def: 400 })
        },
        emotes: {
            enabled: emotesOn,
            max: num(emotes.max, 'moderation.emotes.max', { min: 1, def: 15 })
        },
        punishment: {
            steps,
            resetAfter: num(punishment.resetAfter, 'moderation.punishment.resetAfter', { min: 1, def: 60 }),
            warn: punishment.warn !== false
        }
    };
}

function compileWord(word, where) {
    const s = String(word);
    const m = s.match(/^\/(.+)\/([a-z]*)$/);
    if (m) {
        try {
            return new RegExp(m[1], m[2].includes('i') ? m[2] : `${m[2]}i`);
        } catch (err) {
            throw new ConfigError(`"${where}": ungültiger regulärer Ausdruck: ${err.message}`);
        }
    }
    return s.toLowerCase();
}

// ---------------------------------------------------------------------------
// Events (Follows, Subs, Raids, Kanalpunkte …)

function normalizeEvent(value, where) {
    if (Array.isArray(value)) return { actions: normalizeSteps(value, where), minViewers: 0, minBits: 0, minGifts: 0 };
    const o = obj(value, where);
    return {
        actions: normalizeSteps(o.actions, `${where}.actions`),
        minViewers: num(o.minViewers, `${where}.minViewers`, { def: 0 }),
        minBits: num(o.minBits, `${where}.minBits`, { def: 0 }),
        minGifts: num(o.minGifts, `${where}.minGifts`, { def: 0 })
    };
}

function normalizeEvents(raw, warnings) {
    const o = obj(raw, 'events');
    const events = { redemptions: {} };
    for (const [key, value] of Object.entries(o)) {
        if (key === 'redemptions') continue;
        if (!EVENT_TYPES.includes(key)) {
            warnings.push(`events.${key} wird ignoriert (unbekanntes Event). Bekannt: ${EVENT_TYPES.join(', ')}, redemptions.`);
            continue;
        }
        if (value !== null && value !== undefined) events[key] = normalizeEvent(value, `events.${key}`);
    }
    for (const [title, value] of Object.entries(obj(o.redemptions, 'events.redemptions'))) {
        events.redemptions[title.toLowerCase()] = { title, ...normalizeEvent(value, `events.redemptions.${title}`) };
    }
    return events;
}
