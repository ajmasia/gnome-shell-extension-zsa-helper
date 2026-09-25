// GNOME Shell adds `ease()` to every Clutter.Actor (js/ui/environment.js). The augmentation in
// @girs/gnome-shell targets the package index, which only re-exports the namespace as default,
// so it has no effect; augment the module that declares the namespace instead.
import type Clutter from '@girs/clutter-16';

declare module '@girs/clutter-16/clutter-16' {
    namespace Clutter {
        interface Actor {
            ease(params: ZsaEasingParams): void;
        }
    }
}

declare global {
    interface ZsaEasingParams {
        duration?: number;
        delay?: number;
        mode?: Clutter.AnimationMode;
        repeatCount?: number;
        autoReverse?: boolean;
        onComplete?: () => void;
        onStopped?: (isFinished: boolean) => void;
        opacity?: number;
        x?: number;
        y?: number;
        scale_x?: number;
        scale_y?: number;
        translation_x?: number;
        translation_y?: number;
    }
}
