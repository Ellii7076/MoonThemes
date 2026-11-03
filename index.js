/* Discord Mobile — entry point.
 *
 * boot     pre-paint flags + stylesheet, must run first
 * settings the extension's own panel; loads even when disabled,
 *          otherwise there is no way to switch the theme back on
 * shell    home screen (rail + recent chats), chat screen, navigation
 * messages Discord-style grouping, timestamps, date dividers, action sheet
 *
 * No top-level await: some WebViews never finish a module that awaits at
 * the top level. */

import { DC_ENABLED, DC_VERSION } from './src/boot.js?v=0.5.3';
import './src/settings.js?v=0.5.3';

if (DC_ENABLED) {
    Promise.all([
        import(`./src/shell.js?v=${DC_VERSION}`),
        import(`./src/messages.js?v=${DC_VERSION}`),
    ]).catch((error) => {
        console.error('[Discord Mobile] failed to load:', error);
    });
} else {
    console.info('[Discord Mobile] Disabled; only the settings panel is active.');
}
