import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Bitte gib eine gültige E-Mail-Adresse ein.').max(254);

export const passwordSchema = z
    .string()
    .min(10, 'Das Passwort muss mindestens 10 Zeichen lang sein.')
    .max(200, 'Das Passwort ist zu lang.');

export const nameSchema = z.string().trim().max(100, 'Der Name ist zu lang.');

export const idSchema = z.string().min(1).max(64);
