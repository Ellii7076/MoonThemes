/* Theme "Bubble" (internal id "y2k"): rounded purple Y2K web windows. Only runs with that theme on;
 * styles/themes/y2k.css draws everything else.
 *
 * Its own arrangement of the app:
 *   - chats you open become tabs over the message window, like a browser;
 *     "+" goes to the contact list, × closes a tab;
 *   - the panels are a dock of round buttons (no rail), with "Ещё" for the
 *     rest — along the bottom, on top, or slid out from the left edge
 *     (option y2kdock); the tabs can be switched off (option y2ktabs);
 *   - the contact list window gets a title pill with three round buttons
 *     (search, characters, new chat).
 *
 * Tabs are remembered in localStorage. Every element is re-added if
 * SillyTavern or the shell rebuilds its host. */

import { dcOption, dcRead, dcWrite, getContext, isDesk } from './boot.js?v=0.5.4';
import { collectServers, faClass } from './actions.js?v=0.5.4';
import { openSheet } from './sheet.js?v=0.5.4';

const MAX_TABS = 8;
/* Panels on the dock itself; every other one is under "Ещё". */
const DOCK_PANELS = ['left-nav-panel', 'rm_api_block', 'right-nav-panel', 'WorldInfo', 'rm_extensions_block'];

let api = null;

export function y2kOn() {
    return document.documentElement.dataset.dcFamily === 'y2k';
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

/* ── Tabs ───────────────────────────────────────────────────────────────── */

function readTabs() {
    try {
        const tabs = JSON.parse(dcRead('y2k-tabs', '[]'));
        return Array.isArray(tabs) ? tabs.filter((t) => t?.key && t.file) : [];
    } catch {
        return [];
    }
}

function writeTabs(tabs) {
    dcWrite('y2k-tabs', JSON.stringify(tabs));
}

/** The open chat as a tab, or null with none open. */
function currentTab() {
    const ctx = getContext();
    const file = ctx?.getCurrentChatId?.();
    if (!file) return null;
    if (ctx.groupId) {
        const group = ctx.groups.find((g) => String(g.id) === String(ctx.groupId));
        if (!group) return null;
        const first = group.members?.[0];
        return {
            key: `g:${group.id}:${file}`,
            group: group.id,
            file,
            name: group.name,
            img: group.avatar_url || (first ? ctx.getThumbnailUrl('avatar', first) : ''),
        };
    }
    const character = ctx.characters?.[ctx.characterId];
    if (!character) return null;
    return {
        key: `c:${character.avatar}:${file}`,
        avatar: character.avatar,
        file,
        name: character.name,
        img: ctx.getThumbnailUrl('avatar', character.avatar),
    };
}

/* A chat that gets opened (from anywhere) gets a tab. */
function rememberCurrent() {
    const tab = currentTab();
    if (!tab) return;
    const tabs = readTabs();
    const at = tabs.findIndex((t) => t.key === tab.key);
    if (at >= 0) {
        tabs[at] = tab;
    } else {
        tabs.push(tab);
        while (tabs.length > MAX_TABS) tabs.splice(tabs.findIndex((t) => t.key !== tab.key), 1);
    }
    writeTabs(tabs);
}

function openTab(tab) {
    api.open({ chat: { avatar: tab.avatar, group: tab.group }, file: tab.file, name: tab.name });
}

function closeTab(key) {
    const tabs = readTabs();
    const at = tabs.findIndex((t) => t.key === key);
    if (at < 0) return;
    tabs.splice(at, 1);
    writeTabs(tabs);
    /* Closing the tab on screen moves to its neighbour, or to the list. */
    if (currentTab()?.key === key) {
        const next = tabs[at] || tabs[at - 1];
        if (next) openTab(next);
        else api.showList();
    }
    renderTabs();
}

function renderTabs() {
    const bar = document.querySelector('#sheld > .y2k-tabs');
    if (!bar) return;
    const current = currentTab();
    const tabs = readTabs();
    const html = tabs.map((t) => {
        const active = t.key === current?.key;
        return `<button type="button" class="y2k-tab${active ? ' active' : ''}" data-key="${escapeHtml(t.key)}" title="${escapeHtml(`${t.name} · ${t.file}`)}">
            ${t.img ? `<img src="${escapeHtml(t.img)}" alt="">` : ''}
            <span>${escapeHtml(t.name)}</span>
            ${active ? '<i class="fa-solid fa-xmark y2k-tab-x" title="Закрыть вкладку"></i>' : ''}
        </button>`;
    }).join('') + '<button type="button" class="y2k-tab y2k-tab-add" title="Контакты"><i class="fa-solid fa-plus"></i></button>';
    const strip = bar.querySelector('.y2k-tabs-scroll');
    if (strip.dataset.html !== html) {
        strip.dataset.html = html;
        strip.innerHTML = html;
        strip.querySelector('.y2k-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
}

function ensureTabs() {
    const sheld = document.getElementById('sheld');
    const header = sheld?.querySelector(':scope > .dc-chat-header');
    if (!header) return;
    let bar = sheld.querySelector(':scope > .y2k-tabs');
    if (!bar) {
        bar = el('div', 'y2k-tabs', '<div class="y2k-tabs-scroll"></div>');
        bar.addEventListener('click', (event) => {
            const x = event.target.closest('.y2k-tab-x');
            const tab = event.target.closest('.y2k-tab');
            if (x && tab) {
                closeTab(tab.dataset.key);
                return;
            }
            if (event.target.closest('.y2k-tab-add')) {
                api.showList();
                return;
            }
            if (tab) {
                const found = readTabs().find((t) => t.key === tab.dataset.key);
                if (found && found.key !== currentTab()?.key) openTab(found);
            }
        });
        header.after(bar);
    }
    renderTabs();
}

/* ── Dock ───────────────────────────────────────────────────────────────── */

function openMore() {
    const rest = collectServers().filter((s) => !DOCK_PANELS.includes(s.panel));
    openSheet({
        groups: [rest.map((s) => ({ icon: faClass(s.icon), label: s.title, run: () => api.togglePanel(s) }))],
    });
}

/* `all`: every panel gets its own orb and there is no "Ещё" — the
   slide-out column has the room a row along the bottom lacks. */
function dockHtml(all = false) {
    const servers = collectServers();
    const docked = all ? servers : DOCK_PANELS.map((id) => servers.find((s) => s.panel === id)).filter(Boolean);
    const orb = (attrs, icon, title) => `<button type="button" class="y2k-orb" ${attrs} title="${escapeHtml(title)}"><i class="${icon}"></i></button>`;
    return orb('data-y2k="chats"', 'fa-solid fa-comments', 'Чаты')
        + docked.map((s) => orb(`data-panel="${escapeHtml(s.panel)}"`, faClass(s.icon), s.title)).join('')
        + (all ? '' : orb('data-y2k="more"', 'fa-solid fa-ellipsis', 'Ещё'));
}

function ensureDock(host) {
    if (!host) return;
    let dock = host.querySelector(':scope > .y2k-dock');
    if (!dock) {
        dock = el('nav', 'y2k-dock');
        /* ST closes unpinned drawers on any press outside them; the dock
           drives panels itself. */
        for (const type of ['mousedown', 'touchstart']) {
            dock.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
        }
        dock.addEventListener('click', (event) => {
            const button = event.target.closest('.y2k-orb');
            if (!button) return;
            /* The slide-out dock goes back in once it has been used. */
            document.body.classList.remove('y2k-dock-open');
            if (button.dataset.y2k === 'chats') api.showList();
            else if (button.dataset.y2k === 'more') openMore();
            else {
                const server = collectServers().find((s) => s.panel === button.dataset.panel);
                if (server) api.togglePanel(server);
            }
        });
        host.append(dock);
    }
    const html = dockHtml(host === document.body);
    if (dock.dataset.html !== html) {
        dock.dataset.html = html;
        dock.innerHTML = html;
    }
    markDock(dock);
}

/* The slide-out dock (y2kdock = side): one dock of its own on <body>, so it
   doesn't ride along with the sliding screens, and a tab on the left edge
   that pulls it out. Gone again in the other modes. */
function ensureSideDock() {
    const side = dcOption('y2kdock') === 'side';
    let handle = document.getElementById('y2k-dock-handle');
    if (!side) {
        handle?.remove();
        document.querySelector('body > .y2k-dock')?.remove();
        document.body.classList.remove('y2k-dock-open');
        return;
    }
    ensureDock(document.body);
    if (handle) return;
    handle = el('button', 'y2k-dock-handle', '<i class="fa-solid fa-chevron-right"></i>');
    handle.id = 'y2k-dock-handle';
    handle.type = 'button';
    handle.title = 'Разделы';
    for (const type of ['mousedown', 'touchstart']) {
        handle.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    handle.addEventListener('click', () => document.body.classList.toggle('y2k-dock-open'));
    document.body.append(handle);
}

/* The open panel's orb is lit; "Чаты" while the list is what's shown. */
function markDock(dock) {
    const panel = document.body.dataset.dcPanel || '';
    const docked = DOCK_PANELS.includes(panel);
    for (const orb of dock.querySelectorAll('.y2k-orb')) {
        let on = false;
        if (orb.dataset.panel) on = orb.dataset.panel === panel;
        else if (orb.dataset.y2k === 'more') on = Boolean(panel) && !docked;
        else on = !panel && document.body.dataset.dcScreen === 'home' && !isDesk();
        orb.classList.toggle('active', on);
    }
}

/* ── Contact list window ────────────────────────────────────────────────── */

function ensureListChrome() {
    const home = document.getElementById('dc-home');
    if (!home) return;
    let title = home.querySelector(':scope > .y2k-title');
    if (!title) {
        title = el('header', 'y2k-title', `
            <span class="y2k-pill"><span class="y2k-led"></span><span class="y2k-title-text"></span></span>
            <button type="button" class="y2k-orb y2k-orb-sm" data-y2k="search" title="Поиск"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button type="button" class="y2k-orb y2k-orb-sm" data-y2k="chars" title="Персонажи"><i class="fa-solid fa-user-plus"></i></button>
            <button type="button" class="y2k-orb y2k-orb-sm" data-y2k="new" title="Новый чат"><i class="fa-solid fa-plus"></i></button>`);
        for (const type of ['mousedown', 'touchstart']) {
            title.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
        }
        title.addEventListener('click', (event) => {
            const act = event.target.closest('[data-y2k]')?.dataset.y2k;
            const selector = { search: '.dc-dm-search', chars: '.dc-dm-chars', new: '.dc-dm-new' }[act];
            if (selector) home.querySelector(selector)?.click();
        });
        home.prepend(title);
    }
    const ctx = getContext();
    const text = title.querySelector('.y2k-title-text');
    const wanted = ctx?.name1 || 'MoonThemes';
    if (text.textContent !== wanted) text.textContent = wanted;
    const online = Boolean(ctx?.onlineStatus && ctx.onlineStatus !== 'no_connection');
    title.querySelector('.y2k-led').classList.toggle('on', online);
    title.querySelector('.y2k-led').title = online ? 'Подключено' : 'Не подключено';
    ensureDock(home);
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

function ensureAll() {
    ensureListChrome();
    ensureTabs();
    ensureDock(document.getElementById('sheld'));
    ensureSideDock();
}

/** api: { open(row), showList(), togglePanel(server) } */
export function initY2k(shellApi) {
    if (!y2kOn()) return;
    api = shellApi;
    document.body.classList.add('y2k-on');
    ensureAll();
    const ctx = getContext();
    const types = ctx?.eventTypes || {};
    ctx?.eventSource.on(types.CHAT_CHANGED, () => {
        rememberCurrent();
        ensureAll();
    });
    for (const type of [types.APP_READY, types.PERSONA_CHANGED, types.SETTINGS_UPDATED, types.ONLINE_STATUS_CHANGED]) {
        if (type) ctx.eventSource.on(type, ensureAll);
    }
    /* Screen and panel changes light a different orb. */
    new MutationObserver(() => {
        for (const dock of document.querySelectorAll('.y2k-dock')) markDock(dock);
    }).observe(document.body, { attributes: true, attributeFilter: ['data-dc-panel', 'data-dc-screen'] });
    window.addEventListener('dc-option', (e) => {
        if (e.detail?.key === 'y2kdock') ensureAll();
    });
    /* A press anywhere else puts the slide-out dock back. */
    document.addEventListener('pointerdown', (e) => {
        if (!document.body.classList.contains('y2k-dock-open')) return;
        if (e.target.closest?.('body > .y2k-dock, #y2k-dock-handle')) return;
        document.body.classList.remove('y2k-dock-open');
    }, true);
    /* A late rebuild of the shell's elements is caught here. */
    window.setInterval(ensureAll, 3000);
}
