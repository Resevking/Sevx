# TrueCloud – truecloud.online

Cloud-Speicher-Anbieter mit Website, Dashboard und Dateimanager. Die Dateien liegen im **OVHcloud Object Storage** (S3-kompatibel), die Abos laufen über **Stripe**.

## Was alles drin ist

**Öffentliche Website**
- Startseite, Preisseite mit Vergleichstabelle, Sicherheitsseite, FAQ
- Impressum, Datenschutzerklärung, AGB (Vorlagen – siehe [Vor dem Livegang](#vor-dem-livegang))
- Öffentliche Freigabeseite `/s/<token>` zum Herunterladen geteilter Dateien

**Konto**
- Registrierung, Login, Logout, «Passwort vergessen», E-Mail-Bestätigung
- Sitzungen mit sicherem httpOnly-Cookie, Übersicht der angemeldeten Geräte, alle anderen Geräte abmelden
- Passwort ändern, Konto löschen (beendet das Abo und löscht alle Dateien bei OVHcloud)

**Dashboard**
- Übersicht mit Speicherbelegung, Tarif und zuletzt hochgeladenen Dateien
- Dateimanager: Ordner, Upload per Drag & Drop (auch ganze Ordner), Listen- und Kachelansicht, Suche, Sortierung, Mehrfachauswahl, Umbenennen, Verschieben, Vorschau für Bilder, Videos, Audio und PDF
- Uploads laufen **direkt vom Browser zu OVHcloud** (vorsignierte URLs), grosse Dateien automatisch in Teilen (Multipart, bis 5 TB). Fortschrittsanzeige, Abbrechen, Uploads laufen beim Seitenwechsel weiter
- Freigabelinks, ab dem Start-Tarif mit Passwort und Ablaufdatum, Download-Zähler
- Papierkorb mit 30 Tagen Aufbewahrung, Wiederherstellen, endgültig löschen
- Abo & Zahlung: Tarif wählen (Stripe Checkout), Tarif wechseln mit anteiliger Verrechnung, Kundenportal (Zahlungsmethode, Rechnungen, Kündigung), Rechnungsliste
- Admin-Bereich `/dashboard/admin`: Benutzer, zahlende Kunden, Monatsumsatz, OVHcloud-Kosten, geschätzter Gewinn und Margenrechnung pro Tarif

**Sicherheit**
- Speicherkontingent wird serverseitig atomar reserviert. Nach jedem Upload prüft der Server die tatsächliche Grösse bei OVHcloud.
- Jede Datei ist einem Konto zugeordnet. Die Objekt-Keys sind zufällig, und jeder Zugriff wird geprüft.
- CSRF-Schutz (Origin-Prüfung), Rate-Limits für Login, Registrierung und Freigabe-Passwörter, bcrypt-Passwörter
- Downloads nur über kurzlebige signierte Links, Sicherheits-Header (HSTS, X-Frame-Options usw.)

## Tarife und Kalkulation

Grundlage: **OVHcloud kostet 7.50 pro TB und Monat.** Die Preise sind so gewählt, dass jeder Tarif auch im ungünstigsten Fall Gewinn macht. Ungünstigster Fall heisst: Kontingent zu 100 % belegt, 8.1 % MWST im Preis enthalten und Stripe-Gebühren von 3.25 % + CHF 0.30 abgezogen.

| Tarif | Speicher | Monatlich | Jährlich | Gewinn/Monat (Monatsabo, worst case) | Gewinn/Monat (Jahresabo, worst case) |
| ----- | -------- | --------- | -------- | ------------------------------------ | ------------------------------------ |
| Free  | 10 GB    | gratis    | gratis   | Kosten max. CHF 0.08                 | –                                    |
| Start | 200 GB   | 2.90      | 29.00    | 0.79 (29 %)                          | 0.63 (28 %)                          |
| Plus  | 1 TB     | 12.90     | 129.00   | 3.71 (31 %)                          | 2.07 (21 %)                          |
| Pro   | 2 TB     | 22.90     | 239.00   | 5.14 (24 %)                          | 2.75 (15 %)                          |
| Max   | 5 TB     | 54.90     | 579.00   | 11.20 (22 %)                         | 5.54 (12 %)                          |

In der Praxis nutzen Kunden nur einen Teil ihres Kontingents. OVHcloud rechnet nach tatsächlich belegtem Speicher ab, deshalb ist die echte Marge deutlich höher. Bist du (noch) nicht MWST-pflichtig (Umsatz unter CHF 100 000), steigt sie zusätzlich. Die Live-Zahlen stehen im Admin-Bereich.

Preise ändern: `src/lib/plans.ts` anpassen und `npm run stripe:setup` erneut ausführen. Bestehende Abos behalten ihren alten Preis.

## Lokal starten

Voraussetzungen: Node.js 22, Docker (für die Datenbank).

```bash
cd truecloud
npm install
cp .env.example .env               # ausfüllen (für lokal: APP_URL=http://localhost:3000)
docker run -d --name truecloud-db -p 5432:5432 \
  -e POSTGRES_USER=truecloud -e POSTGRES_PASSWORD=truecloud -e POSTGRES_DB=truecloud postgres:16-alpine
npx prisma migrate deploy
npm run dev                        # http://localhost:3000
```

Ohne `SMTP_HOST` werden E-Mails (Bestätigungs- und Reset-Links) ins Terminal geschrieben.

Tests: `npm test` (Unit-Tests), `npm run typecheck`, `npm run lint`. Den API-Ende-zu-Ende-Test (`npm run test:e2e`) und den Stripe-Sync-Test (`npm run test:stripe-sync`) nur gegen eine lokale Testumgebung laufen lassen. Die Voraussetzungen stehen jeweils im Kopf der Datei.

## 1. OVHcloud Object Storage einrichten

1. Im [OVHcloud Control Panel](https://www.ovh.com/manager/) ein **Public-Cloud-Projekt** anlegen (falls noch nicht vorhanden).
2. **Object Storage → Benutzer**: einen S3-Benutzer anlegen (Rolle «ObjectStore operator» oder Administrator). Den **Access Key** und den **Secret Key** notieren.
3. **Object Storage → Container erstellen**: Typ **Standard (S3-API)**, Region z. B. *GRA* (Gravelines), *SBG* (Strassburg) oder *DE* (Frankfurt), Name z. B. `truecloud-userdata`. Den Container **privat** lassen.
4. In den Details des Containers den **Endpoint** kopieren (z. B. `https://s3.gra.io.cloud.ovh.net`) und in die `.env` eintragen:
   ```
   S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
   S3_REGION=gra
   S3_BUCKET=truecloud-userdata
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   ```
5. `npm run ovh:setup` ausführen. Das Skript prüft den Zugriff und setzt CORS für Direkt-Uploads von `APP_URL`. Ausserdem legt es eine Regel an, die abgebrochene Uploads automatisch aufräumt, und macht einen Schreib- und Lesetest.

> **Egress:** Prüfe im OVHcloud-Preisblatt deiner Region, ob ausgehender Traffic (Downloads) separat kostet, und rechne das gegebenenfalls in die Tarife ein.

## 2. Stripe einrichten

1. Konto auf [stripe.com](https://dashboard.stripe.com) eröffnen und das Geschäftsprofil ausfüllen. Für den Start im **Testmodus** bleiben.
2. Unter *Entwickler → API-Schlüssel* den **Secret Key** in die `.env` eintragen: `STRIPE_SECRET_KEY=sk_test_…`
3. `APP_URL=https://truecloud.online` setzen und dann `npm run stripe:setup` ausführen. Das Skript erledigt:
   - Produkte und Preise (CHF, monatlich und jährlich, inkl. MWST) für alle Tarife anlegen,
   - das Kundenportal einrichten (Zahlungsmethode, Rechnungen, Kündigung auf Periodenende),
   - den Webhook `https://truecloud.online/api/stripe/webhook` anlegen.

   Die ausgegebenen Werte `STRIPE_WEBHOOK_SECRET` und `STRIPE_PORTAL_CONFIGURATION_ID` in die `.env` übernehmen.
4. Für lokale Tests: [Stripe CLI](https://docs.stripe.com/stripe-cli) installieren, `stripe listen --forward-to localhost:3000/api/stripe/webhook` starten und das angezeigte `whsec_…` als `STRIPE_WEBHOOK_SECRET` verwenden. Testkarte: `4242 4242 4242 4242`.
5. Optional unter *Einstellungen → Zahlungsmethoden* weitere Methoden aktivieren (Apple Pay und Google Pay funktionieren automatisch über Karten). Stripe Tax lässt sich mit `STRIPE_AUTOMATIC_TAX=true` aktivieren.
6. Für den Livebetrieb dieselben Schritte mit den **Live-Schlüsseln** (`sk_live_…`) wiederholen.

## 3. Server und Domain (Produktion)

Empfohlen: ein **OVHcloud VPS** (z. B. 2 vCPU / 4 GB RAM) mit Docker. Die Nutzerdaten fliessen nicht über den Server, deshalb reicht ein kleiner VPS.

1. DNS bei deinem Domain-Anbieter: **A-Record** `truecloud.online` und `www.truecloud.online` → IP des Servers (bei IPv6 zusätzlich AAAA).
2. Auf dem Server:
   ```bash
   git clone <dieses-repo> && cd <repo>/truecloud
   cp .env.example .env      # alles ausfüllen: POSTGRES_PASSWORD, CRON_SECRET, OVHcloud, Stripe, SMTP
   docker compose up -d --build
   ```
   Caddy holt automatisch ein HTTPS-Zertifikat. Die Datenbank-Migrationen laufen beim Start der App.
3. Der Dienst `cron` ruft stündlich `/api/cron/cleanup` auf. Der Job entfernt abgebrochene Uploads, leert den Papierkorb nach 30 Tagen und löscht abgelaufene Sitzungen.
4. Unter `ADMIN_EMAILS` deine E-Mail-Adresse eintragen, registrieren, fertig. Der Admin-Bereich ist dann unter `/dashboard/admin` erreichbar.

**Backups:** Die Postgres-Datenbank (Volume `db-data`) regelmässig sichern, z. B. mit `docker compose exec db pg_dump -U truecloud truecloud > backup.sql`. Die Dateien selbst liegen redundant bei OVHcloud.

**E-Mail:** Für den Versand z. B. ein OVHcloud-E-Mail-Paket (`ssl0.ovh.net`, Port 465) oder einen Dienst wie Postmark oder Brevo verwenden. Für `truecloud.online` SPF und DKIM setzen, damit die Mails nicht im Spam landen.

## Vor dem Livegang

- [ ] `src/lib/company.ts` ausfüllen (Name, Adresse, UID). Danach verschwindet der Hinweis auf den Rechtsseiten.
- [ ] Impressum, Datenschutzerklärung und AGB rechtlich prüfen lassen. Den E-Mail-Anbieter in der Datenschutzerklärung ergänzen.
- [ ] MWST-Pflicht klären. Bei Bedarf Stripe Tax aktivieren oder die MWST-Nummer im Stripe-Rechnungsprofil hinterlegen.
- [ ] Mit OVHcloud einen Auftragsverarbeitungsvertrag (DPA) abschliessen. OVHcloud stellt ihn im Kundenbereich bereit.
- [ ] Stripe auf Live-Schlüssel umstellen und `npm run stripe:setup` erneut ausführen.
- [ ] `support@truecloud.online` einrichten.
- [ ] Testkauf mit echter Karte durchführen und danach im Stripe-Dashboard erstatten.

## Aufbau

```
src/
  app/(marketing)/      Startseite, Preise, Sicherheit, Rechtliches
  app/(auth)/           Login, Registrierung, Passwort, E-Mail-Bestätigung
  app/dashboard/        Übersicht, Dateien, Freigaben, Papierkorb, Abo, Einstellungen, Admin
  app/s/[token]/        Öffentliche Freigabeseite
  app/api/              REST-API (Auth, Dateien, Ordner, Uploads, Freigaben, Abo, Stripe-Webhook, Cron)
  lib/plans.ts          Tarife, Preise und Margenrechnung  ← hier Preise anpassen
  lib/storage.ts        OVHcloud-Anbindung (S3)
  lib/stripe.ts         Stripe-Anbindung und Abo-Synchronisation
  lib/files.ts          Kontingent, Papierkorb, endgültiges Löschen
prisma/schema.prisma    Datenbankschema
scripts/                stripe-setup.ts, ovh-setup.ts
```
