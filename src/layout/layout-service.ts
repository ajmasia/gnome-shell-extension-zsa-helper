import Gio from '../lib/gio.js';
import { errorMessage, isCancelled } from '../lib/errors.js';
import { layoutFromOryxJson } from '../core/layout/from-oryx.js';
import type { Layout } from '../core/layout/model.js';
import { LayoutCache } from './cache.js';
import { readFromKeymapp } from './keymapp-cache.js';
import { OryxApiClient } from './oryx-api.js';

/** `stale-cache`: the flashed revision could not be loaded, so an older cached one is shown. */
export type LayoutSource = 'cache' | 'oryx-api' | 'keymapp' | 'stale-cache';

export interface LayoutResult {
    layout: Layout;
    source: LayoutSource;
    /** Why earlier sources failed; useful when `source` is `stale-cache`. */
    reasons: string[];
}

/** Downloads a revision; `OryxApiClient` in production. */
export interface RevisionFetcher {
    fetchRevision(layoutId: string, revisionId: string, cancellable: Gio.Cancellable | null): Promise<unknown>;
    destroy(): void;
}

/** Stores raw revisions; `LayoutCache` in production. */
export interface RevisionStore {
    read(layoutId: string, revisionId: string, cancellable: Gio.Cancellable | null): Promise<unknown | null>;
    write(layoutId: string, revisionId: string, json: unknown, cancellable: Gio.Cancellable | null): Promise<void>;
    clear(cancellable: Gio.Cancellable | null): Promise<void>;
    latestFor(
        layoutId: string,
        excludeRevisionId: string,
        cancellable: Gio.Cancellable | null,
    ): Promise<{ revisionId: string; json: unknown } | null>;
}

/** Reads a revision from Keymapp's cache; `readFromKeymapp` in production. */
export type KeymappReader = (revisionId: string, cancellable: Gio.Cancellable | null) => Promise<unknown | null>;

export class LayoutUnavailableError extends Error {
    constructor(
        readonly layoutId: string,
        readonly revisionId: string,
        readonly reasons: string[],
    ) {
        super(`Layout ${layoutId}/${revisionId} is not available: ${reasons.join('; ')}`);
        this.name = 'LayoutUnavailableError';
    }
}

export interface LayoutServiceOptions {
    api?: RevisionFetcher;
    cache?: RevisionStore;
    keymapp?: KeymappReader;
}

/**
 * Provides the layout flashed on the keyboard. Sources, in order: our own disk cache, the Oryx
 * API (the result is cached) and Keymapp's cache. If all of them fail, the most recent cached
 * revision of the same layout is returned as `stale-cache`: an older layout beats no overlay.
 */
export class LayoutService {
    private readonly api: RevisionFetcher;
    private readonly cache: RevisionStore;
    private readonly keymapp: KeymappReader;
    private cancellable = new Gio.Cancellable();

    constructor(options: LayoutServiceOptions = {}) {
        this.api = options.api ?? new OryxApiClient();
        this.cache = options.cache ?? new LayoutCache();
        this.keymapp = options.keymapp ?? ((revisionId, cancellable) => readFromKeymapp(revisionId, cancellable));
    }

    async get(layoutId: string, revisionId: string, { forceRefresh = false } = {}): Promise<LayoutResult> {
        const cancellable = this.cancellable;
        const reasons: string[] = [];

        const attempt = async (source: LayoutSource, load: () => Promise<unknown | null>): Promise<LayoutResult | null> => {
            try {
                const json = await load();
                if (json === null) {
                    reasons.push(`${source}: not found`);
                    return null;
                }
                return { layout: layoutFromOryxJson(json), source, reasons };
            } catch (e) {
                if (isCancelled(e)) {
                    throw e;
                }
                reasons.push(`${source}: ${errorMessage(e)}`);
                return null;
            }
        };

        if (!forceRefresh) {
            const cached = await attempt('cache', () => this.cache.read(layoutId, revisionId, cancellable));
            if (cached) {
                return cached;
            }
        }

        let fetched: unknown = null;
        const fromApi = await attempt('oryx-api', async () => {
            fetched = await this.api.fetchRevision(layoutId, revisionId, cancellable);
            return fetched;
        });
        if (fromApi) {
            await this.store(layoutId, revisionId, fetched, reasons);
            return fromApi;
        }

        const fromKeymapp = await attempt('keymapp', () => this.keymapp(revisionId, cancellable));
        if (fromKeymapp) {
            return fromKeymapp;
        }

        const stale = await attempt('stale-cache', async () => {
            const latest = await this.cache.latestFor(layoutId, revisionId, cancellable);
            return latest?.json ?? null;
        });
        if (stale) {
            return stale;
        }

        throw new LayoutUnavailableError(layoutId, revisionId, reasons);
    }

    /** Clears our disk cache so the next `get()` downloads the layout again. */
    async invalidate(): Promise<void> {
        await this.cache.clear(this.cancellable);
    }

    /** Cancels requests in flight. The service can still be used afterwards. */
    cancel(): void {
        this.cancellable.cancel();
        this.cancellable = new Gio.Cancellable();
    }

    destroy(): void {
        this.cancellable.cancel();
        this.api.destroy();
    }

    private async store(layoutId: string, revisionId: string, json: unknown, reasons: string[]): Promise<void> {
        try {
            await this.cache.write(layoutId, revisionId, json, this.cancellable);
        } catch (e) {
            // A read-only cache must not hide a layout we already have.
            if (!isCancelled(e)) {
                reasons.push(`cache write: ${errorMessage(e)}`);
            }
        }
    }
}
