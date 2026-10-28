// Wiederkehrende Nachrichten (z.B. alle 15 Minuten Hinweis auf Discord), nur wenn im Chat etwas los ist.

export class TimerManager {
    constructor({ timers, chat, actions, templates, isLive, log, tickMs = 30_000, now = Date.now }) {
        this.chat = chat;
        this.actions = actions;
        this.templates = templates;
        this.isLive = isLive;
        this.log = log;
        this.tickMs = tickMs;
        this.now = now;
        this.state = timers.filter((t) => t.enabled).map((t) => ({ timer: t, lastRun: now(), lines: 0, index: 0 }));
        this.interval = null;
    }

    start() {
        if (this.state.length === 0) return;
        this.interval = setInterval(() => this.tick(), this.tickMs);
        this.interval.unref?.();
    }

    stop() {
        clearInterval(this.interval);
    }

    onChatMessage() {
        for (const s of this.state) s.lines++;
    }

    async tick() {
        const now = this.now();
        for (const s of this.state) {
            const { timer } = s;
            if (now - s.lastRun < timer.interval * 60_000) continue;
            if (s.lines < timer.minChatLines) continue;
            if (timer.onlyWhenLive && !this.isLive()) continue;
            s.lastRun = now;
            s.lines = 0;
            await this.fire(s).catch((err) => this.log?.warn(`Timer "${timer.name}": ${err.message}`));
        }
    }

    async fire(s) {
        const { timer } = s;
        if (timer.messages.length > 0) {
            const index = timer.random ? Math.floor(Math.random() * timer.messages.length) : s.index++ % timer.messages.length;
            this.chat.say(await this.templates.render(timer.messages[index], {}));
        }
        if (timer.actions.length > 0) await this.actions.run(timer.actions, {});
    }
}
