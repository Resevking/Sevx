import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard, Globe2, KeyRound, Link2, Lock, ServerCog, ShieldCheck, Trash2 } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Sicherheit',
    description: 'So schützt TrueCloud deine Daten: europäische Rechenzentren von OVHcloud, TLS-Verschlüsselung, signierte Download-Links und sichere Zahlungen über Stripe.'
};

const POINTS = [
    {
        icon: Globe2,
        title: 'Speicherung in Europa',
        text: 'Deine Dateien liegen im Object Storage von OVHcloud, einem europäischen Cloud-Anbieter mit eigenen Rechenzentren. Die Daten werden dort redundant gespeichert.'
    },
    {
        icon: Lock,
        title: 'Verschlüsselte Übertragung',
        text: 'Jede Verbindung – zur Website, zum Dashboard und beim Up- und Download – läuft verschlüsselt über HTTPS/TLS.'
    },
    {
        icon: Link2,
        title: 'Signierte, kurzlebige Links',
        text: 'Dateien sind nie öffentlich abrufbar. Downloads funktionieren nur über signierte Links, die nach kurzer Zeit automatisch ablaufen.'
    },
    {
        icon: KeyRound,
        title: 'Sichere Passwörter',
        text: 'Passwörter speichern wir ausschliesslich als bcrypt-Hash. Nach einem Passwortwechsel werden alle anderen Geräte abgemeldet.'
    },
    {
        icon: ShieldCheck,
        title: 'Strikte Trennung',
        text: 'Jede Datei ist fest einem Konto zugeordnet. Jeder Zugriff wird serverseitig geprüft – niemand sieht die Dateien anderer Nutzer.'
    },
    {
        icon: CreditCard,
        title: 'Zahlungen über Stripe',
        text: 'Kartendaten gibst du direkt bei Stripe ein, einem nach PCI DSS zertifizierten Zahlungsanbieter. Sie erreichen unsere Server nie.'
    },
    {
        icon: Trash2,
        title: 'Löschen heisst löschen',
        text: 'Wenn du eine Datei endgültig löschst oder dein Konto auflöst, entfernen wir die Daten auch aus dem Speicher bei OVHcloud.'
    },
    {
        icon: ServerCog,
        title: 'Keine Datenauswertung',
        text: 'Wir zeigen keine Werbung, verkaufen keine Daten und werten den Inhalt deiner Dateien nicht aus.'
    }
];

export default function SecurityPage() {
    return (
        <section className="py-20">
            <div className="container-page">
                <div className="mx-auto max-w-2xl text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-ink-950 sm:text-5xl">Sicherheit bei TrueCloud</h1>
                    <p className="mt-4 text-lg text-ink-600">Vertrauen ist die Grundlage für einen Cloud-Speicher. So schützen wir deine Daten.</p>
                </div>
                <div className="mt-16 grid gap-6 md:grid-cols-2">
                    {POINTS.map((p) => (
                        <div key={p.title} className="card flex gap-5 p-6">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                                <p.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-ink-950">{p.title}</h2>
                                <p className="mt-2 text-sm leading-6 text-ink-600">{p.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-12 text-center">
                    <Link href="/datenschutz" className="text-sm font-medium text-brand-700 hover:underline">
                        Zur Datenschutzerklärung →
                    </Link>
                </div>
            </div>
        </section>
    );
}
