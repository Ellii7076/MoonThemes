/* Discord Mobile — the message list.
 *
 *   - grouping: a message from the same author within 7 minutes drops its
 *     avatar and name and tucks under the previous one (.dc-cont)
 *   - timestamps in Discord's format next to the name
 *   - day dividers: a hairline with "29 сентября 2026 г." in the middle
 *   - long-press (or right-click) opens Discord's action sheet, filled with
 *     SillyTavern's own message buttons
 *
 * The observer never disconnects around our writes (that drops ST's pending
 * records); it drains its own records with takeRecords() instead. */

import { getContext } from './boot.js?v=0.5.4';
import { openSheet } from './sheet.js?v=0.5.4';

const GROUP_WINDOW_MS = 7 * 60 * 1000;

function pad2(n) {
    return String(n).padStart(2, '0');
}

function parseDate(raw) {
    if (!raw) return null;
    if (typeof raw === 'number') {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    let d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
    /* "June 7, 2026 3:04pm" — the am/pm needs a space to parse. */
    d = new Date(String(raw).replace(/(\d)(am|pm)/i, '$1 $2'));
    return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeOf(d) {
    return `${d.getHours()}:${pad2(d.getMinutes())}`;
}

/* "Сегодня, в 23:15" / "Вчера, в 18:11" / "29.09.2026 18:11" */
function stampLabel(d) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(d) === dayKey(today)) return `Сегодня, в ${timeOf(d)}`;
    if (dayKey(d) === dayKey(yesterday)) return `Вчера, в ${timeOf(d)}`;
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${timeOf(d)}`;
}

function dayLabel(d) {
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── Decoration pass ────────────────────────────────────────────────────── */

let observer = null;
let scheduled = false;

function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
        scheduled = false;
        decorate();
    });
}

function decorate() {
    const chatEl = document.getElementById('chat');
    const ctx = getContext();
    if (!chatEl || !ctx) return;

    let prev = null;
    let prevDay = '';

    for (const mes of chatEl.querySelectorAll(':scope > .mes')) {
        const id = Number(mes.getAttribute('mesid'));
        const data = Number.isInteger(id) ? ctx.chat?.[id] : null;
        const date = parseDate(data?.send_date);
        const key = date ? dayKey(date) : prevDay;

        /* Day divider directly before this message, or none. */
        const before = mes.previousElementSibling;
        const hasDivider = before?.classList.contains('dc-day');
        const wantDivider = Boolean(date) && key !== prevDay;
        if (wantDivider) {
            const label = dayLabel(date);
            if (hasDivider) {
                if (before.dataset.day !== key) {
                    before.dataset.day = key;
                    before.querySelector('span').textContent = label;
                }
            } else {
                const divider = document.createElement('div');
                divider.className = 'dc-day';
                divider.dataset.day = key;
                divider.innerHTML = `<span>${label}</span>`;
                mes.before(divider);
            }
        } else if (hasDivider) {
            before.remove();
        }

        /* Grouping. */
        const author = `${mes.getAttribute('is_user')}|${mes.getAttribute('is_system')}|${mes.getAttribute('ch_name')}`;
        const cont = Boolean(prev && date && prev.date
            && prev.author === author
            && key === prevDay
            && date - prev.date < GROUP_WINDOW_MS
            && !wantDivider
            && mes.getAttribute('is_system') !== 'true');
        mes.classList.toggle('dc-cont', cont);

        /* Timestamp next to the name. */
        const nameRow = mes.querySelector('.ch_name .name_text')?.parentElement;
        if (nameRow) {
            let stamp = nameRow.querySelector(':scope > .dc-ts');
            if (!stamp) {
                stamp = document.createElement('span');
                stamp.className = 'dc-ts';
                nameRow.append(stamp);
            }
            const text = date ? stampLabel(date) : '';
            if (stamp.textContent !== text) stamp.textContent = text;
        }

        prev = { author, date };
        prevDay = key;
    }

    /* Orphan dividers (their message was deleted). */
    for (const divider of chatEl.querySelectorAll(':scope > .dc-day')) {
        if (!divider.nextElementSibling?.classList.contains('mes')) divider.remove();
    }

    observer?.takeRecords();
}

function observeChat() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) {
        window.setTimeout(observeChat, 200);
        return;
    }
    observer = new MutationObserver(schedule);
    observer.observe(chatEl, { childList: true });
    schedule();
}

/* ── Action sheet ───────────────────────────────────────────────────────── */

function visible(node) {
    return node instanceof HTMLElement && getComputedStyle(node).display !== 'none';
}

const LABELS = {
    mes_edit: 'Редактировать',
    mes_copy: 'Копировать текст',
    mes_translate: 'Перевести',
    sd_message_gen: 'Сгенерировать картинку',
    mes_narrate: 'Озвучить',
    mes_hide: 'Скрыть от ИИ',
    mes_unhide: 'Показать ИИ',
    mes_create_branch: 'Создать ветку',
    mes_create_bookmark: 'Создать чекпоинт',
    mes_bookmark: 'Открыть чекпоинт',
    mes_embed: 'Прикрепить файл',
    mes_prompt: 'Показать промпт',
    mes_media_gallery: 'Вид медиа',
    mes_media_list: 'Вид медиа',
    mes_swipe_picker: 'История свайпов',
};

function iconClasses(node) {
    return [...node.classList].filter((c) => c.startsWith('fa')).join(' ');
}

/* "#28 · 512 токенов · 14,2 с · gemini-…" for the sheet header. */
function messageStats(ctx, id) {
    const mes = ctx?.chat?.[id];
    if (!mes) return [];
    const stats = [{ icon: "fa-solid fa-hashtag", text: String(id), title: "Номер сообщения" }];

    /* ST only stores token_count when its counter setting is on, so count
       it ourselves otherwise — message text plus reasoning, like ST does. */
    const stored = Number(mes.extra?.token_count);
    const tokens = stored > 0
        ? Promise.resolve(stored)
        : (ctx.getTokenCountAsync?.(`${mes.extra?.reasoning || ""}${mes.mes || ""}`, 0) ?? Promise.resolve(0));
    stats.push({
        icon: "fa-solid fa-coins",
        title: "Токены",
        text: Promise.resolve(tokens).then((n) => (n > 0 ? `${n} ${plural(n, "токен", "токена", "токенов")}` : "")),
    });

    const started = Date.parse(mes.gen_started);
    const finished = Date.parse(mes.gen_finished);
    if (Number.isFinite(started) && Number.isFinite(finished) && finished > started) {
        const seconds = (finished - started) / 1000;
        const label = seconds < 60
            ? `${seconds.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`
            : `${Math.floor(seconds / 60)} мин ${Math.round(seconds % 60)} с`;
        stats.push({ icon: "fa-solid fa-stopwatch", text: label, title: "Время генерации" });
    }

    const model = mes.extra?.model;
    if (model && !mes.is_user) {
        stats.push({ icon: "fa-solid fa-microchip", text: String(model).split("/").pop(), title: String(model) });
    }
    return stats;
}

function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

function openSheetFor(mes) {
    const ctx = getContext();
    const id = Number(mes.getAttribute('mesid'));
    const isLast = mes.classList.contains('last_mes');
    const isUser = mes.getAttribute('is_user') === 'true';

    mes.classList.add('dc-pressed');

    /* Primary group: what you reach for most. */
    const primary = [];
    const edit = mes.querySelector('.mes_buttons .mes_edit');
    if (edit) primary.push({ icon: 'fa-solid fa-pen', label: 'Редактировать', run: () => edit.click() });
    if (isLast && !isUser) {
        primary.push({ icon: 'fa-solid fa-rotate', label: 'Перегенерировать', run: () => document.getElementById('option_regenerate')?.click() });
        primary.push({ icon: 'fa-solid fa-forward', label: 'Продолжить', run: () => document.getElementById('option_continue')?.click() });
    }
    const copy = mes.querySelector('.mes_buttons .mes_copy');
    if (copy) primary.push({ icon: 'fa-solid fa-copy', label: 'Копировать текст', run: () => copy.click() });

    /* Everything else SillyTavern (and other extensions) put on the message. */
    const rest = [];
    for (const btn of mes.querySelectorAll('.mes_buttons .mes_button')) {
        if (btn.classList.contains('extraMesButtonsHint') || btn.classList.contains('mes_edit') || btn.classList.contains('mes_copy')) continue;
        if (!visible(btn)) continue;
        const known = Object.keys(LABELS).find((k) => btn.classList.contains(k));
        const label = (known && LABELS[known]) || btn.getAttribute('title') || btn.dataset.tooltip || '';
        if (!label) continue;
        rest.push({ icon: iconClasses(btn), label: label.split('\n')[0], run: () => btn.click() });
    }

    const danger = [{
        icon: 'fa-solid fa-trash-can', label: 'Удалить сообщение', danger: true,
        run: () => ctx?.deleteMessage?.(id, undefined, true),
    }];

    openSheet({
        head: {
            img: mes.querySelector('.avatar img')?.getAttribute('src') || '',
            title: mes.querySelector('.name_text')?.textContent || '',
            /* From the data, not the DOM: the decorate pass may not have
               stamped a freshly rendered message yet. */
            sub: (() => {
                const date = parseDate(ctx?.chat?.[id]?.send_date);
                return date ? stampLabel(date) : (mes.querySelector('.dc-ts')?.textContent || '');
            })(),
            meta: messageStats(ctx, id),
        },
        groups: [primary, rest, danger],
        onClose: () => mes.classList.remove('dc-pressed'),
    });
}

function wireLongPress() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) {
        window.setTimeout(wireLongPress, 200);
        return;
    }

    let timer = 0;
    let startX = 0;
    let startY = 0;
    let target = null;

    const cancel = () => {
        window.clearTimeout(timer);
        target?.classList.remove('dc-holding');
        target = null;
    };

    const ignore = (t) => document.body.classList.contains('dc-deleting') || t.closest('.mes_edit_buttons, textarea, input, a, button, .swipe_left, .swipe_right, .mes_reasoning_summary, .avatar, .edit_textarea, img, video, .mes_img_container, .mes_video_container');

    chatEl.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const mes = e.target.closest('.mes');
        if (!mes || ignore(e.target) || mes.querySelector('.edit_textarea')) return;
        target = mes;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        mes.classList.add('dc-holding');
        timer = window.setTimeout(() => {
            const node = target;
            cancel();
            if (!node) return;
            navigator.vibrate?.(12);
            /* The text selection a long-press starts would fight the sheet. */
            window.getSelection()?.removeAllRanges();
            openSheetFor(node);
        }, 450);
    }, { passive: true });

    chatEl.addEventListener('touchmove', (e) => {
        if (!target) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) cancel();
    }, { passive: true });
    chatEl.addEventListener('touchend', cancel, { passive: true });
    chatEl.addEventListener('touchcancel', cancel, { passive: true });

    /* Desktop / mouse: right-click. */
    chatEl.addEventListener('contextmenu', (e) => {
        const mes = e.target.closest('.mes');
        if (!mes || ignore(e.target) || mes.querySelector('.edit_textarea')) return;
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        openSheetFor(mes);
    });
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

function init() {
    const ctx = getContext();
    if (!ctx) {
        window.setTimeout(init, 100);
        return;
    }
    observeChat();
    wireLongPress();

    const { eventSource, eventTypes } = ctx;
    for (const type of ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'MORE_MESSAGES_LOADED', 'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED']) {
        if (eventTypes[type]) eventSource.on(eventTypes[type], schedule);
    }
    /* "Сегодня" turns into "Вчера" at midnight. */
    window.setInterval(schedule, 60000);

    wireTyping(ctx);
    wireDeleteMode();
}

/* ── Delete mode ────────────────────────────────────────────────────────────
 * ST's "Delete messages" shows #dialogue_del_mes and, on a tap, marks that
 * message and everything after it with .selected. Out of the box nothing
 * shows that on our layout. body.dc-deleting lets the CSS tint the chosen
 * messages red and give each a round check; the bar under the chat says how
 * many will go (data-dc-count). */
function wireDeleteMode() {
    const bar = document.getElementById('dialogue_del_mes');
    const chatEl = document.getElementById('chat');
    if (!bar || !chatEl) {
        window.setTimeout(wireDeleteMode, 300);
        return;
    }

    const count = () => {
        const n = chatEl.querySelectorAll(':scope > .mes.selected').length;
        if (bar.dataset.dcCount !== String(n)) bar.dataset.dcCount = String(n);
        if (document.body.classList.contains('dc-del-picked') !== n > 0) document.body.classList.toggle('dc-del-picked', n > 0);
    };

    const sync = () => {
        const on = bar.style.display !== 'none' && bar.style.display !== '';
        if (document.body.classList.contains('dc-deleting') !== on) document.body.classList.toggle('dc-deleting', on);
        if (on) count();
        else if (document.body.classList.contains('dc-del-picked')) document.body.classList.remove('dc-del-picked');
    };
    new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['style'] });
    sync();

    /* ST's own click handler runs first (it's on document); count after. */
    chatEl.addEventListener('click', () => {
        if (document.body.classList.contains('dc-deleting')) window.setTimeout(count, 0);
    });
}

/* "Name печатает…" above the composer while the model is generating. */
function wireTyping(ctx) {
    const form = document.getElementById('form_sheld');
    if (!form) return;
    let bar = form.querySelector(':scope > .dc-typing');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dc-typing';
        bar.innerHTML = '<span class="dc-typing-dots"><i></i><i></i><i></i></span><span><b></b> печатает…</span>';
        form.prepend(bar);
    }

    const { eventSource, eventTypes } = ctx;
    eventSource.on(eventTypes.GENERATION_STARTED, (type, _params, dryRun) => {
        if (dryRun || type === 'quiet') return;
        const now = getContext();
        bar.querySelector('b').textContent = type === 'impersonate' ? (now?.name1 || '') : (now?.name2 || '');
        document.body.classList.add('dc-generating');
    });
    const stop = () => document.body.classList.remove('dc-generating');
    for (const type of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED']) {
        if (eventTypes[type]) eventSource.on(eventTypes[type], stop);
    }
}

init();
