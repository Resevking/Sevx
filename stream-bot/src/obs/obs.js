// OBS-Steuerung über obs-websocket (in OBS 28+ eingebaut: Werkzeuge → WebSocket-Server-Einstellungen).

import { EventEmitter } from 'node:events';
import { OBSWebSocket } from 'obs-websocket-js/json';

const BACKOFF_SECONDS = [2, 5, 10, 20, 30];
const REQUEST_TIMEOUT_MS = 10_000;

export class ObsNotConnectedError extends Error {
    constructor() {
        super('OBS ist nicht verbunden.');
    }
}

/** Events: "connected", "disconnected" */
export class Obs extends EventEmitter {
    constructor({ url, password, log }) {
        super();
        this.url = url;
        this.password = password;
        this.log = log;
        this.client = new OBSWebSocket();
        this.connected = false;
        this.stopped = true;
        this.attempt = 0;
        this.reconnectTimer = null;
        this.warnedOffline = false;

        this.client.on('ConnectionClosed', () => {
            if (!this.connected) return;
            this.connected = false;
            this.log?.warn('Verbindung zu OBS getrennt.');
            this.emit('disconnected');
            this.scheduleReconnect();
        });
    }

    start() {
        this.stopped = false;
        this.connect();
    }

    async stop() {
        this.stopped = true;
        clearTimeout(this.reconnectTimer);
        this.connected = false;
        await this.client.disconnect().catch(() => {});
    }

    async connect() {
        if (this.stopped) return;
        try {
            await this.client.connect(this.url, this.password, { rpcVersion: 1 });
            this.connected = true;
            this.attempt = 0;
            this.warnedOffline = false;
            const { obsVersion, obsWebSocketVersion } = await this.call('GetVersion');
            this.log?.info(`Mit OBS ${obsVersion} verbunden (obs-websocket ${obsWebSocketVersion}).`);
            this.emit('connected');
        } catch (err) {
            this.connected = false;
            if (/authentication/i.test(err.message) || err.code === 4009) {
                this.log?.error('OBS-Passwort falsch – bitte OBS_PASSWORD in der .env prüfen.');
            } else if (!this.warnedOffline) {
                this.log?.warn(`OBS nicht erreichbar (${this.url}). Läuft OBS und ist der WebSocket-Server aktiviert? Ich versuche es weiter …`);
                this.warnedOffline = true;
            }
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) return;
        const delay = BACKOFF_SECONDS[Math.min(this.attempt++, BACKOFF_SECONDS.length - 1)];
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay * 1000);
    }

    /** Rohe obs-websocket-Anfrage mit Timeout. */
    async call(requestType, requestData) {
        if (!this.connected) throw new ObsNotConnectedError();
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`OBS antwortet nicht (${requestType}).`)), REQUEST_TIMEOUT_MS);
        });
        try {
            return await Promise.race([this.client.call(requestType, requestData), timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    // --- Szenen --------------------------------------------------------------

    async getScenes() {
        const { scenes, currentProgramSceneName } = await this.call('GetSceneList');
        // OBS liefert die Liste von unten nach oben
        return { scenes: scenes.map((s) => s.sceneName).reverse(), current: currentProgramSceneName };
    }

    async getCurrentScene() {
        const { currentProgramSceneName } = await this.call('GetCurrentProgramScene');
        return currentProgramSceneName;
    }

    /** Findet eine Szene auch bei abweichender Groß-/Kleinschreibung oder nur dem Anfang des Namens. */
    async findScene(query) {
        const { scenes } = await this.getScenes();
        return matchName(scenes, query);
    }

    async setScene(name) {
        const scene = await this.findScene(name);
        if (!scene) return null;
        await this.call('SetCurrentProgramScene', { sceneName: scene });
        return scene;
    }

    // --- Quellen -------------------------------------------------------------

    /** Sucht eine Quelle in der Szene (und in Gruppen der Szene). */
    async findSceneItem(sourceName, sceneName) {
        const scene = sceneName ?? (await this.getCurrentScene());
        const { sceneItems } = await this.call('GetSceneItemList', { sceneName: scene });
        const names = sceneItems.map((i) => i.sourceName);
        const match = matchName(names, sourceName);
        if (match) {
            const item = sceneItems.find((i) => i.sourceName === match);
            return { sceneName: scene, sceneItemId: item.sceneItemId, sourceName: match };
        }
        for (const group of sceneItems.filter((i) => i.isGroup)) {
            const { sceneItems: inner } = await this.call('GetGroupSceneItemList', { sceneName: group.sourceName });
            const innerMatch = matchName(
                inner.map((i) => i.sourceName),
                sourceName
            );
            if (innerMatch) {
                const item = inner.find((i) => i.sourceName === innerMatch);
                return { sceneName: group.sourceName, sceneItemId: item.sceneItemId, sourceName: innerMatch };
            }
        }
        return null;
    }

    /**
     * Quelle ein-/ausblenden.
     * @param {boolean|'toggle'} visible
     * @returns {Promise<{sourceName: string, visible: boolean, previous: boolean}|null>}
     */
    async setSourceVisible(sourceName, visible, sceneName) {
        const item = await this.findSceneItem(sourceName, sceneName);
        if (!item) return null;
        const { sceneItemEnabled: previous } = await this.call('GetSceneItemEnabled', {
            sceneName: item.sceneName,
            sceneItemId: item.sceneItemId
        });
        const next = visible === 'toggle' ? !previous : Boolean(visible);
        await this.call('SetSceneItemEnabled', { sceneName: item.sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: next });
        return { ...item, visible: next, previous };
    }

    async findInput(query) {
        const { inputs } = await this.call('GetInputList');
        return matchName(
            inputs.map((i) => i.inputName),
            query
        );
    }

    /**
     * @param {boolean|'toggle'} mute
     * @returns {Promise<{inputName: string, muted: boolean}>}
     */
    async setMute(query, mute) {
        const inputName = (await this.findInput(query)) ?? query;
        if (mute === 'toggle') {
            const { inputMuted } = await this.call('ToggleInputMute', { inputName });
            return { inputName, muted: inputMuted };
        }
        await this.call('SetInputMute', { inputName, inputMuted: Boolean(mute) });
        return { inputName, muted: Boolean(mute) };
    }

    /** Text einer Textquelle (GDI+/FreeType) setzen, z.B. "Letzter Follower". */
    async setText(inputName, text) {
        await this.call('SetInputSettings', { inputName, inputSettings: { text }, overlay: true });
    }

    async mediaAction(inputName, action) {
        const map = {
            restart: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
            play: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY',
            pause: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
            stop: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP'
        };
        await this.call('TriggerMediaInputAction', { inputName, mediaAction: map[action] });
    }

    /** @param {boolean|'toggle'} enabled */
    async setFilter(sourceName, filterName, enabled) {
        let next = enabled;
        if (enabled === 'toggle') {
            const { filterEnabled } = await this.call('GetSourceFilter', { sourceName, filterName });
            next = !filterEnabled;
        }
        await this.call('SetSourceFilterEnabled', { sourceName, filterName, filterEnabled: Boolean(next) });
        return Boolean(next);
    }

    async saveReplay() {
        await this.call('SaveReplayBuffer');
    }
}

/** Exakter Treffer, sonst ohne Groß-/Kleinschreibung, sonst eindeutiger Anfang/Teilstring. */
export function matchName(names, query) {
    const q = String(query ?? '').trim();
    if (!q) return null;
    if (names.includes(q)) return q;
    const lower = q.toLowerCase();
    const ci = names.find((n) => n.toLowerCase() === lower);
    if (ci) return ci;
    const starts = names.filter((n) => n.toLowerCase().startsWith(lower));
    if (starts.length === 1) return starts[0];
    const contains = names.filter((n) => n.toLowerCase().includes(lower));
    if (contains.length === 1) return contains[0];
    return null;
}
