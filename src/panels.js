/* Support code for the restyled SillyTavern panels.
 *
 * Discord's slider has a blurple fill up to the knob. CSS can't read an
 * input's value, so each range input inside a drawer carries --dc-fill
 * (0%…100%), refreshed:
 *   - on input/change (dragging, typing in the number box — ST mirrors the
 *     number into the slider and fires `input`);
 *   - when a drawer opens, and shortly after any change inside one (loading
 *     a preset rewrites every slider at once, not always with an event). */

function fillOf(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max);
    const value = Number(input.value);
    if (!Number.isFinite(max) || max <= min || !Number.isFinite(value)) return '50%';
    const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
    return `${pct.toFixed(2)}%`;
}

function paint(input) {
    const fill = fillOf(input);
    if (input.style.getPropertyValue('--dc-fill') !== fill) input.style.setProperty('--dc-fill', fill);
}

export function paintRanges(root = document.getElementById('top-settings-holder')) {
    root?.querySelectorAll('.drawer-content input[type="range"]').forEach(paint);
}

let laterTimer = 0;
function paintSoon() {
    window.clearTimeout(laterTimer);
    laterTimer = window.setTimeout(() => paintRanges(), 250);
}

export function initPanels() {
    document.addEventListener('input', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement && t.type === 'range' && t.closest('.drawer-content')) paint(t);
        else if (t instanceof Element && t.closest('.drawer-content')) paintSoon();
    }, true);
    document.addEventListener('change', (e) => {
        if (e.target instanceof Element && e.target.closest('.drawer-content')) paintSoon();
    }, true);
    paintRanges();
}
