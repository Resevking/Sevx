import { describe, expect, it } from 'vitest';
import { PAID_PLANS, PLANS, getPlan, lookupKey, monthlyMargin, parseLookupKey, quotaBytesFor, storageCostForBytes, TB } from '../src/lib/plans';

describe('Tarife', () => {
    it('jeder bezahlte Tarif ist auch bei voller Belegung inkl. MWST und Stripe profitabel', () => {
        for (const plan of PAID_PLANS) {
            for (const interval of ['month', 'year'] as const) {
                const m = monthlyMargin(plan, interval);
                expect(m.profit, `${plan.id}/${interval}`).toBeGreaterThan(0);
            }
        }
    });

    it('grössere Tarife sind pro TB günstiger', () => {
        const perTb = PAID_PLANS.map((p) => p.priceMonthly / (p.storageGB / 1000));
        for (let i = 1; i < perTb.length; i++) expect(perTb[i]).toBeLessThan(perTb[i - 1]);
    });

    it('Jahresabos sind günstiger als 12 Monatsabos', () => {
        for (const plan of PAID_PLANS) expect(plan.priceYearly).toBeLessThan(plan.priceMonthly * 12);
    });

    it('lookup_keys lassen sich hin und zurück übersetzen', () => {
        for (const plan of PAID_PLANS) {
            expect(parseLookupKey(lookupKey(plan.id, 'year'))).toEqual({ planId: plan.id, interval: 'year' });
        }
        expect(parseLookupKey('truecloud_gold_month')).toBeNull();
        expect(parseLookupKey(null)).toBeNull();
    });

    it('Kontingente und Kosten', () => {
        expect(quotaBytesFor('plus')).toBe(BigInt(TB));
        expect(quotaBytesFor('unbekannt')).toBe(quotaBytesFor('free'));
        expect(storageCostForBytes(TB)).toBeCloseTo(7.5);
        expect(getPlan('max').storageGB).toBe(5000);
        expect(PLANS[0].priceMonthly).toBe(0);
    });
});

describe('Mindestmarge', () => {
    it('jeder Tarif behält auch im ungünstigsten Fall mindestens 10 % Marge', () => {
        for (const plan of PAID_PLANS) {
            for (const interval of ['month', 'year'] as const) {
                expect(monthlyMargin(plan, interval).marginPercent, `${plan.id}/${interval}`).toBeGreaterThanOrEqual(10);
            }
        }
    });
});
