# r2sev – Link-in-Bio-Seite

Einseitige Website für **r2sev** (Twitch Streamer & YouTuber) mit Links zu Twitch und YouTube, einem Kontaktformular sowie Impressum und Datenschutzerklärung. Gehostet wird sie bei **Hostinger** (Webhosting).

- Reines HTML/CSS/JS plus ein kleines PHP-Skript fürs Kontaktformular, kein Build-Schritt
- Keine Cookies, kein Tracking, keine externen Dienste: Schriften (Outfit, Inter) liegen lokal auf dem Server
- Das Formular verschickt Nachrichten per SMTP über das Hostinger-Postfach `kontakt@r2sev.com` an deine private Adresse. Diese steht nur in `private/config.php` auf dem Server, nirgends im Code und nirgends auf der Seite.

## Aufbau

```
public_html/                  ← Inhalt kommt bei Hostinger in den Ordner public_html
├── index.html                Startseite (Profil, Links, Kontaktformular)
├── kontakt.php               Nimmt das Formular entgegen und verschickt die E-Mail
├── impressum/index.html      Impressum
├── datenschutz/index.html    Datenschutzerklärung
├── danke/index.html          Danke-Seite (wenn JavaScript im Browser aus ist)
├── 404.html                  Seite für nicht gefundene Adressen
├── .htaccess                 HTTPS, Sicherheits-Header, Zugriffssperren
├── css/, js/, fonts/         Gestaltung, Formular-Logik, Schriften
├── favicon.svg, apple-touch-icon.png, og.png
└── private/                  Aus dem Web gesperrt, nur für PHP
    ├── config.example.php    Vorlage für die Formular-Einstellungen
    ├── config.php            ← legst du auf dem Server an (nicht im Repository!)
    ├── lib/PHPMailer/        PHPMailer 6.12.0 (LGPL-2.1) für den sicheren Mailversand
    └── storage/              Temporäre Spam-Schutz-Daten (wird automatisch befüllt)
```

## Auf Hostinger veröffentlichen

### 1. E-Mail-Postfach anlegen

Im hPanel unter **E-Mails** für deine Domain das Postfach **kontakt@r2sev.com** anlegen und das Passwort notieren.
Damit Mails an diese Adresse (sie steht im Impressum) auch bei dir ankommen, richtest du dort am besten noch eine **Weiterleitung** an deine private Adresse ein.

### 2. Dateien hochladen

1. hPanel → deine Website → **Dateimanager** → Ordner `public_html` öffnen.
2. Vorhandene Standarddateien von Hostinger löschen (z. B. `default.php`).
3. Den **Inhalt** des Ordners `public_html` aus diesem Projekt hochladen. Am einfachsten lädst du alles als ZIP hoch und entpackst es dort.
   Wichtig: Die Datei `.htaccess` muss mit hochgeladen werden.

### 3. Kontaktformular einrichten

1. Im Dateimanager den Ordner `public_html/private` öffnen.
2. `config.example.php` kopieren und die Kopie **`config.php`** nennen.
3. `config.php` bearbeiten:
   - `to_email`: deine private Adresse, an die die Nachrichten gehen sollen
   - `password`: das Passwort des Postfachs `kontakt@r2sev.com`
4. Speichern und auf der Website eine Testnachricht schicken.

Die Server-Daten für Hostinger sind schon eingetragen (`smtp.hostinger.com`, Port 465, SSL). Falls der Versand nicht klappt, findest du die genauen Werte im hPanel beim Postfach unter den Konfigurations- bzw. Verbindungsdetails.

### 4. HTTPS prüfen

Im hPanel unter **Sicherheit → SSL** sollte für r2sev.com ein (kostenloses) Zertifikat aktiv sein. Die `.htaccess` leitet alle Besucher automatisch auf `https://r2sev.com` um.

## Sicherheit im Überblick

- **Spam-Schutz:** verstecktes Honeypot-Feld und höchstens 5 Nachrichten pro Stunde und Absender. Dafür wird nur ein Hash der IP-Adresse gespeichert, der nach 1 Stunde gelöscht wird.
- **Eingaben:** Alle Felder werden auf dem Server geprüft, Längen sind begrenzt, Zeilenumbrüche in Name und E-Mail werden entfernt (Schutz vor E-Mail-Header-Injection). Es werden nur Anfragen von der eigenen Website angenommen.
- **Webserver:** HTTPS erzwungen, HSTS, Content-Security-Policy (nur eigene Dateien erlaubt), Schutz vor Einbettung in fremde Seiten (Clickjacking), keine Verzeichnis-Auflistung, der Ordner `private/` und versteckte Dateien sind gesperrt.
- **Zugangsdaten:** `config.php` steht in `.gitignore` und landet nie im Repository.

## Inhalte ändern

- **Links:** in `public_html/index.html`, nach `twitch.tv/r2sev` bzw. `youtube.com/@r2sev` suchen. Für einen weiteren Link einen ganzen `<li>…</li>`-Block kopieren und anpassen.
- **Direkter Link zum Formular:** https://r2sev.com/#kontakt
- **Impressum/Datenschutz:** in `public_html/impressum/index.html` und `public_html/datenschutz/index.html`. Wenn du später etwas Neues einbaust (z. B. eingebettete Videos, Statistik-Tools oder einen Shop), muss die Datenschutzerklärung angepasst werden.

## Lokal ansehen

```sh
php -S localhost:8000 -t public_html
```

Dann http://localhost:8000 öffnen. Das Formular verschickt lokal nur etwas, wenn eine `private/config.php` vorhanden ist.
