# HANDOFF — Adinsure Document Flow Viewer

Актуально для **0.7.0**. Документ описывает: текущее состояние, что
покрыто тестами, что осталось, какие улучшения запланированы. Для
новой сессии — читать целиком, потом идти в раздел, соответствующий
задаче.

---

## Текущее состояние

**Версия:** 0.7.0
**Стек:** VS Code extension (backend — Node.js в `src/*`, frontend —
vanilla JS без сборщика в `media/modules/*` через IIFE и глобальный
`window.PF`).
**Тесты:** `node --test` (Node.js 20+), без внешних зависимостей,
100+ зелёных.
**Языки:**
- интерфейс — `adinsureDocFlow.uiLanguage` (`auto` / `ru-RU` / `en-US`),
  словари в `media/locales/*.js` и `src/locales/*.js`;
- данные — селектор `🌐` в тулбаре, колонки `Translation_<lang>` из
  `translation.csv`.

**Уже реализовано (0.6.x):**
- Мультиязычность интерфейса и данных (независимые механизмы);
- Сравнение двух документов с apply (add/change/remove);
- Ручки-полоски на всех сегментах переходов, перемещение стрелками;
- Табличный вид прав на вложения;
- Исправления по `data.csv` AttachmentType (multi-column);
- `src/compare.js` переименован в `src/compare-diff.js` (чтобы не
  путать с клиентским `media/modules/compare.js`).

**Реализовано в 0.7.0:**
- Тестовая инфраструктура `test/`, покрытие серверной логики;
- `test/helpers/mockVscode.js` — мок для `require('vscode')`.

---

## Покрытие тестами

### Что покрыто (0.7.0)

| Файл | Функции | Тестов |
|---|---|---|
| `src/utils.js` | `stripBom`, `indexOf`, `escapeHtml` | 14 |
| `src/csv.js` | `parseCsv`, `serializeCsv`, roundtrip | 19 |
| `src/transforms.js` | `buildTranslations` | 15 |
| `src/compare-diff.js` | `buildDiff` | 20 |
| `src/compare-apply.js` | `applyDiff` | 28+ |
| `src/storage.js` | `normalizeSourceDocumentStates`, `loadDocumentForCompare` | 21 |

Прогон: `npm test`. Весь набор — **< 300 ms**.

### Хелперы (в `test/helpers/`)

- **`mockVscode.js`** — подменяет `Module._load` для `require('vscode')`.
  Нужен для любого теста, где модуль на верхнем уровне тянет
  `src/storage.js` (а тот читает `vscode`). Подключать **первой строкой**
  тестового файла.
- **`makeCsv.js`** — `makeCsv(header, rowsByName)` — конструктор CSV
  в памяти.
- **`makeDoc.js`** — `makeDoc(opts)` → голый объект `{ flowPath,
  docName, flowName, flow, config, csv }`. **Не** пишет на диск,
  возвращает чистый объект для `buildDiff`.
- **`makeCtx.js`** — `makeCtx(opts)` → `{ ctx, cleanup, tmpRoot }`.
  Создаёт реальную структуру папок (`document/<name>/`, `flowRules/`,
  `UI/ClientAction/`, `authorization/`) в `os.tmpdir()`. Нужен для
  `applyDiff`, где `removeState`/`addTransition` пишут файлы.
  Обязателен `cleanup()` в `finally`.
- **`docOnDisk.js`** — `docOnDisk(opts)` → `{ flowPath, configPath,
  transPath, docName, tmpRoot, cleanup }`. Создаёт реальные файлы
  (`documentFlow.json`, `configuration.json`,
  `translation/translation.csv`, опционально `documentFlow.ui.json` и
  `authorization.csv`). Для `loadDocumentForCompare`. Обязателен
  `cleanup()`.

### Что осталось покрыть

**Сервер (приоритет 1 — легко и полезно):**

- **`src/attachments.js`** — `loadAttachmentType`, `readDataCsvRaw`,
  `saveAttachmentCodes`, `addAttachmentType`, `removeAttachmentType`,
  `pickTrCol`. Чистые функции над `fs` + `csv`. Понадобится
  `docOnDisk`-подобный хелпер для справочника AttachmentType
  (`data.csv` + `translation/translation.csv`) — или расширить
  `makeCtx` параметром `attachmentDir`.
- **`src/client-actions.js`** — `clientActionPath`,
  `writeClientAction`, `renameClientAction`, `findClientActionInProject`.
- **`src/flow-rules.js`** — `writeFlowRule`, `renameFlowRule`,
  `deleteFlowRule`.
- **`src/compare-apply.js → addTransition`** — ветки копирования
  `flowRules` и `ClientAction`. Нужно создать `flowRules/<name>.js` и
  `UI/ClientAction/<action>.js` в `otherDoc.productLevel` и проверить,
  что `copyFileIfMissing` их скопировал. После фикса пути
  (`path.dirname(otherDoc.flowPath) + '/flowRules'`) — тривиально.
- **`src/compare-apply.js → buildDefaultAttachmentRestrictions`** — не
  экспортируется, но если экспортировать, покрыть режимы
  `'read-all'` / `'by-template'`.

**Клиент (приоритет 2 — сложно, требует jsdom или рефакторинга):**

- **`media/modules/routing.js`** — самый ценный клиентский тест.
  Логика `chooseEdge`, `chooseEdgePair`, `routeBetween`,
  `optimizeTransitions`, `alignTransitions` — сложная, ломается
  регулярно. **Подход:** вынести чистые функции в отдельный модуль
  без DOM-зависимостей (`routing-core.js`) или рефакторить существующий
  так, чтобы `PF.routing` не зависел от `document`. Тогда тесты
  становятся тривиальными.
- **`media/modules/i18n.js`** — `PF.i18n.tr`, `label`, `setLang`,
  `init`. Зависит от `PF.state` и `document` (селектор). Можно
  мокать `PF.state` через `global.PF = { state: {...} }` и
  использовать `vm.runInNewContext`.
- **`media/modules/ui-i18n.js`** — то же + `Intl.PluralRules`
  (встроенный в Node, работает).
- **`media/modules/graph-render.js`**, **`forms.js`**,
  **`forms-other.js`**, **`table.js`**, **`actors.js`**,
  **`matrix.js`**, **`legend.js`**, **`compare.js`**,
  **`toolbar.js`** — DOM-тяжёлые, требуют jsdom. Покрытие — точечное:
  - `renderTable` — что DOM получает ожидаемые элементы;
  - `computeRelated` (в graph-render) — что подсветка правильная;
  - `validateFlow` (в forms-other) — что валидатор ловит ожидаемые
    проблемы;
  - `openDiff` (в compare) — что diff-секции строятся.

**Три подхода для клиентских тестов:**

1. **jsdom** — самый простой путь, `npm install --save-dev jsdom`.
   Плюс: работает почти всё как в браузере. Минус: +1 зависимость,
   +200 MB node_modules. Пример:

   ```js
   const { JSDOM } = require('jsdom');
   const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
   global.window = dom.window;
   global.document = dom.window.document;
   // далее require('../media/modules/routing.js') — но нужен PF.state
2. vm.runInNewContext — Node.js встроенный. Плюс: без
зависимостей. Минус: нужно вручную собирать sandbox-контекст
(window, document, PF, Intl) и загружать код через vm.runInContext.
Годится для i18n.js, ui-i18n.js, routing.js (если убрать
DOM-зависимость).

Рефакторинг в pure-модули. Вынести чистую логику из IIFE в
отдельный файл, экспортировать через module.exports (не через
window.PF), а обёртку PF.routing = require('./routing-core') —
в IIFE. Плюс: тестируется как обычный серверный код, без jsdom.
Минус: рефакторинг существующих файлов.

Моя рекомендация:

routing.js — рефакторинг в routing-core.js + IIFE-обёртка.

i18n.js / ui-i18n.js — vm.runInNewContext (мало зависимостей
от DOM).

graph-render.js, table.js, compare.js и др. — jsdom, только
если нужно тестировать DOM-рендеринг.

Улучшения (приоритизированные)
Оценка: S = часы, M = 1-2 дня, L = 3+ дня.

Приоритет 1 — Надёжность и целостность данных
1.1. Атомарная запись с бэкапом (M)
writeAll пишет напрямую через fs.writeFileSync. Падение в момент
записи → полупустой файл. Решение: писать в <file>.tmp, затем
fs.renameSync (atomic на уровне FS). Хранить 1-2 последние версии в
.documentFlow.bak/. При старте — если .tmp есть, но не
завершён — предложить восстановление.
Файлы: src/storage.js (writeAll, writeFlow, writeConfig,
writeUi, writeAuth).

1.2. Undo/Redo (L)
Сейчас любое удаление необратимо. Нужна история в памяти (ring
buffer из 20-30 снапшотов {flow, config, csv, ui, auth} перед
каждым изменением), Ctrl+Z/Ctrl+Y в webview. Не сохранять между
сессиями. Кнопка ↺ в тулбаре с counter.
Файлы: media/modules/main.js (инициализация), src/extension.js
(dispatch), src/handlers.js (обёртка withHistory), новая команда
undo/redo.

1.3. Транзакции в applyDiff (M)
applyDiff может применить половину действий, потом упасть.
Пользователь видит Actions applied: 5, но не знает, что реально
записалось. Решение: снапшот перед накатом, writeAll одним вызовом,
при ошибке — восстановить снапшот, вернуть { ok: false }.
Файлы: src/handlers.js → handleApplyCompareDocuments.

1.4. Валидация initialState при apply (S)
changeInitialState не проверяет, что значение существует в текущем
документе. Добавить проверку:

js
if (!flow.states.some(s => s.name === value)) {
    result.warnings.push(uiI18n.t('warn.stateNotFound', { name: value }));
    continue;
}
Файлы: src/compare-apply.js.

1.5. File watcher для внешних изменений (M)
Если пользователь параллельно редактирует configuration.json в VS
Code или git pull принёс изменения — расширение не узнаёт до Reload.
Решение: vscode.workspace.createFileSystemWatcher на ключевые файлы,
invalidateProjectCache + loadData + pushRender при изменении.
При наличии открытых форм с несохранёнными правками — предупредить.
Файлы: src/extension.js (activate), src/storage.js.

1.6. Проверка flowRules/*.js на синтаксис (S)
После writeFlowRule/renameFlowRule — new Function(content) в
try/catch. Если синтаксис битый — showWarningMessage с номером
строки (используя require('vm').Script для получения позиции).
Файлы: src/flow-rules.js (writeFlowRule, renameFlowRule).

Приоритет 2 — UX
2.1. Поиск / фильтр (M)
В большой таблице (50+ состояний) и в графе — не найти нужное.
Ctrl+F в webview → мини-поиск в шапке. В таблице — фильтр по
имени / актору / переходу. В графе — подсветка совпадений (не
скрывать остальные, а ослаблять opacity). В матрице — то же.
Файлы: media/index.html (поле), media/main.css (стили),
media/modules/table.js, media/modules/graph-render.js,
media/modules/matrix.js.

2.2. Focus mode в графе (S)
Для 30+ состояний — режим «покажи только это состояние и соседей».
F на выделенном → скрыть остальные. Повторный F → 2-hop.
Escape → вернуть всё. Визуальный фильтр, ui.json не меняется.
Файлы: media/modules/graph-render.js, media/modules/graph-drag.js.

2.3. Экспорт (M)

Граф → SVG/PNG (serializeToString + canvas);

Таблица → CSV;

Diff → markdown (для code review);

Всё через vscode.window.showSaveDialog.
Файлы: src/extension.js (dispatch), src/handlers.js
(handleExport*), media/modules/toolbar.js (кнопки).

2.4. Preview перевода при редактировании (S)
В форме редактирования состояния/перехода — рядом с полем перевода
маленький SVG-превью «как будет выглядеть» (прямоугольник + 2 строки).
Обновляется при вводе.
Файлы: media/modules/forms.js, media/index.html (шаблон),
media/main.css.

2.5. Множественные открытые документы (L)
currentPanel / currentCtx — глобальные, второй документ закрывает
первый. Заменить на Map<flowPath, {panel, ctx}>, не закрывать старый.
Файлы: src/extension.js.

2.6. Мультивыделение по критерию (S)
ПКМ по состоянию → контекстное меню: «Выделить 1-hop соседей»,
«Выделить все состояния этого актора», «Выделить все терминальные»,
«Выделить все недостижимые» (из валидатора).
Файлы: media/modules/graph-render.js.

2.7. Закрепление позиций при auto-layout (S)
«Зафиксировать текущую позицию этого состояния, остальные расставить
вокруг». Флаг в documentFlow.ui.json. autoLayout учитывает pin.
Файлы: media/modules/toolbar.js, media/modules/graph-render.js,
src/handlers.js → handleSaveGraph.

Приоритет 3 — Производительность
3.1. Инкрементальный рендер графа (M)
renderGraph сносит svg.innerHTML = '' каждый раз. При 100+
состояниях — заметно. При изменении одного перехода/состояния
обновлять только его g.transition / g.state. Полный rebuild —
только при loadData или смене viewMode. Выигрыш 5-10x на типичных
операциях.
Файлы: media/modules/graph-render.js.

3.2. Кэш rerouteAll (S)
rerouteAll вызывается после каждого drag. Для 50 состояний —
50 × routeBetween. Кэш по ключу
(fromName, fromEdge, toName, toEdge).
Файлы: media/modules/routing.js.

3.3. loadData не перечитывает с диска (S)
write* только что записал — не читать обратно. Держать в памяти,
мутировать.
Файлы: src/handlers.js (не вызывать loadData после writeAll).

3.4. optimizeTransitions через Worker (M)
Для 100 состояний — миллионы routeBetween. Worker в webview
или ограничение перебора.
Файлы: media/modules/routing.js, новый media/modules/routing-worker.js.

Приоритет 4 — Тестируемость
4.1. Клиентские тесты (L) — см. выше в разделе «Что осталось».

4.2. Проверка полноты словарей (S)
Скрипт scripts/check-locales.js — сравнивает набор ключей ru-RU
и en-US (webview и server). Exit code ≠ 0 при расхождении.
Запускается перед vsce package.
Файлы: новый scripts/check-locales.js, package.json (script
pretest или отдельный).

Приоритет 5 — Архитектура
5.1. Разделить ctx на read-only и write (M)
Сейчас ctx.flow, ctx.config, ctx.csv мутируются в каждом
handler'е. Легко забыть мутировать одно при изменении другого.
Handler возвращает Patch ({ flow?, config?, csv?, ui?, auth? }),
централизованный applyPatch(ctx, patch) знает, что записывать.
Снимет целый класс багов.
Файлы: src/handlers.js (все handle*), новый
src/ctx-patch.js.

5.2. Единый handle* интерфейс (S)
Сейчас handlers — (ctx, panel, payload) или (ctx, transitionName, actionName), по-разному. Единый контракт:
async (ctx, payload) → { ok: true, data } | { ok: false, code, message }.
Все сообщения пользователю — на клиенте.
Файлы: src/handlers.js, src/extension.js.

5.3. Заменить findFileByName (S)
Ищет рекурсивно по всей папке, останавливаясь на node_modules.
Может найти не тот файл. Искать по стандартному пути
<root>/document/<DocName>/documentFlow.json, а findFileByName —
только fallback.
Файлы: src/storage.js.

Приоритет 6 — Новые фичи
6.1. Diff между двумя состояниями (M)
Выделил 2 состояния → кнопка «Сравнить состояния» в граф-тулбаре.
Diff-панель по тому же шаблону, что сравнение документов.
Файлы: media/modules/compare.js, src/compare-diff.js
(новая функция buildStatesDiff).

6.2. Импорт/экспорт состояний (M)
Экспорт: code,ru,en,isTerminal,actors,outgoing → CSV. Импорт:
обратный парсинг с валидацией.
Файлы: media/modules/forms-other.js, src/handlers.js.

6.3. Аудит (S)
Если проект в git — брать git blame по documentFlow.json /
configuration.json. Иконка «история» на состоянии — последние 10
коммитов.
Файлы: src/git.js (новый), media/modules/forms.js.

6.4. Сравнение с шаблоном (M)
Кнопка «Создать по шаблону» в генераторе каркаса. Выбираешь папку
образца → применяется сравнение → всё добавляется автоматически.
Файлы: media/modules/forms-other.js,
src/handlers.js → handleGenerateFlow.

6.5. Проверка flowRules содержимого (M)
Загрузить flowRules/<code>.js в vm (sandbox). Проверить:
экспортирует функцию, arity ≥ 1, базовый вызов fn({}) не падает.
Предупреждение в валидаторе.
Файлы: media/modules/forms-other.js → validateFlow,
src/flow-rules.js.

Договорённости по стилю работы
Правки в существующем коде — diff. Якорь + заменяемый блок,
не полный файл, если меняется 1-5 строк.

Полный файл — только если новый или переписывается целиком.

Не более 3 файлов за раз в одном сообщении.

Сначала дослушать, потом код. Если запрос неоднозначен —
переспросить.

Ссылки на прошлые сообщения — только если правка действительно
была дана. Не «как в прошлом сообщении», если её не было.

Локализация: все пользовательские строки — через PF.ui.t
(клиент) или uiI18n.t (сервер). Тех. имена полей JSON не
переводятся.

Тесты: новые функции — с тестами; баг-фиксы — с regression-
тестом.

Namespace: клиент — window.PF.*, сервер — module.exports.

IIFE для клиентских модулей: (function () { 'use strict'; ... })();

Известные баги и компромиссы
addTransition + copyFileIfMissing — путь к flowRules
в sourceProductLevel может быть неверным, если productLevel —
это папка с document/, а flowRules/ лежит рядом с
documentFlow.json. Проверить и при необходимости заменить на
path.dirname(otherDoc.flowPath) + '/flowRules'.

changeActorAttachmentPerms — если актор не существует, делает
continue в warnings, но не создаёт. Правильно ли это — открытый
вопрос.

compare-apply.js → removeState — каскадно удаляет flowRules
через deleteFlowRule, но не удаляет ClientAction, если они были
привязаны к переходам этого состояния. Потенциальная утечка файлов.

media/modules/routing.js — самая сложная часть клиента,
покрыта тестами только вручную.

optimizeTransitions — при больших графах может работать 1-2
секунды. Не оптимизирован.