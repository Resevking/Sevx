# Stream-Bot für Twitch + OBS

Ein Bot, der dir beim Streamen hilft: Er beantwortet Befehle im Chat, moderiert, postet regelmäßig Hinweise, reagiert auf Follows, Subs, Raids und Kanalpunkte und steuert dabei OBS (Szenen, Quellen, Mikro, Texte, Replays).

## Was kann der Bot?

| Bereich | Funktionen |
| --- | --- |
| **Chat-Befehle** | eigene Befehle (`!discord`, `!hug @name` …) mit Platzhaltern, Zufallsantworten, Rechten und Cooldowns; Mods können per Chat Befehle anlegen (`!addcmd`) |
| **OBS** | Szene wechseln, Quellen ein-/ausblenden (auch zeitgesteuert), Mikro stumm schalten, Textquellen setzen (z. B. „Letzter Follower“, Todeszähler), Videos/Sounds abspielen, Filter schalten, Replay speichern |
| **Events** | Follow, Sub, Resub, Geschenk-Subs (Geschenk-Bomben werden nur einmal gemeldet), Raid (mit Auto-Shoutout), Bits, erste Nachricht im Kanal, Kanalpunkte-Belohnungen. Alerts laufen nacheinander und überlappen sich nicht |
| **Moderation** | Links (mit Whitelist und `!permit`), Großschreibung (Emotes zählen nicht), verbotene Wörter, zu lange Nachrichten, Emote-Spam; Strafen steigern sich (löschen → Timeout → längerer Timeout) |
| **Timer** | wiederkehrende Nachrichten, nur wenn der Stream live ist und im Chat etwas los ist |
| **Twitch** | `!titel` / `!spiel` ändern, `!uptime`, `!followage`, `!clip`, `!so` (offizieller Shoutout) |
| **Komfort** | verbindet sich automatisch neu (Chat, OBS, EventSub), erneuert Twitch-Logins selbst, Eingabe direkt im Terminal |

## Einrichtung (ca. 10 Minuten)

### 1. Node.js installieren

Lade **Node.js 22 LTS** (oder neuer) von [nodejs.org](https://nodejs.org) herunter und installiere es. Danach im Ordner `stream-bot` ein Terminal öffnen (Windows: im Explorer in die Adresszeile `cmd` tippen) und einmalig ausführen:

```bash
npm install
```

### 2. Twitch-App anlegen (für die Anmeldung)

1. Öffne [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) und melde dich an (Zwei-Faktor-Authentifizierung muss aktiv sein).
2. **„Deine Anwendung registrieren“**:
   - Name: frei wählbar, z. B. `SevX Stream-Bot`
   - OAuth-Redirect-URL: `http://localhost`, wird nicht benutzt, ist aber ein Pflichtfeld
   - Kategorie: `Chat Bot`
   - Client-Typ: **Öffentlich**
3. Kopiere die **Client-ID**.
4. Kopiere `.env.example` nach `.env` und trage sie ein:

```env
TWITCH_CLIENT_ID=deine_client_id
```

### 3. Bei Twitch anmelden

Empfohlen ist ein **eigener Bot-Account** (z. B. `sevx_bot`). Es geht aber auch mit deinem Streamer-Account.

```bash
npm run auth
```

Den angezeigten Link öffnen, mit dem **Bot-Account** einloggen und den Code bestätigen.

**Nur wenn Bot und Streamer verschiedene Accounts sind:**

```bash
npm run auth -- broadcaster
```

Diesmal mit deinem **Streamer-Account** einloggen. Das wird für `!titel`/`!spiel` und für Kanalpunkte gebraucht. Mache den Bot außerdem in deinem Chat zum Moderator:

```
/mod sevx_bot
```

Die Logins landen in `data/tokens.json` und werden automatisch erneuert. **Diese Datei niemals teilen!**

### 4. OBS verbinden

In OBS (ab Version 28): **Werkzeuge → WebSocket-Server-Einstellungen**

- „WebSocket-Server aktivieren“ anhaken
- „Authentifizierung aktivieren“ anhaken, dann über **„Verbindungsinformationen anzeigen“** das Passwort kopieren

In die `.env`:

```env
OBS_PASSWORD=dein_obs_passwort
```

Läuft der Bot auf einem anderen PC als OBS, trage in `config.yml` unter `obs.url` die IP des OBS-PCs ein, z. B. `ws://192.168.0.20:4455`.

### 5. Konfigurieren

```bash
cp config.example.yml config.yml      # Windows: copy config.example.yml config.yml
```

In `config.yml` mindestens `twitch.channel` auf deinen Kanalnamen setzen. Die Namen von Szenen und Quellen in den Beispielen (`Pause`, `Konfetti`, `Todeszähler` …) an deine OBS-Szenen anpassen oder die Beispiele löschen. Danach prüfen:

```bash
npm run check
```

### 6. Starten

```bash
npm start
```

Beenden mit **Strg + C**.

## Eingebaute Befehle

| Befehl | Wer | Was |
| --- | --- | --- |
| `!befehle` | alle | listet alle Befehle, die der Nutzer benutzen darf |
| `!uptime` | alle | wie lange der Stream schon läuft |
| `!followage [@name]` | alle | seit wann jemand folgt |
| `!titel [neuer Titel]` | alle (ändern: Mods) | Titel anzeigen/ändern |
| `!spiel [Kategorie]` | alle (ändern: Mods) | Kategorie anzeigen/ändern (`!spiel mine` findet „Minecraft“) |
| `!clip` | alle | erstellt einen Clip und postet den Link |
| `!so @name` | Mods | Shoutout (offiziell bei Twitch + Chat-Nachricht) |
| `!szene <Name>` / `!szenen` | Mods | OBS-Szene wechseln / alle Szenen auflisten |
| `!quelle <Name> [an\|aus]` | Mods | Quelle in der aktuellen Szene ein-/ausblenden (ohne an/aus: umschalten) |
| `!mute [Quelle]` / `!unmute [Quelle]` | Mods | Audio stumm/an (ohne Angabe: `obs.defaultMic`) |
| `!replay` | Mods | Replay-Puffer speichern |
| `!permit @name` | Mods | erlaubt einen Link für 60 Sekunden |
| `!addcmd !name Text` / `!editcmd` / `!delcmd !name` | Mods | eigene Befehle per Chat verwalten |
| `!zähler <Name> [+1\|-1\|=5\|reset]` | alle (ändern: Mods) | Zähler anzeigen/ändern, nutzbar als `{counter:name}` |

Namen müssen nicht exakt stimmen: `!szene pause` findet „Pause“, `!quelle kam` findet „Kamera“. Rechte, Aliase und Cooldowns lassen sich unter `builtins:` in der `config.yml` ändern oder ganze Befehle abschalten.

## Eigene Befehle, Events und Aktionen

Alles wird in der `config.yml` eingerichtet. Die `config.example.yml` enthält kommentierte Beispiele für alles. Kurzfassung:

```yaml
commands:
  discord: "Komm auf unseren Discord: https://discord.gg/…"

  tod:                                    # Todeszähler für Mods
    permission: moderator
    actions:
      - counter: { name: tode, add: 1 }
      - text: { source: "Todeszähler", text: "Tode: {counter:tode}" }
      - say: "💀 Tode bisher: {counter:tode}"

events:
  raid:
    minViewers: 2
    actions:
      - say: "RAID! {user} kommt mit {viewers} Leuten!"
      - shoutout: "{user}"
      - source: { source: "Raid-Alert", visible: true, duration: 8 }

  redemptions:                            # Kanalpunkte – Name wie bei Twitch
    "Hydrieren!":
      - say: "{user} sagt: Trink was! 💧"
```

**Aktionen:** `say`, `scene`, `source`, `mute`, `unmute`, `toggleMute`, `text`, `media`, `filter`, `replay`, `wait`, `counter`, `shoutout`, `timeout`

**Platzhalter:** `{user}`, `{touser}`, `{args}`, `{1}` `{2}` …, `{count}`, `{counter:name}`, `{channel}`, `{uptime}`, `{game}`, `{title}`, `{random:1-100}`, `{pick:a|b|c}`, dazu je nach Event `{months}`, `{tier}`, `{viewers}`, `{bits}`, `{amount}`, `{recipient}`, `{reward}`, `{input}` …

Alle Antworttexte des Bots lassen sich unter `messages:` überschreiben. Die Liste aller Schlüssel steht in `src/core/messages.js`.

## Terminal

Während der Bot läuft, kannst du im Terminal tippen:

- normaler Text → wird als Bot in den Chat geschrieben
- `!befehl` → wird mit Streamer-Rechten ausgeführt (z. B. `!szene pause`)
- `/quit` → Bot beenden

## Häufige Probleme

| Problem | Lösung |
| --- | --- |
| `Kein Twitch-Login gefunden` | `npm run auth` ausführen |
| `Token … ist ungültig` | Login wurde widerrufen oder 30 Tage nicht benutzt → `npm run auth` erneut |
| Bot antwortet nicht | Stimmt `twitch.channel`? Prüfe mit `LOG_LEVEL=debug` in der `.env`, ob Nachrichten ankommen |
| „Moderation nicht möglich“ | Bot im Chat zum Mod machen: `/mod botname` |
| `OBS nicht erreichbar` | OBS läuft? WebSocket-Server aktiviert? Port 4455? Firewall? |
| `OBS-Passwort falsch` | Passwort in OBS unter „Verbindungsinformationen anzeigen“ kopieren und in `.env` eintragen |
| Szene/Quelle nicht gefunden | Name in `config.yml` mit OBS vergleichen. Quellen werden in der **aktuellen** Szene gesucht, außer du gibst `scene:` an |
| Kanalpunkte reagieren nicht | Streamer-Login nötig (`npm run auth -- broadcaster`); Belohnungsname muss passen. Kanalpunkte gibt es nur für Affiliates/Partner |
| Follows kommen nicht an | Bot muss Mod sein (oder Streamer-Login vorhanden) |

## Für Entwickler

```
src/
  index.js            Start, Konfiguration laden
  bot.js              verbindet alle Teile
  config.js           config.yml + .env laden und prüfen
  auth/               Twitch-Login (Gerätecode) und Token-Erneuerung
  twitch/             Chat (IRC über WebSocket), Helix-API, EventSub, Kanal-Funktionen
  obs/obs.js          OBS-Steuerung (obs-websocket v5) mit Auto-Reconnect
  core/               Befehle, eingebaute Befehle, Aktionen, Moderation, Timer, Events, Platzhalter, Speicher
test/                 Unit-Tests + Ende-zu-Ende-Test gegen nachgebaute Twitch- und OBS-Server
```

```bash
npm test
```
