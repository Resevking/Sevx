import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { EventSub } from '../src/twitch/eventsub.js';

const welcome = (id) =>
    JSON.stringify({ metadata: { message_id: `w-${id}`, message_type: 'session_welcome' }, payload: { session: { id, keepalive_timeout_seconds: 30 } } });
const notification = (msgId, login) =>
    JSON.stringify({
        metadata: { message_id: msgId, message_type: 'notification' },
        payload: { subscription: { type: 'channel.follow' }, event: { user_login: login } }
    });

async function waitFor(fn, what) {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > 3000) throw new Error(`Timeout: ${what}`);
        await new Promise((r) => setTimeout(r, 10));
    }
}

test('EventSub: Abos nach Welcome, Serverumzug ohne neue Abos, doppelte Nachrichten ignoriert', async () => {
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => wss.on('listening', r));
    const base = `ws://127.0.0.1:${wss.address().port}`;
    const sockets = {};
    wss.on('connection', (ws, req) => {
        const name = req.url.includes('neu') ? 'neu' : 'alt';
        sockets[name] = ws;
        ws.send(welcome(`session-${name}`));
    });

    const posted = [];
    const helix = { post: async (path, opts) => posted.push(opts.body.transport.session_id) };
    const es = new EventSub({ helix, role: 'bot', subscriptions: [{ type: 'channel.follow', version: '2', condition: {} }], url: `${base}/ws` });
    const received = [];
    es.on('notification', (type, event) => received.push(event.user_login));
    es.start();

    await waitFor(() => posted.length === 1, 'erstes Abo');
    assert.deepEqual(posted, ['session-alt']);

    sockets.alt.send(notification('n1', 'anna'));
    sockets.alt.send(notification('n1', 'anna')); // Twitch kann Nachrichten doppelt schicken
    await waitFor(() => received.length === 1, 'Follow');

    let oldClosed = false;
    sockets.alt.on('close', () => (oldClosed = true));
    sockets.alt.send(
        JSON.stringify({ metadata: { message_id: 'r', message_type: 'session_reconnect' }, payload: { session: { reconnect_url: `${base}/neu` } } })
    );
    await waitFor(() => oldClosed, 'alte Verbindung geschlossen');
    sockets.neu.send(notification('n2', 'ben'));
    await waitFor(() => received.length === 2, 'Follow über neue Verbindung');

    assert.deepEqual(received, ['anna', 'ben']);
    assert.equal(posted.length, 1, 'beim Umzug dürfen keine neuen Abos angelegt werden');
    es.stop();
    await new Promise((r) => wss.close(r));
});
