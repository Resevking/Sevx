// Alles, was der Bot über die Twitch-API mit "deinem" Kanal macht.

import { HelixError } from './helix.js';

export class TwitchChannel {
    constructor({ helix, tokens, channel, log }) {
        this.helix = helix;
        this.tokens = tokens;
        this.login = channel;
        this.log = log;
        this.broadcasterId = null;
        this.botId = null;
        this.stream = null;
        this.userCache = new Map();
        this.pollTimer = null;
    }

    async init() {
        const user = await this.getUser(this.login);
        if (!user) throw new Error(`Twitch-Kanal "${this.login}" nicht gefunden.`);
        this.broadcasterId = user.id;
        this.displayName = user.display_name;
        this.botId = this.tokens.info('bot').userId;
        return this;
    }

    // --- Live-Status -------------------------------------------------------

    startLivePolling(intervalMs = 60_000) {
        const poll = () => this.refreshLive().catch((err) => this.log?.warn(`Live-Status: ${err.message}`));
        poll();
        this.pollTimer = setInterval(poll, intervalMs);
        this.pollTimer.unref?.();
    }

    stop() {
        clearInterval(this.pollTimer);
    }

    async refreshLive() {
        const res = await this.helix.get('/streams', { query: { user_id: this.broadcasterId } });
        const stream = res?.data?.[0] ?? null;
        const wasLive = Boolean(this.stream);
        this.stream = stream ? { startedAt: new Date(stream.started_at), title: stream.title, game: stream.game_name, viewers: stream.viewer_count } : null;
        if (wasLive !== Boolean(this.stream)) this.log?.info(this.stream ? 'Stream ist live.' : 'Stream ist offline.');
        return this.stream;
    }

    get isLive() {
        return Boolean(this.stream);
    }

    uptimeMs() {
        return this.stream ? Date.now() - this.stream.startedAt.getTime() : null;
    }

    // --- Nutzer & Kanal ------------------------------------------------------

    async getUser(login) {
        const key = String(login).toLowerCase();
        if (this.userCache.has(key)) return this.userCache.get(key);
        const res = await this.helix.get('/users', { query: { login: key } });
        const user = res?.data?.[0] ?? null;
        if (user) this.userCache.set(key, user);
        return user;
    }

    async getChannelInfo(broadcasterId = this.broadcasterId) {
        const res = await this.helix.get('/channels', { query: { broadcaster_id: broadcasterId } });
        return res?.data?.[0] ?? null;
    }

    requireBroadcaster(action) {
        if (!this.tokens.has('broadcaster')) {
            throw new Error(`Für "${action}" wird ein Streamer-Login benötigt ("npm run auth -- broadcaster").`);
        }
    }

    async setTitle(title) {
        this.requireBroadcaster('Titel ändern');
        await this.helix.request('PATCH', '/channels', {
            role: 'broadcaster',
            query: { broadcaster_id: this.broadcasterId },
            body: { title }
        });
    }

    async findGame(name) {
        const exact = await this.helix.get('/games', { query: { name } });
        if (exact?.data?.[0]) return exact.data[0];
        const search = await this.helix.get('/search/categories', { query: { query: name, first: 1 } });
        return search?.data?.[0] ?? null;
    }

    async setGame(name) {
        this.requireBroadcaster('Kategorie ändern');
        const game = await this.findGame(name);
        if (!game) return null;
        await this.helix.request('PATCH', '/channels', {
            role: 'broadcaster',
            query: { broadcaster_id: this.broadcasterId },
            body: { game_id: game.id }
        });
        return game;
    }

    /** Seit wann folgt userId dem Kanal? (null = folgt nicht) */
    async followedAt(userId) {
        const res = await this.helix.get('/channels/followers', {
            query: { broadcaster_id: this.broadcasterId, user_id: userId }
        });
        const follow = res?.data?.[0];
        return follow ? new Date(follow.followed_at) : null;
    }

    // --- Moderation ----------------------------------------------------------

    async deleteMessage(messageId) {
        await this.helix.request('DELETE', '/moderation/chat', {
            query: { broadcaster_id: this.broadcasterId, moderator_id: this.botId, message_id: messageId }
        });
    }

    async timeout(userId, seconds, reason = '') {
        await this.helix.post('/moderation/bans', {
            query: { broadcaster_id: this.broadcasterId, moderator_id: this.botId },
            body: { data: { user_id: userId, duration: Math.min(Math.max(1, Math.round(seconds)), 1_209_600), reason } }
        });
    }

    /** Offizieller Twitch-Shoutout + Infos für die Chat-Nachricht. */
    async shoutout(login) {
        const user = await this.getUser(login);
        if (!user) return null;
        const info = await this.getChannelInfo(user.id);
        let official = false;
        if (user.id !== this.broadcasterId) {
            try {
                await this.helix.post('/chat/shoutouts', {
                    query: { from_broadcaster_id: this.broadcasterId, to_broadcaster_id: user.id, moderator_id: this.botId }
                });
                official = true;
            } catch (err) {
                // Twitch erlaubt nur einen Shoutout alle 2 Minuten (und nur, wenn live) – Chat-Nachricht kommt trotzdem
                this.log?.debug(`Offizieller Shoutout nicht möglich: ${err.message}`);
            }
        }
        return { login: user.login, displayName: user.display_name, game: info?.game_name || '', title: info?.title || '', official };
    }

    async createClip() {
        const role = this.tokens.hasScope('broadcaster', 'clips:edit') ? 'broadcaster' : 'bot';
        try {
            const res = await this.helix.post('/clips', { role, query: { broadcaster_id: this.broadcasterId } });
            const id = res?.data?.[0]?.id;
            return id ? `https://clips.twitch.tv/${id}` : null;
        } catch (err) {
            if (err instanceof HelixError && err.status === 404) return null; // offline
            throw err;
        }
    }
}
