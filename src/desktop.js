/* Desktop layout — Discord's desktop window:
 *
 *   rail | chat list | open panel (preset, personas…) | chat
 *
 * Everything is drawn by styles/desktop.css from what lives on <html>:
 *   data-dc-desk  = on | off         (boot.js: the option + window width)
 *   data-dc-list  = shown | hidden   (chat list collapsed or not)
 *   --dc-list-w, --dc-panel-w        (column widths the user dragged to)
 *   --dc-left-w                      (where the chat starts, from the rail)
 *   --dc-right-w                     (empty space right of the chat)
 *
 * This module adds the drag handles on the column borders and keeps an open
 * panel open while the user clicks around the chat next to it. */

import { dcOption, dcRoot, dcWrite, isDesk } from './boot.js?v=0.5.3';

const SIZES = {
    /* Dragging the list narrower than `hide` collapses it, like VS Code. */
    list: { min: 200, max: 480, def: 300, hide: 120 },
    panel: { min: 340, max: 1100, def: 460 },
    /* Empty space right of the chat, so long lines don't run across a wide
       screen. Dragged closer than `hide` to the edge it snaps back to 0. */
    right: { min: 0, max: 4000, def: 0, hide: 24 },
    /* The chat's left edge: its own handle, which moves only the chat and
       never opens the chat list. Kept as the distance from the rail, so the
       chat stays put (and keeps its width) when the list folds in or out. */
    left: { min: 0, max: 4000, def: 0, hide: 24 },
};
/* Edges whose width is an empty gap: 0 is a real value, not "unset". */
const GAPS = ['left', 'right'];
/* The chat never gets squeezed below this. */
const CHAT_MIN = 380;

export function listShown() {
    return dcRoot.dataset.dcList !== 'hidden';
}

export function setListShown(shown) {
    const value = shown ? 'shown' : 'hidden';
    if (dcRoot.dataset.dcList === value) return;
    dcRoot.dataset.dcList = value;
    dcWrite('desk-list', value);
    /* The list may be stale after being folded away; the shell redraws it. */
    window.dispatchEvent(new CustomEvent('dc-option', { detail: { key: 'desk-list', value } }));
}

export function toggleList() {
    setListShown(!listShown());
}

function getWidth(key) {
    const px = parseFloat(dcRoot.style.getPropertyValue(`--dc-${key}-w`));
    if (GAPS.includes(key)) return Number.isFinite(px) ? px : SIZES[key].def;
    return px || SIZES[key].def;
}

function setWidth(key, px) {
    dcRoot.style.setProperty(`--dc-${key}-w`, `${Math.round(px)}px`);
}

/* Where the columns start: the rail's width as the theme sets it (a theme
   may hide the rail, making it 0). */
function railRight() {
    const width = parseFloat(getComputedStyle(document.body).getPropertyValue('--dc-rail-w'));
    return Number.isFinite(width) ? width : 72;
}

/* The right edge of what sits before the chat: the rail with the list, and
   an open panel when panels open between the list and the chat. */
function columnsRight() {
    let right = Math.max(railRight(), document.getElementById('dc-home')?.getBoundingClientRect().right || 0);
    if (panelOpen() && dcOption('deskpanel') === 'left') {
        right = Math.max(right, document.querySelector('#top-settings-holder .drawer-content.openDrawer')?.getBoundingClientRect().right || 0);
    }
    return right;
}

function chatRect() {
    return document.getElementById('sheld')?.getBoundingClientRect() || { left: 0, right: window.innerWidth };
}

function panelOpen() {
    return Boolean(document.body.dataset.dcPanel);
}

/* One handle per border. The width follows the pointer once per frame and
   is saved on release; a double click puts the default back. */
function wireHandle(handle) {
    const key = handle.dataset.edge;
    const size = SIZES[key];
    let frame = 0;
    let next = 0;
    let hiding = false;
    let moved = false;
    /* Left edge: where the columns before the chat end, fixed per drag. */
    let leftBase = 0;

    const paint = () => {
        frame = 0;
        if (key === 'list') setListShown(!hiding);
        if (GAPS.includes(key)) setWidth(key, hiding ? 0 : next);
        else if (!hiding) setWidth(key, next);
    };

    /* Move/up are followed on the window, so a fast drag that outruns the
       10px handle (or ends over an iframe's edge) still lands. */
    const move = (e) => {
        moved = true;
        if (key === 'right') {
            /* Measured from the window's right edge, not from the left. */
            const raw = window.innerWidth - e.clientX;
            const max = Math.max(0, window.innerWidth - chatRect().left - CHAT_MIN);
            /* A panel on the right lives in this space: it keeps 340px and
               doesn't snap away. */
            const holdsPanel = panelOpen() && dcOption('deskpanel') === 'right';
            const min = holdsPanel ? 340 : 0;
            hiding = !holdsPanel && raw < size.hide;
            next = Math.max(min, Math.min(Math.max(min, max), raw));
            if (!frame) frame = window.requestAnimationFrame(paint);
            return;
        }
        if (key === 'left') {
            const raw = e.clientX - railRight();
            const max = Math.max(0, chatRect().right - railRight() - CHAT_MIN);
            /* Close to the list (or the rail): no gap at all. */
            hiding = e.clientX - leftBase < size.hide;
            next = Math.max(0, Math.min(max, raw));
            if (!frame) frame = window.requestAnimationFrame(paint);
            return;
        }
        const gap = window.innerWidth - chatRect().right;
        const left = railRight() + (key === 'panel' && listShown() ? getWidth('list') : 0);
        const raw = e.clientX - left;
        const beside = key === 'list' && panelOpen() ? document.getElementById('dc-deskhead')?.offsetWidth || 0 : 0;
        const max = Math.max(size.min, Math.min(size.max, window.innerWidth - left - beside - gap - CHAT_MIN));
        hiding = key === 'list' && raw < size.hide;
        next = Math.max(size.min, Math.min(max, raw));
        if (!frame) frame = window.requestAnimationFrame(paint);
    };

    const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        handle.classList.remove('active');
        document.body.classList.remove('dc-resizing');
        if (frame) {
            window.cancelAnimationFrame(frame);
            paint();
        }
        if (moved && GAPS.includes(key)) dcWrite(`desk-${key}-w`, String(hiding ? 0 : Math.round(next)));
        else if (moved && !hiding) dcWrite(`desk-${key}-w`, String(Math.round(next)));
    };

    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handle.classList.add('active');
        document.body.classList.add('dc-resizing');
        moved = false;
        hiding = false;
        if (key === 'left') leftBase = columnsRight();
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    });

    handle.addEventListener('dblclick', () => {
        setWidth(key, size.def);
        dcWrite(`desk-${key}-w`, String(size.def));
        if (key === 'list') setListShown(true);
    });
}

/* SillyTavern closes every unpinned drawer on any press outside it. On a
 * phone that is how a panel goes away; here the panel sits next to the
 * chat, and closing it whenever the user clicks into the chat would make
 * side-by-side pointless. So for the length of each press the open drawers
 * wear ST's own "pinned" class, which its closer skips. The class comes off
 * on the next macrotask, before any toggle click (deferred the same way)
 * runs — switching and closing panels work as usual. */
function holdPanelsOpen() {
    const held = [];
    const release = () => {
        for (const drawer of held.splice(0)) drawer.classList.remove('pinnedOpen');
    };
    for (const type of ['mousedown', 'touchstart']) {
        window.addEventListener(type, () => {
            if (!isDesk()) return;
            for (const drawer of document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer:not(.pinnedOpen)')) {
                drawer.classList.add('pinnedOpen');
                held.push(drawer);
            }
            if (held.length) window.setTimeout(release, 0);
        }, { capture: true, passive: true });
    }
}

export function initDesktop() {
    /* "list" after "left": where the two meet (no gap), the list's wins. */
    for (const edge of ['left', 'list', 'panel', 'right']) {
        document.querySelector(`.dc-resizer[data-edge="${edge}"]`)?.remove();
        const handle = document.createElement('div');
        handle.className = 'dc-resizer';
        handle.dataset.edge = edge;
        handle.title = 'Потяни, чтобы изменить ширину. Двойной клик — как было';
        document.body.append(handle);
        wireHandle(handle);
    }
    holdPanelsOpen();
}
