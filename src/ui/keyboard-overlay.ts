import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { VOYAGER_HEIGHT, VOYAGER_KEYS, VOYAGER_WIDTH } from '../core/geometry/voyager.js';
import { resolveKeyLabel } from '../core/labels/resolve.js';
import type { Layout } from '../core/layout/model.js';
import { overlayOrigin, type OverlayPosition } from '../core/positioning.js';
import { KeyCap, type LockState } from './key-cap.js';

/** Key size and gap in logical pixels at scale 1. */
const KEY_SIZE = 50;
const KEY_GAP = 6;
const FADE_MS = 120;

export interface OverlayAppearance {
    position: OverlayPosition;
    /** 0.3–1.0 */
    opacity: number;
    /** 0.5–2.0 */
    scale: number;
}

/**
 * The floating keyboard. It is a Shell chrome actor, not a window: no title bar, not in
 * Alt+Tab or the overview, and it never takes focus or input.
 */
export class KeyboardOverlay {
    readonly actor: St.BoxLayout;
    private readonly title: St.Label;
    private readonly dot: St.Widget;
    private readonly board: St.Widget;
    private readonly status: St.Label;
    private readonly keys: KeyCap[];
    private layout: Layout | null = null;
    private layer = 0;
    private appearance: OverlayAppearance = { position: 'bottom-center', opacity: 0.92, scale: 1 };
    private shown = false;
    private stale = false;

    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'zsa-overlay',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
            visible: false,
            opacity: 0,
        });

        const header = new St.BoxLayout({ style_class: 'zsa-overlay-header', reactive: false });
        this.dot = new St.Widget({ style_class: 'zsa-layer-dot', y_align: Clutter.ActorAlign.CENTER });
        this.title = new St.Label({ style_class: 'zsa-layer-title', y_align: Clutter.ActorAlign.CENTER });
        header.add_child(this.dot);
        header.add_child(this.title);

        this.board = new St.Widget({ layout_manager: new Clutter.FixedLayout(), reactive: false });
        this.keys = VOYAGER_KEYS.map(() => new KeyCap());
        for (const key of this.keys) {
            this.board.add_child(key.actor);
        }

        this.status = new St.Label({ style_class: 'zsa-status', visible: false, x_align: Clutter.ActorAlign.CENTER });

        this.actor.add_child(header);
        this.actor.add_child(this.board);
        this.actor.add_child(this.status);

        Main.layoutManager.addTopChrome(this.actor, { affectsInputRegion: false, trackFullscreen: false });
        this.relayout();
    }

    setLayout(layout: Layout): void {
        this.layout = layout;
        this.clearPressed();
        this.setStatus(null);
        this.render();
    }

    /**
     * Switches the layer shown. With `defer`, or while the overlay is hidden or fading out, the
     * change is only rendered the next time the overlay shows (or on `flushLayer()`), so a
     * closing overlay never flashes another layer.
     */
    showLayer(layer: number, { defer = false } = {}): void {
        this.layer = layer;
        if (defer || !this.shown) {
            this.stale = true;
            return;
        }
        this.render();
    }

    /** Renders a deferred layer change right away. */
    flushLayer(): void {
        if (this.stale) {
            this.render();
        }
    }

    /** A message shown instead of the keys, e.g. when the keyboard is not connected. */
    setStatus(message: string | null): void {
        this.status.text = message ?? '';
        this.status.visible = message !== null;
        this.board.visible = message === null && this.layout !== null;
        if (message !== null) {
            this.title.text = 'ZSA Helper';
            this.dot.visible = false;
        } else {
            this.render();
        }
        this.reposition();
    }

    /** Updates the LEDs of lock keys (Caps Lock, Num Lock). */
    setLockState(locks: LockState): void {
        for (const key of this.keys) {
            key.setLockState(locks);
        }
    }

    pressKey(index: number): void {
        this.keys[index]?.setPressed(true);
    }

    releaseKey(index: number): void {
        this.keys[index]?.setPressed(false);
    }

    setAppearance(appearance: OverlayAppearance): void {
        this.appearance = appearance;
        if (this.shown) {
            this.actor.opacity = this.targetOpacity();
        }
        this.relayout();
    }

    setVisible(visible: boolean): void {
        if (visible === this.shown) {
            return;
        }
        this.shown = visible;
        this.actor.remove_all_transitions();

        if (visible) {
            this.flushLayer();
            this.reposition();
            this.actor.show();
            this.actor.ease({
                opacity: this.targetOpacity(),
                duration: FADE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this.actor.ease({
                opacity: 0,
                duration: FADE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.actor.hide(),
            });
        }
    }

    /** Re-applies size and position, e.g. after a monitor change. */
    relayout(): void {
        const s = this.appearance.scale * St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const unit = (KEY_SIZE + KEY_GAP) * s;
        this.keys.forEach((key, i) => {
            const pos = VOYAGER_KEYS[i]!;
            key.setGeometry(pos.x * unit, pos.y * unit, KEY_SIZE * s, s);
        });
        this.board.set_size(Math.round(VOYAGER_WIDTH * unit - KEY_GAP * s), Math.round(VOYAGER_HEIGHT * unit - KEY_GAP * s));
        this.title.style = `font-size: ${Math.round(14 * s)}px;`;
        this.status.style = `font-size: ${Math.round(14 * s)}px;`;
        this.reposition();
    }

    destroy(): void {
        this.actor.remove_all_transitions();
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }

    private render(): void {
        const layout = this.layout;
        if (!layout || this.status.visible) {
            return;
        }
        this.stale = false;
        const layer = layout.layers.find(l => l.index === this.layer) ?? layout.layers[0]!;
        this.title.text = layer.title;
        this.dot.visible = layer.color !== undefined;
        if (layer.color) {
            this.dot.style = `background-color: ${layer.color};`;
        }
        this.keys.forEach((key, i) => key.setLabel(resolveKeyLabel(layout, layer.index, i)));
        this.board.visible = true;
    }

    private clearPressed(): void {
        for (const key of this.keys) {
            key.setPressed(false);
        }
    }

    private reposition(): void {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            return;
        }
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const [, width] = this.actor.get_preferred_width(-1);
        const [, height] = this.actor.get_preferred_height(width);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const { x, y } = overlayOrigin(area, width, height, this.appearance.position, scale);
        this.actor.set_position(x, y);
    }

    private targetOpacity(): number {
        return Math.round(Math.min(1, Math.max(0.3, this.appearance.opacity)) * 255);
    }
}
