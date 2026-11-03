/* The SillyTavern UI theme that goes with each skin.
 *
 * The extension's stylesheet owns the layout; the theme owns the palette ST
 * itself keeps (text, italics, quotes, links) plus clears any custom CSS a
 * previous theme left behind, which would otherwise fight the layout.
 *
 * Installed through SillyTavern's own importer, so the theme lands in the
 * normal theme dropdown and the user can switch back to their old one there.
 * Each skin's theme is put on once by itself (autoInstallTheme); after that
 * the user's own choice of ST theme is left alone. */

import { DC_SKINS, dcOption, dcRead, dcWrite, getContext } from './boot.js?v=0.5.3';
import { saveSettings } from '../../../../../script.js';

function skinOf(id = dcOption('skin')) {
    return DC_SKINS[id] || DC_SKINS.discord;
}

function themeUrl(skin) {
    return new URL(`../themes/${skin.theme}`, import.meta.url);
}

function hasOption(select, name) {
    return [...select.options].some((o) => o.value === name);
}

export function isThemeActive(id) {
    const select = document.getElementById('themes');
    return select instanceof HTMLSelectElement && select.value === skinOf(id).themeName;
}

const PALETTE = {
    main_text_color: ['--SmartThemeBodyColor', '#main-text-color-picker'],
    italics_text_color: ['--SmartThemeEmColor', '#italics-color-picker'],
    underline_text_color: ['--SmartThemeUnderlineColor', '#underline-color-picker'],
    quote_text_color: ['--SmartThemeQuoteColor', '#quote-color-picker'],
};

/* Bring an already-installed skin theme up to the bundled palette.
 *
 * SillyTavern keeps the active colours in power_user (settings.json) and its
 * theme list in memory, so updating the JSON alone changes nothing until the
 * theme is re-picked. This writes the palette into power_user and the CSS
 * variables directly, and refreshes the theme file on the server.
 *
 * Runs once per palette version: if the user later tweaks a colour with ST's
 * own pickers, we leave it alone until the bundled palette changes again. */
export async function syncThemePalette() {
    const skin = skinOf();
    if (!isThemeActive()) return;
    const ctx = getContext();
    const power = ctx?.powerUserSettings;
    if (!power) return;

    const response = await fetch(themeUrl(skin), { cache: 'no-cache' });
    if (!response.ok) return;
    const theme = await response.json();

    const stamp = `${skin.themeName}|${Object.keys(PALETTE).map((k) => theme[k]).join('|')}|${theme.toastr_position || ''}`;
    if (dcRead('palette', '') === stamp) return;

    for (const [key, [cssVar, picker]] of Object.entries(PALETTE)) {
        if (!theme[key]) continue;
        power[key] = theme[key];
        document.documentElement.style.setProperty(cssVar, theme[key]);
        document.querySelector(picker)?.setAttribute('color', theme[key]);
    }
    /* Where toasts appear is part of the theme too; ST's own select applies
       it (power_user + toastr's options). */
    const toastSelect = document.getElementById('toastr_position');
    if (theme.toastr_position && toastSelect instanceof HTMLSelectElement && toastSelect.value !== theme.toastr_position) {
        toastSelect.value = theme.toastr_position;
        toastSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    ctx.saveSettingsDebounced?.();
    await fetch('/api/themes/save', {
        method: 'POST',
        headers: ctx.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
    }).catch(() => {});
    dcWrite('palette', stamp);
}

/* Install (or refresh) the theme of skin `id` and make it ST's current one. */
export async function installTheme(id = dcOption('skin')) {
    const skin = skinOf(id);
    const select = document.getElementById('themes');
    const input = document.getElementById('ui_preset_import_file');
    if (!(select instanceof HTMLSelectElement) || !(input instanceof HTMLInputElement)) {
        throw new Error('theme controls not found');
    }

    const response = await fetch(themeUrl(skin), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`theme file: HTTP ${response.status}`);
    const theme = await response.json();

    if (!hasOption(select, skin.themeName)) {
        /* ST's importer registers the theme in its private list and saves it
           on the server; feeding it a File is the only public way in. */
        const transfer = new DataTransfer();
        transfer.items.add(new File([JSON.stringify(theme)], skin.theme, { type: 'application/json' }));
        const added = new Promise((resolve, reject) => {
            const observer = new MutationObserver(() => {
                if (hasOption(select, skin.themeName)) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(select, { childList: true });
            window.setTimeout(() => {
                observer.disconnect();
                reject(new Error('import timed out'));
            }, 15000);
        });
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await added;
    } else {
        /* Already registered: refresh the file on the server so updates to
           the bundled palette reach it. */
        await fetch('/api/themes/save', {
            method: 'POST',
            headers: getContext()?.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
            body: JSON.stringify(theme),
        });
    }

    select.value = skin.themeName;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    dcWrite(`theme-auto:${id}`, 'done');
    /* Re-picking applies ST's in-memory copy, which may predate the bundled
       palette; force the current colours on top. */
    dcWrite('palette', '');
    await syncThemePalette();
}

/* First run of a skin (a fresh install, or the first switch to it): put its
   theme on by itself. Only once — after that, whatever ST theme the user
   picks stays. */
export async function autoInstallTheme() {
    const id = dcOption('skin');
    /* ST themes under names that were withdrawn (a recolour that was
       dropped, themes that were renamed): whoever is still on one gets the
       current theme's file instead, and the stale one is removed. */
    const select = document.getElementById('themes');
    const stale = ['Noir (скин)', 'ICQ Classic', 'ICQ Classic Dark', 'MoonThemes Тема 4', 'MoonThemes Тема 4 тёмная', 'MoonThemes Ретро 3', 'MoonThemes Зелёная'];
    if (select instanceof HTMLSelectElement && stale.includes(select.value)) {
        const old = select.value;
        await installTheme(id);
        await fetch('/api/themes/delete', {
            method: 'POST',
            headers: getContext()?.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: old }),
        }).catch(() => {});
        select.querySelector(`option[value="${CSS.escape(old)}"]`)?.remove();
        return;
    }
    if (dcRead(`theme-auto:${id}`, '')) return;
    if (isThemeActive(id)) {
        dcWrite(`theme-auto:${id}`, 'done');
        return;
    }
    await installTheme(id);
    window.toastr?.success(`Тема таверны «${skinOf(id).themeName}» включена`);
}

/* Switch skins: the new skin's theme goes on, then the page reloads so the
   whole layout starts over in the new look. */
export async function switchSkin(id) {
    if (!DC_SKINS[id]) return;
    dcWrite('skin', id);
    try {
        await installTheme(id);
    } catch (error) {
        console.error('[Discord Mobile] theme install failed', error);
        window.toastr?.error('Тема сменилась, но файл темы таверны поставить не вышло. Её можно поставить кнопкой в настройках расширения.');
        await new Promise((r) => window.setTimeout(r, 2500));
    }
    /* ST saves settings with a debounce; give the theme choice time to land. */
    await saveSettings().catch(() => {});
    window.location.reload();
}

/* MoodTube (the music player extension) keeps one custom theme in
 * localStorage and draws it from two <style> tags of its own. This puts the
 * player theme that goes with the current MoonThemes theme (moodtube/*.json,
 * MoodTube's own export format) in there, and applies it on the spot the
 * way MoodTube itself does — no reload. */
const MT_VARS = {
    accent: '--mt-accent',
    accent_hover: '--mt-accent-hover',
    bg_primary: '--mt-bg-primary',
    bg_secondary: '--mt-bg-secondary',
    bg_input: '--mt-bg-input',
    border: '--mt-border',
    text: '--mt-text',
    text_dim: '--mt-text-dim',
    text_on_accent: '--mt-text-on-accent',
};

export function moodTubeFound() {
    return Boolean(document.querySelector('#moodtube-mini-player, #moodtube-fab, #mt-settings-modal'));
}

/** Returns the MoodTube theme's name. */
export async function installMoodTubeTheme(id = dcOption('skin')) {
    const response = await fetch(new URL(`../moodtube/${skinOf(id).moodtube}`, import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`MoodTube theme: HTTP ${response.status}`);
    const { type: _type, version: _version, ...theme } = await response.json();
    localStorage.setItem('moodtube_custom_theme', JSON.stringify(theme));
    localStorage.setItem('moodtube_theme', 'custom');

    for (const node of [document.documentElement, document.getElementById('mt-settings-modal'), document.getElementById('moodtube-mini-player')]) {
        node?.setAttribute('data-mt-theme', 'custom');
    }
    /* Last in <head>, like MoodTube keeps them, so they win. */
    const style = (styleId) => {
        let node = document.getElementById(styleId);
        if (!node) {
            node = document.createElement('style');
            node.id = styleId;
        }
        document.head.append(node);
        return node;
    };
    const vars = Object.entries(MT_VARS)
        .map(([key, css]) => (theme.vars?.[key] ? `    ${css}: ${String(theme.vars[key]).replace(/[;{}<>]/g, '')};` : ''))
        .filter(Boolean);
    style('moodtube-custom-theme-css').textContent = `[data-mt-theme="custom"] {\n${vars.join('\n')}\n}`;
    style('moodtube-custom-theme-user-css').textContent = theme.custom_css || '';
    for (const [key, target] of [['header', '#moodtube-label-header'], ['subtitle', '#moodtube-label-subtitle']]) {
        const node = document.querySelector(target);
        if (node) node.textContent = theme.labels?.[key] ?? '';
    }
    const select = document.getElementById('moodtube-setting-theme');
    if (select) select.value = 'custom';
    return theme.name;
}
