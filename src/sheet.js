/* Discord's bottom action sheet, shared by messages and the chat list.
 *
 *   openSheet({ head: { img, title, sub }, groups: [[{ icon, label, run, danger }]] })
 *
 * Rows close the sheet first and run their action on the next macrotask, so
 * the tap that chose the action has finished before SillyTavern sees it. */

import { isDesk } from './boot.js?v=0.5.4';

let root = null;
let onClosed = null;

/* Desktop shows the sheet as a context menu where the user clicked
   (right-click on a message, a click on a chip…), so remember the spot. */
let lastPoint = { x: 0, y: 0, t: 0 };
for (const type of ['pointerdown', 'contextmenu']) {
    window.addEventListener(type, (e) => {
        lastPoint = { x: e.clientX, y: e.clientY, t: Date.now() };
    }, { capture: true, passive: true });
}

function placeAsMenu(panel) {
    const margin = 8;
    const recent = Date.now() - lastPoint.t < 1500;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = recent ? lastPoint.x : (vw - w) / 2;
    let y = recent ? lastPoint.y : (vh - h) / 2;
    /* Flip to the other side of the pointer when it would run off-screen. */
    if (x + w + margin > vw) x = Math.max(margin, x - w);
    if (y + h + margin > vh) y = Math.max(margin, vh - h - margin);
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.style.transformOrigin = `${recent && x < lastPoint.x ? 'right' : 'left'} top`;
}

/* Drag a bottom sheet down to dismiss, by finger or mouse: `sheets` is what can
   be dragged, `scrim(node)` the dimmed layer that fades with it, `close(node)`
   closes it once it has slid off. */
export function wireDragDown({ sheets, scrim, close }) {
    const SPAN = 1000;    // the length of the paused animations, in ms
    let drag = null;
    let eatClick = false;

    /* The sheet and its scrim are moved by paused animations, not inline
       styles: a style write can restyle the whole page (the wand menu's scrim
       hangs on a body:has() rule that reads it), and an animation gets its own
       layer, so the page under it isn't repainted on every step. */
    const grab = () => {
        const { node } = drag;
        drag.travel = window.innerHeight - node.getBoundingClientRect().top;
        const { host, pseudoElement } = scrim(node);
        const timing = { duration: SPAN, fill: 'both' };
        drag.moves = [
            node.animate([{ translate: '0 0' }, { translate: `0 ${drag.travel}px` }], timing),
            host.animate({ opacity: [1, 0] }, { ...timing, pseudoElement }),
        ];
        drag.moves.forEach((move) => move.pause());
    };

    const follow = (y) => {
        const dy = y - drag.startY;
        if (!drag.moves) {
            if (dy < 5) return;
            grab();
        }
        drag.dy = Math.max(0, dy);
        const time = Math.min(drag.dy / drag.travel, 1) * SPAN;
        drag.moves.forEach((move) => {
            move.currentTime = time;
        });
    };

    const release = () => {
        const { node, moves, dy, travel } = drag;
        drag = null;
        if (!moves) return;
        const closing = dy > 90;
        const done = Math.min(dy / travel, 1);
        const left = closing ? 1 - done : done;
        const clear = () => moves.forEach((move) => move.cancel());
        const finish = () => {
            if (!closing) {
                clear();
                return;
            }
            close(node);
            /* Held off screen until it has really gone. */
            window.setTimeout(clear, 350);
        };
        if (left <= 0) {
            finish();
            return;
        }
        moves.forEach((move) => {
            move.playbackRate = ((closing ? 1 : -1) * left * SPAN) / Math.max(120, 240 * left);
            move.play();
        });
        moves[0].finished.then(finish, () => {});
    };

    const press = (target, y) => {
        const node = target.closest?.(sheets);
        if (node && node.scrollTop <= 0) drag = { node, startY: y, dy: 0 };
    };

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) press(e.target, e.touches[0].clientY);
    }, { passive: true, capture: true });

    /* Not passive: a gesture the browser takes for a scroll gets its
       touchmoves only a few times a second, which is a drag that stutters. */
    document.addEventListener('touchmove', (e) => {
        if (!drag) return;
        const y = e.touches[0].clientY;
        if (!drag.moves && y < drag.startY) {
            drag = null;
            return;
        }
        follow(y);
        if (drag.moves && e.cancelable) e.preventDefault();
    }, { passive: false, capture: true });

    const end = () => {
        if (drag) release();
    };
    document.addEventListener('touchend', end, { passive: true, capture: true });
    document.addEventListener('touchcancel', end, { passive: true, capture: true });

    document.addEventListener('mousedown', (e) => {
        if (e.button === 0) press(e.target, e.clientY);
    }, true);
    document.addEventListener('mousemove', (e) => {
        if (!drag) return;
        follow(e.clientY);
        if (drag.moves) e.preventDefault();
    }, true);
    document.addEventListener('mouseup', () => {
        if (!drag) return;
        /* The click after a drag isn't a press on a menu item, and landing
           outside the sheet it would close the menu by itself. */
        eatClick = Boolean(drag.moves);
        release();
        window.setTimeout(() => {
            eatClick = false;
        }, 50);
    }, true);
    document.addEventListener('click', (e) => {
        if (!eatClick) return;
        eatClick = false;
        e.stopPropagation();
        e.preventDefault();
    }, true);
}

function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'dc-sheet-root';
    root.innerHTML = `
        <div class="dc-sheet-scrim"></div>
        <div class="dc-sheet" role="dialog">
            <div class="dc-sheet-handle"></div>
            <div class="dc-sheet-head"></div>
            <div class="dc-sheet-body"></div>
        </div>`;
    document.body.append(root);

    /* ST's outside-click drawer closer must not see sheet taps. */
    for (const type of ['mousedown', 'touchstart']) {
        root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    root.querySelector('.dc-sheet-scrim').addEventListener('click', closeSheet);

    /* Drag the sheet down to dismiss; a context menu has nowhere to go. */
    wireDragDown({
        sheets: '.dc-sheet-root:not(.dc-menu) .dc-sheet',
        scrim: () => ({ host: root.querySelector('.dc-sheet-scrim') }),
        close: closeSheet,
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && root.classList.contains('open')) closeSheet();
    });

    return root;
}

export function closeSheet() {
    if (!root?.classList.contains('open')) return;
    root.classList.remove('open');
    const done = onClosed;
    onClosed = null;
    done?.();
}

/* Group titles: pass a string as the first element of a group. */
export function openSheet({ head = {}, groups = [], onClose = null } = {}) {
    const sheet = ensureRoot();
    closeSheet();
    onClosed = onClose;

    const headEl = sheet.querySelector('.dc-sheet-head');
    headEl.innerHTML = '';
    if (head.img) {
        const img = document.createElement('img');
        img.src = head.img;
        img.alt = '';
        headEl.append(img);
    }
    const text = document.createElement('div');
    text.innerHTML = '<b></b><small></small>';
    text.querySelector('b').textContent = head.title || '';
    text.querySelector('small').textContent = head.sub || '';
    headEl.append(text);
    headEl.hidden = !head.title && !head.img;

    /* Small stat chips under the title. A chip's text may be a promise
       (token counts are computed on demand); it shows "…" until it lands. */
    if (head.meta?.length) {
        const row = document.createElement('div');
        row.className = 'dc-sheet-meta';
        for (const item of head.meta) {
            const chip = document.createElement('span');
            chip.className = 'dc-sheet-chip';
            chip.title = item.title || '';
            chip.innerHTML = '<i></i><span></span>';
            chip.querySelector('i').className = item.icon || '';
            const label = chip.querySelector('span');
            if (item.text instanceof Promise) {
                label.textContent = '…';
                item.text.then((value) => {
                    if (value) label.textContent = value;
                    else chip.remove();
                }).catch(() => chip.remove());
            } else {
                label.textContent = item.text;
            }
            row.append(chip);
        }
        text.append(row);
    }

    const body = sheet.querySelector('.dc-sheet-body');
    body.innerHTML = '';
    for (const raw of groups.filter((g) => g?.length)) {
        const title = typeof raw[0] === 'string' ? raw[0] : '';
        const group = title ? raw.slice(1) : raw;
        if (!group.length) continue;
        if (title) {
            const label = document.createElement('div');
            label.className = 'dc-sheet-title';
            label.textContent = title;
            body.append(label);
        }
        const card = document.createElement('div');
        card.className = 'dc-sheet-group';
        for (const item of group) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = `dc-sheet-row${item.danger ? ' danger' : ''}${item.checked ? ' checked' : ''}`;
            if (item.img) {
                row.innerHTML = '<img alt=""><span></span>';
                row.querySelector('img').src = item.img;
            } else {
                row.innerHTML = '<i></i><span></span>';
                row.querySelector('i').className = item.icon || '';
            }
            row.querySelector('span').textContent = item.label;
            if (item.checked !== undefined) {
                const mark = document.createElement('b');
                mark.className = `dc-sheet-check fa-solid ${item.checked ? 'fa-circle-check' : 'fa-circle'}`;
                row.append(mark);
            }
            row.addEventListener('click', () => {
                /* Toggles flip in place and leave the sheet open. */
                if (item.keepOpen) {
                    item.checked = !item.checked;
                    row.classList.toggle('checked', item.checked);
                    const mark = row.querySelector('.dc-sheet-check');
                    if (mark) mark.className = `dc-sheet-check fa-solid ${item.checked ? 'fa-circle-check' : 'fa-circle'}`;
                    item.run();
                    return;
                }
                closeSheet();
                window.setTimeout(item.run, 0);
            });
            card.append(row);
        }
        body.append(card);
    }

    const panel = sheet.querySelector('.dc-sheet');
    panel.scrollTop = 0;
    /* A context menu on a desktop, and always in the "Ретро" theme (Windows
       menus drop down where you click, phone or not). */
    const asMenu = isDesk() || document.documentElement.dataset.dcFamily === 'icq';
    sheet.classList.toggle('dc-menu', asMenu);
    if (asMenu) {
        placeAsMenu(panel);
    } else {
        panel.style.left = '';
        panel.style.top = '';
    }
    /* Next frame so the slide-up transition runs from the closed state. */
    window.requestAnimationFrame(() => sheet.classList.add('open'));
}
