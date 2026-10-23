'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type Toast = { id: number; kind: 'success' | 'error'; message: string };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
    const push = useCallback(
        (kind: Toast['kind'], message: string) => {
            const id = Date.now() + Math.random();
            setToasts((list) => [...list.slice(-3), { id, kind, message }]);
            setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
        },
        [dismiss]
    );
    const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m) }), [push]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={clsx(
                            'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg',
                            t.kind === 'success' ? 'border-emerald-200' : 'border-red-200'
                        )}
                    >
                        {t.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />}
                        <p className="flex-1 text-ink-800">{t.message}</p>
                        <button type="button" onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-700" aria-label="Schliessen">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastApi {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast muss innerhalb von ToastProvider verwendet werden');
    return ctx;
}
