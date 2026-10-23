import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}
