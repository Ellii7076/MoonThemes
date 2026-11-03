/* Bindable actions for the chat header's three buttons (call, video, search).
 *
 * The catalogue is read from the live DOM, so it includes whatever other
 * extensions have added: every top-bar panel, every item of the "+" menu
 * (SillyTavern's options) and every item of the wand menu.
 *
 * Keys:
 *   none              hide the button
 *   menu:options      open the "+" menu        menu:wand   open the wand menu
 *   panel:<panelId>   open a top-bar panel (Extensions, Presets…)
 *   opt:<id>          an item of the options menu (Continue, Regenerate…)
 *   wand:<id>         a wand item with an id
 *   wandtext:<label>  a wand item without one, matched by its text */

import { dcOption, dcRead, dcWrite } from './boot.js?v=0.5.3';

export const KNOWN_SERVERS = [
    { drawer: 'ai-config-button', panel: 'left-nav-panel', icon: 'fa-sliders', title: 'Пресет' },
    { drawer: 'sys-settings-button', panel: 'rm_api_block', icon: 'fa-plug', title: 'Подключение API' },
    { drawer: 'advanced-formatting-button', panel: 'AdvancedFormatting', icon: 'fa-font', title: 'Форматирование' },
    { drawer: 'WI-SP-button', panel: 'WorldInfo', icon: 'fa-book-atlas', title: 'Лорбуки' },
    { drawer: 'rightNavHolder', panel: 'right-nav-panel', icon: 'fa-address-card', title: 'Персонажи' },
    { drawer: 'persona-management-button', panel: 'PersonaManagement', icon: 'fa-face-smile', title: 'Персоны' },
    { drawer: 'backgrounds-button', panel: 'Backgrounds', icon: 'fa-panorama', title: 'Фоны' },
    { drawer: 'extensions-settings-button', panel: 'rm_extensions_block', icon: 'fa-cubes', title: 'Расширения' },
    { drawer: 'user-settings-button', panel: 'user-settings-block', icon: 'fa-user-gear', title: 'Настройки' },
];

/* Known servers first, then anything another extension put in the top bar. */
export function collectServers() {
    const holder = document.getElementById('top-settings-holder');
    const list = KNOWN_SERVERS.filter((s) => document.getElementById(s.drawer) && document.getElementById(s.panel));
    if (!holder) return list;
    for (const drawer of holder.querySelectorAll(':scope > .drawer')) {
        if (!drawer.id || list.some((s) => s.drawer === drawer.id)) continue;
        const panel = drawer.querySelector('.drawer-content');
        const icon = drawer.querySelector('.drawer-icon');
        if (!panel?.id || !icon) continue;
        list.push({ drawer: drawer.id, panel: panel.id, icon: faIcon(icon) || 'fa-puzzle-piece', title: icon.getAttribute('title') || drawer.id });
    }
    return list;
}

export const HEADER_SLOTS = {
    call: { label: 'Звонок', icon: 'fa-solid fa-phone-volume', fallback: 'opt:option_continue' },
    video: { label: 'Видеозвонок', icon: 'fa-solid fa-video', fallback: 'opt:option_impersonate' },
    search: { label: 'Лупа', icon: 'fa-solid fa-magnifying-glass', fallback: 'opt:option_select_chat' },
};

/* Bindable buttons outside the chat header. The bell on the user bar used
   to open Personas, which stays its default. */
export const OTHER_SLOTS = {
    bell: { label: 'Колокольчик (плашка персоны)', icon: 'fa-solid fa-bell', fallback: 'panel:PersonaManagement' },
};

/* The "Ретро" theme's toolbar in the message window (after its fixed
   Главное / Контакты; the "+" menu and the wand sit in the composer). */
export const ICQ_SLOTS = {
    tb1: { label: 'Пресет', icon: 'fa-solid fa-sliders', fallback: 'panel:left-nav-panel' },
    tb2: { label: 'Лорбуки', icon: 'fa-solid fa-book-atlas', fallback: 'panel:WorldInfo' },
    tb3: { label: 'Заметки', icon: 'fa-solid fa-note-sticky', fallback: 'opt:option_toggle_AN' },
};

export function slotAction(slot) {
    const info = HEADER_SLOTS[slot] || OTHER_SLOTS[slot] || ICQ_SLOTS[slot];
    return dcRead(`hdr-${slot}`, info.fallback);
}

/* The one icon class that names the glyph (fa-cubes), ignoring style classes.
   A brand glyph keeps its family (fa-brands fa-telegram): it has no solid
   version and draws nothing as fa-solid. */
function faIcon(node) {
    if (!node) return '';
    const skip = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-fw', 'fa-lg', 'fa-sm', 'fa-xl']);
    const glyph = [...node.classList].find((c) => c.startsWith('fa-') && !skip.has(c)) || '';
    return glyph && node.classList.contains('fa-brands') ? `fa-brands ${glyph}` : glyph;
}

/** Full icon classes for a catalogue icon: solid unless it names its family. */
export function faClass(icon) {
    if (!icon) return '';
    return /\bfa-(brands|regular)\b/.test(icon) ? icon : `fa-solid ${icon}`;
}

/* Without hidden parts and unread badges ("Telegram" + a hidden "0"). */
function labelOf(node) {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('[hidden], [class*="badge"]').forEach((n) => n.remove());
    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
}

function wandItems() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return [];
    return [...menu.querySelectorAll('.list-group-item, :scope > [id]')]
        .filter((node, i, all) => all.indexOf(node) === i && labelOf(node))
        .map((node) => ({
            key: node.id ? `wand:${node.id}` : `wandtext:${labelOf(node)}`,
            label: labelOf(node),
            icon: faIcon(node.querySelector('[class*="fa-"]') || node),
        }));
}

function optionItems() {
    return [...document.querySelectorAll('#options .options-content a[id]')]
        .filter((a) => labelOf(a))
        .map((a) => ({ key: `opt:${a.id}`, label: labelOf(a), icon: faIcon(a.querySelector('[class*="fa-"]')) }));
}

/** Grouped catalogue: [{ group, items: [{ key, label, icon }] }] */
export function actionCatalog() {
    return [
        {
            group: 'Общее',
            items: [
                { key: 'none', label: 'Скрыть кнопку', icon: 'fa-eye-slash' },
                { key: 'menu:options', label: 'Меню «+»', icon: 'fa-bars' },
                { key: 'menu:wand', label: 'Волшебная палочка', icon: 'fa-wand-magic-sparkles' },
            ],
        },
        { group: 'Разделы', items: collectServers().map((s) => ({ key: `panel:${s.panel}`, label: s.title, icon: s.icon })) },
        { group: 'Меню «+»', items: optionItems() },
        { group: 'Волшебная палочка', items: wandItems() },
    ].filter((g) => g.items.length);
}

function findAction(key) {
    for (const group of actionCatalog()) {
        const hit = group.items.find((i) => i.key === key);
        if (hit) return hit;
    }
    return null;
}

/** Icon classes for a header button bound to `key`. */
export function actionIcon(key, slot) {
    /* The slot's own glyph; Bubble's round buttons show the action's. */
    if (document.documentElement.dataset.dcFamily !== 'y2k') return HEADER_SLOTS[slot].icon;
    const icon = actionInfo(key)?.icon;
    return icon ? faClass(icon) : HEADER_SLOTS[slot].icon;
}

/** { label, icon } of an action from the live catalogue, or null.
   Remembered: right after a reload the wand menu is still being filled by
   other extensions, and a bound button must not show its default meanwhile. */
export function actionInfo(key) {
    const hit = findAction(key);
    if (hit) {
        const saved = JSON.stringify({ label: hit.label, icon: hit.icon });
        if (dcRead(`info:${key}`, '') !== saved) dcWrite(`info:${key}`, saved);
        return hit;
    }
    try {
        return JSON.parse(dcRead(`info:${key}`, 'null'));
    } catch {
        return null;
    }
}

export function actionLabel(key) {
    return actionInfo(key)?.label || '';
}

function locate(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    if (kind === 'opt' || kind === 'wand') return document.getElementById(id);
    if (kind === 'wandtext') {
        return [...(document.getElementById('extensionsMenu')?.querySelectorAll('.list-group-item') || [])]
            .find((n) => labelOf(n) === id) || null;
    }
    return null;
}

/* Open/close the "+" or wand menu. The click must not bubble: ST closes the
   "+" menu from a document-level click handler unless the pointer is over
   it — true for a finger on the button, false for a click we dispatch, so a
   bubbling click would open and instantly shut it. */
export function toggleMenu(which) {
    const button = document.getElementById(which === "wand" ? "extensionsMenuButton" : "options_button");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true }));
}

/* Every action is deferred by a macrotask: SillyTavern's document-level
   "click outside closes it" handlers must finish with the tap that got us
   here before the thing we open starts listening. */
export function runAction(key) {
    if (!key || key === 'none') return;
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');

    window.setTimeout(() => {
        if (kind === 'menu') {
            toggleMenu(id);
            return;
        }
        if (kind === 'panel') {
            const panel = document.getElementById(id);
            if (!panel || panel.classList.contains('openDrawer')) return;
            panel.closest('.drawer')?.querySelector(':scope > .drawer-toggle')?.click();
            return;
        }
        const node = locate(key);
        if (node) node.click();
        else window.toastr?.warning('Это действие сейчас недоступно — расширение не загружено?');
    }, 0);
}
