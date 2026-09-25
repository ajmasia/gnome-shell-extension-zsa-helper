import type { Action, Key, Layout, Modifiers } from '../layout/model.js';
import { MODIFIER_KEYCODES, US_KEYCODE_LABELS } from './us-keycodes.js';

export type KeyLabelKind = 'char' | 'action' | 'layer' | 'modifier' | 'empty';

export interface KeyLabel {
    /** Main text shown on the key. */
    main: string;
    /** Secondary behaviour, e.g. the modifier of a home-row mod or the layer of a layer-tap. */
    sub?: string;
    kind: KeyLabelKind;
    /** True when the key is transparent and the label comes from the base layer. */
    inherited: boolean;
    /** Keycodes with no known label, so the caller can report them. */
    unknownCodes: string[];
    /** Colour the key sets (`RGB` keys), shown as a swatch. */
    color?: string;
}

const BASE_LAYER = 0;

const TRANSPARENT_CODES = new Set(['KC_TRANSPARENT', 'KC_TRNS', '_______']);
const NO_CODES = new Set(['KC_NO', 'XXXXXXX']);

const LAYER_ACTION_PREFIX: Readonly<Record<string, string>> = {
    MO: '▸',
    LT: '▸',
    TG: '⇄',
    TO: '→',
    TT: '⇥',
    OSL: '1×',
    DF: '⌂',
};

const ACTION_LABELS: Readonly<Record<string, string>> = {
    CW_TOGG: 'CapsW',
    QK_BOOT: 'Boot',
    QK_BOOTLOADER: 'Boot',
    TOGGLE_LAYER_COLOR: 'Layer Color',
    RGB: 'Color',
    RGB_TOG: 'RGB ⏻',
    RGB_MODE_FORWARD: 'RGB ▷',
    RGB_MOD: 'RGB ▷',
    RGB_MODE_REVERSE: 'RGB ◁',
    RGB_RMOD: 'RGB ◁',
    RGB_SLD: 'RGB ■',
    RGB_VAI: 'RGB +',
    RGB_VAD: 'RGB −',
    RGB_HUI: 'Hue +',
    RGB_HUD: 'Hue −',
    RGB_SAI: 'Sat +',
    RGB_SAD: 'Sat −',
    RGB_SPI: 'Speed +',
    RGB_SPD: 'Speed −',
};

const MOD_BIT_LABELS: Readonly<Record<string, string>> = {
    MOD_LSFT: '⇧',
    MOD_RSFT: '⇧',
    MOD_LCTL: 'Ctrl',
    MOD_RCTL: 'Ctrl',
    MOD_LALT: 'Alt',
    MOD_RALT: 'AltGr',
    MOD_LGUI: 'Super',
    MOD_RGUI: 'Super',
    MOD_MEH: 'Meh',
    MOD_HYPR: 'Hyper',
};

interface ActionLabel {
    text: string;
    kind: KeyLabelKind;
    unknown?: string;
}

/**
 * Resolves what a key shows on a layer. Transparent keys, including keys without any action
 * (Oryx compiles those to `KC_TRANSPARENT`), inherit the label of the base layer: the firmware
 * only reports the highest active layer, and layers reached with `MO`/`LT` from the base only
 * have the base layer below them.
 */
export function resolveKeyLabel(layout: Layout, layerIndex: number, keyIndex: number): KeyLabel {
    const key = layout.layers[layerIndex]?.keys[keyIndex];
    if (!key || isTransparent(key)) {
        const base = layout.layers[BASE_LAYER]?.keys[keyIndex];
        if (layerIndex === BASE_LAYER || !base || isTransparent(base)) {
            return empty();
        }
        return { ...resolveKey(layout, base), inherited: true };
    }
    return resolveKey(layout, key);
}

function resolveKey(layout: Layout, key: Key): KeyLabel {
    const unknownCodes: string[] = [];
    const describe = (action: Action | undefined): ActionLabel | undefined => {
        if (!action) {
            return undefined;
        }
        const label = labelAction(layout, action);
        if (label.unknown) {
            unknownCodes.push(label.unknown);
        }
        return label;
    };

    const primary = describe(key.tap ?? key.hold ?? key.tapHold ?? key.doubleTap);
    const secondaryAction = key.tap ? (key.hold ?? key.tapHold) : undefined;
    const secondary = describe(secondaryAction);

    const main = key.customLabel ?? primary?.text ?? '';
    const kind = key.customLabel ? customLabelKind(key.customLabel) : (primary?.kind ?? 'empty');
    const label: KeyLabel = { main, kind, inherited: false, unknownCodes };
    const color = key.tap?.code === 'RGB' ? key.tap.color : undefined;
    if (color) {
        label.color = color;
    }

    if (secondary && secondary.text !== '' && secondary.text !== main) {
        label.sub = secondary.text;
    }
    return label;
}

function labelAction(layout: Layout, action: Action): ActionLabel {
    const { code } = action;

    if (NO_CODES.has(code) || TRANSPARENT_CODES.has(code)) {
        return { text: '', kind: 'empty' };
    }

    const layerPrefix = LAYER_ACTION_PREFIX[code];
    if (layerPrefix !== undefined && action.layer !== undefined) {
        const title = layout.layers.find(l => l.index === action.layer)?.title ?? `L${action.layer}`;
        return { text: `${layerPrefix}${title}`, kind: 'layer' };
    }

    if (code === 'OSM') {
        return { text: `1×${modifierBitsLabel(action.modifier)}`, kind: 'modifier' };
    }

    const actionLabel = ACTION_LABELS[code];
    if (actionLabel !== undefined) {
        return { text: actionLabel, kind: 'action' };
    }

    const base = US_KEYCODE_LABELS[code];
    if (base === undefined) {
        const text = code.replace(/^KC_/, '');
        return { text: withModifiers(text, action.modifiers), kind: 'action', unknown: code };
    }

    if (MODIFIER_KEYCODES.has(code)) {
        return { text: base, kind: 'modifier' };
    }

    const isChar = /^[\x21-\x7e]$/.test(base) && !action.modifiers;
    return { text: withModifiers(base, action.modifiers), kind: isChar ? 'char' : 'action' };
}

/** Prefixes a label with its modifiers, e.g. `Ctrl+⇧ ⇥` for Ctrl+Shift+Tab. */
function withModifiers(text: string, modifiers: Modifiers | undefined): string {
    if (!modifiers) {
        return text;
    }
    const parts = [
        modifiers.ctrl && 'Ctrl',
        modifiers.alt && 'Alt',
        modifiers.altGr && 'AltGr',
        modifiers.shift && '⇧',
        modifiers.gui && 'Super',
    ].filter((part): part is string => typeof part === 'string');
    return parts.length > 0 ? `${parts.join('+')} ${text}` : text;
}

/** Labels a QMK mod-bit expression such as `MOD_RALT` or `MOD_LCTL | MOD_LSFT`. */
function modifierBitsLabel(modifier: string | undefined): string {
    const bits = modifier?.match(/MOD_[A-Z]+/g) ?? [];
    const labels = bits.map(bit => MOD_BIT_LABELS[bit] ?? bit.replace(/^MOD_/, ''));
    return labels.length > 0 ? labels.join('+') : 'Mod';
}

function customLabelKind(label: string): KeyLabelKind {
    return [...label].length <= 2 ? 'char' : 'action';
}

function isTransparent(key: Key): boolean {
    const hasOtherActions = key.hold ?? key.doubleTap ?? key.tapHold;
    if (key.customLabel || hasOtherActions) {
        return false;
    }
    return !key.tap || TRANSPARENT_CODES.has(key.tap.code);
}

function empty(): KeyLabel {
    return { main: '', kind: 'empty', inherited: false, unknownCodes: [] };
}
