// Automatische Chat-Moderation: Links, Großschreibung, verbotene Wörter, Länge, Emote-Spam.

import { stripEmotes } from '../twitch/irc-parser.js';

const TLDS =
    'com|net|org|de|at|ch|tv|gg|io|ly|me|co|uk|ru|info|xyz|be|eu|fr|it|nl|es|pl|app|dev|link|live|shop|site|online|store|to|cc|us|ca|biz|club|top|fun|pro|art|stream|social|gl|gd|sh|ws|tk|ml|ga|cf|cn|jp|kr|br|in|au|se|no|dk|fi|cz|sk|hu|ro|tr|pt|gr|ua|li|lu|im|ai|so|vip|win|bet|games|chat|click|cam|money|plus|space|website|tech|news|one|world|zone|email|page|bio';
const DOMAIN_RE = new RegExp(`(?:^|[^\\p{L}\\p{N}@.-])(?:www\\.)?((?:[\\p{L}\\p{N}-]+\\.)+(?:${TLDS}))(?![\\p{L}\\p{N}-])`, 'giu');
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/([^\s/?#:]+)/giu;

/** Findet alle Domains in einem Text ("schau auf www.Example.com/abc" → ["example.com"]). */
export function findLinks(text) {
    const hosts = new Set();
    for (const m of text.matchAll(URL_RE)) hosts.add(m[1].toLowerCase().replace(/^www\./, ''));
    for (const m of text.matchAll(DOMAIN_RE)) hosts.add(m[1].toLowerCase());
    return [...hosts];
}

export function isWhitelisted(host, whitelist) {
    return whitelist.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function capsPercent(text) {
    const letters = text.match(/\p{L}/gu) ?? [];
    const cased = letters.filter((c) => c.toLowerCase() !== c.toUpperCase());
    if (cased.length === 0) return { letters: 0, percent: 0 };
    const upper = cased.filter((c) => c === c.toUpperCase()).length;
    return { letters: cased.length, percent: (upper / cased.length) * 100 };
}

export class Moderator {
    constructor({ config, channel, chat, messages, log, now = Date.now }) {
        this.config = config;
        this.channel = channel;
        this.chat = chat;
        this.messages = messages;
        this.log = log;
        this.now = now;
        this.permits = new Map();
        this.strikes = new Map();
        this.warnedNoMod = false;
    }

    /** Erlaubt einem Nutzer für kurze Zeit Links. Gibt die Sekunden zurück. */
    permit(login) {
        const seconds = this.config.links.permitSeconds;
        this.permits.set(login, this.now() + seconds * 1000);
        return seconds;
    }

    isExempt(msg) {
        if (msg.isBroadcaster) return true;
        const exempt = this.config.exempt;
        return (
            (exempt.includes('moderator') && msg.isMod) ||
            (exempt.includes('vip') && msg.isVip) ||
            (exempt.includes('subscriber') && msg.isSubscriber) ||
            exempt.includes('everyone')
        );
    }

    /** Prüft eine Nachricht. @returns {{rule: string, detail: string, timeout?: number}|null} */
    check(msg) {
        const c = this.config;
        if (!c.enabled || this.isExempt(msg)) return null;
        const text = msg.text;
        const lower = text.toLowerCase();

        if (c.bannedWords.enabled) {
            const hit = c.bannedWords.words.find((w) => (typeof w === 'string' ? lower.includes(w) : w.test(text)));
            if (hit) return { rule: 'words', detail: String(hit), timeout: c.bannedWords.timeout };
        }

        if (c.links.enabled && !(c.links.allowSubscribers && msg.isSubscriber)) {
            const bad = findLinks(text).filter((host) => !isWhitelisted(host, c.links.whitelist));
            if (bad.length > 0) {
                const permitUntil = this.permits.get(msg.login);
                if (permitUntil && permitUntil > this.now()) {
                    this.permits.delete(msg.login); // Erlaubnis gilt für einen Link
                } else {
                    return { rule: 'links', detail: bad.join(', ') };
                }
            }
        }

        if (c.length.enabled && Array.from(text).length > c.length.max) {
            return { rule: 'length', detail: `${Array.from(text).length} Zeichen` };
        }

        if (c.caps.enabled) {
            const { letters, percent } = capsPercent(stripEmotes(text, msg.emotes));
            if (letters >= c.caps.minLength && percent > c.caps.maxPercent) {
                return { rule: 'caps', detail: `${Math.round(percent)} % Großbuchstaben` };
            }
        }

        if (c.emotes.enabled && (msg.emotes?.length ?? 0) > c.emotes.max) {
            return { rule: 'emotes', detail: `${msg.emotes.length} Emotes` };
        }
        return null;
    }

    /** Nächste Strafe: Verstöße innerhalb von "resetAfter" Minuten zählen zusammen. */
    nextPunishment(msg, violation) {
        if (violation.timeout) return violation.timeout;
        const now = this.now();
        const windowMs = this.config.punishment.resetAfter * 60_000;
        const key = msg.userId ?? msg.login;
        const strikes = (this.strikes.get(key) ?? []).filter((t) => now - t < windowMs);
        strikes.push(now);
        this.strikes.set(key, strikes);
        const steps = this.config.punishment.steps;
        return steps[Math.min(strikes.length - 1, steps.length - 1)];
    }

    /** @returns {Promise<boolean>} true, wenn die Nachricht bestraft wurde */
    async handle(msg) {
        const violation = this.check(msg);
        if (!violation) return false;
        const punishment = this.nextPunishment(msg, violation);
        const action = punishment === 'delete' ? 'Nachricht gelöscht' : `Timeout ${punishment} s`;
        this.log?.info(`Moderation: ${msg.displayName} → ${violation.rule} (${violation.detail}) → ${action}`);
        try {
            if (punishment === 'delete') await this.channel.deleteMessage(msg.id);
            else await this.channel.timeout(msg.userId, punishment, `Automoderation: ${violation.rule}`);
        } catch (err) {
            if (!this.warnedNoMod) {
                this.log?.warn(`Moderation nicht möglich (${err.message}). Ist der Bot Moderator? Im Chat: /mod <botname>`);
                this.warnedNoMod = true;
            }
            return true;
        }
        if (this.config.punishment.warn) {
            const key = { links: 'modLinks', caps: 'modCaps', words: 'modWords', length: 'modLength', emotes: 'modEmotes' }[violation.rule];
            this.chat.say(await this.messages.format(key, { user: msg.displayName, action }));
        }
        return true;
    }
}
