<?php
/*
 * Einstellungen für das Kontaktformular.
 *
 * So geht's:
 *   1. Diese Datei auf dem Server kopieren und die Kopie "config.php" nennen
 *      (im selben Ordner: public_html/private/config.php).
 *   2. Unten deine Angaben eintragen und speichern.
 *
 * config.php wird nicht ins Git-Repository hochgeladen (.gitignore) und ist aus
 * dem Web nicht abrufbar (.htaccess). Deine private E-Mail-Adresse und das
 * Passwort sind damit für Besucher nicht sichtbar.
 */

return [
    // An diese Adresse werden die Nachrichten aus dem Formular geschickt (deine private Adresse).
    'to_email' => 'deine-adresse@gmail.com',

    // Absender: das Postfach, das du bei Hostinger für deine Domain angelegt hast.
    'from_email' => 'kontakt@r2sev.com',
    'from_name' => 'r2sev.com Kontaktformular',

    // Zugangsdaten dieses Postfachs (Hostinger: hPanel → E-Mails → dein Postfach).
    'smtp' => [
        'host' => 'smtp.hostinger.com',
        'port' => 465,
        'secure' => 'ssl', // 'ssl' für Port 465, 'tls' für Port 587
        'username' => 'kontakt@r2sev.com',
        'password' => 'HIER-DAS-PASSWORT-DES-POSTFACHS-EINTRAGEN',
    ],
];
