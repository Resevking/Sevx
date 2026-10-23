import path from 'node:path';
import { fileURLToPath } from 'node:url';

const securityHeaders = [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    // Projektwurzel explizit setzen, damit der Standalone-Build nicht ins Repo-Root ausweicht
    outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
    poweredByHeader: false,
    reactStrictMode: true,
    async headers() {
        return [{ source: '/:path*', headers: securityHeaders }];
    }
};

export default nextConfig;
