/* "Тема 5" (internal id sage): a dark green profile page. Only runs with that
 * theme on; styles/themes/sage.css draws everything else.
 *
 * Its own arrangement of the app:
 *   - every window has folder tabs along its top edge, and the tabs are
 *     SillyTavern's buttons: the chat list, the open chat, every panel. The
 *     one on screen is the raised tab joined to the window; the rest show
 *     their icon only. Three dots on the right are the chat header's three
 *     bindable buttons;
 *   - the chat window has no header: who writes is on every post, and the
 *     chat's tab, tapped again, opens the character card;
 *   - the chat list opens on the same block for your persona, two wide
 *     buttons, then the chats as a numbered track list.
 *
 * "Досье" (family dossier) uses the same pieces with its own words and its
 * own drawing (styles/themes/dossier.css): the tabs are index tabs down the
 * folder's edge, the profile an agent's file card. It keeps a start page
 * (the case board, src/welcome.js), so it has a "Доска" tab too, and on a
 * phone the tabs fold away into the folder: only their edges stick out,
 * and a tap on them pulls them out again (body.ds-tabs-open).
 *
 * Every element is re-added if SillyTavern or the shell rebuilds its host. */

import { getContext, isDesk } from './boot.js?v=0.5.4';
import { HEADER_SLOTS, actionInfo, collectServers, faClass, runAction, slotAction } from './actions.js?v=0.5.4';

let api = null;

const FAMILIES = ['sage', 'dossier', 'gojo'];

export function sageOn() {
    return FAMILIES.includes(document.documentElement.dataset.dcFamily);
}

/* What the pieces say, per theme. */
const WORDS = {
    sage: {
        rows: (name, on, newest) => [['User', `@${name.toLowerCase().replace(/\s+/g, '')}`], ['Status', on ? 'Online Now' : 'Offline'], ['Last Update', newest]],
        newChat: 'Новый чат',
        head: ['#', 'Чаты', 'Время'],
    },
    gojo: {
        rows: (name, on, newest) => [['Профиль', name], ['Статус', on ? 'в сети' : 'не в сети'], ['Последний', newest]],
        newChat: 'Новый чат',
        head: ['#', 'Чаты', 'Время'],
    },
    dossier: {
        rows: (name, on, newest) => [['Agent', name], ['Status', on ? 'Active' : 'Offline'], ['Last entry', newest]],
        newChat: 'Новое дело',
        head: ['File', 'Дело', 'Дата'],
    },
};

function words() {
    return WORDS[document.documentElement.dataset.dcFamily] || WORDS.sage;
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

/* ST closes unpinned drawers on any press outside them; our chrome drives
   the panels itself. */
function keepDrawers(node) {
    for (const type of ['mousedown', 'touchstart']) {
        node.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
}

function hasChat() {
    const ctx = getContext();
    return Boolean(ctx?.getCurrentChatId?.());
}

function online() {
    const ctx = getContext();
    return Boolean(ctx?.onlineStatus && ctx.onlineStatus !== 'no_connection');
}

/* ── Folder tabs ────────────────────────────────────────────────────────── */

function peer() {
    const ctx = getContext();
    if (!ctx || !hasChat()) return null;
    if (ctx.groupId) {
        const group = ctx.groups.find((g) => String(g.id) === String(ctx.groupId));
        const first = group?.members?.[0];
        return { name: group?.name || 'Группа', img: group?.avatar_url || (first ? ctx.getThumbnailUrl('avatar', first) : '') };
    }
    const character = ctx.characters?.[ctx.characterId];
    if (!character) return null;
    return { name: character.name, img: ctx.getThumbnailUrl('avatar', character.avatar) };
}

/* Which tab is the window on: an open panel, else the chat or the list. */
function dossier() {
    return document.documentElement.dataset.dcFamily === 'dossier';
}

/* The themes here with a start page have a tab for it. */
function homeTab() {
    return dossier() || document.documentElement.dataset.dcFamily === 'sage';
}

function activeTab() {
    const panel = document.body.dataset.dcPanel || '';
    if (panel) return `panel:${panel}`;
    if (homeTab() && !hasChat() && (isDesk() || document.body.dataset.dcScreen !== 'home')) return 'home';
    if (isDesk()) return hasChat() ? 'chat' : 'list';
    return document.body.dataset.dcScreen === 'home' ? 'list' : 'chat';
}

function tabsHtml() {
    const active = activeTab();
    const tab = (key, icon, label, extra = '') => `
        <button type="button" class="sg-tab${key === active ? ' active' : ''}" data-tab="${escapeHtml(key)}" title="${escapeHtml(label)}">
            ${extra || `<i class="${icon}"></i>`}<span>${escapeHtml(label)}</span>
        </button>`;
    const who = peer();
    let html = dossier() ? tab('home', 'fa-solid fa-thumbtack', 'Доска') : homeTab() ? tab('home', 'fa-solid fa-house', 'Главная') : '';
    html += tab('list', 'fa-solid fa-list-ul', 'Чаты');
    if (who) html += tab('chat', '', who.name, who.img ? `<img src="${escapeHtml(who.img)}" alt="">` : '<i class="fa-solid fa-message"></i>');
    for (const s of collectServers()) html += tab(`panel:${s.panel}`, faClass(s.icon), s.title);
    return html;
}

function dotsHtml() {
    return Object.keys(HEADER_SLOTS).map((slot) => {
        const key = slotAction(slot);
        const label = actionInfo(key)?.label || HEADER_SLOTS[slot].label;
        return `<button type="button" class="sg-dot" data-slot="${slot}" title="${escapeHtml(label)}" ${key === 'none' ? 'hidden' : ''}></button>`;
    }).join('');
}

function onTab(key) {
    if (key === 'home') api.showHome();
    else if (key === 'list') api.showList();
    else if (key === 'chat') {
        /* Already on the chat: its tab opens the character card. */
        if (activeTab() === 'chat') document.querySelector('#sheld > .dc-chat-header .dc-chat-peer')?.click();
        else api.showChat();
    }
    else if (key.startsWith('panel:')) {
        const server = collectServers().find((s) => s.panel === key.slice(6));
        if (server) api.togglePanel(server);
    }
}

/* Dossier on a phone: tabs folded in, or pulled out (remembered). */
function folds() {
    return dossier() && !isDesk();
}

function setTabsOpen(open) {
    document.body.classList.toggle('ds-tabs-open', open);
    try {
        localStorage.setItem('dc-ds-tabs', open ? 'open' : 'folded');
    } catch { /* private mode */ }
}

function ensureTabs(host) {
    if (!host) return;
    let bar = host.querySelector(':scope > .sg-tabs');
    if (!bar) {
        bar = el('nav', 'sg-tabs', '<button type="button" class="ds-fold" title="Вкладки"><i class="fa-solid fa-chevron-right"></i></button><div class="sg-tabs-scroll"></div><div class="sg-dots"></div>');
        keepDrawers(bar);
        bar.addEventListener('click', (event) => {
            /* Folded tabs: the first tap only pulls them out. */
            if (folds()) {
                const open = document.body.classList.contains('ds-tabs-open');
                if (!open || event.target.closest('.ds-fold')) {
                    setTabsOpen(!open);
                    return;
                }
                setTabsOpen(false);
            }
            const dot = event.target.closest('.sg-dot');
            if (dot) {
                runAction(slotAction(dot.dataset.slot));
                return;
            }
            const tab = event.target.closest('.sg-tab');
            if (tab) onTab(tab.dataset.tab);
        });
        host.prepend(bar);
    }
    const scroll = bar.querySelector('.sg-tabs-scroll');
    const html = tabsHtml();
    if (scroll.dataset.html !== html) {
        scroll.dataset.html = html;
        scroll.innerHTML = html;
        scroll.querySelector('.sg-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const dots = bar.querySelector('.sg-dots');
    const dotHtml = dotsHtml();
    if (dots.dataset.html !== dotHtml) {
        dots.dataset.html = dotHtml;
        dots.innerHTML = dotHtml;
    }
}

/* ── Chat list: your profile, two buttons, a numbered list ──────────────── */

function clickHome(selector) {
    document.querySelector(`#dc-home ${selector}`)?.click();
}

function ensureListProfile() {
    const home = document.getElementById('dc-home');
    if (!home) return;
    let card = home.querySelector(':scope > .sg-profile');
    if (!card) {
        card = el('section', 'sg-profile', `
            <button type="button" class="sg-avatar" data-sg="persona" title="Персона"><img alt=""></button>
            <div class="sg-who">
                <b class="sg-name"></b>
                <div class="sg-meta"></div>
            </div>
            <div class="sg-actions">
                <button type="button" class="sg-wide" data-sg="new"><i class="fa-solid fa-comment"></i><span>${words().newChat}</span></button>
                <button type="button" class="sg-wide" data-sg="chars"><i class="fa-solid fa-user"></i><span>Персонажи</span></button>
                <button type="button" class="sg-wide sg-key" data-sg="search" title="Поиск"><i class="fa-solid fa-magnifying-glass"></i></button>
            </div>`);
        keepDrawers(card);
        card.addEventListener('click', (event) => {
            const act = event.target.closest('[data-sg]')?.dataset.sg;
            if (act === 'persona') runAction('panel:PersonaManagement');
            else if (act === 'new') clickHome('.dc-dm-new');
            else if (act === 'chars') clickHome('.dc-dm-chars');
            else if (act === 'search') clickHome('.dc-dm-search');
        });
        const tabs = home.querySelector(':scope > .sg-tabs');
        if (tabs) tabs.after(card);
        else home.prepend(card);
    }
    const ctx = getContext();
    const name = ctx?.name1 || 'User';
    if (card.querySelector('.sg-name').textContent !== name) card.querySelector('.sg-name').textContent = name;
    const src = home.querySelector('.dc-userbar-avatar img')?.getAttribute('src') || '';
    const img = card.querySelector('.sg-avatar img');
    if (src && img.getAttribute('src') !== src) img.src = src;
    const newest = home.querySelector('.dc-dm-item .dc-dm-time')?.textContent?.trim();
    const rows = words().rows(name, online(), newest || '—');
    const html = rows.map(([k, v]) => `<span class="sg-row"><b>${k}:</b> ${escapeHtml(v)}</span>`).join('');
    const meta = card.querySelector('.sg-meta');
    if (meta.dataset.html !== html) {
        meta.dataset.html = html;
        meta.innerHTML = html;
    }

    /* The list's column heads: "#  Чаты  Время". */
    const list = home.querySelector('.dc-dm-list');
    if (list && !home.querySelector('.sg-listhead')) {
        list.before(el('div', 'sg-listhead', words().head.map((w) => `<span>${w}</span>`).join('')));
    }
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

function ensureAll() {
    ensureTabs(document.getElementById('dc-home'));
    ensureTabs(document.getElementById('sheld'));
    ensureListProfile();
}

let soon = 0;
function ensureSoon() {
    if (soon) return;
    soon = 1;
    queueMicrotask(() => {
        soon = 0;
        ensureAll();
    });
}

/** api: { open(row), showHome(), showList(), showChat(), togglePanel(server) } */
export function initSage(shellApi) {
    if (!sageOn()) return;
    api = shellApi;
    document.body.classList.add('sg-on');
    try {
        if (localStorage.getItem('dc-ds-tabs') === 'open') document.body.classList.add('ds-tabs-open');
    } catch { /* private mode */ }
    ensureAll();
    const ctx = getContext();
    const types = ctx?.eventTypes || {};
    for (const type of [types.CHAT_CHANGED, types.APP_READY, types.PERSONA_CHANGED, types.SETTINGS_UPDATED,
        types.ONLINE_STATUS_CHANGED, types.MESSAGE_RECEIVED, types.MESSAGE_SENT, types.MESSAGE_DELETED]) {
        if (type) ctx.eventSource.on(type, ensureSoon);
    }
    /* Screen and panel changes raise a different tab. */
    new MutationObserver(ensureSoon).observe(document.body, { attributes: true, attributeFilter: ['data-dc-panel', 'data-dc-screen'] });
    window.addEventListener('dc-option', (e) => {
        if (String(e.detail?.key).startsWith('hdr')) ensureSoon();
    });
    /* A late rebuild of the shell's elements is caught here. */
    window.setInterval(ensureAll, 3000);
}
