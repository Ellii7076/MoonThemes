/* "Годжо" (family gojo): her Gojo wallpaper behind a plain interface, drawn
 * by styles/themes/gojo.css on Шалфей's pieces (src/sage.js). What this
 * file adds:
 *
 *   - a third key in the composer, "•••", that opens a pill upwards with
 *     every button SillyTavern keeps in its top bar (the panels), the chat
 *     list, the character card and the header slots. The window tabs of
 *     Шалфей are hidden, this menu replaces them; on the chat list (no
 *     composer there) the same key floats in the corner, over any panel;
 *   - the poster's Japanese credits at the screen edges;
 *   - the wallpaper: one per chat from WALLS (light ones for the light
 *     theme, dark for the dark), kept per chat; "Другие обои" in the menu
 *     deals the next one once there are several. */

import { getContext, isDesk } from './boot.js?v=0.5.4';
import { HEADER_SLOTS, actionInfo, collectServers, faClass, runAction, slotAction } from './actions.js?v=0.5.4';

const ART_BASE = new URL('../assets/gojo/', import.meta.url).href;

/* Wallpapers in assets/gojo/, per variant. */
const WALLS = {
    light: ['wall-light-01.webp'],
    dark: ['wall-dark-01.webp'],
};

const PICKS_KEY = 'dc-gojo-art';

let api = null;

export function gojoOn() {
    return document.documentElement.dataset.dcFamily === 'gojo';
}

function el(tag, className, html) {
    const node = document.createElement(tag);
    node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ST closes unpinned drawers on any press outside them. */
function keepDrawers(node) {
    for (const type of ['mousedown', 'touchstart']) {
        node.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
}

function chatId() {
    return getContext()?.getCurrentChatId?.() || '';
}

/* ── The wallpaper ──────────────────────────────────────────────────────── */

function readPicks() {
    try {
        return JSON.parse(localStorage.getItem(PICKS_KEY) || '{}') || {};
    } catch {
        return {};
    }
}

function writePicks(picks) {
    try {
        localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
    } catch { /* private mode: the pick lasts until reload */ }
}

function hash(text) {
    let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h);
}

function walls() {
    return WALLS[document.documentElement.dataset.dcSkin === 'gojo-dark' ? 'dark' : 'light'];
}

function artIndex(id) {
    const list = walls();
    const pick = readPicks()[id];
    if (Number.isInteger(pick) && list[pick]) return pick;
    return hash(id || 'home') % list.length;
}

function applyArt() {
    const file = walls()[artIndex(chatId())];
    for (const host of [document.getElementById('sheld'), document.getElementById('dc-home')]) {
        host?.style.setProperty('--gj-wall', `url("${ART_BASE}${file}")`);
    }
}

function nextArt() {
    const id = chatId();
    if (!id) return;
    const picks = readPicks();
    picks[id] = (artIndex(id) + 1) % walls().length;
    writePicks(picks);
    applyArt();
}

/* ── The "•••" menu ─────────────────────────────────────────────────────── */

function menuItems() {
    const panel = document.body.dataset.dcPanel || '';
    const items = [
        { key: 'list', icon: 'fa-solid fa-list-ul', label: 'Чаты', on: !panel && document.body.dataset.dcScreen === 'home' && !isDesk() },
    ];
    items.push(document.documentElement.dataset.dcSkin === 'gojo-dark'
        ? { key: 'shelf', icon: 'fa-solid fa-film', label: 'Афиша' }
        : { key: 'shelf', icon: 'fa-solid fa-book-open', label: 'Полка' });
    if (chatId()) {
        items.push({ key: 'card', icon: 'fa-solid fa-id-card', label: 'Персонаж' });
        if (walls().length > 1) items.push({ key: 'art', icon: 'fa-solid fa-shuffle', label: 'Другие обои' });
    }
    for (const s of collectServers()) items.push({ key: `panel:${s.panel}`, icon: faClass(s.icon), label: s.title, on: panel === s.panel });
    const slots = Object.keys(HEADER_SLOTS).map((slot) => ({ slot, key: slotAction(slot) })).filter((s) => s.key !== 'none');
    if (slots.length) {
        for (const s of slots) {
            const info = actionInfo(s.key);
            items.push({ key: `slot:${s.slot}`, icon: faClass(info?.icon || HEADER_SLOTS[s.slot].icon), label: info?.label || HEADER_SLOTS[s.slot].label });
        }
    }
    return items;
}

function menuHtml() {
    return menuItems().map((it) => `
        <button type="button" class="gj-mi${it.on ? ' active' : ''}" data-key="${escapeHtml(it.key)}" title="${escapeHtml(it.label)}" aria-label="${escapeHtml(it.label)}">
            <i class="${it.icon}"></i><span>${escapeHtml(it.label)}</span>
        </button>`).join('');
}

/* A tile runs only when the press began on that same tile, the finger
   barely moved, and the menu had finished opening — so a scroll or a tap
   that lands while it appears never opens a neighbour. */
let openedAt = 0;
let press = null;

function menu() {
    let node = document.getElementById('gj-menu');
    if (!node) {
        node = el('nav', 'gj-menu');
        node.id = 'gj-menu';
        keepDrawers(node);
        node.addEventListener('pointerdown', (event) => {
            const item = event.target.closest('.gj-mi');
            press = item ? { item, x: event.clientX, y: event.clientY } : null;
        });
        node.addEventListener('click', (event) => {
            const item = event.target.closest('.gj-mi');
            if (!item) return;
            const ok = event.detail === 0 || press && press.item === item && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 12
                && performance.now() - openedAt > 180;
            press = null;
            if (!ok) return;
            closeMenu();
            run(item.dataset.key);
        });
        document.body.append(node);
    }
    return node;
}

function run(key) {
    if (key === 'list') api.showList();
    else if (key === 'shelf') api.showHomePage();
    else if (key === 'card') document.querySelector('#sheld > .dc-chat-header .dc-chat-peer')?.click();
    else if (key === 'art') nextArt();
    else if (key.startsWith('slot:')) runAction(slotAction(key.slice(5)));
    else if (key.startsWith('panel:')) {
        const server = collectServers().find((s) => s.panel === key.slice(6));
        if (server) api.togglePanel(server);
    }
}

function openMenu(from) {
    const node = menu();
    node.innerHTML = menuHtml();
    /* A block of icons: from the composer's key, it lies along the top of the
       composer, as wide as it; from the round key on the list, it lies to the
       left of the key, on its line. */
    const box = from.getBoundingClientRect();
    const form = from.id === 'gj-menu-btn' ? document.getElementById('send_form')?.getBoundingClientRect() : null;
    const left = form ? form.left : 8;
    const right = form ? window.innerWidth - form.right : window.innerWidth - box.left + 8;
    const bottom = form ? window.innerHeight - form.top + 8 : window.innerHeight - box.bottom + (box.height - 48) / 2;
    node.style.setProperty('--gj-menu-left', `${Math.max(4, left)}px`);
    node.style.setProperty('--gj-menu-right', `${Math.max(4, right)}px`);
    node.style.setProperty('--gj-menu-bottom', `${bottom}px`);
    openedAt = performance.now();
    document.body.classList.add('gj-menu-open');
    from.classList.add('active');
}

function closeMenu() {
    document.body.classList.remove('gj-menu-open');
    document.querySelectorAll('.gj-menu-key.active').forEach((k) => k.classList.remove('active'));
}

function toggleMenu(from) {
    if (document.body.classList.contains('gj-menu-open')) closeMenu();
    else openMenu(from);
}

function menuKey(className) {
    const key = el('div', `gj-menu-key ${className} interactable`, '<i class="fa-solid fa-ellipsis"></i>');
    key.title = 'Меню';
    key.tabIndex = 0;
    keepDrawers(key);
    key.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleMenu(key);
    });
    return key;
}

function ensureKeys() {
    const right = document.getElementById('rightSendForm');
    if (right && !document.getElementById('gj-menu-btn')) {
        const key = menuKey('gj-compose-key');
        key.id = 'gj-menu-btn';
        right.prepend(key);
    }
    /* The chat header is gone here, and the list's key went with it. */
    const sheld = document.getElementById('sheld');
    if (sheld && !document.getElementById('gj-list-btn')) {
        const key = el('div', 'gj-compose-key interactable');
        key.id = 'gj-list-btn';
        key.title = 'Список чатов';
        key.tabIndex = 0;
        keepDrawers(key);
        key.addEventListener('click', (event) => {
            event.stopPropagation();
            api.toggleList();
        });
        sheld.append(key);
    }
    /* On <body>, so it stays over an open panel (they sit above the list). */
    if (!document.querySelector('body > .gj-fab')) document.body.append(menuKey('gj-fab'));
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

/* The poster's lettering that isn't a pseudo-element: the credit at the
   top right ("出演 五条悟" — featuring Gojo Satoru) and his line down the
   right edge (天上天下唯我独尊, "in all the heavens and the earth, I alone
   am the honoured one"). */
function ensureCredits(host) {
    if (!host || host.querySelector(':scope > .gj-credit')) return;
    host.prepend(el('div', 'gj-credit gj-credit-side', '天上天下唯我独尊'));
    host.prepend(el('div', 'gj-credit gj-credit-top', '出演<br>五条 悟'));
}

function ensureAll() {
    ensureKeys();
    ensureCredits(document.getElementById('sheld'));
    ensureCredits(document.getElementById('dc-home'));
    applyArt();
}

/** api: { showList(), showChat(), showHomePage(), toggleList(), togglePanel(server) } */
export function initGojo(shellApi) {
    if (!gojoOn()) return;
    api = shellApi;
    document.body.classList.add('gj-on');
    ensureAll();
    const ctx = getContext();
    const types = ctx?.eventTypes || {};
    for (const type of [types.CHAT_CHANGED, types.APP_READY]) {
        if (type) ctx.eventSource.on(type, ensureAll);
    }
    document.addEventListener('pointerdown', (event) => {
        if (!document.body.classList.contains('gj-menu-open')) return;
        if (event.target.closest('#gj-menu, .gj-menu-key')) return;
        closeMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });
    window.setInterval(ensureKeys, 3000);
}
