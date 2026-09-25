/** Minimal timer API, so the controller runs on GLib in the Shell and on fake timers in tests. */
export interface Scheduler {
    schedule(callback: () => void, delayMs: number): unknown;
    cancel(handle: unknown): void;
}

export interface VisibilityConfig {
    hudEnabled: boolean;
    /** How long a non-base layer must stay active before the HUD shows the overlay. */
    showDelayMs: number;
    /** How long to wait after returning to the base layer before the HUD hides the overlay. */
    hideDelayMs: number;
}

const BASE_LAYER = 0;

/**
 * Decides when the overlay is visible. It combines two sources:
 * - The toggle shortcut, which pins the overlay open or closed.
 * - The HUD, which shows the overlay while a non-base layer is held.
 * The overlay is visible when it is pinned or the HUD wants it.
 */
export class VisibilityController {
    private pinned = false;
    private hudVisible = false;
    private layer = BASE_LAYER;
    private showTimer: unknown = null;
    private hideTimer: unknown = null;
    private lastVisible = false;

    constructor(
        private config: VisibilityConfig,
        private readonly scheduler: Scheduler,
        private readonly onVisibleChange: (visible: boolean) => void,
    ) {}

    get visible(): boolean {
        return this.pinned || this.hudVisible;
    }

    onLayer(layer: number): void {
        this.layer = layer;
        if (!this.config.hudEnabled) {
            return;
        }

        if (layer !== BASE_LAYER) {
            this.cancelHide();
            if (!this.hudVisible && this.showTimer === null) {
                this.after(this.config.showDelayMs, 'show', () => this.setHud(true));
            }
        } else {
            this.cancelShow();
            if (this.hudVisible && this.hideTimer === null) {
                this.after(this.config.hideDelayMs, 'hide', () => this.setHud(false));
            }
        }
    }

    onToggle(): void {
        this.pinned = !this.pinned;
        this.emitIfChanged();
    }

    setConfig(config: VisibilityConfig): void {
        this.config = config;
        if (!config.hudEnabled) {
            this.cancelShow();
            this.cancelHide();
            this.hudVisible = false;
            this.emitIfChanged();
        } else {
            this.onLayer(this.layer);
        }
    }

    destroy(): void {
        this.cancelShow();
        this.cancelHide();
    }

    private after(delayMs: number, which: 'show' | 'hide', action: () => void): void {
        if (delayMs <= 0) {
            action();
            return;
        }
        const handle = this.scheduler.schedule(() => {
            if (which === 'show') {
                this.showTimer = null;
            } else {
                this.hideTimer = null;
            }
            action();
        }, delayMs);
        if (which === 'show') {
            this.showTimer = handle;
        } else {
            this.hideTimer = handle;
        }
    }

    private setHud(visible: boolean): void {
        this.hudVisible = visible;
        this.emitIfChanged();
    }

    private cancelShow(): void {
        if (this.showTimer !== null) {
            this.scheduler.cancel(this.showTimer);
            this.showTimer = null;
        }
    }

    private cancelHide(): void {
        if (this.hideTimer !== null) {
            this.scheduler.cancel(this.hideTimer);
            this.hideTimer = null;
        }
    }

    private emitIfChanged(): void {
        const visible = this.visible;
        if (visible !== this.lastVisible) {
            this.lastVisible = visible;
            this.onVisibleChange(visible);
        }
    }
}
