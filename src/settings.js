/* The extension's block in the Extensions panel. Always loaded, so the theme
 * can be switched back on after being disabled. */

import { DC_ENABLED, DC_SKINS, DC_VERSION, dcOption, dcSetOption, dcWrite } from './boot.js?v=0.5.3';
import { openThemeGallery, themeMock } from './gallery.js?v=0.5.3';
import { HEADER_SLOTS, ICQ_SLOTS, actionCatalog, slotAction } from './actions.js?v=0.5.3';
import { bindCatchList } from './catcher.js?v=0.5.3';

const CHECKS = [
    ['motion', 'Анимации'],
    ['startpage', 'Заметки, теги и закрепы из Start Page в списке чатов'],
];

const SELECTS = [
    ['desktop', 'Версия для ПК', { auto: 'Авто: на широком окне', on: 'Всегда', off: 'Никогда (как на телефоне)' }],
    ['desklist', 'Список чатов на ПК', { keep: 'Всегда открыт', auto: 'Сворачивать, когда открыт чат' }],
    ['deskpanel', 'Разделы на ПК', { right: 'Справа от чата', left: 'Между списком и чатом' }],
    ['welcome', 'Стартовая страница', { discord: 'Кастом главная', classic: 'Классическая от таверны' }],
];

function render() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host || document.getElementById('dc-settings')) return;

    const checks = CHECKS.map(([key, label]) => `
        <label class="checkbox_label">
            <input type="checkbox" data-dc-key="${key}" ${dcOption(key) === 'on' ? 'checked' : ''}>
            <span>${label}</span>
        </label>`).join('');

    const selects = SELECTS.map(([key, label, options]) => `
        <label class="dc-set-row">
            <span>${label}</span>
            <select class="text_pole" data-dc-key="${key}">
                ${Object.entries(options).map(([value, text]) => `<option value="${value}" ${dcOption(key) === value ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
        </label>`).join('');

    const block = document.createElement('div');
    block.id = 'dc-settings';
    block.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>MoonThemes <small style="opacity:.6">v${DC_VERSION}</small></b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="dc-enabled" ${DC_ENABLED ? 'checked' : ''}>
                    <span>Включить MoonThemes (перезагрузит страницу)</span>
                </label>
                <button type="button" class="menu_button dc-skin-pick" id="dc-skin-pick" title="Выбрать тему">
                    ${themeMock(dcOption('skin'))}
                    <span class="dc-skin-text">
                        <small><i class="fa-solid fa-palette"></i> Тема</small>
                        <b>${DC_SKINS[dcOption('skin')]?.label || ''}</b>
                        <small>Нажми, чтобы выбрать другую</small>
                    </span>
                </button>
                <small class="dc-set-hint">Смена темы ставит её файл темы таверны и перезагружает страницу.</small>
                ${checks}
                ${selects}
                <small class="dc-set-hint">На ПК границы колонок тянутся мышкой, и у чата тоже — с обеих сторон (левая граница чата двигает только чат, список не открывает). Двойной клик по границе возвращает как было. Список чатов сворачивается кнопкой в шапке чата, иконкой «Сообщения» или если утянуть его границу влево.</small>
                <div class="dc-set-title">Ловец плавающих кнопок</div>
                <label class="checkbox_label">
                    <input type="checkbox" data-dc-key="catch" ${dcOption('catch') === 'on' ? 'checked' : ''}>
                    <span>Собирать плавающие кнопки за язычок на краю экрана</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" data-dc-key="catchhide" ${dcOption('catchhide') === 'on' ? 'checked' : ''}>
                    <span>Скрывать после нажатия на кнопку</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" data-dc-key="catchtap" ${dcOption('catchtap') === 'on' ? 'checked' : ''}>
                    <span>Скрывать при нажатии на экран</span>
                </label>
                <label class="dc-set-row">
                    <span>Край экрана</span>
                    <select class="text_pole" data-dc-key="catchside">
                        <option value="right" ${dcOption('catchside') === 'right' ? 'selected' : ''}>Справа</option>
                        <option value="left" ${dcOption('catchside') === 'left' ? 'selected' : ''}>Слева</option>
                    </select>
                </label>
                <div id="dc-catch-list"></div>
                <small class="dc-set-hint">Язычок двигается вверх и вниз, если потянуть его вдоль края. Галочка в списке решает, ловить ли кнопку, стрелки меняют порядок.</small>
                <div class="dc-set-title">Кнопки в шапке чата</div>
                ${Object.entries(HEADER_SLOTS).map(([slot, info]) => `
                    <label class="dc-set-row">
                        <span><i class="${info.icon}"></i> ${info.label}</span>
                        <select class="text_pole" data-dc-slot="${slot}"></select>
                    </label>`).join("")}
                <div class="dc-set-icq" ${DC_SKINS[dcOption('skin')]?.family === 'icq' ? '' : 'hidden'}>
                    <div class="dc-set-title">Панель кнопок в окне сообщений</div>
                    ${Object.entries(ICQ_SLOTS).map(([slot, info]) => `
                        <label class="dc-set-row">
                            <span><i class="${info.icon}"></i> ${info.label}</span>
                            <select class="text_pole" data-dc-slot="${slot}"></select>
                        </label>`).join('')}
                </div>
                <div class="dc-set-y2k" ${DC_SKINS[dcOption('skin')]?.family === 'y2k' ? '' : 'hidden'}>
                    <div class="dc-set-title">Bubble</div>
                    <label class="checkbox_label">
                        <input type="checkbox" data-dc-key="y2ktabs" ${dcOption('y2ktabs') === 'on' ? 'checked' : ''}>
                        <span>Вкладки чатов над окном сообщений</span>
                    </label>
                    <label class="dc-set-row">
                        <span>Круглые кнопки разделов</span>
                        <select class="text_pole" data-dc-key="y2kdock">
                            <option value="bottom" ${dcOption('y2kdock') === 'bottom' ? 'selected' : ''}>Внизу, под полем ввода</option>
                            <option value="side" ${dcOption('y2kdock') === 'side' ? 'selected' : ''}>Выдвижная панель слева</option>
                            <option value="top" ${dcOption('y2kdock') === 'top' ? 'selected' : ''}>Наверху, под шапкой</option>
                        </select>
                    </label>
                </div>
                <div class="dc-set-theme">
                    <div class="menu_button menu_button_icon" id="dc-install-theme">
                        <i class="fa-solid fa-palette"></i>
                        <span>Поставить тему таверны заново</span>
                    </div>
                    <small>Цвета курсива, цитат и ссылок + сброс чужого CSS. Старая тема останется в списке тем, вернуть можно там же.</small>
                    <div class="menu_button menu_button_icon" id="dc-moodtube-theme">
                        <i class="fa-solid fa-music"></i>
                        <span>Тема для MoodTube</span>
                    </div>
                    <small>Плеер MoodTube в стиле текущей темы. Его прежняя своя тема заменится; стандартные темы остаются в настройках MoodTube.</small>
                </div>
            </div>
        </div>`;
    host.append(block);

    block.querySelector('#dc-enabled').addEventListener('change', (event) => {
        dcWrite('enabled', event.target.checked ? 'on' : 'off');
        window.location.reload();
    });
    for (const input of block.querySelectorAll('input[data-dc-key]')) {
        input.addEventListener('change', () => dcSetOption(input.dataset.dcKey, input.checked ? 'on' : 'off'));
    }
    for (const select of block.querySelectorAll('select[data-dc-key]')) {
        select.addEventListener('change', () => dcSetOption(select.dataset.dcKey, select.value));
    }

    /* The catalogue is read from the live DOM (other extensions add wand items
       late), so the list is rebuilt every time a select is opened. */
    for (const select of block.querySelectorAll("select[data-dc-slot]")) {
        fillSlotSelect(select);
        for (const type of ["focus", "pointerdown"]) {
            select.addEventListener(type, () => fillSlotSelect(select));
        }
        select.addEventListener("change", () => dcSetOption(`hdr-${select.dataset.dcSlot}`, select.value));
    }

    /* The font choice belongs to the Discord skin; other skins bring theirs. */
    const fontRow = block.querySelector('select[data-dc-key="font"]')?.closest('.dc-set-row');
    if (fontRow) fontRow.hidden = Boolean(DC_SKINS[dcOption('skin')]?.font);

    bindCatchList(block.querySelector('#dc-catch-list'));

    block.querySelector('#dc-skin-pick').addEventListener('click', openThemeGallery);

    block.querySelector('#dc-moodtube-theme').addEventListener('click', onMoodTubeTheme);

    block.querySelector('#dc-install-theme').addEventListener('click', async () => {
        try {
            const { installTheme } = await import(`./theme.js?v=${DC_VERSION}`);
            await installTheme();
            window.toastr?.success(`Тема «${DC_SKINS[dcOption('skin')].themeName}» включена`);
        } catch (error) {
            console.error('[Discord Mobile] theme install failed', error);
            window.toastr?.error('Не получилось поставить тему, подробности в консоли');
        }
    });
}

async function onMoodTubeTheme() {
    try {
        const { installMoodTubeTheme, moodTubeFound } = await import(`./theme.js?v=${DC_VERSION}`);
        if (!moodTubeFound()) {
            window.toastr?.warning('MoodTube не найден — он установлен и включён?');
            return;
        }
        const name = await installMoodTubeTheme();
        window.toastr?.success(`MoodTube: тема «${name}» включена`);
    } catch (error) {
        console.error('[MoonThemes] MoodTube theme failed', error);
        window.toastr?.error('Не получилось поставить тему MoodTube, подробности в консоли');
    }
}

function fillSlotSelect(select) {
    const current = slotAction(select.dataset.dcSlot);
    const escape = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const groups = actionCatalog();
    const known = groups.some((g) => g.items.some((i) => i.key === current));
    select.innerHTML = groups.map((g) => `<optgroup label="${escape(g.group)}">${g.items.map((i) => `<option value="${escape(i.key)}">${escape(i.label)}</option>`).join("")}</optgroup>`).join("")
        + (known ? "" : `<option value="${escape(current)}">(сейчас недоступно) ${escape(current)}</option>`);
    select.value = current;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
} else {
    render();
}
/* The extensions panel is filled late; retry once it exists. */
const timer = window.setInterval(() => {
    render();
    if (document.getElementById('dc-settings')) window.clearInterval(timer);
}, 500);
