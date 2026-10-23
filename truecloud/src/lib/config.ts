import 'server-only';

// Umgebungsvariablen werden erst gelesen, wenn sie gebraucht werden. So lässt sich
// die App auch ohne vollständige Konfiguration bauen (z. B. im Docker-Build).

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Umgebungsvariable ${name} fehlt. Siehe .env.example.`);
    return value;
}

function optional(name: string): string | undefined {
    const value = process.env[name];
    return value ? value : undefined;
}

export const config = {
    get appUrl(): string {
        return (optional('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    },
    get isProduction(): boolean {
        return process.env.NODE_ENV === 'production';
    },
    get secureCookies(): boolean {
        return this.appUrl.startsWith('https://');
    },
    get adminEmails(): string[] {
        return (optional('ADMIN_EMAILS') ?? '')
            .split(',')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
    },
    get cronSecret(): string | undefined {
        return optional('CRON_SECRET');
    },
    s3: {
        get endpoint() {
            return required('S3_ENDPOINT');
        },
        get region() {
            return required('S3_REGION');
        },
        get bucket() {
            return required('S3_BUCKET');
        },
        get accessKeyId() {
            return required('S3_ACCESS_KEY_ID');
        },
        get secretAccessKey() {
            return required('S3_SECRET_ACCESS_KEY');
        },
        get forcePathStyle() {
            return optional('S3_FORCE_PATH_STYLE') === 'true';
        }
    },
    stripe: {
        get secretKey() {
            return required('STRIPE_SECRET_KEY');
        },
        get webhookSecret() {
            return required('STRIPE_WEBHOOK_SECRET');
        },
        get portalConfigurationId() {
            return optional('STRIPE_PORTAL_CONFIGURATION_ID');
        },
        get automaticTax() {
            return optional('STRIPE_AUTOMATIC_TAX') === 'true';
        },
        get isConfigured() {
            return Boolean(optional('STRIPE_SECRET_KEY'));
        }
    },
    smtp: {
        get host() {
            return optional('SMTP_HOST');
        },
        get port() {
            return Number(optional('SMTP_PORT') ?? 587);
        },
        get user() {
            return optional('SMTP_USER');
        },
        get password() {
            return optional('SMTP_PASSWORD');
        },
        get from() {
            return optional('SMTP_FROM') ?? 'TrueCloud <no-reply@truecloud.online>';
        }
    }
};
