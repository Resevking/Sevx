# Twitch Setup-Assistent – Windows-App

Dieselbe Hilfe wie auf der Webseite `/twitch-setup/`, als eigenes Programm für Windows:
Checkliste bis zum ersten Stream, OBS-Rechner und Problemlöser. Dein Fortschritt wird auf dem PC gespeichert.

## Herunterladen

1. Auf GitHub im Repository oben auf **Actions** klicken.
2. Links **«Twitch Setup-Assistent (Windows-App)»** wählen und den obersten Lauf mit grünem Haken öffnen.
3. Ganz unten bei **Artifacts** auf **Twitch-Setup-Assistent-Windows** klicken. Es wird eine ZIP-Datei heruntergeladen.
4. ZIP entpacken. Darin sind zwei Dateien:
   - `Twitch-Setup-Assistent-Setup-1.0.0.exe` – installiert die App mit Desktop- und Startmenü-Verknüpfung (empfohlen).
   - `Twitch-Setup-Assistent-1.0.0-portable.exe` – läuft ohne Installation, startet aber etwas langsamer.

### Windows-Warnung «Der Computer wurde durch Windows geschützt»

Die App ist nicht mit einem kostenpflichtigen Zertifikat signiert, deshalb warnt Windows beim ersten Start.
Klicke auf **«Weitere Informationen»** und dann auf **«Trotzdem ausführen»**.

## Selber bauen

Voraussetzung: Node.js 22.

```
cd twitch-setup-desktop
npm ci
npm start        # App starten (Entwicklung)
npm run selftest # App starten, alle Bereiche durchklicken, Ergebnis in selftest.log
npm run dist     # Windows-Installer nach release/ bauen (am besten unter Windows)
```

Die Oberfläche kommt aus `src/components/twitch-setup/` und ist dieselbe wie auf der Webseite.
