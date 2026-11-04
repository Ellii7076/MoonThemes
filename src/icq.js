/* Theme "Ретро": the pieces of a Windows 98 messenger window the shared
 * layout has no element for. Only runs with that theme on; styles/themes/icq.css
 * draws everything else.
 *
 *   - the contact list window's title bar (your name) and menu bar
 *     (Главное ▾ with every panel, Новый чат, Найти) — the Discord rail is
 *     hidden in this theme, the menu replaces it;
 *   - group headers in the contact list: "Закреплённые" and "Контакты";
 *   - the message window's toolbar (continue, another variant, the "+" and
 *     wand menus).
 *
 * Every element is re-added if SillyTavern or the shell rebuilds its host. */

import { getContext } from './boot.js?v=0.5.4';
import { ICQ_SLOTS, actionInfo, collectServers, faClass, runAction, slotAction } from './actions.js?v=0.5.4';
import { openSheet } from './sheet.js?v=0.5.4';

export function icqOn() {
    return document.documentElement.dataset.dcFamily === 'icq';
}

function el(tag, className, html) {
    const node = document.createElement(tag);
    node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

const WINDOW_BUTTONS = '<span class="icq-winbtns" aria-hidden="true"><b>_</b><b>□</b><b>×</b></span>';

/* ── Contact list window ────────────────────────────────────────────────── */

function clickHome(selector) {
    document.querySelector(`#dc-home ${selector}`)?.click();
}

function openMainMenu() {
    const servers = collectServers().map((s) => ({
        icon: faClass(s.icon),
        label: s.title,
        run: () => runAction(`panel:${s.panel}`),
    }));
    openSheet({
        groups: [
            [
                { icon: 'fa-solid fa-house', label: 'Главная', run: () => clickHome('.dc-dm-home') },
                { icon: 'fa-solid fa-address-book', label: 'Персонажи', run: () => clickHome('.dc-dm-chars') },
                { icon: 'fa-solid fa-user-plus', label: 'Новый персонаж', run: () => clickHome('.dc-rail-add') },
            ],
            ['Разделы', ...servers],
        ],
    });
}

function ensureListChrome() {
    const home = document.getElementById('dc-home');
    if (!home) return;
    if (!home.querySelector(':scope > .icq-title')) {
        const title = el('div', 'icq-title', `<span class="icq-appicon fa-solid fa-comments"></span><span class="icq-title-text"></span>${WINDOW_BUTTONS}`);
        const menu = el('div', 'icq-menubar', `
            <button type="button" data-icq="main"><u>Г</u>лавное ▾</button>
            <button type="button" data-icq="new"><u>Н</u>овый чат</button>
            <button type="button" data-icq="find"><u>Н</u>айти</button>`);
        /* ST closes unpinned drawers on any press outside them; the menu
           drives panels itself. */
        for (const type of ['mousedown', 'touchstart']) {
            menu.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
        }
        menu.addEventListener('click', (event) => {
            const act = event.target.closest('[data-icq]')?.dataset.icq;
            if (act === 'main') openMainMenu();
            if (act === 'new') clickHome('.dc-dm-new');
            if (act === 'find') clickHome('.dc-dm-search');
        });
        home.prepend(title, menu);
    }
    const name = getContext()?.name1 || '';
    const text = home.querySelector('.icq-title-text');
    const wanted = name || 'MoonThemes';
    if (text.textContent !== wanted) text.textContent = wanted;
}

/* "Закреплённые (2)" / "Контакты (14)" between the rows. The shell redraws
   the list wholesale, so the headers are put back after every redraw. */
function groupList(list) {
    list.querySelectorAll(':scope > .icq-group').forEach((n) => n.remove());
    const items = [...list.querySelectorAll(':scope > .dc-dm-item')];
    if (!items.length) return;
    const pinned = items.filter((i) => i.dataset.pinned === '1');
    const rest = items.filter((i) => i.dataset.pinned !== '1');
    const header = (label, count) => el('div', 'icq-group', `<span>▾</span> ${label} (${count})`);
    if (pinned.length) list.insertBefore(header('Закреплённые', pinned.length), pinned[0]);
    if (rest.length) list.insertBefore(header(pinned.length ? 'Контакты' : 'Все контакты', rest.length), rest[0]);
}

function watchList() {
    const list = document.querySelector('#dc-home .dc-dm-list');
    if (!list || list.dataset.icqWatched) return;
    list.dataset.icqWatched = '1';
    let queued = false;
    new MutationObserver((records) => {
        /* Our own headers going in and out must not loop. */
        const foreign = records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => !n.classList?.contains('icq-group')));
        if (!foreign || queued) return;
        queued = true;
        queueMicrotask(() => {
            queued = false;
            groupList(list);
        });
    }).observe(list, { childList: true });
    groupList(list);
}

/* ── Message window ─────────────────────────────────────────────────────── */

/* The toolbar's buttons are bindable (settings, "Ретро: панель кнопок").
   A button keeps its own short label and icon until it is rebound; then it
   takes the bound action's. Redrawn on every check: right after a reload
   the bound action may not be in its menu yet. */
function renderToolbar(bar) {
    const nav = `
        <button type="button" data-icq="main" title="Главное"><i class="fa-solid fa-list"></i><span>Главное ▾</span></button>
        <button type="button" data-icq="contacts" title="Контакты"><i class="fa-solid fa-address-book"></i><span>Контакты</span></button>`;
    const html = nav + Object.entries(ICQ_SLOTS).map(([slot, info]) => {
        const key = slotAction(slot);
        if (key === 'none') return '';
        const own = key === info.fallback;
        const found = own ? null : actionInfo(key);
        const label = own ? info.label : (found?.label || info.label);
        const icon = own ? info.icon : (found?.icon ? faClass(found.icon) : info.icon);
        return `<button type="button" data-slot="${slot}" title="${label.replace(/"/g, '&quot;')}"><i class="${icon}"></i><span>${label.replace(/</g, '&lt;')}</span></button>`;
    }).join('');
    if (bar.dataset.html === html) return;
    bar.dataset.html = html;
    bar.innerHTML = html;
}

function ensureChatChrome() {
    const header = document.querySelector('#sheld > .dc-chat-header');
    if (!header) return;
    if (!header.querySelector('.icq-winbtns')) header.insertAdjacentHTML('beforeend', WINDOW_BUTTONS);

    /* One row of buttons: Главное ▾ and Контакты first, then the bindable
       actions. The "+" menu and the wand live in the composer. */
    let bar = header.nextElementSibling;
    if (!bar?.classList.contains('icq-toolbar')) {
        bar = el('div', 'icq-toolbar');
        bar.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.dataset.icq === 'main') openMainMenu();
            /* Phone: back to the list; desktop: show/hide the list window. */
            if (button.dataset.icq === 'contacts') {
                const desk = document.documentElement.dataset.dcDesk === 'on';
                header.querySelector(desk ? '.dc-list-toggle' : '.dc-back')?.click();
            }
            if (button.dataset.slot) runAction(slotAction(button.dataset.slot));
        });
        header.after(bar);
    }
    renderToolbar(bar);
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

function ensureAll() {
    ensureListChrome();
    watchList();
    ensureChatChrome();
}

export function initIcq() {
    if (!icqOn()) return;
    document.body.classList.add('icq-on');
    ensureAll();
    const ctx = getContext();
    for (const type of [ctx?.eventTypes?.APP_READY, ctx?.eventTypes?.PERSONA_CHANGED, ctx?.eventTypes?.SETTINGS_UPDATED, ctx?.eventTypes?.CHAT_CHANGED]) {
        if (type) ctx.eventSource.on(type, ensureAll);
    }
    window.addEventListener('dc-option', (e) => {
        if (String(e.detail?.key).startsWith('hdr-tb')) {
            const bar = document.querySelector('#sheld .icq-toolbar');
            if (bar) renderToolbar(bar);
        }
    });
    /* A late rebuild of the shell's elements is caught here. */
    window.setInterval(ensureAll, 3000);
}
