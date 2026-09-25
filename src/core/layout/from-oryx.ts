import { VOYAGER_KEY_COUNT, type Action, type Key, type Layer, type Layout, type Modifiers } from './model.js';

export class LayoutParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LayoutParseError';
    }
}

type Json = Record<string, unknown>;

/**
 * Normalises an Oryx layout. Accepts both the GraphQL API response (`{data: {layout}}`) and a
 * revision cached by Keymapp (`{layout}`).
 */
export function layoutFromOryxJson(json: unknown): Layout {
    const root = asObject(json, 'root');
    const layout = asObject(isObject(root.data) ? root.data.layout : root.layout, 'layout');
    const revision = asObject(layout.revision, 'layout.revision');
    const layers = revision.layers;

    if (!Array.isArray(layers) || layers.length === 0) {
        throw new LayoutParseError('layout.revision.layers is missing or empty');
    }

    return {
        layoutId: asString(layout.hashId, 'layout.hashId'),
        revisionId: asString(revision.hashId, 'layout.revision.hashId'),
        title: typeof layout.title === 'string' ? layout.title : '',
        layers: layers
            .map((layer, i) => parseLayer(layer, i))
            .sort((a, b) => a.index - b.index),
    };
}

function parseLayer(value: unknown, i: number): Layer {
    const layer = asObject(value, `layers[${i}]`);
    const keys = layer.keys;

    if (!Array.isArray(keys) || keys.length !== VOYAGER_KEY_COUNT) {
        throw new LayoutParseError(
            `layers[${i}] must have ${VOYAGER_KEY_COUNT} keys, got ${Array.isArray(keys) ? keys.length : 'none'}`,
        );
    }

    const color = typeof layer.color === 'string' && layer.color !== '' ? layer.color : undefined;
    return {
        index: typeof layer.position === 'number' ? layer.position : i,
        title: typeof layer.title === 'string' && layer.title !== '' ? layer.title : `Layer ${i}`,
        ...(color && { color }),
        keys: keys.map(parseKey),
    };
}

function parseKey(value: unknown): Key {
    if (!isObject(value)) {
        return {};
    }

    const key: Key = {};
    for (const slot of ['tap', 'hold', 'doubleTap', 'tapHold'] as const) {
        const action = parseAction(value[slot]);
        if (action) {
            key[slot] = action;
        }
    }
    if (typeof value.customLabel === 'string' && value.customLabel !== '') {
        key.customLabel = value.customLabel;
    }
    return key;
}

function parseAction(value: unknown): Action | undefined {
    if (!isObject(value) || typeof value.code !== 'string') {
        return undefined;
    }

    const action: Action = { code: value.code };
    if (typeof value.layer === 'number') {
        action.layer = value.layer;
    }
    if (typeof value.modifier === 'string') {
        action.modifier = value.modifier;
    }
    const modifiers = parseModifiers(value.modifiers);
    if (modifiers) {
        action.modifiers = modifiers;
    }
    return action;
}

function parseModifiers(value: unknown): Modifiers | undefined {
    if (!isObject(value)) {
        return undefined;
    }

    const on = (name: string): boolean => value[name] === true;
    const modifiers: Modifiers = {
        ctrl: on('leftCtrl') || on('rightCtrl'),
        shift: on('leftShift') || on('rightShift'),
        alt: on('leftAlt'),
        altGr: on('rightAlt'),
        gui: on('leftGui') || on('rightGui'),
    };
    return Object.values(modifiers).some(Boolean) ? modifiers : undefined;
}

function isObject(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, path: string): Json {
    if (!isObject(value)) {
        throw new LayoutParseError(`${path} is missing or not an object`);
    }
    return value;
}

function asString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value === '') {
        throw new LayoutParseError(`${path} is missing`);
    }
    return value;
}
