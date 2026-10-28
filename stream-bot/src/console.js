// Eingabe im Terminal: Text wird in den Chat geschickt, "!befehl" läuft mit Streamer-Rechten.

import readline from 'node:readline';

export function startConsole(bot, { onQuit }) {
    if (!process.stdin.isTTY) return null;
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    bot.log.info('Terminal bereit: Text → Chat, "!befehl" → als Streamer ausführen, "/quit" → beenden.');

    rl.on('line', async (line) => {
        const text = line.trim();
        if (!text) return;
        if (text === '/quit' || text === '/exit') {
            onQuit();
            return;
        }
        if (text.startsWith(bot.config.bot.prefix)) {
            const msg = {
                id: null,
                text,
                login: bot.channel.login,
                displayName: bot.channel.displayName,
                userId: bot.channel.broadcasterId,
                isBroadcaster: true,
                isMod: true,
                isVip: false,
                isSubscriber: true,
                emotes: [],
                bits: 0
            };
            try {
                if (!(await bot.commands.handle(msg))) bot.log.warn(`Unbekannter Befehl: ${text}`);
            } catch (err) {
                bot.log.error(err);
            }
            return;
        }
        bot.chat.say(text);
    });
    return rl;
}
