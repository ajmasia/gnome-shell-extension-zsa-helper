import Gio from '../lib/gio.js';
import { errorMessage, isCancelled } from '../lib/errors.js';
import { layoutFromOryxJson } from '../core/layout/from-oryx.js';
import type { Layout } from '../core/layout/model.js';
import { LayoutCache } from './cache.js';
import { readFromKeymapp } from './keymapp-cache.js';
import { OryxApiClient } from './oryx-api.js';

export type LayoutSource = 'cache' | 'oryx-api' | 'keymapp';

export interface LayoutResult {
    layout: Layout;
    source: LayoutSource;
}

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
    api?: OryxApiClient;
    cache?: LayoutCache;
    keymappDb?: string;
}

/**
 * Provides the layout flashed on the keyboard. Sources, in order: our own disk cache, the Oryx
 * API (the result is cached) and Keymapp's cache.
 */
export class LayoutService {
    private readonly api: OryxApiClient;
    private readonly cache: LayoutCache;
    private readonly keymappDb: string | undefined;
    private cancellable = new Gio.Cancellable();

    constructor(options: LayoutServiceOptions = {}) {
        this.api = options.api ?? new OryxApiClient();
        this.cache = options.cache ?? new LayoutCache();
        this.keymappDb = options.keymappDb;
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
                return { layout: layoutFromOryxJson(json), source };
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

        const fromKeymapp = await attempt('keymapp', () => readFromKeymapp(revisionId, cancellable, this.keymappDb));
        if (fromKeymapp) {
            return fromKeymapp;
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
