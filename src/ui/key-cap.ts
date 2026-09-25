import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import type { KeyLabel, LockKind } from '../core/labels/resolve.js';

export type LockState = Readonly<Record<LockKind, boolean>>;

const KIND_CLASSES = ['zsa-key--char', 'zsa-key--action', 'zsa-key--layer', 'zsa-key--modifier', 'zsa-key--empty'];

/** Base font sizes in px at scale 1; long labels shrink so they fit on one key. */
const MAIN_FONT = 17;
const MAIN_FONT_SMALL = 12;
const MAIN_FONT_TINY = 10;
const SUB_FONT = 9;
const SWATCH_FONT = 13;
/** Lock indicator LED size and inset from the top-right corner, in px at scale 1. */
const LED_SIZE = 6;
const LED_INSET = 5;

/**
 * One key of the overlay: a main label, an optional secondary label below it and, for lock keys
 * such as Caps Lock, an LED in the corner that lights up while the lock is on.
 */
export class KeyCap {
    readonly actor: St.Widget;
    private readonly labels: St.BoxLayout;
    private readonly main: St.Label;
    private readonly sub: St.Label;
    private readonly led: St.Widget;
    private label: KeyLabel | null = null;
    private locks: LockState = { caps: false, num: false };
    private scale = 1;

    constructor() {
        // BinLayout stacks the labels and the LED, so the LED never pushes the labels around.
        this.actor = new St.Widget({
            style_class: 'zsa-key',
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
        });
        this.labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        this.led = new St.Widget({
            style_class: 'zsa-key-led',
            // BinLayout only honours the alignment of children that expand.
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            visible: false,
        });
        this.main = new St.Label({
            style_class: 'zsa-key-main',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        // Long labels such as "Layer Color" wrap onto two lines instead of being ellipsized.
        this.main.clutter_text.line_wrap = true;
        this.main.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this.main.clutter_text.line_alignment = Pango.Alignment.CENTER;
        this.sub = new St.Label({
            style_class: 'zsa-key-sub',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });
        this.labels.add_child(this.main);
        this.labels.add_child(this.sub);
        this.actor.add_child(this.labels);
        this.actor.add_child(this.led);
    }

    setLabel(label: KeyLabel): void {
        this.label = label;
        this.main.text = label.main;
        // A key that sets a colour shows it as a swatch: coloured text is unreadable for dark colours.
        this.sub.text = label.color ? '●' : (label.sub ?? '');
        this.sub.visible = label.color !== undefined || label.sub !== undefined;

        for (const cls of KIND_CLASSES) {
            this.actor.remove_style_class_name(cls);
        }
        this.actor.add_style_class_name(`zsa-key--${label.kind}`);
        if (label.inherited) {
            this.actor.add_style_class_name('zsa-key--inherited');
        } else {
            this.actor.remove_style_class_name('zsa-key--inherited');
        }
        this.applyFonts();
        this.updateLed();
    }

    /** Lights the LED when this key toggles a lock that is currently on. */
    setLockState(locks: LockState): void {
        this.locks = locks;
        this.updateLed();
    }

    /** Places the key in its parent and sizes it; all values are already in actor pixels. */
    setGeometry(x: number, y: number, size: number, fontScale: number): void {
        this.actor.set_position(Math.round(x), Math.round(y));
        this.actor.set_size(Math.round(size), Math.round(size));
        this.scale = fontScale;
        this.applyFonts();
    }

    setPressed(pressed: boolean): void {
        if (pressed) {
            this.actor.add_style_class_name('zsa-key-pressed');
        } else {
            this.actor.remove_style_class_name('zsa-key-pressed');
        }
    }

    private updateLed(): void {
        const lock = this.label?.lock;
        this.led.visible = lock !== undefined && this.locks[lock];
    }

    private applyFonts(): void {
        const length = [...(this.label?.main ?? '')].length;
        const base = length <= 2 ? MAIN_FONT : length <= 5 ? MAIN_FONT_SMALL : MAIN_FONT_TINY;
        this.main.style = `font-size: ${Math.round(base * this.scale)}px;`;
        const swatch = this.label?.color;
        this.sub.style = swatch
            ? `font-size: ${Math.round(SWATCH_FONT * this.scale)}px; color: ${swatch};`
            : `font-size: ${Math.round(SUB_FONT * this.scale)}px;`;

        const led = Math.max(4, Math.round(LED_SIZE * this.scale));
        const inset = Math.round((LED_INSET - 3) * this.scale);
        this.led.set_size(led, led);
        this.led.style = `border-radius: ${led / 2}px; margin: ${inset}px ${inset}px 0 0;`;
    }
}
