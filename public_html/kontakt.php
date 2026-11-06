<?php
/*
 * r2sev.com – Kontaktformular
 *
 * Nimmt das Formular von der Startseite entgegen, prüft es und schickt die
 * Nachricht per E-Mail weiter. Empfänger-Adresse und SMTP-Passwort stehen in
 * private/config.php. Diese Datei liegt nur auf dem Server, ist nicht im
 * Git-Repository und aus dem Web nicht abrufbar.
 */

declare(strict_types=1);

ini_set('display_errors', '0');

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_REQUEST_BYTES = 32768;
const RATE_LIMIT_MAX = 5;          // Nachrichten …
const RATE_LIMIT_WINDOW = 3600;    // … pro Stunde und Absender

const PRIVATE_DIR = __DIR__ . '/private';

// Jede gespeicherte Datei beginnt hiermit. Selbst wenn sie jemand im Browser aufruft,
// bricht PHP sofort ab und es wird nichts angezeigt.
const STORAGE_GUARD = "<?php exit; ?>\n";

header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');

$wantsJson = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;

/* ---------- Antworten ---------- */

/**
 * Beendet die Anfrage. JavaScript bekommt JSON, Browser ohne JavaScript
 * eine Weiterleitung (Erfolg) oder eine einfache Fehlerseite.
 */
function finish(bool $wantsJson, int $status, string $error = '', array $fields = []): void
{
    if ($wantsJson) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $body = ['ok' => $error === ''];
        if ($error !== '') {
            $body['error'] = $error;
        }
        if ($fields) {
            $body['fields'] = $fields;
        }
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($error === '') {
        header('Location: /danke/', true, 303);
        exit;
    }

    $messages = [
        'validation' => $fields ? implode(' ', $fields) : 'Bitte prüf deine Angaben.',
        'rate_limit' => 'Du hast gerade schon mehrere Nachrichten geschickt. Bitte versuch es in einer Stunde nochmal.',
        'forbidden' => 'Diese Anfrage wurde abgelehnt.',
        'too_large' => 'Deine Nachricht ist zu lang.',
        'server' => 'Beim Senden ist ein Fehler aufgetreten. Bitte versuch es später nochmal.',
    ];
    $text = htmlspecialchars($messages[$error] ?? $messages['server'], ENT_QUOTES, 'UTF-8');

    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo <<<HTML
<!doctype html>
<html lang="de-CH">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Nachricht nicht gesendet – r2sev</title>
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="stylesheet" href="/css/style.css" />
    </head>
    <body>
        <div class="backdrop" aria-hidden="true"></div>
        <main class="page simple">
            <h1 class="simple__title">Nachricht nicht gesendet</h1>
            <p class="simple__text">{$text}</p>
            <a class="button-link" href="/#kontakt">Zurück zum Formular</a>
        </main>
    </body>
</html>
HTML;
    exit;
}

/* ---------- Hilfsfunktionen ---------- */

function textLength(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

/** Liest ein Textfeld aus dem Formular. Arrays und ungültiges UTF-8 gelten als leer. */
function field(string $name): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || preg_match('//u', $value) !== 1) {
        return '';
    }
    return $value;
}

/** Einzeiliger Text: Steuerzeichen (inkl. Zeilenumbrüche) entfernen, Leerraum zusammenfassen. */
function singleLine(string $value): string
{
    $value = preg_replace('/[\p{Cc}\x{2028}\x{2029}]+/u', ' ', $value) ?? '';
    $value = preg_replace('/[\x{200B}\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]+/u', '', $value) ?? '';
    $value = preg_replace('/\s+/u', ' ', $value) ?? '';
    return trim($value);
}

/** Mehrzeiliger Text: Zeilenumbrüche vereinheitlichen, übrige Steuerzeichen entfernen. */
function multiLine(string $value): string
{
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = preg_replace('/[^\P{Cc}\n\t]+/u', '', $value) ?? '';
    return trim($value);
}

function storageDir(): string
{
    $dir = PRIVATE_DIR . '/storage';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

/** Zufälliger Schlüssel, um IP-Adressen nur gehasht zu speichern. Wird beim ersten Aufruf erzeugt. */
function hashSecret(): string
{
    $file = storageDir() . '/secret.php';
    if (is_file($file)) {
        $secret = trim(substr((string) file_get_contents($file), strlen(STORAGE_GUARD)));
        if (strlen($secret) === 64) {
            return $secret;
        }
    }
    $secret = bin2hex(random_bytes(32));
    @file_put_contents($file, STORAGE_GUARD . $secret, LOCK_EX);
    @chmod($file, 0600);
    return $secret;
}

/**
 * Höchstens RATE_LIMIT_MAX Nachrichten pro Stunde und Absender.
 * Gespeichert wird nur ein Hash der IP-Adresse mit Zeitstempeln; nach einer Stunde wird er gelöscht.
 */
function rateLimitExceeded(): bool
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if ($ip === '') {
        return false;
    }

    $dir = storageDir();
    $now = time();
    $file = $dir . '/rl-' . hash_hmac('sha256', $ip, hashSecret()) . '.php';

    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        return false; // Speicher nicht verfügbar: lieber senden als echte Nachrichten blockieren
    }

    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle) ?: '';
    $times = json_decode(substr($raw, strlen(STORAGE_GUARD)), true);
    $times = is_array($times) ? $times : [];
    $times = array_values(array_filter($times, static function ($t) use ($now): bool {
        return is_int($t) && $t > $now - RATE_LIMIT_WINDOW;
    }));

    $exceeded = count($times) >= RATE_LIMIT_MAX;
    if (!$exceeded) {
        $times[] = $now;
    }

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, STORAGE_GUARD . json_encode($times));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    @chmod($file, 0600);

    // Ab und zu abgelaufene Einträge anderer Absender aufräumen.
    if (random_int(1, 20) === 1) {
        foreach (glob($dir . '/rl-*.php') ?: [] as $old) {
            if (@filemtime($old) < $now - RATE_LIMIT_WINDOW) {
                @unlink($old);
            }
        }
    }

    return $exceeded;
}

/* ---------- Anfrage prüfen ---------- */

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' || $method === 'HEAD') {
    header('Location: /#kontakt', true, 303);
    exit;
}
if ($method !== 'POST') {
    header('Allow: POST');
    finish($wantsJson, 405, 'forbidden');
}

// Nur Anfragen von der eigenen Website annehmen.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originHost = (string) parse_url($origin, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT);
    $originHostPort = $originHost . ($originPort ? ':' . $originPort : '');
    if (strcasecmp($originHostPort, (string) ($_SERVER['HTTP_HOST'] ?? '')) !== 0) {
        finish($wantsJson, 403, 'forbidden');
    }
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_REQUEST_BYTES) {
    finish($wantsJson, 413, 'too_large');
}

// Honeypot: Menschen sehen dieses Feld nicht. Ist es ausgefüllt, war es ein Bot.
// Wir tun so, als hätte es geklappt, damit der Bot nichts lernt.
if (trim(field('website')) !== '') {
    finish($wantsJson, 200);
}

$name = singleLine(field('name'));
$email = singleLine(field('email'));
$message = multiLine(field('message'));

$errors = [];
if ($name === '') {
    $errors['name'] = 'Bitte gib deinen Namen ein.';
} elseif (textLength($name) > MAX_NAME_LENGTH) {
    $errors['name'] = 'Dein Name ist zu lang (höchstens ' . MAX_NAME_LENGTH . ' Zeichen).';
}

if ($email === '') {
    $errors['email'] = 'Bitte gib deine E-Mail-Adresse ein.';
} elseif (strlen($email) > MAX_EMAIL_LENGTH || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    $errors['email'] = 'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.ch.';
}

if ($message === '') {
    $errors['message'] = 'Bitte schreib eine Nachricht.';
} elseif (textLength($message) > MAX_MESSAGE_LENGTH) {
    $errors['message'] = 'Deine Nachricht ist zu lang (höchstens ' . MAX_MESSAGE_LENGTH . ' Zeichen).';
}

if ($errors) {
    finish($wantsJson, 422, 'validation', $errors);
}

/* ---------- Einstellungen laden ---------- */

$configFile = PRIVATE_DIR . '/config.php';
$config = is_file($configFile) ? require $configFile : null;

$configOk = is_array($config)
    && filter_var($config['to_email'] ?? '', FILTER_VALIDATE_EMAIL)
    && filter_var($config['from_email'] ?? '', FILTER_VALIDATE_EMAIL)
    && strpos((string) ($config['to_email'] ?? ''), 'deine-adresse@') !== 0
    && (empty($config['smtp']['host']) || (
        !empty($config['smtp']['username'])
        && !empty($config['smtp']['password'])
        && strpos((string) $config['smtp']['password'], 'HIER-') !== 0
    ));

if (!$configOk) {
    error_log('r2sev kontakt: private/config.php fehlt oder ist nicht ausgefüllt.');
    finish($wantsJson, 500, 'server');
}

if (rateLimitExceeded()) {
    finish($wantsJson, 429, 'rate_limit');
}

/* ---------- Senden ---------- */

require PRIVATE_DIR . '/lib/PHPMailer/Exception.php';
require PRIVATE_DIR . '/lib/PHPMailer/PHPMailer.php';
require PRIVATE_DIR . '/lib/PHPMailer/SMTP.php';

$site = (string) ($config['site_name'] ?? 'r2sev.com');
$sentAt = (new DateTimeImmutable('now', new DateTimeZone('Europe/Zurich')))->format('d.m.Y, H:i');

$mail = new PHPMailer(true);

try {
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->Encoding = PHPMailer::ENCODING_BASE64;
    $mail->XMailer = ' ';

    $smtp = $config['smtp'] ?? [];
    if (!empty($smtp['host'])) {
        $mail->isSMTP();
        $mail->Host = (string) $smtp['host'];
        $mail->Port = (int) ($smtp['port'] ?? 465);
        $mail->SMTPAuth = true;
        $mail->Username = (string) $smtp['username'];
        $mail->Password = (string) $smtp['password'];
        $secure = (string) ($smtp['secure'] ?? 'ssl');
        $mail->SMTPSecure = $secure === 'tls' ? PHPMailer::ENCRYPTION_STARTTLS : ($secure === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : '');
        $mail->SMTPAutoTLS = $secure !== 'none';
        $mail->Timeout = 15;
        $mail->getSMTPInstance()->Timelimit = 20; // nie länger als 20 s auf den Mailserver warten
    } else {
        $mail->isMail();
    }

    $mail->setFrom((string) $config['from_email'], (string) ($config['from_name'] ?? $site . ' Kontaktformular'));
    $mail->addAddress((string) $config['to_email']);
    $mail->addReplyTo($email, $name);

    $mail->isHTML(false);
    $mail->Subject = 'Neue Nachricht von ' . $name . ' über ' . $site;
    $mail->Body = "Neue Nachricht über das Kontaktformular auf {$site}\n"
        . "\n"
        . "Name:     {$name}\n"
        . "E-Mail:   {$email}\n"
        . "Gesendet: {$sentAt}\n"
        . "\n"
        . "Nachricht:\n"
        . "----------------------------------------\n"
        . $message . "\n"
        . "----------------------------------------\n"
        . "\n"
        . "Zum Antworten einfach auf diese E-Mail antworten.\n";

    $mail->send();
} catch (MailException $e) {
    // Nur die technische Fehlermeldung protokollieren, keine Inhalte der Nachricht.
    error_log('r2sev kontakt: Versand fehlgeschlagen: ' . $mail->ErrorInfo);
    finish($wantsJson, 502, 'server');
}

finish($wantsJson, 200);
