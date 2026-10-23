// Tarife von TrueCloud.
//
// Kalkulationsbasis: OVHcloud Object Storage kostet uns 7.50 pro TB und Monat.
// Die Preise sind so gewählt, dass jeder Tarif auch dann noch Gewinn abwirft, wenn
// ein Kunde sein Kontingent zu 100 % ausnutzt UND die Mehrwertsteuer (8.1 %) sowie
// die Stripe-Gebühren abgezogen werden. In der Praxis nutzen Kunden im Schnitt nur
// einen Bruchteil ihres Kontingents, die tatsächliche Marge ist also höher.
// Die Live-Kalkulation steht im Admin-Bereich unter /admin.

export const CURRENCY = 'CHF';
export const STRIPE_CURRENCY = 'chf';

/** Eigene Speicherkosten pro TB und Monat (OVHcloud). */
export const STORAGE_COST_PER_TB_MONTH = 7.5;

/** Annahmen für die Margenrechnung – bei Bedarf anpassen. */
export const VAT_RATE = 0.081;
export const STRIPE_FEE_PERCENT = 0.0325;
export const STRIPE_FEE_FIXED = 0.3;

export const GB = 1_000_000_000;
export const TB = 1000 * GB;

export type PlanId = 'free' | 'start' | 'plus' | 'pro' | 'max';
export type BillingInterval = 'month' | 'year';

export interface Plan {
    id: PlanId;
    name: string;
    storageGB: number;
    priceMonthly: number;
    priceYearly: number;
    tagline: string;
    features: string[];
    highlight?: boolean;
}

export const PLANS: Plan[] = [
    {
        id: 'free',
        name: 'Free',
        storageGB: 10,
        priceMonthly: 0,
        priceYearly: 0,
        tagline: 'Zum Ausprobieren',
        features: ['10 GB Speicher', 'Web-Dashboard mit Vorschau', 'Freigabelinks', '30 Tage Papierkorb']
    },
    {
        id: 'start',
        name: 'Start',
        storageGB: 200,
        priceMonthly: 2.9,
        priceYearly: 29,
        tagline: 'Für Fotos & Dokumente',
        features: ['200 GB Speicher', 'Alles aus Free', 'Passwortschutz für Freigaben', 'Ablaufdatum für Links', 'E-Mail-Support']
    },
    {
        id: 'plus',
        name: 'Plus',
        storageGB: 1000,
        priceMonthly: 12.9,
        priceYearly: 129,
        tagline: 'Der Allrounder',
        highlight: true,
        features: ['1 TB Speicher', 'Alles aus Start', 'Bevorzugter Support']
    },
    {
        id: 'pro',
        name: 'Pro',
        storageGB: 2000,
        priceMonthly: 22.9,
        priceYearly: 239,
        tagline: 'Für Kreative & Familien',
        features: ['2 TB Speicher', 'Alles aus Plus']
    },
    {
        id: 'max',
        name: 'Max',
        storageGB: 5000,
        priceMonthly: 54.9,
        priceYearly: 579,
        tagline: 'Für grosse Datenmengen',
        features: ['5 TB Speicher', 'Alles aus Pro']
    }
];

/** Passwortschutz und Ablaufdatum für Freigaben gibt es ab dem Start-Tarif. */
export function canProtectShares(planId: string): boolean {
    return getPlan(planId).priceMonthly > 0;
}

export const PAID_PLANS = PLANS.filter((p) => p.priceMonthly > 0);

export function getPlan(id: string | null | undefined): Plan {
    return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function isPlanId(id: string): id is PlanId {
    return PLANS.some((p) => p.id === id);
}

export function quotaBytesFor(planId: string): bigint {
    return BigInt(getPlan(planId).storageGB) * BigInt(GB);
}

export function priceFor(plan: Plan, interval: BillingInterval): number {
    return interval === 'year' ? plan.priceYearly : plan.priceMonthly;
}

/** Monatlicher Preis bei jährlicher Zahlung. */
export function effectiveMonthly(plan: Plan, interval: BillingInterval): number {
    return interval === 'year' ? plan.priceYearly / 12 : plan.priceMonthly;
}

export function yearlySavingsPercent(plan: Plan): number {
    if (!plan.priceMonthly) return 0;
    return Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100);
}

// Stripe-Preise werden über lookup_keys gefunden, z. B. "truecloud_plus_month".
export function lookupKey(planId: PlanId, interval: BillingInterval): string {
    return `truecloud_${planId}_${interval}`;
}

export function parseLookupKey(key: string | null | undefined): { planId: PlanId; interval: BillingInterval } | null {
    const match = /^truecloud_([a-z]+)_(month|year)$/.exec(key ?? '');
    if (!match || !isPlanId(match[1])) return null;
    return { planId: match[1], interval: match[2] as BillingInterval };
}

export interface Margin {
    price: number;
    netOfVat: number;
    stripeFee: number;
    storageCost: number;
    profit: number;
    marginPercent: number;
}

/** Rechnet die Marge pro Monat im ungünstigsten Fall (Kontingent zu 100 % belegt). */
export function monthlyMargin(plan: Plan, interval: BillingInterval, opts: { includeVat?: boolean } = {}): Margin {
    const includeVat = opts.includeVat ?? true;
    const months = interval === 'year' ? 12 : 1;
    const price = priceFor(plan, interval);
    const netOfVat = includeVat ? price / (1 + VAT_RATE) : price;
    const stripeFee = price > 0 ? price * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED : 0;
    const storageCost = (plan.storageGB / 1000) * STORAGE_COST_PER_TB_MONTH * months;
    const profit = netOfVat - stripeFee - storageCost;
    return {
        price: price / months,
        netOfVat: netOfVat / months,
        stripeFee: stripeFee / months,
        storageCost: storageCost / months,
        profit: profit / months,
        marginPercent: netOfVat > 0 ? (profit / netOfVat) * 100 : 0
    };
}

/** Eigene Kosten für tatsächlich belegten Speicher (OVHcloud rechnet nach Belegung ab). */
export function storageCostForBytes(bytes: number): number {
    return (bytes / TB) * STORAGE_COST_PER_TB_MONTH;
}
