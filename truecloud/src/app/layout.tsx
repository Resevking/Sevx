import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    metadataBase: new URL(process.env.APP_URL ?? 'https://truecloud.online'),
    title: { default: 'TrueCloud – Fairer Cloud-Speicher', template: '%s · TrueCloud' },
    description:
        'TrueCloud ist dein sicherer Cloud-Speicher mit fairen Preisen. Dateien hochladen, organisieren und teilen – gespeichert in europäischen Rechenzentren. Ab CHF 2.90 im Monat.',
    applicationName: 'TrueCloud',
    openGraph: {
        type: 'website',
        siteName: 'TrueCloud',
        locale: 'de_CH',
        url: '/',
        title: 'TrueCloud – Fairer Cloud-Speicher',
        description: 'Sicherer Cloud-Speicher mit fairen Preisen. 1 TB für CHF 12.90 im Monat.'
    },
    robots: { index: true, follow: true }
};

export const viewport: Viewport = {
    themeColor: '#1b53f5'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="de-CH">
            <body className="min-h-screen">{children}</body>
        </html>
    );
}
