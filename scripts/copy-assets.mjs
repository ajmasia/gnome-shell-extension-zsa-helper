// Copies the non-TypeScript extension assets into dist/ and compiles the GSettings schema.
import { cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const assets = ['metadata.json', 'schemas', 'stylesheet.css'];

for (const asset of assets) {
    if (existsSync(asset)) {
        cpSync(asset, `dist/${asset}`, { recursive: true });
    }
}

execFileSync('glib-compile-schemas', ['dist/schemas'], { stdio: 'inherit' });
