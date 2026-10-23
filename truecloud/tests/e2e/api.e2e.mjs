// End-to-End-Test der API gegen einen laufenden Server – NUR für lokale Testumgebungen
// (legt Testbenutzer *@e2e.test an und löscht sie wieder).
//
// Voraussetzungen:
//   - lokale Postgres-Datenbank (DATABASE_URL) und psql im PATH
//   - S3-kompatibler Test-Storage, z. B. moto:  pip install "moto[server]" && moto_server -p 9000
//     (.env: S3_ENDPOINT=http://127.0.0.1:9000, S3_FORCE_PATH_STYLE=true, beliebige Keys)
//   - kein SMTP_HOST, damit Mails ins Server-Log geschrieben werden
//   - CRON_SECRET gesetzt, Server frisch gestartet und Log in eine Datei umgeleitet:
//       npm run build && npm start > server.log 2>&1 &
//       npm run test:e2e -- server.log
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const BASE = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const LOG = process.argv[2];
if (!LOG) {
    console.error('Aufruf: npm run test:e2e -- <pfad-zum-server-log>');
    process.exit(1);
}
let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log('  ✓', msg);
    else {
        failures++;
        console.log('  ✗', msg);
    }
};
const psql = (sql) => execFileSync('psql', [process.env.DATABASE_URL, '-tA', '-c', sql]).toString().trim();

class Client {
    constructor() {
        this.cookie = '';
    }
    async req(path, { method = 'GET', body, origin = BASE, redirect = 'manual' } = {}) {
        const headers = {};
        if (this.cookie) headers.cookie = this.cookie;
        if (body !== undefined) headers['content-type'] = 'application/json';
        if (origin && method !== 'GET') headers.origin = origin;
        const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect });
        const set = res.headers.get('set-cookie');
        if (set) {
            const m = /tc_session=([^;]*)/.exec(set);
            if (m) this.cookie = m[1] ? `tc_session=${m[1]}` : '';
        }
        let data = null;
        const text = await res.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return { status: res.status, data, headers: res.headers };
    }
}

async function uploadSingle(c, name, content, folderId = null, type = 'text/plain') {
    const buf = Buffer.from(content);
    const init = await c.req('/api/uploads/init', { method: 'POST', body: { name, size: buf.length, mimeType: type, folderId } });
    if (init.status !== 200) return init;
    const put = await fetch(init.data.url, { method: 'PUT', body: buf, headers: { 'content-type': init.data.contentType } });
    if (!put.ok) return { status: put.status, data: await put.text() };
    return c.req('/api/uploads/complete', { method: 'POST', body: { fileId: init.data.fileId } });
}

function lastMailToken(kind, email) {
    // Mails werden ohne SMTP ins Log geschrieben: "[mail] An: <email>\n...token=..."
    const blocks = readFileSync(LOG, 'utf8').split('[mail] An: ').filter((b) => b.startsWith(email));
    const re = kind === 'verify' ? /email-bestaetigen\?token=([\w-]+)/ : /passwort-zuruecksetzen\?token=([\w-]+)/;
    return blocks.map((b) => re.exec(b)?.[1]).filter(Boolean).at(-1);
}

const quota = (email) => psql(`SELECT "usedBytes" || '/' || "reservedBytes" FROM "User" WHERE email='${email}'`);

async function main() {
    psql(`DELETE FROM "User" WHERE email LIKE '%@e2e.test'`);
    const a = new Client();
    const b = new Client();

    console.log('Registrierung & Login');
    let r = await a.req('/api/auth/register', { method: 'POST', body: { email: 'Anna@E2E.test', password: 'kurz', acceptTerms: true } });
    ok(r.status === 400, `zu kurzes Passwort abgelehnt (${r.data.error})`);
    r = await a.req('/api/auth/register', { method: 'POST', body: { email: 'anna@e2e.test', password: 'sehr-geheim-123', acceptTerms: false } });
    ok(r.status === 400, 'ohne AGB abgelehnt');
    r = await a.req('/api/auth/register', { method: 'POST', body: { name: 'Anna', email: 'Anna@E2E.test', password: 'sehr-geheim-123', acceptTerms: true } });
    ok(r.status === 201 && a.cookie, 'Registrierung OK + Session-Cookie');
    r = await new Client().req('/api/auth/register', { method: 'POST', body: { email: 'anna@e2e.test', password: 'sehr-geheim-123', acceptTerms: true } });
    ok(r.status === 409, 'doppelte E-Mail abgelehnt');
    r = await b.req('/api/auth/register', { method: 'POST', body: { email: 'ben@e2e.test', password: 'auch-geheim-456', acceptTerms: true } });
    ok(r.status === 201, 'zweiter Benutzer registriert');
    r = await a.req('/api/files', { method: 'GET' });
    ok(r.status === 200 && r.data.files.length === 0, 'leere Dateiliste');
    r = await a.req('/api/folders', { method: 'POST', body: { name: 'X' }, origin: 'https://evil.example' });
    ok(r.status === 403, 'CSRF: fremde Origin abgelehnt');
    r = await a.req('/api/folders', { method: 'POST', body: { name: 'X' }, origin: null });
    ok(r.status === 403, 'CSRF: fehlende Origin abgelehnt');
    r = await new Client().req('/api/files');
    ok(r.status === 401, 'ohne Login 401');

    console.log('Ordner & Uploads');
    r = await a.req('/api/folders', { method: 'POST', body: { name: 'Fotos' } });
    ok(r.status === 201, 'Ordner erstellt');
    const fotos = r.data.folder.id;
    r = await a.req('/api/folders', { method: 'POST', body: { name: 'fotos' } });
    ok(r.status === 409, 'doppelter Ordnername abgelehnt');
    r = await a.req('/api/folders', { method: 'POST', body: { name: 'Unterordner', parentId: fotos } });
    const sub = r.data.folder.id;

    r = await uploadSingle(a, 'hallo.txt', 'Hallo TrueCloud!', fotos);
    ok(r.status === 200 && r.data.file.name === 'hallo.txt', 'Einzel-Upload OK');
    const hallo = r.data.file.id;
    ok(quota('anna@e2e.test') === '16/0', `Speicher gezählt (${quota('anna@e2e.test')})`);
    r = await uploadSingle(a, 'hallo.txt', 'zweite Version', fotos);
    ok(r.data.file?.name === 'hallo (1).txt', `Namenskonflikt automatisch gelöst (${r.data.file?.name})`);

    // Grössen-Mismatch: 10 Bytes anmelden, 30 hochladen
    let init = await a.req('/api/uploads/init', { method: 'POST', body: { name: 'trick.bin', size: 10, folderId: null } });
    await fetch(init.data.url, { method: 'PUT', body: Buffer.alloc(30), headers: { 'content-type': init.data.contentType } });
    r = await a.req('/api/uploads/complete', { method: 'POST', body: { fileId: init.data.fileId } });
    ok(r.status === 400, `falsche Grösse abgelehnt (${r.data.error})`);
    ok(quota('anna@e2e.test') === '30/0', `Reservierung freigegeben (${quota('anna@e2e.test')})`);

    r = await a.req('/api/uploads/init', { method: 'POST', body: { name: 'riesig.iso', size: 11_000_000_000, folderId: null } });
    ok(r.status === 413, `Kontingent überschritten → 413 (${r.data.error})`);

    // Multipart (64 MiB + 1 MiB → 2 Teile)
    const size = 65 * 1024 * 1024;
    const big = Buffer.alloc(size, 7);
    init = await a.req('/api/uploads/init', { method: 'POST', body: { name: 'video.mp4', size, mimeType: 'video/mp4', folderId: sub } });
    ok(init.data.mode === 'multipart' && init.data.partCount === 2, `Multipart gestartet (${init.data.partCount} Teile à ${init.data.partSize})`);
    r = await a.req('/api/uploads/parts', { method: 'POST', body: { fileId: init.data.fileId, partNumbers: [1, 2] } });
    const parts = [];
    for (const n of [1, 2]) {
        const chunk = big.subarray((n - 1) * init.data.partSize, Math.min(n * init.data.partSize, size));
        const put = await fetch(r.data.urls[n], { method: 'PUT', body: chunk });
        parts.push({ partNumber: n, etag: put.headers.get('etag') });
    }
    r = await a.req('/api/uploads/complete', { method: 'POST', body: { fileId: init.data.fileId, parts } });
    ok(r.status === 200, 'Multipart-Upload abgeschlossen');
    const video = r.data.file.id;
    ok(quota('anna@e2e.test') === `${30 + size}/0`, 'Multipart-Speicher gezählt');
    r = await a.req('/api/uploads/parts', { method: 'POST', body: { fileId: video, partNumbers: [1] } });
    ok(r.status === 404, 'keine Teil-URLs mehr nach Abschluss');

    // Abbruch
    init = await a.req('/api/uploads/init', { method: 'POST', body: { name: 'abbruch.bin', size: 100 } });
    r = await a.req('/api/uploads/abort', { method: 'POST', body: { fileId: init.data.fileId } });
    ok(r.status === 200 && quota('anna@e2e.test') === `${30 + size}/0`, 'Abbruch gibt Reservierung frei');

    console.log('Auflisten, Suche, Umbenennen, Verschieben');
    r = await a.req(`/api/files?folderId=${fotos}`);
    ok(r.data.files.length === 2 && r.data.folders.length === 1 && r.data.breadcrumbs[0].name === 'Fotos', 'Ordnerinhalt + Breadcrumbs');
    r = await a.req('/api/files?q=VIDEO');
    ok(r.data.files.length === 1 && r.data.files[0].location === 'Fotos / Unterordner', `Suche mit Pfad (${r.data.files[0]?.location})`);
    r = await a.req(`/api/files/${hallo}`, { method: 'PATCH', body: { name: 'hallo (1).txt' } });
    ok(r.status === 409, 'Umbenennen auf vorhandenen Namen → 409');
    r = await a.req(`/api/files/${hallo}`, { method: 'PATCH', body: { name: 'gruss.txt' } });
    ok(r.data.file.name === 'gruss.txt', 'umbenannt');
    r = await a.req(`/api/files/${hallo}`, { method: 'PATCH', body: { folderId: null } });
    ok(r.data.file.folderId === null, 'in Wurzel verschoben');
    r = await a.req(`/api/folders/${fotos}`, { method: 'PATCH', body: { parentId: sub } });
    ok(r.status === 400, 'Ordner nicht in eigenen Unterordner verschiebbar');

    console.log('Download & Isolation');
    r = await a.req(`/api/files/${hallo}/download`);
    ok(r.status === 302, 'Download-Redirect');
    const content = await (await fetch(r.headers.get('location'))).text();
    ok(content === 'Hallo TrueCloud!', 'Inhalt stimmt');
    r = await b.req(`/api/files/${hallo}/download`);
    ok(r.status === 404, 'anderer Benutzer: Download 404');
    r = await b.req(`/api/files/${hallo}`, { method: 'PATCH', body: { name: 'gehackt.txt' } });
    ok(r.status === 404, 'anderer Benutzer: Umbenennen 404');
    r = await b.req(`/api/files?folderId=${fotos}`);
    ok(r.status === 404, 'anderer Benutzer: Ordner 404');
    r = await b.req('/api/uploads/init', { method: 'POST', body: { name: 'x', size: 1, folderId: fotos } });
    ok(r.status === 404, 'anderer Benutzer: Upload in fremden Ordner 404');

    console.log('Freigaben');
    r = await a.req('/api/shares', { method: 'POST', body: { fileId: hallo } });
    ok(r.status === 403, 'ohne bestätigte E-Mail keine Freigabe');
    const token = lastMailToken('verify', 'anna@e2e.test');
    const verifyPage = await fetch(`${BASE}/email-bestaetigen?token=${token}`).then((res) => res.text());
    ok(verifyPage.includes('E-Mail bestätigt'), 'E-Mail per Link bestätigt');
    r = await a.req('/api/shares', { method: 'POST', body: { fileId: hallo, password: 'geheim' } });
    ok(r.status === 403, 'Passwortschutz im Free-Tarif gesperrt');
    r = await a.req('/api/shares', { method: 'POST', body: { fileId: hallo } });
    ok(r.status === 201, `Freigabe erstellt (${r.status} ${JSON.stringify(r.data)})`);
    const shareToken = r.data.share.url.split('/s/')[1];
    const anon = new Client();
    const page = await fetch(`${BASE}/s/${shareToken}`).then((res) => res.text());
    ok(page.includes('gruss.txt'), 'öffentliche Seite zeigt Datei');
    r = await anon.req(`/api/public/shares/${shareToken}`, { method: 'POST', body: {} });
    ok(r.status === 200 && (await (await fetch(r.data.url)).text()) === 'Hallo TrueCloud!', 'öffentlicher Download funktioniert');
    psql(`UPDATE "User" SET plan='start', "quotaBytes"=200000000000 WHERE email='anna@e2e.test'`);
    r = await a.req('/api/shares', { method: 'POST', body: { fileId: video, password: 'geheim', expiresInDays: 7 } });
    ok(r.status === 201 && r.data.share.hasPassword, 'Start-Tarif: Passwort-Freigabe erstellt');
    const pwToken = r.data.share.url.split('/s/')[1];
    r = await anon.req(`/api/public/shares/${pwToken}`, { method: 'POST', body: {} });
    ok(r.status === 401, 'ohne Passwort 401');
    r = await anon.req(`/api/public/shares/${pwToken}`, { method: 'POST', body: { password: 'falsch' } });
    ok(r.status === 401, 'falsches Passwort 401');
    r = await anon.req(`/api/public/shares/${pwToken}`, { method: 'POST', body: { password: 'geheim' } });
    ok(r.status === 200, 'richtiges Passwort OK');
    r = await a.req('/api/shares');
    ok(r.data.shares.length === 2 && r.data.shares.some((s) => s.downloadCount === 1), 'Freigabeliste mit Download-Zähler');

    console.log('Papierkorb');
    r = await a.req(`/api/folders/${fotos}`, { method: 'DELETE' });
    ok(r.status === 200, 'Ordner in den Papierkorb');
    r = await a.req('/api/files?q=video');
    ok(r.data.files.length === 0, 'Dateien in gelöschtem Ordner nicht mehr in der Suche');
    r = await anon.req(`/api/public/shares/${pwToken}`, { method: 'POST', body: { password: 'geheim' } });
    ok(r.status === 404, 'Freigabe einer Datei im Papierkorb-Ordner inaktiv');
    r = await a.req('/api/trash');
    ok(r.data.folders.length === 1, 'Papierkorb listet Ordner');
    r = await a.req('/api/trash/restore', { method: 'POST', body: { type: 'folder', id: fotos } });
    ok(r.status === 200, 'Ordner wiederhergestellt');
    r = await a.req('/api/files?q=video');
    ok(r.data.files.length === 1, 'Datei wieder sichtbar');
    await a.req(`/api/folders/${fotos}`, { method: 'DELETE' });
    r = await a.req('/api/trash/purge', { method: 'POST', body: { type: 'folder', id: fotos } });
    ok(r.status === 200, 'Ordner endgültig gelöscht');
    ok(quota('anna@e2e.test') === '16/0', `Speicher freigegeben (${quota('anna@e2e.test')})`);
    ok(psql(`SELECT count(*) FROM "Share" s JOIN "User" u ON u.id=s."userId" WHERE u.email='anna@e2e.test'`) === '1', 'Freigaben gelöschter Dateien entfernt');

    console.log('Konto & Sicherheit');
    r = await a.req('/api/account/password', { method: 'POST', body: { currentPassword: 'falsch-falsch', newPassword: 'neues-passwort-789' } });
    ok(r.status === 400, 'Passwortwechsel mit falschem Passwort abgelehnt');
    r = await a.req('/api/account/password', { method: 'POST', body: { currentPassword: 'sehr-geheim-123', newPassword: 'neues-passwort-789' } });
    ok(r.status === 200, 'Passwort geändert');
    r = await a.req('/api/auth/logout', { method: 'POST' });
    r = await a.req('/api/files');
    ok(r.status === 401, 'nach Logout 401');
    r = await a.req('/api/auth/login', { method: 'POST', body: { email: 'anna@e2e.test', password: 'sehr-geheim-123' } });
    ok(r.status === 401, 'altes Passwort funktioniert nicht mehr');
    r = await a.req('/api/auth/login', { method: 'POST', body: { email: 'ANNA@e2e.test', password: 'neues-passwort-789' } });
    ok(r.status === 200, 'Login mit neuem Passwort');
    r = await a.req('/api/auth/forgot-password', { method: 'POST', body: { email: 'anna@e2e.test' } });
    await new Promise((res) => setTimeout(res, 500));
    const resetToken = lastMailToken('reset', 'anna@e2e.test');
    r = await new Client().req('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, password: 'zurueckgesetzt-000' } });
    ok(r.status === 200, 'Passwort per Link zurückgesetzt');
    r = await new Client().req('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, password: 'nochmal-nochmal' } });
    ok(r.status === 400, 'Reset-Link nur einmal gültig');
    r = await a.req('/api/files');
    ok(r.status === 401, 'Reset beendet alle Sitzungen');

    console.log('Cron');
    r = await new Client().req('/api/cron/cleanup');
    ok(r.status === 401, 'Cron ohne Secret 401');
    psql(`UPDATE "File" SET "createdAt" = now() - interval '2 days' WHERE status='PENDING'`);
    const cron = await fetch(`${BASE}/api/cron/cleanup`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((res) => res.json());
    ok(cron.ok === true, `Cron OK (${JSON.stringify(cron)})`);

    console.log('Konto löschen');
    await a.req('/api/auth/login', { method: 'POST', body: { email: 'anna@e2e.test', password: 'zurueckgesetzt-000' } });
    const userId = psql(`SELECT id FROM "User" WHERE email='anna@e2e.test'`);
    r = await a.req('/api/account', { method: 'DELETE', body: { confirmEmail: 'anna@e2e.test', password: 'falsch' } });
    ok(r.status === 400, 'Löschen mit falschem Passwort abgelehnt');
    r = await a.req('/api/account', { method: 'DELETE', body: { confirmEmail: 'anna@e2e.test', password: 'zurueckgesetzt-000' } });
    ok(r.status === 200, 'Konto gelöscht');
    ok(psql(`SELECT count(*) FROM "User" WHERE email='anna@e2e.test'`) === '0', 'Benutzer aus DB entfernt');
    const s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
    });
    const listing = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: `users/${userId}/` }));
    ok(!listing.KeyCount, 'alle Objekte im Storage entfernt');

    console.log(failures ? `\n${failures} Fehler` : '\nAlle Tests bestanden');
    process.exit(failures ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
