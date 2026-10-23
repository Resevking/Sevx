import 'server-only';
import type { TokenType, User } from '@prisma/client';
import { db } from './db';
import { config } from './config';
import { randomToken, sha256 } from './crypto';
import { sendMail } from './mail';

const TTL: Record<TokenType, number> = {
    EMAIL_VERIFY: 48 * 60 * 60 * 1000,
    PASSWORD_RESET: 60 * 60 * 1000
};

async function issueToken(userId: string, type: TokenType): Promise<string> {
    const token = randomToken();
    await db.authToken.deleteMany({ where: { userId, type, usedAt: null } });
    await db.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL[type]) } });
    return token;
}

/** Löst ein Token ein. Gibt die Benutzer-ID zurück oder null, wenn es ungültig/abgelaufen ist. */
export async function consumeToken(token: string, type: TokenType): Promise<string | null> {
    const record = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null;
    const { count } = await db.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    return count === 1 ? record.userId : null;
}

export async function sendVerificationMail(user: Pick<User, 'id' | 'email' | 'name'>): Promise<void> {
    const token = await issueToken(user.id, 'EMAIL_VERIFY');
    await sendMail({
        to: user.email,
        subject: 'Bitte bestätige deine E-Mail-Adresse',
        text: `Hallo${user.name ? ' ' + user.name : ''}\n\nwillkommen bei TrueCloud! Bitte bestätige deine E-Mail-Adresse, damit du Freigabelinks erstellen kannst.\n\nDer Link ist 48 Stunden gültig.`,
        action: { label: 'E-Mail bestätigen', url: `${config.appUrl}/email-bestaetigen?token=${token}` }
    });
}

export async function sendPasswordResetMail(user: Pick<User, 'id' | 'email' | 'name'>): Promise<void> {
    const token = await issueToken(user.id, 'PASSWORD_RESET');
    await sendMail({
        to: user.email,
        subject: 'Passwort zurücksetzen',
        text: `Hallo${user.name ? ' ' + user.name : ''}\n\nwir haben eine Anfrage erhalten, das Passwort für dein TrueCloud-Konto zurückzusetzen. Der Link ist eine Stunde gültig.\n\nFalls du das nicht warst, kannst du diese E-Mail ignorieren.`,
        action: { label: 'Neues Passwort festlegen', url: `${config.appUrl}/passwort-zuruecksetzen?token=${token}` }
    });
}
