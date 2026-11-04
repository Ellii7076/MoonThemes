/* Pre-paint: everything here runs at module-eval time so the first frame is
 * already Discord. Settings live in localStorage because SillyTavern's own
 * settings are not loaded yet at this point.
 *
 * The layout lives in a <link> we own, never in custom_css: disabling the
 * extension must leave a working, unmodified SillyTavern behind. */

const DC_VERSION = '0.5.4';
/* Bump on every CSS change — it is the cache-bust key. */
const DC_STYLE_BUILD = '0.5.4';

const DC_BASE = new URL('../', import.meta.url).href;
const DC_PREFIX = 'st-discord:';

function dcRead(key, fallback) {
    try {
        const raw = window.localStorage.getItem(DC_PREFIX + key);
        return raw === null ? fallback : raw;
    } catch {
        return fallback;
    }
}

function dcWrite(key, value) {
    try {
        window.localStorage.setItem(DC_PREFIX + key, value);
    } catch {
        /* storage blocked: the setting just won't persist */
    }
}

/* Only an explicit 'off' disables — a storage failure must not kill the theme. */
const DC_ENABLED = dcRead('enabled', 'on') !== 'off';

/* Every option the settings panel offers: key -> [allowed values], first is
   the default. Each one is mirrored to <html data-dc-*> before first paint so
   CSS alone can follow it. */
/* Themes the extension can switch between. Each has its SillyTavern UI
   theme in themes/ (text, italics, quotes colours ST itself keeps);
   switching installs it and reloads (src/theme.js). `font` overrides the
   font option. `moodtube` is the matching theme for the MoodTube player
   (moodtube/), put on by a button in the settings. */
const DC_SKINS = {
    discord: {
        label: 'Discord',
        theme: 'Discord-Mobile.json',
        themeName: 'Discord Mobile',
        moodtube: 'discord.json',
    },
    /* "Ретро": Windows 98 windows (styles/themes/icq.css, src/icq.js).
       System fonts: Tahoma where it exists, ST's bundled Noto Sans elsewhere. */
    icq: {
        label: 'Ретро',
        theme: 'Retro.json',
        themeName: 'MoonThemes Ретро',
        moodtube: 'retro.json',
        font: 'system',
        family: 'icq',
    },
    /* The same windows in dark grey. */
    'icq-dark': {
        label: 'Ретро тёмная',
        theme: 'Retro-Dark.json',
        themeName: 'MoonThemes Ретро тёмная',
        moodtube: 'retro-dark.json',
        font: 'system',
        family: 'icq',
    },
    /* "Ретро розовая": a pink pixel messenger window — speech bubbles, a
       pixel font, a pastel holographic desktop (family icq,
       styles/themes/icq-skins.css). */
    'icq-pink': {
        label: 'Ретро розовая',
        theme: 'Retro-Pink.json',
        themeName: 'MoonThemes Ретро розовая',
        moodtube: 'retro-pink.json',
        font: 'pixel',
        family: 'icq',
    },
    /* The pink window at night (icq-skins.css, colours only). */
    'icq-pink-dark': {
        label: 'Ретро розовая тёмная',
        theme: 'Retro-Pink-Dark.json',
        themeName: 'MoonThemes Ретро розовая тёмная',
        moodtube: 'retro-pink-dark.json',
        font: 'pixel',
        family: 'icq',
    },
    /* "Монохром": a 1-bit desktop window, cream and black, thick outlines
       and hard shadows, avatars in greyscale. Retro's windows and code
       underneath (family icq), its own look in styles/themes/icq-skins.css. */
    mono: {
        label: 'Монохром',
        theme: 'Mono.json',
        themeName: 'MoonThemes Монохром',
        moodtube: 'mono.json',
        font: 'mono',
        family: 'icq',
    },
    'mono-dark': {
        label: 'Монохром тёмная',
        theme: 'Mono-Dark.json',
        themeName: 'MoonThemes Монохром тёмная',
        moodtube: 'mono-dark.json',
        font: 'mono',
        family: 'icq',
    },
    /* "Bubble": rounded purple Y2K web windows (styles/themes/y2k.css,
       src/y2k.js; internal id y2k). */
    y2k: {
        label: 'Bubble',
        theme: 'Bubble.json',
        themeName: 'MoonThemes Bubble',
        moodtube: 'bubble.json',
        font: 'y2k',
        family: 'y2k',
    },
    'y2k-dark': {
        label: 'Bubble тёмная',
        theme: 'Bubble-Dark.json',
        themeName: 'MoonThemes Bubble тёмная',
        moodtube: 'bubble-dark.json',
        font: 'y2k',
        family: 'y2k',
    },
    /* "Bubble зелёная": a green gadget — metal casings, LCD screens, pink
       LEDs (family y2k, styles/themes/signal.css). The dark one turns it
       round: dark casings and chat, lit lime screens. */
    signal: {
        label: 'Bubble зелёная',
        theme: 'Signal.json',
        themeName: 'MoonThemes Bubble зелёная',
        moodtube: 'signal.json',
        font: 'signal',
        family: 'y2k',
    },
    'signal-dark': {
        label: 'Bubble зелёная тёмная',
        theme: 'Signal-Dark.json',
        themeName: 'MoonThemes Bubble зелёная тёмная',
        moodtube: 'signal-dark.json',
        font: 'signal',
        family: 'y2k',
    },
    /* "Годжо": a film poster at night — black, Gojo in round glasses, thin
       Japanese at the edges, a menu key in the composer for SillyTavern's
       top-bar buttons (family gojo: src/sage.js + src/gojo.js,
       styles/themes/gojo.css, assets/gojo/). */
    gojo: {
        label: 'Годжо',
        theme: 'Gojo.json',
        themeName: 'MoonThemes Годжо',
        moodtube: 'gojo.json',
        font: 'gojo',
        family: 'gojo',
    },
    /* The light one is the same poster by day, on a white manga page. */
    'gojo-dark': {
        label: 'Годжо тёмная',
        theme: 'Gojo-Dark.json',
        themeName: 'MoonThemes Годжо тёмная',
        moodtube: 'gojo-dark.json',
        font: 'gojo',
        family: 'gojo',
    },
    /* "Шалфей" (internal id sage): a dark green profile page —
       folder tabs on the window for the panels, big tinted avatars with
       name and time plates beside them, posts in framed boxes, the chat
       list as a numbered track list (styles/themes/sage.css, src/sage.js). */
    sage: {
        label: 'Шалфей',
        theme: 'Sage.json',
        themeName: 'MoonThemes Шалфей',
        moodtube: 'sage.json',
        font: 'sage',
        family: 'sage',
    },
    'sage-light': {
        label: 'Шалфей светлая',
        theme: 'Sage-Light.json',
        themeName: 'MoonThemes Шалфей светлая',
        moodtube: 'sage-light.json',
        font: 'sage',
        family: 'sage',
    },
    /* "Досье": a secret case file — an open kraft folder, typed sheets,
       sepia photos with paper clips, index tabs down the right edge
       (family dossier: src/sage.js's pieces, styles/themes/dossier.css). */
    dossier: {
        label: 'Досье',
        theme: 'Dossier.json',
        themeName: 'MoonThemes Досье',
        moodtube: 'dossier.json',
        font: 'dossier',
        family: 'dossier',
    },
    /* The same file at night: a black leather folder, smoky sheets, cream
       ink, gold labels (dossier.css, colours only). */
    'dossier-dark': {
        label: 'Досье тёмная',
        theme: 'Dossier-Dark.json',
        themeName: 'MoonThemes Досье тёмная',
        moodtube: 'dossier-dark.json',
        font: 'dossier',
        family: 'dossier',
    },
};

const DC_OPTIONS = {
    skin: Object.keys(DC_SKINS),
    motion: ['on', 'off'],
    layout: ['wide', 'classic'],      // wide = text under the avatar row, edge to edge
    font: ['y2k', 'discord'],          // y2k = Comfortaa / Exo 2 / Tektur
    italic: ['straight', 'slanted'],
    fullpanels: ['on', 'off'],         // ST panels take the whole screen
    startpage: ['on', 'off'],          // Start Page notes, tags and pins in the list
    desktop: ['auto', 'on', 'off'],    // auto = desktop layout on a wide window
    desklist: ['keep', 'auto'],        // desktop chat list: always open / collapse on opening a chat
    deskpanel: ['right', 'left'],      // desktop panels: right of the chat / between list and chat
    welcome: ['discord', 'classic'],   // no chat open: our home page / ST's welcome screen
    catch: ['off', 'on'],              // the catcher of floating buttons
    catchside: ['right', 'left'],      // the edge it sits on
    catchhide: ['off', 'on'],          // tuck the tray away after pressing a button
    catchtap: ['off', 'on'],           // tuck the tray away on a tap anywhere else
    y2ktabs: ['on', 'off'],            // Bubble: open chats as tabs over the chat
    y2kdock: ['bottom', 'side', 'top'], // Bubble: the round-button dock — under the field, slide-out on the left, on top
};

/* Wide enough for list + panel + chat side by side. */
const DC_DESK_QUERY = window.matchMedia('(min-width: 1000px)');

function dcOption(key) {
    const allowed = DC_OPTIONS[key];
    const value = dcRead(key, allowed[0]);
    return allowed.includes(value) ? value : allowed[0];
}

const dcRoot = document.documentElement;
dcRoot.dataset.dcEnabled = DC_ENABLED ? 'on' : 'off';

function dcApplyOptions() {
    for (const key of Object.keys(DC_OPTIONS)) {
        dcRoot.dataset[`dc${key[0].toUpperCase()}${key.slice(1)}`] = dcOption(key);
    }
    /* Variants of one theme (light/dark) share its stylesheet and code. */
    const skin = dcOption('skin');
    dcRoot.dataset.dcFamily = DC_SKINS[skin].family || skin;
}
dcApplyOptions();

/* Desktop layout: on/off, plus the column sizes the user dragged to. They
   are set on <html> before first paint so the columns don't jump. */
function dcApplyDesk() {
    const mode = dcOption('desktop');
    dcRoot.dataset.dcDesk = mode === 'on' || (mode === 'auto' && DC_DESK_QUERY.matches) ? 'on' : 'off';
}

function isDesk() {
    return dcRoot.dataset.dcDesk === 'on';
}

dcApplyDesk();
DC_DESK_QUERY.addEventListener('change', () => {
    dcApplyDesk();
    window.dispatchEvent(new CustomEvent('dc-option', { detail: { key: 'desk', value: dcRoot.dataset.dcDesk } }));
});
dcRoot.dataset.dcList = dcRead('desk-list', 'shown') === 'hidden' ? 'hidden' : 'shown';
for (const [key, fallback] of [['list-w', 300], ['panel-w', 460], ['right-w', 0], ['left-w', 0]]) {
    const value = Number(dcRead(`desk-${key}`, fallback));
    dcRoot.style.setProperty(`--dc-${key}`, `${Number.isFinite(value) && value >= 0 ? value : fallback}px`);
}

const DC_FONTS = {
    y2k: 'https://fonts.googleapis.com/css2?family=Comfortaa:wght@500;600;700&family=Exo+2:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Tektur:wght@400;500;600;700&display=swap',
    discord: 'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
    /* Theme-only sets (DC_SKINS[...].font); all have Cyrillic. */
    mono: 'https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
    pixel: 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap',
    gojo: 'https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;600&family=Montserrat:wght@400;500;600;700&family=Noto+Sans:wght@400;600;700&family=Noto+Sans+JP:wght@300;500&display=swap',
    dossier: 'https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Anonymous+Pro:ital,wght@0,400;0,700;1,400&display=swap',
    sage: 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&family=PT+Mono&display=swap',
    signal: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Tektur:wght@400;500;600;700&family=Exo+2:ital,wght@0,400;0,500;0,600;1,400&display=swap',
};

function dcInstallFont() {
    let font = document.getElementById('st-discord-font');
    if (!font) {
        font = document.createElement('link');
        font.id = 'st-discord-font';
        font.rel = 'stylesheet';
        document.head.append(font);
    }
    const own = DC_SKINS[dcOption('skin')].font;
    /* A theme names a font set (DC_FONTS key), 'system', or brings a URL. */
    const url = own === 'system' ? '' : DC_FONTS[own] || own || DC_FONTS[dcOption('font')];
    if (url) font.href = url;
    else font.removeAttribute('href');
}

function dcSetOption(key, value) {
    dcWrite(key, value);
    dcApplyOptions();
    if (key === 'desktop') dcApplyDesk();
    if (key === 'font' || key === 'skin') dcInstallFont();
    window.dispatchEvent(new CustomEvent('dc-option', { detail: { key, value } }));
}

function dcInstallStyle() {
    const url = new URL('styles/discord.css', DC_BASE);
    url.searchParams.set('v', DC_STYLE_BUILD);
    let link = document.getElementById('st-discord-style');
    if (!link) {
        link = document.createElement('link');
        link.id = 'st-discord-style';
        link.rel = 'stylesheet';
        document.head.append(link);
    }
    link.href = url.href;
    dcInstallFont();
}

if (DC_ENABLED) {
    dcInstallStyle();
    document.body?.classList.add('dc-on');
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => document.body.classList.add('dc-on'), { once: true });
    }
}

function getContext() {
    const bridge = typeof SillyTavern !== 'undefined' ? SillyTavern : window.SillyTavern;
    if (typeof bridge?.getContext === 'function') return bridge.getContext();
    return null;
}

export { DC_VERSION, DC_BASE, DC_ENABLED, DC_OPTIONS, DC_SKINS, dcRead, dcWrite, dcOption, dcSetOption, dcRoot, getContext, isDesk };
