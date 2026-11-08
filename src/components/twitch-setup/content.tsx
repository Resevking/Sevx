import { ReactNode } from 'react';
import { Bullets, Code, Steps, dashboardUrl } from './ui';

export interface LinkSpec {
    label: string;
    href: (user: string) => string;
}

export interface SetupStep {
    id: string;
    title: string;
    summary: string;
    body: ReactNode;
    links?: LinkSpec[];
    required?: boolean;
    /** Shows a button that jumps to the OBS settings calculator. */
    opensCalculator?: boolean;
}

export interface Phase {
    id: string;
    title: string;
    steps: SetupStep[];
}

const securityLink: LinkSpec = { label: 'Sicherheit & Datenschutz', href: () => 'https://www.twitch.tv/settings/security' };
const streamSettingsLink: LinkSpec = { label: 'Dashboard: Stream-Einstellungen', href: (u) => dashboardUrl(u, 'settings/stream') };
const streamManagerLink: LinkSpec = { label: 'Stream-Manager', href: (u) => dashboardUrl(u, 'stream-manager') };
const inspectorLink: LinkSpec = { label: 'Twitch Inspector', href: () => 'https://inspector.twitch.tv/' };

export const PHASES: Phase[] = [
    {
        id: 'konto',
        title: 'Konto vorbereiten',
        steps: [
            {
                id: 'konto-erstellen',
                title: 'Konto erstellen und E-Mail bestätigen',
                summary: 'Ohne bestätigte E-Mail-Adresse sind viele Funktionen gesperrt.',
                required: true,
                body: (
                    <Steps>
                        <li>Registriere dich auf twitch.tv (oben rechts «Registrieren»).</li>
                        <li>
                            Öffne die Mail von Twitch und klicke auf den Bestätigungslink. Keine Mail? Spam-Ordner prüfen oder in den Einstellungen erneut
                            senden.
                        </li>
                        <li>
                            Wähle deinen Namen mit Bedacht: Er steht in deiner Kanal-Adresse (<Code>twitch.tv/deinname</Code>) und lässt sich nur selten ändern.
                        </li>
                    </Steps>
                ),
                links: [{ label: 'Registrieren', href: () => 'https://www.twitch.tv/signup' }, securityLink]
            },
            {
                id: '2fa',
                title: 'Zwei-Faktor-Authentifizierung (2FA) aktivieren',
                summary: 'Häufigster Grund, warum Streamen nicht klappt: Ohne 2FA blockiert Twitch den Stream-Key.',
                required: true,
                body: (
                    <>
                        <Steps>
                            <li>Öffne Einstellungen → «Sicherheit und Datenschutz».</li>
                            <li>Bestätige dort zuerst deine Telefonnummer (falls noch nicht geschehen).</li>
                            <li>Klicke bei «Zwei-Faktor-Authentifizierung» auf «2FA einrichten».</li>
                            <li>Verbinde eine Authenticator-App (z. B. Google Authenticator, Microsoft Authenticator oder Authy) und gib den Code ein.</li>
                            <li>War OBS schon verbunden: unter Einstellungen → Stream «Konto trennen» und neu verbinden.</li>
                        </Steps>
                    </>
                ),
                links: [securityLink]
            },
            {
                id: 'profil',
                title: 'Profil gestalten',
                summary: 'Bild, Banner und Bio – damit neue Zuschauer wissen, wer du bist.',
                body: (
                    <Bullets>
                        <li>Profilbild: quadratisch, mindestens 256×256 Pixel.</li>
                        <li>Profilbanner: 1200×480 Pixel.</li>
                        <li>Bio: 1–2 Sätze, was man bei dir erwartet (Spiele, Sprache, Streamzeiten).</li>
                    </Bullets>
                ),
                links: [{ label: 'Profil-Einstellungen', href: () => 'https://www.twitch.tv/settings/profile' }]
            }
        ]
    },
    {
        id: 'kanal',
        title: 'Kanal einstellen',
        steps: [
            {
                id: 'stream-key',
                title: 'Stream-Key finden – und geheim halten',
                summary: 'Der Stream-Key ist wie ein Passwort: Wer ihn hat, kann auf deinem Kanal streamen.',
                required: true,
                body: (
                    <>
                        <Steps>
                            <li>Creator Dashboard → Einstellungen → Stream.</li>
                            <li>Bei «Primärer Streamschlüssel» auf «Kopieren» klicken.</li>
                            <li>Zeige ihn nie im Stream, auf Screenshots oder in Discord.</li>
                            <li>Falls er öffentlich wurde: «Zurücksetzen» klicken und den neuen Key in OBS eintragen.</li>
                        </Steps>
                        <p className="mt-3">
                            Tipp: Verbindest du OBS über «Konto verbinden» mit Twitch (Schritt «OBS mit Twitch verbinden»), musst du den Key gar nicht von Hand
                            einfügen.
                        </p>
                    </>
                ),
                links: [streamSettingsLink]
            },
            {
                id: 'kanal-einstellungen',
                title: 'Wichtige Stream-Einstellungen setzen',
                summary: 'Aufzeichnungen speichern und Verzögerung zum Chat verringern.',
                body: (
                    <Bullets>
                        <li>
                            <strong>Vergangene Übertragungen speichern</strong> einschalten – so können Zuschauer deine Streams später ansehen (VODs).
                        </li>
                        <li>
                            <strong>Latenzmodus «Niedrige Latenz»</strong> wählen – dann sind Bild und Chat fast synchron.
                        </li>
                    </Bullets>
                ),
                links: [streamSettingsLink]
            },
            {
                id: 'moderation',
                title: 'Chat absichern',
                summary: 'Spam und Beleidigungen automatisch filtern, bevor sie jemand sieht.',
                body: (
                    <Bullets>
                        <li>Dashboard → Einstellungen → Moderation: AutoMod einschalten (Stufe 1–2 ist ein guter Start).</li>
                        <li>Chat-Regeln festlegen – sie werden neuen Zuschauern vor der ersten Nachricht angezeigt.</li>
                        <li>
                            Vertrauenswürdige Freunde zu Moderatoren machen: im eigenen Chat <Code>/mod name</Code> eingeben.
                        </li>
                    </Bullets>
                ),
                links: [{ label: 'Dashboard: Moderation', href: (u) => dashboardUrl(u, 'settings/moderation') }]
            }
        ]
    },
    {
        id: 'obs',
        title: 'Streaming-Programm (OBS)',
        steps: [
            {
                id: 'obs-installieren',
                title: 'OBS Studio installieren',
                summary: 'Kostenlos und der Standard für Twitch – für Windows, macOS und Linux.',
                required: true,
                body: (
                    <>
                        <Steps>
                            <li>OBS Studio von der offiziellen Seite herunterladen und installieren.</li>
                            <li>
                                Beim ersten Start fragt OBS nach dem «Assistenten für die automatische Konfiguration». Du kannst ihn überspringen und
                                stattdessen den OBS-Rechner hier nutzen – der berücksichtigt auch Twitch-spezifische Werte.
                            </li>
                        </Steps>
                        <p className="mt-3">Alternative: Streamlabs Desktop basiert auf OBS und ist einsteigerfreundlich, braucht aber mehr Leistung.</p>
                    </>
                ),
                links: [{ label: 'OBS herunterladen', href: () => 'https://obsproject.com/download' }]
            },
            {
                id: 'obs-verbinden',
                title: 'OBS mit Twitch verbinden',
                summary: 'Am einfachsten über «Konto verbinden» – dann brauchst du keinen Stream-Key.',
                required: true,
                body: (
                    <>
                        <Steps>
                            <li>OBS → Datei → Einstellungen → Stream.</li>
                            <li>Dienst: «Twitch», Server: «Automatisch».</li>
                            <li>«Konto verbinden (empfohlen)» klicken und im Browser-Fenster bei Twitch anmelden.</li>
                            <li>Klappt das nicht: «Stream-Key verwenden» wählen und den Key aus dem Dashboard einfügen.</li>
                        </Steps>
                        <p className="mt-3">Bonus: Mit verbundenem Konto erscheinen Chat und Stream-Informationen (Titel, Kategorie) direkt in OBS.</p>
                    </>
                ),
                links: [streamSettingsLink]
            },
            {
                id: 'obs-einstellungen',
                title: 'Bild- und Ton-Einstellungen übernehmen',
                summary: 'Die meisten Probleme (Ruckeln, Pixel, Abbrüche) kommen von unpassenden Einstellungen.',
                required: true,
                opensCalculator: true,
                body: (
                    <Steps>
                        <li>Miss deine Upload-Geschwindigkeit – am besten mit LAN-Kabel.</li>
                        <li>Öffne den OBS-Rechner, beantworte die Fragen und übertrage die Werte in OBS.</li>
                    </Steps>
                ),
                links: [{ label: 'Speedtest', href: () => 'https://www.speedtest.net/' }]
            },
            {
                id: 'szenen',
                title: 'Szenen und Quellen einrichten',
                summary: 'Szene = eine Ansicht deines Streams. Quelle = was darin zu sehen oder zu hören ist.',
                body: (
                    <Bullets>
                        <li>Szene «Spiel»: Quelle «Spielaufnahme» mit Modus «Bestimmtes Fenster aufnehmen». Auf dem Mac: «macOS-Bildschirmaufnahme».</li>
                        <li>Mikrofon: unter Einstellungen → Audio bei «Mikrofon/AUX-Audio» dein Mikrofon auswählen.</li>
                        <li>Webcam (optional): Quelle «Videoaufnahmegerät».</li>
                        <li>Szene «Gleich geht’s los» bzw. «Pause» mit Bild oder Text – praktisch für den Start und für Pausen.</li>
                    </Bullets>
                )
            },
            {
                id: 'audio',
                title: 'Ton einstellen',
                summary: 'Zuschauer verzeihen schlechtes Bild eher als schlechten Ton.',
                body: (
                    <Bullets>
                        <li>
                            Im Audio-Mixer sollte deine Stimme beim normalen Sprechen im gelben Bereich liegen (etwa −20 bis −10 dB), nie dauerhaft im roten.
                        </li>
                        <li>Mikrofon-Filter (⋮ im Mixer → «Filter»): «Rauschunterdrückung» (RNNoise), «Kompressor» und «Limiter» (Schwelle −1 dB).</li>
                        <li>Benutze Kopfhörer – sonst nimmt dein Mikrofon den Spielsound ein zweites Mal auf (Echo).</li>
                    </Bullets>
                )
            }
        ]
    },
    {
        id: 'testen',
        title: 'Testen',
        steps: [
            {
                id: 'testaufnahme',
                title: 'Kurze Testaufnahme ansehen',
                summary: 'Bild und Ton prüfen, ohne live zu sein.',
                body: (
                    <Steps>
                        <li>In OBS auf «Aufnahme starten» klicken, 1–2 Minuten spielen und reden.</li>
                        <li>Aufnahme stoppen und die Datei ansehen (Datei → Aufnahmen anzeigen).</li>
                        <li>Achte auf: Ist alles zu sehen? Ist deine Stimme gut verständlich und lauter als das Spiel?</li>
                    </Steps>
                )
            },
            {
                id: 'bandbreitentest',
                title: 'Unsichtbaren Test-Stream machen',
                summary: 'Prüft, ob dein Internet die Bitrate schafft – ohne dass jemand zuschaut.',
                body: (
                    <>
                        <Steps>
                            <li>OBS → Einstellungen → Stream → «Stream-Key verwenden» und deinen Key einfügen.</li>
                            <li>
                                Direkt an den Key anhängen: <Code>?bandwidthtest=true</Code> (z. B. <Code>live_123…abc?bandwidthtest=true</Code>).
                            </li>
                            <li>«Stream starten» – Twitch zeigt den Stream niemandem an.</li>
                            <li>Im Twitch Inspector prüfen: Ist die Bitrate gleichmässig? Gibt es Warnungen?</li>
                            <li>Nach 5–10 Minuten stoppen und den Zusatz wieder entfernen (oder wieder «Konto verbinden» nutzen).</li>
                        </Steps>
                        <p className="mt-3">Wichtig: Vergisst du den Zusatz zu entfernen, bist du beim nächsten Mal nicht wirklich live.</p>
                    </>
                ),
                links: [inspectorLink, streamSettingsLink]
            }
        ]
    },
    {
        id: 'live',
        title: 'Live gehen',
        steps: [
            {
                id: 'stream-infos',
                title: 'Titel, Kategorie und Tags setzen',
                summary: 'Ohne Kategorie findet dich praktisch niemand.',
                required: true,
                body: (
                    <Bullets>
                        <li>Titel: kurz und konkret, z. B. «Erster Stream! Minecraft Hardcore – Tag 1».</li>
                        <li>Kategorie: dein Spiel oder «Just Chatting».</li>
                        <li>Tags (bis zu 10): z. B. Deutsch, Schweiz, Anfängerfreundlich.</li>
                        <li>Sprache des Streams auf Deutsch stellen.</li>
                        <li>Inhaltsklassifizierung setzen, falls dein Stream z. B. Gewalt oder Glücksspiel zeigt.</li>
                    </Bullets>
                ),
                links: [streamManagerLink]
            },
            {
                id: 'live-gehen',
                title: 'Live gehen und kontrollieren',
                summary: 'Kurzer Check vor dem Start – und ein Blick von aussen.',
                required: true,
                body: (
                    <Steps>
                        <li>Szene «Gleich geht’s los» wählen, Benachrichtigungen am PC ausschalten (Windows: «Nicht stören»).</li>
                        <li>In OBS auf «Stream starten» klicken.</li>
                        <li>Auf dem Handy deinen Kanal öffnen und kurz reinschauen – Handy dabei stumm, sonst gibt es eine Rückkopplung.</li>
                        <li>Unten rechts in OBS auf das Quadrat achten: grün = alles gut, gelb oder rot = Internet-Probleme (siehe «Probleme lösen»).</li>
                    </Steps>
                ),
                links: [{ label: 'Dein Kanal', href: (u) => (u ? `https://www.twitch.tv/${u}` : 'https://www.twitch.tv/') }]
            }
        ]
    }
];

export const ALL_STEPS: SetupStep[] = PHASES.flatMap((p) => p.steps);

export interface Problem {
    id: string;
    title: string;
    keywords: string;
    cause: string;
    fixes: ReactNode[];
    links?: LinkSpec[];
}

export const PROBLEMS: Problem[] = [
    {
        id: 'kein-key',
        title: 'Ich finde keinen Stream-Key / kann nicht live gehen',
        keywords: 'stream key schlüssel 2fa zwei faktor gesperrt blockiert nicht live',
        cause: 'Meist fehlt die Zwei-Faktor-Authentifizierung (2FA) oder die E-Mail-Adresse ist nicht bestätigt.',
        fixes: [
            'E-Mail-Adresse bestätigen (Einstellungen → Sicherheit und Datenschutz).',
            '2FA aktivieren – erst danach lässt Twitch dich den Stream-Key verwenden.',
            'Danach: Dashboard → Einstellungen → Stream → «Primärer Streamschlüssel» → «Kopieren».',
            'Nutzt du «Konto verbinden» in OBS: einmal «Konto trennen» und neu verbinden.'
        ],
        links: [securityLink, streamSettingsLink]
    },
    {
        id: 'verbindung',
        title: 'OBS: «Verbindung zum Server fehlgeschlagen» oder «Ungültiger Stream-Key»',
        keywords: 'verbindung fehlgeschlagen failed to connect server ungültig invalid path key',
        cause: 'Falscher oder veralteter Stream-Key, falscher Server oder eine Firewall blockiert OBS.',
        fixes: [
            'Stream-Key neu kopieren – ohne Leerzeichen am Anfang oder Ende. Am sichersten: Key im Dashboard zurücksetzen und neu einfügen.',
            'In OBS Dienst «Twitch» und Server «Automatisch» wählen (nicht «Benutzerdefiniert»).',
            'Statt Stream-Key «Konto verbinden» verwenden.',
            'Firewall/Antivirus: OBS erlauben. Einen aktiven VPN-Dienst ausschalten.',
            'Steht noch ?bandwidthtest=true hinter dem Key? Entfernen, sonst bist du nicht öffentlich live.'
        ],
        links: [streamSettingsLink]
    },
    {
        id: 'netzwerk',
        title: 'Stream ruckelt – OBS meldet ausgelassene Frames (Netzwerk)',
        keywords: 'ruckelt lag laggt dropped frames netzwerk ausgelassen gelb rot quadrat buffering internet wlan',
        cause: 'Dein Upload schafft die eingestellte Bitrate nicht oder schwankt (typisch bei WLAN).',
        fixes: [
            'Bitrate senken – der OBS-Rechner zeigt dir einen sicheren Wert.',
            'LAN-Kabel statt WLAN verwenden.',
            'Andere Uploads stoppen: Cloud-Backups (OneDrive, Google Drive, iCloud), Downloads, Updates, Videocalls im Haushalt.',
            'Einstellungen → Erweitert → «Bitrate dynamisch ändern, um Überlastung zu bewältigen» aktivieren.',
            'Mit dem unsichtbaren Test-Stream und dem Twitch Inspector prüfen, ob die Bitrate stabil ist.'
        ],
        links: [inspectorLink]
    },
    {
        id: 'kodierung',
        title: '«Kodierung überlastet!» – Stream läuft stockend oder in Zeitlupe',
        keywords: 'kodierung überlastet encoding overloaded cpu prozessor zeitlupe stockt',
        cause: 'Dein PC schafft es nicht, das Video schnell genug zu komprimieren.',
        fixes: [
            'Hardware-Encoder nutzen (NVIDIA NVENC, AMD oder Intel QuickSync) statt x264.',
            'Schnellere Voreinstellung wählen: x264 «veryfast» → «superfast», NVENC P5 → P4.',
            'Ausgabeauflösung auf 1280×720 oder FPS auf 30 senken.',
            'FPS im Spiel begrenzen (z. B. auf 60) und unnötige Programme schliessen.'
        ]
    },
    {
        id: 'render',
        title: '«Frames aufgrund von Renderverzögerung verpasst»',
        keywords: 'render verzögerung rendering lag grafikkarte gpu 100',
        cause: 'Das Spiel lastet die Grafikkarte zu 100 % aus und OBS kommt nicht mehr dran.',
        fixes: [
            'FPS im Spiel begrenzen (z. B. 60 oder 144 statt «unbegrenzt») oder V-Sync einschalten.',
            'Grafikdetails im Spiel etwas senken.',
            'Windows: OBS als Administrator starten – OBS erhält dann Vorrang bei der Grafikkarte.',
            'Nicht benötigte Quellen (z. B. viele Browserquellen) entfernen.'
        ]
    },
    {
        id: 'schwarz',
        title: 'Schwarzes Bild bei Spiel- oder Bildschirmaufnahme',
        keywords: 'schwarz black screen bildschirm spielaufnahme game capture fensteraufnahme laptop',
        cause: 'Falsche Aufnahme-Methode oder (bei Laptops) die falsche Grafikkarte für OBS.',
        fixes: [
            'Für Spiele «Spielaufnahme», für Programme «Fensteraufnahme» mit Methode «Windows 10 (1903 und neuer)».',
            'Laptop mit zwei Grafikchips: Windows-Einstellungen → System → Anzeige → Grafik → OBS hinzufügen → «Hohe Leistung» für Spielaufnahme bzw. «Energiesparmodus» für Bildschirmaufnahme.',
            'OBS als Administrator starten.',
            'Im Spiel «Randloses Fenster» statt «Vollbild» wählen.',
            'Mac: Systemeinstellungen → Datenschutz & Sicherheit → Bildschirm- und Audioaufnahme → OBS erlauben.'
        ]
    },
    {
        id: 'kein-ton',
        title: 'Kein Ton im Stream – Stimme oder Spiel fehlt',
        keywords: 'kein ton audio stumm mikrofon mic spielsound sound hören',
        cause: 'Falsches Audiogerät ausgewählt, Quelle stummgeschaltet oder fehlende Berechtigung.',
        fixes: [
            'OBS → Einstellungen → Audio: Desktop-Audio = «Standard» (oder deine Kopfhörer), Mikrofon/AUX = dein Mikrofon.',
            'Im Audio-Mixer: Lautsprecher-Symbol nicht rot/durchgestrichen und Regler nicht ganz unten.',
            'Windows: Einstellungen → Datenschutz → Mikrofon → Zugriff für Desktop-Apps erlauben.',
            'Mac: Mikrofon-Zugriff für OBS in den Systemeinstellungen erlauben; Spielsound mit der Quelle «macOS-Audioaufnahme» aufnehmen.'
        ]
    },
    {
        id: 'echo',
        title: 'Echo – Zuschauer hören den Ton doppelt',
        keywords: 'echo doppelt hall rückkopplung feedback',
        cause: 'Das Mikrofon nimmt Lautsprecher-Ton auf oder eine Quelle ist zweimal vorhanden.',
        fixes: [
            'Kopfhörer statt Lautsprecher verwenden.',
            'Audio-Mixer → ⋮ → «Erweiterte Audioeigenschaften»: Audioüberwachung überall auf «Überwachung aus».',
            'Prüfen, ob dein Mikrofon nicht doppelt drin ist (unter Einstellungen → Audio UND als eigene Quelle in der Szene).'
        ]
    },
    {
        id: 'zuschauer-buffering',
        title: 'Bei mir läuft alles – aber Zuschauer haben Buffering',
        keywords: 'zuschauer buffering laden lädt qualität transkodierung viewer',
        cause: 'Kleine Kanäle bekommen nicht immer Qualitätsstufen. Dann müssen alle Zuschauer deine volle Bitrate laden.',
        fixes: [
            'Bitrate auf 3500–4500 Kbps senken, eventuell 720p statt 1080p.',
            'Frag Zuschauer, ob sie im Player unter ⚙ → Qualität mehrere Stufen sehen. Gibt es nur «Quelle», fehlt die Transkodierung.',
            'Im Twitch Inspector prüfen, ob deine Bitrate stabil bleibt.'
        ],
        links: [inspectorLink]
    },
    {
        id: 'mikro-qualitaet',
        title: 'Mikrofon rauscht, ist zu leise oder übersteuert',
        keywords: 'rauschen rauscht leise laut übersteuert verzerrt mikrofon',
        cause: 'Mikrofon falsch positioniert oder ohne Filter.',
        fixes: [
            'Mikrofon näher an den Mund (ca. 10–20 cm) und den Mikrofonpegel in Windows bzw. macOS prüfen.',
            'Filter: «Rauschunterdrückung» (RNNoise), bei zu leiser Stimme «Verstärkung», dann «Kompressor» und «Limiter» (−1 dB).',
            'Ziel im Audio-Mixer: Sprache im gelben Bereich, nie dauerhaft rot.'
        ]
    },
    {
        id: 'key-geleakt',
        title: 'Mein Stream-Key ist öffentlich geworden',
        keywords: 'geleakt öffentlich gestohlen gehackt hack key',
        cause: 'Mit dem Key kann jede Person auf deinem Kanal streamen.',
        fixes: [
            'Sofort im Dashboard → Einstellungen → Stream auf «Zurücksetzen» klicken.',
            'Den neuen Key in OBS eintragen (oder «Konto verbinden» nutzen).',
            'Bei Verdacht auf einen Hack: Passwort ändern und 2FA prüfen.'
        ],
        links: [streamSettingsLink, securityLink]
    },
    {
        id: 'keine-zuschauer',
        title: 'Ich bin live, aber niemand findet mich',
        keywords: 'zuschauer viewer niemand finden wachsen gefunden',
        cause: 'Am Anfang völlig normal – auf Twitch sind gleichzeitig zehntausende Kanäle live.',
        fixes: [
            'In einem privaten Browserfenster deinen Kanal öffnen und prüfen, ob du wirklich live bist.',
            'Kategorie und passende Tags setzen (z. B. Deutsch, Schweiz).',
            'Regelmässige Streamzeiten wählen und im Profil bzw. im Streamplan eintragen.',
            'Den Link zu deinem Kanal mit Freunden, auf Discord und Social Media teilen.'
        ],
        links: [streamManagerLink]
    }
];
