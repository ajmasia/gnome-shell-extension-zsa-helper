import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { buildPreferences } from './prefs/build.js';

export default class ZsaHelperPrefs extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        buildPreferences(window, this.getSettings(), this.metadata['version-name'] ?? 'dev');
    }
}
