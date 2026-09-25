/**
 * Monitors are identified by connector (`DP-1`, `HDMI-1`…) rather than by index, because
 * indices change when screens are plugged in or out. An empty connector means the primary monitor.
 */

/** Monitor index to use for a stored connector; falls back to the primary if it is not connected. */
export function resolveMonitorIndex(
    connector: string,
    indexForConnector: (connector: string) => number,
    primaryIndex: number,
): number {
    if (connector === '') {
        return primaryIndex;
    }
    const index = indexForConnector(connector);
    return index >= 0 ? index : primaryIndex;
}

/** Connector to store for a monitor index: empty for the primary, so it follows primary changes. */
export function connectorToStore(
    index: number,
    primaryIndex: number,
    connectors: readonly string[],
    indexForConnector: (connector: string) => number,
): string {
    if (index === primaryIndex) {
        return '';
    }
    return connectors.find(connector => indexForConnector(connector) === index) ?? '';
}

/**
 * Connectors of the active monitors from a `GetCurrentState` reply of
 * `org.gnome.Mutter.DisplayConfig`, already unpacked:
 * `[serial, monitors, logicalMonitors, properties]`, where each logical monitor is
 * `[x, y, scale, transform, primary, monitors[], properties]` and each monitor spec is
 * `[connector, vendor, product, serial]`.
 */
export function activeConnectors(state: unknown): string[] {
    const logicalMonitors = Array.isArray(state) ? state[2] : undefined;
    if (!Array.isArray(logicalMonitors)) {
        return [];
    }
    const connectors: string[] = [];
    for (const logical of logicalMonitors) {
        const specs = Array.isArray(logical) ? logical[5] : undefined;
        for (const spec of Array.isArray(specs) ? specs : []) {
            if (Array.isArray(spec) && typeof spec[0] === 'string') {
                connectors.push(spec[0]);
            }
        }
    }
    return connectors;
}
