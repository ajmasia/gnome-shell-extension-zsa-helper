/** Number of keys on a ZSA Voyager. */
export const VOYAGER_KEY_COUNT = 52;

/** Modifier flags attached to an action, e.g. Ctrl+Shift for `LCTL(LSFT(KC_TAB))`. */
export interface Modifiers {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    altGr: boolean;
    gui: boolean;
}

/** One behaviour of a key (tap, hold, double tap or tap-hold). */
export interface Action {
    /** QMK keycode as Oryx names it: `KC_A`, `KC_LABK`, `MO`, `OSM`, `QK_BOOT`… */
    code: string;
    /** Target layer for layer actions such as `MO` or a layer-tap hold. */
    layer?: number;
    /** Modifiers wrapped around the keycode. */
    modifiers?: Modifiers;
    /** Modifier of a one-shot modifier (`OSM`), e.g. `MOD_RALT`. */
    modifier?: string;
    /** Colour an `RGB` action sets, e.g. `#ff0000`. */
    color?: string;
}

export interface Key {
    tap?: Action;
    hold?: Action;
    doubleTap?: Action;
    tapHold?: Action;
    customLabel?: string;
}

export interface Layer {
    index: number;
    title: string;
    /** Layer colour set in Oryx, when there is one. */
    color?: string;
    /** Keys in Oryx order; see `src/core/geometry/voyager.ts`. */
    keys: Key[];
}

export interface Layout {
    layoutId: string;
    revisionId: string;
    title: string;
    layers: Layer[];
}
