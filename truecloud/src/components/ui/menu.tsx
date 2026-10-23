'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';

export type MenuItem = { label: string; icon?: React.ComponentType<{ className?: string }>; onClick: () => void; danger?: boolean; hidden?: boolean };

/** Kleines Aktionsmenü (drei Punkte). */
export function ActionMenu({ items, label = 'Aktionen' }: { items: MenuItem[]; label?: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(!open);
                }}
                className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-ink-100 bg-white py-1 shadow-xl">
                    {items
                        .filter((i) => !i.hidden)
                        .map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setOpen(false);
                                    item.onClick();
                                }}
                                className={clsx(
                                    'flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm',
                                    item.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-700 hover:bg-ink-50'
                                )}
                            >
                                {item.icon && <item.icon className="h-4 w-4" />}
                                {item.label}
                            </button>
                        ))}
                </div>
            )}
        </div>
    );
}
