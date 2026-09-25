import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { VOYAGER_HEIGHT, VOYAGER_KEYS, VOYAGER_WIDTH } from '../core/geometry/voyager.js';
import { resolveKeyLabel } from '../core/labels/resolve.js';
import type { Layout } from '../core/layout/model.js';
import {
    clampOrigin,
    overlayOrigin,
    toRelative,
    type OverlayPosition,
    type Point,
    type Rect,
    type RelativePosition,
} from '../core/positioning.js';
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
    /** Where the overlay was dragged to; used when `position` is `custom`. */
    custom: RelativePosition;
    /** Whether the overlay can be dragged with the mouse. Only then does it receive clicks. */
    draggable: boolean;
}

/**
 * The floating keyboard. It is a Shell chrome actor, not a window: no title bar, not in
 * Alt+Tab or the overview, and it never takes focus. It ignores the mouse unless dragging is
 * enabled; then it can be moved with the primary button.
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
    private appearance: OverlayAppearance = {
        position: 'bottom-center',
        opacity: 0.92,
        scale: 1,
        custom: [0.5, 1],
        draggable: false,
    };
    private shown = false;
    private stale = false;
    private drag: { grab: Clutter.Grab; offset: Point } | null = null;
    private hovered = false;

    /** `onDragged` receives the new position when a drag ends. */
    constructor(private readonly onDragged: (position: RelativePosition) => void = () => {}) {
        this.actor = new St.BoxLayout({
            style_class: 'zsa-overlay',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
            visible: false,
            opacity: 0,
        });
        // Without this, Clutter applies the opacity to every child separately: while fading, the
        // translucent panel vanishes first and the keys linger on top of it. Painting offscreen
        // makes the overlay fade (and stay translucent) as a single image.
        this.actor.set_offscreen_redirect(Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY);

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

        this.actor.connect('button-press-event', (_actor, event: Clutter.Event) => this.onPress(event));
        this.actor.connect('motion-event', (_actor, event: Clutter.Event) => this.onMotion(event));
        this.actor.connect('button-release-event', () => this.endDrag(true));
        this.actor.connect('enter-event', () => this.setHovered(true));
        this.actor.connect('leave-event', () => this.setHovered(false));

        this.addChrome(false);
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
        if (appearance.draggable !== this.appearance.draggable) {
            this.setDraggable(appearance.draggable);
        }
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
            this.endDrag(false);
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
        this.endDrag(false);
        this.setHovered(false);
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
        const area = this.workArea();
        if (!area || this.drag) {
            return;
        }
        const [width, height] = this.size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const { x, y } = overlayOrigin(area, width, height, this.appearance.position, scale, this.appearance.custom);
        this.actor.set_position(x, y);
    }

    private workArea(): Rect | null {
        if (!Main.layoutManager.primaryMonitor) {
            return null;
        }
        return Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
    }

    private size(): [number, number] {
        const [, width] = this.actor.get_preferred_width(-1);
        const [, height] = this.actor.get_preferred_height(width);
        return [width, height];
    }

    /**
     * Adds the actor as Shell chrome. It only takes part in the input region when it can be
     * dragged, so clicks go through to the windows below otherwise.
     */
    private addChrome(affectsInputRegion: boolean): void {
        Main.layoutManager.addTopChrome(this.actor, { affectsInputRegion, trackFullscreen: false });
    }

    private setDraggable(draggable: boolean): void {
        this.endDrag(false);
        this.setHovered(false);
        this.actor.reactive = draggable;
        Main.layoutManager.removeChrome(this.actor);
        this.addChrome(draggable);
    }

    private onPress(event: Clutter.Event): boolean {
        if (!this.appearance.draggable || this.drag || event.get_button() !== Clutter.BUTTON_PRIMARY) {
            return Clutter.EVENT_PROPAGATE;
        }
        const [px, py] = event.get_coords();
        const [x, y] = this.actor.get_position();
        this.drag = { grab: global.stage.grab(this.actor), offset: { x: px - x, y: py - y } };
        global.display.set_cursor(Meta.Cursor.GRABBING);
        return Clutter.EVENT_STOP;
    }

    private onMotion(event: Clutter.Event): boolean {
        const area = this.workArea();
        if (!this.drag || !area) {
            return Clutter.EVENT_PROPAGATE;
        }
        const [px, py] = event.get_coords();
        const [width, height] = this.size();
        const { x, y } = clampOrigin(area, width, height, { x: px - this.drag.offset.x, y: py - this.drag.offset.y });
        this.actor.set_position(x, y);
        return Clutter.EVENT_STOP;
    }

    /** Releases the pointer grab; with `save`, reports where the overlay was dropped. */
    private endDrag(save: boolean): boolean {
        const drag = this.drag;
        if (!drag) {
            return Clutter.EVENT_PROPAGATE;
        }
        this.drag = null;
        drag.grab.dismiss();
        global.display.set_cursor(this.hovered && this.appearance.draggable ? Meta.Cursor.GRAB : Meta.Cursor.DEFAULT);

        const area = this.workArea();
        if (save && area) {
            const [x, y] = this.actor.get_position();
            const [width, height] = this.size();
            this.onDragged(toRelative(area, width, height, { x, y }));
        }
        return Clutter.EVENT_STOP;
    }

    private setHovered(hovered: boolean): boolean {
        if (hovered === this.hovered) {
            return Clutter.EVENT_PROPAGATE;
        }
        this.hovered = hovered;
        if (!this.drag) {
            global.display.set_cursor(hovered && this.appearance.draggable ? Meta.Cursor.GRAB : Meta.Cursor.DEFAULT);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    private targetOpacity(): number {
        return Math.round(Math.min(1, Math.max(0.3, this.appearance.opacity)) * 255);
    }
}
