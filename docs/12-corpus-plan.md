# План: корпус документів і таблиць PSI (~2 ГБ) і зміна контракту

Задача для агента. Мета: завантажити з NASA PSI усі текстові й табличні файли 24 досліджень
з горіння (без сирих даних, фото, відео й архівів із зображеннями), перетворити їх на JSON
за новим контрактом і не зламати чотири файли, на яких уже працює сайт.

**Дедлайн подання: неділя 15.11, 23:59.** Робити по пріоритетах з розділу 6 і зупинитись, коли закінчився час.

## 1. Що прочитати перед роботою

- `AGENTS.md` — правила проєкту (особливо 2, 4, 7, 12);
- `docs/11-psi-inventory.md` — що лежить у PSI, API, папки, перелік потрібних файлів;
- `contracts/README.md` — чинний контракт 1.1.0 (чотири файли сайту);
- `pipeline/inventory.py` — скрипт інвентаря, від нього відштовхуватись.

Робота йде на гілці `data-ai/psi-inventory` (або новій гілці від неї).

## 2. API PSI (без логіну, CC0)

| Що | Запит |
|---|---|
| Метадані дослідження | `GET https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-25` |
| Повне дерево файлів | `POST https://psi.nasa.gov/geode-py/ws/files/v2`, тіло `{"folder": "", "fileType": "study", "studyId": "PSI-25", "version": <version дослідження>}` |
| Тимчасове посилання | `GET https://psi.nasa.gov/geode-py/ws/studies/PSI-25/download?file=<urlencoded назва>&version=<version файла>&redirect=false` |

- Відповідь на посилання буває простим текстом, а не JSON: приймати обидва варіанти.
- Посилання на S3 швидко спливає: брати його безпосередньо перед завантаженням.
- Версію брати з самого файла в дереві, а не версію дослідження.
- Запити послідовно, пауза 0.5 с, кеш на диску; повторний запуск нічого не качає вдруге.

## 3. Які файли качати

Список будує `python3 -m pipeline.inventory` (кешує дерева в `.cache/psi/`,
повний список у `.cache/psi/inventory-all.csv`).

**Беремо** всі файли, для яких одночасно:
- папка (`folder`) не `Raw Data`;
- розширення не з фото й відео: `.mp4 .avi .mov .ts .jpg .jpeg .png .tif .tiff .bmp .gif .eps .wmv`;
- розширення не `.zip`.

Плюс три малі архіви з документами, які треба розпакувати:
`PSI-20_Science Documents_ACME BRE Data interpretation.zip`, `PSI-22_Science Documents_ACME Data interpretation.zip`,
`PSI-22_Science Documents_ACME Gas flow.zip` (разом 6 МБ).

**Разом: 697 файлів, 1.96 ГБ** (+ 3 архіви).

| Папка | Обсяг | Що там |
|---|---|---|
| Analyzed Data | 995 МБ | таблиці результатів (SAME, SAME-R ~0.7 ГБ), DAFT, `.dat` моделювання диму PSI-115, CSV наземного PSI-117 |
| Presentations | 416 МБ | `.ppt`, `.pptx`, `.pdf` |
| Engineering Documents | 202 МБ | вимоги, описи обладнання, один словник колонок s-Flame |
| Science Documents | 188 МБ | ReadMe, DoD, data interpretation, матриці тестів, SRD |
| Reports | 143 МБ | фінальні звіти, 30-денні звіти, дисертації |
| Reference Data, Calibration | 21 МБ | текстові описи (без архівів) |
| Experimental table | 0.2 МБ | 22 CSV — головні дані |

| Формат | Файлів | Обсяг |
|---|---|---|
| PDF | 319 | 738 МБ |
| XLS / XLSX | 172 | 750 МБ |
| DAT | 44 | 254 МБ |
| PPT / PPTX | 18 | 159 МБ |
| DOC / DOCX | 15 | 56 МБ |
| TXT / CSV / інше | 129 | 8 МБ |

**Не беремо** (перевірено зазирнувши в ZIP через HTTP Range, без завантаження):
- `Raw Data` — 13.48 ТБ: відео, кадри, телеметрія;
- архіви Calibration FLEX і FLEX-2 — 9.8 ГБ кадрів калібрування камер (`.tif`, `.png`);
- архіви Reference Data s-Flame — 0.8 ГБ голографічних знімків (`.hobj`);
- архіви Engineering Documents — 0.8 ГБ креслень у PDF, відео `.avi`, фото операцій;
- ZIP метаданих (`Investigation Metadata Files`) — копія того, що віддає API метаданих.

## 4. Куди класти

- Завантажене: `data/raw/PSI-xx/<папка PSI>/<назва файла>`. У git не комітимо нічого, крім 22 CSV
  таблиць експериментів. Додати в `.gitignore` для `data/raw/**`: `*.xls`, `*.dat`, `*.txt`, `*.pxp`
  (pdf, docx, doc, pptx, ppt, xlsx уже там).
- Перевірка після завантаження: розмір файла дорівнює `bytes` з інвентаря; помилки — у журнал, не зупинятись.
- Результат перетворення: `data/corpus/` (окремо від `data/processed`, щоб `apps/web/scripts/sync-data.mjs`
  не копіював його в сайт без рішення команди «Продукт»).

## 5. Зміна контракту: версія 1.2.0

Тільки додаємо, нічого не змінюємо. Чотири файли сайту лишаються як є.

### Нові файли в `data/corpus/`

**`files.json`** — індекс усіх 66 567 файлів PSI (сайт зможе показати, що є в дослідженні, нічого не качаючи):

```
{ id, investigationId, folder, subfolder, fileName, extension, bytes, version,
  kind: "table" | "document" | "presentation" | "media" | "archive" | "raw" | "other",
  selected: boolean,             // чи входить у 2 ГБ з розділу 3
  extracted: "ok" | "empty" | "failed" | "skipped" | null,
  corpusPath: string | null }    // де лежить витягнутий вміст
```

`id` — стабільний, наприклад `PSI-25:Science Documents:PSI-25_Science Documents_BASS-II_ReadMe.docx`.

**`documents/PSI-xx.json`** — текст документів (PDF, DOC, DOCX, PPT, PPTX, TXT):

```
[{ fileId, fileName, format, ocr: boolean, status,
   units: [{ n, kind: "page" | "slide" | "paragraph", text }] }]
```

Текст дослівний, без переписування й скорочень (правило «AI пише маппінг, код застосовує»: LLM тут не потрібен).

**`tables/PSI-xx.json`** — таблиці (CSV, XLS, XLSX, табличні TXT і DAT):

```
[{ fileId, fileName, sheet, header: string[], rows: string[][],
   rowCount, truncated: boolean, notes }]
```

Значення як рядки, без автоперетворень (як `raw` у `tests.json`).

### Межі розміру
- Один JSON-файл ≤ 25 МБ, весь `data/corpus/` ≤ 150 МБ (git і GitHub Pages).
- Таблиця понад 5 000 рядків (ряди датчиків SAME, SAME-R, `.dat` PSI-115): зберегти заголовок,
  перші 100 рядків, `rowCount` і `truncated: true`; повна версія лишається в `.cache/`.
- Якщо файл дослідження перевищує 25 МБ — ділити на `PSI-xx.part2.json` тощо.

### Доповнення до чинних файлів (необов'язкові поля)
- `Citation` у `investigations.json`: `fileId` і `page` — щоб твердження картки могло вказувати
  на сторінку документа з корпусу. Код перевіряє, що `quote` є в тексті цієї сторінки.

### Що змінити в репозиторії разом з контрактом
- `contracts/schema/`: три нові схеми (`files`, `documents`, `tables`) і нові поля `Citation`;
- `contracts/types.ts`: ті самі типи;
- `contracts/validate.py`: перевірка `data/corpus/` (схеми, розміри, що кожен `fileId` є у `files.json`);
- `contracts/README.md`: розділ про корпус, версія 1.2.0;
- `data/fixtures/`: малі зразки трьох нових файлів;
- `docs/decisions.md`: рядок про контракт 1.2.0; повідомлення в чат команди (контракт змінює лише
  власник контрактів — AGENTS.md, правило 7).

## 6. Порядок роботи (пріоритети)

1. **Контракт 1.2.0** (схеми, типи, перевірка, зразки) — 1 год.
2. **`files.json`** з уже наявного інвентаря — без завантажень. 30 хв.
3. **Завантаження 697 файлів** (`pipeline/download.py`) — фоном, ~2 ГБ.
4. **`tables/`**: CSV, XLSX (`openpyxl`), XLS (`xlrd`), DAT/TXT. Матриці тестів BASS, BASS-II, Test Summary BRE —
   першими: вони заповнюють `null` у `tests.json`.
5. **`documents/`**: PDF (`pypdf`), DOCX (`python-docx`), PPTX (`python-pptx`). Спершу словники колонок
   і фінальні звіти (`need` і `final report` у `data/review/psi-inventory.csv`).
6. **Старі формати**: 4 `.doc` і 11 `.ppt` через LibreOffice (`soffice --headless --convert-to pdf`).
7. **OCR** сканованих PDF (`tesseract`), якщо текст сторінки порожній. Останнім: найдовше.

Залежності Python — у `pipeline/requirements.txt`, ставити у віртуальне середовище.
LibreOffice і tesseract на машині не встановлені: спитати користувача перед `brew install`.

## 7. Готово, коли

- `python3 contracts/validate.py data/fixtures`, `data/processed` і `data/corpus` проходять;
- `files.json` містить 66 567 записів, у 697 + 3 `selected: true`;
- для кожного вибраного файла `extracted` заповнено, підсумок «ok / empty / failed / skipped» записано в
  `docs/11-psi-inventory.md`;
- сайт збирається (`cd apps/web && npm run build`) — чотири файли сайту не змінились;
- рядок у `docs/si-usage-log.md` і `docs/decisions.md`.

## 8. Чого не робити

- Не качати `Raw Data` і архіви з розділу 3 «Не беремо».
- Не переписувати й не скорочувати текст документів — лише дослівне витягування.
- Не змінювати чотири файли сайту й поля чинного контракту (лише нові необов'язкові поля).
- Не комітити файли понад 50 МБ, `.cache/` і завантажені документи з `data/raw/`.
