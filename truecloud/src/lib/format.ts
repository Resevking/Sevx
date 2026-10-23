import { CURRENCY } from './plans';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Dezimale Einheiten (1 GB = 1000 MB), so wie Speicherkontingente verkauft werden. */
export function formatBytes(input: number | bigint, digits = 1): string {
    let value = Number(input);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    let unit = 0;
    while (value >= 1000 && unit < UNITS.length - 1) {
        value /= 1000;
        unit++;
    }
    const fixed = unit === 0 ? value.toFixed(0) : value.toFixed(value >= 100 ? 0 : digits);
    return `${fixed.replace(/\.0+$/, '')} ${UNITS[unit]}`;
}

export function formatStorageGB(gb: number): string {
    return gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`;
}

export function formatMoney(amount: number, opts: { currency?: string; minimumFractionDigits?: number } = {}): string {
    if (Math.abs(amount) < 0.005) amount = 0; // kein "CHF -0.00"
    const currency = (opts.currency ?? CURRENCY).toUpperCase();
    return new Intl.NumberFormat('de-CH', {
        style: 'currency',
        currency,
        minimumFractionDigits: opts.minimumFractionDigits ?? 2,
        maximumFractionDigits: 2
    }).format(amount);
}

export function formatDate(date: Date | string | number | null | undefined): string {
    if (!date) return '–';
    return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date));
}

export function formatDateTime(date: Date | string | number | null | undefined): string {
    if (!date) return '–';
    return new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
        new Date(date)
    );
}

export function percent(used: number | bigint, total: number | bigint): number {
    const t = Number(total);
    if (t <= 0) return 0;
    return Math.min(100, (Number(used) / t) * 100);
}
