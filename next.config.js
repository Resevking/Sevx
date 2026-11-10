/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        stackbitPreview: process.env.STACKBIT_PREVIEW
    },
    trailingSlash: true,
    reactStrictMode: true,
    swcMinify: true,
    async rewrites() {
        return [
            // Statische 3D-Konfliktkarte aus public/konflikte/
            { source: '/konflikte', destination: '/konflikte/index.html' }
        ];
    }
};

module.exports = nextConfig;
