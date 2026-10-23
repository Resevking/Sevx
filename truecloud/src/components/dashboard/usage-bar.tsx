import clsx from 'clsx';
import { formatBytes, percent } from '@/lib/format';

export function UsageBar({ used, quota, className, compact = false }: { used: number; quota: number; className?: string; compact?: boolean }) {
    const pct = percent(used, quota);
    const over = used > quota;
    const color = over || pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-600';
    return (
        <div className={className}>
            <div
                className={clsx('overflow-hidden rounded-full bg-ink-200/70', compact ? 'h-1.5' : 'h-2.5')}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                aria-label="Speicherbelegung"
            >
                <div className={clsx('h-full rounded-full transition-[width]', color)} style={{ width: `${Math.max(pct, used > 0 ? 1 : 0)}%` }} />
            </div>
            <p className={clsx('text-ink-600', compact ? 'mt-2 text-xs' : 'mt-2.5 text-sm')}>
                <span className="font-semibold text-ink-900">{formatBytes(used)}</span> von {formatBytes(quota)} belegt
            </p>
        </div>
    );
}
