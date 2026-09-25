import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { matrixToOryxIndex } from './core/geometry/voyager.js';
import { resolveKeyLabel } from './core/labels/resolve.js';
import type { Layout } from './core/layout/model.js';
import type { OverlayPosition } from './core/positioning.js';
import { VisibilityController, type Scheduler } from './core/visibility.js';
import { VoyagerDevice, type DeviceState } from './device/voyager-device.js';
import { LayoutService, LayoutUnavailableError } from './layout/layout-service.js';
import { OryxApiClient } from './layout/oryx-api.js';
import { KeyboardOverlay } from './ui/keyboard-overlay.js';

const TOGGLE_KEY = 'toggle-overlay';

const glibScheduler: Scheduler = {
    schedule: (callback, delayMs) =>
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            callback();
            return GLib.SOURCE_REMOVE;
        }),
    cancel: handle => GLib.Source.remove(handle as number),
};

export default class ZsaHelperExtension extends Extension {
    private settings: Gio.Settings | null = null;
    private settingsHandlers: number[] = [];
    private monitorsHandler = 0;
    private overlay: KeyboardOverlay | null = null;
    private visibility: VisibilityController | null = null;
    private device: VoyagerDevice | null = null;
    private layouts: LayoutService | null = null;
    private firmware: { layoutId: string; revisionId: string } | null = null;
    private layoutRequest = 0;
    private hasLayout = false;

    enable(): void {
        this.settings = this.getSettings();
        this.overlay = new KeyboardOverlay();
        this.visibility = new VisibilityController(this.visibilityConfig(), glibScheduler, visible =>
            this.overlay?.setVisible(visible),
        );
        const version = this.metadata['version-name'] ?? 'dev';
        this.layouts = new LayoutService({ api: new OryxApiClient(undefined, `zsa-helper/${version}`) });
        this.device = new VoyagerDevice();

        this.applyAppearance();
        this.overlay.setStatus('Looking for your ZSA keyboard…');
        this.connectDevice(this.device);
        this.connectSettings(this.settings);

        this.monitorsHandler = Main.layoutManager.connect('monitors-changed', () => this.overlay?.relayout());
        Main.wm.addKeybinding(
            TOGGLE_KEY,
            this.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => this.visibility?.onToggle(),
        );

        this.device.start();
    }

    disable(): void {
        Main.wm.removeKeybinding(TOGGLE_KEY);
        if (this.monitorsHandler) {
            Main.layoutManager.disconnect(this.monitorsHandler);
            this.monitorsHandler = 0;
        }
        for (const id of this.settingsHandlers) {
            this.settings?.disconnect(id);
        }
        this.settingsHandlers = [];

        this.device?.stop();
        this.device?.clear();
        this.device = null;
        this.layouts?.destroy();
        this.layouts = null;
        this.visibility?.destroy();
        this.visibility = null;
        this.overlay?.destroy();
        this.overlay = null;

        this.settings = null;
        this.firmware = null;
        this.hasLayout = false;
        this.layoutRequest++;
    }

    private connectDevice(device: VoyagerDevice): void {
        device.on('state', state => this.onDeviceState(state));
        device.on('firmware', ({ layoutId, revisionId, raw }) => {
            if (!layoutId || !revisionId) {
                this.overlay?.setStatus(`This firmware is not an Oryx layout (${raw || 'no id'}).`);
                return;
            }
            const changed = this.firmware?.layoutId !== layoutId || this.firmware?.revisionId !== revisionId;
            this.firmware = { layoutId, revisionId };
            if (changed || !this.hasLayout) {
                void this.loadLayout();
            }
        });
        device.on('layer', layer => {
            this.overlay?.showLayer(layer);
            this.visibility?.onLayer(layer);
        });
        device.on('keydown', ({ row, col }) => {
            const index = matrixToOryxIndex(row, col);
            if (index !== undefined && this.settings?.get_boolean('highlight-enabled')) {
                this.overlay?.pressKey(index);
            }
        });
        device.on('keyup', ({ row, col }) => {
            const index = matrixToOryxIndex(row, col);
            if (index !== undefined) {
                this.overlay?.releaseKey(index);
            }
        });
        device.on('warning', message => console.warn(`[zsa-helper] ${message}`));
    }

    private onDeviceState(state: DeviceState): void {
        switch (state.status) {
            case 'searching':
                this.overlay?.setStatus('Looking for your ZSA keyboard…');
                break;
            case 'error':
                console.warn(`[zsa-helper] ${state.message}`);
                this.overlay?.setStatus(`No permission to read the keyboard.\nInstall ZSA's udev rule (50-zsa.rules).`);
                break;
            case 'connected':
                console.log(`[zsa-helper] connected to ${state.name} at ${state.path}`);
                if (!this.hasLayout) {
                    this.overlay?.setStatus('Loading layout…');
                }
                break;
            default:
                break;
        }
    }

    private async loadLayout(forceRefresh = false): Promise<void> {
        const firmware = this.firmware;
        const layouts = this.layouts;
        if (!firmware || !layouts) {
            return;
        }
        const request = ++this.layoutRequest;
        if (!this.hasLayout) {
            this.overlay?.setStatus('Loading layout…');
        }

        try {
            if (forceRefresh) {
                await layouts.invalidate();
            }
            const { layout, source } = await layouts.get(firmware.layoutId, firmware.revisionId, { forceRefresh });
            if (request !== this.layoutRequest) {
                return;
            }
            console.log(`[zsa-helper] layout ${layout.layoutId}/${layout.revisionId} "${layout.title}" from ${source}`);
            this.reportUnknownKeycodes(layout);
            this.hasLayout = true;
            this.overlay?.setLayout(layout);
            this.runDevScreenshots(layout);
        } catch (e) {
            if (request !== this.layoutRequest) {
                return;
            }
            if (e instanceof LayoutUnavailableError) {
                console.warn(`[zsa-helper] ${e.message}`);
                if (!this.hasLayout) {
                    this.overlay?.setStatus('Layout not available: Oryx is unreachable and it is not cached.');
                }
            } else if (!(e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))) {
                console.error(`[zsa-helper] failed to load layout: ${e}`);
            }
        }
    }

    /** Development only: see src/dev/screenshots.ts. */
    private runDevScreenshots(layout: Layout): void {
        const dir = GLib.getenv('ZSA_HELPER_SCREENSHOT_DIR');
        if (!dir) {
            return;
        }
        import('./dev/screenshots.js')
            .then(({ captureLayers }) => this.overlay && captureLayers(this.overlay, layout, dir))
            .catch(e => console.error(`[zsa-helper] screenshots failed: ${e}`));
    }

    private reportUnknownKeycodes(layout: Layout): void {
        const unknown = new Set<string>();
        for (const layer of layout.layers) {
            layer.keys.forEach((_, i) => resolveKeyLabel(layout, layer.index, i).unknownCodes.forEach(c => unknown.add(c)));
        }
        if (unknown.size > 0) {
            console.warn(`[zsa-helper] keycodes without a label: ${[...unknown].join(', ')}`);
        }
    }

    private connectSettings(settings: Gio.Settings): void {
        const on = (key: string, handler: () => void) =>
            this.settingsHandlers.push(settings.connect(`changed::${key}`, handler));

        for (const key of ['hud-enabled', 'hud-show-delay', 'hud-hide-delay']) {
            on(key, () => this.visibility?.setConfig(this.visibilityConfig()));
        }
        for (const key of ['position', 'opacity', 'scale']) {
            on(key, () => this.applyAppearance());
        }
        on('refresh-requested', () => void this.loadLayout(true));
    }

    private visibilityConfig() {
        const settings = this.settings!;
        return {
            hudEnabled: settings.get_boolean('hud-enabled'),
            showDelayMs: settings.get_uint('hud-show-delay'),
            hideDelayMs: settings.get_uint('hud-hide-delay'),
        };
    }

    private applyAppearance(): void {
        const settings = this.settings!;
        this.overlay?.setAppearance({
            position: settings.get_string('position') as OverlayPosition,
            opacity: settings.get_double('opacity'),
            scale: settings.get_double('scale'),
        });
    }
}
