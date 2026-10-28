// Speichert eigene Befehle, Zähler und Nutzungszahlen dauerhaft in data/store.json.

import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({ version: 1, customCommands: {}, counters: {}, uses: {} });

export class Store {
    constructor(file, { saveDelay = 1000, log } = {}) {
        this.file = file;
        this.saveDelay = saveDelay;
        this.log = log;
        this.data = EMPTY();
        this.timer = null;
    }

    load() {
        if (!fs.existsSync(this.file)) return this;
        try {
            this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
        } catch (err) {
            // Kaputte Datei nicht überschreiben, sondern sichern
            const backup = `${this.file}.kaputt-${Date.now()}`;
            fs.copyFileSync(this.file, backup);
            this.log?.warn(`store.json konnte nicht gelesen werden (${err.message}). Sicherung: ${backup}`);
        }
        return this;
    }

    scheduleSave() {
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush();
        }, this.saveDelay);
        this.timer.unref?.();
    }

    flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
        fs.renameSync(tmp, this.file);
    }

    // --- Zähler -------------------------------------------------------------

    getCounter(name) {
        return this.data.counters[name.toLowerCase()] ?? 0;
    }

    addCounter(name, amount = 1) {
        return this.setCounter(name, this.getCounter(name) + amount);
    }

    setCounter(name, value) {
        this.data.counters[name.toLowerCase()] = value;
        this.scheduleSave();
        return value;
    }

    // --- Nutzungszähler für {count} ------------------------------------------

    incrementUses(command) {
        const value = (this.data.uses[command] ?? 0) + 1;
        this.data.uses[command] = value;
        this.scheduleSave();
        return value;
    }

    // --- Eigene Befehle (!addcmd) --------------------------------------------

    getCustomCommand(name) {
        return this.data.customCommands[name];
    }

    listCustomCommands() {
        return Object.keys(this.data.customCommands).sort();
    }

    setCustomCommand(name, response, by) {
        const existing = this.data.customCommands[name];
        this.data.customCommands[name] = {
            response,
            createdBy: existing?.createdBy ?? by,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedBy: by
        };
        this.scheduleSave();
    }

    deleteCustomCommand(name) {
        if (!this.data.customCommands[name]) return false;
        delete this.data.customCommands[name];
        delete this.data.uses[name];
        this.scheduleSave();
        return true;
    }
}
