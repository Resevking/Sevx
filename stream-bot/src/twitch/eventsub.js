// EventSub über WebSocket: Follows und Kanalpunkte-Einlösungen (gibt es nicht über den IRC-Chat).

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

const BACKOFF_SECONDS = [1, 2, 5, 10, 30, 60];

/** Events: "notification" (type, event) */
export class EventSub extends EventEmitter {
    /**
     * @param {object} opts
     * @param {import('./helix.js').Helix} opts.helix
     * @param {'bot'|'broadcaster'} opts.role Token, mit dem die Abos angelegt werden
     * @param {{type: string, version: string, condition: object}[]} opts.subscriptions
     */
    constructor({ helix, role, subscriptions, url = 'wss://eventsub.wss.twitch.tv/ws', log }) {
        super();
        this.helix = helix;
        this.role = role;
        this.subscriptions = subscriptions;
        this.url = url;
        this.log = log;
        this.ws = null;
        this.pending = null;
        this.stopped = true;
        this.attempt = 0;
        this.seen = [];
        this.keepaliveTimer = null;
        this.reconnectTimer = null;
    }

    start() {
        this.stopped = false;
        this.connect(this.url);
    }

    stop() {
        this.stopped = true;
        clearTimeout(this.keepaliveTimer);
        clearTimeout(this.reconnectTimer);
        this.ws?.terminate();
        this.pending?.terminate();
        this.ws = this.pending = null;
    }

    connect(url, { migrate = false } = {}) {
        const ws = new WebSocket(url);
        if (migrate) this.pending = ws;
        else this.ws = ws;

        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                return;
            }
            this.onMessage(ws, msg).catch((err) => this.log?.error('EventSub:', err));
        });
        ws.on('error', (err) => this.log?.warn(`EventSub-Verbindungsfehler: ${err.message}`));
        ws.on('close', (code) => {
            if (ws === this.pending) this.pending = null;
            if (ws !== this.ws) return;
            this.ws = null;
            clearTimeout(this.keepaliveTimer);
            if (this.stopped) return;
            this.log?.warn(`EventSub-Verbindung getrennt (Code ${code}).`);
            this.scheduleReconnect();
        });
    }

    scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) return;
        const delay = BACKOFF_SECONDS[Math.min(this.attempt++, BACKOFF_SECONDS.length - 1)];
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(this.url);
        }, delay * 1000);
    }

    armKeepalive(seconds) {
        clearTimeout(this.keepaliveTimer);
        this.keepaliveTimer = setTimeout(
            () => {
                this.log?.warn('EventSub antwortet nicht mehr – verbinde neu.');
                this.ws?.terminate();
            },
            (seconds + 10) * 1000
        );
    }

    async onMessage(ws, msg) {
        const type = msg.metadata?.message_type;
        if (ws === this.ws && this.keepaliveSeconds) this.armKeepalive(this.keepaliveSeconds);

        switch (type) {
            case 'session_welcome': {
                const session = msg.payload.session;
                this.keepaliveSeconds = session.keepalive_timeout_seconds || 10;
                if (ws === this.pending) {
                    // Umzug auf neuen Server: Abos bleiben bestehen, alte Verbindung schließen
                    const old = this.ws;
                    this.ws = ws;
                    this.pending = null;
                    old?.close();
                    this.armKeepalive(this.keepaliveSeconds);
                    return;
                }
                this.attempt = 0;
                this.armKeepalive(this.keepaliveSeconds);
                await this.subscribeAll(session.id);
                return;
            }
            case 'session_reconnect':
                this.log?.info('EventSub zieht auf einen anderen Server um …');
                this.connect(msg.payload.session.reconnect_url, { migrate: true });
                return;
            case 'notification': {
                const id = msg.metadata.message_id;
                if (this.seen.includes(id)) return;
                this.seen.push(id);
                if (this.seen.length > 200) this.seen.shift();
                this.emit('notification', msg.payload.subscription.type, msg.payload.event);
                return;
            }
            case 'revocation':
                this.log?.warn(`EventSub-Abo "${msg.payload.subscription.type}" wurde von Twitch beendet (${msg.payload.subscription.status}).`);
                return;
            default:
                return;
        }
    }

    async subscribeAll(sessionId) {
        for (const sub of this.subscriptions) {
            try {
                await this.helix.post('/eventsub/subscriptions', {
                    role: this.role,
                    body: { ...sub, transport: { method: 'websocket', session_id: sessionId } }
                });
                this.log?.info(`EventSub: "${sub.type}" aktiv.`);
            } catch (err) {
                this.log?.error(`EventSub: "${sub.type}" konnte nicht abonniert werden: ${err.message}`);
            }
        }
    }
}
