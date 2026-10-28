// Twitch-Anmeldung per Gerätecode:  npm run auth            (Bot-Account)
//                                    npm run auth -- broadcaster  (Streamer-Account, falls Bot ≠ Streamer)
// Es öffnet sich kein Browser-Fenster automatisch: Link anklicken, einloggen, Code bestätigen – fertig.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../config.js';
import { SCOPES, DEFAULT_ID_URL, readTokenFile, writeTokenFile, validateToken } from './tokens.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function post(url, params) {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function main() {
    loadEnvFile(path.join(ROOT, '.env'));
    const role = (process.argv[2] || 'bot').toLowerCase();
    if (!['bot', 'broadcaster'].includes(role)) {
        console.error('Verwendung: npm run auth  oder  npm run auth -- broadcaster');
        process.exit(1);
    }
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    const idUrl = process.env.TWITCH_ID_URL || DEFAULT_ID_URL;
    if (!clientId) {
        console.error('TWITCH_CLIENT_ID fehlt in der .env – siehe README, Abschnitt "Twitch-App anlegen".');
        process.exit(1);
    }

    const scopes = SCOPES.join(' ');
    const start = await post(`${idUrl}/oauth2/device`, { client_id: clientId, scopes });
    if (!start.ok) {
        console.error(`Twitch hat die Anfrage abgelehnt (HTTP ${start.status}): ${start.data.message ?? ''}`);
        console.error('Prüfe die Client-ID und ob die App bei Twitch als "Öffentlich" (Public) angelegt ist.');
        process.exit(1);
    }
    const { device_code: deviceCode, user_code: userCode, verification_uri: uri, expires_in: expiresIn } = start.data;
    let interval = start.data.interval || 5;

    const who = role === 'bot' ? 'dem BOT-Account' : 'deinem STREAMER-Account';
    console.log('');
    console.log(`  1. Öffne diesen Link:  ${uri}`);
    console.log(`  2. Melde dich mit ${who} an`);
    console.log(`  3. Bestätige den Code: ${userCode}`);
    console.log('');
    console.log('Warte auf Bestätigung …');

    const deadline = Date.now() + expiresIn * 1000;
    while (Date.now() < deadline) {
        await sleep(interval);
        const params = { client_id: clientId, scopes, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' };
        if (clientSecret) params.client_secret = clientSecret;
        const res = await post(`${idUrl}/oauth2/token`, params);
        if (res.ok) {
            const info = await validateToken(res.data.access_token, idUrl);
            const file = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'tokens.json');
            const tokens = readTokenFile(file);
            tokens[role] = {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresAt: Date.now() + res.data.expires_in * 1000,
                login: info.login,
                userId: info.userId,
                clientId: info.clientId,
                scopes: info.scopes
            };
            writeTokenFile(file, tokens);
            console.log(`\n✔ Angemeldet als "${info.login}" (${role}). Token gespeichert in ${path.relative(ROOT, file)}.`);
            if (role === 'bot') {
                console.log('  Wenn Bot und Streamer verschiedene Accounts sind, führe zusätzlich');
                console.log('  "npm run auth -- broadcaster" aus und mache den Bot im Chat zum Mod: /mod ' + info.login);
            }
            return;
        }
        const message = String(res.data.message ?? '');
        if (message === 'authorization_pending') continue;
        if (message === 'slow_down') {
            interval += 5;
            continue;
        }
        console.error(`\nAnmeldung fehlgeschlagen: ${message || `HTTP ${res.status}`}`);
        process.exit(1);
    }
    console.error('\nDer Code ist abgelaufen. Bitte erneut "npm run auth" ausführen.');
    process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
