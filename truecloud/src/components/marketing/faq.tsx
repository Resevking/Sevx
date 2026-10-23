import { ChevronDown } from 'lucide-react';

export const FAQ_ITEMS = [
    {
        q: 'Wo werden meine Dateien gespeichert?',
        a: 'Deine Dateien liegen im Object Storage von OVHcloud in europäischen Rechenzentren. OVHcloud ist ein europäischer Anbieter und speichert die Daten redundant, damit sie auch bei einem Hardware-Ausfall erhalten bleiben.'
    },
    {
        q: 'Kann ich jederzeit kündigen?',
        a: 'Ja. Monatsabos sind jederzeit auf Ende der laufenden Periode kündbar, Jahresabos auf Ende des Abrechnungsjahres. Die Kündigung erledigst du mit zwei Klicks im Dashboard.'
    },
    {
        q: 'Was passiert mit meinen Daten, wenn ich kündige?',
        a: 'Dein Konto wechselt auf den kostenlosen Tarif. Deine Dateien bleiben erhalten und du kannst sie weiterhin herunterladen. Neue Uploads sind möglich, sobald du wieder unter dem Kontingent liegst.'
    },
    {
        q: 'Wie bezahle ich?',
        a: 'Die Zahlung läuft sicher über Stripe – mit Kredit- oder Debitkarte, Apple Pay, Google Pay und weiteren Zahlungsmethoden. Deine Kartendaten landen nie auf unseren Servern.'
    },
    {
        q: 'Kann ich den Tarif wechseln?',
        a: 'Jederzeit. Bei einem Upgrade wird die Differenz anteilig verrechnet und der zusätzliche Speicher steht sofort zur Verfügung. Bei einem Downgrade erhältst du eine Gutschrift auf die nächste Rechnung.'
    },
    {
        q: 'Gibt es eine Begrenzung für die Dateigrösse?',
        a: 'Einzelne Dateien dürfen bis zu 5 TB gross sein, solange sie in dein Kontingent passen. Grosse Dateien werden automatisch in Teilen hochgeladen.'
    },
    {
        q: 'Kann ich Dateien mit anderen teilen?',
        a: 'Ja, mit einem Freigabelink. Ab dem Start-Tarif kannst du Links zusätzlich mit einem Passwort schützen und ein Ablaufdatum setzen.'
    }
];

export function Faq() {
    return (
        <div className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white shadow-card">
            {FAQ_ITEMS.map((item) => (
                <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-950">
                        {item.q}
                        <ChevronDown className="h-5 w-5 shrink-0 text-ink-400 transition group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 leading-7 text-ink-600">{item.a}</p>
                </details>
            ))}
        </div>
    );
}
