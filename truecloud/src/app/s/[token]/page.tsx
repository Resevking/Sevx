import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkIcon } from 'lucide-react';
import { Logo } from '@/components/logo';
import { FileIcon } from '@/components/ui/file-icon';
import { ShareDownload } from '@/components/share-download';
import { findPublicShare } from '@/lib/shares';
import { formatBytes, formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Geteilte Datei', robots: { index: false, follow: false } };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const share = await findPublicShare(token);

    return (
        <div className="flex min-h-screen flex-col bg-ink-50/60">
            <header className="container-page flex h-16 items-center justify-between">
                <Logo />
                <Link href="/registrieren" className="btn btn-secondary btn-sm">
                    Kostenlos registrieren
                </Link>
            </header>
            <main className="flex flex-1 items-center justify-center px-4 py-12">
                <div className="card w-full max-w-md p-8 text-center">
                    {share ? (
                        <>
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                                <FileIcon mimeType={share.file.mimeType} name={share.file.name} className="h-8 w-8" />
                            </div>
                            <h1 className="mt-5 break-words text-xl font-bold text-ink-950">{share.file.name}</h1>
                            <p className="mt-1 text-sm text-ink-600">
                                {formatBytes(share.file.size)}
                                {share.expiresAt && ` · verfügbar bis ${formatDate(share.expiresAt)}`}
                            </p>
                            <div className="mt-8 text-left">
                                <ShareDownload token={token} needsPassword={Boolean(share.passwordHash)} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
                                <LinkIcon className="h-7 w-7" />
                            </div>
                            <h1 className="mt-5 text-xl font-bold text-ink-950">Link nicht verfügbar</h1>
                            <p className="mt-2 text-sm text-ink-600">Dieser Freigabelink ist ungültig, abgelaufen oder wurde entfernt.</p>
                        </>
                    )}
                </div>
            </main>
            <footer className="py-8 text-center text-xs text-ink-500">
                Geteilt mit <Link href="/" className="font-medium text-brand-700 hover:underline">TrueCloud</Link> – fairer Cloud-Speicher aus Europa ·{' '}
                <a href={`mailto:support@truecloud.online?subject=${encodeURIComponent(`Missbrauch melden: ${token}`)}`} className="hover:underline">
                    Missbrauch melden
                </a>
            </footer>
        </div>
    );
}
