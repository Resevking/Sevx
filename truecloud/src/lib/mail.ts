import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
    if (!config.smtp.host) return null;
    transporter ??= nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined
    });
    return transporter;
}

interface Mail {
    to: string;
    subject: string;
    text: string;
    action?: { label: string; url: string };
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function renderHtml(mail: Mail): string {
    const paragraphs = mail.text
        .split('\n\n')
        .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('');
    const button = mail.action
        ? `<p style="margin:24px 0"><a href="${escapeHtml(mail.action.url)}" style="background:#1b53f5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(mail.action.label)}</a></p>`
        : '';
    return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2430">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="font-size:20px;font-weight:700;margin-bottom:24px;color:#1b53f5">TrueCloud</div>
<div style="background:#fff;border-radius:12px;padding:28px">${paragraphs}${button}</div>
<p style="font-size:12px;color:#667491;margin-top:24px">TrueCloud · truecloud.online</p>
</div></body></html>`;
}

export async function sendMail(mail: Mail): Promise<void> {
    const text = mail.action ? `${mail.text}\n\n${mail.action.label}: ${mail.action.url}` : mail.text;
    const t = getTransporter();
    if (!t) {
        // Ohne SMTP-Konfiguration (lokale Entwicklung) wird die Mail nur geloggt.
        console.info(`[mail] An: ${mail.to}\nBetreff: ${mail.subject}\n\n${text}\n`);
        return;
    }
    await t.sendMail({ from: config.smtp.from, to: mail.to, subject: mail.subject, text, html: renderHtml(mail) });
}
