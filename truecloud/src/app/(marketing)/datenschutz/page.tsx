import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Datenschutzerklärung' };

export default function PrivacyPage() {
    return (
        <LegalPage title="Datenschutzerklärung" updated="Oktober 2026">
            <p>
                Diese Datenschutzerklärung informiert darüber, wie TrueCloud (truecloud.online) Personendaten bearbeitet. Sie richtet sich nach dem
                schweizerischen Datenschutzgesetz (DSG) und, soweit anwendbar, nach der Datenschutz-Grundverordnung der EU (DSGVO).
            </p>

            <h2>1. Verantwortlicher</h2>
            <p>
                {COMPANY.name}, {COMPANY.street}, {COMPANY.city}, {COMPANY.country}
                <br />
                E-Mail: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            </p>

            <h2>2. Welche Daten wir bearbeiten</h2>
            <ul>
                <li>
                    <strong>Kontodaten:</strong> E-Mail-Adresse, Name (freiwillig), Passwort (nur als Hash gespeichert), Tarif und Speicherverbrauch.
                </li>
                <li>
                    <strong>Inhalte:</strong> Die Dateien, die du hochlädst, sowie deren Namen, Grösse, Typ und Ordnerstruktur.
                </li>
                <li>
                    <strong>Zahlungsdaten:</strong> Abo-Status, Rechnungen und Rechnungsadresse. Kartendaten werden ausschliesslich von Stripe bearbeitet.
                </li>
                <li>
                    <strong>Technische Daten:</strong> IP-Adresse, Browser-Kennung und Zeitpunkt der Anmeldung (für die Sitzungsverwaltung und zur Abwehr
                    von Missbrauch).
                </li>
            </ul>

            <h2>3. Zweck der Bearbeitung</h2>
            <p>
                Wir bearbeiten die Daten, um dir den Cloud-Speicher bereitzustellen, Abos abzurechnen, dich über dein Konto zu informieren (z. B.
                Passwort-Zurücksetzung, Zahlungsprobleme) und die Sicherheit des Dienstes zu gewährleisten. Wir werten den Inhalt deiner Dateien nicht aus,
                zeigen keine Werbung und verkaufen keine Daten.
            </p>

            <h2>4. Auftragsbearbeiter</h2>
            <ul>
                <li>
                    <strong>OVHcloud</strong> (OVH SAS, Roubaix, Frankreich) – Speicherung der Dateien im Object Storage in europäischen Rechenzentren sowie
                    Hosting.
                </li>
                <li>
                    <strong>Stripe</strong> (Stripe Payments Europe Ltd., Dublin, Irland) – Zahlungsabwicklung und Rechnungsstellung. Stripe kann Daten auch
                    in den USA bearbeiten; dafür bestehen geeignete Garantien (u. a. Standardvertragsklauseln).
                </li>
                <li>
                    <strong>[E-Mail-Anbieter]</strong> – Versand von System-E-Mails.
                </li>
            </ul>

            <h2>5. Cookies</h2>
            <p>
                Wir verwenden ein einziges, technisch notwendiges Cookie (<code>tc_session</code>), um dich nach der Anmeldung angemeldet zu halten. Es werden
                keine Tracking- oder Werbe-Cookies eingesetzt.
            </p>

            <h2>6. Aufbewahrung und Löschung</h2>
            <p>
                Dateien im Papierkorb werden nach 30 Tagen endgültig gelöscht. Wenn du dein Konto löschst, entfernen wir alle Dateien und Kontodaten.
                Rechnungsdaten bewahren wir so lange auf, wie es gesetzliche Aufbewahrungspflichten verlangen (in der Schweiz in der Regel 10 Jahre).
            </p>

            <h2>7. Deine Rechte</h2>
            <p>
                Du hast das Recht auf Auskunft, Berichtigung, Löschung und Herausgabe deiner Daten sowie – soweit die DSGVO anwendbar ist – auf
                Einschränkung der Bearbeitung und Widerspruch. Wende dich dazu an <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. Du kannst dich
                zudem beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) oder einer zuständigen Aufsichtsbehörde beschweren.
            </p>

            <h2>8. Änderungen</h2>
            <p>Wir können diese Datenschutzerklärung anpassen. Es gilt die jeweils auf dieser Seite veröffentlichte Fassung.</p>
        </LegalPage>
    );
}
