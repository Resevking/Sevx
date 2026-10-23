import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Impressum' };

export default function ImprintPage() {
    return (
        <LegalPage title="Impressum" updated="Oktober 2026">
            <h2>Betreiber</h2>
            <p>
                {COMPANY.name}
                <br />
                {COMPANY.street}
                <br />
                {COMPANY.city}
                <br />
                {COMPANY.country}
            </p>
            <h2>Kontakt</h2>
            <p>
                E-Mail: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
                <br />
                Telefon: {COMPANY.phone}
            </p>
            <h2>Vertretungsberechtigte Person</h2>
            <p>{COMPANY.representative}</p>
            <h2>Unternehmens-Identifikationsnummer</h2>
            <p>{COMPANY.uid}</p>
            <h2>Haftungsausschluss</h2>
            <p>
                Wir prüfen die Inhalte dieser Website sorgfältig, übernehmen jedoch keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität. Für Inhalte
                verlinkter externer Websites sind ausschliesslich deren Betreiber verantwortlich.
            </p>
            <h2>Urheberrecht</h2>
            <p>Die Inhalte und Werke auf dieser Website unterliegen dem Urheberrecht. Jede Verwendung ausserhalb der Grenzen des Urheberrechts bedarf unserer Zustimmung.</p>
        </LegalPage>
    );
}
