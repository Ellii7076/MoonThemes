/* The single-character screen as a Discord profile, like the persona one.
 *
 * Everything on that screen is SillyTavern's own (avatar picker, buttons,
 * tags, name field when creating) and is only re-laid out in CSS. Two
 * things CSS can't do:
 *
 *   - use the avatar as a banner: an empty .dc-char-banner whose
 *     background follows #avatar_load_preview (ST swaps that src when
 *     another character opens or a new avatar is picked);
 *   - show the name of an existing character: ST hides the name field
 *     then, so .dc-char-name mirrors #character_name_pole's value.
 *
 * Both are added to #avatar-and-name-block and never touch ST's nodes. */

let banner = null;
let nameEl = null;
let lastSrc = '';
let version = 0;
/* ST "reloads" an avatar by setting the same src again (src = '', src = url
   in one go) — the value ends up unchanged, but any src write means a fresh
   picture may be behind it. */
let bump = false;

function sync() {
    const block = document.getElementById('avatar-and-name-block');
    const img = document.getElementById('avatar_load_preview');
    if (!block || !img) return;
    if (!banner || !banner.isConnected) {
        banner = document.createElement('div');
        banner.className = 'dc-char-banner';
        block.prepend(banner);
    }
    if (!nameEl || !nameEl.isConnected) {
        nameEl = document.createElement('div');
        nameEl.className = 'dc-char-name';
        block.append(nameEl);
    }
    const src = img.getAttribute('src') || '';
    /* After a new picture is saved ST points the preview back at the same
       thumbnail URL; a fresh query makes the banner fetch the new image
       instead of reusing the old one from memory. */
    /* Only a rewrite of the same src means "the picture behind it changed";
       a different src (another character) can use the cache as usual. */
    if (bump && src === lastSrc) version = Date.now();
    bump = false;
    lastSrc = src;
    const url = !src || src.startsWith('data:') || src.startsWith('blob:')
        ? src
        : version ? `${src}${src.includes('?') ? '&' : '?'}dcv=${version}` : src;
    const value = url ? `url("${url.replace(/"/g, '%22')}")` : '';
    if (banner.style.backgroundImage !== value) banner.style.backgroundImage = value;
    const name = /** @type {HTMLInputElement|null} */ (document.getElementById('character_name_pole'))?.value || '';
    if (nameEl.textContent !== name) nameEl.textContent = name;
}

/* ST fills the form in several steps; catch the last one too. */
function syncSoon() {
    sync();
    window.setTimeout(sync, 300);
}

export function initCharacterPanel() {
    sync();
    const img = document.getElementById('avatar_load_preview');
    if (img) {
        new MutationObserver(() => {
            bump = true;
            syncSoon();
        }).observe(img, { attributes: true, attributeFilter: ['src'] });
    }
    const block = document.getElementById('rm_ch_create_block');
    if (block) new MutationObserver(syncSoon).observe(block, { attributes: true, attributeFilter: ['style'] });
    document.getElementById('character_name_pole')?.addEventListener('input', sync);
}
