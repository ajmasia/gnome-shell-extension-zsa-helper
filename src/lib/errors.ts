import GLib from 'gi://GLib';
import Gio from './gio.js';

export function isCancelled(e: unknown): boolean {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

export function isNotFound(e: unknown): boolean {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND);
}

export function errorMessage(e: unknown): string {
    return e instanceof Error || e instanceof GLib.Error ? e.message : String(e);
}
