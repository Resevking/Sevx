// Führt Aktionslisten aus (Chat-Nachricht, Szene wechseln, Quelle einblenden, …).

import { cleanLogin } from './format.js';

const sleep = (seconds) => new Promise((r) => setTimeout(r, seconds * 1000));

export class ActionRunner {
    /**
     * @param {object} deps
     * @param {{say(text: string): void}} deps.chat
     * @param {import('../obs/obs.js').Obs|null} deps.obs
     * @param {import('../twitch/channel.js').TwitchChannel} deps.channel
     * @param {import('./store.js').Store} deps.store
     * @param {import('./template.js').Templates} deps.templates
     * @param {(login: string) => Promise<void>} deps.shoutout
     */
    constructor({ chat, obs, channel, store, templates, shoutout, log }) {
        this.chat = chat;
        this.obs = obs;
        this.channel = channel;
        this.store = store;
        this.templates = templates;
        this.shoutout = shoutout;
        this.log = log;
        this.queues = new Map();
    }

    /**
     * @param {object[]} steps
     * @param {object} vars Platzhalter-Werte
     * @param {{queue?: string}} [opts] Mit "queue" laufen Aktionen nacheinander (z.B. Alerts nicht überlappend).
     */
    run(steps, vars = {}, { queue } = {}) {
        if (!steps?.length) return Promise.resolve();
        if (!queue) return this.execute(steps, vars);
        const previous = this.queues.get(queue) ?? Promise.resolve();
        const next = previous.then(() => this.execute(steps, vars));
        this.queues.set(queue, next);
        return next;
    }

    async execute(steps, vars) {
        for (const step of steps) {
            try {
                await this.step(step, vars);
            } catch (err) {
                this.log?.warn(`Aktion "${step.type}" fehlgeschlagen: ${err.message}`);
            }
        }
    }

    requireObs() {
        if (!this.obs) throw new Error('OBS ist in der config.yml deaktiviert.');
        return this.obs;
    }

    async step(step, vars) {
        const r = (text) => this.templates.render(text, vars);
        switch (step.type) {
            case 'say':
                this.chat.say(await r(step.text));
                return;
            case 'scene': {
                const name = await r(step.scene);
                if (!(await this.requireObs().setScene(name))) throw new Error(`Szene "${name}" nicht gefunden.`);
                return;
            }
            case 'source': {
                const obs = this.requireObs();
                const name = await r(step.source);
                const scene = step.scene ? await r(step.scene) : undefined;
                const result = await obs.setSourceVisible(name, step.visible, scene);
                if (!result) throw new Error(`Quelle "${name}" nicht gefunden.`);
                if (step.duration > 0) {
                    await sleep(step.duration);
                    await obs.setSourceVisible(result.sourceName, !result.visible, result.sceneName);
                }
                return;
            }
            case 'mute':
            case 'unmute':
            case 'toggleMute':
                await this.requireObs().setMute(await r(step.input), step.mute);
                return;
            case 'text':
                await this.requireObs().setText(await r(step.source), await r(step.text));
                return;
            case 'media':
                await this.requireObs().mediaAction(await r(step.source), step.action);
                return;
            case 'filter':
                await this.requireObs().setFilter(await r(step.source), await r(step.filter), step.enabled);
                return;
            case 'replay':
                await this.requireObs().saveReplay();
                return;
            case 'wait':
                await sleep(step.seconds);
                return;
            case 'counter':
                if (step.set !== undefined) this.store.setCounter(step.name, step.set);
                else this.store.addCounter(step.name, step.add);
                return;
            case 'shoutout':
                await this.shoutout(cleanLogin(await r(step.user)));
                return;
            case 'timeout': {
                const login = cleanLogin(await r(step.user));
                const user = await this.channel.getUser(login);
                if (!user) throw new Error(`Nutzer "${login}" nicht gefunden.`);
                await this.channel.timeout(user.id, step.seconds, await r(step.reason));
                return;
            }
            default:
                throw new Error(`Unbekannte Aktion "${step.type}".`);
        }
    }
}
