# PrioPilot

**Die App, mit der du gerade arbeitest, bekommt Vorrang. Hintergrund-Apps, die unnötig CPU, Datenträger oder RAM belegen, werden gebremst oder pausiert.**
Automatisch oder per Klick, und ohne dass PrioPilot selbst zur Last wird.

- **Leicht:** ca. 110 KB, keine Installation, kein Internet, keine Zusatzprogramme. Im Hintergrund braucht PrioPilot alle 3 Sekunden einen einzigen Systemaufruf (so liest auch der Task-Manager die Prozessliste). Das ist weit unter 0,1 % CPU. Was PrioPilot gerade selbst verbraucht, steht unten im Fenster.
- **Sicher:** Teile von Windows (Taskleiste, Ton, Anmeldung, Virenschutz …) werden nie angefasst. Beim Beenden wird alles zurückgesetzt. Selbst nach einem Absturz setzt PrioPilot pausierte Apps beim nächsten Start fort.
- **Keine Admin-Rechte nötig.**

## Herunterladen oder selbst bauen

**Fertig herunterladen:** Auf GitHub unter **Actions → „PrioPilot (Windows-App)“** den neuesten grünen Lauf öffnen und unten bei *Artifacts* **PrioPilot** herunterladen. Die ZIP-Datei entpacken und `PrioPilot.exe` starten.

**Selbst bauen (1 Minute):** Den Ordner `prio-pilot` auf den PC kopieren und **`build.bat` doppelklicken**. Das Skript nutzt den C#-Compiler, der in Windows 10 und 11 schon eingebaut ist. Danach liegt `PrioPilot.exe` im selben Ordner.

> Beim allerersten Start kann Windows SmartScreen warnen, weil die EXE nicht signiert ist: *Weitere Informationen → Trotzdem ausführen*.

## So funktioniert es

Nach dem Start erscheint ein Fenster mit allen laufenden Apps und ein grünes Pfeil-Symbol im Infobereich (unten rechts neben der Uhr). Schließt du das Fenster, arbeitet PrioPilot im Infobereich weiter. Ein Klick auf das Symbol öffnet das Fenster wieder, ein Rechtsklick zeigt das Menü.

### Automatisch (Standard)

| Was | Was PrioPilot tut |
|---|---|
| **Aktive App** (das Fenster im Vordergrund) | bekommt höhere Priorität, ebenso alles, was sie gestartet hat (z. B. ein Compiler im Terminal oder ein Spiel aus einem Launcher). |
| **Hintergrund-Fresser** (mehrere Sekunden lang über der CPU-Schwelle, Standard 10 % der gesamten CPU, oder über 30 MB/s Datenträgerlast) | werden **gebremst**. Sobald du so eine App wieder anklickst, läuft sie sofort wieder normal. |
| **RAM knapp** (über 85 % belegt) | Die drei größten Hintergrund-Apps geben ungenutzten Speicher an Windows zurück, damit die aktive App Platz hat. |

**„Gebremst“ heißt:** niedrigere CPU-Priorität, Windows-Effizienzmodus (wie im Task-Manager), niedrige Datenträger-Priorität und niedrige Speicher-Priorität (Windows lagert diese App zuerst aus). Die App läuft weiter, kommt aber erst dran, wenn die aktive App Luft lässt.

**„Pausiert“ heißt:** Die App ist komplett angehalten und braucht 0 % CPU und keine Datenträger- oder Netzwerkleistung mehr. Klickst du sie in der Taskleiste an, läuft sie sofort weiter.

### Regeln pro App (bleiben gespeichert)

App(s) in der Liste markieren und unten einen Knopf drücken (oder Rechtsklick):

| Regel | Wofür |
|---|---|
| **Immer Vorrang** | Spiel, Videoschnitt, Musikprogramm: immer hohe Priorität, wird nie gebremst. |
| **Im Hintergrund bremsen** | Apps, die nebenher laufen dürfen, aber nicht stören sollen (Cloud-Sync, Launcher, Updater …). |
| **Im Hintergrund pausieren** | Apps, die du im Hintergrund gar nicht brauchst. Ist die App minimiert oder nur im Infobereich, wird sie nach 60 Sekunden angehalten. Ein sichtbares Fenster wird nie pausiert. |
| **Nie anfassen** | PrioPilot lässt die App komplett in Ruhe. |
| **Automatisch** | Regel entfernen. |

### Sofort-Knöpfe

- **Pausieren:** minimiert die App und hält sie an, bis du sie in der Taskleiste anklickst oder **Fortsetzen** drückst.
- **RAM freigeben:** gibt den ungenutzten Arbeitsspeicher der App sofort an Windows zurück.
- **Alles zurücksetzen:** hebt alle Pausen auf und setzt alle Prioritäten zurück. Deine Regeln bleiben.
- **PrioPilot aktiv** (Häkchen oben oder im Menü des Symbols): Ist das Häkchen weg, greift PrioPilot nirgends mehr ein und setzt sofort alles zurück.

### Farben in der Liste

Grün = aktive App · Blau = Vorrang · Orange = gebremst · Grau = pausiert

## Tipps

- **Musik oder Video im Hintergrund ruckelt?** Die App auf **Nie anfassen** oder **Immer Vorrang** stellen.
- **„Pausieren“ nicht für Apps verwenden, die im Hintergrund etwas tun sollen:** Musik, Downloads, Chat-Benachrichtigungen, Backups. Dafür ist **Im Hintergrund bremsen** da.
- **Pausierte Apps, die nur im Infobereich sitzen**, reagieren nicht auf einen Klick auf ihr Symbol. Sie werden über **Fortsetzen** in PrioPilot oder über **Alles fortsetzen und zurücksetzen** im Menü des PrioPilot-Symbols wieder geweckt.
- **„Kein Zugriff – als Admin starten“:** Diese App läuft mit Administratorrechten. Mit dem Knopf **Als Admin neu starten** kann PrioPilot auch sie steuern.
- **Spiele mit Anti-Cheat:** PrioPilot ändert nur die Priorität, wie es der Task-Manager auch kann. Wer ganz sicher gehen will, stellt das Spiel auf **Nie anfassen**.
- **Mit Windows starten:** Häkchen oben im Fenster. PrioPilot startet dann unsichtbar im Infobereich.

## Was PrioPilot nicht kann

- **Netzwerk-Bandbreite einzelner Apps begrenzen:** Das erlaubt Windows nur mit Admin-Richtlinien. Eine **pausierte** App verbraucht aber gar kein Netzwerk mehr.
- **Grafikkarte (GPU) aufteilen:** Darauf haben normale Programme keinen Einfluss.
- **Mehr RAM herbeizaubern:** „RAM freigeben“ lagert ungenutzten Speicher von Hintergrund-Apps aus, damit die aktive App ihn bekommt. Braucht die Hintergrund-App ihn wieder, lädt sie ihn nach.

## Einstellungen und Entfernen

Alle Einstellungen und Regeln stehen in `%APPDATA%\PrioPilot\einstellungen.ini`. Die Datei ist lesbar und lässt sich auch von Hand bearbeiten, etwa um `PausierenNachSekunden` oder `IntervallSekunden` zu ändern.

**Entfernen:** PrioPilot beenden (Rechtsklick aufs Symbol → Beenden), das Häkchen „Mit Windows starten“ vorher entfernen, dann `PrioPilot.exe` und den Ordner `%APPDATA%\PrioPilot` löschen. Sonst bleibt nichts zurück.

## Für Neugierige: Aufbau

| Datei | Inhalt |
|---|---|
| `src/ProcessScanner.cs` | liest alle Prozesse mit einem Aufruf von `NtQuerySystemInformation`, ohne Handles zu öffnen, und verwendet den Puffer wieder |
| `src/Engine.cs` | entscheidet pro Prozess *bevorzugen / bremsen / pausieren / in Ruhe lassen* und greift nur ein, wenn sich etwas ändert |
| `src/TrayApp.cs` | Symbol im Infobereich. App-Wechsel kommen als Windows-Ereignis (`SetWinEventHook`), PrioPilot fragt also nicht ständig nach |
| `src/MainForm.cs` | das Fenster. Es wird beim Schließen komplett freigegeben, damit es im Hintergrund keinen Speicher belegt |
| `src/SelfTest.cs` | `PrioPilot.exe /selbsttest` prüft alle Funktionen an eigenen Test-Prozessen und schreibt `selbsttest.log` |

Gebaut für .NET Framework 4.8 (in Windows 10/11 enthalten), Sprachstand C# 5, damit der in Windows eingebaute Compiler reicht.
