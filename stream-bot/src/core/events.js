// Leitet Twitch-Ereignisse (Follow, Sub, Raid, Bits, Kanalpunkte …) an die konfigurierten Aktionen weiter.

import { subTierName } from './format.js';

const GIFT_BOMB_WINDOW_MS = 60_000;

export class EventRouter {
    constructor({ events, actions, log, now = Date.now }) {
        this.events = events;
        this.actions = actions;
        this.log = log;
        this.now = now;
        this.pendingGifts = new Map();
        this.followed = new Set();
    }

    fire(name, vars, config = this.events[name]) {
        if (!config) return Promise.resolve();
        this.log?.info(`Event: ${name} von ${vars.user}`);
        // Alerts laufen nacheinander, damit sich Einblendungen nicht überlappen
        return this.actions.run(config.actions, vars, { queue: 'alerts' });
    }

    /** Subs, Resubs, Geschenk-Subs und Raids kommen über den Chat (USERNOTICE). */
    onUserNotice(n) {
        if (n.fromSharedChat) return Promise.resolve();
        const base = { user: n.displayName, login: n.login, message: n.message, tier: subTierName(n.plan) };
        switch (n.type) {
            case 'sub':
                return this.fire('sub', { ...base, months: n.months || 1 });
            case 'resub':
                return this.fire('resub', { ...base, months: n.months, streak: n.streak });
            case 'subgift':
            case 'anonsubgift': {
                // Gehört das Geschenk zu einer Geschenk-Bombe? Dann nicht einzeln melden.
                const pending = this.pendingGifts.get(n.login);
                if (pending && pending.remaining > 0 && pending.until > this.now()) {
                    pending.remaining--;
                    return Promise.resolve();
                }
                return this.fire('subgift', { ...base, recipient: n.recipient, months: n.months });
            }
            case 'submysterygift':
            case 'anonsubmysterygift': {
                this.pendingGifts.set(n.login, { remaining: n.giftCount, until: this.now() + GIFT_BOMB_WINDOW_MS });
                const config = this.events.giftbomb;
                if (config && n.giftCount < config.minGifts) return Promise.resolve();
                return this.fire('giftbomb', { ...base, amount: n.giftCount });
            }
            case 'raid': {
                const config = this.events.raid;
                if (config && n.viewers < config.minViewers) return Promise.resolve();
                return this.fire('raid', { ...base, viewers: n.viewers });
            }
            default:
                return Promise.resolve();
        }
    }

    /** Bits und "erste Nachricht im Kanal" stecken in normalen Chat-Nachrichten. */
    onChatMessage(msg) {
        const vars = { user: msg.displayName, login: msg.login, message: msg.text };
        const jobs = [];
        if (msg.bits > 0) {
            const config = this.events.cheer;
            if (config && msg.bits >= config.minBits) jobs.push(this.fire('cheer', { ...vars, bits: msg.bits, amount: msg.bits }));
        }
        if (msg.isFirstMessage) jobs.push(this.fire('firstMessage', vars));
        return Promise.all(jobs);
    }

    /** Follows und Kanalpunkte kommen über EventSub. */
    onEventSub(type, event) {
        const vars = { user: event.user_name, login: event.user_login };
        if (type === 'channel.follow') {
            // Follow-Spam (folgen/entfolgen) nur einmal pro Sitzung melden
            if (this.followed.has(event.user_id)) return Promise.resolve();
            this.followed.add(event.user_id);
            return this.fire('follow', vars);
        }
        if (type === 'channel.channel_points_custom_reward_redemption.add') {
            const config = this.events.redemptions[String(event.reward?.title ?? '').toLowerCase()];
            if (!config) return Promise.resolve();
            return this.fire(
                `Kanalpunkte "${config.title}"`,
                {
                    ...vars,
                    reward: event.reward.title,
                    cost: event.reward.cost,
                    input: event.user_input ?? '',
                    message: event.user_input ?? ''
                },
                config
            );
        }
        return Promise.resolve();
    }
}
