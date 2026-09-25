// Development probe: prints every event from the keyboard. Run with `pnpm probe:device`.
import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';
import { matrixToOryxIndex } from '../core/geometry/voyager.js';
import { VoyagerDevice } from '../device/voyager-device.js';

const SIGINT = 2;
const SIGTERM = 15;

const loop = new GLib.MainLoop(null, false);
const device = new VoyagerDevice();
const log = (message: string) => print(`${GLib.DateTime.new_now_local().format('%H:%M:%S.%f')?.slice(0, 12)}  ${message}`);

device.on('state', state => log(`STATE ${JSON.stringify(state)}`));
device.on('protocol', version => log(`PROTOCOL ${version}`));
device.on('firmware', fw => log(`FW ${fw.raw} (layout=${fw.layoutId} revision=${fw.revisionId})`));
device.on('layer', layer => log(`LAYER ${layer}`));
device.on('keydown', ({ row, col }) => log(`KEYDOWN row=${row} col=${col} -> oryx index ${matrixToOryxIndex(row, col)}`));
device.on('keyup', ({ row, col }) => log(`KEYUP   row=${row} col=${col}`));
device.on('warning', message => log(`WARNING ${message}`));

for (const signal of [SIGINT, SIGTERM]) {
    GLibUnix.signal_add_full(GLib.PRIORITY_DEFAULT, signal, () => {
        device.stop();
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
}

device.start();
loop.run();
