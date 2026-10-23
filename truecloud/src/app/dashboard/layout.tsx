import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/shell';
import { isAdmin, requireUser } from '@/lib/auth';
import { getPlan } from '@/lib/plans';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const user = await requireUser();
    const plan = getPlan(user.plan);
    return (
        <DashboardShell
            user={{
                name: user.name,
                email: user.email,
                emailVerified: Boolean(user.emailVerifiedAt),
                isAdmin: isAdmin(user),
                planName: plan.name,
                usedBytes: Number(user.usedBytes),
                quotaBytes: Number(user.quotaBytes),
                isPaid: plan.priceMonthly > 0
            }}
        >
            {children}
        </DashboardShell>
    );
}
