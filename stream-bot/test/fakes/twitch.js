// Nachgebauter Twitch-Server für Tests: IRC-Chat, Helix-API, OAuth und EventSub auf einem Port.

import http from 'node:http';
import { WebSocketServer } from 'ws';

export async function startFakeTwitch({ channel = 'sevx', users = {}, tokens = {} } = {}) {
    const state = {
        said: [], // Nachrichten, die der Bot in den Chat geschrieben hat
        helixCalls: [],
        ircClients: new Set(),
        eventsubClients: new Set(),
        joined: false,
        tokens: { ...tokens }, // accessToken → { login, userId, scopes }
        refreshTokens: {}, // refreshToken → login
        stream: null,
        channelInfo: { title: 'Alter Titel', game_name: 'Just Chatting' },
        follows: {}, // userId → ISO-Datum
        failNextHelixWith401: false
    };
    const userList = { [channel]: { id: '100', login: channel, display_name: 'SevX' }, ...users };

    const json = (res, status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(body === undefined ? '' : JSON.stringify(body));
    };

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const auth = req.headers.authorization ?? '';
        const token = auth.replace(/^(OAuth|Bearer) /, '');

        // --- OAuth ---
        if (url.pathname === '/oauth2/validate') {
            const t = state.tokens[token];
            if (!t) return json(res, 401, { status: 401, message: 'invalid access token' });
            return json(res, 200, { client_id: 'fakeclient', login: t.login, user_id: t.userId, scopes: t.scopes, expires_in: 3600 });
        }
        if (url.pathname === '/oauth2/token') {
            const body = new URLSearchParams(raw);
            const login = state.refreshTokens[body.get('refresh_token')];
            if (!login) return json(res, 400, { status: 400, message: 'Invalid refresh token' });
            const old = Object.entries(state.tokens).find(([, t]) => t.login === login);
            const fresh = `${login}-token-${Date.now()}`;
            state.tokens[fresh] = old[1];
            delete state.tokens[old[0]];
            return json(res, 200, { access_token: fresh, refresh_token: body.get('refresh_token'), expires_in: 14000, scope: old[1].scopes });
        }

        // --- Helix ---
        if (!url.pathname.startsWith('/helix/')) return json(res, 404, { message: 'not found' });
        const path = url.pathname.slice('/helix'.length);
        const call = { method: req.method, path, query: Object.fromEntries(url.searchParams), body: raw ? JSON.parse(raw) : null, token };
        state.helixCalls.push(call);
        if (state.failNextHelixWith401 || !state.tokens[token]) {
            state.failNextHelixWith401 = false;
            return json(res, 401, { message: 'Invalid OAuth token' });
        }
        const q = call.query;
        switch (`${req.method} ${path}`) {
            case 'GET /users': {
                const user = userList[q.login];
                return json(res, 200, { data: user ? [user] : [] });
            }
            case 'GET /streams':
                return json(res, 200, { data: state.stream ? [state.stream] : [] });
            case 'GET /channels':
                return json(res, 200, { data: [{ broadcaster_id: q.broadcaster_id, ...state.channelInfo }] });
            case 'PATCH /channels':
                if (state.tokens[token].login !== channel) return json(res, 401, { message: 'token must be broadcaster' });
                Object.assign(
                    state.channelInfo,
                    call.body.title ? { title: call.body.title } : {},
                    call.body.game_id ? { game_name: `Spiel ${call.body.game_id}` } : {}
                );
                return json(res, 204);
            case 'GET /games':
                return json(res, 200, { data: q.name === 'Minecraft' ? [{ id: '27471', name: 'Minecraft' }] : [] });
            case 'GET /search/categories':
                return json(res, 200, { data: q.query === 'mine' ? [{ id: '27471', name: 'Minecraft' }] : [] });
            case 'GET /channels/followers': {
                const at = state.follows[q.user_id];
                return json(res, 200, { data: at ? [{ user_id: q.user_id, followed_at: at }] : [], total: 0 });
            }
            case 'DELETE /moderation/chat':
            case 'POST /chat/shoutouts':
                return json(res, 204);
            case 'POST /moderation/bans':
                return json(res, 200, { data: [{ user_id: call.body.data.user_id }] });
            case 'POST /clips':
                return state.stream ? json(res, 202, { data: [{ id: 'TollerClip', edit_url: 'x' }] }) : json(res, 404, { message: 'offline' });
            case 'POST /eventsub/subscriptions':
                return json(res, 202, { data: [{ id: 'sub1', status: 'enabled', type: call.body.type }] });
            default:
                return json(res, 404, { message: `unbekannt: ${req.method} ${path}` });
        }
    });

    const ircWss = new WebSocketServer({ noServer: true });
    const eventsubWss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        const target = req.url.startsWith('/irc') ? ircWss : req.url.startsWith('/eventsub') ? eventsubWss : null;
        if (!target) return socket.destroy();
        target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
    });

    ircWss.on('connection', (ws) => {
        state.ircClients.add(ws);
        let login = null;
        let pass = null;
        ws.on('close', () => state.ircClients.delete(ws));
        ws.on('message', (data) => {
            for (const line of data.toString().split('\r\n')) {
                if (line.startsWith('PASS ')) pass = line.slice(5).replace(/^oauth:/, '');
                else if (line.startsWith('NICK ')) {
                    login = line.slice(5);
                    if (state.tokens[pass]?.login !== login) {
                        ws.send(':tmi.twitch.tv NOTICE * :Login authentication failed\r\n');
                        continue;
                    }
                    ws.send(`:tmi.twitch.tv 001 ${login} :Welcome, GLHF!\r\n`);
                } else if (line.startsWith('JOIN ')) {
                    ws.send(`:${login}!${login}@${login}.tmi.twitch.tv JOIN #${channel}\r\n`);
                    ws.send(`@badges=moderator/1;mod=1 :tmi.twitch.tv USERSTATE #${channel}\r\n`);
                    state.joined = true;
                } else if (line.startsWith('PRIVMSG ')) {
                    state.said.push(line.slice(line.indexOf(':') + 1));
                }
            }
        });
    });

    eventsubWss.on('connection', (ws) => {
        state.eventsubClients.add(ws);
        ws.on('close', () => state.eventsubClients.delete(ws));
        ws.send(
            JSON.stringify({
                metadata: { message_id: 'welcome', message_type: 'session_welcome' },
                payload: { session: { id: 'session-1', keepalive_timeout_seconds: 30 } }
            })
        );
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `127.0.0.1:${server.address().port}`;
    let msgCounter = 0;

    const toIrc = (line) => {
        for (const ws of state.ircClients) ws.send(`${line}\r\n`);
    };
    const escapeTag = (v) => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\:').replace(/ /g, '\\s');

    return {
        state,
        urls: {
            irc: `ws://${base}/irc`,
            eventsub: `ws://${base}/eventsub`,
            helix: `http://${base}/helix`,
            id: `http://${base}`
        },
        /** Ein Zuschauer schreibt etwas in den Chat. */
        chat(user, text, { badges = '', tags = {} } = {}) {
            const login = user.toLowerCase();
            const allTags = {
                badges,
                'display-name': user,
                id: `msg-${++msgCounter}`,
                mod: badges.includes('moderator') ? '1' : '0',
                subscriber: badges.includes('subscriber') ? '1' : '0',
                'user-id': `u-${login}`,
                'room-id': '100',
                ...tags
            };
            const tagStr = Object.entries(allTags)
                .map(([k, v]) => `${k}=${escapeTag(v)}`)
                .join(';');
            toIrc(`@${tagStr} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${channel} :${text}`);
            return allTags.id;
        },
        userNotice(tags, text = '') {
            const tagStr = Object.entries({ 'room-id': '100', ...tags })
                .map(([k, v]) => `${k}=${escapeTag(v)}`)
                .join(';');
            toIrc(`@${tagStr} :tmi.twitch.tv USERNOTICE #${channel}${text ? ` :${text}` : ''}`);
        },
        eventsub(type, event) {
            for (const ws of state.eventsubClients) {
                ws.send(
                    JSON.stringify({
                        metadata: { message_id: `n-${++msgCounter}`, message_type: 'notification' },
                        payload: { subscription: { type }, event }
                    })
                );
            }
        },
        disconnectIrc() {
            for (const ws of state.ircClients) ws.terminate();
        },
        async close() {
            for (const ws of [...state.ircClients, ...state.eventsubClients]) ws.terminate();
            await new Promise((resolve) => server.close(resolve));
        }
    };
}
