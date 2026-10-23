// Angaben zum Betreiber für Impressum, Datenschutzerklärung und AGB.
// BITTE VOR DEM LIVEGANG AUSFÜLLEN – solange Platzhalter in eckigen Klammern stehen,
// zeigen die Rechtsseiten einen Hinweis an.

export const COMPANY = {
    name: '[Firmenname oder Vor- und Nachname]',
    representative: '[Vertretungsberechtigte Person]',
    street: '[Strasse und Hausnummer]',
    city: '[PLZ Ort]',
    country: 'Schweiz',
    email: 'support@truecloud.online',
    phone: '[Telefonnummer, optional]',
    uid: '[UID, z. B. CHE-123.456.789 – falls vorhanden]',
    jurisdiction: '[Ort des Gerichtsstands]'
};

export const COMPANY_HAS_PLACEHOLDERS = Object.values(COMPANY).some((v) => v.startsWith('['));
