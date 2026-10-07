# HANDOFF — Adinsure Document Flow Viewer

> Документ для продолжения работы в новом чате. Содержит контекст,
> который не выводится из кода: цели, решения, договорённости, что
> сделано и что делать дальше.

## 1. Цель проекта

Расширение VS Code для визуализации и редактирования жизненного цикла
документов **Adinsure**. Работает с файлами проекта:

- `documentFlow.json` — состояния и переходы;
- `configuration.json` — акторы и права;
- `translation/translation.csv` — RU-переводы;
- `documentFlow.ui.json` — координаты графа;
- `authorization/authorization.csv` — маппинг ролей;
- `documentRelation/*` — связанные документы.

Полное описание функционала — в `README.md`. Здесь только то, что
важно для разработки.

## 2. Стек и окружение

- Node.js 20+, VS Code `^1.75.0`.
- Сборка: `vsce package` → `.vsix`.
- Публикация: publisher `BakhtiarD`, репозиторий
  https://github.com/BakhtiarD/policy-flow-viewer.git
- Вебвью — ванильный JS (без сборщика), модули в `media/modules/*`
  через IIFE и глобальный `window.PF`.
- Граф — свой SVG-рендер + `media/vendor/dagre.min.js`.
- Текущая версия: **0.2.0** (после рефакторинга вебвью).

## 3. Структура проекта

    extension.js                 — точка входа, регистрация команды, onDidReceiveMessage
    package.json                 — конфиг расширения (команда policyFlow.showTable)
    src/                         — backend (Node)
      csv.js                     — парсинг/сериализация translation.csv, authorization.csv
      handlers.js                — обработчики сообщений от вебвью
      html.js                    — сборка HTML вебвью, вставка policyFlowData
      storage.js                 — loadData, pushRender, writeAll/writeFlow/writeUi/writeAuth/writeConfig
      transforms.js              — buildActorConfig, registerActorsInFlow, detectFlowName
      utils.js                   — indexOf для CSV-хедеров и пр.
    media/                       — frontend (webview)
      index.html                 — разметка + template-ы для модалок + script src
      main.css
      main.js                    — bootstrap (~14 строк): parse policyFlowData → PF.state.setData → init модулей
      modules/
        state.js                 — PF.state, PF.app, PF.state.setData(DATA), PF.persistState, acquireVsCodeApi
        utils.js                 — svgEl, cloneTemplate, showAlert, showConfirm
        icons.js                 — SVG-иконки
        relations.js             — getRelationsFor, stateHasRelation
        routing.js               — маршруты переходов, BASE_STATE_W/H
        graph-layout.js          — dagre, viewBox, zoom
        graph-drag.js            — перетаскивание, Ctrl+стрелки → PF.graphDrag
        graph-render.js          — рендер SVG, выделение, тулбар выделения → PF.render
        forms.js                 — формы состояний и переходов → PF.forms
        forms-other.js           — валидатор, связи, авторизация, копирование актора → PF.formsOther
        toolbar.js               — инициализация тулбара, view mode, авто-раскладка → PF.toolbar
        table.js                 — рендер таблицы, права, сортировка, collapse/expand → PF.table
      vendor/
        dagre.min.js

**Порядок загрузки скриптов** (`media/index.html`, строго такой):

    state → icons → utils → relations → routing → graph-layout → graph-drag
    → forms → forms-other → graph-render → toolbar → table → main

Зависимости от порядка:

- `table.js` при загрузке деструктурирует `PF.utils` и `PF.relations`
  → должен грузиться **после** обоих.
- `main.js` вызывает `PF.table.init()` → должен грузиться **последним**.

## 4. Ключевые решения и почему

- **Один глобальный `window.PF`** — общий namespace для всех модулей.
  Каждый модуль вешает себя на `PF.<module>` и не лезет в чужие поля.
- **`PF.app`** — только app-level операции. Сейчас содержит ровно одну
  функцию — `PF.app.applyViewMode` (регистрируется в `toolbar.js`,
  вызывается из `forms-other.js` и `main.js`).
- **IIFE + глобальный PF**, а не ES-модули: вебвью VS Code грузит скрипты
  как обычные `script`, без модульной системы.
- **`acquireVsCodeApi()` вызывается один раз** — в `state.js`. Все
  остальные модули используют `PF.vscode`.
- **`PF.state.setData(DATA)`** — единая точка инициализации данных.
  Единственное место, где пишутся `PF.state.DATA / meta / stateDetails /
  graphData`. `graphData` создаётся как deep-clone:
  `JSON.parse(JSON.stringify(DATA.graph || { states: [], transitions: [] }))`,
  чтобы drag-мутации не задевали `DATA.graph`.
- **Шаблоны модалок** живут в `media/index.html` как `template id="tpl-*"`,
  клонируются через `PF.utils.cloneTemplate`.
- **`persistState`** в `PF.vscode.setState()` хранит UI-состояние
  (сортировка, раскрытые блоки, viewMode, layoutRankDir, показ подписей,
  позиция тулбара). Данные (DATA/meta/graphData) в persistState **не** кладутся.
- **Ленивые вызовы между модулями.** Внутри функций модуль обращается
  к другим через `PF.<module>.<fn>()` (не деструктурирует при загрузке),
  если только зависимость не гарантирована порядком скриптов.

## 5. Статус рефакторинга

**Рефакторинг вебвью завершён (v0.2.0).** Все запланированные шаги закрыты.

**Сделано:**

- **Шаг 1:** монолитный `media/main.js` разбит на модули. Выделены:
  `state`, `utils`, `icons`, `relations`, `routing`, `graph-layout`,
  `graph-drag`, `graph-render`, `forms`, `forms-other`, `toolbar`.
- **Шаг 2:** создан `media/modules/table.js`. Всё table-хозяйство вынесено
  из `main.js`: `permKey`, `renderCellGroups`, `makePermSection`,
  `makePermSectionList`, `renderPerms`, `renderTable`, `applyAllCollapsed`,
  `updateSortIndicator`, `init`. `toolbar.js` дёргает
  `PF.table.applyAllCollapsed`. `{{JS_TABLE}}` подключён в `src/html.js`.
- **Шаг 3:** убраны двойные экспорты форм через `PF.app`. Все вызовы
  переведены на `PF.forms.*` / `PF.formsOther.*`.
- **Шаг 3b:** `PF.drag` → `PF.graphDrag`. Блок «Совместимость» с
  `PF.app.startDrag` и т.п. удалён. Все вызовы в `graph-render.js`
  переведены на `PF.graphDrag.*`.
- **Шаг 4:** `PF.state.setData(DATA)` добавлен в `state.js`. `main.js`
  больше не пишет напрямую в `PF.state.DATA/meta/stateDetails/graphData`.

**Осталось:** — (рефакторинг закрыт)

**Целевой вид `main.js` (текущий):**

    (function () {
        'use strict';

        const dataEl = document.getElementById('policyFlowData');
        if (!dataEl) throw new Error('policyFlowData script tag not found');
        const DATA = JSON.parse(dataEl.textContent);

        PF.state.setData(DATA);

        PF.toolbar.init();
        PF.table.init();
        PF.routing.rerouteAll();
        PF.app.applyViewMode();
        PF.render.updateSelectionToolbar();
    })();

**Что осталось в `PF.app` (финальный вид):**

- `PF.app.applyViewMode` — app-level, регистрируется в `toolbar.js`,
  вызывается из `forms-other.js` и `main.js`.

## 6. Договорённости и конвенции

- Не использовать `PF.app` для экспорта модулей, кроме действительно
  app-level вещей. Сейчас это ровно `applyViewMode`.
- Каждый модуль сам себя регистрирует в `PF.<name>`. Обращения —
  через `PF.<module>.<fn>`, а не через фасад.
- `PF.vscode.postMessage` — только из вебвью в extension, типы сообщений
  перечислены в `src/extension.js` → `onDidReceiveMessage`.
- Все изменения файлов проекта (json/csv) идут через backend:
  `loadData(ctx)` → мутация → `writeAll/writeUi/writeAuth/writeConfig(ctx)`
  → `loadData(ctx)` → `pushRender(ctx, panel)`.
- Ошибки из `handlers.js` показываются через
  `vscode.window.showErrorMessage` в catch-блоке `onDidReceiveMessage`.
- **Публичный API расширения и формат файлов проекта не меняются**
  при рефакторинге вебвью. Ломающие изменения — только с мажорным бампом.
- При добавлении нового модуля в `media/modules/`:
  1. создать файл с IIFE-обёрткой `(function () { 'use strict'; ... })();`
  2. зарегистрировать `PF.<module> = { ... };`
  3. добавить `<script src="{{JS_<MODULE>}}"></script>` в `media/index.html`
     **до** `main.js`;
  4. в `src/html.js` добавить URI и `.replace(/\{\{JS_<MODULE>\}\}/g, ...)`;
  5. учитывать порядок загрузки (см. §3).

## 7. Известные особенности и подводные камни

- **Кнопка «Перезагрузить из файлов» (`reloadBtn`)** перечитывает файлы
  **с диска**. Если только что сохранил изменения — reload покажет уже
  сохранённое. Это не баг, а ожидаемое поведение. Откат
  несохранённых UI-правок пока не реализован.
- **`pushRender`** в `storage.js` — ключевое место, которое сериализует
  данные для вебвью. При изменениях формата DATA нужно править его
  и `html.js` синхронно.
- **`PF.state.setData`** должен делать deep-clone графа. Если случайно
  заменить на присваивание ссылки — drag начнёт мутировать `DATA.graph`,
  и «сохранённое» состояние поедет в `pushRender` без явного сохранения.
- **`registerActorsInFlow` / `buildActorConfig`** в `transforms.js` —
  важны при любых правках акторов и прав.
- **Dagre** подключается как `script` и доступен как глобальный
  `dagre`. Проверка на `typeof dagre === 'undefined'` уже есть в
  `toolbar.autoLayout`.
- **`PF.table`** инициализируется после `PF.toolbar.init()` в `main.js`.
  Если поменять порядок — убедиться, что `toolbar.init()` не дёргает
  `PF.table.renderTable()` до того, как `table.js` загружен (сейчас
  не дёргает — init только вешает обработчики).

## 8. Открытые вопросы

- Стоит ли переводить вебвью на ES-модули (есть ли поддержка в текущей
  версии VS Code) или оставить IIFE? Пока оставлено IIFE — работает,
  не требует сборщика.
- Нужен ли `PF.state` дополнительный метод `reset()` для сброса UI-состояния
  при reload? Сейчас reload делает полный re-render с диска.
- Нужны ли unit-тесты на `src/transforms.js` (buildActorConfig,
  registerActorsInFlow)? Сейчас тестов нет.

## 9. Как продолжить в новом чате

Стартовое сообщение:

    Продолжаем проект Adinsure Document Flow Viewer.
    Ссылка: https://github.com/BakhtiarD/policy-flow-viewer.git
    Текущая версия: 0.2.0 (рефакторинг вебвью завершён).
    Структура: media/main.js — тонкий bootstrap, вся логика в media/modules/*.

    Вот HANDOFF: <вставить содержимое файла>
    Вот ключевые файлы на текущий момент: <main.js, state.js, ...>

    Задача: <что делаем сейчас>

## 10. Полезные команды

    # посмотреть порядок загрузки скриптов вебвью
    grep -n "<script" media/index.html
    grep -n "JS_\|jsUri\|jsTableUri" src/html.js

    # найти все вызовы PF.app (кандидаты на чистку)
    grep -rn "PF\.app\." media/

    # убедиться, что старые namespace не остались
    grep -rn "PF\.drag\." media/                  # ожидаем: пусто
    grep -rn "PF\.app\.applyAllCollapsed" media/  # ожидаем: пусто

    # все PF.* экспорты модулей
    grep -rn "^  PF\." media/modules/

    # найти все postMessage типы
    grep -rn "postMessage({" media/
    grep -n "msg.type ===" src/extension.js

    # собрать vsix
    vsce package
    code --uninstall-extension BakhtiarD.adinsure-document-flow-viewer
    code --install-extension adinsure-document-flow-viewer-X.Y.Z.vsix

## 11. История шагов рефакторинга (закрыто в 0.2.0)

### Шаг 1 — разбиение `media/main.js` на модули

Монолитный `main.js` (~700 строк) разбит на 11 модулей в `media/modules/*`
(IIFE, общий `window.PF`). `main.js` стал тонким bootstrap'ом.

### Шаг 2 — вынос таблицы

Создан `media/modules/table.js` со всем, что касается таблицы состояний
и прав. `toolbar.js` дёргает `PF.table.applyAllCollapsed`. `{{JS_TABLE}}`
подключён в `src/html.js` и `media/index.html`.

### Шаг 3 — уборка двойных экспортов форм

Формы экспортировались одновременно как `PF.app.openX` и `PF.forms.openX`.
Убраны все `PF.app.*`-дубли. Все вызовы переведены на `PF.forms.*` /
`PF.formsOther.*`.

### Шаг 3b — вынос drag-and-drop из `PF.app`

Функции `startDrag`, `startHandleDrag`, `startEndPointDrag`,
`startSegmentDrag`, `startTransitionDraw`, `removeWaypoint`,
`attachGraphSvgHandlers`, `attachGraphKeydown` жили в `PF.app` через
блок «Совместимость» в `graph-drag.js`. Блок удалён, `PF.drag`
переименован в `PF.graphDrag`, все вызовы в `graph-render.js`
переведены на `PF.graphDrag.*`.

### Шаг 4 — `PF.state.setData(DATA)`

Единая точка инициализации данных в вебвью. `main.js` больше не пишет
напрямую в `PF.state.DATA / meta / stateDetails / graphData`. Логика
deep-clone графа перенесена в `setData`.

## 12. Маршруты

Решения по дизайну (согласовано)
Поиск route по переходу — сканируем route/entity/*/configuration.json, матчим по condition.documentStates. Если найдено несколько — показываем список с выбором. В списке видно, к каким состояниям привязан каждый route (чтобы выбрать правильный).

Тип синка «standard» — конкретно documentTransition (транзакция/переход документа). Других стандартных типов пока не рассматриваем. Селект типа: ref / documentTransition / inline (document) / database.

Куда добавлять новый синк — пользователь выбирает: sinks, completionSinks или initialSinks.

mapping.js / apply.js при создании — создаём пустышки по базовому шаблону (см. выше), без логики:

mapping.js: module.exports = function mapping(sinkInput, sinkExchange) { return sinkInput; };

apply.js: пустышка-заглушка с комментарием.

Input/output-схемы — только warning в UI (не блокируем сохранение). Показываем «не покрыто в mapping» и «не возвращается в mapping» рядом со схемами.

Rename/delete перехода — route-файлы не трогаем автоматически. Показываем информационное сообщение «остаются маршруты-сироты», чтобы пользователь осознанно почистил вручную. (Отличие от flowRules из §11, где авто-rename/delete.)

Что ещё нужно решить перед кодом
UI открытия route-списка. Отдельная команда в тулбаре («Маршруты продукта» — все routes из route/entity/*) или из контекста перехода («Открыть routes для этого перехода»)? Скорее оба.

Формат панели route. Модалка в стиле остальных, отдельная webview-панель, или отдельная вкладка в существующей панели? Если модалка — что показываем на верхнем уровне: таблицы Sinks / Completion Sinks / Initial Sinks + Condition?

Создание apply.js. Всегда вместе с mapping.js или по чекбоксу в форме? (По умолчанию — по чекбоксу, чтобы не плодить пустышки.)

Формат ввода для database — таблицы задаются текстом (по строке на таблицу) или как список с полями? MVP: текстом, потом улучшим.

Валидация имён синков. ^[A-Za-z][A-Za-z0-9_]*$? Совпадает ли с реальностью (в примерах HalykBusSetContractRescinding — ок).

transitionName в шаблоне documentTransition — откуда берётся? Из контекста перехода (если зашли из перехода) или запрашивается в форме?

Файлы, которые понадобятся в работе
src/storage.js — findProductLevel для поиска route/ и document/; loadDocumentNames уже есть.

src/handlers.js — новые хендлеры: handleOpenRoute, handleAddSink, handleOpenSinkFile, handleCreateSinkFiles.

src/routes.js (новый) — по аналогии с src/flow-rules.js: чтение/запись route-конфигов, поиск по condition.documentStates, поиск sinkGroup в dependencies, чтение inputSchema.json / outputSchema.json, шаблоны.

media/modules/routes.js (новый) — UI route: список, форма добавления синка, просмотр схем.

media/index.html — новые <template> для модалки route.

src/html.js + media/index.html — подключение нового модуля (см. конвенцию в §6).

extension.js — новые типы сообщений: openRoutesList, openRouteConfig, addSink, openSinkFile, createSinkFiles.

Следующие шаги
Работа не на сегодня. При следующем заходе:

Согласовать UI-форму (модалка vs панель, layout).

Собрать реальные примеры структуры route/entity/* и sinkGroup/* (хотя бы 2–3 разных).

Реализовать src/routes.js (бэкенд) → handlers.js → extension.js → media/modules/routes.js + шаблон в index.html.

Обновить CHANGELOG до 0.4.0.