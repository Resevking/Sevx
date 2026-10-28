// Eingebaute Befehle. Namen, Aliase, Rechte und Cooldowns lassen sich in config.yml → builtins anpassen.

import { LEVELS } from './commands.js';
import { cleanLogin, formatDate, formatDuration } from './format.js';
import { normalizeCommandName } from '../config.js';

const ON_WORDS = ['an', 'ein', 'on', 'show', 'zeigen'];
const OFF_WORDS = ['aus', 'off', 'hide', 'verstecken'];

/**
 * @param {object} bot Die laufende Bot-Instanz (siehe bot.js): chat, channel, obs, store, messages,
 *                     moderator, commands, config, shoutout()
 */
export function createBuiltins(bot) {
    const prefix = bot.config.bot.prefix;
    const say = async (key, vars) => bot.chat.say(await bot.messages.format(key, vars));
    const usage = (text) => say('usage', { usage: `${prefix}${text}` });
    const obsReady = async () => {
        if (bot.obs?.connected) return true;
        await say('obsOffline');
        return false;
    };

    const mute =
        (muted) =>
        async ({ args, invokedAs }) => {
            const query = args || bot.config.obs.defaultMic;
            if (!query) return usage(`${invokedAs} <Audioquelle>  (oder obs.defaultMic in config.yml setzen)`);
            if (!(await obsReady())) return;
            const { inputName } = await bot.obs.setMute(query, muted);
            return say(muted ? 'muted' : 'unmuted', { input: inputName });
        };

    const saveCommand =
        (mode) =>
        async ({ argv, msg, invokedAs }) => {
            const name = normalizeCommandName(argv[0] ?? '');
            const response = argv.slice(1).join(' ');
            if (!name || !response) return usage(`${invokedAs} ${prefix}name Antworttext`);
            if (!/^[\p{L}\p{N}_-]{1,30}$/u.test(name)) return usage(`${invokedAs} ${prefix}name Antworttext  (Name: nur Buchstaben, Zahlen, - und _)`);
            if (bot.commands.isReserved(name)) return say('commandProtected', { command: name });
            const exists = Boolean(bot.store.getCustomCommand(name));
            if (mode === 'add' && exists) return say('commandExists', { command: name });
            if (mode === 'edit' && !exists) return say('commandMissing', { command: name });
            bot.store.setCustomCommand(name, response, msg.login);
            return say(mode === 'add' ? 'commandAdded' : 'commandEdited', { command: name });
        };

    return [
        {
            name: 'commands',
            aliases: ['befehle', 'cmds'],
            permission: 'everyone',
            cooldown: 15,
            run: ({ level }) =>
                say('commandList', {
                    list: bot.commands
                        .available(level)
                        .map((n) => prefix + n)
                        .join(', ')
                })
        },
        {
            name: 'uptime',
            aliases: ['laufzeit'],
            permission: 'everyone',
            cooldown: 10,
            run: async () => {
                await bot.channel.refreshLive().catch(() => {});
                if (!bot.channel.isLive) return say('offline');
                return say('uptime', { uptime: formatDuration(bot.channel.uptimeMs()) });
            }
        },
        {
            name: 'followage',
            aliases: ['folgezeit'],
            permission: 'everyone',
            cooldown: 5,
            run: async ({ msg, argv }) => {
                let target = { id: msg.userId, name: msg.displayName };
                if (argv[0]) {
                    const user = await bot.channel.getUser(cleanLogin(argv[0]));
                    if (!user) return say('userNotFound', { query: argv[0] });
                    target = { id: user.id, name: user.display_name };
                }
                const since = await bot.channel.followedAt(target.id);
                if (!since) return say('notFollowing', { target: target.name });
                return say('followage', { target: target.name, duration: formatDuration(Date.now() - since.getTime()), date: formatDate(since) });
            }
        },
        {
            name: 'title',
            aliases: ['titel'],
            permission: 'everyone',
            cooldown: 5,
            run: async ({ args, level }) => {
                if (args && level >= LEVELS.moderator) {
                    await bot.channel.setTitle(args);
                    return say('titleChanged', { title: args });
                }
                const info = await bot.channel.getChannelInfo();
                return say('title', { title: info?.title ?? '' });
            }
        },
        {
            name: 'game',
            aliases: ['spiel', 'kategorie'],
            permission: 'everyone',
            cooldown: 5,
            run: async ({ args, level }) => {
                if (args && level >= LEVELS.moderator) {
                    const game = await bot.channel.setGame(args);
                    if (!game) return say('gameNotFound', { query: args });
                    return say('gameChanged', { game: game.name });
                }
                const info = await bot.channel.getChannelInfo();
                return say('game', { game: info?.game_name || '–' });
            }
        },
        {
            name: 'so',
            aliases: ['shoutout'],
            permission: 'moderator',
            run: ({ argv, invokedAs }) => (argv[0] ? bot.shoutout(cleanLogin(argv[0])) : usage(`${invokedAs} @name`))
        },
        {
            name: 'clip',
            permission: 'everyone',
            cooldown: 30,
            run: async () => {
                const url = await bot.channel.createClip();
                return url ? say('clip', { url }) : say('clipFailed');
            }
        },
        {
            name: 'scene',
            aliases: ['szene'],
            permission: 'moderator',
            run: async ({ args, invokedAs }) => {
                if (!args) return usage(`${invokedAs} <Name>`);
                if (!(await obsReady())) return;
                const scene = await bot.obs.setScene(args);
                if (scene) return say('sceneChanged', { scene });
                const { scenes } = await bot.obs.getScenes();
                return say('sceneNotFound', { query: args, scenes: scenes.join(', ') });
            }
        },
        {
            name: 'scenes',
            aliases: ['szenen'],
            permission: 'moderator',
            run: async () => {
                if (!(await obsReady())) return;
                const { scenes, current } = await bot.obs.getScenes();
                return say('sceneList', { scenes: scenes.join(', '), current });
            }
        },
        {
            name: 'source',
            aliases: ['quelle'],
            permission: 'moderator',
            run: async ({ argv, invokedAs }) => {
                // !quelle Kamera an | !quelle Kamera aus | !quelle Kamera (umschalten)
                const last = (argv[argv.length - 1] ?? '').toLowerCase();
                let visible = 'toggle';
                let nameParts = argv;
                if (ON_WORDS.includes(last)) visible = true;
                else if (OFF_WORDS.includes(last)) visible = false;
                if (visible !== 'toggle') nameParts = argv.slice(0, -1);
                const query = nameParts.join(' ');
                if (!query) return usage(`${invokedAs} <Quelle> [an|aus]`);
                if (!(await obsReady())) return;
                const result = await bot.obs.setSourceVisible(query, visible);
                if (!result) return say('sourceNotFound', { query });
                return say('sourceChanged', { source: result.sourceName, state: result.visible ? 'sichtbar' : 'ausgeblendet' });
            }
        },
        { name: 'mute', aliases: ['stumm'], permission: 'moderator', run: mute(true) },
        { name: 'unmute', aliases: ['laut'], permission: 'moderator', run: mute(false) },
        {
            name: 'replay',
            permission: 'moderator',
            cooldown: 10,
            run: async () => {
                if (!(await obsReady())) return;
                await bot.obs.saveReplay();
                return say('replaySaved');
            }
        },
        {
            name: 'permit',
            aliases: ['erlauben'],
            permission: 'moderator',
            run: ({ argv, invokedAs }) => {
                if (!argv[0]) return usage(`${invokedAs} @name`);
                const seconds = bot.moderator.permit(cleanLogin(argv[0]));
                return say('permit', { target: argv[0].replace(/^@/, ''), seconds });
            }
        },
        { name: 'addcmd', aliases: ['cmdadd'], permission: 'moderator', run: saveCommand('add') },
        { name: 'editcmd', aliases: ['cmdedit'], permission: 'moderator', run: saveCommand('edit') },
        {
            name: 'delcmd',
            aliases: ['cmddel'],
            permission: 'moderator',
            run: ({ argv, invokedAs }) => {
                const name = normalizeCommandName(argv[0] ?? '');
                if (!name) return usage(`${invokedAs} ${prefix}name`);
                if (bot.commands.isReserved(name)) return say('commandProtected', { command: name });
                return say(bot.store.deleteCustomCommand(name) ? 'commandDeleted' : 'commandMissing', { command: name });
            }
        },
        {
            name: 'counter',
            aliases: ['zähler', 'zaehler'],
            permission: 'everyone',
            cooldown: 3,
            run: ({ argv, level, invokedAs }) => {
                // !zähler tode | !zähler tode +1 | !zähler tode -1 | !zähler tode =5 | !zähler tode reset
                const name = (argv[0] ?? '').toLowerCase();
                if (!name) return usage(`${invokedAs} <Name> [+1|-1|=5|reset]`);
                const op = argv[1];
                if (op && level >= LEVELS.moderator) {
                    const m = op.match(/^([+\-=])?(\d+)$/);
                    if (op.toLowerCase() === 'reset') bot.store.setCounter(name, 0);
                    else if (m && m[1] === '=') bot.store.setCounter(name, Number(m[2]));
                    else if (m) bot.store.addCounter(name, (m[1] === '-' ? -1 : 1) * Number(m[2]));
                    else return usage(`${invokedAs} <Name> [+1|-1|=5|reset]`);
                }
                return say('counter', { name: argv[0], value: bot.store.getCounter(name) });
            }
        }
    ];
}
