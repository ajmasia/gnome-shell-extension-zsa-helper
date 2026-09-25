import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { describe, expect, it, sleep } from './harness.js';
import { LayoutCache } from '../src/layout/cache.js';
import {
    LayoutService,
    LayoutUnavailableError,
    type RevisionFetcher,
    type RevisionStore,
} from '../src/layout/layout-service.js';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);

/** The real layout fixture (aOa9o/nlzDl9), with the revision id replaced when asked. */
function fixture(revisionId = 'nlzDl9'): unknown {
    const [, contents] = GLib.file_get_contents(`${here}/../../tests/fixtures/keymapp-revision-aOa9o-nlzDl9.json`);
    const json = JSON.parse(new TextDecoder().decode(contents));
    json.layout.revision.hashId = revisionId;
    return json;
}

class FakeApi implements RevisionFetcher {
    calls = 0;
    constructor(private readonly result: 'ok' | 'fail' | 'hang' = 'ok') {}

    fetchRevision(_layoutId: string, revisionId: string, cancellable: Gio.Cancellable | null): Promise<unknown> {
        this.calls++;
        if (this.result === 'fail') {
            return Promise.reject(new Error('Could not connect'));
        }
        if (this.result === 'hang') {
            return new Promise((_resolve, reject) =>
                cancellable?.connect(() => reject(new Gio.IOErrorEnum({ code: Gio.IOErrorEnum.CANCELLED, message: 'cancelled' }))),
            );
        }
        return Promise.resolve(fixture(revisionId));
    }

    destroy(): void {}
}

class MemoryStore implements RevisionStore {
    entries = new Map<string, unknown>();
    failWrites = false;

    async read(layoutId: string, revisionId: string) {
        return this.entries.get(`${layoutId}-${revisionId}`) ?? null;
    }
    async write(layoutId: string, revisionId: string, json: unknown) {
        if (this.failWrites) {
            throw new Error('read-only file system');
        }
        this.entries.set(`${layoutId}-${revisionId}`, json);
    }
    async clear() {
        this.entries.clear();
    }
    async latestFor(layoutId: string, excludeRevisionId: string) {
        const keys = [...this.entries.keys()].filter(k => k.startsWith(`${layoutId}-`) && k !== `${layoutId}-${excludeRevisionId}`);
        const key = keys[keys.length - 1];
        return key ? { revisionId: key.split('-')[1]!, json: this.entries.get(key) } : null;
    }
}

const noKeymapp = async () => null;

describe('LayoutService', () => {
    it('downloads from Oryx and caches the revision', async () => {
        const cache = new MemoryStore();
        const service = new LayoutService({ api: new FakeApi(), cache, keymapp: noKeymapp });
        const { layout, source } = await service.get('aOa9o', 'nlzDl9');
        expect([source, layout.revisionId, layout.layers.length]).toEqual(['oryx-api', 'nlzDl9', 5]);
        expect(cache.entries.has('aOa9o-nlzDl9')).toBe(true);
    });

    it('prefers the cache and skips it on refresh', async () => {
        const cache = new MemoryStore();
        cache.entries.set('aOa9o-nlzDl9', fixture());
        const api = new FakeApi();
        const service = new LayoutService({ api, cache, keymapp: noKeymapp });
        expect((await service.get('aOa9o', 'nlzDl9')).source).toBe('cache');
        expect(api.calls).toBe(0);
        expect((await service.get('aOa9o', 'nlzDl9', { forceRefresh: true })).source).toBe('oryx-api');
        expect(api.calls).toBe(1);
    });

    it("falls back to Keymapp's cache when Oryx fails", async () => {
        const service = new LayoutService({ api: new FakeApi('fail'), cache: new MemoryStore(), keymapp: async () => fixture() });
        expect((await service.get('aOa9o', 'nlzDl9')).source).toBe('keymapp');
    });

    it('still returns the layout when caching it fails', async () => {
        const cache = new MemoryStore();
        cache.failWrites = true;
        const service = new LayoutService({ api: new FakeApi(), cache, keymapp: noKeymapp });
        const result = await service.get('aOa9o', 'nlzDl9');
        expect(result.source).toBe('oryx-api');
        expect(result.reasons.some(r => r.includes('read-only'))).toBe(true);
    });

    it('shows the last known revision when the flashed one cannot be loaded', async () => {
        const cache = new MemoryStore();
        cache.entries.set('aOa9o-oldRev1', fixture('oldRev1'));
        const service = new LayoutService({ api: new FakeApi('fail'), cache, keymapp: noKeymapp });
        const { layout, source } = await service.get('aOa9o', 'newRev2');
        expect([source, layout.revisionId]).toEqual(['stale-cache', 'oldRev1']);
    });

    it('fails with every reason when nothing is available', async () => {
        const service = new LayoutService({ api: new FakeApi('fail'), cache: new MemoryStore(), keymapp: noKeymapp });
        let error: unknown = null;
        try {
            await service.get('aOa9o', 'nlzDl9');
        } catch (e) {
            error = e;
        }
        expect(error instanceof LayoutUnavailableError).toBe(true);
        expect((error as LayoutUnavailableError).reasons.map(r => r.split(':')[0])).toEqual([
            'cache',
            'oryx-api',
            'keymapp',
            'stale-cache',
        ]);
    });

    it('rejects with a cancellation, not as unavailable, when cancelled', async () => {
        const service = new LayoutService({ api: new FakeApi('hang'), cache: new MemoryStore(), keymapp: noKeymapp });
        const pending = service.get('aOa9o', 'nlzDl9');
        await sleep(10);
        service.cancel();
        await expect(pending).toReject(/cancelled/);
    });
});

describe('LayoutCache', () => {
    it('finds the most recent other revision of a layout', async () => {
        const dir = GLib.dir_make_tmp('zsa-helper-cache-XXXXXX');
        const cache = new LayoutCache(dir);
        await cache.write('aOa9o', 'first1', fixture('first1'), null);
        await sleep(1100); // modification times have one-second resolution on some file systems
        await cache.write('aOa9o', 'second2', fixture('second2'), null);
        await cache.write('other', 'zzz999', fixture('zzz999'), null);

        expect((await cache.latestFor('aOa9o', 'current', null))?.revisionId).toBe('second2');
        expect((await cache.latestFor('aOa9o', 'second2', null))?.revisionId).toBe('first1');
        expect(await cache.latestFor('missing', 'x', null)).toBe(null);

        await cache.clear(null);
        expect(await cache.latestFor('aOa9o', 'current', null)).toBe(null);
        Gio.File.new_for_path(dir).delete(null);
    });
});
