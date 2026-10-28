// Einfacher Logger mit Zeitstempel, Bereich und Farben im Terminal.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

export function createLogger({ level = process.env.LOG_LEVEL || 'info', scope = 'Bot', sink } = {}) {
    const threshold = LEVELS[level] ?? LEVELS.info;
    const useColor = !sink && process.stdout.isTTY;
    const write = sink || ((lvl, line) => (lvl === 'error' || lvl === 'warn' ? console.error(line) : console.log(line)));

    function log(lvl, args) {
        if (LEVELS[lvl] < threshold) return;
        const time = new Date().toLocaleTimeString('de-DE', { hour12: false });
        const text = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        const tag = lvl.toUpperCase().padEnd(5);
        const line = useColor ? `${COLORS[lvl]}[${time}] ${tag}${RESET} [${scope}] ${text}` : `[${time}] ${tag} [${scope}] ${text}`;
        write(lvl, line);
    }

    return {
        debug: (...a) => log('debug', a),
        info: (...a) => log('info', a),
        warn: (...a) => log('warn', a),
        error: (...a) => log('error', a),
        child: (childScope) => createLogger({ level, scope: childScope, sink })
    };
}
