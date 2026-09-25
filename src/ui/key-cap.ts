import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import type { KeyLabel } from '../core/labels/resolve.js';

const KIND_CLASSES = ['zsa-key--char', 'zsa-key--action', 'zsa-key--layer', 'zsa-key--modifier', 'zsa-key--empty'];

/** Base font sizes in px at scale 1; long labels shrink so they fit on one key. */
const MAIN_FONT = 17;
const MAIN_FONT_SMALL = 12;
const MAIN_FONT_TINY = 10;
const SUB_FONT = 9;
const SWATCH_FONT = 13;

/** One key of the overlay: a main label and an optional secondary label below it. */
export class KeyCap {
    readonly actor: St.BoxLayout;
    private readonly main: St.Label;
    private readonly sub: St.Label;
    private label: KeyLabel | null = null;
    private scale = 1;

    constructor() {
        this.actor = new St.BoxLayout({
            style_class: 'zsa-key',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
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
        this.actor.add_child(this.main);
        this.actor.add_child(this.sub);
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

    private applyFonts(): void {
        const length = [...(this.label?.main ?? '')].length;
        const base = length <= 2 ? MAIN_FONT : length <= 5 ? MAIN_FONT_SMALL : MAIN_FONT_TINY;
        this.main.style = `font-size: ${Math.round(base * this.scale)}px;`;
        const swatch = this.label?.color;
        this.sub.style = swatch
            ? `font-size: ${Math.round(SWATCH_FONT * this.scale)}px; color: ${swatch};`
            : `font-size: ${Math.round(SUB_FONT * this.scale)}px;`;
    }
}
