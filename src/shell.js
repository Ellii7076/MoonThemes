/* Discord Mobile — the app shell.
 *
 *   #dc-home   rail of "servers" (SillyTavern's top-bar drawers) + the DM
 *              panel with recent chats + the floating user bar
 *   #sheld     SillyTavern's own chat column, restyled into the chat screen
 *              and slid over the home screen like Discord pushes a DM
 *
 * State lives on <body> as data attributes so CSS does all the drawing:
 *   data-dc-screen = home | chat
 *   data-dc-panel  = id of the open SillyTavern drawer, or empty
 *
 * Rules (inherited from SillyTelegram, each learned the hard way):
 *   - open/close native drawers ONLY through their own .drawer-toggle, so
 *     SillyTavern's bookkeeping stays in step, and defer that click by a
 *     macrotask so ST's html-level outside-click closer doesn't eat it;
 *   - never remember "already built" — check the DOM and rebuild. */

import { dcOption, dcRead, dcSetOption, dcWrite, getContext, isDesk } from './boot.js?v=0.5.4';
import { initDesktop, listShown, setListShown, toggleList } from './desktop.js?v=0.5.4';
import { initWelcome, refreshWelcome, welcomeShown } from './welcome.js?v=0.5.4';
import { initIcq } from './icq.js?v=0.5.4';
import { initY2k } from './y2k.js?v=0.5.4';
import { initSage } from './sage.js?v=0.5.4';
import { initGojo } from './gojo.js?v=0.5.4';
import { openSheet, wireDragDown } from './sheet.js?v=0.5.4';
import { initPanels, paintRanges } from './panels.js?v=0.5.4';
import { initPersonaPanel, personaAvatarUrl } from './persona.js?v=0.5.4';
import { initCharacterPanel } from './character.js?v=0.5.4';
import { autoInstallTheme, syncThemePalette } from './theme.js?v=0.5.4';
import { HEADER_SLOTS, actionIcon, actionLabel, collectServers, faClass, runAction, slotAction, toggleMenu } from './actions.js?v=0.5.4';
import { user_avatar } from '../../../../personas.js';
import { deleteGroupChatByName, openGroupById } from '../../../../group-chats.js';
import { deleteCharacterChatByName } from '../../../../../script.js';

const body = document.body;

/* ── Servers: SillyTavern's top-bar drawers ─────────────────────────────── */

/* KNOWN_SERVERS and collectServers() live in actions.js, shared with the
   header-button settings. */

function toggleOf(drawerId) {
    return document.querySelector(`#${CSS.escape(drawerId)} > .drawer-toggle`);
}

function openPanelId() {
    const open = document.querySelector('#top-settings-holder .drawer-content.openDrawer');
    return open?.id || '';
}

function openServer(server) {
    if (openPanelId() === server.panel) return;
    window.setTimeout(() => toggleOf(server.drawer)?.click(), 0);
}

function closeServers() {
    const id = openPanelId();
    if (!id) return;
    const drawer = document.getElementById(id)?.closest('.drawer');
    if (drawer) window.setTimeout(() => toggleOf(drawer.id)?.click(), 0);
}

/* ── Small helpers ──────────────────────────────────────────────────────── */

function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
}

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Discord's short relative time: "41 мин.", "8 д.", "3 мес." */
function shortAgo(timestamp) {
    const ms = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    if (!Number.isFinite(ms)) return '';
    const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    if (min < 1) return 'сейчас';
    if (min < 60) return `${min} мин.`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч.`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} д.`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo} мес.`;
    return `${Math.floor(mo / 12)} г.`;
}

function plainSnippet(text) {
    return String(text ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[*_`~#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
}

/* ── Screens & navigation ───────────────────────────────────────────────── */

let historyPushed = false;

/* Heavy DOM work waits until the screen/panel animation is over. */
let slideTimer = 0;
function afterSlide(fn, ms = 380) {
    window.clearTimeout(slideTimer);
    slideTimer = window.setTimeout(fn, document.documentElement.dataset.dcMotion === 'off' ? 0 : ms);
}

function setScreen(screen, { fromHistory = false } = {}) {
    /* Desktop: list, panel and chat are all on screen at once, so "screen"
       is only bookkeeping — no slide, no history entry, and opening a chat
       leaves an open panel alone. */
    if (isDesk()) {
        if (screen === 'chat' && dcOption('desklist') === 'auto' && hasOpenChat()) setListShown(false);
        body.dataset.dcScreen = screen;
        dcWrite('screen', screen);
        return;
    }
    if (body.dataset.dcScreen === screen) return;
    body.dataset.dcScreen = screen;
    dcWrite('screen', screen);

    if (screen === 'chat') {
        closeServers();
        if (!fromHistory) {
            try {
                history.pushState({ dcScreen: 'chat' }, '');
                historyPushed = true;
            } catch { /* sandboxed history: back gesture just won't work */ }
        }
    } else {
        if (!fromHistory && historyPushed && history.state?.dcScreen === 'chat') {
            historyPushed = false;
            history.back();
        }
        /* Rebuilding the list mid-slide drops frames; do it once the home
           screen has settled. */
        afterSlide(refreshRecent);
        /* Leaving the chat should drop the mobile keyboard. */
        document.getElementById('send_textarea')?.blur();
    }
}

window.addEventListener('popstate', () => {
    if (ignorePop) {
        ignorePop = false;
        return;
    }
    if (panelHistory && body.dataset.dcPanel) {
        panelHistory = false;
        closeServers();
        return;
    }
    if (body.dataset.dcScreen === 'chat') {
        historyPushed = false;
        setScreen('home', { fromHistory: true });
    }
});

/* "Главная" (src/welcome.js) replaces ST's welcome screen, which is what
   the chat screen shows with no chat open — so it is the start page. */
function homePageOn() {
    return dcOption('welcome') !== 'classic';
}

/* The house button: close whatever chat is open (ST then draws its welcome
   screen, and CHAT_CHANGED brings the chat screen up), or just go there. */
function showHomePage() {
    if (!homePageOn()) {
        dcSetOption('welcome', 'discord');
    }
    if (hasOpenChat()) {
        window.setTimeout(() => document.getElementById('option_close_chat')?.click(), 0);
    } else {
        setScreen('chat');
    }
}

function hasOpenChat() {
    const ctx = getContext();
    if (!ctx) return false;
    return Boolean(ctx.groupId) || (ctx.characterId !== undefined && ctx.characterId !== null && ctx.characterId !== '');
}

/* ── Home: rail ─────────────────────────────────────────────────────────── */

let home = null;

function buildHome() {
    document.getElementById('dc-home')?.remove();
    home = el('div', '', `
        <nav class="dc-rail">
            <div class="dc-rail-scroll">
                <button type="button" class="dc-rail-item dc-rail-dm" data-dc-panel="" title="Сообщения">
                    <span class="dc-rail-pill"></span>
                    <span class="dc-rail-icon"><i class="fa-solid fa-message"></i></span>
                </button>
                <div class="dc-rail-sep"></div>
                <div class="dc-rail-servers"></div>
                <button type="button" class="dc-rail-item dc-rail-add" title="Создать персонажа">
                    <span class="dc-rail-pill"></span>
                    <span class="dc-rail-icon"><i class="fa-solid fa-plus"></i></span>
                </button>
            </div>
        </nav>
        <section class="dc-panel">
            <div class="dc-dm">
                <header class="dc-dm-head">
                    <div class="dc-dm-titlebar">
                        <h1>Сообщения</h1>
                        <button type="button" class="dc-round dc-dm-home" title="Главная"><i class="fa-solid fa-house"></i></button>
                    </div>
                    <div class="dc-dm-actions">
                        <button type="button" class="dc-round dc-dm-search" title="Поиск"><i class="fa-solid fa-magnifying-glass"></i></button>
                        <button type="button" class="dc-pillbtn dc-dm-chars"><i class="fa-solid fa-user-plus"></i><span>Персонажи</span></button>
                        <button type="button" class="dc-round dc-blurple dc-dm-new" title="Новый чат"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div class="dc-dm-searchbox">
                        <div class="dc-dm-searchbar">
                            <i class="fa-solid fa-magnifying-glass"></i>
                            <input type="search" placeholder="Поиск по чатам, заметкам, тегам" autocomplete="off">
                        </div>
                        <div class="dc-dm-filters"></div>
                    </div>
                </header>
                <div class="dc-dm-list"></div>
            </div>
            <header class="dc-server-head">
                <button type="button" class="dc-icon-btn dc-server-back" title="Назад"><i class="fa-solid fa-arrow-left"></i></button>
                <i class="dc-server-icon fa-solid"></i>
                <span class="dc-server-title"></span>
                <i class="fa-solid fa-chevron-right dc-server-chevron"></i>
            </header>
        </section>
        <footer class="dc-userbar">
            <div class="dc-userbar-avatar"><img alt=""><span class="dc-status"></span></div>
            <div class="dc-userbar-text">
                <div class="dc-userbar-name"><span class="dc-userbar-nick"></span><span class="dc-tag"></span><i class="fa-solid fa-chevron-down"></i></div>
                <div class="dc-userbar-sub"></div>
            </div>
            <button type="button" class="dc-userbar-bell" title="Персоны"><i class="fa-solid fa-bell"></i></button>
        </footer>`);
    home.id = 'dc-home';

    /* SillyTavern closes every unpinned drawer on any mousedown outside it.
       The rail and our headers sit outside every drawer, so without this the
       press that switches servers would first slam the current one shut and
       then race the toggle. We drive open/close ourselves instead. */
    for (const type of ['mousedown', 'touchstart']) {
        home.querySelector('.dc-rail').addEventListener(type, (e) => e.stopPropagation(), { passive: true });
        home.querySelector('.dc-server-head').addEventListener(type, (e) => e.stopPropagation(), { passive: true });
        home.querySelector('.dc-userbar').addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }

    home.append(el('div', 'dc-home-dim', ''));
    document.body.append(home);

    /* Desktop: the open panel's title bar, above the panel column. */
    document.getElementById('dc-deskhead')?.remove();
    const deskHead = el('header', '', `
        <i class="dc-server-icon fa-solid"></i>
        <span class="dc-server-title"></span>
        <span class="dc-chat-spacer"></span>
        <button type="button" class="dc-icon-btn dc-deskhead-close" title="Закрыть"><i class="fa-solid fa-xmark"></i></button>`);
    deskHead.id = 'dc-deskhead';
    deskHead.querySelector('.dc-deskhead-close').addEventListener('click', () => closeServers());
    document.body.append(deskHead);
    renderRail();
    wireHome();
    updateUserbar();
}

function renderRail() {
    const box = home?.querySelector('.dc-rail-servers');
    if (!box) return;
    box.innerHTML = '';
    for (const server of collectServers()) {
        const btn = el('button', 'dc-rail-item', `
            <span class="dc-rail-pill"></span>
            <span class="dc-rail-icon"><i class="${faClass(server.icon)}"></i></span>`);
        btn.type = 'button';
        btn.title = server.title;
        btn.dataset.dcPanel = server.panel;
        btn.addEventListener('click', () => {
            /* Desktop: the server icon toggles its panel beside the chat. */
            if (isDesk()) {
                if (openPanelId() === server.panel) closeServers();
                else openServer(server);
                return;
            }
            setScreen('home');
            openServer(server);
        });
        box.append(btn);
    }
    syncPanelState();
}

function wireHome() {
    home.querySelector('.dc-rail-dm').addEventListener('click', () => {
        /* An explicit tap on Messages means the list, not back to the chat. */
        panelFromChat = false;
        /* Desktop: with no panel open, the Messages icon folds the chat
           list away and back, like the other icons do with their panels. */
        if (isDesk()) {
            if (openPanelId()) setListShown(true);
            else toggleList();
        }
        closeServers();
    });
    home.querySelector('.dc-server-back').addEventListener('click', () => closeServers());

    home.querySelector('.dc-rail-add').addEventListener('click', () => {
        openServer({ drawer: 'rightNavHolder', panel: 'right-nav-panel' });
        window.setTimeout(() => document.getElementById('rm_button_create')?.click(), 60);
    });

    home.querySelector('.dc-dm-chars').addEventListener('click', () => {
        openServer({ drawer: 'rightNavHolder', panel: 'right-nav-panel' });
        window.setTimeout(() => document.getElementById('rm_button_characters')?.click(), 60);
    });

    /* "+" = new chat with whoever is open; without one it lists characters. */
    home.querySelector('.dc-dm-new').addEventListener('click', () => {
        if (!hasOpenChat()) {
            home.querySelector('.dc-dm-chars').click();
            return;
        }
        setScreen('chat');
        window.setTimeout(() => document.getElementById('option_start_new_chat')?.click(), 0);
    });

    home.querySelector('.dc-dm-home').addEventListener('click', () => showHomePage());

    const searchBtn = home.querySelector('.dc-dm-search');
    const searchInput = home.querySelector('.dc-dm-searchbar input');
    searchBtn.addEventListener('click', () => {
        const open = home.classList.toggle('dc-searching');
        searchBtn.classList.toggle('active', open);
        if (open) {
            searchInput.focus();
        } else {
            searchInput.value = '';
            applyRecentFilter();
        }
    });
    searchInput.addEventListener('input', () => applyRecentFilter());

    wireRecentList(home.querySelector('.dc-dm-list'));

    const openPersonas = () => openServer({ drawer: 'persona-management-button', panel: 'PersonaManagement' });
    home.querySelector('.dc-userbar-avatar').addEventListener('click', openPersonas);
    home.querySelector('.dc-userbar-text').addEventListener('click', openPersonas);
    /* The bell runs whatever the user bound to it (Personas by default). */
    home.querySelector('.dc-userbar-bell').addEventListener('click', () => runAction(slotAction('bell')));

    wireSwipe(home.querySelector('.dc-dm'), 'left');
}

/* Reflect whichever drawer SillyTavern has open — whoever opened it. */
let panelSettleTimer = 0;
let panelHistory = false;
/* The panel was opened from inside a chat (a header button, the avatar…):
   closing it should land back in that chat, not on the chat list. */
let panelFromChat = false;
let ignorePop = false;

function syncPanelState() {
    const panel = openPanelId();

    /* Switching servers closes the old drawer, waits ST's animation delay,
       then opens the new one. Don't flash the DM list in that gap. */
    window.clearTimeout(panelSettleTimer);
    if (!panel && body.dataset.dcPanel) {
        panelSettleTimer = window.setTimeout(() => {
            if (!openPanelId()) applyPanelState('');
        }, 220);
        return;
    }
    applyPanelState(panel);
}

function applyPanelState(panel) {
    const was = body.dataset.dcPanel || '';
    body.dataset.dcPanel = panel;
    /* Slider fills keep their last value; refresh them after the panel
       has slid in rather than in the same frame. */
    if (panel && panel !== was) window.setTimeout(() => paintRanges(), 320);

    /* Desktop panels open beside the chat: no screen change, no history. */
    if (isDesk()) panelFromChat = false;
    else panelNavigation(panel, was);

    if (!home) return;

    for (const item of home.querySelectorAll('.dc-rail-item[data-dc-panel]')) {
        item.classList.toggle('active', item.dataset.dcPanel === panel);
    }

    /* Both titles: the phone's (in the list column) and the desktop one. */
    const server = collectServers().find((s) => s.panel === panel);
    for (const icon of document.querySelectorAll('#dc-home .dc-server-icon, #dc-deskhead .dc-server-icon')) {
        icon.className = `dc-server-icon ${faClass(server?.icon)}`;
    }
    for (const title of document.querySelectorAll('#dc-home .dc-server-title, #dc-deskhead .dc-server-title')) {
        title.textContent = server?.title || '';
    }
}

/* Phone: panels live on the home screen and are history entries. */
function panelNavigation(panel, was) {
    /* A drawer opened from the chat (header avatar, a message avatar…) has
       to be shown, and drawers only live on the home screen. The chat's
       history entry is reused for the panel rather than popped: a back()
       followed by a push would pop the push. */
    let reuseEntry = false;
    if (panel && body.dataset.dcScreen === 'chat') {
        panelFromChat = true;
        reuseEntry = historyPushed && history.state?.dcScreen === 'chat';
        historyPushed = false;
        setScreen('home', { fromHistory: true });
    }

    /* An open panel is a history entry, so the phone's Back closes it. */
    if (panel && !was) {
        try {
            if (reuseEntry) history.replaceState({ dcPanel: true }, '');
            else history.pushState({ dcPanel: true }, '');
            panelHistory = true;
        } catch { /* no history in this host */ }
    } else if (!panel && was && panelFromChat && hasOpenChat()) {
        panelFromChat = false;
        if (panelHistory && history.state?.dcPanel) {
            /* Closed from the UI: the panel's entry becomes the chat's again. */
            history.replaceState({ dcScreen: 'chat' }, '');
            historyPushed = true;
            panelHistory = false;
            setScreen('chat', { fromHistory: true });
        } else {
            /* Closed by the phone's Back: that entry is gone, push a new one. */
            panelHistory = false;
            setScreen('chat');
        }
    } else if (!panel && was && panelHistory) {
        panelHistory = false;
        if (history.state?.dcPanel) {
            ignorePop = true;
            history.back();
        }
    }
    if (!panel) panelFromChat = false;
}

/* A drawer's first frame after display:none is a full layout of a big
 * subtree. Animating during that frame eats the start of the slide, so the
 * drawer is laid out invisible first and .dc-shown (which starts the
 * slide/fade in drawers.css) goes on two frames later. Closing just drops
 * the class: the exit fade runs while ST's display:none is held back by
 * transition-behavior: allow-discrete. */
function revealDrawers(holder) {
    for (const content of holder.querySelectorAll('.drawer-content')) {
        const open = content.classList.contains('openDrawer');
        if (!open) {
            /* Guarded: classList.remove() rewrites the attribute even when the
               class is absent, which would re-trigger the observer forever. */
            if (content.classList.contains('dc-shown')) content.classList.remove('dc-shown');
            continue;
        }
        if (content.classList.contains('dc-shown') || content.dataset.dcRevealing) continue;
        content.dataset.dcRevealing = '1';
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            delete content.dataset.dcRevealing;
            if (content.classList.contains('openDrawer')) content.classList.add('dc-shown');
        }));
    }
}

function observeDrawers() {
    const holder = document.getElementById('top-settings-holder');
    if (!holder) return;
    revealDrawers(holder);
    const observer = new MutationObserver(() => {
        revealDrawers(holder);
        syncPanelState();
    });
    for (const content of holder.querySelectorAll('.drawer-content')) {
        observer.observe(content, { attributes: true, attributeFilter: ['class'] });
    }
    /* Extensions that add top-bar drawers late. */
    new MutationObserver(() => {
        renderRail();
        for (const content of holder.querySelectorAll('.drawer-content')) {
            observer.observe(content, { attributes: true, attributeFilter: ['class'] });
        }
    }).observe(holder, { childList: true });
}

/* Pinned side panels stay open regardless of clicks and would sit on top of
   the DM list forever. A phone has no room for pinning anyway. */
function unpinPanels() {
    for (const id of ['lm_button_panel_pin', 'rm_button_panel_pin', 'WI_panel_pin']) {
        const box = document.getElementById(id);
        if (box instanceof HTMLInputElement && box.checked) {
            box.checked = false;
            box.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

/* ── Home: user bar ─────────────────────────────────────────────────────── */

function updateUserbar() {
    const ctx = getContext();
    if (!home || !ctx) return;
    const img = home.querySelector('.dc-userbar-avatar img');
    if (user_avatar) {
        /* Same URL as the persona card, so a fresh picture shows up here too. */
        const url = personaAvatarUrl();
        if (img.getAttribute('src') !== url) img.src = url;
    }
    home.querySelector('.dc-userbar-nick').textContent = ctx.name1 || 'User';

    const online = ctx.onlineStatus && ctx.onlineStatus !== 'no_connection';
    home.querySelector('.dc-userbar .dc-status').classList.toggle('dc-online', Boolean(online));
    /* Tag chip = the backend (like a server tag), status line = the model. */
    const isChat = ctx.mainApi === 'openai';
    const source = isChat ? ctx.chatCompletionSettings?.chat_completion_source : ctx.mainApi;
    home.querySelector('.dc-tag').textContent = String(source || '').toUpperCase().slice(0, 10);
    let model = '';
    try {
        model = isChat ? ctx.getChatCompletionModel?.() : '';
    } catch { /* some sources throw without a key */ }
    home.querySelector('.dc-userbar-sub').textContent = online ? String(model || ctx.onlineStatus) : 'Не подключено';
}

/* ── Home: recent chats ─────────────────────────────────────────────────── */

/* Two data sources:
 *
 *   Start Page on  → its own modules do the fetching, filtering and sorting,
 *                    and its settings hold the state (character filter, tag
 *                    filter, sort, "notes always open"…). Same module
 *                    instances Start Page itself uses, so both views always
 *                    agree and nothing is stored twice.
 *   Start Page off → plain /api/chats/recent with SillyTavern's pins.
 *
 * Either way rows are normalised into one shape before rendering. */

function chatKey(chat) {
    const group = chat.group ? `group_${chat.group}` : '';
    const avatar = chat.avatar ? `char_${chat.avatar}` : '';
    return `${group}${avatar}_${chat.file_name}`;
}

function readPins(ctx) {
    try {
        return JSON.parse(ctx.accountStorage?.getItem('pinnedChats') || '{}') || {};
    } catch {
        return {};
    }
}

function writePins(ctx, pins) {
    ctx.accountStorage?.setItem('pinnedChats', JSON.stringify(pins));
}

function startpageOn(ctx) {
    if (dcOption('startpage') !== 'on') return false;
    const disabled = ctx.extensionSettings?.disabledExtensions || [];
    if (disabled.includes('third-party/startpage')) return false;
    const sp = ctx.extensionSettings?.startpage;
    return Boolean(sp) && sp.enabled !== false;
}

let spPromise = null;
/** Start Page's modules, or null when it isn't installed/enabled. */
async function startpage(ctx) {
    if (!startpageOn(ctx)) return null;
    spPromise ||= Promise.all([
        import('../../startpage/chats.js'),
        import('../../startpage/settings.js'),
        import('../../startpage/store.js'),
    ]).then(([chats, settings, store]) => ({ chats, settings, store })).catch((error) => {
        console.warn('[Discord Mobile] Start Page modules unavailable', error);
        return null;
    });
    const sp = await spPromise;
    /* `settings` is a live binding Start Page reassigns on load — always
       read it through the namespace, never destructure it. */
    return sp?.settings?.settings ? sp : null;
}

/* Same colour rule as Start Page, so a tag looks the same in both places. */
const TAG_PALETTE = ['#8e7cc3', '#6aa84f', '#3d85c6', '#c27ba0', '#e69138', '#45818e', '#a64d79', '#674ea7'];
function tagColor(ctx, tag) {
    const custom = ctx.extensionSettings?.startpage?.tagColors?.[tag];
    if (typeof custom === 'string' && custom) return custom;
    let hash = 0;
    for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
    return TAG_PALETTE[hash % TAG_PALETTE.length];
}

let recentToken = 0;
let appReady = false;
/** Fetched chats before filtering, so filter changes don't refetch. */
let rawChats = [];
let rawSource = '';
/** key -> normalised row, for the row sheet */
const recentByKey = new Map();
/** Quick filters that are ours alone (Start Page has no equivalent). */
let listFilter = { kind: 'all' };

function normalise(ctx, chat, pins) {
    const character = chat.avatar ? ctx.characters.find((c) => c.avatar === chat.avatar) : null;
    const group = chat.group ? ctx.groups.find((g) => g.id === chat.group) : null;
    if (!character && !group) return null;
    const key = chatKey(chat);
    return {
        key,
        chat,
        character,
        group,
        file: String(chat.file_name || '').replace(/\.jsonl$/, ''),
        name: character?.name || group?.name || '',
        pinned: typeof chat.pinned === 'boolean' ? chat.pinned : key in pins,
        tags: Array.isArray(chat.tags) ? chat.tags : [],
        note: typeof chat.note === 'string' ? chat.note : '',
    };
}

async function fetchChats(ctx) {
    const sp = await startpage(ctx);
    if (sp) {
        const s = sp.settings.settings;
        const max = Math.max(sp.settings.getCoreCounts?.().maxDisplayed || 0, 50);
        rawSource = s.filterEntity || '';
        return s.filterEntity
            ? await sp.chats.fetchEntityChats(s.filterEntity)
            : await sp.chats.fetchRecentChats(max);
    }
    rawSource = '';
    const response = await fetch('/api/chats/recent', {
        method: 'POST',
        headers: ctx.getRequestHeaders(),
        body: JSON.stringify({ max: 60, pinned: Object.values(readPins(ctx)) }),
        cache: 'no-cache',
    });
    return response.ok ? await response.json() : [];
}

async function refreshRecent() {
    const ctx = getContext();
    const list = home?.querySelector('.dc-dm-list');
    if (!ctx || !list) return;
    const token = ++recentToken;

    /* Before SillyTavern has loaded its characters every chat would be
       filtered out; draw placeholders instead of a false "empty". */
    if (!ctx.characters?.length && !appReady) {
        if (!list.querySelector('.dc-skel')) list.innerHTML = '<div class="dc-skel"></div>'.repeat(7);
        return;
    }

    let data = [];
    try {
        data = await fetchChats(ctx);
    } catch (error) {
        console.warn('[Discord Mobile] chat list failed', error);
    }
    if (token !== recentToken) return;
    rawChats = Array.isArray(data) ? data : [];
    await renderRecent();
}

/* Filter + sort + draw, from the cached fetch. */
async function renderRecent() {
    const ctx = getContext();
    const list = home?.querySelector('.dc-dm-list');
    if (!ctx || !list) return;
    const sp = await startpage(ctx);
    const s = sp?.settings.settings;
    const pins = readPins(ctx);

    let chats = rawChats;
    if (sp) {
        chats = sp.chats.filterChats(chats, { search: '', tagFilter: s.tagFilter ?? [], untaggedOnly: !!s.untaggedOnly });
        chats = sp.chats.sortChats(chats, s.sort);
    }
    let rows = chats.map((c) => normalise(ctx, c, pins)).filter(Boolean);
    if (!sp) rows.sort((a, b) => (b.pinned - a.pinned) || (Number(b.chat.last_mes) - Number(a.chat.last_mes)));

    recentByKey.clear();
    for (const row of rows) recentByKey.set(row.key, row);
    renderFilters(ctx, sp);

    refreshWelcome();

    if (!rows.length) {
        const filtered = s && (s.filterEntity || s.tagFilter?.length || s.untaggedOnly);
        list.innerHTML = filtered
            ? '<div class="dc-empty"><i class="fa-solid fa-filter-circle-xmark"></i><div>Под фильтр ничего не попало.</div></div>'
            : '<div class="dc-empty"><i class="fa-solid fa-ghost"></i><div>Тут пока пусто.<br>Выбери персонажа и начни болтать.</div></div>';
        return;
    }

    const showPreview = s ? s.showPreview !== false : true;
    const showTags = s ? s.showTags !== false : true;
    const showNotes = s ? s.showNotes !== false : true;
    const notesOpen = Boolean(s?.notesExpanded);
    const currentFile = ctx.getCurrentChatId?.();

    list.innerHTML = rows.map((row) => {
        const { chat, character, group, name, pinned, tags, note } = row;
        const isActive = row.file === currentFile;
        let avatar;
        if (group) {
            const members = (group.members || []).slice(0, 2).map((m) => ctx.getThumbnailUrl('avatar', m));
            avatar = group.avatar_url
                ? `<img src="${escapeHtml(group.avatar_url)}" alt="">`
                : `<span class="dc-av-group">${members.map((src) => `<img src="${escapeHtml(src)}" alt="">`).join('')}</span>`;
        } else {
            avatar = `<img src="${escapeHtml(ctx.getThumbnailUrl('avatar', character.avatar))}" alt="">`;
        }
        const tagHtml = showTags && tags.length
            ? `<span class="dc-dm-tags">${tags.map((t) => `<span class="dc-dm-tag" data-tag="${escapeHtml(t)}" style="--dc-tag:${escapeHtml(tagColor(ctx, t))}">${escapeHtml(t)}</span>`).join('')}</span>`
            : '';
        const hasNote = showNotes && note;
        /* With a character filter every row is the same character, so the
           chat's own name is the useful title. */
        const title = rawSource ? row.file : name;
        const search = `${name} ${row.file} ${plainSnippet(chat.mes)} ${tags.join(' ')} ${note}`.toLowerCase();
        return `
            <div class="dc-dm-item${isActive ? ' active' : ''}${hasNote && notesOpen ? ' note-open' : ''}" data-key="${escapeHtml(row.key)}"
                data-pinned="${pinned ? 1 : 0}" data-note="${hasNote ? 1 : 0}" data-search="${escapeHtml(search)}">
                <button type="button" class="dc-dm-row">
                    <span class="dc-dm-avatar">${avatar}<span class="dc-status${isActive ? ' dc-online' : ''}"></span></span>
                    <span class="dc-dm-text">
                        <span class="dc-dm-top">
                            <span class="dc-dm-name">${escapeHtml(title)}</span>
                            ${pinned ? '<i class="fa-solid fa-thumbtack dc-dm-pin"></i>' : ''}
                            <span class="dc-dm-time">${shortAgo(chat.last_mes)}</span>
                        </span>
                        ${showPreview ? `<span class="dc-dm-sub">${escapeHtml(plainSnippet(chat.mes))}</span>` : ''}
                        ${tagHtml}
                    </span>
                </button>
                ${hasNote ? `<button type="button" class="dc-dm-note-btn" title="Заметка"><i class="fa-solid fa-note-sticky"></i></button>
                <div class="dc-dm-note">${escapeHtml(note)}</div>` : ''}
            </div>`;
    }).join('');

    applyRecentFilter();
}

/* The filter strip. Start Page's filters (character, tags, untagged) live in
   its settings; "pinned" and "with notes" are ours. The strip stays visible
   while any filter is active, so a filtered list never looks like a bug. */
function renderFilters(ctx, sp) {
    const box = home?.querySelector('.dc-dm-filters');
    if (!box) return;
    const s = sp?.settings.settings;

    const chip = (attrs, label, { icon = '', active = false, color = '' } = {}) => `
        <button type="button" class="dc-chip${active ? ' active' : ''}" ${attrs}
            ${color ? `style="--dc-tag:${escapeHtml(color)}"` : ''}>${icon ? `<i class="${icon}"></i>` : ''}<span>${escapeHtml(label)}</span></button>`;

    const parts = [];
    if (s) parts.push(`<button type="button" class="dc-chip dc-chip-icon" data-act="view" title="Вид списка"><i class="fa-solid fa-sliders"></i></button>`);
    if (s) {
        let entityLabel = 'Персонаж';
        if (s.filterEntity) {
            const [kind, ...rest] = String(s.filterEntity).split(':');
            const id = rest.join(':');
            entityLabel = kind === 'group'
                ? (ctx.groups.find((g) => g.id === id)?.name || 'Группа')
                : (ctx.characters.find((c) => c.avatar === id)?.name || 'Персонаж');
        }
        parts.push(chip('data-act="entity"', entityLabel, {
            icon: s.filterEntity ? 'fa-solid fa-xmark' : 'fa-solid fa-user',
            active: Boolean(s.filterEntity),
        }));
    }
    parts.push(chip('data-act="pinned"', 'Закреплённые', { icon: 'fa-solid fa-thumbtack', active: listFilter.kind === 'pinned' }));
    if (s) {
        parts.push(chip('data-act="notes"', 'С заметками', { icon: 'fa-solid fa-note-sticky', active: listFilter.kind === 'notes' }));
        parts.push(chip('data-act="untagged"', 'Без тегов', { icon: 'fa-solid fa-tag', active: Boolean(s.untaggedOnly) }));
        const allTags = sp.store.getAllTags?.() || [];
        for (const tag of allTags) {
            parts.push(chip(`data-act="tag" data-tag="${escapeHtml(tag)}"`, tag, {
                active: (s.tagFilter ?? []).includes(tag),
                color: tagColor(ctx, tag),
            }));
        }
    }
    box.innerHTML = parts.join('');

    const anyActive = listFilter.kind !== 'all' || Boolean(s && (s.filterEntity || s.untaggedOnly || s.tagFilter?.length));
    home.classList.toggle('dc-filtered', anyActive);
}

function applyRecentFilter() {
    if (!home) return;
    const q = (home.querySelector('.dc-dm-searchbar input')?.value || '').trim().toLowerCase();
    for (const item of home.querySelectorAll('.dc-dm-item')) {
        let ok = !q || item.dataset.search.includes(q);
        if (ok && listFilter.kind === 'pinned') ok = item.dataset.pinned === '1';
        if (ok && listFilter.kind === 'notes') ok = item.dataset.note === '1';
        item.hidden = !ok;
    }
}

async function onFilterChip(chip) {
    const ctx = getContext();
    const sp = await startpage(ctx);
    const s = sp?.settings.settings;
    const save = () => sp?.settings.saveSettings?.();

    switch (chip.dataset.act) {
        case 'pinned':
        case 'notes':
            listFilter = { kind: listFilter.kind === chip.dataset.act ? 'all' : chip.dataset.act };
            return renderRecent();
        case 'untagged':
            s.untaggedOnly = !s.untaggedOnly;
            if (s.untaggedOnly) s.tagFilter = [];
            save();
            return renderRecent();
        case 'tag': {
            const tag = chip.dataset.tag;
            const active = new Set(s.tagFilter ?? []);
            if (active.has(tag)) active.delete(tag);
            else active.add(tag);
            s.tagFilter = [...active];
            s.untaggedOnly = false;
            save();
            return renderRecent();
        }
        case 'entity':
            if (s.filterEntity) {
                s.filterEntity = '';
                save();
                return refreshRecent();
            }
            return openEntitySheet(ctx, sp);
        case 'view':
            return openViewSheet(sp);
    }
}

/* Character / group picker for Start Page's "all chats of one character". */
function openEntitySheet(ctx, sp) {
    const s = sp.settings.settings;
    const pick = (value) => () => {
        s.filterEntity = value;
        sp.settings.saveSettings?.();
        refreshRecent();
    };
    const chars = [...ctx.characters]
        .filter((c) => c?.avatar)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((c) => ({
            img: ctx.getThumbnailUrl('avatar', c.avatar),
            label: c.name,
            run: pick(`char:${c.avatar}`),
        }));
    const groups = [...ctx.groups]
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((g) => ({
            icon: 'fa-solid fa-user-group',
            label: g.name,
            run: pick(`group:${g.id}`),
        }));
    openSheet({
        head: { title: 'Чаты персонажа', sub: 'Все чаты выбранного, а не только недавние' },
        groups: [['Персонажи', ...chars], ['Группы', ...groups]],
    });
}

/* Start Page's display options, as a sheet. */
function openViewSheet(sp) {
    const s = sp.settings.settings;
    const save = () => {
        sp.settings.saveSettings?.();
        renderRecent();
    };
    const SORTS = { date: 'По дате', name: 'По имени', messages: 'По числу сообщений', character: 'По персонажу' };
    const sorts = Object.entries(SORTS).map(([value, label]) => ({
        icon: 'fa-solid fa-arrow-down-wide-short',
        label,
        checked: (s.sort || 'date') === value,
        run: () => {
            s.sort = value;
            save();
        },
    }));
    const toggle = (key, label, icon) => ({
        icon,
        label,
        checked: key === 'notesExpanded' ? Boolean(s[key]) : s[key] !== false,
        keepOpen: true,
        run: () => {
            s[key] = key === 'notesExpanded' ? !s[key] : s[key] === false;
            save();
        },
    });
    openSheet({
        head: { title: 'Вид списка', sub: 'Общие настройки со Start Page' },
        groups: [
            ['Сортировка', ...sorts],
            ['Показывать',
                toggle('notesExpanded', 'Заметки всегда раскрыты', 'fa-solid fa-note-sticky'),
                toggle('showNotes', 'Заметки', 'fa-regular fa-note-sticky'),
                toggle('showTags', 'Теги', 'fa-solid fa-tags'),
                toggle('showPreview', 'Последнее сообщение', 'fa-solid fa-comment-dots'),
            ],
        ],
    });
}

function wireRecentList(list) {
    home.querySelector('.dc-dm-filters').addEventListener('click', (event) => {
        const chip = event.target.closest('.dc-chip');
        if (chip) onFilterChip(chip);
    });

    let suppressClick = false;
    list.addEventListener('click', async (event) => {
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        const item = event.target.closest('.dc-dm-item');
        if (!item) return;
        if (event.target.closest('.dc-dm-note-btn')) {
            item.classList.toggle('note-open');
            return;
        }
        const tag = event.target.closest('.dc-dm-tag');
        if (tag) {
            const sp = await startpage(getContext());
            if (sp) {
                const s = sp.settings.settings;
                if (!(s.tagFilter ?? []).includes(tag.dataset.tag)) s.tagFilter = [...(s.tagFilter ?? []), tag.dataset.tag];
                s.untaggedOnly = false;
                sp.settings.saveSettings?.();
                renderRecent();
            }
            return;
        }
        const row = recentByKey.get(item.dataset.key);
        if (row) openRecent(row);
    });

    /* Long-press (or right-click) a chat: pin, notes, open. */
    onLongPress(list, '.dc-dm-item', (item) => {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 600);
        openChatSheet(item);
    });
}

function onLongPress(container, selector, fire) {
    let timer = 0;
    let startX = 0;
    let startY = 0;
    let target = null;
    const cancel = () => {
        window.clearTimeout(timer);
        target?.classList.remove('dc-holding');
        target = null;
    };
    container.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const node = e.target.closest(selector);
        if (!node) return;
        target = node;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        node.classList.add('dc-holding');
        timer = window.setTimeout(() => {
            const hit = target;
            cancel();
            if (!hit) return;
            navigator.vibrate?.(12);
            fire(hit);
        }, 450);
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
        if (!target) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) cancel();
    }, { passive: true });
    container.addEventListener('touchend', cancel, { passive: true });
    container.addEventListener('touchcancel', cancel, { passive: true });
    container.addEventListener('contextmenu', (e) => {
        const node = e.target.closest(selector);
        if (!node) return;
        e.preventDefault();
        fire(node);
    });
}

async function openChatSheet(item) {
    const ctx = getContext();
    const row = recentByKey.get(item.dataset.key);
    if (!ctx || !row) return;
    const { chat, name } = row;
    const sp = await startpage(ctx);

    item.classList.add('dc-pressed');
    const primary = [
        { icon: 'fa-solid fa-comment', label: 'Открыть чат', run: () => openRecent(row) },
        {
            icon: 'fa-solid fa-thumbtack',
            label: row.pinned ? 'Открепить' : 'Закрепить',
            run: () => {
                if (sp?.store.togglePin) {
                    sp.store.togglePin(chat, !row.pinned);
                } else {
                    const pins = readPins(ctx);
                    if (row.pinned) delete pins[row.key];
                    else pins[row.key] = { group: chat.group, avatar: chat.avatar, file_name: chat.file_name };
                    writePins(ctx, pins);
                }
                refreshRecent();
            },
        },
    ];
    if (sp) {
        primary.push({
            icon: 'fa-solid fa-note-sticky',
            label: row.note || row.tags.length ? 'Заметка и теги' : 'Добавить заметку или тег',
            run: async () => {
                try {
                    /* Start Page's own editor, so notes stay in one place. */
                    const { openMetaPopup } = await import('../../startpage/popups.js');
                    const saved = await openMetaPopup({ ...chat, char_name: name, chat_name: row.file });
                    if (saved) refreshRecent();
                } catch (error) {
                    console.error('[Discord Mobile] Start Page editor failed', error);
                    window.toastr?.error('Не удалось открыть редактор Start Page');
                }
            },
        });
        if (!sp.settings.settings.filterEntity) {
            const entity = chat.group ? `group:${chat.group}` : `char:${chat.avatar}`;
            primary.push({
                icon: 'fa-solid fa-user',
                label: 'Все чаты с этим персонажем',
                run: () => {
                    sp.settings.settings.filterEntity = entity;
                    sp.settings.saveSettings?.();
                    refreshRecent();
                },
            });
        }
    }

    const danger = [{
        icon: 'fa-solid fa-trash-can',
        label: 'Удалить чат',
        danger: true,
        run: () => deleteRecent(row),
    }];

    openSheet({
        head: {
            img: item.querySelector('.dc-dm-avatar img')?.getAttribute('src') || '',
            title: name,
            sub: row.file,
        },
        groups: [primary, danger],
        onClose: () => item.classList.remove('dc-pressed'),
    });
}

/* Delete a chat file from the list, after asking. ST's delete helpers don't
   touch the chat on screen, so deleting the open one closes it first —
   otherwise the next autosave would write the deleted file back. */
async function deleteRecent(row) {
    const ctx = getContext();
    if (!ctx) return;
    const ok = await ctx.callGenericPopup(
        `<h3>Удалить чат?</h3><p>«${escapeHtml(row.file)}» с ${escapeHtml(row.name)} удалится насовсем.</p>`,
        ctx.POPUP_TYPE.CONFIRM,
        '',
        { okButton: 'Удалить', cancelButton: 'Отмена' },
    );
    if (!ok) return;
    try {
        if (ctx.getCurrentChatId?.() === row.file) {
            document.getElementById('option_close_chat')?.click();
            for (let i = 0; i < 30 && getContext().getCurrentChatId?.() === row.file; i++) {
                await new Promise((r) => window.setTimeout(r, 100));
            }
        }
        if (row.group) {
            await deleteGroupChatByName(row.group.id, row.file);
        } else {
            const id = ctx.characters.findIndex((c) => c.avatar === row.chat.avatar);
            if (id < 0) throw new Error('character not found');
            await deleteCharacterChatByName(String(id), row.file);
        }
        window.toastr?.success('Чат удалён');
    } catch (error) {
        console.error('[Discord Mobile] failed to delete chat', error);
        window.toastr?.error('Не получилось удалить чат');
    }
    refreshRecent();
}

async function openRecent(row) {
    const ctx = getContext();
    const { avatar, group } = row.chat;
    const file = row.file;
    if (!ctx || !file) return;

    /* Re-opening the chat that is already loaded is just navigation. */
    if (ctx.getCurrentChatId?.() === file) {
        setScreen('chat');
        return;
    }

    body.classList.add('dc-loading-chat');
    try {
        if (group) {
            await openGroupById(group);
            if (getContext().getCurrentChatId?.() !== file) await ctx.openGroupChat(group, file);
        } else {
            const id = ctx.characters.findIndex((c) => c.avatar === avatar);
            if (id < 0) return;
            await ctx.selectCharacterById(id);
            if (getContext().getCurrentChatId?.() !== file) await ctx.openCharacterChat(file);
        }
        setScreen('chat');
    } catch (error) {
        console.error('[Discord Mobile] failed to open chat', error);
        window.toastr?.error('Не удалось открыть чат');
    } finally {
        body.classList.remove('dc-loading-chat');
    }
}

/* ── Chat screen: header ────────────────────────────────────────────────── */

function ensureChatHeader() {
    const sheld = document.getElementById('sheld');
    const chat = document.getElementById('chat');
    if (!sheld || !chat) return null;

    let header = sheld.querySelector(':scope > .dc-chat-header');
    if (header) return header;

    header = el('header', 'dc-chat-header', `
        <button type="button" class="dc-icon-btn dc-back" title="Назад"><i class="fa-solid fa-arrow-left"></i></button>
        <button type="button" class="dc-icon-btn dc-list-toggle" title="Список чатов"><i class="fa-solid fa-table-columns"></i></button>
        <button type="button" class="dc-chat-peer">
            <span class="dc-chat-avatar"><img alt=""><span class="dc-status dc-online"></span></span>
            <span class="dc-chat-name"></span>
            <i class="fa-solid fa-chevron-right dc-chat-chevron"></i>
        </button>
        <span class="dc-chat-spacer"></span>
        ${Object.keys(HEADER_SLOTS).map((slot) => `<button type="button" class="dc-icon-btn dc-chat-slot" data-slot="${slot}"><i></i></button>`).join('')}`);
    sheld.insertBefore(header, chat);

    header.querySelector('.dc-back').addEventListener('click', () => setScreen('home'));
    header.querySelector('.dc-list-toggle').addEventListener('click', () => toggleList());

    header.querySelector('.dc-chat-peer').addEventListener('click', () => {
        if (!hasOpenChat()) return;
        openServer({ drawer: 'rightNavHolder', panel: 'right-nav-panel' });
        window.setTimeout(() => document.getElementById('rm_button_selected_ch')?.click(), 60);
    });

    /* Call / video / search: whatever the user bound in the settings. */
    for (const btn of header.querySelectorAll('.dc-chat-slot')) {
        btn.addEventListener('click', () => runAction(slotAction(btn.dataset.slot)));
    }
    updateHeaderSlots(header);

    return header;
}

/* Icons follow the bound action, so a button reads as what it does. Called
   again whenever the chat header refreshes: wand items from other extensions
   appear late, and their icons are only known once they exist. */
function updateHeaderSlots(header = document.querySelector('#sheld > .dc-chat-header')) {
    if (!header) return;
    for (const btn of header.querySelectorAll('.dc-chat-slot')) {
        const slot = btn.dataset.slot;
        const key = slotAction(slot);
        btn.hidden = key === 'none';
        btn.title = actionLabel(key) || HEADER_SLOTS[slot].label;
        btn.querySelector('i').className = actionIcon(key, slot);
    }
}

function updateChatHeader() {
    const header = ensureChatHeader();
    const ctx = getContext();
    if (!header || !ctx) return;
    updateHeaderSlots(header);

    let name = '';
    let avatarUrl = '';
    if (ctx.groupId) {
        const group = ctx.groups.find((g) => String(g.id) === String(ctx.groupId));
        name = group?.name || 'Группа';
        const first = group?.members?.[0];
        avatarUrl = group?.avatar_url || (first ? ctx.getThumbnailUrl('avatar', first) : '');
    } else if (ctx.characterId !== undefined && ctx.characters[ctx.characterId]) {
        const character = ctx.characters[ctx.characterId];
        name = character.name;
        avatarUrl = ctx.getThumbnailUrl('avatar', character.avatar);
    } else if (welcomeShown()) {
        /* No chat open: our home page is on screen (src/welcome.js). */
        name = 'Главная';
    } else {
        name = ctx.name2 || 'SillyTavern';
        avatarUrl = 'img/five.png';
    }

    header.classList.toggle('dc-peer-home', name === 'Главная' && !hasOpenChat());
    header.querySelector('.dc-chat-name').textContent = name;
    const img = header.querySelector('.dc-chat-avatar img');
    if (avatarUrl && img.getAttribute('src') !== avatarUrl) img.src = avatarUrl;

    /* Discord's placeholder: "Написать @name". On the home page whatever
       is typed goes to ST's welcome assistant. */
    const textarea = document.getElementById('send_textarea');
    const target = hasOpenChat() ? name : (name === 'Главная' ? 'ассистенту' : '');
    if (textarea && target) {
        const text = hasOpenChat() ? `Написать @${target}` : 'Написать ассистенту';
        textarea.setAttribute('connected_text', text);
        if (!document.getElementById('send_form')?.classList.contains('no-connection')) {
            textarea.placeholder = text;
        }
    }
}

/* ── Composer ───────────────────────────────────────────────────────────── */

/* The composer is SillyTavern's own #send_form, rearranged purely in CSS.
   The only DOM work: the wand button is created by the extensions module at
   some point after load, so we tag the composer once it's there. */
function prepareComposer() {
    const form = document.getElementById('send_form');
    if (!form) return;
    form.classList.add('dc-composer');
    const wand = document.getElementById('extensionsMenuButton');
    if (wand && !wand.classList.contains('dc-smile')) {
        wand.classList.add('dc-smile');
        wand.title = 'Волшебная палочка';
    }
    document.getElementById('options_button')?.setAttribute('title', 'Меню');
}

/* Drag the "+" and wand sheets down to dismiss, like the message sheet.
 * Both are SillyTavern's own popups, and both close by tapping their button
 * again, so that is how a committed drag closes them — ST's bookkeeping of
 * "is it open" stays right. Delegated on document: the wand menu is created
 * by the extensions module some time after load. */
function wireMenuSwipe() {
    wireDragDown({
        sheets: '#options .options-content, #extensionsMenu',
        scrim: (node) => (node.id === 'extensionsMenu'
            ? { host: document.body, pseudoElement: '::after' }
            : { host: document.getElementById('options'), pseudoElement: '::before' }),
        close: (node) => toggleMenu(node.id === 'extensionsMenu' ? 'wand' : 'options'),
    });
}

/* ── Swipe navigation ───────────────────────────────────────────────────── */

/* Discord lets you drag the whole chat right to go back, and drag the DM
   list left to return to the last chat. The drag follows the finger; release
   past a third of the width (or with a flick) commits.
 *
 * Starting on the last message is left alone: SillyTavern uses horizontal
 * swipes there to switch between generated variants. */
function wireSwipe(target, direction) {
    if (!target) return;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let dx = 0;
    let tracking = false;
    let dragging = false;

    const sheld = () => document.getElementById('sheld');
    const width = () => window.innerWidth || 1;

    /* The drag moves the two screens through their own inline transforms,
       once per frame. (A custom property on <body> would restyle the whole
       page on every touchmove — that was the stutter.) */
    let progress = 0;
    let frame = 0;
    let dim = null;
    const paint = () => {
        frame = 0;
        const s = sheld();
        if (s) s.style.transform = `translate3d(${(progress * 100).toFixed(2)}%, 0, 0)`;
        if (home) {
            home.style.transform = `translate3d(${((1 - progress) * -28).toFixed(2)}%, 0, 0)`;
            dim = home.querySelector(':scope > .dc-home-dim');
            if (dim) dim.style.opacity = String(((1 - progress) * 0.55).toFixed(3));
        }
    };
    const clearPaint = () => {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        sheld()?.style.removeProperty('transform');
        home?.style.removeProperty('transform');
        dim?.style.removeProperty('opacity');
    };

    target.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        if (document.documentElement.dataset.dcMotion === 'off' || isDesk()) return;
        const t = e.target;
        if (direction === 'right') {
            if (body.dataset.dcScreen !== 'chat') return;
            if (t.closest('.last_mes, textarea, input, .swipe_left, .swipe_right, pre, .dc-sheet, #options, .list-group, .dc-wl-people')) return;
        } else {
            if (body.dataset.dcScreen !== 'home' || body.dataset.dcPanel || !(hasOpenChat() || homePageOn())) return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startT = Date.now();
        dx = 0;
        tracking = true;
        dragging = false;
    }, { passive: true });

    target.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const x = e.touches[0].clientX - startX;
        const y = e.touches[0].clientY - startY;
        if (!dragging) {
            if (Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) { tracking = false; return; }
            const ok = direction === 'right' ? x > 14 : x < -14;
            if (!ok || Math.abs(x) < Math.abs(y) * 1.4) return;
            dragging = true;
            body.classList.add('dc-dragging');
        }
        const w = width();
        dx = direction === 'right' ? Math.max(0, x) : Math.min(0, x);
        /* progress 0 = chat fully shown, 1 = home fully shown */
        const p = direction === 'right' ? dx / w : 1 + dx / w;
        progress = Math.min(1, Math.max(0, p));
        if (!frame) frame = window.requestAnimationFrame(paint);
    }, { passive: true });

    const end = () => {
        if (!tracking) return;
        tracking = false;
        if (!dragging) return;
        dragging = false;
        const w = width();
        const velocity = Math.abs(dx) / Math.max(1, Date.now() - startT);
        const commit = Math.abs(dx) > w * 0.33 || (velocity > 0.6 && Math.abs(dx) > 40);
        /* Hand back to the CSS transition from wherever the finger left it. */
        clearPaint();
        body.classList.remove('dc-dragging');
        if (commit) setScreen(direction === 'right' ? 'home' : 'chat');
    };
    target.addEventListener('touchend', end, { passive: true });
    target.addEventListener('touchcancel', end, { passive: true });
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

let recentTimer = 0;
function refreshRecentSoon() {
    window.clearTimeout(recentTimer);
    recentTimer = window.setTimeout(() => {
        /* On desktop the list is always on screen. */
        if (body.dataset.dcScreen === 'home' || (isDesk() && listShown()) || welcomeShown()) refreshRecent();
    }, 400);
}

/* SillyTavern appends its "Show more messages" button on every print of a
   truncated chat; a second print before the chat is cleared (an extension
   reloading it) leaves two. Only the first ever does anything — its click
   handler and removal go by the id — so any extra one goes. */
function dedupeShowMore() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    new MutationObserver(() => {
        const buttons = chat.querySelectorAll(':scope > #show_more_messages');
        for (let i = 1; i < buttons.length; i++) buttons[i].remove();
    }).observe(chat, { childList: true });
}

function init() {
    const ctx = getContext();
    if (!ctx) {
        window.setTimeout(init, 100);
        return;
    }

    body.classList.add('dc-on');
    body.dataset.dcPanel = '';
    body.dataset.dcScreen = 'home';

    buildHome();
    dedupeShowMore();
    ensureChatHeader();
    prepareComposer();
    observeDrawers();
    unpinPanels();
    wireMenuSwipe();
    initPanels();
    initPersonaPanel();
    initCharacterPanel();
    initDesktop();
    initWelcome({
        rows: () => [...recentByKey.values()],
        open: (key) => {
            const row = recentByKey.get(key);
            if (row) openRecent(row);
        },
        panel: (id) => {
            const server = collectServers().find((s) => s.panel === id);
            if (server) openServer(server);
        },
        home: (action) => {
            const selector = { chars: '.dc-dm-chars', create: '.dc-rail-add', persona: '.dc-userbar-bell' }[action];
            if (selector) home?.querySelector(selector)?.click();
        },
        header: () => updateChatHeader(),
        ago: shortAgo,
        snippet: plainSnippet,
    });
    initIcq();
    const familyApi = {
        open: (row) => openRecent(row),
        /* The start page (Досье's case board), as showChat below. */
        showHome: () => {
            panelFromChat = false;
            if (isDesk()) closeServers();
            else setScreen('chat');
            showHomePage();
        },
        /* The contact list: the home screen on a phone, the list column on
           a desktop — with any open panel closed. */
        showList: () => {
            panelFromChat = false;
            closeServers();
            if (isDesk()) setListShown(true);
            else setScreen('home');
        },
        toggleList,
        showHomePage,
        togglePanel: (server) => {
            if (openPanelId() === server.panel) closeServers();
            else openServer(server);
        },
        /* Back to the open chat, any panel closed. */
        showChat: () => {
            panelFromChat = false;
            /* setScreen('chat') closes an open panel itself; closing it here
               as well would toggle the drawer twice, i.e. open it again. */
            if (isDesk()) closeServers();
            else setScreen('chat');
        },
    };
    initY2k(familyApi);
    initSage(familyApi);
    initGojo(familyApi);
    wireSwipe(document.getElementById('sheld'), 'right');

    /* Start Page toggled in our settings: redraw the list without it. */
    window.addEventListener('dc-option', (e) => {
        if (['startpage', 'desk', 'desktop'].includes(e.detail?.key)) refreshRecent();
        if (e.detail?.key === 'desk-list' && e.detail.value === 'shown') refreshRecentSoon();
        if (String(e.detail?.key).startsWith('hdr')) updateHeaderSlots();
    });

    const { eventSource, eventTypes } = ctx;
    eventSource.on(eventTypes.APP_READY, () => {
        appReady = true;
        /* The skin's ST theme goes on by itself the first time; after that
           only its palette is kept current. */
        autoInstallTheme()
            .catch((error) => console.warn('[Discord Mobile] theme auto-install failed', error))
            .then(() => syncThemePalette())
            .catch((error) => console.warn('[Discord Mobile] palette sync failed', error));
        renderRail();
        prepareComposer();
        unpinPanels();
        updateUserbar();
        updateChatHeader();
        if (hasOpenChat() && dcRead('screen', 'home') === 'chat') setScreen('chat');
        else if (!hasOpenChat() && homePageOn()) setScreen('chat');
        refreshRecent();
    });

    let firstChange = true;
    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        updateChatHeader();
        prepareComposer();
        /* The very first CHAT_CHANGED is SillyTavern restoring the last chat
           at startup — that must not yank the user off the home screen. */
        if (firstChange) {
            firstChange = false;
            if (hasOpenChat() && dcRead('screen', 'home') === 'chat') setScreen('chat');
            else if (!hasOpenChat() && homePageOn()) setScreen('chat');
            refreshRecent();
            return;
        }
        /* No chat left open: "Главная" (it lives on the chat screen). */
        if (hasOpenChat() || homePageOn()) setScreen('chat');
        else setScreen('home');
        refreshRecentSoon();
    });

    for (const type of [eventTypes.MESSAGE_SENT, eventTypes.MESSAGE_RECEIVED, eventTypes.CHAT_DELETED, eventTypes.GROUP_CHAT_DELETED, eventTypes.CHARACTER_DELETED, eventTypes.CHARACTER_EDITED]) {
        if (type) eventSource.on(type, refreshRecentSoon);
    }
    for (const type of [eventTypes.ONLINE_STATUS_CHANGED, eventTypes.PERSONA_CHANGED, eventTypes.SETTINGS_UPDATED]) {
        if (type) eventSource.on(type, () => { updateUserbar(); updateChatHeader(); refreshWelcome(); });
    }
    if (eventTypes.GROUP_UPDATED) eventSource.on(eventTypes.GROUP_UPDATED, updateChatHeader);

    /* Persona switches don't always fire an event in older builds. */
    window.setInterval(updateUserbar, 5000);

    updateChatHeader();
    refreshRecent();
}

init();
