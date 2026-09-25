import { describe, expect, it } from 'vitest';
import { Emitter } from '../src/core/emitter.js';

describe('Emitter', () => {
    it('delivers payloads to listeners of the event', () => {
        const emitter = new Emitter<{ layer: number; name: string }>();
        const layers: number[] = [];
        emitter.on('layer', layer => layers.push(layer));
        emitter.on('name', () => layers.push(-1));
        emitter.emit('layer', 2);
        expect(layers).toEqual([2]);
    });

    it('removes a listener with the returned function', () => {
        const emitter = new Emitter<{ layer: number }>();
        const layers: number[] = [];
        const off = emitter.on('layer', layer => layers.push(layer));
        off();
        emitter.emit('layer', 1);
        expect(layers).toEqual([]);
    });

    it('removes every listener on clear', () => {
        const emitter = new Emitter<{ layer: number }>();
        const layers: number[] = [];
        emitter.on('layer', layer => layers.push(layer));
        emitter.clear();
        emitter.emit('layer', 1);
        expect(layers).toEqual([]);
    });
});

describe('Emitter error isolation', () => {
    it('keeps calling other listeners when one throws, and reports the error', () => {
        const errors: unknown[] = [];
        const emitter = new Emitter<{ layer: number }>((error, event) => errors.push([event, (error as Error).message]));
        const layers: number[] = [];
        emitter.on('layer', () => {
            throw new Error('render failed');
        });
        emitter.on('layer', layer => layers.push(layer));

        expect(() => emitter.emit('layer', 3)).not.toThrow();
        expect(layers).toEqual([3]);
        expect(errors).toEqual([['layer', 'render failed']]);
    });
});
