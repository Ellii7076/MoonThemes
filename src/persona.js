/* The Personas panel as a Discord profile.
 *
 * SillyTavern's panel has no picture of the current persona outside the
 * list, so this adds one card on top of "Current Persona": a banner made
 * from the avatar, the avatar itself in a ring with a status dot, the name
 * and a @handle (the avatar file name). Nothing of SillyTavern's is moved
 * or replaced; the card only mirrors what ST already shows, and tapping
 * the avatar runs ST's own "change image" button.
 *
 * Kept fresh from PERSONA_CHANGED / SETTINGS_UPDATED and from watching the
 * name ST writes into #your_name (rename, sync). */

import { getContext } from './boot.js?v=0.5.3';
import { user_avatar } from '../../../../personas.js';

let hero = null;
/* Replacing a persona's picture keeps its file name, so the URL doesn't
   change and the browser keeps showing the old decoded image. The stamp
   changes only after an actual upload (ST's file input fired and the
   list was re-rendered), so normal switching hits the cache. */
let stamp = 0;
let uploadPending = false;

/* The direct file URL, not /thumbnail: extensions like AvatarDeblur rewrite
   /thumbnail links to the original file and drop any query on the way,
   which would lose the cache-busting stamp. Without a stamp this is the
   same URL those extensions produce, so the browser cache is shared. */
export function personaAvatarUrl() {
    if (!user_avatar) return '';
    const base = `/User%20Avatars/${encodeURIComponent(user_avatar)}`;
    return stamp ? `${base}?dcv=${stamp}` : base;
}

function avatarUrl() {
    return personaAvatarUrl();
}

function handle() {
    return user_avatar ? `@${user_avatar.replace(/\.[^.]+$/, '')}` : '';
}

function build() {
    const host = document.querySelector('#PersonaManagement .persona_management_current_persona');
    if (!host) return null;
    const card = document.createElement('div');
    card.className = 'dc-persona-hero';
    card.innerHTML = `
        <div class="dc-persona-banner"></div>
        <button type="button" class="dc-persona-avatar" title="Сменить аватар">
            <img alt="">
            <span class="dc-persona-status"></span>
            <span class="dc-persona-edit fa-solid fa-pen"></span>
        </button>
        <div class="dc-persona-names">
            <div class="dc-persona-name"></div>
            <div class="dc-persona-handle"></div>
        </div>`;
    card.querySelector('.dc-persona-avatar').addEventListener('click', () => {
        document.getElementById('persona_set_image_button')?.click();
    });
    host.prepend(card);
    return card;
}

export function updatePersonaHero() {
    if (!hero || !hero.isConnected) hero = build();
    if (!hero) return;
    const ctx = getContext();
    const url = avatarUrl();
    const img = hero.querySelector('.dc-persona-avatar img');
    if (url && img.getAttribute('src') !== url) {
        img.src = url;
        hero.querySelector('.dc-persona-banner').style.backgroundImage = `url("${url}")`;
    }
    const name = document.getElementById('your_name')?.textContent?.trim() || ctx?.name1 || '';
    hero.querySelector('.dc-persona-name').textContent = name;
    hero.querySelector('.dc-persona-handle').textContent = handle();
    const online = ctx?.onlineStatus && ctx.onlineStatus !== 'no_connection';
    hero.querySelector('.dc-persona-status').classList.toggle('dc-online', Boolean(online));
}

export function initPersonaPanel() {
    updatePersonaHero();
    const ctx = getContext();
    const types = ctx?.eventTypes || {};
    for (const type of [types.PERSONA_CHANGED, types.SETTINGS_UPDATED, types.ONLINE_STATUS_CHANGED, types.APP_READY]) {
        if (type) ctx.eventSource.on(type, () => updatePersonaHero());
    }
    const nameEl = document.getElementById('your_name');
    if (nameEl) new MutationObserver(() => updatePersonaHero()).observe(nameEl, { childList: true, characterData: true, subtree: true });
    /* A picture upload (new image, or "set image" on the current persona)
       goes through this input; ST re-renders the list once it's saved. */
    document.getElementById('avatar_upload_file')?.addEventListener('change', () => {
        uploadPending = true;
    });
    const list = document.getElementById('user_avatar_block');
    if (list) {
        let timer = 0;
        new MutationObserver(() => {
            if (!uploadPending) return;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                uploadPending = false;
                stamp = Date.now();
                updatePersonaHero();
            }, 300);
        }).observe(list, { childList: true });
    }
}

