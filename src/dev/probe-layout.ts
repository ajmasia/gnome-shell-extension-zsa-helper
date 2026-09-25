// Development probe: loads a layout revision and reports where it came from.
// Usage: pnpm probe:layout <layoutId> <revisionId> [--offline] [--refresh] [--clear]
//   --offline  point the Oryx client at an unreachable address to simulate no network
//   --refresh  skip our disk cache
//   --clear    delete our disk cache first
import GLib from 'gi://GLib';
import System from 'system';
import { LayoutService, LayoutUnavailableError } from '../layout/layout-service.js';
import { OryxApiClient } from '../layout/oryx-api.js';

const args = System.programArgs;
const [layoutId, revisionId] = args.filter(a => !a.startsWith('--'));
const flag = (name: string) => args.includes(`--${name}`);

if (!layoutId || !revisionId) {
    printerr('Usage: probe-layout <layoutId> <revisionId> [--offline] [--refresh] [--clear]');
    System.exit(2);
}

const loop = new GLib.MainLoop(null, false);
const service = new LayoutService(flag('offline') ? { api: new OryxApiClient('http://127.0.0.1:9/graphql') } : {});
let exitCode = 0;

(async () => {
    try {
        if (flag('clear')) {
            await service.invalidate();
            print('cache cleared');
        }
        const started = GLib.get_monotonic_time();
        const { layout, source } = await service.get(layoutId, revisionId, { forceRefresh: flag('refresh') });
        const ms = Math.round((GLib.get_monotonic_time() - started) / 1000);
        print(`source=${source} (${ms} ms)`);
        print(`title="${layout.title}" layout=${layout.layoutId} revision=${layout.revisionId}`);
        for (const layer of layout.layers) {
            print(`  ${layer.index} ${layer.title.padEnd(10)} ${layer.keys.length} keys`);
        }
    } catch (e) {
        exitCode = 1;
        printerr(e instanceof LayoutUnavailableError ? e.message : `error: ${e}`);
    } finally {
        service.destroy();
        loop.quit();
    }
})();

loop.run();
System.exit(exitCode);
