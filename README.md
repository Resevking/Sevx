# r2sev – Link-in-Bio-Seite

Einseitige Website für **r2sev** (Twitch Streamer & YouTuber) mit Links zu Twitch und YouTube und einem Kontaktformular.

- Reines HTML/CSS/JS, kein Build-Schritt, keine Abhängigkeiten
- Schriften (Outfit, Inter) liegen lokal im Projekt, es gibt keine Anfragen an Google oder andere Drittanbieter
- Kontaktformular über **Netlify Forms**: Jede Nachricht kommt per E-Mail bei dir an. Deine E-Mail-Adresse steht nur in den Netlify-Einstellungen, nirgends im Code und nirgends auf der Seite.

## Aufbau

```
site/
├── index.html            Startseite (Profil, Links, Kontaktformular)
├── danke/index.html      Danke-Seite (nur nötig, wenn JavaScript im Browser aus ist)
├── 404.html              Seite für nicht gefundene Adressen
├── css/style.css         Gestaltung (Farben ganz oben unter :root)
├── js/main.js            Formular auf-/zuklappen, prüfen und senden
├── fonts/                Schriftdateien + Lizenz
├── favicon.svg           Icon im Browser-Tab
├── apple-touch-icon.png  Icon auf dem Handy-Homescreen
└── og.png                Vorschaubild, wenn der Link geteilt wird (WhatsApp, Discord, …)
netlify.toml              Netlify-Einstellungen (veröffentlicht den Ordner site/)
```

## Links ändern

Die Links stehen in `site/index.html`. Suche nach `twitch.tv/r2sev` bzw. `youtube.com/@r2sev`.
Für einen weiteren Link (z. B. TikTok oder Instagram) kopierst du einfach einen ganzen `<li>…</li>`-Block und passt Adresse, Titel und Icon an.

Ein direkter Link zum Kontaktformular: **https://r2sev.com/#kontakt** (das Formular öffnet sich dann automatisch).

## Kontaktformular einrichten (einmalig in Netlify)

1. **Formular-Erkennung einschalten:**
   Netlify → deine Seite → **Forms** → **Enable form detection**.
   Danach einmal neu veröffentlichen (Deploys → **Trigger deploy** → **Deploy site**). Netlify findet dann das Formular `kontakt`.
2. **E-Mail-Benachrichtigung einrichten:**
   **Site configuration** → **Notifications** → **Emails and webhooks** → **Form submission notifications** → **Add notification** → **Email notification**.
   Gib dort deine E-Mail-Adresse ein und wähle als Formular `kontakt`.
3. Fertig! Probier das Formular einmal selbst aus. Alle Nachrichten siehst du zusätzlich unter **Forms** im Netlify-Dashboard.

Hinweise:

- Der Betreff der E-Mail lautet „Neue Nachricht von ‹Name› über r2sev.com“.
- Spam wird über ein verstecktes Feld (Honeypot) und den Spamfilter von Netlify abgefangen. Verdächtige Nachrichten landen unter **Forms** → **Spam submissions**.
- Im kostenlosen Netlify-Plan sind 100 Formular-Nachrichten pro Monat inklusive.
- Lokal (ohne Netlify) wird nichts verschickt. Das Formular funktioniert nur auf der veröffentlichten Seite.

## Lokal ansehen

```sh
cd site
python3 -m http.server 8000
```

Dann im Browser http://localhost:8000 öffnen.
