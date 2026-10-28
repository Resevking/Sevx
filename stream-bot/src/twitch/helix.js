// Minimaler Client für die Twitch-API (Helix).

export class HelixError extends Error {
    constructor(status, message, path) {
        super(`Twitch-API ${path}: ${message} (HTTP ${status})`);
        this.status = status;
        this.apiMessage = message;
    }
}

export class Helix {
    constructor({ tokens, baseUrl = 'https://api.twitch.tv/helix', log }) {
        this.tokens = tokens;
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.log = log;
    }

    /**
     * @param {string} method
     * @param {string} path z.B. "/streams"
     * @param {{role?: 'bot'|'broadcaster', query?: object, body?: object}} [opts]
     */
    async request(method, path, { role = 'bot', query, body } = {}) {
        const url = new URL(this.baseUrl + path);
        for (const [key, value] of Object.entries(query ?? {})) {
            if (value === undefined || value === null) continue;
            for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
        }

        for (let attempt = 0; ; attempt++) {
            const token = await this.tokens.accessToken(role);
            const headers = { Authorization: `Bearer ${token}`, 'Client-Id': this.tokens.info(role).clientId };
            if (body) headers['Content-Type'] = 'application/json';
            const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });

            if (res.status === 401 && attempt === 0) {
                await this.tokens.refresh(role);
                continue;
            }
            if (res.status === 204) return null;
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new HelixError(res.status, data?.message || res.statusText, path);
            return data;
        }
    }

    get(path, opts) {
        return this.request('GET', path, opts);
    }

    post(path, opts) {
        return this.request('POST', path, opts);
    }
}
