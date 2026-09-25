import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisibilityController, type Scheduler, type VisibilityConfig } from '../src/core/visibility.js';

const scheduler: Scheduler = {
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const defaults: VisibilityConfig = { hudEnabled: true, showDelayMs: 150, hideDelayMs: 300 };

function setup(config: Partial<VisibilityConfig> = {}) {
    const changes: boolean[] = [];
    const controller = new VisibilityController({ ...defaults, ...config }, scheduler, v => changes.push(v));
    return { controller, changes };
}

describe('VisibilityController', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not show on a quick layer tap', () => {
        const { controller, changes } = setup();
        controller.onLayer(2);
        vi.advanceTimersByTime(100);
        controller.onLayer(0);
        vi.advanceTimersByTime(1000);
        expect(changes).toEqual([]);
    });

    it('shows after the show delay and hides after the hide delay', () => {
        const { controller, changes } = setup();
        controller.onLayer(2);
        vi.advanceTimersByTime(149);
        expect(changes).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(changes).toEqual([true]);

        controller.onLayer(0);
        vi.advanceTimersByTime(299);
        expect(changes).toEqual([true]);
        vi.advanceTimersByTime(1);
        expect(changes).toEqual([true, false]);
    });

    it('stays visible when switching between non-base layers', () => {
        const { controller, changes } = setup();
        controller.onLayer(1);
        vi.advanceTimersByTime(200);
        controller.onLayer(2);
        vi.advanceTimersByTime(1000);
        expect(changes).toEqual([true]);
    });

    it('keeps the overlay if the layer comes back before the hide delay', () => {
        const { controller, changes } = setup();
        controller.onLayer(1);
        vi.advanceTimersByTime(200);
        controller.onLayer(0);
        vi.advanceTimersByTime(100);
        controller.onLayer(1);
        vi.advanceTimersByTime(1000);
        expect(changes).toEqual([true]);
    });

    it('toggles with the shortcut and stays pinned when returning to the base layer', () => {
        const { controller, changes } = setup();
        controller.onToggle();
        expect(changes).toEqual([true]);
        controller.onLayer(2);
        vi.advanceTimersByTime(200);
        controller.onLayer(0);
        vi.advanceTimersByTime(1000);
        expect(changes).toEqual([true]);
        controller.onToggle();
        expect(changes).toEqual([true, false]);
    });

    it('pins the overlay when toggled while the HUD shows it', () => {
        const { controller, changes } = setup();
        controller.onLayer(2);
        vi.advanceTimersByTime(200);
        controller.onToggle();
        controller.onLayer(0);
        vi.advanceTimersByTime(1000);
        expect(changes).toEqual([true]);
        expect(controller.visible).toBe(true);
    });

    it('ignores layers when the HUD is disabled', () => {
        const { controller, changes } = setup({ hudEnabled: false });
        controller.onLayer(2);
        vi.advanceTimersByTime(1000);
        expect(changes).toEqual([]);
        controller.onToggle();
        expect(changes).toEqual([true]);
    });

    it('hides the HUD when it gets disabled and picks up the layer when enabled', () => {
        const { controller, changes } = setup();
        controller.onLayer(2);
        vi.advanceTimersByTime(200);
        controller.setConfig({ ...defaults, hudEnabled: false });
        expect(changes).toEqual([true, false]);
        controller.setConfig(defaults);
        vi.advanceTimersByTime(150);
        expect(changes).toEqual([true, false, true]);
    });

    it('shows immediately with a zero show delay', () => {
        const { controller, changes } = setup({ showDelayMs: 0 });
        controller.onLayer(1);
        expect(changes).toEqual([true]);
    });

    it('cancels pending timers on destroy', () => {
        const { controller, changes } = setup();
        controller.onLayer(2);
        controller.destroy();
        vi.advanceTimersByTime(1000);
        expect(changes).toEqual([]);
    });
});
