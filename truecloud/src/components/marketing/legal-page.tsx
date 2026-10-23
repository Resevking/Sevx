import { AlertTriangle } from 'lucide-react';
import { COMPANY_HAS_PLACEHOLDERS } from '@/lib/company';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
    return (
        <section className="py-16 sm:py-20">
            <div className="container-page max-w-3xl">
                {COMPANY_HAS_PLACEHOLDERS && (
                    <div className="mb-10 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <p>
                            Vorlage: Bitte die Betreiberangaben in <code className="font-mono">src/lib/company.ts</code> ausfüllen und den Text vor dem Livegang
                            rechtlich prüfen lassen.
                        </p>
                    </div>
                )}
                <h1 className="text-4xl font-bold tracking-tight text-ink-950">{title}</h1>
                <p className="mt-3 text-sm text-ink-500">Stand: {updated}</p>
                <div className="prose-legal mt-8">{children}</div>
            </div>
        </section>
    );
}
