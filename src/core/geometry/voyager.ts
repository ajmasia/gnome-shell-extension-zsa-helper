/** Physical position of a key: its switch in the matrix and its place on the board. */
export interface KeyPosition {
    /** Matrix row and column, as reported in Oryx `keydown`/`keyup` events. */
    row: number;
    col: number;
    /** Top-left corner in key units (1 = one key width), with column stagger. */
    x: number;
    y: number;
}

/**
 * The 52 Voyager keys indexed in Oryx order: left half by rows (0–23), left thumbs (24–25),
 * right half by rows (26–49) and right thumbs (50–51). Matrix positions and coordinates come
 * from `keyboards/zsa/voyager/keyboard.json` in ZSA's QMK fork.
 */
export const VOYAGER_KEYS: readonly KeyPosition[] = [
    // Left half
    { row: 0, col: 1, x: 0, y: 0.5 }, { row: 0, col: 2, x: 1, y: 0.5 }, { row: 0, col: 3, x: 2, y: 0.25 },
    { row: 0, col: 4, x: 3, y: 0 }, { row: 0, col: 5, x: 4, y: 0.25 }, { row: 0, col: 6, x: 5, y: 0.5 },
    { row: 1, col: 1, x: 0, y: 1.5 }, { row: 1, col: 2, x: 1, y: 1.5 }, { row: 1, col: 3, x: 2, y: 1.25 },
    { row: 1, col: 4, x: 3, y: 1 }, { row: 1, col: 5, x: 4, y: 1.25 }, { row: 1, col: 6, x: 5, y: 1.5 },
    { row: 2, col: 1, x: 0, y: 2.5 }, { row: 2, col: 2, x: 1, y: 2.5 }, { row: 2, col: 3, x: 2, y: 2.25 },
    { row: 2, col: 4, x: 3, y: 2 }, { row: 2, col: 5, x: 4, y: 2.25 }, { row: 2, col: 6, x: 5, y: 2.5 },
    { row: 3, col: 1, x: 0, y: 3.5 }, { row: 3, col: 2, x: 1, y: 3.5 }, { row: 3, col: 3, x: 2, y: 3.25 },
    { row: 3, col: 4, x: 3, y: 3 }, { row: 3, col: 5, x: 4, y: 3.25 }, { row: 4, col: 4, x: 5, y: 3.5 },
    // Left thumbs
    { row: 5, col: 0, x: 5, y: 4.5 }, { row: 5, col: 1, x: 6, y: 4.75 },
    // Right half
    { row: 6, col: 0, x: 10, y: 0.5 }, { row: 6, col: 1, x: 11, y: 0.25 }, { row: 6, col: 2, x: 12, y: 0 },
    { row: 6, col: 3, x: 13, y: 0.25 }, { row: 6, col: 4, x: 14, y: 0.5 }, { row: 6, col: 5, x: 15, y: 0.5 },
    { row: 7, col: 0, x: 10, y: 1.5 }, { row: 7, col: 1, x: 11, y: 1.25 }, { row: 7, col: 2, x: 12, y: 1 },
    { row: 7, col: 3, x: 13, y: 1.25 }, { row: 7, col: 4, x: 14, y: 1.5 }, { row: 7, col: 5, x: 15, y: 1.5 },
    { row: 8, col: 0, x: 10, y: 2.5 }, { row: 8, col: 1, x: 11, y: 2.25 }, { row: 8, col: 2, x: 12, y: 2 },
    { row: 8, col: 3, x: 13, y: 2.25 }, { row: 8, col: 4, x: 14, y: 2.5 }, { row: 8, col: 5, x: 15, y: 2.5 },
    { row: 10, col: 2, x: 10, y: 3.5 }, { row: 9, col: 1, x: 11, y: 3.25 }, { row: 9, col: 2, x: 12, y: 3 },
    { row: 9, col: 3, x: 13, y: 3.25 }, { row: 9, col: 4, x: 14, y: 3.5 }, { row: 9, col: 5, x: 15, y: 3.5 },
    // Right thumbs
    { row: 11, col: 5, x: 9, y: 4.75 }, { row: 11, col: 6, x: 10, y: 4.5 },
];

/** Board size in key units, for laying out the overlay. */
export const VOYAGER_WIDTH = Math.max(...VOYAGER_KEYS.map(k => k.x)) + 1;
export const VOYAGER_HEIGHT = Math.max(...VOYAGER_KEYS.map(k => k.y)) + 1;

const INDEX_BY_MATRIX = new Map(VOYAGER_KEYS.map((key, index) => [`${key.row},${key.col}`, index]));

/** Maps a matrix position from a `keydown`/`keyup` event to the Oryx key index. */
export function matrixToOryxIndex(row: number, col: number): number | undefined {
    return INDEX_BY_MATRIX.get(`${row},${col}`);
}
