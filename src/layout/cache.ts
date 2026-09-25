import GLib from 'gi://GLib';
import Gio from '../lib/gio.js';
import { isNotFound } from '../lib/errors.js';
import { assertValidIds } from '../core/layout/oryx-query.js';

/** Default location: ~/.cache/zsa-helper/layouts. */
export function defaultCacheDir(): string {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'zsa-helper', 'layouts']);
}

/** Stores raw Oryx layout JSON on disk, one file per revision. */
export class LayoutCache {
    constructor(private readonly dir = defaultCacheDir()) {}

    async read(layoutId: string, revisionId: string, cancellable: Gio.Cancellable | null): Promise<unknown | null> {
        try {
            const [contents] = await this.file(layoutId, revisionId).load_contents_async(cancellable);
            return JSON.parse(new TextDecoder().decode(contents));
        } catch (e) {
            if (isNotFound(e) || e instanceof SyntaxError) {
                return null;
            }
            throw e;
        }
    }

    async write(layoutId: string, revisionId: string, json: unknown, cancellable: Gio.Cancellable | null): Promise<void> {
        const dir = Gio.File.new_for_path(this.dir);
        try {
            dir.make_directory_with_parents(cancellable);
        } catch (e) {
            if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))) {
                throw e;
            }
        }
        const bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify(json)));
        await this.file(layoutId, revisionId).replace_contents_bytes_async(
            bytes,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            cancellable,
        );
    }

    /** Removes every cached revision. */
    async clear(cancellable: Gio.Cancellable | null): Promise<void> {
        const dir = Gio.File.new_for_path(this.dir);
        let enumerator: Gio.FileEnumerator;
        try {
            enumerator = await dir.enumerate_children_async(
                Gio.FILE_ATTRIBUTE_STANDARD_NAME,
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                cancellable,
            );
        } catch (e) {
            if (isNotFound(e)) {
                return;
            }
            throw e;
        }
        for (;;) {
            const infos = await enumerator.next_files_async(32, GLib.PRIORITY_DEFAULT, cancellable);
            if (infos.length === 0) {
                break;
            }
            for (const info of infos.filter(i => i.get_name().endsWith('.json'))) {
                await dir.get_child(info.get_name()).delete_async(GLib.PRIORITY_DEFAULT, cancellable);
            }
        }
        enumerator.close(null);
    }

    private file(layoutId: string, revisionId: string): Gio.File {
        assertValidIds(layoutId, revisionId);
        return Gio.File.new_for_path(GLib.build_filenamev([this.dir, `${layoutId}-${revisionId}.json`]));
    }
}
