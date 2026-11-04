/* Theme picker: a window with a drawn miniature of every theme. A tap on a
 * card switches to it (switchSkin installs its ST theme and reloads).
 *
 * The miniatures are plain HTML; each family draws them its own way in
 * styles/gallery.css, and each theme only fills the colours below. Loaded
 * from the settings panel, so it works with the extension switched off too. */

import { DC_SKINS, DC_VERSION, dcOption } from './boot.js?v=0.5.4';

const GROUPS = [
    { title: 'Discord', ids: ['discord'] },
    { title: 'Ретро', ids: ['icq', 'icq-dark', 'icq-pink', 'icq-pink-dark'] },
    { title: 'Монохром', ids: ['mono', 'mono-dark'] },
    { title: 'Bubble', ids: ['y2k', 'y2k-dark', 'signal', 'signal-dark'] },
    { title: 'Шалфей', ids: ['sage', 'sage-light'] },
    { title: 'Досье', ids: ['dossier', 'dossier-dark'] },
    { title: 'Годжо', ids: ['gojo', 'gojo-dark'] },
];

/* Per-theme colours of the miniature (CSS custom properties on the card). */
const LOOKS = {
    discord: {
        kind: 'discord',
        page: '#121214', win: '#1a1a1e', top: '#121214', chat: '#1a1a1e', ink: '#f2f3f5', line: '#4e5058',
        name: '#f2f3f5', me: '#c9cdfb', field: '#242429', send: '#5865f2', accent: '#5865f2',
    },
    icq: {
        kind: 'retro',
        page: '#6f6f73', win: '#c0c0c0', top: 'linear-gradient(90deg, #000080, #1084d0)', chat: '#ffffff', ink: '#000000', line: '#9a9a9a',
        name: '#c00000', me: '#0000c0', field: '#ffffff', send: '#c0c0c0', accent: '#000080',
        light: '#ffffff', shade: '#808080', dark: '#0a0a0a',
    },
    'icq-dark': {
        kind: 'retro',
        page: '#0e0e10', win: '#2e2e32', top: 'linear-gradient(90deg, #13235c, #2f5aa8)', chat: '#18181b', ink: '#e6e6e6', line: '#55555c',
        name: '#ff7a6e', me: '#86aaff', field: '#18181b', send: '#2e2e32', accent: '#23408f',
        light: '#5a5a62', shade: '#17171a', dark: '#000000',
    },
    'icq-pink': {
        kind: 'pink',
        page: 'linear-gradient(135deg, #d9ccf2, #f6d3e6 50%, #c9e6f5)', win: '#f6d3e6', top: 'linear-gradient(90deg, #3456c4, #7da2f2)', chat: '#fffafd',
        ink: '#3b2b5c', line: '#c9b4d6', name: '#3b62c9', me: '#d94b92', field: '#fffafd', send: '#f6d3e6', accent: '#6f8ff0',
        light: '#ffffff', shade: '#c48ab0', dark: '#6b3d63', bubble: '#fdeef6', bubbleMe: '#fcdcec',
    },
    'icq-pink-dark': {
        kind: 'pink',
        page: 'linear-gradient(135deg, #2a1533, #1b1f45 50%, #142636)', win: '#3a2440', top: 'linear-gradient(90deg, #2b3f9e, #5b7fe0)', chat: '#24152a',
        ink: '#f6dcef', line: '#6c5272', name: '#d2acf2', me: '#ff8cc6', field: '#24152a', send: '#3a2440', accent: '#5b78e0',
        light: '#66426f', shade: '#1c1020', dark: '#0c0610', bubble: '#33213d', bubbleMe: '#4a1e3b',
    },
    mono: {
        kind: 'mono',
        page: '#d8d2bf', win: '#f3eedd', top: '#f3eedd', chat: '#faf6ea', ink: '#1d1d1b', line: '#b9b3a2',
        name: '#1d1d1b', me: '#1d1d1b', field: '#faf6ea', send: '#1d1d1b', accent: '#1d1d1b',
    },
    'mono-dark': {
        kind: 'mono',
        page: '#0f0f0e', win: '#1d1d1b', top: '#1d1d1b', chat: '#151514', ink: '#efe9d6', line: '#55524a',
        name: '#efe9d6', me: '#efe9d6', field: '#151514', send: '#efe9d6', accent: '#efe9d6',
    },
    y2k: {
        kind: 'bubble',
        page: 'linear-gradient(160deg, #b9b1f3 0%, #d6d0fa 45%, #a9b8f5 100%)', win: '#f1eeff', top: 'linear-gradient(180deg, #b6a6ff, #8a73ee)',
        chat: '#f1eeff', ink: '#3b2f8c', line: '#c6bcf6', name: 'linear-gradient(90deg, #6f5ce0, #9a86f6)', me: 'linear-gradient(90deg, #b555c4, #dc86e0)',
        field: '#ffffff', send: 'radial-gradient(circle at 50% 70%, #f2a6ef, #c45fc9 70%)', accent: '#7d6be6', card: '#ffffff', edge: '#7d6be6',
        orb: 'radial-gradient(circle at 50% 70%, #c7b8ff, #8a73ee 70%)',
    },
    'y2k-dark': {
        kind: 'bubble',
        page: 'linear-gradient(160deg, #0f0c24 0%, #1b1640 50%, #121a3c 100%)', win: '#1c1838', top: 'linear-gradient(180deg, #8f7cf0, #5e4bcf)',
        chat: '#1c1838', ink: '#ece8ff', line: '#3f367f', name: 'linear-gradient(90deg, #6f5ce0, #9a86f6)', me: 'linear-gradient(90deg, #b555c4, #dc86e0)',
        field: '#171330', send: 'radial-gradient(circle at 50% 70%, #f2a6ef, #c45fc9 70%)', accent: '#8f7cf0', card: '#241f48', edge: '#6f5fd6',
        orb: 'radial-gradient(circle at 50% 70%, #c7b8ff, #8a73ee 70%)',
    },
    signal: {
        kind: 'signal',
        page: 'linear-gradient(#222a36 1px, transparent 1px) 0 0 / 9px 9px, linear-gradient(90deg, #222a36 1px, transparent 1px) 0 0 / 9px 9px, #141922',
        win: '#e3e7d6', top: 'linear-gradient(180deg, #2e4a27, #1d3219)', chat: '#e3e7d6', ink: '#1e291b', line: '#bcc5ae',
        name: 'linear-gradient(90deg, #1d3219, #3d6b2f)', me: 'linear-gradient(90deg, #c2236f, #ff5aa5)', field: 'linear-gradient(180deg, #2e4a27, #1d3219)',
        send: 'radial-gradient(circle at 50% 45%, #ff9ccb, #ff3d97 55%, #b3125e)', accent: '#3d6b2f', card: '#f1f3e8', edge: '#7e8a74',
        orb: 'linear-gradient(180deg, #f4f6ee, #d5dbc9 55%, #b9c1ad)', lcd: '#c8f59a',
    },
    'signal-dark': {
        kind: 'signal',
        page: 'linear-gradient(#1a2118 1px, transparent 1px) 0 0 / 9px 9px, linear-gradient(90deg, #1a2118 1px, transparent 1px) 0 0 / 9px 9px, #0b0f0b',
        win: '#161d16', top: 'linear-gradient(180deg, #d6ffa8, #a6dc6e)', chat: '#161d16', ink: '#e6f5d6', line: '#2f3b2b',
        name: 'linear-gradient(90deg, #a6dc6e, #d6ffa8)', me: 'linear-gradient(90deg, #c2236f, #ff5aa5)', field: 'linear-gradient(180deg, #d6ffa8, #a6dc6e)',
        send: 'radial-gradient(circle at 50% 45%, #ff9ccb, #ff3d97 55%, #b3125e)', accent: '#a6dc6e', card: '#1c251b', edge: '#5d7052',
        orb: 'linear-gradient(180deg, #4b5546, #363e32 55%, #272d24)', lcd: '#142410',
    },
    sage: {
        kind: 'sage',
        page: 'radial-gradient(ellipse 70% 50% at 20% 15%, rgba(120, 160, 110, 0.25), transparent 70%), #070907',
        win: '#111611', top: '#0b0e0b', chat: '#111611', ink: '#e6ece2', line: '#3e4d3b',
        name: '#e6ece2', me: '#e6ece2', field: '#060806', send: '#8ba886', accent: '#8fae89',
        frame: '#7f9c7a', box: '#060806', boxline: '#c9d3c5', paper: '#d9dbd5',
    },
    dossier: {
        kind: 'dossier',
        page: 'linear-gradient(160deg, #7d5841, #5d3f2b)', win: '#efe6c3', top: '#cfae84', chat: '#efe6c3', ink: '#221a12', line: '#cdbf93',
        name: '#221a12', me: '#221a12', field: 'transparent', send: '#b3202a', accent: '#b8a27e',
        box: '#efe6c3', paper: '#dcc597', red: '#b3202a',
    },
    gojo: {
        kind: 'gojo',
        page: '#ffffff', win: '#ffffff', top: '#111111', chat: 'transparent', ink: '#1c1c1c', line: '#555555',
        name: '#0b0b0b', me: '#555555', field: '#f2f2f2', send: '#111111', accent: '#5f82bd',
        art: `url('${new URL('../assets/gojo/cut/figure-light.webp', import.meta.url).href}')`,
    },
    'gojo-dark': {
        kind: 'gojo',
        page: '#050505', win: '#050505', top: '#f4f4f4', chat: 'transparent', ink: '#f4f4f4', line: '#bdbdbd',
        name: '#f4f4f4', me: '#f4f4f4', field: '#111111', send: '#19a6ee', accent: '#f4f4f4',
        art: `url('${new URL('../assets/gojo/cut/figure.webp', import.meta.url).href}')`,
    },
    'dossier-dark': {
        kind: 'dossier',
        page: 'linear-gradient(160deg, #2b211a, #15110d)', win: '#221d18', top: '#4a3a2c', chat: '#221d18', ink: '#efe4cc', line: '#4a3f33',
        name: '#efe4cc', me: '#efe4cc', field: 'transparent', send: '#d23a3a', accent: '#5a4c3c',
        box: '#221d18', paper: '#3a2f25', red: '#d23a3a',
        stack1: '#1b1713', stack2: '#16130f', photo: '#d9ceb2', avph: '#6e604c', tab: '#4a3a2c', ln: '#a8987c',
    },
    'sage-light': {
        kind: 'sage',
        page: 'radial-gradient(ellipse 70% 50% at 20% 15%, rgba(139, 168, 134, 0.45), transparent 70%), #dfe4d8',
        win: '#f4f5ef', top: '#e4e8dd', chat: '#f4f5ef', ink: '#141c12', line: '#c4cdbc',
        name: '#141c12', me: '#141c12', field: '#ffffff', send: '#8ba886', accent: '#9dbb97',
        frame: '#5f7a5a', box: '#ffffff', boxline: '#2c3729', paper: '#27311f',
    },
};

const MESSAGE = (me) => `
    <div class="dcg-msg${me ? ' dcg-me' : ''}">
        <i class="dcg-av"></i>
        <div class="dcg-body"><b class="dcg-name"></b><i class="dcg-line"></i><i class="dcg-line dcg-short"></i></div>
    </div>`;

/** The miniature of one theme. */
export function themeMock(id) {
    const look = LOOKS[id] || LOOKS.discord;
    const vars = Object.entries(look).filter(([k]) => k !== 'kind').map(([k, v]) => `--g-${k}: ${v}`).join('; ');
    return `
        <div class="dcg-mock dcg-${look.kind}" style="${vars}">
            <div class="dcg-win">
                <div class="dcg-top"><i></i><i></i><i></i></div>
                <div class="dcg-chat">${MESSAGE(false)}${MESSAGE(true)}</div>
                <div class="dcg-form"><i class="dcg-field"></i><i class="dcg-send"></i></div>
            </div>
            <div class="dcg-rail"><i></i><i></i><i></i></div>
        </div>`;
}

function ensureStyle() {
    if (document.getElementById('dc-gallery-style')) return;
    const link = document.createElement('link');
    link.id = 'dc-gallery-style';
    link.rel = 'stylesheet';
    link.href = new URL(`../styles/gallery.css?v=${DC_VERSION}`, import.meta.url).href;
    document.head.append(link);
}

/* The style sheet loads with the settings block, so the button's own
   miniature is drawn from the start. */
ensureStyle();

let open = null;

export function closeThemeGallery() {
    if (!open) return;
    open.remove();
    document.removeEventListener('keydown', onKey, true);
    open = null;
}

function onKey(event) {
    if (event.key === 'Escape') {
        event.stopPropagation();
        closeThemeGallery();
    }
}

export function openThemeGallery() {
    ensureStyle();
    closeThemeGallery();
    const current = dcOption('skin');
    const card = (id) => `
        <button type="button" class="dcg-card${id === current ? ' dcg-current' : ''}" data-skin="${id}">
            ${themeMock(id)}
            <span class="dcg-label">${DC_SKINS[id].label}</span>
            ${id === current ? '<span class="dcg-badge"><i class="fa-solid fa-check"></i></span>' : ''}
        </button>`;
    const groups = GROUPS.map((g) => ({ ...g, ids: g.ids.filter((id) => DC_SKINS[id]) })).filter((g) => g.ids.length);

    const root = document.createElement('div');
    root.id = 'dc-gallery';
    root.innerHTML = `
        <div class="dcg-dialog" role="dialog" aria-modal="true" aria-label="Выбор темы">
            <div class="dcg-head">
                <b>Выбери тему</b>
                <button type="button" class="dcg-close" title="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="dcg-scroll">
                ${groups.map((g) => `
                    <div class="dcg-group">${g.title}</div>
                    <div class="dcg-grid">${g.ids.map(card).join('')}</div>`).join('')}
            </div>
            <small class="dcg-hint">Тема ставится сразу, страница перезагрузится.</small>
        </div>`;
    /* ST closes an unpinned drawer on any press outside it (the Extensions
       panel this was opened from) — a swipe through the themes is one. */
    for (const type of ['mousedown', 'touchstart']) {
        root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    document.body.append(root);
    open = root;
    document.addEventListener('keydown', onKey, true);

    root.addEventListener('click', async (event) => {
        if (event.target === root || event.target.closest('.dcg-close')) {
            closeThemeGallery();
            return;
        }
        const button = event.target.closest('.dcg-card');
        if (!button || root.classList.contains('dcg-busy')) return;
        const id = button.dataset.skin;
        if (id === current) {
            closeThemeGallery();
            return;
        }
        root.classList.add('dcg-busy');
        button.classList.add('dcg-picked');
        window.toastr?.info('Меняю тему, страница сейчас перезагрузится…');
        const { switchSkin } = await import(`./theme.js?v=${DC_VERSION}`);
        await switchSkin(id);
    });
}
