import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * State that is remembered in the browser (localStorage), so progress survives a reload.
 * Storage can be unavailable (private mode, blocked cookies), so every access is guarded.
 */
export function useStoredState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void, boolean] {
    const [value, setValue] = useState<T>(initial);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(key);
            if (raw !== null) {
                setValue(JSON.parse(raw));
            }
        } catch {
            // ignore unreadable storage
        }
        setLoaded(true);
    }, [key]);

    useEffect(() => {
        if (!loaded) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignore unwritable storage
        }
    }, [key, value, loaded]);

    return [value, setValue, loaded];
}

/** Accepts "name", "@name" or a full channel URL and returns the plain Twitch login name (or '' if invalid). */
export function normalizeUsername(raw: string): string {
    const cleaned = raw
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^(www\.)?twitch\.tv\//i, '')
        .replace(/^@/, '')
        .replace(/\/.*$/, '')
        .toLowerCase();
    return /^[a-z0-9_]{3,25}$/.test(cleaned) ? cleaned : '';
}

export function dashboardUrl(user: string, path: string): string {
    return user ? `https://dashboard.twitch.tv/u/${user}/${path}` : 'https://dashboard.twitch.tv/';
}

export function Code({ children }: { children: ReactNode }) {
    return <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{children}</code>;
}

export function Steps({ children }: { children: ReactNode }) {
    return <ol className="list-decimal space-y-1.5 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">{children}</ol>;
}

export function Bullets({ children }: { children: ReactNode }) {
    return <ul className="list-disc space-y-1.5 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">{children}</ul>;
}

export function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'success'; children: ReactNode }) {
    const styles = {
        info: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-100',
        warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
    }[tone];
    return <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${styles}`}>{children}</div>;
}

export function ExtLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:decoration-violet-700 dark:text-violet-300 dark:decoration-violet-700 dark:hover:decoration-violet-300 ${className}`}
        >
            {children}
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M6 3h7v7M13 3 4 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">(öffnet in neuem Tab)</span>
        </a>
    );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-violet-400 hover:text-violet-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-violet-500 dark:hover:text-violet-300"
        >
            {children}
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M6 3h7v7M13 3 4 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">(öffnet in neuem Tab)</span>
        </a>
    );
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(area);
            return ok;
        } catch {
            return false;
        }
    }
}

export function CopyButton({ text, label = 'Kopieren', small = false }: { text: string; label?: string; small?: boolean }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const timer = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => () => clearTimeout(timer.current), []);

    const onClick = async () => {
        const ok = await copyText(text);
        setState(ok ? 'copied' : 'failed');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), 1800);
    };

    const size = small ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white font-medium text-zinc-700 transition hover:border-violet-400 hover:text-violet-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-violet-500 dark:hover:text-violet-300 ${size}`}
        >
            <span aria-live="polite">{state === 'copied' ? 'Kopiert ✓' : state === 'failed' ? 'Nicht möglich' : label}</span>
        </button>
    );
}

export interface ChoiceOption<T extends string> {
    value: T;
    label: string;
    hint?: string;
}

export function Choice<T extends string>({
    legend,
    help,
    options,
    value,
    onChange,
    columns = 3
}: {
    legend: string;
    help?: ReactNode;
    options: ChoiceOption<T>[];
    value: T;
    onChange: (value: T) => void;
    columns?: 2 | 3;
}) {
    const grid = columns === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';
    return (
        <fieldset>
            <legend className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{legend}</legend>
            {help && <p className="-mt-1 mb-2 text-xs text-zinc-500 dark:text-zinc-400">{help}</p>}
            <div className={`grid gap-2 ${grid}`}>
                {options.map((opt) => {
                    const checked = opt.value === value;
                    return (
                        <label
                            key={opt.value}
                            className={`relative flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm transition focus-within:ring-2 focus-within:ring-violet-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-zinc-950 ${
                                checked
                                    ? 'border-violet-500 bg-violet-50 text-violet-900 dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-100'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700'
                            }`}
                        >
                            <input type="radio" className="sr-only" name={legend} value={opt.value} checked={checked} onChange={() => onChange(opt.value)} />
                            <span className="font-medium">{opt.label}</span>
                            {opt.hint && (
                                <span className={`text-xs ${checked ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                    {opt.hint}
                                </span>
                            )}
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}
