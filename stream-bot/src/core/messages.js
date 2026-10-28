// Standardtexte des Bots. Jeder Text lässt sich in config.yml unter "messages:" überschreiben.

export const DEFAULT_MESSAGES = {
    commandList: 'Befehle: {list}',
    uptime: '{channel} ist seit {uptime} live.',
    offline: '{channel} ist gerade offline.',
    followage: '{target} folgt {channel} seit {duration} (seit dem {date}).',
    notFollowing: '{target} folgt {channel} (noch) nicht.',
    title: 'Titel: {title}',
    titleChanged: 'Neuer Titel: {title}',
    game: 'Kategorie: {game}',
    gameChanged: 'Neue Kategorie: {game}',
    gameNotFound: 'Kategorie "{query}" nicht gefunden.',
    shoutout: 'Schaut unbedingt bei {name} vorbei! Zuletzt gestreamt: {game} 👉 https://twitch.tv/{target}',
    userNotFound: 'Nutzer "{query}" nicht gefunden.',
    clip: 'Clip erstellt: {url}',
    clipFailed: 'Clip konnte nicht erstellt werden – ist der Stream live?',
    sceneChanged: 'Szene gewechselt zu "{scene}".',
    sceneNotFound: 'Szene "{query}" nicht gefunden. Verfügbar: {scenes}',
    sceneList: 'Szenen: {scenes} (aktuell: {current})',
    sourceChanged: 'Quelle "{source}" ist jetzt {state}.',
    sourceNotFound: 'Quelle "{query}" in der aktuellen Szene nicht gefunden.',
    muted: '"{input}" ist jetzt stumm.',
    unmuted: '"{input}" ist wieder an.',
    replaySaved: 'Replay gespeichert! 🎬',
    obsOffline: 'OBS ist gerade nicht verbunden.',
    permit: '{target} darf in den nächsten {seconds} Sekunden einen Link posten.',
    commandAdded: 'Befehl {prefix}{command} wurde angelegt.',
    commandEdited: 'Befehl {prefix}{command} wurde geändert.',
    commandDeleted: 'Befehl {prefix}{command} wurde gelöscht.',
    commandExists: 'Befehl {prefix}{command} gibt es schon.',
    commandMissing: 'Befehl {prefix}{command} gibt es nicht.',
    commandProtected: '{prefix}{command} ist ein eingebauter oder in der config.yml festgelegter Befehl und kann nur dort geändert werden.',
    counter: '{name}: {value}',
    usage: 'Benutzung: {usage}',
    // Moderation – {action} ist z.B. "Nachricht gelöscht" oder "Timeout 60 s"
    modLinks: '{user}, Links bitte nur mit Erlaubnis eines Mods. ({action})',
    modCaps: '{user}, bitte nicht so viel GROSSSCHREIBUNG. ({action})',
    modWords: '{user}, das Wort ist hier nicht erwünscht. ({action})',
    modLength: '{user}, deine Nachricht ist zu lang. ({action})',
    modEmotes: '{user}, bitte nicht so viele Emotes. ({action})'
};

export class Messages {
    constructor({ overrides = {}, templates, prefix, channelName }) {
        this.texts = { ...DEFAULT_MESSAGES, ...overrides };
        this.templates = templates;
        this.prefix = prefix;
        this.channelName = channelName;
    }

    async format(key, vars = {}) {
        const template = this.texts[key] ?? key;
        return this.templates.render(template, { prefix: this.prefix, channel: this.channelName(), ...vars });
    }
}
