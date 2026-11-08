// Bundles the shared setup-assistant components (../src/components/twitch-setup) into dist/ for the Electron window.
// The CSS is generated afterwards by the Tailwind CLI (see "build:renderer" in package.json).

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const out = path.join(here, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The shared components live next to the website, which has its own React copy.
// Always use this app's React so there is exactly one React in the bundle.
const singleReact = {
    name: 'single-react',
    setup(b) {
        b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({ path: require.resolve(args.path, { paths: [here] }) }));
    }
};

await build({
    entryPoints: [path.join(here, 'renderer', 'index.tsx')],
    outfile: path.join(out, 'app.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'chrome120',
    jsx: 'automatic',
    tsconfig: path.join(here, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [singleReact],
    logLevel: 'info'
});

copyFileSync(path.join(here, 'renderer', 'index.html'), path.join(out, 'index.html'));
