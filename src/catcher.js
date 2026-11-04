/* The catcher of floating buttons: a small see-through tab on the edge of the
 * screen, and behind it a tray that collects every floating button other
 * extensions keep on the page.
 *
 * The buttons are not moved in the DOM. Extensions look for them, re-append
 * them to <body> and drag them around, so each one stays where it is and only
 * gets an attribute; a generated stylesheet puts that attribute's slot in the
 * tray. Extensions that wipe a button's inline style can't undo that. */

import { DC_ENABLED, dcOption, dcRead, dcWrite } from './boot.js?v=0.5.4';

const NAMES = {
    'moodtube-fab': 'MoodTube',
    'cl-quick-fab': 'Одежда',
    'DA-floating-container': 'Dream Album',
};

const EXCLUDE = '[id^="dc-"], [class*="dc-"], [id^="gj-"], [class*="gj-"], #preloader, #load-spinner, #toast-container, #movingDivs, #sheld, dialog, iframe, canvas, video, audio, script, style, link';

const TAB_H = 54;
const GAP = 6;
const PAD = 8;
const ONE = 40;      // a single button in the tray
const SHORT = 84;    // the narrow side of anything that can be caught at all

let tray = null;
let tab = null;
let rules = null;
let observer = null;
let timer = 0;
let press = null;
const found = new Map();     // key -> { el, width, height, asleep }, measured before catching

const readList = (key) => {
    try {
        const list = JSON.parse(dcRead(key, '[]'));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
};
const on = () => DC_ENABLED && dcOption('catch') === 'on';
const isOpen = () => document.documentElement.classList.contains('dc-catch-open');
const setOpen = (open) => document.documentElement.classList.toggle('dc-catch-open', open);
const keyOf = (el) => el.id || String(el.classList[0] || '');
const nameOf = (key, el) => NAMES[key] || el?.title || el?.getAttribute('aria-label') || key;
const escapeHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function shown(el) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
}

function isFloating(el) {
    if (el.matches(EXCLUDE) || !keyOf(el)) return false;
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' || !shown(el)) return false;
    const box = el.getBoundingClientRect();
    const short = Math.min(box.width, box.height);
    const long = Math.max(box.width, box.height);
    if (short < 20 || short > SHORT || long > window.innerHeight * 0.7) return false;
    return /pointer|grab/.test(style.cursor) || Boolean(el.querySelector('button, [role="button"], i, svg, img'));
}

/* Saved order first, the ones never seen before after them. */
function ordered() {
    const order = readList('catch-order');
    const rank = (key) => {
        const at = order.indexOf(key);
        return at < 0 ? order.length : at;
    };
    return [...found.keys()].sort((a, b) => rank(a) - rank(b));
}

function scan() {
    if (!on()) return;
    let changed = false;
    for (const [key, item] of found) {
        if (!item.el.isConnected) {
            found.delete(key);
            changed = true;
            continue;
        }
        /* Hidden for a while (Dream Album hides its dock over a viewer): it keeps
           its place in the list and comes back into the tray, not to its old spot. */
        const asleep = !shown(item.el);
        if (asleep !== Boolean(item.asleep)) changed = true;
        item.asleep = asleep;
    }
    /* Dream Album builds its dock anew under the same id on every chat. */
    for (const el of document.body.children) {
        if (el.hasAttribute('data-dc-catch') || found.has(keyOf(el)) || !isFloating(el)) continue;
        const { width, height } = el.getBoundingClientRect();
        found.set(keyOf(el), { el, width, height });
        changed = true;
    }
    if (!changed) return;
    /* A button just caught jumps straight to its slot instead of flying there. */
    document.documentElement.classList.add('dc-catch-quiet');
    layout();
    document.body.getBoundingClientRect();
    document.documentElement.classList.remove('dc-catch-quiet');
    renderCatchList();
}

function clearSlots(keep = []) {
    document.querySelectorAll('[data-dc-catch]').forEach((el) => {
        if (keep.includes(el)) return;
        el.removeAttribute('data-dc-catch');
        el.removeAttribute('data-dc-catch-one');
    });
}

/* The tab's height is kept as a share of the screen, so it survives turning
   the phone and the keyboard. */
function tabMiddle() {
    const share = Number(dcRead('catch-y', '0.5'));
    const vh = window.innerHeight;
    const y = (Number.isFinite(share) ? share : 0.5) * vh;
    return Math.min(Math.max(TAB_H / 2 + 8, y), vh - TAB_H / 2 - 8);
}

/* Slots run down a column and go on in the next one if the screen ends. */
function layout() {
    if (!tray) return;
    const skip = readList('catch-skip');
    const caught = ordered().filter((key) => !skip.includes(key)).map((key) => found.get(key));
    const items = caught.filter((item) => !item.asleep);
    /* Slots are rewritten in place: a button let go of even for a moment
       would fly in from where its extension keeps it. */
    clearSlots(caught.map((item) => item.el));
    caught.filter((item) => item.asleep).forEach((item) => item.el.setAttribute('data-dc-catch', 'asleep'));
    tab.hidden = !items.length;
    tray.hidden = !items.length;
    if (!items.length) {
        rules.textContent = '';
        setOpen(false);
        return;
    }

    const room = window.innerHeight - 16 - PAD * 2;
    const columns = [{ items: [], width: 0, height: 0 }];
    items.forEach((item) => {
        const { el } = item;
        const one = Math.max(item.width, item.height) <= 64;
        if (one) el.setAttribute('data-dc-catch-one', '');
        const width = one ? ONE : item.width;
        const height = one ? ONE : item.height;
        let column = columns[columns.length - 1];
        if (column.items.length && column.height + GAP + height > room) {
            column = { items: [], width: 0, height: 0 };
            columns.push(column);
        }
        column.height += (column.items.length ? GAP : 0) + height;
        column.width = Math.max(column.width, width);
        column.items.push({ el, width, height });
    });

    const trayW = Math.ceil(columns.reduce((sum, c) => sum + c.width, 0) + GAP * (columns.length - 1) + PAD * 2);
    const trayH = Math.ceil(Math.max(...columns.map((c) => c.height)) + PAD * 2);
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const middle = tabMiddle();
    const top = Math.round(Math.min(Math.max(8, middle - trayH / 2), Math.max(8, vh - trayH - 8)));
    const right = dcOption('catchside') === 'right';
    const shift = right ? trayW + 12 : -trayW - 12;
    const trayLeft = right ? vw - trayW : 0;

    let css = '';
    let x = PAD;
    let slot = 0;
    for (const column of columns) {
        let y = PAD;
        for (const item of column.items) {
            const left = Math.round(trayLeft + x + (column.width - item.width) / 2);
            item.el.setAttribute('data-dc-catch', slot);
            css += `html body [data-dc-catch="${slot}"] { top: ${Math.round(top + y)}px !important; left: ${left + shift}px !important; }\n`;
            css += `html.dc-catch-open body [data-dc-catch="${slot}"] { left: ${left}px !important; }\n`;
            y += item.height + GAP;
            slot += 1;
        }
        x += column.width + GAP;
    }
    rules.textContent = css;

    tray.style.top = `${top}px`;
    tray.style.width = `${trayW}px`;
    tray.style.height = `${trayH}px`;
    tab.style.setProperty('--dc-catch-w', `${trayW}px`);
    tab.style.top = `${Math.round(middle - TAB_H / 2)}px`;
    tray.dataset.side = right ? 'right' : 'left';
    tab.dataset.side = right ? 'right' : 'left';
}

function bindTab() {
    let drag = null;
    const stopDrag = () => {
        drag = null;
        document.documentElement.classList.remove('dc-catch-dragging');
    };
    tab.addEventListener('pointerdown', (event) => {
        drag = { y: event.clientY, moved: false };
        tab.setPointerCapture(event.pointerId);
    });
    tab.addEventListener('pointermove', (event) => {
        if (!drag) return;
        if (Math.abs(event.clientY - drag.y) > 6) drag.moved = true;
        if (!drag.moved) return;
        dcWrite('catch-y', String(event.clientY / window.innerHeight));
        document.documentElement.classList.add('dc-catch-dragging');
        layout();
    });
    tab.addEventListener('pointerup', () => {
        if (drag && !drag.moved) {
            scan();
            setOpen(!isOpen());
        }
        stopDrag();
    });
    tab.addEventListener('pointercancel', stopDrag);
    /* ST closes unpinned drawers on any press outside them. */
    for (const type of ['mousedown', 'touchstart']) {
        tab.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
}

/* «Скрывать после нажатия» and «при нажатии на экран»: a press and release in
   one place, so dragging a button or scrolling the chat keeps the tray open. */
function onPress(event) {
    const el = event.target.closest?.('[data-dc-catch]') || null;
    const ours = Boolean(el || event.target.closest?.('#dc-catch-tray, #dc-catch-tab'));
    press = { el, ours, x: event.clientX, y: event.clientY };
}

function onRelease(event) {
    const was = press;
    press = null;
    if (!was || !isOpen()) return;
    if (Math.hypot(event.clientX - was.x, event.clientY - was.y) >= 10) return;
    const hide = was.ours
        ? was.el && dcOption('catchhide') === 'on' && event.target.closest?.('[data-dc-catch]') === was.el
        : dcOption('catchtap') === 'on';
    if (hide) window.setTimeout(() => setOpen(false), 150);
}

function start() {
    if (tray) return;
    tray = Object.assign(document.createElement('div'), { id: 'dc-catch-tray', hidden: true });
    tab = Object.assign(document.createElement('div'), { id: 'dc-catch-tab', hidden: true, title: 'Плавающие кнопки' });
    rules = Object.assign(document.createElement('style'), { id: 'dc-catch-rules' });
    document.head.append(rules);
    document.body.append(tray, tab);
    bindTab();
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('pointerup', onRelease, true);
    window.addEventListener('resize', layout);
    observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true });
    timer = window.setInterval(scan, 2000);
    scan();
}

function stop() {
    if (!tray) return;
    observer.disconnect();
    window.clearInterval(timer);
    document.removeEventListener('pointerdown', onPress, true);
    document.removeEventListener('pointerup', onRelease, true);
    window.removeEventListener('resize', layout);
    clearSlots();
    setOpen(false);
    tray.remove();
    tab.remove();
    rules.remove();
    tray = tab = rules = observer = null;
    found.clear();
    renderCatchList();
}

/* ── The list in the settings: order and who is caught ──────────────────── */

function moveCaught(key, by) {
    const list = ordered();
    const from = list.indexOf(key);
    const to = from + by;
    if (from < 0 || to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    dcWrite('catch-order', JSON.stringify(list));
    layout();
    renderCatchList();
}

function setSkipped(key, skipped) {
    const skip = readList('catch-skip').filter((k) => k !== key);
    if (skipped) skip.push(key);
    dcWrite('catch-skip', JSON.stringify(skip));
    layout();
    renderCatchList();
}

function renderCatchList() {
    const host = document.getElementById('dc-catch-list');
    if (!host) return;
    const skip = readList('catch-skip');
    const list = ordered();
    if (!list.length) {
        host.innerHTML = on() ? '<small class="dc-set-hint">Плавающих кнопок сейчас нет.</small>' : '';
        return;
    }
    host.innerHTML = list.map((key, at) => `
        <div class="dc-catch-row">
            <label class="checkbox_label">
                <input type="checkbox" data-catch-use="${escapeHtml(key)}" ${skip.includes(key) ? '' : 'checked'}>
                <span>${escapeHtml(nameOf(key, found.get(key)?.el))}</span>
            </label>
            <div class="menu_button fa-solid fa-chevron-up" data-catch-move="-1" data-catch-key="${escapeHtml(key)}" title="Выше" ${at === 0 ? 'data-off' : ''}></div>
            <div class="menu_button fa-solid fa-chevron-down" data-catch-move="1" data-catch-key="${escapeHtml(key)}" title="Ниже" ${at === list.length - 1 ? 'data-off' : ''}></div>
        </div>`).join('');
}

function bindCatchList(host) {
    host.addEventListener('click', (event) => {
        const key = event.target.closest('[data-catch-move]');
        if (key) moveCaught(key.dataset.catchKey, Number(key.dataset.catchMove));
    });
    host.addEventListener('change', (event) => {
        const box = event.target.closest('[data-catch-use]');
        if (box) setSkipped(box.dataset.catchUse, !box.checked);
    });
    renderCatchList();
}

window.addEventListener('dc-option', ({ detail }) => {
    if (detail.key === 'catch') {
        if (on()) start();
        else stop();
    }
    if (detail.key === 'catchside') layout();
});

/* Extensions add their buttons late. */
if (on()) window.setTimeout(start, 1500);

export { bindCatchList };
