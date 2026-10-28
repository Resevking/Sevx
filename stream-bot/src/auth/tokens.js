// Verwaltet die Twitch-Zugangstokens: laden, prüfen, automatisch erneuern, speichern.

import fs from 'node:fs';
import path from 'node:path';

/** Alle Berechtigungen, die der Bot nutzen kann. Wird bei "npm run auth" angefragt. */
export const SCOPES = [
    'chat:read',
    'chat:edit',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
    'moderator:manage:shoutouts',
    'moderator:read:followers',
    'clips:edit',
    'channel:manage:broadcast',
    'channel:read:redemptions'
];

export const DEFAULT_ID_URL = 'https://id.twitch.tv';

export class TokenError extends Error {}

export function readTokenFile(file) {
    if (!fs.existsSync(file)) return {};
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return {};
    }
}

export function writeTokenFile(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
}

/** Prüft ein Token bei Twitch. Gibt null zurück, wenn es ungültig ist. */
export async function validateToken(accessToken, idUrl = DEFAULT_ID_URL) {
    const res = await fetch(`${idUrl}/oauth2/validate`, { headers: { Authorization: `OAuth ${accessToken}` } });
    if (res.status === 401) return null;
    if (!res.ok) throw new TokenError(`Token-Prüfung fehlgeschlagen (HTTP ${res.status})`);
    const data = await res.json();
    return {
        login: data.login,
        userId: data.user_id,
        clientId: data.client_id,
        scopes: data.scopes ?? [],
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null
    };
}

export class TokenManager {
    constructor({ file, channel, clientId, clientSecret, envTokens = {}, idUrl = DEFAULT_ID_URL, log }) {
        this.file = file;
        this.channel = channel;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.envTokens = envTokens;
        this.idUrl = idUrl;
        this.log = log;
        this.tokens = {};
        this.refreshing = {};
        this.validationTimer = null;
    }

    async init() {
        const stored = readTokenFile(this.file);
        for (const role of ['bot', 'broadcaster']) {
            let entry = stored[role];
            if (!entry && this.envTokens[role]) {
                entry = { accessToken: this.envTokens[role].replace(/^oauth:/, ''), static: true };
            }
            if (!entry?.accessToken) continue;
            try {
                this.tokens[role] = await this.check(role, entry);
            } catch (err) {
                if (role === 'bot') throw err;
                this.log?.warn(`Broadcaster-Token wird ignoriert: ${err.message}`);
            }
        }

        if (!this.tokens.bot) {
            throw new TokenError('Kein Twitch-Login gefunden. Führe "npm run auth" aus (oder setze TWITCH_BOT_TOKEN in der .env).');
        }
        const broadcaster = this.tokens.broadcaster;
        if (broadcaster && broadcaster.login !== this.channel) {
            this.log?.warn(`Broadcaster-Token gehört zu "${broadcaster.login}", nicht zu "${this.channel}" – wird ignoriert.`);
            delete this.tokens.broadcaster;
        }
        this.save();
        return this;
    }

    /** Token prüfen und bei Bedarf erneuern. */
    async check(role, entry) {
        let info = await validateToken(entry.accessToken, this.idUrl);
        if (!info && entry.refreshToken) {
            this.log?.info(`Token für ${role} ist abgelaufen – erneuere …`);
            entry = { ...entry, ...(await this.requestRefresh(entry)) };
            info = await validateToken(entry.accessToken, this.idUrl);
        }
        if (!info) {
            throw new TokenError(`Das Token für "${role}" ist ungültig. Bitte "npm run auth${role === 'bot' ? '' : ' -- broadcaster'}" ausführen.`);
        }
        return { ...entry, ...info };
    }

    /** Bei nur einem Account (Bot = Streamer) übernimmt das Bot-Token auch die Broadcaster-Rolle. */
    resolve(role) {
        if (this.tokens[role]) return role;
        if (role === 'broadcaster' && this.tokens.bot?.login === this.channel) return 'bot';
        return null;
    }

    has(role) {
        return this.resolve(role) !== null;
    }

    info(role) {
        const r = this.resolve(role);
        if (!r) return null;
        const { login, userId, clientId, scopes } = this.tokens[r];
        return { login, userId, clientId, scopes };
    }

    hasScope(role, scope) {
        return this.info(role)?.scopes.includes(scope) ?? false;
    }

    async accessToken(role) {
        const r = this.resolve(role);
        if (!r) throw new TokenError(`Kein Token für die Rolle "${role}" vorhanden.`);
        const entry = this.tokens[r];
        if (entry.refreshToken && entry.expiresAt && Date.now() > entry.expiresAt - 5 * 60_000) {
            await this.refresh(r);
        }
        return this.tokens[r].accessToken;
    }

    /** Token erneuern (gleichzeitige Aufrufe werden zusammengefasst). */
    async refresh(role) {
        const r = this.resolve(role);
        if (!r) throw new TokenError(`Kein Token für die Rolle "${role}" vorhanden.`);
        if (!this.refreshing[r]) {
            this.refreshing[r] = (async () => {
                const entry = this.tokens[r];
                if (!entry.refreshToken) {
                    throw new TokenError(`Token für "${r}" ist abgelaufen und kann nicht automatisch erneuert werden. Bitte "npm run auth" ausführen.`);
                }
                const fresh = await this.requestRefresh(entry);
                const info = await validateToken(fresh.accessToken, this.idUrl);
                if (!info) throw new TokenError('Erneuertes Token ist ungültig.');
                this.tokens[r] = { ...entry, ...fresh, ...info };
                this.save();
                this.log?.info(`Token für ${r} erneuert.`);
            })().finally(() => {
                delete this.refreshing[r];
            });
        }
        return this.refreshing[r];
    }

    async requestRefresh(entry) {
        const clientId = entry.clientId || this.clientId;
        if (!clientId) throw new TokenError('TWITCH_CLIENT_ID fehlt in der .env.');
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: entry.refreshToken, client_id: clientId });
        if (this.clientSecret) body.set('client_secret', this.clientSecret);
        const res = await fetch(`${this.idUrl}/oauth2/token`, { method: 'POST', body });
        if (!res.ok) {
            throw new TokenError(`Token-Erneuerung fehlgeschlagen (HTTP ${res.status}). Bitte "npm run auth" erneut ausführen.`);
        }
        const data = await res.json();
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? entry.refreshToken,
            expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null
        };
    }

    /** Twitch verlangt, dass Tokens regelmäßig (stündlich) geprüft werden. */
    startHourlyValidation() {
        this.validationTimer = setInterval(async () => {
            for (const role of Object.keys(this.tokens)) {
                try {
                    const info = await validateToken(this.tokens[role].accessToken, this.idUrl);
                    if (!info) await this.refresh(role);
                } catch (err) {
                    this.log?.error(`Token-Prüfung (${role}): ${err.message}`);
                }
            }
        }, 60 * 60_000);
        this.validationTimer.unref?.();
    }

    stop() {
        clearInterval(this.validationTimer);
    }

    save() {
        const data = readTokenFile(this.file);
        for (const [role, entry] of Object.entries(this.tokens)) {
            if (entry.static) continue; // Tokens aus der .env nicht in die Datei kopieren
            const { accessToken, refreshToken, expiresAt, login, userId, clientId, scopes } = entry;
            data[role] = { accessToken, refreshToken, expiresAt, login, userId, clientId, scopes };
        }
        if (Object.keys(data).length > 0) writeTokenFile(this.file, data);
    }
}
