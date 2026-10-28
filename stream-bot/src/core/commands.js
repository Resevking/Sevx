// Erkennt Befehle im Chat (!discord, !szene …), prüft Rechte und Cooldowns und führt sie aus.

export const LEVELS = { everyone: 0, subscriber: 1, vip: 2, moderator: 3, broadcaster: 4 };

export function userLevel(msg) {
    if (msg.isBroadcaster) return LEVELS.broadcaster;
    if (msg.isMod) return LEVELS.moderator;
    if (msg.isVip) return LEVELS.vip;
    if (msg.isSubscriber) return LEVELS.subscriber;
    return LEVELS.everyone;
}

/** Platzhalter, die bei jeder Chat-Nachricht zur Verfügung stehen. */
export function messageVars(msg, argv = []) {
    return {
        user: msg.displayName,
        login: msg.login,
        touser: argv[0] ? argv[0].replace(/^@/, '') : msg.displayName,
        args: argv.join(' '),
        argv,
        message: msg.text
    };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class CommandHandler {
    /**
     * @param {object} deps
     * @param {object[]} deps.builtins Eingebaute Befehle (siehe builtins.js)
     */
    constructor({ config, store, templates, actions, chat, builtins, log, now = Date.now }) {
        this.config = config;
        this.prefix = config.bot.prefix;
        this.store = store;
        this.templates = templates;
        this.actions = actions;
        this.chat = chat;
        this.log = log;
        this.now = now;
        this.lastUsed = new Map();
        this.index = new Map();

        // Eingebaute Befehle mit den Anpassungen aus config.yml → builtins
        this.builtins = builtins.map((b) => ({ ...b, ...stripUndefined(config.builtins[b.name] ?? {}), kind: 'builtin' })).filter((b) => b.enabled !== false);
        for (const b of this.builtins) this.register(b);
        // Befehle aus der config.yml haben Vorrang vor eingebauten
        for (const c of config.commands.filter((c) => c.enabled)) this.register({ ...c, kind: 'config' }, true);
    }

    register(cmd, override = false) {
        for (const name of [cmd.name, ...(cmd.aliases ?? [])]) {
            if (!override && this.index.has(name)) continue;
            this.index.set(name, cmd);
        }
    }

    /** Ist der Name von einem eingebauten oder config-Befehl belegt? */
    isReserved(name) {
        return this.index.has(name);
    }

    find(name) {
        const cmd = this.index.get(name);
        if (cmd) return cmd;
        const custom = this.store.getCustomCommand(name);
        if (custom) return { name, kind: 'custom', responses: [custom.response], permission: 'everyone', cooldown: 5, userCooldown: 0 };
        return null;
    }

    /** Alle Befehle, die ein Nutzer mit dieser Stufe benutzen darf. */
    available(level) {
        const names = new Set();
        for (const cmd of this.index.values()) {
            if (LEVELS[cmd.permission ?? 'everyone'] <= level) names.add(cmd.name);
        }
        for (const name of this.store.listCustomCommands()) names.add(name);
        return [...names].sort();
    }

    parse(text) {
        if (!text.startsWith(this.prefix)) return null;
        const argv = text.slice(this.prefix.length).trim().split(/\s+/).filter(Boolean);
        const name = argv.shift()?.toLowerCase();
        return name ? { name, argv } : null;
    }

    /** @returns {Promise<boolean>} true, wenn die Nachricht ein Befehl war */
    async handle(msg) {
        const parsed = this.parse(msg.text);
        if (!parsed) return false;
        const cmd = this.find(parsed.name);
        if (!cmd) return false;

        const level = userLevel(msg);
        if (level < LEVELS[cmd.permission ?? 'everyone']) {
            if (this.config.bot.noPermissionMessage) {
                this.chat.say(await this.templates.render(this.config.bot.noPermissionMessage, messageVars(msg, parsed.argv)));
            }
            return true;
        }
        if (!this.checkCooldown(cmd, msg, level)) return true;

        const vars = messageVars(msg, parsed.argv);
        try {
            if (cmd.kind === 'builtin') {
                await cmd.run({ msg, argv: parsed.argv, args: vars.args, level, vars, invokedAs: parsed.name });
                return true;
            }
            vars.count = this.store.incrementUses(cmd.name);
            if (cmd.responses?.length) this.chat.say(await this.templates.render(pick(cmd.responses), vars));
            if (cmd.actions?.length) await this.actions.run(cmd.actions, vars);
        } catch (err) {
            this.log?.error(`Befehl ${this.prefix}${cmd.name} fehlgeschlagen:`, err.message);
            if (level >= LEVELS.moderator) this.chat.say(`Das hat leider nicht geklappt: ${err.message}`);
        }
        return true;
    }

    checkCooldown(cmd, msg, level) {
        if (level >= LEVELS.moderator && this.config.bot.modsIgnoreCooldown) return true;
        const now = this.now();
        const globalKey = cmd.name;
        const userKey = `${cmd.name}:${msg.userId ?? msg.login}`;
        if (cmd.cooldown && now - (this.lastUsed.get(globalKey) ?? -Infinity) < cmd.cooldown * 1000) return false;
        if (cmd.userCooldown && now - (this.lastUsed.get(userKey) ?? -Infinity) < cmd.userCooldown * 1000) return false;
        this.lastUsed.set(globalKey, now);
        this.lastUsed.set(userKey, now);
        return true;
    }
}

function stripUndefined(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
