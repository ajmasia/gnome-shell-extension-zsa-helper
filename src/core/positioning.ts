export type OverlayPosition = 'bottom-center' | 'top-center' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const MARGIN = 48;

/** Top-left corner for an overlay of the given size inside a monitor's work area. */
export function overlayOrigin(area: Rect, width: number, height: number, position: OverlayPosition, scale = 1): { x: number; y: number } {
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
