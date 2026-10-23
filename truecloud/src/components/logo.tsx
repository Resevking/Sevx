import Link from 'next/link';
import clsx from 'clsx';

export function LogoMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 64 64" aria-hidden="true" className={clsx('h-8 w-8 shrink-0', className)}>
            <rect width="64" height="64" rx="14" fill="#1b53f5" />
            <path d="M20.5 44h23a9.5 9.5 0 0 0 1.6-18.86A13 13 0 0 0 20 28.2 8 8 0 0 0 20.5 44Z" fill="#fff" />
            <path d="m26.5 35 4 4 8-8.5" fill="none" stroke="#1b53f5" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function Logo({ href = '/', dark = false, className }: { href?: string; dark?: boolean; className?: string }) {
    return (
        <Link href={href} className={clsx('flex items-center gap-2.5', className)} aria-label="TrueCloud Startseite">
            <LogoMark />
            <span className={clsx('text-lg font-bold tracking-tight', dark ? 'text-white' : 'text-ink-950')}>
                True<span className="text-brand-600">Cloud</span>
            </span>
        </Link>
    );
}
