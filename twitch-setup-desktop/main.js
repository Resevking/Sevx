// Twitch Setup-Assistent – Electron main process.
// Shows the setup assistant (built into dist/) in its own window. Links to Twitch, OBS etc. open in the normal browser.
// Start with --selftest to load the app, click through all areas and exit with code 0 (ok) or 1 (error); see selftest.log.

const { app, BrowserWindow, Menu, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SELFTEST = process.argv.includes('--selftest');

if (SELFTEST) {
    // Keep test data away from the user's real progress.
    app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'twitch-setup-selftest-')));
} else if (!app.requestSingleInstanceLock()) {
    app.quit();
}

let mainWindow = null;

function isWebUrl(url) {
    return /^https?:\/\//i.test(url);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1120,
        height: 860,
        minWidth: 380,
        minHeight: 520,
        title: 'Twitch Setup-Assistent',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#fafafa',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    // Links with target="_blank" → default browser.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isWebUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    // Never navigate the app window away from the app itself.
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('file://')) return;
        event.preventDefault();
        if (isWebUrl(url)) shell.openExternal(url);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (SELFTEST) runSelfTest(mainWindow);

    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
});

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
});

app.on('window-all-closed', () => app.quit());

// ---------------------------------------------------------------------------
// Self-test (used by the GitHub Actions build)
// ---------------------------------------------------------------------------

const SELFTEST_SCRIPT = `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (what, fn, ms = 8000) => {
        const start = Date.now();
        while (Date.now() - start < ms) {
            const value = fn();
            if (value) return value;
            await wait(50);
        }
        throw new Error('Zeitüberschreitung: ' + what);
    };
    const result = {};

    await until('3 Reiter', () => document.querySelectorAll('[role=tab]').length === 3);
    result.title = document.querySelector('h1').textContent;
    result.steps = await until('Checkliste', () => document.querySelectorAll('[data-step]').length);

    document.querySelector('[data-step] input[type=checkbox]').click();
    result.progress = await until('Fortschritt', () => (document.body.innerText.match(/Fortschritt: (\\d+) von/) || [])[1] === '1' && 1);

    document.getElementById('tab-obs').click();
    const input = await until('Upload-Feld', () => document.getElementById('upload'));
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(input, '10');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    result.recommendation = await until('Empfehlung', () => (document.body.innerText.match(/\\d+p · \\d+ FPS/) || [])[0]);

    document.getElementById('tab-probleme').click();
    result.problems = await until('Problemliste', () => document.querySelectorAll('details').length);

    localStorage.setItem('selftest', 'ok');
    result.storage = localStorage.getItem('selftest') === 'ok';
    localStorage.removeItem('selftest');
    return result;
})()`;

function runSelfTest(win) {
    const logFile = path.join(process.cwd(), 'selftest.log');
    const lines = [];
    const consoleErrors = [];
    let finished = false;

    const log = (message) => {
        lines.push(message);
        console.log(message);
        try {
            fs.writeFileSync(logFile, lines.join('\n') + '\n');
        } catch {
            // ignore
        }
    };
    const finish = (ok, message) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        log(ok ? `OK: ${message}` : `FEHLER: ${message}`);
        app.exit(ok ? 0 : 1);
    };
    const watchdog = setTimeout(() => finish(false, 'Selbsttest hat sich aufgehängt (60 s)'), 60000);

    log(`Twitch Setup-Assistent ${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform}`);

    win.webContents.on('console-message', (event, level, message) => {
        const lvl = event && event.level !== undefined ? event.level : level;
        const msg = event && event.message !== undefined ? event.message : message;
        if (lvl === 'error' || lvl === 3) consoleErrors.push(msg);
    });
    win.webContents.on('did-fail-load', (_e, code, description) => finish(false, `Seite nicht geladen: ${description} (${code})`));
    win.webContents.on('render-process-gone', (_e, details) => finish(false, `Oberfläche abgestürzt: ${details.reason}`));

    win.webContents.once('did-finish-load', async () => {
        try {
            const r = await win.webContents.executeJavaScript(SELFTEST_SCRIPT, true);
            log(`Titel: ${r.title}`);
            log(`Checkliste: ${r.steps} Schritte, Fortschritt nach Klick: ${r.progress}`);
            log(`OBS-Rechner (10 Mbit/s): ${r.recommendation}`);
            log(`Problemlöser: ${r.problems} Einträge`);
            log(`Speichern: ${r.storage ? 'funktioniert' : 'funktioniert NICHT'}`);

            const problems = [];
            if (r.title !== 'Twitch Setup-Assistent') problems.push('falscher Titel');
            if (r.steps < 10) problems.push('zu wenige Schritte');
            if (!r.recommendation) problems.push('keine Empfehlung');
            if (r.problems < 10) problems.push('zu wenige Probleme');
            if (!r.storage) problems.push('Speichern geht nicht');
            if (consoleErrors.length) problems.push(`Fehler in der Konsole: ${consoleErrors.join(' | ')}`);

            if (problems.length) finish(false, problems.join('; '));
            else finish(true, 'alle Bereiche funktionieren');
        } catch (error) {
            finish(false, error && error.message ? error.message : String(error));
        }
    });
}
