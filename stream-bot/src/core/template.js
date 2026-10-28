// Platzhalter in Texten ersetzen, z.B. "Hallo {user}!" oder "Tode: {counter:tode}".
// Ersetzt wird in einem Durchgang: Text aus dem Chat (z.B. {args}) wird nicht erneut ausgewertet.

const PATTERN = /\{([a-zA-Z0-9_]+)(?::([^{}]*))?\}/g;

export class Templates {
    constructor() {
        this.resolvers = new Map();
        this.register('random', (arg) => {
            const m = String(arg ?? '').match(/^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/);
            const [min, max] = m ? [Number(m[1]), Number(m[2])].sort((a, b) => a - b) : [1, 100];
            return String(min + Math.floor(Math.random() * (max - min + 1)));
        });
        this.register('pick', (arg) => {
            const options = String(arg ?? '')
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean);
            return options.length ? options[Math.floor(Math.random() * options.length)] : '';
        });
    }

    /** Globaler Platzhalter, z.B. register('counter', name => ...). Darf async sein. */
    register(name, fn) {
        this.resolvers.set(name, fn);
    }

    /**
     * @param {string} template
     * @param {object} vars Werte für diesen Aufruf. Ein Wert darf auch eine Funktion (arg) => Wert sein.
     *                      vars.argv (Array) liefert {1}, {2}, …
     */
    async render(template, vars = {}) {
        const text = String(template ?? '');
        const matches = [...text.matchAll(PATTERN)];
        if (matches.length === 0) return text;

        let out = '';
        let last = 0;
        for (const m of matches) {
            const [whole, name, arg] = m;
            out += text.slice(last, m.index);
            last = m.index + whole.length;
            const value = await this.resolve(name, arg, vars);
            out += value === undefined || value === null ? whole : String(value);
        }
        return out + text.slice(last);
    }

    async resolve(name, arg, vars) {
        if (/^\d+$/.test(name)) {
            const argv = vars.argv ?? [];
            return argv[Number(name) - 1] ?? '';
        }
        if (Object.prototype.hasOwnProperty.call(vars, name)) {
            const v = vars[name];
            return typeof v === 'function' ? v(arg) : v;
        }
        const resolver = this.resolvers.get(name);
        if (resolver) {
            try {
                return await resolver(arg, vars);
            } catch {
                return '?';
            }
        }
        return undefined;
    }
}
