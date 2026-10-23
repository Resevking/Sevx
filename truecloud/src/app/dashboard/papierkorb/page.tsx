import type { Metadata } from 'next';
import { TrashList } from '@/components/dashboard/trash-list';

export const metadata: Metadata = { title: 'Papierkorb' };

export default function TrashPage() {
    return (
        <div>
            <h1 className="mb-2 text-2xl font-bold tracking-tight text-ink-950">Papierkorb</h1>
            <TrashList />
        </div>
    );
}
