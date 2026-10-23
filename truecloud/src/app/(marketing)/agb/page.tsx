import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Allgemeine Geschäftsbedingungen' };

export default function TermsPage() {
    return (
        <LegalPage title="Allgemeine Geschäftsbedingungen" updated="Oktober 2026">
            <h2>1. Geltungsbereich</h2>
            <p>
                Diese AGB regeln die Nutzung des Cloud-Speicherdienstes TrueCloud (truecloud.online), betrieben von {COMPANY.name} (nachfolgend «wir»).
                Mit der Registrierung akzeptierst du diese AGB.
            </p>

            <h2>2. Leistungen</h2>
            <p>
                Wir stellen dir Speicherplatz im Umfang deines Tarifs zur Verfügung, über den du Dateien hochladen, verwalten, herunterladen und teilen
                kannst. Die Dateien werden bei OVHcloud in europäischen Rechenzentren gespeichert. Wir bemühen uns um eine hohe Verfügbarkeit, können eine
                ununterbrochene Erreichbarkeit aber nicht garantieren. Für wichtige Daten empfehlen wir zusätzliche Sicherungskopien.
            </p>

            <h2>3. Konto</h2>
            <p>
                Du bist für die Geheimhaltung deines Passworts verantwortlich. Pro Person ist ein kostenloses Konto zulässig. Wir dürfen Konten sperren,
                die gegen diese AGB verstossen.
            </p>

            <h2>4. Tarife, Preise und Zahlung</h2>
            <p>
                Die aktuellen Tarife und Preise findest du auf der <Link href="/preise">Preisseite</Link>. Bezahlte Tarife werden im Voraus monatlich oder
                jährlich über Stripe abgerechnet und verlängern sich automatisch um die gewählte Laufzeit, sofern sie nicht gekündigt werden. Bei einem
                Tarifwechsel wird anteilig verrechnet. Schlägt eine Zahlung fehl, können wir das Konto nach erfolgloser Mahnung auf den kostenlosen Tarif
                zurückstufen.
            </p>

            <h2>5. Kündigung</h2>
            <p>
                Du kannst dein Abo jederzeit im Dashboard auf Ende der laufenden Abrechnungsperiode kündigen. Bereits bezahlte Perioden werden nicht
                zurückerstattet. Nach Ablauf wechselt dein Konto auf den kostenlosen Tarif. Übersteigen deine Daten das kostenlose Kontingent, kannst du
                sie weiterhin herunterladen, aber keine neuen Dateien hochladen. Wir behalten uns vor, Daten von Konten, die das Kontingent länger als 90
                Tage überschreiten, nach vorheriger Ankündigung per E-Mail zu löschen.
            </p>

            <h2>6. Zulässige Nutzung</h2>
            <p>Du bist für die Inhalte, die du speicherst und teilst, selbst verantwortlich. Insbesondere untersagt sind:</p>
            <ul>
                <li>rechtswidrige Inhalte sowie Inhalte, die Rechte Dritter verletzen (z. B. Urheberrechte),</li>
                <li>Schadsoftware, Phishing oder die Verbreitung von Spam,</li>
                <li>die Nutzung als öffentlicher Datei-Hoster für massenhafte Verbreitung,</li>
                <li>Versuche, die Sicherheit oder Stabilität des Dienstes zu beeinträchtigen.</li>
            </ul>
            <p>Bei Verstössen können wir Freigaben deaktivieren, Inhalte entfernen und das Konto sperren.</p>

            <h2>7. Haftung</h2>
            <p>
                Wir haften für Schäden nur bei Vorsatz oder grober Fahrlässigkeit, soweit gesetzlich zulässig. Die Haftung für Datenverlust ist auf den
                Aufwand beschränkt, der bei regelmässiger Datensicherung durch dich entstanden wäre.
            </p>

            <h2>8. Datenschutz</h2>
            <p>
                Wie wir mit deinen Daten umgehen, beschreibt die <Link href="/datenschutz">Datenschutzerklärung</Link>.
            </p>

            <h2>9. Änderungen der AGB</h2>
            <p>
                Wir können diese AGB anpassen. Über wesentliche Änderungen informieren wir dich mindestens 30 Tage im Voraus per E-Mail. Bist du nicht
                einverstanden, kannst du dein Abo auf den Zeitpunkt des Inkrafttretens kündigen.
            </p>

            <h2>10. Anwendbares Recht und Gerichtsstand</h2>
            <p>Es gilt schweizerisches Recht. Gerichtsstand ist {COMPANY.jurisdiction}, soweit nicht zwingende Bestimmungen etwas anderes vorsehen.</p>
        </LegalPage>
    );
}
