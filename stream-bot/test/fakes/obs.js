// Nachgebauter obs-websocket-v5-Server (JSON) mit Szenen, Quellen und Audio für Tests.

import { WebSocketServer } from 'ws';

export async function startFakeObs() {
    const state = {
        scenes: ['Hauptszene', 'Pause', 'Just Chatting'],
        current: 'Hauptszene',
        items: {
            Hauptszene: [
                { sceneItemId: 1, sourceName: 'Kamera', sceneItemEnabled: true, isGroup: false },
                { sceneItemId: 2, sourceName: 'Konfetti', sceneItemEnabled: false, isGroup: false },
                { sceneItemId: 3, sourceName: 'Alerts', sceneItemEnabled: true, isGroup: true }
            ],
            Alerts: [{ sceneItemId: 1, sourceName: 'Raid-Alert', sceneItemEnabled: false, isGroup: false }],
            Pause: [],
            'Just Chatting': []
        },
        inputs: { 'Mikrofon/AUX': { muted: false }, Desktop: { muted: false }, Todeszähler: { text: '' }, 'Letzter Follower': { text: '' } },
        requests: [],
        replaySaved: 0
    };

    const handlers = {
        GetVersion: () => ({ obsVersion: '31.0.0', obsWebSocketVersion: '5.5.0' }),
        GetSceneList: () => ({
            currentProgramSceneName: state.current,
            scenes: [...state.scenes].reverse().map((sceneName, i) => ({ sceneName, sceneIndex: i }))
        }),
        GetCurrentProgramScene: () => ({ currentProgramSceneName: state.current }),
        SetCurrentProgramScene: ({ sceneName }) => {
            if (!state.scenes.includes(sceneName)) throw new Error('scene not found');
            state.current = sceneName;
        },
        GetSceneItemList: ({ sceneName }) => ({ sceneItems: state.items[sceneName] ?? [] }),
        GetGroupSceneItemList: ({ sceneName }) => ({ sceneItems: state.items[sceneName] ?? [] }),
        GetSceneItemEnabled: ({ sceneName, sceneItemId }) => ({
            sceneItemEnabled: state.items[sceneName].find((i) => i.sceneItemId === sceneItemId).sceneItemEnabled
        }),
        SetSceneItemEnabled: ({ sceneName, sceneItemId, sceneItemEnabled }) => {
            state.items[sceneName].find((i) => i.sceneItemId === sceneItemId).sceneItemEnabled = sceneItemEnabled;
        },
        GetInputList: () => ({ inputs: Object.keys(state.inputs).map((inputName) => ({ inputName })) }),
        SetInputMute: ({ inputName, inputMuted }) => {
            state.inputs[inputName].muted = inputMuted;
        },
        ToggleInputMute: ({ inputName }) => ({ inputMuted: (state.inputs[inputName].muted = !state.inputs[inputName].muted) }),
        SetInputSettings: ({ inputName, inputSettings }) => {
            Object.assign(state.inputs[inputName], inputSettings);
        },
        SaveReplayBuffer: () => {
            state.replaySaved++;
        }
    };

    const wss = new WebSocketServer({
        port: 0,
        host: '127.0.0.1',
        handleProtocols: (protocols) => (protocols.has('obswebsocket.json') ? 'obswebsocket.json' : false)
    });

    wss.on('connection', (ws) => {
        ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1 } }));
        ws.on('message', (raw) => {
            const { op, d } = JSON.parse(raw.toString());
            if (op === 1) {
                ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
                return;
            }
            if (op !== 6) return;
            state.requests.push({ type: d.requestType, data: d.requestData });
            const handler = handlers[d.requestType];
            let response;
            try {
                if (!handler) throw new Error(`unsupported ${d.requestType}`);
                const responseData = handler(d.requestData ?? {});
                response = { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: true, code: 100 }, responseData };
            } catch (err) {
                response = { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: false, code: 600, comment: err.message } };
            }
            ws.send(JSON.stringify({ op: 7, d: response }));
        });
    });

    await new Promise((resolve) => wss.on('listening', resolve));
    return {
        state,
        url: `ws://127.0.0.1:${wss.address().port}`,
        /** Simuliert z.B. einen OBS-Neustart: alle Verbindungen brechen ab. */
        dropClients() {
            for (const ws of wss.clients) ws.terminate();
        },
        async close() {
            for (const ws of wss.clients) ws.terminate();
            await new Promise((resolve) => wss.close(resolve));
        }
    };
}
