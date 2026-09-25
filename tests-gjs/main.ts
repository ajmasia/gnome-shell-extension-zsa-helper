// Entry point for `pnpm test:gjs`: imports every compiled *.test.js next to this file and runs them.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import { run } from './harness.js';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const loop = new GLib.MainLoop(null, false);
let failures = 1;

(async () => {
    const enumerator = Gio.File.new_for_path(here).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    const files: string[] = [];
    for (let info = enumerator.next_file(null); info; info = enumerator.next_file(null)) {
        if (info.get_name().endsWith('.test.js')) {
            files.push(info.get_name());
        }
    }
    for (const file of files.sort()) {
        await import(`./${file}`);
    }
    failures = await run();
})()
    .catch(e => printerr(`test runner failed: ${e}\n${e?.stack ?? ''}`))
    .finally(() => loop.quit());

loop.run();
System.exit(failures === 0 ? 0 : 1);
