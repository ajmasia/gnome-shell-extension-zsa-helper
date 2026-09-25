import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ZsaHelperExtension extends Extension {
    enable(): void {
        console.log('[zsa-helper] enabled');
    }

    disable(): void {
        console.log('[zsa-helper] disabled');
    }
}
