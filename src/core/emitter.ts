type Listener<T> = (payload: T) => void;

export type ListenerErrorHandler = (error: unknown, event: string) => void;

const logListenerError: ListenerErrorHandler = (error, event) =>
    console.error(`[zsa-helper] listener for "${event}" failed: ${error}`);

/**
 * Minimal typed event emitter; `on()` returns a function that removes the listener.
 *
 * Listeners are isolated: one that throws is reported to `onListenerError` and the rest still
 * run. Otherwise a UI bug would travel back into the emitter's caller, e.g. the device read loop,
 * which would take it for a disconnection.
 */
export class Emitter<Events extends Record<string, unknown>> {
    private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

    constructor(private readonly onListenerError: ListenerErrorHandler = logListenerError) {}

    on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
        const set = (this.listeners[event] ??= new Set());
        set.add(listener);
        return () => set.delete(listener);
    }

    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        for (const listener of this.listeners[event] ?? []) {
            try {
                listener(payload);
            } catch (error) {
                this.onListenerError(error, String(event));
            }
        }
    }

    clear(): void {
        this.listeners = {};
    }
}
