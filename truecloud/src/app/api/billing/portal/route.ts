import { ApiError, json, route } from '@/lib/api';
import { requireApiUser } from '@/lib/auth';
import { config } from '@/lib/config';
import { stripe } from '@/lib/stripe';

/** Öffnet das Stripe-Kundenportal (Zahlungsmethoden, Rechnungen, Kündigung). */
export const POST = route(async () => {
    const user = await requireApiUser();
    if (!user.stripeCustomerId) throw new ApiError(400, 'Du hast noch kein Abo abgeschlossen.');
    const session = await stripe().billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${config.appUrl}/dashboard/abo`,
        locale: 'de',
        ...(config.stripe.portalConfigurationId ? { configuration: config.stripe.portalConfigurationId } : {})
    });
    return json({ url: session.url });
});
