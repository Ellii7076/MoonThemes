/* "Главная" — Discord-style home in place of SillyTavern's welcome screen.
 *
 * ST shows its welcome panel (logo, recent chats, shortcuts) inside #chat
 * whenever no chat is open. The recent chats are already in our list, so
 * this puts a home page in front of it instead: a greeting, the last chat
 * to pick up, the recent people as avatars, and shortcuts. ST's panel stays
 * in the DOM, only hidden (styles/welcome.css), so its own buttons keep
 * working — "Временный чат" here just clicks ST's hidden one. The classic
 * page comes back with the "welcome" option.
 *
 * ST empties #chat on every chat change, which takes this card with it, so
 * it is re-added whenever the welcome panel shows up again. */

import { dcOption, dcSetOption, getContext } from './boot.js?v=0.5.4';
import { personaAvatarUrl } from './persona.js?v=0.5.4';

let api = null;

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
}

function rowAvatar(ctx, row) {
    if (row.group) {
        const first = row.group.members?.[0];
        return row.group.avatar_url || (first ? ctx.getThumbnailUrl('avatar', first) : '');
    }
    return row.character ? ctx.getThumbnailUrl('avatar', row.character.avatar) : '';
}

const personOf = (row) => (row.group ? `g:${row.group.id}` : `c:${row.character?.avatar}`);

/* One row per character/group: the newest chat with each. */
function people(rows) {
    const seen = new Set();
    const out = [];
    for (const row of [...rows].sort((a, b) => Number(b.chat.last_mes) - Number(a.chat.last_mes))) {
        const id = personOf(row);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(row);
    }
    return out;
}

const ACTIONS = [
    { act: 'temp', icon: 'fa-comment-dots', title: 'Временный чат', sub: 'Без персонажа, ничего не сохранится', color: '#5865f2' },
    { act: 'chars', icon: 'fa-address-book', title: 'Персонажи', sub: 'Выбрать, с кем поговорить', color: '#23a55a' },
    { act: 'create', icon: 'fa-user-plus', title: 'Новый персонаж', sub: 'Создать или импортировать', color: '#eb459e' },
    { act: 'persona', icon: 'fa-face-smile', title: 'Персоны', sub: 'Кем ты будешь сегодня', color: '#f0b232' },
    { act: 'panel:left-nav-panel', icon: 'fa-sliders', title: 'Пресет', sub: 'Генерация и промпты', color: '#00a8fc' },
    { act: 'panel:rm_api_block', icon: 'fa-plug', title: 'Подключение', sub: 'API и модель', color: '#949ba4' },
];

/* "Досье": the start page is a detective's case board — the newest case
   as a pinned photo with an "Открыть" ticket, the people before it as a
   trail of photos joined by arrows, then an evidence folder (characters),
   a wanted poster (new character) and kraft tags for the rest. */
const BOARD_TAGS = ['Слежка', 'Улики'];
const BOARD_ARROW = '<svg class="ds-bd-arrow" viewBox="0 0 80 40" aria-hidden="true"><path d="M6 8 C 30 0, 58 6, 68 30"/><path d="M58 26 L69 33 L72 20"/></svg>';

function renderBoard(card, ctx, rows, recent, version) {
    const trail = recent.slice(0, 5).map((row, i) => {
        const side = i % 2 ? 'r' : 'l';
        const tag = i === 0 ? 'Текущее дело' : BOARD_TAGS[(i - 1) % 2];
        const under = i === 0
            ? `<button type="button" class="ds-bd-start" data-key="${escapeHtml(row.key)}">Открыть</button>
               <small class="ds-bd-note">${escapeHtml(api.snippet(row.chat.mes))}</small>`
            : `<small class="ds-bd-note">${escapeHtml(api.ago(row.chat.last_mes))}</small>`;
        return `${i ? BOARD_ARROW.replace('ds-bd-arrow', `ds-bd-arrow ds-bd-to-${side}`) : ''}
            <div class="ds-bd-step ds-bd-${side}">
                <button type="button" class="ds-bd-photo ds-bd-pin${i % 3}" data-key="${escapeHtml(row.key)}" title="${escapeHtml(row.name)}">
                    <span class="ds-bd-tag ds-bd-tag${i ? (i - 1) % 2 + 1 : 0}">${tag}</span>
                    <img src="${escapeHtml(rowAvatar(ctx, row))}" alt="">
                    <b>${escapeHtml(row.name)}</b>
                </button>
                ${under}
            </div>`;
    }).join('');
    const tags = ACTIONS.filter((a) => !['chars', 'create'].includes(a.act)).map((a) => `
        <button type="button" class="dc-wl-action ds-bd-key" data-act="${a.act}"><i class="fa-solid ${a.icon}"></i><span>${a.title}</span></button>`).join('');
    const date = new Date().toLocaleDateString('ru-RU');
    card.innerHTML = `
        <div class="ds-board">
            <header class="ds-bd-sign">
                <small>Case board</small>
                <h2>Detect</h2>
                <span>Агент ${escapeHtml(ctx.name1 || 'X')} на месте</span>
                <em>Смена от ${date}</em>
            </header>
            <div class="ds-bd-title"><span>${recent.length ? 'Расследование' : 'Дел пока нет'}</span><i class="fa-solid fa-magnifying-glass"></i></div>
            <div class="ds-bd-trail">${trail}</div>
            <div class="ds-bd-evidence">
                <button type="button" class="dc-wl-action ds-bd-folder" data-act="chars">
                    <span class="ds-bd-tag ds-bd-tag3">Персонажи</span>
                    <b>Solve</b>
                </button>
                <button type="button" class="dc-wl-action ds-bd-wanted" data-act="create">
                    <span>Розыск</span>
                    <i class="fa-solid fa-user-secret"></i>
                    <small>Новый персонаж</small>
                </button>
            </div>
            <div class="ds-bd-keys">${tags}</div>
            <footer class="ds-bd-foot">
                <span class="ds-bd-count">Дел в архиве: ${rows.length}</span>
                <span>${escapeHtml(version)}</span>
                <button type="button" class="dc-wl-classic">Классическая</button>
            </footer>
        </div>`;
}

/* Годжо: the white one's start page is a shelf of manga — a character is a
   title, their chats its volumes, so the number on a cover is how many there
   are. The black one, a poster at night, puts the same up as a cinema bill:
   films and their parts. */
const SHELF_WORDS = {
    light: {
        title: (name) => `Полка ${name}`,
        count: (titles, parts) => `Тайтлов: ${titles}, томов: ${parts}`,
        part: (n) => `Том ${n}`,
        now: 'Читаешь сейчас',
        go: 'Читать дальше',
        all: 'Вся полка',
    },
    dark: {
        title: () => 'Афиша',
        count: (titles, parts) => `Фильмов: ${titles}, частей: ${parts}`,
        part: (n) => `Часть ${n}`,
        now: 'Сейчас на экране',
        go: 'Смотреть дальше',
        all: 'В прокате',
    },
};

const SHELF_KEYS = ACTIONS.filter((a) => ['temp', 'create', 'chars', 'persona'].includes(a.act));

function renderShelf(card, ctx, rows, recent, version) {
    const words = SHELF_WORDS[document.documentElement.dataset.dcSkin === 'gojo-dark' ? 'dark' : 'light'];
    const volumes = new Map();
    for (const row of rows) volumes.set(personOf(row), (volumes.get(personOf(row)) || 0) + 1);
    const cover = (row) => `
        <button type="button" class="gj-vol" data-key="${escapeHtml(row.key)}" title="${escapeHtml(row.name)}">
            <span class="gj-vol-cover">
                <img src="${escapeHtml(rowAvatar(ctx, row))}" alt="" loading="lazy">
                <span class="gj-vol-no">${words.part(volumes.get(personOf(row)))}</span>
                <span class="gj-vol-name">${escapeHtml(row.name)}</span>
            </span>
            ${escapeHtml(api.ago(row.chat.last_mes))}
        </button>`;
    const [last, ...rest] = recent;
    card.innerHTML = `
        <header class="gj-sh-head">
            <h2>${escapeHtml(words.title(ctx.name1 || ''))}</h2>
            <span>${words.count(recent.length, rows.length)}</span>
        </header>
        ${last ? `
        <section class="gj-sh-now">
            ${cover(last)}
            <div class="gj-sh-now-text">
                <small>${words.now}</small>
                <b>${escapeHtml(last.name)}</b>
                <p>${escapeHtml(api.snippet(last.chat.mes))}</p>
                <button type="button" class="gj-sh-go" data-key="${escapeHtml(last.key)}">${words.go}</button>
            </div>
        </section>` : ''}
        ${rest.length ? `
        <section>
            <h3 class="gj-sh-title">${words.all}</h3>
            <div class="gj-sh-shelf">${rest.map(cover).join('')}</div>
        </section>` : ''}
        <div class="gj-sh-keys">
            ${SHELF_KEYS.map((a) => `<button type="button" class="dc-wl-action" data-act="${a.act}"><i class="fa-solid ${a.icon}"></i><span>${a.title}</span></button>`).join('')}
        </div>
        <footer class="dc-wl-foot">
            <span>${escapeHtml(version)}</span>
            <button type="button" class="dc-wl-classic">Классическая стартовая</button>
        </footer>`;
}

function render(card) {
    const ctx = getContext();
    if (!ctx || !api) return;
    const rows = api.rows();
    const recent = people(rows);
    const last = recent[0];
    const avatar = personaAvatarUrl();
    const version = document.querySelector('#chat .welcomeHeaderVersionDisplay')?.textContent?.trim() || '';
    if (document.documentElement.dataset.dcFamily === 'dossier') {
        renderBoard(card, ctx, rows, recent, version);
        return;
    }
    if (document.documentElement.dataset.dcFamily === 'gojo') {
        renderShelf(card, ctx, rows, recent, version);
        return;
    }

    const lastHtml = last ? `
        <section class="dc-wl-section">
            <h3>Продолжить</h3>
            <button type="button" class="dc-wl-continue" data-key="${escapeHtml(last.key)}">
                <img class="dc-wl-continue-av" src="${escapeHtml(rowAvatar(ctx, last))}" alt="">
                <span class="dc-wl-continue-text">
                    <span class="dc-wl-continue-top">
                        <b>${escapeHtml(last.name)}</b>
                        <small>${escapeHtml(api.ago(last.chat.last_mes))}</small>
                    </span>
                    <span class="dc-wl-continue-file">${escapeHtml(last.file)}</span>
                    <span class="dc-wl-continue-snippet">${escapeHtml(api.snippet(last.chat.mes))}</span>
                </span>
                <span class="dc-wl-continue-go"><i class="fa-solid fa-arrow-right"></i></span>
            </button>
        </section>` : '';

    const peopleHtml = recent.length > 1 ? `
        <section class="dc-wl-section">
            <h3>Недавние собеседники</h3>
            <div class="dc-wl-people">
                ${recent.slice(1, 13).map((row) => `
                    <button type="button" class="dc-wl-person" data-key="${escapeHtml(row.key)}" title="${escapeHtml(row.name)}">
                        <img src="${escapeHtml(rowAvatar(ctx, row))}" alt="">
                        <span>${escapeHtml(row.name)}</span>
                    </button>`).join('')}
            </div>
        </section>` : '';

    card.innerHTML = `
        <div class="dc-wl-hero">
            ${avatar ? `<img class="dc-wl-me" src="${escapeHtml(avatar)}" alt="">` : ''}
            <div>
                <h2>${greeting()}, ${escapeHtml(ctx.name1 || 'друг')}!</h2>
                <p>${last ? 'Продолжим, где остановились, или начнём что-то новое?' : 'Выбери персонажа и начни болтать.'}</p>
            </div>
        </div>
        ${lastHtml}
        ${peopleHtml}
        <section class="dc-wl-section">
            <h3>Быстрые действия</h3>
            <div class="dc-wl-grid">
                ${ACTIONS.map((a) => `
                    <button type="button" class="dc-wl-action" data-act="${a.act}" style="--dc-wl-color:${a.color}">
                        <span class="dc-wl-action-icon"><i class="fa-solid ${a.icon}"></i></span>
                        <span class="dc-wl-action-text"><b>${a.title}</b><small>${a.sub}</small></span>
                    </button>`).join('')}
            </div>
        </section>
        <footer class="dc-wl-foot">
            <span>${escapeHtml(version)}</span>
            <button type="button" class="dc-wl-classic">Классическая стартовая</button>
        </footer>`;
}

function onClick(event) {
    const target = event.target;
    const row = target.closest('[data-key]');
    if (row) {
        api.open(row.dataset.key);
        return;
    }
    if (target.closest('.dc-wl-classic')) {
        dcSetOption('welcome', 'classic');
        return;
    }
    const action = target.closest('.dc-wl-action')?.dataset.act;
    if (!action) return;
    if (action === 'temp') {
        document.querySelector('#chat .openTemporaryChat')?.click();
    } else if (action.startsWith('panel:')) {
        api.panel(action.slice(6));
    } else {
        api.home(action);
    }
}

/* ST scrolls #chat to the bottom while it fills the welcome screen (late,
   sometimes smoothly), but a home page reads from the top. For a moment
   after each change to #chat any scroll is undone — until the user scrolls
   the card themselves. */
let holdUntil = 0;
function holdTop(chat, card) {
    if (card.dataset.dcUserScrolled) return;
    /* Extensions that pin a freshly opened chat to its bottom (Optimizer)
       stop as soon as the user scrolls it; a synthetic wheel says so. */
    card.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 0 }));
    const wasHolding = Date.now() < holdUntil;
    holdUntil = Date.now() + 1500;
    chat.scrollTop = 0;
    if (wasHolding) return;
    const mine = (e) => {
        if (e.isTrusted) card.dataset.dcUserScrolled = '1';
    };
    const onScroll = () => {
        if (card.dataset.dcUserScrolled || Date.now() > holdUntil || !card.isConnected) {
            chat.removeEventListener('scroll', onScroll);
            return;
        }
        if (chat.scrollTop !== 0) chat.scrollTop = 0;
    };
    if (!card.dataset.dcWatched) {
        card.dataset.dcWatched = '1';
        for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
            card.addEventListener(type, mine, { passive: true });
        }
    }
    chat.addEventListener('scroll', onScroll, { passive: true });
}

function ensure() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    const welcome = chat.querySelector(':scope > .welcomePanel');
    let card = chat.querySelector(':scope > .dc-welcome');
    document.body.classList.toggle('dc-welcome-on', Boolean(welcome));
    if (!welcome) {
        card?.remove();
        return;
    }
    if (!card) {
        card = document.createElement('div');
        card.className = 'dc-welcome';
        card.addEventListener('click', onClick);
        chat.prepend(card);
    }
    holdTop(chat, card);
    render(card);
    api.header();
}

/* Re-render with fresh data (the chat list was refetched, persona changed). */
export function refreshWelcome() {
    const card = document.querySelector('#chat > .dc-welcome');
    if (card) render(card);
}

export function welcomeShown() {
    return Boolean(document.querySelector('#chat > .welcomePanel')) && dcOption('welcome') !== 'classic';
}

/** api: { rows(), open(key), panel(id), home(action), header(), ago(ts), snippet(text) } */
export function initWelcome(shellApi) {
    api = shellApi;
    const chat = document.getElementById('chat');
    if (!chat) return;
    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        /* A microtask, not a frame: a page loading in the background gets
           no frames, and the card must be there when it is shown. */
        queueMicrotask(() => {
            queued = false;
            ensure();
        });
    }).observe(chat, { childList: true });
    window.addEventListener('dc-option', (e) => {
        if (e.detail?.key === 'welcome') api.header();
    });
    ensure();
}
