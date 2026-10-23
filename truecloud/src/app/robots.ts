import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const base = process.env.APP_URL ?? 'https://truecloud.online';
    return {
        rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/api', '/s/'] }],
        sitemap: `${base}/sitemap.xml`
    };
}
