// Startpunkt:  npm start   (nur Konfiguration prüfen: npm run check)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, loadConfigFile, ConfigError } from './config.js';
import { createLogger } from './logger.js';
import { StreamBot } from './bot.js';
import { startConsole } from './console.js';
import { TokenError } from './auth/tokens.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
    loadEnvFile(path.join(ROOT, '.env'));
    const log = createLogger();
    const config = loadConfigFile(path.resolve(ROOT, process.env.CONFIG_FILE || 'config.yml'));
    for (const warning of config.warnings) log.warn(warning);

    if (process.argv.includes('--check')) {
        printSummary(config, log);
        return;
    }

    const bot = new StreamBot(config, {
        log,
        urls: {
            irc: process.env.TWITCH_IRC_URL,
            helix: process.env.TWITCH_HELIX_URL,
            id: process.env.TWITCH_ID_URL,
            eventsub: process.env.TWITCH_EVENTSUB_URL
        }
    });

    let stopping = false;
    const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        log.info('Bot wird beendet …');
        await bot.stop().catch((err) => log.error(err));
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await bot.start();
    startConsole(bot, { onQuit: shutdown });
}

function printSummary(config, log) {
    const events = Object.keys(config.events).filter((k) => k !== 'redemptions');
    const rewards = Object.values(config.events.redemptions).map((r) => r.title);
    const mod = config.moderation;
    const filters = ['links', 'caps', 'bannedWords', 'length', 'emotes'].filter((k) => mod[k].enabled);
    log.info(`Konfiguration ist gültig ✔`);
    log.info(`Kanal: ${config.twitch.channel} · Präfix: ${config.bot.prefix} · OBS: ${config.obs.enabled ? config.obs.url : 'aus'}`);
    log.info(`Eigene Befehle: ${config.commands.map((c) => config.bot.prefix + c.name).join(', ') || '–'}`);
    log.info(`Timer: ${config.timers.map((t) => `${t.name} (${t.interval} min)`).join(', ') || '–'}`);
    log.info(`Events: ${events.join(', ') || '–'}${rewards.length ? ` · Kanalpunkte: ${rewards.join(', ')}` : ''}`);
    log.info(`Moderation: ${mod.enabled ? `an (${filters.join(', ') || 'keine Filter'})` : 'aus'}`);
}

main().catch((err) => {
    if (err instanceof ConfigError || err instanceof TokenError) {
        console.error(`\n✖ ${err.message}\n`);
    } else {
        console.error(err);
    }
    process.exit(1);
});
