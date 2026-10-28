// Kleine Formatierungshelfer für Chat-Ausgaben (deutsch).

const UNITS = [
    [365 * 24 * 3600, 'Jahr', 'Jahren'],
    [30 * 24 * 3600, 'Monat', 'Monaten'],
    [24 * 3600, 'Tag', 'Tagen'],
    [3600, 'Stunde', 'Stunden'],
    [60, 'Minute', 'Minuten'],
    [1, 'Sekunde', 'Sekunden']
];

/**
 * Dauer im Dativ, passend zu "seit …": formatDuration(90_000) → "1 Minute und 30 Sekunden".
 * Sekunden werden nur angezeigt, wenn die Dauer unter einer Minute liegt (oder seconds: true).
 */
export function formatDuration(ms, { maxParts = 3, seconds = false } = {}) {
    let rest = Math.max(0, Math.floor(ms / 1000));
    const showSeconds = seconds || rest < 60;
    const parts = [];
    for (const [size, one, many] of UNITS) {
        if (size === 1 && !showSeconds) break;
        const n = Math.floor(rest / size);
        if (n > 0) {
            parts.push(`${n} ${n === 1 ? one : many}`);
            rest -= n * size;
        }
        if (parts.length === maxParts) break;
    }
    if (parts.length === 0) return '0 Sekunden';
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
}

export function formatDate(date) {
    return new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "@Name" → "name" */
export function cleanLogin(value) {
    return String(value ?? '')
        .trim()
        .replace(/^@/, '')
        .toLowerCase();
}

export function subTierName(plan) {
    if (plan === 'Prime') return 'Prime';
    if (plan === '2000') return 'Tier 2';
    if (plan === '3000') return 'Tier 3';
    return 'Tier 1';
}
