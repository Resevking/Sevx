// Verbindet alle Teile: Twitch-Chat, Twitch-API, EventSub, OBS, Befehle, Moderation, Timer und Events.

import path from 'node:path';
import { TokenManager } from './auth/tokens.js';
import { Helix } from './twitch/helix.js';
import { TwitchChannel } from './twitch/channel.js';
import { TwitchChat } from './twitch/irc.js';
import { EventSub } from './twitch/eventsub.js';
import { Obs } from './obs/obs.js';
import { Store } from './core/store.js';
import { Templates } from './core/template.js';
import { Messages } from './core/messages.js';
import { ActionRunner } from './core/actions.js';
import { CommandHandler } from './core/commands.js';
import { createBuiltins } from './core/builtins.js';
import { Moderator } from './core/moderation.js';
import { TimerManager } from './core/timers.js';
import { EventRouter } from './core/events.js';
import { formatDuration } from './core/format.js';

export class StreamBot {
    /**
     * @param {object} config Ergebnis von loadConfigFile()
     * @param {object} [opts]
     * @param {object} [opts.log]
     * @param {{irc?: string, helix?: string, id?: string, eventsub?: string}} [opts.urls] Nur für Tests
     */
    constructor(config, { log, urls = {} } = {}) {
        this.config = config;
        this.log = log;
        this.urls = urls;
    }

    async start() {
        const { config, log } = this;
        const twitch = config.twitch;

        this.tokens = new TokenManager({
            file: path.join(config.dataDir, 'tokens.json'),
            channel: twitch.channel,
            clientId: twitch.clientId,
            clientSecret: twitch.clientSecret,
            envTokens: { bot: twitch.botToken, broadcaster: twitch.broadcasterToken },
            idUrl: this.urls.id,
            log: log.child('Login')
        });
        await this.tokens.init();
        this.tokens.startHourlyValidation();

        this.helix = new Helix({ tokens: this.tokens, baseUrl: this.urls.helix, log: log.child('API') });
        this.channel = await new TwitchChannel({ helix: this.helix, tokens: this.tokens, channel: twitch.channel, log: log.child('Kanal') }).init();
        this.checkPermissions();

        this.store = new Store(path.join(config.dataDir, 'store.json'), { log }).load();
        this.templates = new Templates();
        this.templates.register('channel', () => this.channel.displayName);
        this.templates.register('counter', (name) => this.store.getCounter(String(name ?? '')));
        this.templates.register('uptime', () => (this.channel.isLive ? formatDuration(this.channel.uptimeMs()) : 'offline'));
        this.templates.register('game', async () => (await this.channel.getChannelInfo())?.game_name ?? '');
        this.templates.register('title', async () => (await this.channel.getChannelInfo())?.title ?? '');
        this.messages = new Messages({
            overrides: config.messages,
            templates: this.templates,
            prefix: config.bot.prefix,
            channelName: () => this.channel.displayName
        });

        this.chat = new TwitchChat({
            channel: twitch.channel,
            getCredentials: async () => ({ login: this.tokens.info('bot').login, token: await this.tokens.accessToken('bot') }),
            onAuthFailed: () => this.tokens.refresh('bot'),
            url: this.urls.irc,
            log: log.child('Chat')
        });
        this.obs = config.obs.enabled ? new Obs({ ...config.obs, log: log.child('OBS') }) : null;

        this.actions = new ActionRunner({
            chat: this.chat,
            obs: this.obs,
            channel: this.channel,
            store: this.store,
            templates: this.templates,
            shoutout: (login) => this.shoutout(login),
            log: log.child('Aktion')
        });
        this.moderator = new Moderator({
            config: config.moderation,
            channel: this.channel,
            chat: this.chat,
            messages: this.messages,
            log: log.child('Mod')
        });
        this.commands = new CommandHandler({
            config,
            store: this.store,
            templates: this.templates,
            actions: this.actions,
            chat: this.chat,
            builtins: createBuiltins(this),
            log: log.child('Befehl')
        });
        this.timers = new TimerManager({
            timers: config.timers,
            chat: this.chat,
            actions: this.actions,
            templates: this.templates,
            isLive: () => this.channel.isLive,
            log: log.child('Timer')
        });
        this.events = new EventRouter({ events: config.events, actions: this.actions, log: log.child('Event') });

        this.chat.on('message', (msg) => this.onMessage(msg).catch((err) => log.error('Fehler bei Chat-Nachricht:', err)));
        this.chat.on('usernotice', (n) => this.events.onUserNotice(n).catch((err) => log.error('Fehler bei Event:', err)));
        this.chat.once('joined', () => {
            if (config.bot.greetOnJoin) this.chat.say(config.bot.greetOnJoin);
        });

        this.eventsub = this.createEventSub();
        this.eventsub?.on('notification', (type, event) => this.events.onEventSub(type, event).catch((err) => log.error('Fehler bei EventSub-Event:', err)));

        this.channel.startLivePolling();
        this.chat.start();
        this.obs?.start();
        this.eventsub?.start();
        this.timers.start();
        return this;
    }

    async onMessage(msg) {
        if (msg.fromSharedChat) return;
        this.log.debug(`<${msg.displayName}> ${msg.text}`);
        this.timers.onChatMessage();
        if (await this.moderator.handle(msg)) return;
        await this.events.onChatMessage(msg);
        await this.commands.handle(msg);
    }

    /** Offizieller Shoutout + Chat-Nachricht (für !so und die Aktion "shoutout"). */
    async shoutout(login) {
        const info = await this.channel.shoutout(login);
        if (!info) {
            this.chat.say(await this.messages.format('userNotFound', { query: login }));
            return;
        }
        this.chat.say(
            await this.messages.format('shoutout', { name: info.displayName, target: info.login, game: info.game || 'unbekannt', title: info.title })
        );
    }

    /** Follows und Kanalpunkte brauchen EventSub – nur verbinden, wenn sie in der config.yml genutzt werden. */
    createEventSub() {
        const { events } = this.config;
        const hasRedemptions = Object.keys(events.redemptions).length > 0;
        if (!events.follow && !hasRedemptions) return null;

        const role = this.tokens.has('broadcaster') ? 'broadcaster' : 'bot';
        const userId = this.tokens.info(role).userId;
        const broadcasterId = this.channel.broadcasterId;
        const subscriptions = [];
        if (events.follow) {
            subscriptions.push({
                type: 'channel.follow',
                version: '2',
                condition: { broadcaster_user_id: broadcasterId, moderator_user_id: userId }
            });
        }
        if (hasRedemptions) {
            if (role === 'broadcaster') {
                subscriptions.push({
                    type: 'channel.channel_points_custom_reward_redemption.add',
                    version: '1',
                    condition: { broadcaster_user_id: broadcasterId }
                });
            } else {
                this.log.warn('Kanalpunkte-Events brauchen einen Streamer-Login: "npm run auth -- broadcaster".');
            }
        }
        if (subscriptions.length === 0) return null;
        return new EventSub({ helix: this.helix, role, subscriptions, url: this.urls.eventsub, log: this.log.child('EventSub') });
    }

    /** Weist früh darauf hin, wenn dem Login Berechtigungen fehlen. */
    checkPermissions() {
        const { config, tokens, log } = this;
        const bot = tokens.info('bot');
        log.info(`Bot-Account: ${bot.login} · Kanal: ${config.twitch.channel}${tokens.has('broadcaster') ? ' · Streamer-Login vorhanden' : ''}`);
        const need = [
            ['chat:read', 'Chat lesen'],
            ['chat:edit', 'Chat schreiben']
        ];
        if (config.moderation.enabled) {
            need.push(['moderator:manage:chat_messages', 'Nachrichten löschen'], ['moderator:manage:banned_users', 'Timeouts']);
        }
        for (const [scope, what] of need) {
            if (!bot.scopes.includes(scope)) log.warn(`Dem Bot-Login fehlt die Berechtigung "${scope}" (${what}). Bitte "npm run auth" erneut ausführen.`);
        }
        if (!tokens.has('broadcaster')) {
            log.info('Kein Streamer-Login: !titel/!spiel ändern und Kanalpunkte sind deaktiviert ("npm run auth -- broadcaster").');
        }
    }

    async stop() {
        this.timers?.stop();
        this.chat?.stop();
        this.eventsub?.stop();
        this.channel?.stop();
        this.tokens?.stop();
        await this.obs?.stop();
        this.store?.flush();
    }
}
