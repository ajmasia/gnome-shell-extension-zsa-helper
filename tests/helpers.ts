import { readFileSync } from 'node:fs';
import { layoutFromOryxJson } from '../src/core/layout/from-oryx.js';
import type { Layout } from '../src/core/layout/model.js';

export function readFixture(name: string): string {
    return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

export function readJsonFixture(name: string): unknown {
    return JSON.parse(readFixture(name));
}

/** The real "Personal Settings" layout (aOa9o/nlzDl9) as cached by Keymapp. */
export function realLayout(): Layout {
    return layoutFromOryxJson(readJsonFixture('keymapp-revision-aOa9o-nlzDl9.json'));
}
