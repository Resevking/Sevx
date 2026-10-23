import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FileManager } from '@/components/dashboard/file-manager';
import { requireUser } from '@/lib/auth';
import { canProtectShares } from '@/lib/plans';

export const metadata: Metadata = { title: 'Meine Dateien' };

export default async function FilesPage() {
    const user = await requireUser('/dashboard/dateien');
    return (
        <Suspense>
            <FileManager canProtectShares={canProtectShares(user.plan)} emailVerified={Boolean(user.emailVerifiedAt)} />
        </Suspense>
    );
}
