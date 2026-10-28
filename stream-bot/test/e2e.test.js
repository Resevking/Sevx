// Startet den kompletten Bot gegen nachgebaute Twitch- und OBS-Server.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { normalizeConfig } from '../src/config.js';
import { StreamBot } from '../src/bot.js';
import { createLogger } from '../src/logger.js';
import { startFakeTwitch } from './fakes/twitch.js';
import { startFakeObs } from './fakes/obs.js';

const ALL_SCOPES = [
    'chat:read',
    'chat:edit',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
    'moderator:manage:shoutouts',
    'moderator:read:followers',
    'clips:edit',
    'channel:manage:broadcast',
    'channel:read:redemptions'
];

async function waitFor(fn, what, timeout = 3000) {
    const start = Date.now();
    for (;;) {
        const result = await fn();
        if (result) return result;
        if (Date.now() - start > timeout) throw new Error(`Timeout beim Warten auf: ${what}`);
        await new Promise((r) => setTimeout(r, 15));
    }
}

let twitch;
let obs;
let bot;
let dataDir;
const logs = [];

const said = () => twitch.state.said;
const waitForSay = (pattern) => waitFor(() => said().find((m) => (pattern instanceof RegExp ? pattern.test(m) : m === pattern)), `Chat-Nachricht ${pattern}`);
const helixCalls = (method, p) => twitch.state.helixCalls.filter((c) => c.method === method && c.path === p);

before(async () => {
    twitch = await startFakeTwitch({
        channel: 'sevx',
        users: {
            freundin: { id: '200', login: 'freundin', display_name: 'Freundin' },
            raider: { id: '300', login: 'raider', display_name: 'Raider' },
            viewer: { id: 'u-viewer', login: 'viewer', display_name: 'Viewer' }
        },
        tokens: {
            'bot-token': { login: 'sevbot', userId: '900', scopes: ALL_SCOPES },
            'streamer-token': { login: 'sevx', userId: '100', scopes: ALL_SCOPES }
        }
    });
    twitch.state.refreshTokens['bot-refresh'] = 'sevbot';
    obs = await startFakeObs();

    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streambot-'));
    fs.writeFileSync(
        path.join(dataDir, 'tokens.json'),
        JSON.stringify({
            bot: { accessToken: 'bot-token', refreshToken: 'bot-refresh', clientId: 'fakeclient' },
            broadcaster: { accessToken: 'streamer-token', clientId: 'fakeclient' }
        })
    );

    const raw = YAML.parse(`
twitch: { channel: sevx }
obs: { url: "${obs.url}", defaultMic: mikro }
commands:
  hug: { response: "{user} umarmt {touser} 🤗", cooldown: 0 }
  tod:
    permission: moderator
    actions:
      - counter: { name: tode, add: 1 }
      - text: { source: "Todeszähler", text: "Tode: {counter:tode}" }
      - say: "Tode: {counter:tode}"
  konfetti:
    cooldown: 60
    actions:
      - source: { source: Konfetti, visible: true, duration: 0.2 }
moderation:
  enabled: true
  links: { whitelist: [twitch.tv] }
  punishment: { steps: [delete, 60] }
events:
  follow:
    - say: "Danke fürs Folgen, {user}!"
    - text: { source: "Letzter Follower", text: "{user}" }
  raid:
    minViewers: 2
    actions:
      - say: "RAID von {user} mit {viewers} Leuten!"
      - shoutout: "{user}"
      - source: { source: Raid-Alert, visible: true, duration: 0.1 }
  giftbomb:
    - say: "{user} verschenkt {amount} Subs!"
  subgift:
    - say: "{user} schenkt {recipient} einen Sub"
  redemptions:
    "Hydrieren!":
      - say: "{user} sagt: Trink was! {input}"
`);
    const config = normalizeConfig(raw, { DATA_DIR: dataDir });
    bot = new StreamBot(config, { log: createLogger({ level: 'debug', sink: (_, line) => logs.push(line) }), urls: twitch.urls });
    await bot.start();
    await waitFor(() => twitch.state.joined && bot.chat.isMod, 'Chat-Login');
    await waitFor(() => bot.obs.connected, 'OBS-Verbindung');
    await waitFor(() => helixCalls('POST', '/eventsub/subscriptions').length === 2, 'EventSub-Abos');
});

after(async () => {
    if (process.env.DUMP_LOGS) console.log(logs.join('\n'));
    await bot?.stop();
    await twitch?.close();
    await obs?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

test('eigener Befehl mit Platzhaltern', async () => {
    twitch.chat('Viewer', '!hug @Anna');
    await waitForSay('Viewer umarmt Anna 🤗');
});

test('Mod wechselt die OBS-Szene, Zuschauer dürfen das nicht', async () => {
    twitch.chat('Viewer', '!szene pause');
    twitch.chat('Moddy', '!szene pause', { badges: 'moderator/1' });
    await waitForSay('Szene gewechselt zu "Pause".');
    assert.equal(obs.state.current, 'Pause');
    assert.equal(said().filter((m) => m.includes('Szene gewechselt')).length, 1);

    twitch.chat('Moddy', '!szene gibtsnicht', { badges: 'moderator/1' });
    await waitForSay(/Szene "gibtsnicht" nicht gefunden\. Verfügbar: Hauptszene, Pause, Just Chatting/);
});

test('Quelle per Chat ein- und ausblenden (auch in Gruppen)', async () => {
    obs.state.current = 'Hauptszene';
    twitch.chat('Moddy', '!quelle kamera aus', { badges: 'moderator/1' });
    await waitForSay('Quelle "Kamera" ist jetzt ausgeblendet.');
    assert.equal(obs.state.items.Hauptszene[0].sceneItemEnabled, false);

    twitch.chat('Moddy', '!quelle raid-alert', { badges: 'moderator/1' });
    await waitForSay('Quelle "Raid-Alert" ist jetzt sichtbar.');
    assert.equal(obs.state.items.Alerts[0].sceneItemEnabled, true);
    obs.state.items.Alerts[0].sceneItemEnabled = false;
});

test('Mikrofon stumm schalten mit Standard-Mikro (unscharfe Namenssuche)', async () => {
    twitch.chat('SevX', '!mute', { badges: 'broadcaster/1' });
    await waitForSay('"Mikrofon/AUX" ist jetzt stumm.');
    assert.equal(obs.state.inputs['Mikrofon/AUX'].muted, true);
});

test('Todeszähler: Zähler, OBS-Text und Chat', async () => {
    twitch.chat('Moddy', '!tod', { badges: 'moderator/1' });
    await waitForSay('Tode: 1');
    assert.equal(obs.state.inputs['Todeszähler'].text, 'Tode: 1');
    twitch.chat('Moddy', '!zähler tode =5', { badges: 'moderator/1' });
    await waitForSay('tode: 5');
});

test('Quelle mit Dauer wird wieder ausgeblendet, Cooldown greift für Zuschauer', async () => {
    twitch.chat('Viewer', '!konfetti');
    await waitFor(() => obs.state.items.Hauptszene[1].sceneItemEnabled === true, 'Konfetti sichtbar');
    await waitFor(() => obs.state.items.Hauptszene[1].sceneItemEnabled === false, 'Konfetti wieder aus');
    const before = obs.state.requests.length;
    twitch.chat('Viewer', '!konfetti');
    twitch.chat('Viewer', '!hug cooldowncheck');
    await waitForSay('Viewer umarmt cooldowncheck 🤗');
    assert.equal(obs.state.requests.filter((r, i) => i >= before && r.type === 'SetSceneItemEnabled').length, 0);
});

test('Moderation löscht Links, !permit erlaubt einen Link', async () => {
    const id = twitch.chat('Spammer', 'kauft follower auf cheap-viewers.com jetzt');
    await waitForSay(/Spammer, Links bitte nur mit Erlaubnis eines Mods\. \(Nachricht gelöscht\)/);
    const del = helixCalls('DELETE', '/moderation/chat');
    assert.equal(del.length, 1);
    assert.equal(del[0].query.message_id, id);
    assert.equal(del[0].query.moderator_id, '900');

    // Zweiter Verstoß → Timeout
    twitch.chat('Spammer', 'nochmal www.cheap-viewers.com');
    await waitForSay(/Timeout 60 s/);
    assert.equal(helixCalls('POST', '/moderation/bans')[0].body.data.duration, 60);

    // Erlaubte Domain und Mods werden nicht moderiert
    twitch.chat('Viewer', 'mein clip: https://clips.twitch.tv/abc');
    twitch.chat('Moddy', 'https://example.com', { badges: 'moderator/1' });

    twitch.chat('Moddy', '!permit @viewer', { badges: 'moderator/1' });
    await waitForSay('viewer darf in den nächsten 60 Sekunden einen Link posten.');
    twitch.chat('Viewer', 'hier: example.com');
    twitch.chat('Viewer', '!hug done');
    await waitForSay('Viewer umarmt done 🤗');
    assert.equal(helixCalls('DELETE', '/moderation/chat').length, 1);
});

test('Raid: Nachricht, offizieller Shoutout, Alert-Einblendung', async () => {
    const alertToggles = () => obs.state.requests.filter((r) => r.type === 'SetSceneItemEnabled' && r.data.sceneName === 'Alerts').length;
    const baseline = alertToggles();
    twitch.userNotice({ 'msg-id': 'raid', login: 'raider', 'display-name': 'Raider', 'msg-param-viewerCount': '42' });
    await waitForSay('RAID von Raider mit 42 Leuten!');
    await waitForSay(/Schaut unbedingt bei Raider vorbei!.*twitch\.tv\/raider/);
    assert.equal(helixCalls('POST', '/chat/shoutouts')[0].query.to_broadcaster_id, '300');
    await waitFor(() => alertToggles() === baseline + 2, 'Alert ein/aus');
    assert.equal(obs.state.items.Alerts[0].sceneItemEnabled, false);

    // Mini-Raid unter minViewers wird ignoriert
    twitch.userNotice({ 'msg-id': 'raid', login: 'mini', 'display-name': 'Mini', 'msg-param-viewerCount': '1' });
    twitch.chat('Viewer', '!hug raidcheck');
    await waitForSay('Viewer umarmt raidcheck 🤗');
    assert.ok(!said().some((m) => m.includes('RAID von Mini')));
});

test('Geschenk-Bombe wird einmal gemeldet, nicht für jeden Sub einzeln', async () => {
    twitch.userNotice({
        'msg-id': 'submysterygift',
        login: 'gönner',
        'display-name': 'Gönner',
        'msg-param-mass-gift-count': '2',
        'msg-param-sub-plan': '1000'
    });
    for (const r of ['a', 'b']) {
        twitch.userNotice({
            'msg-id': 'subgift',
            login: 'gönner',
            'display-name': 'Gönner',
            'msg-param-recipient-display-name': r,
            'msg-param-sub-plan': '1000'
        });
    }
    twitch.userNotice({
        'msg-id': 'subgift',
        login: 'einzel',
        'display-name': 'Einzel',
        'msg-param-recipient-display-name': 'c',
        'msg-param-sub-plan': '1000'
    });
    await waitForSay('Gönner verschenkt 2 Subs!');
    await waitForSay('Einzel schenkt c einen Sub');
    assert.ok(!said().some((m) => m.startsWith('Gönner schenkt')));
});

test('Follow und Kanalpunkte über EventSub', async () => {
    twitch.eventsub('channel.follow', { user_id: '555', user_login: 'neu', user_name: 'Neu' });
    twitch.eventsub('channel.follow', { user_id: '555', user_login: 'neu', user_name: 'Neu' });
    await waitForSay('Danke fürs Folgen, Neu!');
    await waitFor(() => obs.state.inputs['Letzter Follower'].text === 'Neu', 'Follower-Text');
    twitch.eventsub('channel.channel_points_custom_reward_redemption.add', {
        user_login: 'viewer',
        user_name: 'Viewer',
        user_input: 'jetzt!',
        reward: { title: 'hydrieren!', cost: 500 }
    });
    await waitForSay('Viewer sagt: Trink was! jetzt!');
    assert.equal(said().filter((m) => m.startsWith('Danke fürs Folgen')).length, 1);

    const subs = helixCalls('POST', '/eventsub/subscriptions');
    assert.deepEqual(subs.map((s) => s.body.type).sort(), ['channel.channel_points_custom_reward_redemption.add', 'channel.follow']);
    assert.ok(subs.every((s) => s.token === 'streamer-token' && s.body.transport.session_id === 'session-1'));
});

test('!addcmd / !editcmd / !delcmd', async () => {
    twitch.chat('Viewer', '!addcmd !gruss Hallo');
    twitch.chat('Moddy', '!addcmd !gruss Hallo {user}, schön dass du da bist!', { badges: 'moderator/1' });
    await waitForSay('Befehl !gruss wurde angelegt.');
    twitch.chat('Viewer', '!gruss');
    await waitForSay('Hallo Viewer, schön dass du da bist!');
    twitch.chat('Moddy', '!addcmd !hug geht nicht', { badges: 'moderator/1' });
    await waitForSay(/!hug ist ein eingebauter oder in der config.yml festgelegter Befehl/);
    twitch.chat('Moddy', '!delcmd gruss', { badges: 'moderator/1' });
    await waitForSay('Befehl !gruss wurde gelöscht.');
    bot.store.flush();
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8'));
    assert.deepEqual(stored.customCommands, {});
    assert.equal(stored.counters.tode, 5);
});

test('Titel und Kategorie ändern nutzt den Streamer-Login', async () => {
    twitch.chat('Moddy', '!titel Neuer Titel 🎮', { badges: 'moderator/1' });
    await waitForSay('Neuer Titel: Neuer Titel 🎮');
    const patch = helixCalls('PATCH', '/channels')[0];
    assert.equal(patch.token, 'streamer-token');
    assert.equal(patch.body.title, 'Neuer Titel 🎮');

    twitch.chat('Moddy', '!spiel mine', { badges: 'moderator/1' });
    await waitForSay('Neue Kategorie: Minecraft');
    twitch.chat('Viewer', '!titel'); // Zuschauer dürfen nur lesen
    await waitForSay('Titel: Neuer Titel 🎮');
});

test('Uptime, Followage und Clip', async () => {
    twitch.chat('Viewer', '!uptime');
    await waitForSay('SevX ist gerade offline.');
    twitch.state.stream = { started_at: new Date(Date.now() - (2 * 3600 + 5 * 60) * 1000).toISOString(), title: 't', game_name: 'g', viewer_count: 3 };
    twitch.chat('Moddy', '!uptime', { badges: 'moderator/1' });
    await waitForSay('SevX ist seit 2 Stunden und 5 Minuten live.');

    twitch.state.follows['u-viewer'] = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
    twitch.chat('Viewer', '!followage');
    await waitForSay(/^Viewer folgt SevX seit 1 Monat und 10 Tagen/);

    twitch.chat('Viewer', '!clip');
    await waitForSay('Clip erstellt: https://clips.twitch.tv/TollerClip');
});

test('abgelaufenes Token wird automatisch erneuert', async () => {
    twitch.state.failNextHelixWith401 = true;
    twitch.chat('Moddy', '!followage @freundin', { badges: 'moderator/1' });
    await waitForSay('Freundin folgt SevX (noch) nicht.');
    const tokens = JSON.parse(fs.readFileSync(path.join(dataDir, 'tokens.json'), 'utf8'));
    assert.match(tokens.bot.accessToken, /^sevbot-token-/);
    assert.equal(tokens.bot.login, 'sevbot');
});

test('Chat verbindet sich nach Abbruch selbst neu', async () => {
    twitch.state.joined = false;
    twitch.disconnectIrc();
    await waitFor(() => twitch.state.joined && bot.chat.joined, 'Neuverbindung', 5000);
    twitch.chat('Viewer', '!hug zurück');
    await waitForSay('Viewer umarmt zurück 🤗');
});

test('OBS verbindet sich nach Abbruch selbst neu', async () => {
    obs.dropClients();
    await waitFor(() => !bot.obs.connected, 'OBS getrennt');
    twitch.chat('Moddy', '!szene haupt', { badges: 'moderator/1' });
    await waitForSay('OBS ist gerade nicht verbunden.');
    await waitFor(() => bot.obs.connected, 'OBS wieder verbunden', 5000);
    twitch.chat('Moddy', '!szene haupt', { badges: 'moderator/1' });
    await waitForSay('Szene gewechselt zu "Hauptszene".');
});
