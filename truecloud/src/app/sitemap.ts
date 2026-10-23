import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const base = process.env.APP_URL ?? 'https://truecloud.online';
    return ['', '/preise', '/sicherheit', '/registrieren', '/login', '/impressum', '/datenschutz', '/agb'].map((path) => ({
        url: `${base}${path}`,
        changeFrequency: 'monthly',
        priority: path === '' ? 1 : 0.6
    }));
}
