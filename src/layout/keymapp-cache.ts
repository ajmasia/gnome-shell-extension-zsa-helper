import GLib from 'gi://GLib';
import Gio from '../lib/gio.js';
import { keymappRevisionQuery } from '../core/layout/oryx-query.js';

/** Keymapp keeps every layout revision it has downloaded in this SQLite database. */
export function defaultKeymappDb(): string {
    return GLib.build_filenamev([GLib.get_user_config_dir(), '.keymapp', 'keymapp.sqlite3']);
}

/**
 * Reads a revision from Keymapp's cache through the `sqlite3` CLI. Returns null when the CLI or
 * the database is missing, or the revision is not cached: this source is an optional fallback.
 */
export async function readFromKeymapp(
    revisionId: string,
    cancellable: Gio.Cancellable | null,
    db = defaultKeymappDb(),
): Promise<unknown | null> {
    const sqlite = GLib.find_program_in_path('sqlite3');
    if (!sqlite || !GLib.file_test(db, GLib.FileTest.EXISTS)) {
        return null;
    }

    const process = Gio.Subprocess.new(
        [sqlite, '-readonly', db, keymappRevisionQuery(revisionId)],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    );
    const [stdout] = await process.communicate_utf8_async(null, cancellable);
    if (!process.get_successful() || !stdout?.trim()) {
        return null;
    }

    try {
        return JSON.parse(stdout);
    } catch {
        return null;
    }
}
