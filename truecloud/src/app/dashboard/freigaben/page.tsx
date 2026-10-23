import type { Metadata } from 'next';
import { SharesList } from '@/components/dashboard/shares-list';

export const metadata: Metadata = { title: 'Freigaben' };

export default function SharesPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink-950">Freigaben</h1>
                <p className="mt-1 text-sm text-ink-600">Alle Links, mit denen andere deine Dateien herunterladen können.</p>
            </div>
            <SharesList />
        </div>
    );
}
