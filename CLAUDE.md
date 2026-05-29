# Fresh Mind

Десктопный локальный дневник для мыслей, рефлексии, эмоций, заметок и памяток с встроенным колесом сфер жизни на дашборде. Третье приложение линейки **Fresh** (Ear → Eye → Mind).

**Главный принцип:** приложение **не думает за пользователя**. Оно отражает, помнит и хранит. Никакого ИИ, никаких интерпретаций, никаких автоматических выводов. Память и аналитика работают через детерминированные формулы, фильтры и визуализации частоты.

## Контекст и переносы

- **Из Fresh Ear переносим:** трей-интеграцию, попап-уведомления, автозапуск, фоновую работу, визуальный стиль линейки Fresh (мягкий голубой/glassmorphism). Папка Fresh Ear находится в том же корне — подцепить общие компоненты.
- **Из Sword Maidens Tablet** (папка `Sword Maidens Tablet` в том же корне) подцепить **логику редактора заметок и полей**: панель инструментов, форматирование, теги, эмодзи-блок, прикрепление файлов, структура записей. **Визуальный стиль переделать под Fresh** (не использовать пергаментный/готический скин Sword Maidens — только функциональная логика).
- **Новое:** колесо сфер на дашборде с интерактивной шкалой, сравнение срезов во времени, детерминированные сводки.

## Стек

- Electron + React (выровнять с Fresh Ear/Eye)
- Локальное хранилище: SQLite (предпочтительно для запросов и фильтров)
- Полнотекстовый поиск — встроенный в SQLite (FTS5)
- Без облака, без API наружу, без ИИ. **Никаких внешних сетевых запросов.**

## Архитектура взаимодействия

- Запуск в трее, автозапуск с Windows опционально
- **Левый клик по трею** → главное окно (Дашборд)
- **Правый клик по трею** → Настройки
- Опциональный попап в выбранное время (по умолчанию 22:00)

## Попап-уведомление

- Иконка: **мозг в educational-стиле**, тёмно-фиолетовый рисунок (не glassmorphism как у Ear/Eye — отдельный визуальный акцент для размышляющего инструмента)
- Текст: одна из фраз из базы плейсхолдеров (см. ниже)
- По клику → открывается главное окно с фокусом на поле ввода (готово писать)

## Главное окно — структура

Три зоны:
- **Верх:** поле быстрого ввода (search bar / quick capture)
- **Центр:** колесо сфер (дашборд)
- **Право/низ:** История записей

### Верхняя зона: Quick Capture

- Свёрнутое состояние: одна строка с плейсхолдером
- **Плейсхолдеры**: подгружаются из базы (`placeholders.json`) — много разных фраз с разной эмоцией и attitude. Меняются каждый раз при открытии. Примеры (для понимания тона, расширяемо):
  - «Напиши, что на уме…»
  - «Что сегодня дёрнуло?»
  - «Как дела внутри?»
  - «Что заметил сегодня?»
  - «Слово, фраза, мысль…»
  - «Что бесит / что радует?»
  - «Скажи себе правду»
  - «Что не отпускает?»
  - «Что-то крутое случилось?»
  - «Опиши момент»
  - и т.д. — пополнять
- При клике/фокусе разворачивается в полноценный textarea с панелью инструментов
- **Панель инструментов в редакторе** (логика из Sword Maidens Tablet):
  - Форматирование текста (заголовки, жирный, курсив, списки)
  - Цвета/выделение
  - Эмодзи-пикер (как на скрине Sword Maidens — табло популярных эмодзи, расширяемо)
  - Закрепить (pin)
  - Уведомление/напоминание
  - Прикрепить картинку/файл
  - Корзина
- **Теги** — два способа ввода:
  - Через `#` прямо в тексте (автокомплит из существующих тегов)
  - Через отдельную плашку «Теги» с автокомплитом и историей
- **Сферы** — чекбоксы или клик по мини-колесу: связать запись с одной или несколькими сферами
- **Настроение/состояние** — опциональный эмодзи-маркер записи (быстрый набор популярных: 😊 🔥 😔 😤 🤔 💡 etc.)
- Сохранение: Ctrl+Enter или кнопка «Сохранить»

### Центральная зона: Колесо сфер (бывший Fresh Scan, встроено)

Визуально — как референс Strategium Wheel (radar chart с двумя наложенными паутинками, цветными сферами по периметру, групповыми зонами).

- **Сферы**: настраиваемые, от 1 до ~20-24
- Каждая сфера: название, цвет, группа (например «Здоровье / Развитие / Труд / Общество» — или свои группы)
- Группы отображаются как **цветные секторы фона** колеса
- **Клик по сфере** → попап со шкалой 1-10 → выставить сегодняшнюю оценку
- Интерактивный отклик: сферы и точки на радаре подсвечиваются при наведении, плавные анимации
- Линии радара соединяют точки оценок (как на референсе)
- **Не обязательно** оценивать все сферы каждый раз. Только те, что сегодня «звучат».
- Если сфера сегодня не оценена — берётся **последняя оценка** (висит).
- **Перемотка во времени**: ползунок дат под колесом — посмотреть срез на любую дату
- **Сравнение срезов**: режим «наложение двух паутинок» — выбрать дату А и дату B, видеть обе паутинки разными цветами одновременно (как на референсе зелёная + синяя)
- При наведении на сферу — мини-график изменения за 30/90/365 дней + стрелка тренда

### Правая/нижняя зона: История

- Хронологическая лента всех записей
- Каждая запись: timestamp, текст (с форматированием), теги, привязанные сферы, эмодзи-настроение
- Pinned записи (памятки) — закреплены сверху отдельным блоком
- **Фильтры:**
  - По тегу (мультивыбор)
  - По сфере (мультивыбор)
  - По диапазону дат
  - По эмодзи-настроению
  - По наличию вложений
  - Полнотекстовый поиск (FTS5)
- **Сортировка:** новые сверху / старые сверху / по релевантности (для поиска)
- Inline-редактирование записи
- Возможность удалить (в корзину, с восстановлением)

## Памятки (Pinned)

- Отдельный режим записи или флаг «закрепить»
- Всегда наверху Истории отдельным блоком
- Для своих правил, мантр, ключевых формулировок
- Пример пользователя: «НЕ ЗАГОНЯЙСЯ НИКОГДА» (его собственная запись из 2019)

## Сводки

### Месячная

Кнопка «Сводка за месяц» → выбор месяца → детерминированный отчёт:
- Количество записей
- Топ-теги по частоте (с числами)
- Динамика сфер: для каждой сферы среднее за месяц и дельта к прошлому месяцу
- Самые активные дни (по количеству записей)
- Распределение эмодзи-настроений
- Общая длительность ведения за месяц (дни с записями / всего дней)

Формат: **факты и числа, без интерпретаций**. Шаблонные формулировки.

Пример:
> Май: 47 записей. Топ-тег: #творчество (12 раз). Сфера «монетизация»: средняя 5.8 (+1.6 к апрелю). Сфера «тело»: средняя 5.5 (−1.5 к апрелю). Самый активный день: 12 мая (5 записей). Настроение 🔥 встречалось 8 раз, 😔 — 3 раза. Записи были в 22 днях из 31.

### Годовая

Аналогично, агрегация за год:
- Месяцы с самым высоким/низким средним по каждой сфере
- Топ-теги года
- Динамика общей активности по месяцам (график)
- Сравнение с прошлым годом, если данные есть

Без выводов «что это значит». Только числа и шаблонные предложения.

## «В этот день»

- Блок на дашборде или в Истории
- Если есть записи в эту же календарную дату в прошлые годы — показать список со ссылками на полные записи
- **Только показывает, без интерпретаций**

## Логика памяти и аналитики (по приоритету)

1. **Отражение текущего колеса с памятью динамики** (главное)
   - Каждая сфера хранит всю историю оценок
   - На сфере: мини-график, стрелка тренда, дельта
   
2. **Сводки за месяц/год** — детерминированные шаблоны

3. **Поиск паттернов через фильтры** (не через ИИ)
   - Фильтр по тегу → все записи с этим тегом
   - График частоты тега по неделям/месяцам (визуализация частоты, не интерпретация)

## Настройки (правый клик по трею)

- Запускать с Windows (тогл)
- Работать в фоне (тогл)
- Попап-напоминание (тогл + время, по умолчанию 22:00)
- **Управление сферами:** добавить / удалить / переименовать / поменять цвет / привязать к группе / перетащить порядок
- **Группы сфер:** настраиваемые названия, цвета фона секторов
- Шкала оценки: 1–10 (по умолчанию)
- Папка хранения данных (локально)
- **Экспорт** базы: JSON, CSV, Markdown — для внешней аналитики (в т.ч. чтобы при желании скормить нейросети как отдельный шаг)
- **Импорт** базы из JSON
- Бэкап (копия папки с данными)

## Хранилище

- SQLite-файл в папке приложения или в выбранной пользователем папке
- Никаких внешних запросов
- Бэкап = копия файла БД и папки вложений
- Привязка папки данных к любой синхронизируемой папке (Dropbox/OneDrive/Google Drive) — на усмотрение пользователя, не функция приложения

## Иконка и стиль

- Иконка приложения: **мозг в educational-стиле**, тёмно-фиолетовый
- Главное окно: визуальный язык Fresh (мягкие тона, скругления, glassmorphism для карточек, как у Ear/Eye)
- Тёмно-фиолетовый акцент только для попапа и иконки приложения, чтобы выделить «размышляющий» инструмент в линейке

## Чего НЕТ (явно)

- Нет ИИ нигде в системе
- Нет внешних сетевых запросов
- Нет интерпретаций состояния
- Нет рекомендаций «попробуй X»
- Нет автоматических выводов про жизнь пользователя
- Нет шеринга, аккаунтов, соцсети-функций
- Нет принудительных уведомлений-обязаловок

## Поэтапная сборка (предложение)

1. Каркас Electron + трей + автозапуск (из Fresh Ear)
2. SQLite-схема: записи, теги, сферы, оценки, группы
3. Редактор заметок с панелью инструментов (логика из Sword Maidens Tablet, перерисованная под Fresh)
4. Quick Capture + сохранение записей
5. Колесо сфер: рендеринг (D3 / Recharts / SVG вручную), настраиваемые сферы и группы
6. Шкала оценок, попап оценки, история оценок
7. Перемотка во времени, сравнение срезов
8. История записей с фильтрами и FTS-поиском
9. Сводки месячные/годовые (детерминированные)
10. «В этот день»
11. Pinned/памятки
12. Экспорт/импорт, бэкапы
13. Попап-напоминание + база плейсхолдеров
14. Полировка

---

# Экосистема Fresh — UI и архитектурные правила (по итогам Ear + Eye, 2026-05-24)

Этот раздел — обязательный референс. **Каждый новый Fresh-проект должен иметь идентичные настройки, попап-структуру, окно «Папки сканирования» (если применимо), стэкинг попапов с соседями Fresh-линейки.** Только палитра и контент-фишки отличаются. Структура — общая.

## Стек (точные версии из Fresh Eye/Ear)

```json
"dependencies": {
  "auto-launch": "^5.0.6",
  "node-cron": "^4.2.1",
  "node-window-manager": "^2.2.4"
},
"devDependencies": {
  "@vitejs/plugin-react": "^4.4.1",
  "electron": "^35.0.1",
  "electron-builder": "^26.8.1",
  "electron-icon-builder": "^2.0.1",
  "electron-vite": "^3.1.0",
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "sharp": "^0.34.5",
  "vite": "^6.3.5"
}
```

- **JavaScript** (не TypeScript) — для совместимости с Ear/Eye, простота переносов
- **npm** (не pnpm)
- **electron-vite** конфиг — `main` + `preload` (multi-entry) + `renderer` (multi-entry HTML)
- **JSON-хранилище** в `app.getPath('userData')` — Ear/Eye так работают. **Fresh Mind использует SQLite** — это его специфика; остальные паттерны экосистемы (IPC, окна, UI) сохраняем.

## Структура проекта (повторяемая)

```
src/
  main/
    index.js            - tray, окна, IPC, cron, protocol, app lifecycle
    store.js            - loadJSON/saveJSON в userData (для Mind заменить на db.js + sqlite)
    scanner.js          - если есть сканер файлов: multi-folder + exclude (готовый паттерн)
    activity.js         - streak/history/activity log (если есть попап-стрик)
    picker.js           - если есть «что-то дня»: взвешенный рандом + хуки + formatAge
  preload/
    index.js            - contextBridge как window.fresh<Name>
  renderer/
    shared/
      tokens.css        - CSS-vars (--fe-* или нейминг по приложению)
      eye.png/...       - master иконка для hero
    settings/           - окно настроек (структура ниже)
    folders/            - отдельное окно «Папки» если применимо
    popup/              - попап дня
    main/               - главное окно (если есть, для Mind — есть)
resources/
  <name>.png            - master icon
  tray-icon.png         - 32×32 для трея
  icons-crop/icons/icon.ico  - .ico из master через electron-icon-builder
scripts/
  prep-mint-icon.js     - sharp hue shift (если нужно сместить палитру master png)
  make-tray-icon.js     - sharp ellipse mask для трея (без подушки)
```

## Дизайн-система (общая для всех приложений Fresh)

### Window properties (повторяй для каждого окна)
```js
new BrowserWindow({
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  resizable: false,                 // settings и folders, для main можно true
  show: false,                      // показать через ready-to-show или после первого resize
  webPreferences: { preload, sandbox: false }
})
```

### Glass panel паттерн (CSS — обязателен для всех окон)
```css
html, body { background: transparent; overflow: hidden; height: 100%; }
body { padding: 0; }    /* критично: 0, иначе Windows-полоска вверху */
.panel {
  position: relative;
  min-height: 100%;     /* критично: panel заполняет всё окно */
  padding: 20px 24px 18px;
  background: rgba(<R>, <G>, <B>, 0.92);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 14px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.6) inset,
    0 10px 40px rgba(0, 50, 90, 0.12);
  -webkit-app-region: drag;
}
```

### Палитры по приложению
- **Fresh Ear** (голубой): main `#29b6f6` / `#4fc3f7`, deep `#0288d1`, bg `#eaf4fb` / `rgba(235,245,251,0.92)`, text `#1b2d3d`
- **Fresh Eye** (мятный): main `#5CC9A7` / `#74D9C2`, deep `#3FAB8D`, bg `#EAF7F2` / `rgba(234,247,242,0.92)`, text `#2C5950`
- **Fresh Mind** (предлагаю): фиолетовый — `#9B7BD9` / `#B49EE3`, deep `#7757B8`, bg `#EFEBF6` / `rgba(239,235,246,0.92)`, text `#3A2C5C`. Финальный — на твой вкус.

### Settings — обязательная структура (как у Ear/Eye)

```
[close-btn ×]
[hero: logo 76×76 + title 20px + sub 10.5px]
[divider]
[settings-row: Запускать с Windows + toggle]    height 40px
[settings-row: Работать в фоне + toggle]
[settings-row: Попап-уведомления + toggle]
[settings-row: Время уведомления + TimeScroller]
[settings-row "folders-entry": Папки/Источники + icon + arrow] → открывает folders window
[settings-actions:
   [btn-progress: Прогресс] → раскрывает ActivityGrid
   [btn-primary: Выход]
]
```

Точные spacing/size'ы (обязательно идентичные между Fresh-приложениями):
- `.settings-panel padding: 20px 24px 18px`
- `.settings-hero padding: 6px 0 16px`, logo 76×76, title 20px, sub 10.5px
- `.stats-grid padding: 10px 0`, gap 8px, 2 колонки
- `.stat-item padding: 10px 6px 8px`, value 20px bold, label 10.5px
- `.settings-row height: 40px`, border-bottom `rgba(0, 30, 60, 0.045)`, label 13px
- `.toggle 40×22px, knob 18×18px`, gradient on (palette specific)
- `.settings-actions padding-top: 8px`, gap 8px, flex-column
- `.btn-primary padding: 11px 0, radius: 11px, font-size: 14px, gradient palette-specific`
- `.btn-progress padding: 9px 0, radius: 9px, font-size: 12.5px, white-overlay bg`

### Folders window — обязательная структура (если нужен сканер папок)

Размер: **320×540** (как settings), auto-fit высота через ResizeObserver.

```
[header: title 13px + close-btn]
[section ВКЛЮЧИТЬ N:
  [folder-item × N: + icon + path-ellipsis + remove ×]
  [add-btn: + Добавить папку]
]
[section ИСКЛЮЧИТЬ N:
  [folder-item × N: − icon + path-ellipsis + remove ×]
  [add-btn: + Добавить исключение]
]
[rescan-btn: ↻ Пересканировать] — большая, palette-gradient
[folder-stats: Найдено N (M недоступны)]
[folder-status: последнее действие]
```

Точные размеры:
- panel padding: 12 18 14
- gap 12
- folder-list max-height: 180px (scroll если больше)
- folder-item padding: 5 6 5 8, font 11px
- folder-icon include/exclude: 16×16 round, palette accent
- folder-path: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` + tooltip

### Попап (для приложений с попапом дня)

- Размер: 320×auto, margin 20px от правого нижнего workArea
- body padding 0, panel min-height 100%
- Header строка `<lowercase-app-name> · сегодня` 11px palette-teal + refresh icon в углу
- Кнопки: `btn-primary` (positive action) + `btn-secondary` (dismiss), padding 7px 0, font 12px, gap 6px
- При создании окна `height: 1` + `show: false` → show только при первом `resize-popup` от renderer (избегаем мелькания)
- ResizeObserver на panel → `resize-popup(offsetHeight)` БЕЗ +12

### Стэкинг попапов с другими Fresh-приложениями

**Логика (Telegram-style — последний открытый внизу):**
1. При создании попапа `<NewApp>` проверить через `node-window-manager` нет ли уже открытого попапа другого Fresh-приложения в правом нижнем углу workArea (фильтр по path: `/Fresh[\s_-]?(Ear|Eye|Mind)/i`, размер ≤ 600×500, центр в правой нижней четверти).
2. Запомнить флаг `neighborWasAtOpen = !!findNeighborPopup()`.
3. В `popupAnchorPosition`:
   - Если `neighborWasAtOpen = true` → новый попап **СВЕРХУ** соседа (`y = neighbor.y - height - 8`), сосед не двигается.
   - Если `false` → новый попап ВНИЗУ. Если потом сосед появится в нижнем углу — через `setBounds` соседа поднять программно над собой.
4. `setInterval` 1500ms пока попап открыт — пересчитывать (`repose`).
5. На закрытии — clearInterval.

```js
import { windowManager } from 'node-window-manager'

function findNeighbor() {
  const wa = screen.getPrimaryDisplay().workArea
  for (const w of windowManager.getWindows()) {
    if (!w.isVisible()) continue
    const p = w.path || ''
    if (!/Fresh[\s_-]?(Ear|Eye|Mind)/i.test(p)) continue
    const b = w.getBounds()
    if (b.width > 600 || b.height > 500) continue
    if (b.x + b.width/2 < wa.x + wa.width*0.55) continue
    if (b.y + b.height/2 < wa.y + wa.height*0.55) continue
    return { window: w, bounds: b }
  }
  return null
}
```

### Иконка приложения и установщик

`package.json` build (обязательно — иначе иконка не встроится в .exe):

```json
"build": {
  "appId": "com.ndt.fresh<name>",
  "productName": "Fresh <Name>",
  "win": {
    "target": ["nsis", "portable"],
    "icon": "resources/icons-crop/icons/icon.ico"
    /* НЕ ставить signAndEditExecutable: false — иначе иконка не встроится! */
  },
  "nsis": {
    "oneClick": true,
    "allowToChangeInstallationDirectory": false,
    "installerIcon": "resources/icons-crop/icons/icon.ico",
    "uninstallerIcon": "resources/icons-crop/icons/icon.ico",
    "installerHeaderIcon": "resources/icons-crop/icons/icon.ico",
    "shortcutName": "Fresh <Name>"
  },
  "portable": { "artifactName": "Fresh-<Name>.exe" }
}
```

Master icon обработка через `electron-icon-builder` (генерит .ico + все размеры PNG) + опциональный `sharp`-скрипт для трея (ellipse mask чтобы убрать подушку).

### Граблии — на чём наступили в Ear/Eye

| Грабли | Решение |
|---|---|
| Белая Windows-полоска вверху прозрачного окна | `body { padding: 0 }`, `.panel { min-height: 100%, height: 100% }`. Никакого зазора между body и panel. |
| ResizeObserver бесконечный цикл с panel `height: 100%` | НЕ использовать `panel.offsetHeight + 12`. Просто `offsetHeight`, без add. |
| Окно показывается «прыгает» при первом resize | Создавать окно с `height: 1, show: false`. Показывать только в первом `resize-popup`/`resize-settings` IPC handler. |
| `<video>` блокирует переименование файла | Custom protocol `<app>-file://` через `protocol.handle + net.fetch(pathToFileURL)`. После snapshot — `v.removeAttribute('src'); v.load()`. HoverableThumbnail: `src` только при hover. |
| Дубликаты окон / два инстанса в трее | `app.requestSingleInstanceLock()` в начале main + handler `'second-instance'` — показать существующее окно. |
| Иконка установщика — Electron-атом | Убрать `signAndEditExecutable: false` + добавить `installerIcon/uninstallerIcon/installerHeaderIcon` в nsis. |
| Native dialog не виден за окном | `dialog.showOpenDialog(parentWindow, opts)` — привязка к focused window. |
| Tray-иконка на цветной подушке нечитаема | Sharp ellipse mask `74×42%` от подушки, trim прозрачных краёв, resize 32×32. |
| Папки с правильным path при exclude | Нормализация через `path.replace(/[\\/]+$/, '').toLowerCase()` + `startsWith` сравнение. |

## IPC паттерны (стандартный набор для Fresh-приложений)

```
get-settings, save-settings
get-autolaunch, set-autolaunch
get-stats, get-activity-days
pick-folder, add-folder, remove-folder, add-excluded-folder, remove-excluded-folder
rescan
record-activity, show-in-folder
open-folders, close-folders, resize-folders
open-settings, close-settings, resize-settings
close-popup, resize-popup
quit-app
```

Для приложений с попапом дня (Ear, Eye) добавить:
```
get-today-<item>, next-<item>, open-<item>, dismiss-popup
```

Для Mind (с главным окном Дашборд) добавить:
```
open-main, close-main, minimize-main, resize-main
get-entries, save-entry, update-entry, delete-entry
get-spheres, save-sphere, get-ratings, save-rating
get-summary-month, get-summary-year, get-on-this-day
search-entries
```

## Custom protocol для локальных файлов в renderer

Нужен если в renderer показываются локальные файлы (картинки/видео/вложения) и `webSecurity: true` (по умолчанию).

```js
// До whenReady
protocol.registerSchemesAsPrivileged([{
  scheme: 'fresh-mind-file',
  privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
}])

// После whenReady
protocol.handle('fresh-mind-file', (request) => {
  const encoded = request.url.replace(/^fresh-mind-file:\/\//, '')
  const filePath = decodeURIComponent(encoded)
  return net.fetch(pathToFileURL(filePath).toString())
})

// В renderer
const safe = `fresh-mind-file://${encodeURIComponent(path.replace(/\\/g, '/'))}`
<img src={safe} />
```

## Чеклист для старта Fresh Mind (завтра в новом чате)

1. Скопировать структуру `Fresh-Eye/` как стартовую (это самый свежий шаблон):
   - `package.json` (заменить name, appId, productName, shortcutName на `fresh-mind`/`Fresh Mind`)
   - `electron.vite.config.mjs`
   - `src/main/{index.js, store.js}` — `store.js` потом заменится на `db.js` под SQLite
   - `src/preload/index.js` — переименовать `freshEye` → `freshMind`
   - `src/renderer/shared/tokens.css` — заменить палитру на фиолетовую
   - `src/renderer/settings/*` + `src/renderer/folders/*` (если папки нужны) — глобальная замена `freshEye` → `freshMind`
2. Поставить иконку Fresh Mind (мозг фиолетовый) в `resources/<name>.png`. `npm run icons` сгенерит .ico + tray.
3. Поставить SQLite-зависимость: `npm i better-sqlite3` (требует electron-rebuild) либо `sql.js` (pure-js, проще для portable).
4. Создать схему БД: entries, tags, spheres, ratings, sphere_groups.
5. Главное окно (Дашборд) — у Mind ЕСТЬ главное окно (в отличие от Ear/Eye, где было решено его убрать). ЛКМ трея → Дашборд. ПКМ → настройки.
6. Колесо сфер — D3 или SVG вручную (radar chart). Не используем готовые библиотеки чартов из-за специфики (custom group sectors, overlay двух паутинок).
7. Quick Capture + редактор — посмотреть `C:\Vibecoding\Sword Maidens Tablet\` для логики (но переписать визуал под Fresh).
8. Стэкинг попапов с Ear/Eye — добавить тот же `node-window-manager` детект с regex `/Fresh[\s_-]?(Ear|Eye|Mind)/i`.

## Глобальные принципы линейки Fresh (повторно)

- **Без давления, без обязаловки, без ИИ.**
- Один попап в день в фиксированное время (по умолчанию вечером).
- Кнопки «положительное действие» / «закрыть» — без выводов и оценок.
- Хуки/плейсхолдеры — фразы в характере приложения, редактируемые в `<file>.txt` в userData.
- Никаких внешних сетевых запросов.
- Данные строго локально, в `%APPDATA%/<app>/` или в выбранной пользователем папке (для Mind).
- Бэкап = копия папки. Восстановление = вернуть папку.
