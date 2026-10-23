import Link from 'next/link';
import { ArrowRight, Eye, FolderTree, Globe2, Link2, Lock, ShieldCheck, Sparkles, Trash2, UploadCloud, Wallet } from 'lucide-react';
import { DashboardPreview } from '@/components/marketing/dashboard-preview';
import { Faq } from '@/components/marketing/faq';
import { MarketingPricing } from '@/components/pricing/plan-cards';
import { formatMoney } from '@/lib/format';
import { getPlan } from '@/lib/plans';

const FEATURES = [
    {
        icon: UploadCloud,
        title: 'Hochladen per Drag & Drop',
        text: 'Zieh Dateien einfach ins Browserfenster. Auch riesige Dateien bis 5 TB – sie werden automatisch in Teilen übertragen.'
    },
    { icon: FolderTree, title: 'Ordner & Suche', text: 'Organisiere alles in Ordnern, verschiebe Dateien mit einem Klick und finde jede Datei in Sekunden wieder.' },
    { icon: Link2, title: 'Teilen per Link', text: 'Erstelle einen Freigabelink und schick ihn an wen du willst – optional mit Passwort und Ablaufdatum.' },
    { icon: Eye, title: 'Vorschau im Browser', text: 'Fotos, Videos, Musik und PDFs direkt ansehen, ohne sie vorher herunterzuladen.' },
    { icon: Trash2, title: '30 Tage Papierkorb', text: 'Aus Versehen gelöscht? Kein Problem. Gelöschte Dateien kannst du 30 Tage lang wiederherstellen.' },
    { icon: Wallet, title: 'Transparente Preise', text: 'Keine versteckten Kosten, keine Lockvogel-Angebote. Monatlich kündbar oder jährlich mit Rabatt.' }
];

const STEPS = [
    { title: 'Konto erstellen', text: 'In 30 Sekunden registriert – 10 GB sind gratis, ganz ohne Kreditkarte.' },
    { title: 'Dateien hochladen', text: 'Per Drag & Drop oder Dateiauswahl. Der Upload läuft verschlüsselt direkt in den Speicher bei OVHcloud.' },
    { title: 'Überall zugreifen', text: 'Öffne deine Dateien auf jedem Gerät im Browser und teile sie mit Familie, Freunden oder Kunden.' }
];

export default function HomePage() {
    const plus = getPlan('plus');
    return (
        <>
            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
                <div className="container-page pb-16 pt-16 text-center sm:pt-24">
                    <Link
                        href="/preise"
                        className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-800 transition hover:bg-brand-100"
                    >
                        <Sparkles className="h-4 w-4" />1 TB für {formatMoney(plus.priceMonthly)} im Monat
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                    <h1 className="mx-auto mt-8 max-w-4xl text-4xl font-bold tracking-tight text-ink-950 sm:text-6xl">
                        Dein Cloud-Speicher. <span className="text-brand-600">Sicher, einfach</span> und fair bepreist.
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-ink-600">
                        TrueCloud bewahrt deine Fotos, Videos und Dokumente sicher in europäischen Rechenzentren auf. Hochladen, organisieren und teilen –
                        direkt im Browser.
                    </p>
                    <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                        <Link href="/registrieren" className="btn btn-primary btn-lg">
                            10 GB gratis sichern
                            <ArrowRight className="h-5 w-5" />
                        </Link>
                        <Link href="/preise" className="btn btn-secondary btn-lg">
                            Preise ansehen
                        </Link>
                    </div>
                    <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-ink-600">
                        <span className="flex items-center gap-2">
                            <Globe2 className="h-4 w-4 text-brand-600" /> Server in Europa
                        </span>
                        <span className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-brand-600" /> Verschlüsselte Übertragung
                        </span>
                        <span className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-brand-600" /> Monatlich kündbar
                        </span>
                    </div>
                </div>
                <div className="container-page pb-20">
                    <DashboardPreview />
                </div>
            </section>

            {/* Kennzahlen */}
            <section className="border-y border-ink-100 bg-ink-50/60">
                <div className="container-page grid grid-cols-2 gap-8 py-12 text-center md:grid-cols-4">
                    {[
                        { value: '10 GB', label: 'kostenlos zum Start' },
                        { value: formatMoney(getPlan('start').priceMonthly), label: 'für 200 GB im Monat' },
                        { value: '5 TB', label: 'maximale Dateigrösse' },
                        { value: '30 Tage', label: 'Papierkorb inklusive' }
                    ].map((stat) => (
                        <div key={stat.label}>
                            <div className="text-3xl font-bold tracking-tight text-ink-950">{stat.value}</div>
                            <div className="mt-1 text-sm text-ink-600">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Funktionen */}
            <section id="funktionen" className="scroll-mt-20 py-24">
                <div className="container-page">
                    <div className="mx-auto max-w-2xl text-center">
                        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Funktionen</p>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">Alles, was ein Cloud-Speicher braucht</h2>
                        <p className="mt-4 text-lg text-ink-600">Ohne Schnickschnack – dafür schnell, übersichtlich und zuverlässig.</p>
                    </div>
                    <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="card p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                                    <f.icon className="h-5 w-5" />
                                </div>
                                <h3 className="mt-5 font-semibold text-ink-950">{f.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-ink-600">{f.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* So funktioniert's */}
            <section className="bg-ink-50/60 py-24">
                <div className="container-page">
                    <h2 className="text-center text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">In drei Schritten startklar</h2>
                    <div className="mt-14 grid gap-8 md:grid-cols-3">
                        {STEPS.map((step, i) => (
                            <div key={step.title} className="relative">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</div>
                                <h3 className="mt-5 text-lg font-semibold text-ink-950">{step.title}</h3>
                                <p className="mt-2 leading-7 text-ink-600">{step.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Sicherheit */}
            <section className="relative overflow-hidden bg-ink-950 py-24 text-white">
                <div className="bg-grid-dark absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
                <div className="container-page relative grid items-center gap-12 lg:grid-cols-2">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">Sicherheit</p>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Deine Daten gehören dir. Punkt.</h2>
                        <p className="mt-4 text-lg leading-8 text-ink-300">
                            Wir verdienen unser Geld mit Speicherplatz – nicht mit deinen Daten. Keine Werbung, kein Verkauf von Daten, keine Auswertung deiner
                            Dateien.
                        </p>
                        <Link href="/sicherheit" className="btn btn-light mt-8">
                            Mehr zur Sicherheit <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {[
                            { icon: Globe2, title: 'Rechenzentren in Europa', text: 'Gespeichert bei OVHcloud, einem europäischen Cloud-Anbieter.' },
                            { icon: Lock, title: 'TLS-Verschlüsselung', text: 'Alle Übertragungen laufen verschlüsselt über HTTPS.' },
                            { icon: ShieldCheck, title: 'Private Links', text: 'Downloads nur über zeitlich begrenzte, signierte Links.' },
                            { icon: Wallet, title: 'Sichere Zahlung', text: 'Zahlungsdaten verarbeitet ausschliesslich Stripe.' }
                        ].map((item) => (
                            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                                <item.icon className="h-5 w-5 text-brand-300" />
                                <h3 className="mt-3 font-semibold">{item.title}</h3>
                                <p className="mt-1 text-sm leading-6 text-ink-300">{item.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Preise */}
            <section id="preise" className="scroll-mt-20 py-24">
                <div className="container-page">
                    <div className="mx-auto max-w-2xl text-center">
                        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Preise</p>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">Mehr Speicher, weniger bezahlen</h2>
                        <p className="mt-4 text-lg text-ink-600">Je grösser der Tarif, desto günstiger das Terabyte. Jährlich zahlen und bis zu zwei Monate sparen.</p>
                    </div>
                    <div className="mt-12">
                        <MarketingPricing />
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="scroll-mt-20 bg-ink-50/60 py-24">
                <div className="container-page max-w-3xl">
                    <h2 className="text-center text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">Häufige Fragen</h2>
                    <div className="mt-12">
                        <Faq />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-24">
                <div className="container-page">
                    <div className="relative overflow-hidden rounded-3xl bg-brand-600 px-6 py-16 text-center text-white sm:px-16">
                        <div className="bg-grid-dark absolute inset-0 opacity-60" />
                        <div className="relative">
                            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Bereit für mehr Platz?</h2>
                            <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100">Starte kostenlos mit 10 GB und upgrade, wenn du mehr brauchst.</p>
                            <Link href="/registrieren" className="btn btn-light btn-lg mt-8">
                                Jetzt kostenlos starten <ArrowRight className="h-5 w-5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
