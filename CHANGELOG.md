# Change Log

Все значимые изменения в расширении **Adinsure Document Flow Viewer**
документируются здесь.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

Формат — по версиям, от новых к старым. Внутри версии — группы
«Добавлено», «Исправлено», «Изменено», «Технические детали»,
«Известные компромиссы».


## [0.7.6] - 2026-11-07

### Добавлено

- **Просмотр route-конфигураций проекта.** Новая кнопка в главном тулбаре открывает модалку со списком маршрутов, привязанных к текущему документу (`route/entity/*`, `route/document/*`).
  - Каждый маршрут раскрывается: условие (`events`, `configuration.names`, `documentStates`, `dimensions`), `sinks`, `completionSinks`.
  - Sink раскрывается: для `ref` — рекурсивно дочерние sink groups (глубина до 5); для прямых — конфиг JSON и `mapping.js` (превью, до 4 КБ, с индикатором обрезки).
  - Модуль `src/routes.js` сканирует `@config-*` пакеты, резолвит `sinkGroup/*` (приоритет configuration над node_modules), кэширует результат в `ctx.projectCache.routes`.

## [0.7.5] - 2026-11-05

### Добавлено

- **Транзакция при применении сравнения документов.** `handleApplyCompareDocuments` снимает снапшот `ctx` (flow/config/csv/ui/auth) перед вызовом `applyDiff`. Если на любом шаге (`applyDiff` / `writeAll` / `writeUi` / `writeAuth` / `loadData` / `pushRender`) происходит ошибка:
  - `ctx` возвращается к снапшоту;
  - выполняется попытка привести файлы на диске обратно к снапшоту (`writeAll` / `writeUi` / `writeAuth`);
  - `webview` перерисовывается из снапшота;
  - пользователь видит сообщение «Сравнение не применено. Документ возвращён в исходное состояние: <причина>»;
  - ошибка пробрасывается дальше — `extension.js` откатывает снапшот истории (`history.popLastSnapshot`), поэтому undo-история не «съедает» неудавшуюся операцию.

  Раньше сбой на `writeAll` оставлял `ctx` частично изменённым: данные в памяти уже мутированы, а на диск записано не всё.

- **Тест на согласованность ключей локализации.** `src/locales-check.js` + `test/locales-check.test.js` проверяют, что наборы ключей `ru-RU` ↔ `en-US` в `media/locales/*.js` и `src/locales/*.js` совпадают. Ловит ситуацию «разработчик добавил ключ в один язык, забыл во второй» — без такой проверки `npm test` проходит, а при английском UI пользователь видит русский текст (fallback через `t()`).

  Ключи с префиксом `plural.*` из сравнения исключены: набор грамматических форм зависит от языка (русский — `one/few/many`, английский — `one/other`), различие — правильное поведение `Intl.PluralRules`, а не рассинхронизация. Рантайм-функция `plural()` использует fallback через `tryKeys`, поэтому отсутствие формы в целевом языке корректно обрабатывается.

  Проверка работает только в `npm test`. В UI расширения не выводится — это внутренняя проверка сборки расширения, а не свойство проекта пользователя.

### Технические детали

- `src/locales-check.js` — новый модуль, `checkLocales()`. Webview-локали загружаются через `vm.runInContext` с фейковым `window.PF_UI_LOCALES`, server-локали — обычным `require` с очисткой `require.cache`. Сортировка: сначала `webview`, потом `server`; внутри одинакового scope — по алфавиту.
- `src/handlers.js → handleApplyCompareDocuments` — снапшот/возврат в `try/catch`.
- `src/locales/ru-RU.js`, `src/locales/en-US.js` — ключ `msg.compare.rollback`.

### Тесты

- `test/locales-check.test.js` — 3 теста: расхождений в текущем проекте нет; каждое расхождение имеет корректную форму (`scope`, `key`, `side`); сортировка — `webview` перед `server`, ключи по алфавиту.

- Общее количество тестов: **197**.


## [0.7.4] - 2026-11-03

### Добавлено

- **Атомарная запись с бэкапом.** Все `write*` в `src/storage.js` пишут через `.documentFlow.tmp` + `renameSync` (atomic на уровне FS). Перед записью существующего файла сохраняется его предыдущая версия в `<dir>/.documentFlow.bak/<name>.1–3` (ротация: держится 3 последние версии). Внутри `.documentFlow.bak/` создаётся вложенный `.gitignore` с `*` — `git add .` не подсосёт бэкапы случайно.
  - Осиротевшие `.documentFlow.tmp` старше 5 минут чистятся в `loadData` (функция `cleanupStaleTmp`) — остаются, если VS Code упал между `writeFileSync` и `renameSync`.
  - `writeAll` возвращает `{ flow, config, csv }` — какие файлы реально перезаписаны (`writeIfChanged` пропускает неизменённые).

- **Undo/Redo с восстановлением `.js` файлов.** Кольцевой буфер на 30 снапшотов в `ctx.history` (сервер). Кнопки `↶` / `↷` в главном тулбаре, `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z` — тоже redo).
  - Снапшот включает `flow`, `config`, `csv`, `ui`, `auth` **и** содержимое `flowRules/*.js` + `UI/ClientAction/*.js`.
  - При undo/redo удалённые `.js` восстанавливаются, добавленные — удаляются, изменённые — перезаписываются через `writeIfChanged`.
  - `Ctrl+Z` игнорируется при фокусе в `<input>` / `<textarea>` / `contenteditable` (нативный undo в поле) и при открытой модалке (защита от несохранённых правок).
  - При `reload` история очищается.
  - `historyState` (`canUndo`, `canRedo`, `undoLabel`, `redoLabel`) передаётся клиенту через `DATA_JSON` при каждом `pushRender` — а не `postMessage`. Причина: `pushRender` заменяет `panel.webview.html`, iframe пересоздаётся, `postMessage` после этого может не дойти.

- **Автоудаление `ClientAction/*.js` при удалении перехода.** Когда удаляется переход (или состояние вместе с его переходами), файл `ClientAction/<actionToRunBefore>.js` из текущего документа удаляется, **если** на него больше не ссылается ни один оставшийся переход. Файлы из других пакетов не трогаются (ищутся только в `ctx`-документе). Срабатывает в `handleDeleteTransitions`, `handleDeleteState`, `handleEditState` (при снятии переходов).

### Исправлено

- **Undo не откатывал данные после пересоздания webview.** `historyState` через `postMessage` терялся после `pushRender` → кнопки undo/redo оставались навсегда disabled. Теперь передаётся в `DATA_JSON`.

- **Удалённые `.js` файлы не восстанавливались при undo.** Снапшот истории теперь включает содержимое `flowRules/` и `UI/ClientAction/`.

- **`Ctrl+Z` / `Ctrl+Y` не работали в русской раскладке.** Обработчик использовал `ev.key` (`Ctrl+я` вместо `Ctrl+z`). Теперь `ev.code` (`KeyZ` / `KeyY`) — не зависит от раскладки.

### Технические детали

- `src/history.js` — новый модуль: `init`, `pushSnapshot`, `popLastSnapshot`, `undo`, `redo`, `clear`, `getState`. Коллектор `collectJsFiles` читает `.js` из двух папок документа. `restoreDir` удаляет файлы, которых нет в снапшоте, и записывает все файлы из снапшота через `writeIfChanged`.
- `src/storage.js` — `writeIfChanged` через `.tmp` + `renameSync`, `backupExisting` с ротацией `.1–.3`, `cleanupStaleTmp`.
- `src/extension.js` — `MUTATING_TYPES` (список сообщений, идущих в историю), `labelForMessage` (метка для tooltip), `history.pushSnapshot` до `handler`, `history.popLastSnapshot` при ошибке. Dispatch `undo` / `redo`. Убраны все `postMessage({ type: 'historyState', ... })`.
- `src/handlers.js` — `collectActionsFromTransitions`, `deleteOrphanClientActions`. Вызовы в трёх handler'ах.
- `src/html.js` — `renderHtml` принимает `historyState` и кладёт в `DATA_JSON`.
- `media/index.html` — кнопки `#undoBtn` / `#redoBtn` в главный тулбар.
- `media/modules/icons.js` — иконки `undo` / `redo`.
- `media/modules/state.js` — поле `PF.state.historyState`, инициализация из `DATA.historyState` в `setData`.
- `media/modules/toolbar.js` — `updateHistoryButtons`, обработчики кнопок.
- `media/main.js` — `keydown` на `document.body` (с `ev.code`), `updateHistoryButtons` после `toolbar.init`.
- `media/modules/ui-i18n.js` — `updateHistoryButtons` при смене UI-языка.
- `media/locales/*.js`, `src/locales/*.js` — ключи `history.*` и `history.action.*`.

### Тесты

- `test/history.test.js` — 18 тестов:
  - init / getState / pushSnapshot / popLastSnapshot / clear;
  - undo / redo на данных (`flow`, `config`, `csv`);
  - limit 30, redo-стек очищается при новой мутации;
  - восстановление удалённого `ClientAction/*.js` при undo;
  - удаление добавленного `ClientAction/*.js` при undo;
  - восстановление удалённого `flowRules/*.js` при undo;
  - redo повторно удаляет `.js`.

- `test/storage.test.js` — +6 тестов:
  - `.gitignore` внутри `.documentFlow.bak/` создаётся и не перезаписывается;
  - `cleanupStaleTmp` удаляет старые (`>5 мин`), сохраняет свежие, no-op на отсутствующих, обрабатывает null/undefined;
  - несколько путей в одном вызове.

- `test/helpers/makeCtx.js` — добавлено поле `uiPath`, чтобы `history.undo` / `history.redo` могли писать `ui.json` в тестах.

## [0.7.3] - 2026-11-03

### Изменено

- **`write*` функции в `src/storage.js` не перезаписывают файлы, если
  содержимое не изменилось.** Раньше любое сохранение (`writeAll`,
  `writeFlow`, `writeConfig`, `writeUi`, `writeAuth`) писало все файлы
  подряд — даже если менялся только `configuration.json`, обновлялись
  и `documentFlow.json`, и `translation.csv`.
  Теперь:
  - общий хелпер `writeIfChanged(filePath, content)` читает текущее
    содержимое файла, сравнивает с новым, и вызывает
    `fs.writeFileSync` **только если содержимое отличается**;
  - если файла нет — пишется как обычно;
  - `ensureDir` вызывается только при фактической записи;
  - `writeAll` возвращает `{ flow: bool, config: bool, csv: bool }` —
    какие файлы реально перезаписаны. `writeFlow` / `writeUi` /
    `writeConfig` / `writeAuth` возвращают `bool`.
  - Существующие вызовы (`writeAll(ctx);` в `handlers.js` и др.)
    работают без правок — return value игнорируется.

### Практический эффект

- **Git diff чистый.** Правишь состояние в графе — меняется
  `documentFlow.ui.json`, но `documentFlow.json` / `configuration.json` /
  `translation.csv` остаются нетронутыми, если в них ничего не
  изменилось.
- **mtime не дёргается.** Файлы, которые не менялись, сохраняют
  исходный `mtime` — полезно для тех, кто отслеживает изменения через
  `stat`, hot-reload или file-watcher.
- **Меньше write-операций.** На больших `configuration.json` это
  заметно быстрее.

### Технические детали

- `writeIfChanged` пробрасывается через `module.exports` — доступен
  для тестов и будущих сценариев.
- Сравнение строковое (`===`) — без нормализации переносов строк.
  `JSON.stringify(..., 4)` и `serializeCsv` дают детерминированный
  вывод, так что лишних перезаписей не будет.

### Тесты

- `test/storage.test.js` — +5 тестов:
  - создаёт файл, если его нет;
  - создаёт вложенные папки при необходимости;
  - пропускает запись при идентичном содержимом (`false`);
  - перезаписывает при отличии (`true`);
  - `writeAll` на смешанном наборе: один файл меняется, два нет —
    `{ flow: false, config: true, csv: false }`, повторный вызов —
    всё `false`.

## [0.7.2] - 2026-10-31

### Добавлено

- **Визуальные маркеры начального и конечных состояний на графе.**
  - **▶** в левом верхнем углу — начальное состояние
    (`documentFlow.json → initialState`).
  - **■** в правом верхнем углу — терминальное состояние
    (`isTerminal: true`).
  - Если состояние одновременно и начальное, и конечное — оба маркера.
  - Маркеры двигаются вместе с прямоугольником при drag и при
    перемещении `Ctrl+стрелками`.
  - Маркеры не перехватывают клики (`pointer-events: none`) — клик
    по ним проходит на `<rect>` под ними.
  - Обводка прямоугольников **не добавлена** осознанно: зелёный и
    оранжевый цвет конфликтуют с цветом переходов на графе, а
    маркеров в углу достаточно для визуальной идентификации.

- **Селект «Начальное состояние» в граф-тулбаре.** Перед полем зума —
  выпадающий список всех состояний документа плюс пункт
  «— не задано —».
  - Выбор состояния → `initialState` в `documentFlow.json` обновляется,
    маркер ▶ переезжает на новое состояние, граф перерисовывается.
  - Выбор «— не задано —» → `initialState = ''`, маркер ▶ исчезает.
  - Опции селекта перерисовываются при смене языка данных (`🌐`) и
    UI-языка (`🖥`).
  - Раньше `initialState` менялся только правкой `documentFlow.json`
    вручную или через сравнение документов.

- **Валидация `initialState` при применении diff-а в сравнении
  документов.** Раньше `changeInitialState` мог установить
  `initialState` в значение, которого нет среди состояний текущего
  документа. Теперь:
  - при `changeInitialState` с непустым значением — проверка, что
    состояние существует в текущем `documentFlow.json` на момент
    применения;
  - если состояние отсутствует — `warning` и `applied` не
    инкрементится;
  - пустое значение (`''`) разрешено всегда (сброс `initialState`);
  - **`changeInitialState` переехал в конец очереди применения** —
    после всех `add*`, чтобы сценарий «добавить состояние + сделать
    его начальным одним apply» работал корректно.

### Изменено

- `src/compare-apply.js` — порядок применения (`ordered.sort`):
  `changeInitialState` с rank `1` переехал на `12`; `removeDocAttachment`,
  `addDocAttachment`, `removeGlobalActor` сдвинуты на `13`/`14`/`15`.
- `src/transforms.js → buildGraph` — `isTerminal` пробрасывается в
  каждый элемент `states[]` (рядом с `name`, `ru`, `trans`, `x`, `y`,
  `w`, `h`). До этого `isTerminal` был только в `buildTable` для
  табличного вида.
- `media/modules/graph-render.js` — при построении `<g class="g-state">`
  вычисляются `isInitial` / `isTerminal`, ставятся классы
  `.is-initial` / `.is-terminal`, `data-is-initial` / `data-is-terminal`,
  рисуются SVG-маркеры в углах.
- `media/modules/graph-drag.js → startDrag → onMove` — при перетаскивании
  состояния обновляется `transform` у маркеров (иначе маркер отстаёт
  от прямоугольника).
- `media/modules/toolbar.js` — новая функция `updateInitialStateSelect`,
  обработчик `change` на селекте, вызов из `applyViewMode` при входе в
  граф-режим, экспорт функции для перерисовки из `i18n.js` /
  `ui-i18n.js`.
- `media/modules/i18n.js → rerender` — вызов
  `PF.toolbar.updateInitialStateSelect()` при смене языка данных.
- `media/modules/ui-i18n.js → setLang` — то же при смене UI-языка.
- `src/handlers.js` — новый хендлер `handleSetInitialState(ctx, panel,
  stateName)`: валидирует имя, пишет `flow.initialState`,
  `writeFlow`, `loadData`, `pushRender`, показывает уведомление.
- `src/extension.js` — dispatch для `setInitialState`.
- `media/index.html` — `<label class="initial-state-label">` с
  `<select id="initialStateSelect">` перед полем зума.
- `media/main.css` — стиль `.initial-state-label`, стили
  `.g-state-marker` / `.g-state-marker-bg` / `.g-state-marker-icon`
  для SVG-маркеров.

### Технические детали

- Маркеры — SVG-элементы `<g class="g-state-marker">` внутри
  `<g class="g-state">`, а не HTML-overlay. Это позволяет двигать их
  `transform`-ом в `onMove` (в отличие от `rect` + `text`, которые
  двигаются через `setAttribute('x'/'y')`).
- Классы `.is-initial` / `.is-terminal` на `<g>` — для будущих
  стилевых вариаций (сейчас не используются, но упростят добавление
  hover-эффекта или подсветки в легенде).
- Селект использует `PF.i18n.label()` для перевода имени состояния —
  при смене языка данных опции перерисовываются.
- Хендлер `handleSetInitialState` пишет только `flow.initialState`
  (один ключ в `documentFlow.json`), не трогает `configuration.json`,
  `translation.csv`, `documentFlow.ui.json` — это атомарная операция
  над одним полем.

### Тесты

- `test/compare-apply.test.js` — +4 теста на `changeInitialState`:
  - к существующему состоянию применяется;
  - к отсутствующему — `warning`, `applied = 0`;
  - пустое значение сбрасывает без warning;
  - `addState` + `changeInitialState` в одном вызове — порядок
    корректный (state добавлен первым).

## [0.7.1] - 2026-10-31

### Изменено

- **`media/modules/routing.js` разделён на два файла** для тестируемости.
  - **`routing-core.js`** (новый) — чистые геометрические и маршрутные
    функции, не трогают `document` / `window` / `PF.state`:
    `rectsIntersect`, `chooseEdge`, `chooseEdgePair`, `pointOnEdge`,
    `findNearestEdge`, `snapToEdge`, `simplifyOrtho`,
    `buildRoundedPath`, `computeStubs`, `buildSimpleOrthoMiddle`,
    `segmentHitsRect`, `findFirstBlocker`, `corridorHit`,
    `buildDetourMiddle`, `segmentBlockedBetween`, `routeBetween`,
    `labelFromWaypoints`, `segPerp`, `findSegmentIndex`,
    `distToSegment`, константы `BASE_STATE_W` / `BASE_STATE_H` /
    `EDGE_PAD`.
  - **`routing.js`** (обёртка) — оставлены только state-зависимые
    функции: `rerouteAll`, `spreadParallelSegments`,
    `alignTransitions`, `optimizeTransitions`. В начале IIFE
    подгружает core через `require('./routing-core')` (Node) или
    `window.PF._routingCore` (webview).
  - **Публичный API `PF.routing` не изменился.** Собирается через
    `Object.assign({}, core, {...})` — все потребители
    (`graph-render.js`, `graph-drag.js`, `toolbar.js`, `matrix.js`)
    работают без правок.

- **UMD-обёртка в `routing-core.js`.** В браузере кладёт себя в
  `window.PF._routingCore`, в Node — `module.exports`. Один файл для
  webview и для тестов.

### Добавлено

- **`test/routing-core.test.js`** — 35 тестов на чистые функции
  маршрутизации. Без `jsdom`, без DOM, обычный `require` через UMD.

### Технические детали

- `media/index.html` — тег `<script src="{{JS_ROUTING_CORE}}">` перед
  `<script src="{{JS_ROUTING}}">`. Порядок загрузки обязателен.
- `src/html.js` — новый URI `jsRoutingCoreUri` и `replace` для
  `{{JS_ROUTING_CORE}}`.
- Тесты routing-core проверяют `chooseEdge`, `pointOnEdge`,
  `rectsIntersect`, `simplifyOrtho`, `buildRoundedPath`,
  `routeBetween`, `computeStubs`, `labelFromWaypoints`, `segPerp`,
  `findSegmentIndex`, `distToSegment`, `findNearestEdge`,
  `snapToEdge`, `chooseEdgePair`.

## [0.7.0] - 2026-10-31

### Добавлено

- **Тестовая инфраструктура.** `node --test` (встроенный test runner
  Node.js 20+), без внешних зависимостей. Скрипт `npm test` запускает
  все тесты из `test/`.
- **Покрытие серверной логики** — 100+ тестов на самые рискованные
  модули:
  - `src/utils.js` (`stripBom`, `indexOf`, `escapeHtml`);
  - `src/csv.js` (`parseCsv`, `serializeCsv`, roundtrip);
  - `src/transforms.js → buildTranslations` (все варианты языковых
    колонок, fallback en-US, ensureEn);
  - `src/compare-diff.js → buildDiff` (states, transitions, actors,
    permissions, attachments, docAttachments, initialState);
  - `src/compare-apply.js → applyDiff` (change/remove/add для всех
    сущностей, каскадные удаления, порядок применения, warnings);
  - `src/storage.js` (`normalizeSourceDocumentStates`,
    `loadDocumentForCompare`);
- **Хелперы для тестов**:
  - `test/helpers/mockVscode.js` — мок `require('vscode')`, чтобы
    серверные модули загружались в обычном Node без extension host;
  - `test/helpers/makeCsv.js` — быстрый конструктор CSV для тестов;
  - `test/helpers/makeDoc.js` — конструктор документа в памяти для
    `buildDiff`;
  - `test/helpers/makeCtx.js` — конструктор `ctx` с реальной структурой
    папок в `os.tmpdir()` (для `applyDiff`, где нужны `flowRules/`,
    `ClientAction/`, `authorization.csv`);
  - `test/helpers/docOnDisk.js` — конструктор документа на диске для
    `loadDocumentForCompare`.
- **`.gitignore`** — добавлена строка `test/tmp/` (запас на будущие
  тесты с временными файлами в проекте).

### Технические детали

- **Тесты не требуют VS Code.** Через `mockVscode` заменяется
  `Module._load` для `require('vscode')`. Все деструктуризации
  vscode-API при загрузке модуля получают заглушки, но в тестах ни
  один vscode-метод не вызывается.
- **Изоляция:** каждый тест `applyDiff` создаёт временную папку через
  `fs.mkdtempSync` и удаляет её в `finally`. Никаких общих состояний
  между тестами.
- **Быстрота:** весь набор (100+ тестов) проходит за **< 300 ms**.

### Известные непокрытые места

- `src/attachments.js`, `src/client-actions.js`, `src/flow-rules.js` —
  тонкие обёртки над `fs`, покрываются легко при необходимости.
- `src/compare-apply.js → addTransition` — ветки копирования
  `flowRules` и `ClientAction` не покрыты (сложность в создании файла
  в `<otherProductLevel>/flowRules/` — но добавление возможно).
- Клиентские модули (`routing.js`, `i18n.js`, `ui-i18n.js`,
  `forms.js`, `forms-other.js` и др.) — требуют jsdom или рефакторинга
  в pure-модули. План — в `HANDOFF.md`.

## [0.6.1] - 2026-10-30

### Добавлено

- **Переключатель языка интерфейса в тулбаре.** Рядом с селектором
  языка данных (`🌐`, синяя рамка) появился второй селектор
  (`🖥`, оранжевая рамка) — язык интерфейса расширения. Значения
  берутся из доступных `PF_UI_LOCALES` (`ru-RU`, `en-US`, …).
  Смена через тулбар пишет в настройку `adinsureDocFlow.uiLanguage`
  (Global или Workspace — где она уже была) и перерисовывает webview
  **без перезагрузки**: язык данных, позиции графа и текущее выделение
  сохраняются. Изменение настройки вручную через `settings.json`
  тоже подхватывается на лету.
- **Полная мультиязычность интерфейса.** Язык интерфейса расширения
  (кнопки, диалоги, подсказки, сообщения валидатора) больше не
  зашит в код.
  - Настройка VS Code `adinsureDocFlow.uiLanguage`: `auto` (по
    `vscode.env.language`), `ru-RU`, `en-US`.
  - Изменение настройки применяется на лету — webview и extension host
    перерисовываются через `onDidChangeConfiguration`.
  - **Независимость от языка данных.** Язык интерфейса и язык данных
    (селектор `🌐` из `translation.csv`) — два независимых механизма.
    Можно смотреть данные на македонском при английском интерфейсе.
  - Все UI-строки webview вынесены в `media/locales/<lang>.js`, все
    серверные сообщения — в `src/locales/<lang>.js`. Добавление нового
    языка — новый файл-словарь, без правок кода.
  - Плюрализация через `Intl.PluralRules` — «3 состояния» / «3 states»
    в шапке таблицы, при удалении, при копировании акторов и т.д.
  - Тех. имена полей (`Operations`, `Attachments`,
    `actionToRunBefore`, `allowOnValidationErrors`, `serverSideEvents`,
    enum-значения `all = true` / `codes` / `exceptForCodes`, `From`,
    `To`, `Create`/`Read`/`Update`/`Delete`) осознанно не переводятся.

- **HTML-шаблоны с data-i18n.** Заголовки модалок, labels, `<th>`,
  `placeholder`, `title` кнопок главного и граф-тулбара, легенда,
  кнопки Alert/Confirm — всё переведено через атрибуты
  `data-i18n`, `data-i18n-title`, `data-i18n-placeholder`. Применение —
  автоматически в `PF.utils.cloneTemplate`.

- **Все серверные сообщения локализованы.** `vscode.window.show*Message`
  и `throw new Error` в `handlers.js`, `attachments.js`, `extension.js`,
  `transforms.js` теперь идут через `src/ui-i18n.js`. Пример: при
  английском интерфейсе — `State "Draft" saved.`, при русском —
  `Состояние «Draft» сохранено.`.

- **Warnings в сравнении документов локализованы.** При применении
  diff-а предупреждения (например, отсутствие ClientAction в образце)
  приходят на языке интерфейса.

### Изменено

- `PF.ui` — новый клиентский движок (`media/modules/ui-i18n.js`):
  `t()`, `plural()`, `apply()`, `getLang()`, `isLang()`.
- `src/ui-i18n.js` — серверный движок с тем же API.
- `media/main.js` — `PF.ui.init(DATA.uiLanguage)` вызывается до остальных
  `init`, `PF.ui.apply(document)` — после.
- При отмене apply в сравнении сервер больше не присылает строку
  `error: 'Отменено пользователем.'`, а флаг `cancelled: true`. Клиент
  проверяет флаг, а не строку.

### Технические детали

- `src/ui-i18n.js` — резолв языка: `auto` → `vscode.env.language` →
  первая совпадающая локаль из `src/locales/` → `ru-RU` как fallback.
- `media/modules/ui-i18n.js` — `apply(root)` идёт по
  `[data-i18n]`, `[data-i18n-title]`, `[data-i18n-placeholder]`
  рекурсивно, включая сам корневой элемент.
- `media/modules/utils.js → cloneTemplate` вызывает `PF.ui.apply` на
  каждом клонированном шаблоне.
- `src/extension.js` — `onDidChangeConfiguration` слушает
  `adinsureDocFlow.uiLanguage`, при изменении перезагружает данные и
  `pushRender`.
- Переименован `src/compare.js` → `src/compare-diff.js` — чтобы не
  путать с клиентским `media/modules/compare.js`. Функциональность не
  затронута.

# [0.6.0] - 2026-10-22

## Добавлено

- **Сравнение двух документов.** Новая кнопка `⇄` в главном тулбаре. Сравнивает текущий документ с любым другим документом проекта (или папкой, указанной вручную) по:
  - состояниям (`isTerminal`, наличие/отсутствие, переводы);
  - переходам (`from`, `to`, `actionToRunBefore`, `serverSideEvents`, `allowOnValidationErrors`, наличие/отсутствие);
  - глобальным акторам (`documentFlow.actors`);
  - акторам в каждом состоянии (членство);
  - правам акторов (`allowComments`, операции, переходы, вложения);
  - вложениям документа (`configuration.attachments`);
  - `initialState`.

- **Выбор документа для сравнения:**
  - Список всех документов проекта (сканируются `configuration/@config-*` и `node_modules/@config-*`, дедуп по имени).
  - Кнопка «📁 Выбрать папку другого документа…» — для документов вне проекта.
  - Текущий документ помечен и исключён из списка выбора.

- **Панель diff-а — плоский список атомарных действий.** Каждое отличие — одна строка с глаголом (`Добавить`, `Удалить`, `Изменить`, `Разрешить`, `Запретить`, `Включить`, `Отключить`) и контекстом в скобках (`(объект в documentFlow.states)`, `(членство)`, `(свойство актора)`, `(право актора)`, `(право на вложение)` и т.д.). Имена элементов показываются с переводом текущего языка (селектор 🌐).

- **Применение изменений с образца на текущий.** Кнопка «Применить выбранное» + чекбоксы по каждому действию. Три режима выборки: «Выбрать всё кроме удаления», «Выбрать всё», «Снять все».

- **Сортировка порядка применения** (чтобы каскадное удаление не ломало ссылки):
  1. `change*` на свойствах документа/состояний/переходов;
  2. `change*` на правах акторов;
  3. `remove*` на правах акторов;
  4. `removeActorFromState`;
  5. `removeTransition`;
  6. `removeState`;
  7. `add*` акторов, состояний, членств, прав;
  8. `addTransition`;
  9. `removeDocAttachment` / `addDocAttachment`;
  10. `removeGlobalActor` — в самом конце.

- **Двойное подтверждение при удалении.** Клиентский `showConfirm` с разбивкой «добавить: X, удалить: Y, изменить: Z» + предупреждение «⚠ Удаление необратимо». Затем серверный `showWarningMessage` (modal) с явным «Продолжить / Отмена».

- **Копирование файлов при добавлении переходов:**
  - `flowRules/<transition>.js` — если в образце есть, копируется в текущий документ (если такого файла нет).
  - `ClientAction/<action>.js` — если у перехода есть `actionToRunBefore`, копируется файл из `document/<SrcDoc>/UI/ClientAction/`. Если файла в образце нет — предупреждение в списке `warnings`, переход всё равно добавляется.

- **Копирование авторизации.** Строки `Allow Actor` для второго документа копируются в текущий `authorization.csv` с заменой `CodeName` на имя текущего документа. Дубликаты (`role|actor|op`) пропускаются.

- **Переводы для новых элементов** — копируются для всех **общих** языковых колонок (есть `Translation_<lang>` и в текущем, и в образце). `en-US` = код. Новые языковые колонки не создаются.

## Исправлено

- **Серверный diff не учитывал `[object Object]`-акторов** — не применимо к этой фиче, но затронутый `src/storage.js → normalizeSourceDocumentStates` используется теперь и здесь (через `loadDocumentForCompare`).

## Изменено

- `src/compare.js` — новый модуль, чистая функция `buildDiff(currentCtx, otherDoc)` без записи файлов. Возвращает структуру всех отличий.
- `src/compare-apply.js` — новый модуль, `applyDiff(currentCtx, otherDoc, actions)`. Мутирует `ctx.flow` / `ctx.config` / `ctx.csv` / `ctx.auth` / `ctx.ui`. Файлы на диске пишет caller через `writeAll` / `writeUi` / `writeAuth`.
- `src/storage.js`:
  - `loadDocumentForCompare(flowPath)` — независимое чтение документа, не трогает `ctx`;
  - `listDocumentsForCompare(ctx)` — список документов проекта с `flowPath`;
  - обе функции в экспорте.
- `src/handlers.js`:
  - `handleListDocumentsForCompare(ctx)`;
  - `handleCompareDocuments(ctx, payload)`;
  - `handleApplyCompareDocuments(ctx, panel, payload)` — apply + запись + `reload`.
- `extension.js`:
  - новые dispatch-типы: `listDocumentsForCompare`, `compareDocuments`, `pickFolderForCompare`, `applyCompareDocuments`;
  - pre-confirm на `remove*` через `vscode.window.showWarningMessage` с modal.
- `media/index.html`:
  - кнопка `compareBtn` с `data-icon="compare"` (классы `primary compare-btn`);
  - шаблон `tpl-compare-picker` (селектор документа + file picker);
  - шаблон `tpl-compare-diff` (панель результата с footer-ом);
  - тег `<script src="{{JS_COMPARE}}">`.
- `media/modules/icons.js` — новая иконка `compare`.
- `media/modules/compare.js` — новый модуль: `openPicker`, `openDiff`, `init`, обработчик `window.message`.
- `media/main.js` — вызов `PF.compare.init()` в конце.
- `media/main.css` — стили `.compare-btn`, `.compare-picker-modal`, `.compare-diff-modal`, `.cmp-*` (header, body, sections, action-row, verb, detail, context, footer).
- `src/html.js` — подключение `{{JS_COMPARE}}`.

## Технические детали

- `buildDiff` не пишет файлы — только читает `otherDoc` (независимая копия через `loadDocumentForCompare`) и `ctx` (текущий).
- Порядок идемпотентен: повторный запуск `applyDiff` с теми же `actions` безопасен для `add*` (проверка на существование). Для `remove*` — повторное удаление даёт `warnings.push('уже отсутствует')`, `applied` не инкрементится.
- `removeState` вызывает каскадное `removeTransitionCascade` для всех переходов, ссылающихся на состояние. Для каждого перехода удаляются: объект из `flow.transitions`, строка из `translation.csv`, запись из `ui`, `config.transitions[name]`, ссылки в `config.states[].actors[].transitions`, файл `flowRules/<tr>.js`.
- `removeGlobalActor` дополнительно чистит `authorization.csv` — все `Allow Actor`-строки для этого актора в текущем документе.
- `copyTranslationForNew` не создаёт новых языковых колонок — работает только по общим.

## Известные компромиссы

- **Сопоставление по кодам.** `Draft` в A и `New` в B — разные состояния, даже если семантически одно. Соответствие по переводам или ручной маппинг — отдельная задача.
- **`change*` на переходах с `actionToRunBefore`** не копирует новый файл `ClientAction`. Если `A → B`, файл `B.js` не создаётся. Если нужно — отдельная итерация.
- **Позиции `ui.json`.** При добавлении новых состояний `ui` не обновляется автоматически — при следующем открытии в граф-режиме новые состояния получат позиции по авто-раскладке (`buildGraph` в `src/transforms.js` уже это умеет). Старые позиции не трогаются.
- **Справочник `AttachmentType`** (`masterEntity`) не синхронизируется. Он общий для всех документов — если в текущем проекте нет нужного типа, добавить его надо через кнопку `📎` вручную.
- **`documentRelation/*`** не синхронизируются — это отдельный уровень связей документов, не свойство конкретного документа.
- **Переводы новых элементов** — только для языков, которые есть в **обоих** `translation.csv`. Если в образце есть `mk-MK`, а в текущем — нет, значение не копируется (не создаём новую колонку автоматически).
- **`initialState`** — показывается как отдельное действие. Применение меняет `initialState` в `documentFlow.json` (просто строка с именем состояния). Никаких гарантий, что новое значение существует в текущем документе — apply проверит только через runtime, если что-то пойдёт не так.
- **`removeActorFromState`** удаляет актора из состояния, но не трогает `flow.actors` (глобальный список). Если у актора больше нет ни одного состояния — он останется в `flow.actors` до `removeGlobalActor`.

# [0.5.3] - 2026-10-22

## Добавлено

- **Ручки-полоски на крайних сегментах перехода.** Раньше полоски появлялись только на средних сегментах (у переходов с ≥3 промежуточными точками). Теперь полоски есть у **всех** сегментов, включая первый (`start → mid`), последний (`mid → end`) и единственный у прямого перехода из двух точек.

- **Перемещение сегментов стрелками.** Клик по полоске сегмента делает его «активным» (подсветка синим).
  - `Ctrl+↑/↓/←/→` — сдвиг на 1 px.
  - `Ctrl+Shift+↑/↓/←/→` — сдвиг на 10 px.
  - Движение идёт только **перпендикулярно** сегменту; стрелки вдоль оси игнорируются.
  - Приоритет над состояниями: если сегмент активен, `Ctrl+стрелки` двигают его, а не выделенные состояния.
  - `Escape`, клик по состоянию, переходу или фону — снимают активный сегмент.

- **Табличный вид для прав на вложения.** Блок Attachments в правах актора теперь таблица: `Тип вложения | Create | Read | Update | Delete` с заголовком и выровненными колонками. Длинные имена типов обрезаются с `…` (полное имя — в `title`). Если в документе нет вложений — вместо пустой шапки показывается сообщение.

## Исправлено

- **`data.csv` справочника AttachmentType терял коды при редактировании.** При добавлении нового типа или удалении существующего из `data.csv` пропадали строки, чей код не проходил регэксп `^[A-Za-z][A-Za-z0-9_]*$` — например, начинался с цифры, содержал дефис, точку, пробел. Теперь `readDataCsvRaw` читает первую колонку без фильтра по «валидности» — шапка определяется строго по первой ячейке `Code` (без учёта регистра), всё остальное сохраняется как данные.

- **Код вложения с пробелом.** `addAttachmentType` и `handleAddAttachmentType` теперь принимают пробел в коде (первый символ — по-прежнему буква). Регэксп `^[A-Za-z][A-Za-z0-9_ ]*$`.

- **Trailing newline в `data.csv`.** `saveAttachmentCodes` больше не добавляет `\n` в конец, если в исходном файле его не было. Формат файла сохраняется «как было».

- **Точка крайнего сегмента отрывалась от состояния при drag.** При перетаскивании полоски первого или последнего сегмента точка на состоянии двигалась вместе с сегментом в любую сторону — включая «отрыв» от прямоугольника. Теперь точка скользит **вдоль своей грани** и упирается в края (с отступом `PAD=10`, как у обычных ручек). Грань фиксируется в момент начала drag через `findNearestEdge`, не перескакивает во время перетаскивания.

## Изменено

- `PF.state.focusedSegment` — новое поле (`{ transitionName, segIdx } | null`). Живёт только в памяти вкладки, не персистится.

- `PF.render`:
  - `setSegmentFocus(transitionName, segIdx)` — установить активный сегмент, снять с предыдущего.
  - `clearSegmentFocus()` — снять активный сегмент.
  - `clearSelection()` теперь также очищает фокус сегмента.
  - `renderGraph()` валидирует фокус: если `transition` или `segIdx` больше не существуют (после авто-раскладки, удаления перехода, изменения waypoints) — фокус снимается автоматически. Активному сегменту проставляется класс `.active`.

- `PF.graphDrag`:
  - `startSegmentDrag` учитывает привязанность крайних точек к граням состояний через `applyAnchors` — сдвиг точки снапается на её исходную грань при каждом движении мыши.
  - `moveFocusedSegment(arrowKey, step)` — новая функция, двигает активный сегмент на перпендикуляр.
  - `attachGraphKeydown` — приоритет у активного сегмента; `Escape` снимает фокус.

## Технические детали

- `media/modules/graph-render.js`:
  - цикл полосок расширен с `for (let si = 1; si < lastIdx - 1; si++)` до `for (let si = 0; si < lastIdx; si++)`;
  - `hit.addEventListener('mousedown', ...)` на полоске вызывает `setSegmentFocus` перед `startSegmentDrag`;
  - `clearSegmentFocus` вызывается в обработчиках mousedown состояний и переходов.

- `media/modules/graph-drag.js`:
  - `startSegmentDrag` — собирает `anchors` (список точек сегмента, привязанных к граням), при каждом `onMove` пропускает новые координаты через `applyAnchors` → `snapToEdge` с исходной гранью;
  - `moveFocusedSegment` — проецирует вектор стрелки на перпендикуляр сегмента, при `|proj| < 0.01` (стрелка вдоль оси) — выход; для крайних сегментов снапает точку на грань.

- `media/modules/forms.js`:
  - `buildPermissionCard` — контейнер `.f-attachments` получает класс `.perm-attach-table`; перед строками вставляется шапка `tpl-attach-header`; если `meta.attachments` пусто — сообщение «В документе нет вложений»;
  - `.type` получает `title = at` (полное имя при наведении).

- `media/index.html` — новый шаблон `tpl-attach-header`.

- `media/main.css` — стили `.perm-attach-table` (grid 5 колонок: `minmax(160px,1fr) repeat(4, 90px)`), `.perm-attach-header` (uppercase, разделитель снизу), `.perm-attach-row` (monospace-имя с ellipsis), `.g-handles .g-transition-seg-handle.active` (подсветка активного сегмента).

## Известные компромиссы

- **Фокус сегмента сбрасывается при клике на состояние/переход/фон** — нельзя одновременно двигать сегмент и состояния. Осознанно: `Ctrl+стрелки` должны понимать, что двигать.

- **Грань фиксируется в момент начала drag.** Если тащить сегмент так, что точка формально оказывается ближе к другой грани того же состояния — она остаётся на исходной. Логика: грань не «перескакивает» под курсором.

- **Стрелки вдоль оси сегмента игнорируются.** Для горизонтального сегмента `Ctrl+←/→` не двигают, для вертикального `Ctrl+↑/↓` не двигают. Это защищает от неосмысленного поведения: сдвиг вдоль сегмента — это перемещение вдоль линии, а не перпендикулярно ей; для крайних сегментов это означало бы «отрыв» от грани.

- **Прямой переход из двух точек** — полоска одна, тащатся обе точки одновременно; каждая скользит по своей грани. Сдвиг возможен только вдоль оси, перпендикулярной линии: на горизонтальной линии — вертикальный, на вертикальной — горизонтальный.

# [0.5.2] - 2026-10-17

## Добавлено

- **Выбор языка переводов.** В главном тулбаре появился селектор `🌐` со списком языковых колонок из `translation.csv`.
  - Языки в порядке следования колонок CSV, `en-US` — всегда последним пунктом.
  - По умолчанию выбирается единственный не-английский язык, если он один; иначе первый не-английский; если языков нет — `en-US`.
  - Выбор хранится в памяти вкладки, между сессиями не сохраняется — при каждом открытии документа берётся язык по умолчанию. Переключение языка не перезагружает webview, все виды перерисовываются на клиенте.

- **Перевод данных на выбранный язык.** Переключение языка меняет отображение имён везде, где встречаются данные Adinsure:
  - **Граф** — вторая строка под именем состояния, подпись перехода.
  - **Таблица** — имя состояния в первой колонке, ячейки «Входящие/Исходящие», переходы в блоке прав, `links` (заголовки связанных документов).
  - **Матрица** — тултипы заголовков, тултипы заполненных ячеек, легенда сокращений.
  - **Вкладка «Акторы»** — имя актора в первой колонке, чипы состояний, чипы переходов.
  - **Формы** — селекты `To`, селекты акторов, заголовок модалки прав, форма «Копировать актора».
  - **Вложения** — селект при добавлении в документ, справочник, вложения документа, заголовок диалога режима прав, типы вложений в правах актора.
  - **Валидатор** — списки проблем (недостижимые, терминальные, отсутствие переводов, системные переходы, акторы без ролей) показывают `Code (перевод)`.
  - **Связи документов** — заголовки `targetDocument` читаются из чужих `translation.csv` со всеми языками.

- **Перевод на английский.** `en-US` отображается как `Name (Translation_en-US)`, даже если совпадает с кодом. Скобки скрываются, только если в CSV ячейка пустая (для `en-US` — пустая ячейка трактуется как имя).

- **Редактирование перевода в выбранную колонку.**
  - Поле перевода в формах аддитивно: при `mk-MK` сохраняет в `Translation_mk-MK`, при `ru-RU` — в `Translation_ru-RU`, и т.д.
  - При `en-US` поле перевода скрыто.
  - Заголовок поля — «Перевод MK-MK» / «Перевод en-US».

- **`actorTrans` / `actorTransAll`.** `buildTranslations` теперь читает `ItemType=actors` — имя актора в UI показывается с переводом.

- **`translationsAll` для `AttachmentType`.** Справочник вложений отдаёт карту `{ code: { lang: value } }`, добавление нового типа пишет в выбранный язык.

## Исправлено

- **Пропадал перевод при выборе `en-US`.** Раньше `en-US` не попадал в карту переводов, и `tr()` возвращал пустую строку — скобки в UI исчезали. Теперь `en-US` есть в карте всегда (fallback на имя, если в CSV пусто).

- **`[object Object]` в валидаторе связей.** `documentRelation/*/configuration.json` иногда содержит `sourceDocumentStates[].actors` как объекты `{actor: '...'}`, а код ожидал строки. Добавлена нормализация в `src/storage.js`.

- **`data.csv` справочника AttachmentType.** Файл может содержать несколько колонок через `\t` с шапкой; раньше каждая строка целиком попадала в «код» и в селекте типов вложений отображалось `Code\tdata.description`. Теперь читается первая колонка, шапка распознаётся (если первая ячейка не идентификатор или равна `Code`), при сохранении формат файла и все extras сохраняются, для новых кодов колонки, чьё имя содержит `description`, заполняются самим кодом.

- **Fallback на `ru-RU` в формах.** Раньше при пустом переводе на выбранный язык подставлялся русский. Теперь поле пустое — пользователь видит отсутствие перевода и может его заполнить.

- **Генератор каркаса (`openGenerateFlowForm`).** Существующие состояния/переходы заполняются переводом текущего языка (не `ru`-fallback). Шапки таблиц показывают «Перевод <lang>», колонка перевода скрыта при `en-US`.

- **Переименование не перетирает кастомный `en-US`.** При `rename` состояния/перехода значение `Translation_en-US` переписывается только если оно пустое или совпадает со старым кодом. Раньше `en-US` сбрасывался в новый код всегда.

- **`pickAttachmentCode` и `pickAttachmentMode`** показывают перевод текущего языка.

- **Тип вложения в правах актора (таблица и формы)** — с переводом.

## Изменено

- `PF.i18n` — новый модуль `media/modules/i18n.js`. Точка входа для переводов на клиенте:
  - `PF.i18n.tr(item)` — перевод текущего языка;
  - `PF.i18n.label(name, item)` — `Name (перевод)`;
  - `PF.i18n.setLang(code)` — переключение с перерисовкой;
  - `PF.i18n.init(languages, defaultLang)` — вызывается из `PF.state.setData`;
  - `PF.i18n.attachSelector()` — создаёт `<select>` в `#langSelectHost`.

- `src/transforms.js → buildTranslations` возвращает `stateTransAll` / `transTransAll` / `opTransAll` / `actorTransAll` (карта `{ name: { lang: value } }`) рядом с существующими `stateTrans`/`transTrans`/`opTrans` (для обратной совместимости форм).

- `src/transforms.js → buildMeta` добавляет `languages` и `defaultLang`, `attachmentTypeCatalog.translationsAll`.

- `src/transforms.js → buildTable` / `buildStateDetails` / `buildGraph` прокидывают `trans` в каждый item рядом с `ru`.

- `src/storage.js → loadAllDocumentTitles` отдаёт карту `{ lang: value }` вместо строки `ru`.

- `src/attachments.js → loadAttachmentType` отдаёт `translationsAll` рядом с существующим `translations`.

- `src/handlers.js` — `handleAddState` / `handleEditState` / `handleAddTransition` / `handleEditTransition` / `handleGenerateFlow` / `handleAddAttachmentType` принимают `lang` в payload и пишут в соответствующую `Translation_<lang>` колонку.

## Технические детали

- `src/transforms.js`:
  - `buildTranslations` — читает `ItemType=actors`; `ensureEn` гарантирует `en-US` в карте для всех item'ов, даже если колонки нет в CSV.
  - `pickTrCol` (в `attachments.js`) — выбор колонки под язык с fallback на `ru-RU` → первую не-`en` колонку.
- `src/attachments.js`:
  - `readDataCsvRaw` / `saveAttachmentCodes` — чтение и запись `data.csv` с произвольным числом `\t`-колонок, сохранение шапки и extras.
- `media/modules/i18n.js` — единая точка для label/tr/переключения; `rerender` вызывает `renderGraph`/`renderTable`/`matrix.render`/`actors.render`/`legend`.
- `media/index.html` — `{{JS_I18N}}` в `<head>`, `<div id="langSelectHost">` в `#mainToolbar`, `data-tr-field`/`data-tr-label` в шаблонах форм, `data-tr-col`/`data-tr-td` в шаблоне генератора.

## Известные компромиссы

- **UI-текст расширения не переводится.** Кнопки, тултипы, диалоги `showConfirm`/`showAlert`, легенда графа, подписи полей форм — на русском, независимо от выбранного языка данных. Локализация интерфейса расширения — отдельная задача.

- **Диалоги переименования/удаления актора** (`onRenameActor`, `onDupActor`, `onDelActor`) показывают чистый код — пользователь меняет код, а не перевод.

- **`onAddTransitionToActor`** — опция `Transition [From → To]` показывает коды состояний, для ориентировки.

- **`openRelationsForm`** не показывает перевод `targetDocument` в самом заголовке карточки — только в списке проблем валидатора и в `links` прав актора, где заголовок проходит через `PF.i18n.label`. `sourceDocumentStates` в карточке показывает реальные имена (нормализованные из `[object Object]`).

- **`data.csv` с разделителем не `\t`** не поддерживается — по договорённости, всегда табуляция.

# [0.5.1] — 2026-10-17

## Исправлено

- **Парные переходы A↔B больше не накладываются друг на друга** после нажатия «Авто-раскладка переходов».
Раньше `optimizeTransitions` перебирал грани для каждой стороны независимо и часто ставил обе на одну и ту же грань;
теперь парные переходы обрабатываются отдельным проходом, грани для каждой стороны выбираются совместно.
- **Пропали самопересечения внутри пар.** Варианты, в которых `A→B` и `B→A` пересекаются, штрафуются
жёстко (`selfCross * 100000`) — если есть чистый вариант, он побеждает.
- **Пропали наложения линий в паре.** Кандидаты с общим коллинеарным сегментом внутри пары отсеиваются сразу,
    а не штрафуются; для этого добавлен детектор `segOverlap` / `countOverlaps` (обычный `segCross` коллинеарные наложения не видел).
- **Стрелка пары указывает в правильную сторону.** Был баг: вторая сторона пары строилась от `to`-состояния к `from`-состоянию, и `marker-end` вставал не туда.
- **Переходы между двумя соседними состояниями больше не уходят в обход.** Точки выхода/входа теперь можно смещать вдоль грани (`±15px`),
    и если центр грани занят другой линией, переход остаётся на той же грани, а не уходит на боковую.
- **Линии без препятствий снова начинаются в центре грани.** Добавлен микро-штраф за величину смещения, из-за которого `±15` теперь выбирается только когда реально помогает.
- **`alignTransitions` убирает «почти-коллинеарные» коленца** — узлы, лежащие в пределах `5px` от прямой между соседями, удаляются. Раньше убирались только строго прямые изгибы.
- **Вход/выход перехода всегда перпендикулярен грани.** `computeStubs` теперь добавляет отступ всегда, а не только когда цель «впереди»; вдоль-грани и входы-в-угол пропали
    на уровне геометрии, а не штрафа.

## Изменено

- `optimizeTransitions`: одиночный проход перебирает `4 × 4` грани `× 3 × 3` смещения вдоль грани; парный — `4 × 4 × 4 × 4` грани `× 6 × 6` смещения.
    Оценочная функция включает длину, пересечения с третьими переходами, наложения и самопересечения пары.

## Технические детали

- `media/modules/routing.js`:
  - `computeStubs` — отступ теперь безусловный.
  - `optimizeTransitions` — парный проход + `segOverlap` / `countOverlaps` + смещения вдоль грани в обоих проходах.
  - `alignTransitions` — сглаживание коленец с порогом `TOL_CLEAN = 5`.

## Известные компромиссы

- Парный перебор стал заметно тяжелее (до `9216` комбинаций на пару за итерацию). На больших графах (десятки пар) кнопка может считать 1–2 секунды.
    Если станет критично — уменьшим `OFFS` до `[-15, 0, 15]` или ограничим набор граней разумными направлениями.

## [0.5.0] — 2026-10-16

### Добавлено
- **Режим «Акторы»** — четвёртый режим просмотра (таблица → граф →
  матрица → акторы → таблица). Таблица из трёх колонок:
  - **Актор** — имя + кнопки `✎` (переименовать), `🔑` (авторизация),
    `⧉` (копировать), `×` (удалить);
  - **Состояния** — чипы состояний, где актор присутствует. Клик по чипу
    открывает модалку прав актора в этом состоянии. Крестик на чипе —
    убрать актора из состояния. Кнопка `＋ Состояние` — добавить.
  - **Переходы** — чипы всех переходов актора (плоский union по всем
    состояниям). Клик — открыть форму перехода. Крестик — убрать переход
    у актора. Кнопка `＋ Переход` — добавить (если у актора нет записи
    в состоянии-источнике перехода, запись создаётся автоматически).
- **Модалка прав актора в состоянии** — переиспользует существующую
  карточку прав: комментарии, операции, переходы (чекбоксы по исходящим),
  вложения. Поле выбора актора и кнопка удаления скрыты.
- **Модалка авторизации актора** (`🔑`) — чекбоксы ролей. Роли берутся
  из объединения:
  - `configuration/@config-*/application-user-group/authorization/groupAuthorization.csv`
    (все пакеты в `configuration/`, `node_modules/` не трогаем);
  - `authorization.csv` текущего документа (`ApplicationRole` для этого
    документа, `ConceptTypeName = DocumentConfiguration`,
    `PermissionType = Allow Actor`).
  Отмеченные роли → строки в `authorization.csv`. Снятые — удаляются.
- **Переименование актора** (`✎`) — обновляет ссылки во всех местах:
  - `documentFlow.json → actors[]`;
  - `configuration.json → states[].actors[].actor`;
  - `translation.csv` (`ItemType=actors` — `TranslationKey`, `Expression`,
    `Translation_en-US`);
  - `authorization.csv` (`AssignedPermission`).
- **Копирование актора** (`⧉`) — создаёт копию под новым именем со всеми
  записями во всех состояниях. Неучтённые свойства (например, `uiSchema`)
  переносятся через `JSON.parse(JSON.stringify())`.
- **Удаление актора** (`×`) — убирает актора:
  - из `documentFlow.json → actors[]`;
  - из всех `configuration.json → states[].actors[]`;
  - из `translation.csv` (строки `ItemType=actors`);
  - из `authorization.csv` (все `Allow Actor` строки для этого документа).
- Новый модуль `src/authorization.js` — `collectGroupRoles(projectRoot)`
  (собирает уникальные роли из `groupAuthorization.csv`).
- Новая иконка `actors` для переключателя вида.

### Изменено
- `viewToggle` теперь переключает **четыре** режима по циклу:
  таблица → граф → матрица → акторы → таблица. Иконка показывает
  следующий режим.
- `buildAuthMeta` расширен: возвращает `actorRoles` (роли каждого актора
  в текущем документе) и объединённый `allRoles` (из `authorization.csv` +
  `groupAuthorization.csv`).
- `PF.state.viewMode` сохраняет и `'actors'` в `persistState`.

### Исправлено
- **Авторизация и сохранение extras при добавлении и удалении актора.**
  Раньше при удалении актора строка оставалась в таблице (запись жила
  в `translation.csv`), а при копировании/переименовании терялись
  нестандартные поля вроде `uiSchema`.
- Из `src/authorization.js` убрана зависимость от `./utils` и `./csv`:
  в среде `adinsure-studio` патченный `require` резолвил `require('./utils')`
  в вебвью-версию `media/modules/utils.js`, что давало
  `ReferenceError: window is not defined` при старте расширения.

### Технические детали
- Новый модуль `media/modules/actors.js` (`PF.actors.render`,
  `.attachHandlers`, `.collectActors`, `.collectStatesByActor`,
  `.collectTransitionsByActor`, `.openStatePermForm`, `.openActorAuthForm`).
- Новые хендлеры: `handleAddActor`, `handleDeleteActor`,
  `handleAddStateToActor`, `handleDeleteStateFromActor`,
  `handleAddTransitionToActor`, `handleDeleteTransitionFromActor`,
  `handleEditActorPerm`, `handleDuplicateActor`, `handleRenameActor`,
  `handleSaveActorAuth`.
- Плейсхолдер `{{JS_ACTORS}}` добавлен в `src/html.js` и `media/index.html`.
- `collectGroupRoles` вызывается один раз при построении кеша проекта
  (`ctx.projectCache.groupRoles`), импорт поднят на верхний уровень
  `src/storage.js`, чтобы не зависеть от ленивого `require`.

## [0.4.5] — 2026-10-16

### Добавлено
- **Матрица переходов** — третий режим просмотра (таблица → граф → матрица).
  Строки и столбцы — состояния, на пересечении — переход «из строки в столбец».
  - 3-буквенные сокращения (генерируются автоматически, с разрешением коллизий);
  - ячейка с переходом — иконка-стрелка, тултип с именем перехода и RU-переводом;
  - пустая ячейка — двойной клик создаёт переход «i → j» с автозаполнением;
  - заполненная ячейка — двойной клик открывает форму перехода;
  - клик по заголовку строки/столбца — редактирование состояния;
  - диагональные ячейки и строки терминальных состояний — серые неактивные,
    без взаимодействия;
  - справа — компактная легенда сокращений (код + полное имя + RU).
- Новая иконка `matrix` для переключателя вида и `matrixCell` для ячеек.

### Изменено
- `viewToggle` теперь переключает **три** режима по циклу: таблица → граф →
  матрица → таблица. Иконка кнопки показывает следующий режим.
- `applyViewMode` учитывает `viewMode === 'matrix'`, при переключении
  рендерит матрицу и навешивает обработчики.

### Технические детали
- Новый модуль `media/modules/matrix.js` (`PF.matrix.render`, `.attachHandlers`,
  `.makeAbbrs`).
- Разметка матрицы построена на CSS Grid, а не `<table>` — ячейки строго
  квадратные на любой теме и при любом контенте.
- Плейсхолдер `{{JS_MATRIX}}` добавлен в `src/html.js` и `media/index.html`.

## [0.4.4] — 2026-10-15

### Исправлено
- **Сохранение неучтённых свойств.** Раньше при редактировании состояния
  или перехода все поля, которыми не управляет форма, молча терялись —
  например `uiSchema`, `availableActivityTypes`, `ui` у акторов. Теперь
  они сохраняются как есть:
  - у акторов — все свойства, кроме управляемых формой
    (`actor`, `allowComments`, `operations`, `transitions`,
    `attachmentsRestrictions`), переносятся в новый объект без изменений;
  - у переходов — все свойства, кроме управляемых
    (`name`, `from`, `to`, `actionToRunBefore`, `broadcastEvent`,
    `allowOnValidationErrors`).
- **`transitionEffects` из `configuration.json`** (`transitions` — это
  объект, не массив) теперь корректно переносится при переименовании
  перехода и удаляется при удалении перехода или состояния.

### Изменено
- Убрана лишняя пустая строка в конце JSON-файлов при сохранении.
  Раньше `documentFlow.json`, `configuration.json`, `documentFlow.ui.json`
  записывались с `+ '\n'`, что давало лишнюю строку в diff'ах, если
  исходные файлы были без завершающего перевода строки. Теперь
  запись идёт без него.

### Технические детали
- В `src/transforms.js` добавлены `extractActorExtra(a)` и
  `extractTransitionExtra(t)`, а также константы управляемых ключей
  `ACTOR_MANAGED_KEYS` / `TRANSITION_MANAGED_KEYS`.
- `buildActorConfig(p, original)` принимает оригинальный объект актора
  и мержит его extras поверх собранного — но только те ключи, которых
  нет среди управляемых.
- `buildStateDetails` кладёт `__extra` в каждый объект `permissions[]`.
- `buildGraph` кладёт `__extra` в каждый переход и дополнительно
  отдаёт `transitionEffects` (собранные из `configuration.json`).
- В `src/storage.js → loadData` добавлен сбор `ctx.transitionEffects`.

## [0.4.3] — 2026-10-13

### Добавлено
- **Легенда действий в граф-режиме.** Кнопка-книжка в граф-тулбаре
  открывает/закрывает перемещаемый док с подсказками:
  - **Состояния**: drag, double-click, right-click, Ctrl+Click, Ctrl+стрелки;
  - **Переходы**: double-click, Alt+double-click (добавить промежуточную точку);
  - **Рисование перехода**: начало, завершение (клик на целевом состоянии), отмена (Escape);
  - **Ручки выделенного перехода**: drag крайних/средних точек, удаление точки, сдвиг сегмента;
  - **Общее**: Ctrl+wheel (зум), drag фона (панорама), Delete, Escape.
- Док легенды перетаскивается за заголовок, изменяется по размеру
  (правый нижний угол), скрывается крестиком. Позиция и состояние
  (видима/скрыта) сохраняются в `persistState`.
- По умолчанию легенда **видима** при первом открытии панели.

### Технические детали
- Новый модуль `media/modules/legend.js` — `PF.legend.init/show/hide/isVisible`.
- В `PF.state` добавлены `legendVisible` и `legendPos`, сохранены в `persistState`.
- Новая иконка `book` в `media/modules/icons.js`.
- Подключение модуля в `media/index.html` + `src/html.js` (плейсхолдер `{{JS_LEGEND}}`).

## [0.4.2] — 2026-10-13

### Исправлено
- **Ручные переходы теперь тянутся за состояниями.** Раньше при перемещении
  состояния крайние точки ручного перехода (`manualWaypoints`) оставались
  на старом месте, и связь «отрывалась». Теперь при `rerouteAll` крайние
  точки привязываются к границе текущей позиции `from`/`to`-состояний,
  средние точки сохраняют форму маршрута.

## [0.4.1] — 2026-10-09

### Добавлено
- **Управление вложениями** (кнопка с иконкой 📎 в тулбаре).
  Работа с мастер-энтити `configuration/@config-*/infrastructure/masterEntity/AttachmentType/`:
  - список всех типов вложений с RU-переводами (парсинг `data.csv`
    и `translation/translation.csv`, порядок колонок и языков — любой);
  - **добавление типа** в справочник (пишет в `data.csv` и `translation.csv`);
  - **удаление типа** из справочника;
  - **реальная отмена** добавления — до закрытия модалки запись удаляется
    из файлов при клике `↩`.

- **Управление вложениями документа** (`configuration.json → attachments[]`):
  - **добавить вложение** с выбором режима прав:
    * не проставлять;
    * «всем на чтение» — акторам, у кого уже есть любое вложение с `Read`;
    * «по шаблону» — у каждого актора копируются права его первого вложения;
  - **удалить вложение** — из `attachments[]` и из
    `attachmentsRestrictions` всех акторов всех состояний.

- **`showPrompt` в `PF.utils`** — простой модальный диалог ввода строки
  (используется при создании/переименовании `ClientAction`, добавлении
  нового типа вложения).

### Изменено
- **Таблица состояний.** Отдельная колонка с кнопками «редактировать / удалить»
  убрана. Редактирование теперь по клику на название состояния, удаление —
  кнопкой `×` рядом с названием.
- **Права актора — переходы.** Текстовое поле «коды через запятую» заменено
  на **таблицу чекбоксов** со списком всех исходящих переходов состояния.
  Ручной ввод кода больше не нужен. Список обновляется «на лету», когда
  в той же форме редактируются исходящие переходы (добавление, переименование,
  удаление). Переходы, которые были у актора, но больше не являются
  исходящими, показываются отдельным блоком «Больше не исходящие» и
  удаляются из актора при сохранении (с предупреждением из `validatePermissions`).
- **`buildMeta`** больше не добавляет дефолтные типы вложений
  (`Application`, `UnderwritingDecision`, `Contract`, `OtherDocument`).
  Список вложений документа — только то, что реально в `configuration.json
  → attachments[]`.
- **Футер модалок** сделан `position: sticky` — кнопки «Отмена / Сохранить»
  остаются внизу видимыми при прокрутке длинных форм (особенно «Права»).

### Технические детали
- Новый модуль `src/attachments.js`: поиск `AttachmentType` в проекте,
  чтение `data.csv` (одна колонка), парсинг и запись `translation.csv`.
- Новые хендлеры: `handleAddAttachmentType`, `handleRemoveAttachmentType`,
  `handleAddAttachmentToDoc`, `handleRemoveAttachmentFromDoc`.
- Новая иконка `paperclip` в `media/modules/icons.js`.
- В `media/modules/forms.js` функция `buildPermissionCard` принимает
  `getOutgoingNames` — функцию-поставщик списка исходящих переходов
  (для динамического рендера чекбоксов).
- `.modal .actions` теперь имеет `position: sticky; bottom: -20px`.

### Исправлено
- В таблице состояний при редактировании отображался лишний текст
  (название состояния дублировалось вне ссылки-редактирования).

## [0.4.0] — 2026-10-09

### Добавлено
- Раздел **«Вложения»** (кнопка в тулбаре). Работает с мастер-энтити
  `configuration/@config-*/infrastructure/masterEntity/AttachmentType/`:
  - список всех типов вложений с RU-переводами;
  - добавление типа в справочник (пишет в `data.csv` + `translation/translation.csv`),
    с отменой в течение сессии;
  - удаление типа из справочника.
- Управление вложениями документа (`configuration.json → attachments[]`):
  - добавить вложение с режимом прав:
    * не проставлять;
    * «всем на чтение» — тем акторам, у кого уже есть любое вложение с `Read`;
    * «по шаблону» — у каждого актора копируются права его первого вложения;
  - удалить вложение — из `attachments[]` и из `attachmentsRestrictions`
    всех акторов.
- Модуль `src/attachments.js` — чтение/запись `AttachmentType`, парсинг
  `translation.csv` с любым порядком колонок.
- Хендлеры: `handleAddAttachmentType`, `handleRemoveAttachmentType`,
  `handleAddAttachmentToDoc`, `handleRemoveAttachmentFromDoc`.
- В `PF.utils` добавлен `showPrompt` — простой диалог ввода строки (уже был).

### Изменено
- `buildMeta` больше не добавляет дефолтные типы вложений
  (`Application`, `UnderwritingDecision`, `Contract`, `OtherDocument`).
  Список вложений документа — только то, что реально в
  `configuration.json → attachments[]`.

## [0.3.1] — 2026-10-09

### Добавлено
- Валидатор: новая секция «Системные переходы (только System / ServiceExecutor)».
  Переход, доступный только акторам `System` / `ServiceExecutor` (или вообще никому),
  должен иметь `broadcastEvent.serverSideEvents = true`. Список акторов —
  константа `SERVER_SIDE_ONLY_ACTORS` в `media/modules/forms-other.js`
  (легко расширяется).
- Поиск связей (`documentRelation`) теперь идёт по всему проекту — и в
  `configuration/@config-*/*`, и в `node_modules/@config-*/*`, а не только
  внутри текущего пакета. Это позволяет видеть межпакетные связи.
- В модалке «Связи» связи разделены на **исходящие** (наш документ → другие)
  и **входящие** (другие → наш документ). У каждой карточки показан пакет-источник.
- Дубли одного и того же `documentRelation/<Name>` в разных пакетах помечаются
  бейджем «дубль» и попадают в список проблем.
- Кнопка **«📄 ClientAction»** рядом с полем `actionToRunBefore` в модалке
  редактирования перехода. Открывает файл
  `<packageRoot>/document/<DocName>/UI/ClientAction/<action>.js` в редакторе;
  если файла нет — предлагает создать из шаблона.
- Новый модуль `src/client-actions.js` — пути, шаблон, запись, поиск по всему
  проекту (`<pkg>/document/<AnyDoc>/UI/ClientAction/<name>.js`) как fallback.
- Новый хендлер `handleOpenClientAction` + сообщение вебвью `openClientAction`.
- В форме перехода поле `actionToRunBefore` очищается, если файл
  `ClientAction/<action>.js` не найден — чтобы визуально не путать
  со ссылкой на существующую функцию. Значение в `documentFlow.json`
  не меняется.
- Кнопка `🗑` рядом с полем `actionToRunBefore` — удаляет
  `ClientAction/<action>.js` (с подтверждением). Значение
  `actionToRunBefore` не трогает.
- Поле `actionToRunBefore` в форме перехода теперь показывается как
  readonly-текст. Никакого редактирования в самом поле — все действия через
  кнопки рядом:
  - `＋ Создать` — задать имя (диалог) и создать файл (или привязать
    существующий);
  - `📄` — открыть файл в редакторе;
  - `✎` — переименовать файл на диске (диалог ввода нового имени,
    переименование выполняется сразу);
  - `🗑` — удалить файл (с подтверждением).
  Значение `actionToRunBefore` в `documentFlow.json` записывается при
  сохранении формы перехода — ровно то, что показано в поле.
- Новые хендлеры: `handleCreateClientAction`, `handleRenameClientAction`.
  В `src/client-actions.js` добавлена `renameClientAction`.
- В `PF.utils` добавлен `showPrompt` — простой диалог ввода строки.

### Исправлено
- Таблица не отображалась полностью (только первое состояние или пустая)
  для документов, где `operations` у актора в `configuration.json` записаны
  как массив строк (`["Save"]`) — затрагивало fnol и MIC. Причина —
  `buildTable` / `buildStateDetails` не нормализовали форму `operations`,
  из-за чего фронт падал на `undefined.name`. Добавлены хелперы
  `normalizeOperationName` / `normalizeTransitionName` в `src/transforms.js`
  и guard'ы в `media/modules/table.js`.
- `documentFlow.json` → `states[].operations` теперь нормализуется в массив
  объектов `{ name, exclusiveToAssignedUser }` при сохранении состояния
  через форму (было — массив строк). Консистентно с `configuration.json`.
- Дедупликация пакетов: `configuration/@config-halyk/<pkg>` и
  `node_modules/@config-halyk/<pkg>` больше не считаются двумя разными
  пакетами — это один пакет, берётся первая найденная копия.
- Одноимённый `documentRelation` в `configuration/@config-*` и в
  `node_modules/@config-*` больше не считается дублем. Это override:
  приоритет у версии из `configuration/`, базовая помечается как перекрытая
  (бейдж «override: @config-standard/…»).
- Реальный дубль — только когда одноимённые `documentRelation` лежат
  в двух `configuration`-пакетах (или в двух `node_modules`-пакетах).

### Технические детали
- Имя файла — ровно значение `actionToRunBefore` из `documentFlow.json`
  (`onBeforeESBDDataCheck`, `whateverName`, что угодно) + `.js`.
- Если локальный файл в текущем документе не найден, выполняется fallback-поиск
  по всем `@config-*` пакетам проекта. Если найден в чужом пакете — открывается
  он. Если не найден нигде — предлагается создать локально

## [0.3.0] — 2026-10-07

### Добавлено
- **Интеграция с `flowRules/`** — папка рядом с `documentFlow.json`,
  в которой лежат js-файлы с именами переходов
  (`flowRules/Draft_UnderReview.js` и т.п.).
- В модалке редактирования перехода — кнопка **«📄 flowRules»**:
  открывает соответствующий `.js` в редакторе VS Code; если файла нет —
  предлагает создать из шаблона:

      'use strict';

      module.exports = function rule(input) {
          // TODO: implement rule for transition <Name>
          return true;
      };

- Новый backend-модуль `src/flow-rules.js` (пути, чтение/запись,
  rename, delete, шаблон).
- Новый хендлер `handleOpenFlowRule` + сообщение вебвью `openFlowRule`.

### Изменено
- **Переименование перехода** (`handleEditTransition`, `handleEditState`)
  автоматически переименовывает одноимённый файл в `flowRules/`.
- **Удаление перехода** (`handleDeleteTransitions`) удаляет
  одноимённый файл в `flowRules/`.
- **Удаление состояния** (`handleDeleteState`) и **снятие переходов
  при редактировании состояния** (`handleEditState`) удаляют
  соответствующие файлы в `flowRules/`.
- **`generateFlow`** удаляет `flowRules`-файлы для снятых переходов.
- Тексты подтверждения в модалках удаления состояния/переходов
  предупреждают об удалении `flowRules`-файлов.

## [0.2.0] — 2026-10-07

### Изменено
- **Рефакторинг вебвью**: монолитный `media/main.js` (~700 строк) разбит
  на модули `media/modules/*` (IIFE, общий namespace `window.PF`).
  Выделены: `state`, `utils`, `icons`, `relations`, `routing`,
  `graph-layout`, `graph-drag`, `graph-render`, `forms`, `forms-other`,
  `toolbar`, `table`. `main.js` теперь — тонкий bootstrap (~14 строк).
- **`PF.app` очищен**: из него убраны все «свалочные» экспорты форм
  и drag-and-drop. Осталось только `PF.app.applyViewMode` (app-level).
- **`PF.drag` → `PF.graphDrag`**: модуль `graph-drag.js` теперь
  экспортирует только `PF.graphDrag` (14 функций). Блок «Совместимость»
  с `PF.app.startDrag` и т.п. удалён.
- **`PF.table`** — новый модуль `media/modules/table.js`, содержит
  `permKey`, `renderCellGroups`, `makePermSection`, `makePermSectionList`,
  `renderPerms`, `renderTable`, `applyAllCollapsed`, `updateSortIndicator`,
  `init`. Все обращения к таблице — через `PF.table.*`.
- **`PF.state.setData(DATA)`** — единая точка инициализации данных
  в вебвью. `main.js` больше не пишет напрямую в
  `PF.state.DATA / meta / stateDetails / graphData`.
  `graphData` остаётся deep-clone (мутации drag'а не задевают `DATA.graph`).
- **Все вызовы форм** переведены на прямые `PF.forms.*` / `PF.formsOther.*`
  (без промежуточного `PF.app.*`).

### Технические детали
- Порядок загрузки скриптов в `media/index.html`:
    state → icons → utils → relations → routing → graph-layout
    → graph-drag → forms → forms-other → graph-render
    → toolbar → table → main
- `{{JS_TABLE}}` добавлен в `src/html.js` (URI + `.replace`).
- `acquireVsCodeApi()` вызывается ровно один раз — в `state.js`.

### Добавлено
- Модуль `media/modules/table.js`.
- Метод `PF.state.setData(DATA)` в `media/modules/state.js`.

### Удалено
- Экспорты `PF.app.startDrag`, `PF.app.startHandleDrag`,
`PF.app.startEndPointDrag`, `PF.app.startSegmentDrag`,
`PF.app.startTransitionDraw`, `PF.app.removeWaypoint`,
`PF.app.attachGraphSvgHandlers`, `PF.app.attachGraphKeydown`.
- Экспорты форм через `PF.app.*` (дубли `PF.forms.*`).
- Экспорт `PF.app.applyAllCollapsed` (переехал в `PF.table`).
- Экспорт `PF.drag` (переименован в `PF.graphDrag`).

### Совместимость
- Публичный интерфейс расширения (команда `policyFlow.showTable`,
формат файлов проекта) **не менялся**. Обновление безопасно.
- Все изменения затрагивают только внутреннюю структуру вебвью.

## [0.1.1] - 2026-10-01


### Added

- **Добавление промежуточной точки.** Alt + двойной щелчок на линии
- **Удаление промежуточной точки.** Правая кнопка мыши на точке


## [0.1.0] - 2026-10-01

Изменения по графу

### Added

- **Ручное перетаскивание маршрута перехода.** У выделенного перехода
  на всех точках появляются ручки-кружки:
  - **крайние точки** — при перетаскивании привязываются к ближайшей
    грани исходного/целевого состояния (вход/выход можно перенести
    на любую сторону);
  - **промежуточные точки** — свободное перемещение.
  Переход помечается как ручной, в подписи появляется иконка `✎`.
- **Полоски-ручки на средних сегментах.** Фиолетовые полоски на
  каждом среднем сегменте маршрута — тянутся перпендикулярно сегменту,
  сдвигая оба конца сразу. Работают и на горизонтальных, и на
  вертикальных, и на диагональных сегментах.
- **Подсветка состояния при перетаскивании крайней точки.** Целевое
  состояние выделяется оранжевой пунктирной рамкой, чтобы было видно,
  к чему привяжется точка.
- **Кнопка «↺ Сбросить маршрут»** в модалке редактирования перехода —
  возвращает автоматический расчёт, удаляет запись из
  `documentFlow.ui.json`. Показывается только для ручных переходов.
- **Hit-зоны увеличенного размера** для ручек (r=12–14 px против
  видимого кружка r=6–9). Ручка ловится даже при неточном клике.

### Changed

- **Прямоугольники состояний** на графе получили скруглённые углы
  (rx 12 вместо 6).
- **Переходы** рисуются плавными SVG-path с дугами в углах
  (радиус 10 px) вместо жёстких полилиний. Стрелка наследует цвет
  линии — при выделении и подсветке связанных меняется и она.
- **`chooseEdge` выбирает ось не по разнице центров**, а по реальному
  зазору между прямоугольниками. Устраняет «крюки», когда состояния
  перекрываются по одной оси, но имеют запас по другой.
- **Обход препятствий** проверяет не только чужие состояния, но и
  исходное/целевое, чтобы линия не проходила сквозь них.
- **Прямая линия** без стабов и изломов, если между двумя состояниями
  нет препятствий и они выровнены по оси.
- **Расталкивание параллельных сегментов** разных переходов: H-сегменты
  на одной Y и V-сегменты на одной X, реально пересекающиеся по другой
  оси, разводятся с шагом 6 px.
- **Сортировка переходов на одной грани по геометрии** — переходы
  к верхнему соседу получают верхнюю точку грани, к нижнему — нижнюю.
- **Ручки вынесены в отдельный слой `.g-handles`** поверх состояний,
  клик рядом с прямоугольником больше не уводит в drag состояния.
- **Маршруты с флагом `manual`** не пересчитываются в `rerouteAll`
  и не участвуют в `spreadParallelSegments`.
- **`handleSaveGraph` пишет в `documentFlow.ui.json` только ручные
  переходы.** Auto-переходы в файл не попадают — они пересчитываются
  автоматически при каждой загрузке.
- **Авто-раскладка (Dagre)** сбрасывает все ручные маршруты перед
  раскладкой — состояния переезжают, старые точки больше не имеют
  смысла. В диалоге подтверждения об этом явно сказано.

### Fixed

- **Двойной клик по переходу и по его подписи** снова открывает
  модалку редактирования. `mousedown` не перерисовывает DOM, если
  переход уже единственный выделенный, поэтому `dblclick` успевает
  сработать на том же элементе.
- **Таскание ручек** больше не блокируется видимым кружком: `mousedown`
  навешан и на hit-зону, и на саму ручку.
- **Схема `documentFlow.ui.json` не менялась** — всё работает через
  уже существующее поле `waypoints`. Формат остаётся прежним:
  `{ id, waypoints, label }`.

### Notes

- Для работы авто-раскладки требуется `media/vendor/dagre.min.js`
  (dagre@0.8.5).
- Ручные маршруты сохраняются в `documentFlow.ui.json` при нажатии
  «💾 Сохранить позиции» в тулбаре графа.

## [0.0.1] - 2026-10-01

Первая публичная версия.

### Added

#### Просмотр и навигация

- Табличное представление состояний документа с переводами:
  состояние, «Конечное» (`isTerminal`), входящие переходы, исходящие
  переходы, права доступа акторов.
- Цветная группировка переходов: состояние-источник — синим,
  сам переход — зелёным.
- Сортировка по имени состояния: клик по заголовку колонки
  перебирает без сортировки → A→Z → Z→A.
- Сворачиваемые блоки прав актора: `comments`, `operations`,
  `transitions`, `attachments`. Кнопки «Свернуть всё» / «Развернуть всё».
  Состояние сворачивания сохраняется между сессиями.
- Столбец «Конечное» — чекбокс `isTerminal`, изменяется прямо в
  таблице и сразу сохраняется в `documentFlow.json`.
- Раскрывающийся список акторов с fallback-источниками: `documentFlow.json.actors`,
  `configuration.json.actors`, `configuration.states[].actors[].actor`,
  `translation.csv` (`ItemType=actors`).

#### Графический режим

- Кнопка переключения «Таблица / Граф».
- SVG-граф: состояния — прямоугольники со скруглёнными углами
  (радиус 12 px), внутри — код и перевод.
- Переходы — плавные линии с дугами в углах (радиус 10 px). Стрелка
  наследует цвет линии.
- **Авто-раскладка через Dagre** — иерархическая укладка узлов по слоям
  с минимумом пересечений. Переключатель направления `↕` (сверху вниз,
  по умолчанию) / `↔` (слева направо). Выбор сохраняется.
- **Точки входа** — середина грани, определяется по реальному зазору
  между состояниями (а не по разнице центров). Устраняет «крюки», когда
  состояния перекрываются по одной оси.
- **Обход препятствий**: если линия пересекает другое состояние,
  маршрут автоматически огибает его сбоку. Проверка выполняется и для
  исходного, и для целевого состояния, чтобы линия не проходила
  насквозь.
- **Разведение параллельных рёбер**: горизонтальные сегменты на одной Y
  и вертикальные на одной X, реально пересекающиеся по другой оси,
  разводятся с шагом 6 px.
- **Сортировка переходов на грани по геометрии**: переходы к верхнему
  соседу получают верхнюю точку грани, к нижнему — нижнюю (по Y для
  вертикальных граней, по X для горизонтальных). Устраняет пересечения,
  когда из одного состояния идут два перехода вверх и вниз.
- **Подписи переходов** — пунктирная рамка, размещается над линией
  для горизонтального сегмента и справа для вертикального. Клик по
  рамке выделяет переход, двойной клик открывает модалку
  редактирования. Кнопка `🏷️` скрывает/показывает подписи.
- **Выделение и мультивыделение**: одинарный клик, `Ctrl/Cmd + клик`,
  клик по фону сбрасывает.
- **Подсветка связанных элементов**: при выделении состояния или
  перехода подсвечиваются бирюзовым пунктиром все связанные с ним
  переходы и состояния. Отличается от основного выделения (оранжевая
  сплошная рамка).
- **Тулбар действий графа**: редактировать (`✎`), удалить (`🗑`).
- **Точечная передвижка**: `Ctrl+стрелки` — сдвиг выделенных состояний
  на 1 px, `Shift+Ctrl+стрелки` — на 10 px.
- **Удаление через `Delete`**: для выделенных состояний или переходов,
  с подтверждением.
- **Создание перехода протягиванием**: правый клик по состоянию,
  от него тянется пунктирная линия к курсору; второй клик (правый или
  левый) по целевому состоянию создаёт переход с кодом `From_To` и
  открывает модалку редактирования. `Esc` отменяет.
- **Масштабирование**: поле `%` в тулбаре, `Ctrl+колесо` мыши,
  кнопка «Вписать в экран».
- **Сохранение позиций** в `documentFlow.ui.json`. Если файл уже
  существует, авто-раскладка запрашивает подтверждение перед
  перезаписью.

#### Редактирование

- **Добавление состояния**: код, RU-перевод, `isTerminal`, исходящие
  переходы, права акторов.
- **Редактирование состояния**: переименование кода (обновляет все
  ссылки во всех четырёх файлах), RU-перевод, `isTerminal`, исходящие
  переходы, права акторов. Входящие переходы — read-only, для справки.
- **Удаление состояния**: удаление со всеми отсылками из
  `documentFlow.json`, `configuration.json`, `translation.csv`,
  `documentFlow.ui.json`, включая чистку ссылок на удалённые переходы
  у остальных акторов.
- **Автогенерация кода перехода** по правилу `From_To`. Пересчитывается
  при смене `to` и при переименовании состояния. Ручной ввод
  фиксируется и больше не перетирается автоматикой.
- **Отдельная модалка редактирования перехода**: код, `to`,
  RU-перевод, `actionToRunBefore`, `serverSideEvents`
  (`broadcastEvent: { serverSideEvents: true }`),
  `allowOnValidationErrors` (`all = true` / `all = false` / `codes` /
  `exceptForCodes`).
- **Пропуск пустых свойств**: `actionToRunBefore`, `broadcastEvent`,
  `allowOnValidationErrors` не пишутся в `documentFlow.json`, если
  не заданы. `broadcastEvent` удаляется целиком при снятии галки.
- **Копирование актора** в выбранные состояния. Можно оставить имя
  (дублирование) или ввести новое (создание нового актора с тем же
  набором прав). Дубликаты пропускаются.
- **Удаление актора** из конкретного состояния — кнопка `×` в блоке
  прав.
- **Флаг `exclusiveToAssignedUser`** у операций актора — чекбокс 🔒
  в форме, сохраняется в `configuration.json`.
- **Диалоги подтверждения** показывают полный список изменений:
  какие переходы переименованы (старый → новый), какие добавлены,
  какие удалены, был ли переименован сам стейт.

#### Каркас докфлоу

- Кнопка `🏗️ Каркас докфлоу` — мастер создания/дополнения скелета
  документа.
- Работает и на пустой папке: создаёт `configuration.json`,
  `documentFlow.json` и `translation/translation.csv`.
- Существующие состояния и переходы показываются в разделах
  «Существующие» (с разделителем) и «Новые».
- Ввод состояний списком (по одному на строке, формат `Код | Перевод`).
- Ввод переходов матрицей через запятую: `1-3, 3-5, 5-1` по номерам
  или `Draft-Issued` по кодам.
- Удаление строки в таблице удаляет объект из файлов со всеми
  зависимостями.
- `flowName` для новых проектов формируется как `<имя-папки>Flow`.

#### Авторизация

- Кнопка `🔑 Авторизация` — редактор `authorization.csv`.
- Файл ищется автоматически вверх по дереву от `documentFlow.json`
  (до 5 уровней), по стандартному пути
  `<product-level>/authorization/authorization.csv`.
- Показываются только строки текущего документа
  (`CodeName = <имя-папки-документа>`, `ConceptTypeName = DocumentConfiguration`,
  `PermissionType = Allow Actor`). Строки других документов не тронуты.
- **ApplicationRole** — селект со всеми ролями из файла плюс
  `➕ Другая роль…` для ввода новой.
- **Actor** — селект из акторов текущего `documentFlow.json`.
- **AssignmentOperator** — `Add` / `Remove`.
- Кнопка `+ Добавить строку` создаёт пустую строку с плейсхолдерами,
  прокручивает к ней.
- Валидация: пустые `ApplicationRole` / `Actor` подсвечиваются красным,
  фокус ставится на первое проблемное поле. Дубликаты блокируются с
  указанием конкретной комбинации.
- Если файл не найден — модалка не открывается, выводится сообщение
  с ожидаемым путём.

#### Связи `documentRelation`

- Панель `🔗 Связи` — read-only список всех
  `<product-level>/documentRelation/*/configuration.json`.
- Связи, относящиеся к текущему документу
  (`sourceDocument === <имя-папки-документа>`), помечаются бейджем
  «этот документ» и проверяются: существование `sourceDocument`,
  `targetDocument`, состояний и акторов в `documentFlow.json`.
- Проблемы выводятся отдельным красным блоком в карточке связи.
- В блоке прав актора переходы, инициируемые через связанные документы,
  отображаются как обычные переходы с пометкой `(relation)`. Пример:
  `Issued_Annulled (Аннулировать) (relation)`.
- Связанные действия без смены статуса (например, создание ДС на
  изменение) выводятся в отдельной секции `links:` с человекочитаемым
  названием документа из его `translation.csv`.
- Если целевой документ совпадает с текущим — добавляется метка
  `(копия)`.

#### Проверки

- Кнопка `🔍 Проверка` — модалка с результатами пяти проверок:
  1. Недостижимые состояния (относительно `initialState`).
  2. Терминальные состояния с исходящими переходами.
  3. Отсутствие RU-переводов (отдельно для состояний и переходов).
  4. Состояния без акторов.
  5. Проблемы в связях `documentRelation`.
- Клик по имени состояния в отчёте — переход в граф с выделением и
  центрированием. Клик по имени перехода — открытие модалки
  редактирования.
- В шапке — сводка «⚠️ Найдено проблем: N» или «✅ Проблем не найдено».

#### Тулбар

- **Перемещаемый тулбар** — сверху (по умолчанию), снизу, слева или
  справа. Выбор сохраняется между сессиями.
- Меню выбора позиции открывается кнопкой `⚙`. Работает для всех
  четырёх позиций, позиционируется по `getBoundingClientRect()`.
- **Кнопки-иконки** без текста, с tooltip при наведении. Иконки —
  встроенные SVG, наследуют цвет темы через `currentColor`.
- Высота тулбара рассчитывается динамически и пересчитывается при
  изменении размера окна.
- Динамические иконки: «Таблица / Граф» меняется по режиму;
  направление раскладки `↕` / `↔` меняется по клику.

### Notes

- Расширение работает **на пустой папке**: если файлы конфигурации не
  найдены, доступен режим «Каркас докфлоу» для создания с нуля.
- **CSP webview** настроен строго: `script-src {{CSP_SOURCE}} https://*.vscode-cdn.net;`.
  Данные передаются через `<script type="application/json" id="policyFlowData">`,
  а не через inline `window.__DATA__`.
- Диалоги подтверждения и сообщения — собственные DOM-модалки, а не
  `alert`/`confirm` (в webview sandbox модалки браузера заблокированы).
- Требуется **Node.js 20+ только для сборки** (`vsce` не работает
  на Node 18). Работа самого расширения в VS Code от системного
  Node.js не зависит.
- Требуется файл `media/vendor/dagre.min.js` (dagre@0.8.5, ~50 КБ)
  для работы авто-раскладки. Включён в `.vsix`.
- Условие «дата заключения = сегодня» для переходов аннулирования
  и расторжения проверяется **вне конфигурации**, на стороне бэкенда.
  Расширение показывает права на эти переходы обычным образом.

[0.0.1]: https://github.com/BakhtiarD/adinsure-document-flow-viewer/releases/tag/v0.0.1