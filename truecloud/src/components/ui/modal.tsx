'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

export function Modal({
    open,
    onClose,
    title,
    children,
    footer,
    size = 'md'
}: {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCloseRef.current();
        };
        document.addEventListener('keydown', onKey);
        const previous = document.activeElement as HTMLElement | null;
        const first = panelRef.current?.querySelector<HTMLElement>('input, textarea, select, button[data-autofocus]');
        first?.focus();
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
            previous?.focus?.();
        };
    }, [open]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]" onClick={onClose} />
            <div
                ref={panelRef}
                className={clsx(
                    'relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
                    { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl', xl: 'sm:max-w-5xl' }[size]
                )}
            >
                {title && (
                    <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
                        <h2 className="min-w-0 break-words text-lg font-semibold text-ink-950">{title}</h2>
                        <button type="button" onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Schliessen">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                )}
                <div className="px-6 py-5">{children}</div>
                {footer && <div className="flex flex-col-reverse gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
            </div>
        </div>
    );
}
