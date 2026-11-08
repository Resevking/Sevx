import Head from 'next/head';
import Link from 'next/link';
import TwitchSetupApp from '../components/twitch-setup/TwitchSetupApp';

export default function TwitchSetupPage() {
    return (
        <>
            <Head>
                <title>Twitch Setup-Assistent</title>
                <meta
                    name="description"
                    content="Schritt für Schritt zum ersten Twitch-Stream: Konto einrichten, OBS-Einstellungen berechnen und typische Probleme lösen."
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <TwitchSetupApp
                variant="web"
                backLink={
                    <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                        ← Zur Startseite
                    </Link>
                }
            />
        </>
    );
}
