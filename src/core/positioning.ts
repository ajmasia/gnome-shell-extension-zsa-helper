export type PresetPosition = 'bottom-center' | 'top-center' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

/** A preset, or `custom` for a place the user dragged the overlay to. */
export type OverlayPosition = PresetPosition | 'custom';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

/**
 * A dragged position as fractions of the free space in the work area: 0 is the left/top edge and
 * 1 the right/bottom edge. Fractions keep the overlay in the same relative place when the
 * resolution, the scale or the overlay size change.
 */
export type RelativePosition = [number, number];

const MARGIN = 48;

/** Top-left corner for an overlay of the given size inside a monitor's work area. */
export function overlayOrigin(
    area: Rect,
    width: number,
    height: number,
    position: OverlayPosition,
    scale = 1,
    custom: RelativePosition = [0.5, 1],
): Point {
    if (position === 'custom') {
        return fromRelative(area, width, height, custom);
    }

    const margin = MARGIN * scale;
    const top = area.y + margin;
    const bottom = area.y + area.height - height - margin;
    const left = area.x + margin;
    const right = area.x + area.width - width - margin;
    const center = area.x + (area.width - width) / 2;

    const [vertical, horizontal] = position.split('-') as ['top' | 'bottom', 'center' | 'left' | 'right'];
    const x = horizontal === 'left' ? left : horizontal === 'right' ? right : center;
    const y = vertical === 'top' ? top : bottom;
    return { x: Math.round(x), y: Math.round(y) };
}

/** Keeps a top-left corner so the whole overlay stays inside the work area. */
export function clampOrigin(area: Rect, width: number, height: number, origin: Point): Point {
    const x = Math.min(Math.max(origin.x, area.x), area.x + Math.max(0, area.width - width));
    const y = Math.min(Math.max(origin.y, area.y), area.y + Math.max(0, area.height - height));
    return { x: Math.round(x), y: Math.round(y) };
}

/** Converts a top-left corner to fractions of the free space, for storing a dragged position. */
export function toRelative(area: Rect, width: number, height: number, origin: Point): RelativePosition {
    const fraction = (offset: number, free: number) => (free > 0 ? clamp01(offset / free) : 0.5);
    return [fraction(origin.x - area.x, area.width - width), fraction(origin.y - area.y, area.height - height)];
}

/** Converts stored fractions back to a top-left corner inside the work area. */
export function fromRelative(area: Rect, width: number, height: number, [fx, fy]: RelativePosition): Point {
    const x = area.x + clamp01(fx) * Math.max(0, area.width - width);
    const y = area.y + clamp01(fy) * Math.max(0, area.height - height);
    return { x: Math.round(x), y: Math.round(y) };
}

function clamp01(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}
