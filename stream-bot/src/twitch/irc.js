// Twitch-Chat-Verbindung: lesen, schreiben, automatisch neu verbinden, Rate-Limits einhalten.

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { parseIrcLine, parseBadges, toChatMessage, toUserNotice } from './irc-parser.js';

const MAX_MESSAGE_LENGTH = 500;
const RATE_WINDOW_MS = 30_000;
const BACKOFF_SECONDS = [1, 2, 4, 8, 16, 30, 60];

/**
 * Events:
 *  - "message"    (ChatMessage)
 *  - "usernotice" (Sub, Resub, Raid, … siehe toUserNotice)
 *  - "joined"     ()
 *  - "disconnected" ()
 */
export class TwitchChat extends EventEmitter {
    /**
     * @param {object} opts
     * @param {string} opts.channel
     * @param {() => Promise<{login: string, token: string}>} opts.getCredentials
     * @param {() => Promise<void>} [opts.onAuthFailed] z.B. Token erneuern
     */
    constructor({ channel, getCredentials, onAuthFailed, url = 'wss://irc-ws.chat.twitch.tv:443', log }) {
        super();
        this.channel = channel.toLowerCase();
        this.getCredentials = getCredentials;
        this.onAuthFailed = onAuthFailed;
        this.url = url;
        this.log = log;
        this.ws = null;
        this.login = null;
        this.joined = false;
        this.isMod = false;
        this.stopped = true;
        this.attempt = 0;
        this.queue = [];
        this.sentAt = [];
        this.lastData = 0;
        this.timers = {};
    }

    start() {
        this.stopped = false;
        this.connect();
        this.timers.watchdog = setInterval(() => this.watchdog(), 60_000);
        this.timers.watchdog.unref?.();
    }

    stop() {
        this.stopped = true;
        for (const t of Object.values(this.timers)) {
            clearTimeout(t);
            clearInterval(t);
        }
        this.timers = {};
        this.ws?.terminate();
        this.ws = null;
        this.joined = false;
    }

    /** Nachricht in den Chat schicken (wird bei Bedarf gekürzt/aufgeteilt und gedrosselt). */
    say(text) {
        for (const part of splitMessage(sanitize(text))) {
            if (this.queue.length >= 50) this.queue.shift();
            this.queue.push(part);
        }
        this.flushQueue();
    }

    // --- Verbindung ----------------------------------------------------------

    async connect() {
        if (this.stopped) return;
        let creds;
        try {
            creds = await this.getCredentials();
        } catch (err) {
            this.log?.error(`Chat-Login nicht möglich: ${err.message}`);
            this.scheduleReconnect();
            return;
        }
        if (this.stopped) return;

        this.login = creds.login.toLowerCase();
        this.log?.info(`Verbinde mit Twitch-Chat als ${this.login} …`);
        const ws = new WebSocket(this.url);
        this.ws = ws;
        let registered = false;

        ws.on('open', () => {
            this.lastData = Date.now();
            ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            ws.send(`PASS oauth:${creds.token}`);
            ws.send(`NICK ${this.login}`);
        });
        ws.on('message', (data) => {
            this.lastData = Date.now();
            for (const line of data.toString().split('\r\n')) {
                if (!line) continue;
                const msg = parseIrcLine(line);
                if (msg.command === '001') registered = true;
                try {
                    this.handle(msg, ws);
                } catch (err) {
                    this.log?.error('Fehler beim Verarbeiten einer Chat-Nachricht:', err);
                }
            }
        });
        ws.on('error', (err) => this.log?.warn(`Chat-Verbindungsfehler: ${err.message}`));
        ws.on('close', () => {
            clearTimeout(this.timers.login);
            if (this.ws !== ws) return;
            this.ws = null;
            const wasJoined = this.joined;
            this.joined = false;
            if (wasJoined) {
                this.log?.warn('Chat-Verbindung getrennt.');
                this.emit('disconnected');
            }
            this.scheduleReconnect();
        });

        // Kommt nach 15 s kein Login zustande, neu versuchen
        this.timers.login = setTimeout(() => {
            if (!registered && this.ws === ws) {
                this.log?.warn('Chat-Login dauert zu lange, versuche es erneut.');
                ws.terminate();
            }
        }, 15_000);
    }

    scheduleReconnect() {
        if (this.stopped || this.timers.reconnect) return;
        const delay = BACKOFF_SECONDS[Math.min(this.attempt, BACKOFF_SECONDS.length - 1)];
        this.attempt++;
        this.log?.info(`Neuer Verbindungsversuch in ${delay} s.`);
        this.timers.reconnect = setTimeout(() => {
            delete this.timers.reconnect;
            this.connect();
        }, delay * 1000);
    }

    watchdog() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const idle = Date.now() - this.lastData;
        if (idle > 7 * 60_000) {
            this.log?.warn('Keine Daten vom Chat seit 7 Minuten – verbinde neu.');
            this.ws.terminate();
        } else if (idle > 4 * 60_000) {
            this.ws.send('PING :watchdog');
        }
    }

    // --- Eingehende Nachrichten ---------------------------------------------

    handle(msg, ws) {
        switch (msg.command) {
            case 'PING':
                ws.send(`PONG :${msg.params[0] ?? 'tmi.twitch.tv'}`);
                break;
            case '001':
                ws.send(`JOIN #${this.channel}`);
                break;
            case 'JOIN':
                if (msg.nick === this.login && msg.params[0] === `#${this.channel}`) {
                    this.joined = true;
                    this.attempt = 0;
                    this.log?.info(`Im Chat von #${this.channel} angemeldet.`);
                    this.emit('joined');
                    this.flushQueue();
                }
                break;
            case 'USERSTATE':
                if (msg.params[0] === `#${this.channel}`) {
                    const badges = parseBadges(msg.tags.badges);
                    this.isMod = msg.tags.mod === '1' || 'moderator' in badges || 'broadcaster' in badges;
                }
                break;
            case 'NOTICE':
                this.handleNotice(msg, ws);
                break;
            case 'RECONNECT':
                this.log?.info('Twitch bittet um Neuverbindung.');
                this.attempt = 0;
                ws.terminate();
                break;
            case 'PRIVMSG':
                this.emit('message', toChatMessage(msg));
                break;
            case 'USERNOTICE':
                this.emit('usernotice', toUserNotice(msg));
                break;
            default:
                break;
        }
    }

    handleNotice(msg, ws) {
        const text = msg.params[1] ?? '';
        if (/authentication failed|improperly formatted auth|invalid nick/i.test(text)) {
            this.log?.error(`Chat-Login fehlgeschlagen: ${text}`);
            Promise.resolve(this.onAuthFailed?.())
                .catch((err) => this.log?.error(`Token konnte nicht erneuert werden: ${err.message}`))
                .finally(() => ws.terminate());
            return;
        }
        const id = msg.tags['msg-id'];
        this.log?.warn(`Twitch-Hinweis${id ? ` (${id})` : ''}: ${text}`);
    }

    // --- Senden mit Rate-Limit ----------------------------------------------

    flushQueue() {
        if (this.timers.send || !this.joined) return;
        while (this.queue.length > 0) {
            const now = Date.now();
            this.sentAt = this.sentAt.filter((t) => now - t < RATE_WINDOW_MS);
            // Twitch: 20 Nachrichten / 30 s als normaler Nutzer, 100 als Mod – mit etwas Puffer
            const limit = this.isMod ? 90 : 18;
            const spacing = this.isMod ? 100 : 1100;
            const last = this.sentAt[this.sentAt.length - 1] ?? 0;
            let wait = Math.max(0, last + spacing - now);
            if (this.sentAt.length >= limit) wait = Math.max(wait, this.sentAt[0] + RATE_WINDOW_MS - now);
            if (wait > 0) {
                this.timers.send = setTimeout(() => {
                    delete this.timers.send;
                    this.flushQueue();
                }, wait);
                return;
            }
            const text = this.queue.shift();
            this.ws.send(`PRIVMSG #${this.channel} :${text}`);
            this.sentAt.push(now);
            this.log?.debug(`→ ${text}`);
        }
    }
}

/** Zeilenumbrüche entfernen und verhindern, dass Text als Chat-Befehl (/ban …) interpretiert wird. */
export function sanitize(text) {
    let clean = String(text ?? '')
        .replace(/[\r\n]+/g, ' ')
        .trim();
    if (/^[/.]/.test(clean) && !/^\/me /i.test(clean)) clean = `​${clean}`;
    return clean;
}

/** Teilt zu lange Nachrichten an Leerzeichen auf (Twitch erlaubt max. 500 Zeichen). */
export function splitMessage(text, max = MAX_MESSAGE_LENGTH) {
    const chars = Array.from(text);
    if (chars.length === 0) return [];
    const parts = [];
    let start = 0;
    while (start < chars.length) {
        let end = Math.min(start + max, chars.length);
        if (end < chars.length) {
            const space = chars.lastIndexOf(' ', end);
            if (space > start + max / 2) end = space;
        }
        const part = chars.slice(start, end).join('').trim();
        if (part) parts.push(part);
        start = end;
    }
    return parts;
}
