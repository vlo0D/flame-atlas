# Implementation Plan: завантаження й розбір документів PSI

**Branch:** `001-psi-ingest` | **Spec:** [spec.md](spec.md) | **Tasks:** [tasks.md](tasks.md)

## Summary

Два незалежні етапи з одним конфігом:

1. **`pipeline.ingest`** — відкриває дослідження в PSI, зберігає метадані, будує повний перелік файлів,
   відбирає потрібні й завантажує їх у `data/raw/`.
2. **`pipeline.extract`** — для кожного завантаженого файла викликає обробник свого формату
   і пише JSON у `data/extracted/`.

## Technical Context

| | |
|---|---|
| Мова | Python 3.9+ (цільовий 3.11+) |
| Залежності | `requests`, `openpyxl` (xlsx), `python-docx` (docx), `pdfplumber` (pdf); CSV — стандартний `csv` |
| Сховище | файли на диску: `data/raw/`, `data/extracted/` |
| Тести | `unittest` зі стандартної бібліотеки: `python3 -m unittest discover -s tests` |
| Обмеження | послідовні запити, пауза 0.5 с; ліміт 60 МБ на файл; без `Raw Data` |

## Constitution Check

| Принцип | Як дотримано |
|---|---|
| 1 Джерело | кожен блок має `location` (сторінка / абзац / аркуш / рядок), документ — `source` з S3-ключем і URL |
| 2 `null` | невідомі метадані → `null`; порожні клітинки лишаються `""` лише в `raw` (дослівність) |
| 3 Без LLM на рядок | LLM не використовується |
| 4 `raw` | таблиці зберігають клітинки дослівно як рядки + `sourceRow` |
| 5 Цитати | текст блоків зберігається без перефразування (лише обрізання пробілів по краях) |
| 7 Контракт | `contracts/` не змінюється; проміжні схеми лежать у `pipeline/schema/`; валідатор той самий |
| 9 Інфраструктура | без БД і серверів |
| 12 Raw Data | папка виключена в конфігу за замовчуванням |

## API PSI (перевірено 2026-11-14)

| Що | Запит |
|---|---|
| Пошук | `GET /geode-py/ws/repo/search?term=combustion&source=psi&type=investigation&size=300` → `hits.hits[]._source` |
| Деталі | `GET /geode-py/ws/repo/investigations/<id>` → поле `version` потрібне для дерева файлів |
| Дерево файлів | `POST /geode-py/ws/files/v2`, тіло `{"folder":"psi-data/<id>/","fileType":"study","studyId":"<id>","version":<version>}` → вкладені `files[]`; лист має `directory:false`, `key`, `bytes_size`, `version`, `sortingCategory` |
| Посилання | `GET /geode-py/ws/studies/<id>/download?file=<name>&version=<v>&redirect=false` → тіло = тимчасовий URL S3 (текст) |

Дерево `files/v2` повне навіть там, де `added[]` порожній (PSI-99: 217 файлів проти 0 в `added`).

## Структура

```
pipeline/
  __init__.py
  requirements.txt
  config/ingest.json          усі налаштування: запит, фільтри, формати, ліміти, шляхи
  settings.py                 читання конфігу + перевизначення з CLI
  log.py                      спільне логування
  sources/
    base.py                   інтерфейс Source + моделі InvestigationRef, RemoteFile
    psi.py                    реалізація для PSI (search, details, tree, presigned URL)
  selection.py                правила відбору файлів (розширення, папки, розмір) з причинами
  download.py                 HTTP-сесія: повтори, пауза, атомарний запис, кеш
  ingest.py                   CLI етапу 1
  extractors/
    __init__.py               реєстр: розширення → обробник
    base.py                   Extractor, TextBlock, TableBlock, ExtractedDocument
    tables.py                 спільне: заголовок, унікальні ключі, клітинка → рядок
    csv_extractor.py          таблиці CSV
    xlsx_extractor.py         таблиці XLSX (кожен аркуш)
    docx_extractor.py         текст + таблиці DOCX у порядку документа
    pdf_extractor.py          текст по сторінках + таблиці PDF
  extract.py                  CLI етапу 2: обробники + index.json
  normalize/values.py         розбір клітинок: числа, діапазони, одиниці, дати
  normalize/fuel.py           назва палива → матеріал, стан, форма, розміри
  normalize/engine.py         маппінг таблиці → TestRecord контракту
  mappings/*.json             маппінг на кожну з 22 таблиць (формат: mappings/README.md)
  cards.py                    картки Investigation: метадані + tests.json + дослівні цитати
  build.py                    data/processed (4 файли контракту) + contracts/validate.py
  run.py, __main__.py         `python3 -m pipeline`: download → contract → documents
  config/contract.json        напрями безпеки, обладнання, dataNotes, quality
  config/scenarios.json       сценарії середовищ
  investigation.py            метадані PSI → поля в стилі контракту
  schema/
    extracted-document.schema.json
    extracted-index.schema.json
  validate_extracted.py       перевірка data/extracted схемами (через contracts/validate.check)
tests/pipeline/               unittest на кожен обробник, відбір, дерево файлів
```

**Чому `sources/`:** якщо з'явиться друге джерело (NTRS, OpenAlex), воно реалізує той самий
інтерфейс `Source`, а `ingest` і `extract` не змінюються.

**Чому реєстр обробників:** формат додається одним класом з `extensions = (...)` і рядком у
`allowedExtensions` конфігу. Обробник читає лише файл і повертає блоки, тому тестується без мережі.

## Вихідні дані

```
data/raw/PSI-25/
  metadata.json               відповідь API деталей дослівно
  files.json                  усі файли: шлях, розмір, версія, selected, reason, localPath
  Experimental table/PSI-25_Experimental table_BASS-II.csv
  Science Documents/PSI-25_Science Documents_BASS-II_ReadMe.docx
  ...
data/extracted/
  index.json                  дослідження (поля як у контракті) + документи зі статусами
  PSI-25/PSI-25_Science Documents_BASS-II_ReadMe.docx.json
```

`ExtractedDocument` (схема `pipeline/schema/extracted-document.schema.json`):

```json
{
  "schemaVersion": "1.0.0",
  "investigationId": "PSI-25",
  "format": "docx",
  "source": { "fileName": "...", "folder": "Science Documents", "key": "psi-data/PSI-25/...",
              "version": 2, "sizeBytes": 21538, "sha256": "...", "localPath": "data/raw/...",
              "investigationUrl": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25" },
  "extractor": { "name": "docx", "version": "1.0.0" },
  "extractedAt": "2026-11-14T20:00:00Z",
  "status": "ok",
  "warnings": [],
  "stats": { "textBlocks": 41, "tables": 2, "tableRows": 37, "characters": 9120, "pages": null },
  "blocks": [
    { "type": "text", "id": "b1", "kind": "heading", "level": 1, "text": "BASS-II ReadMe",
      "location": { "paragraph": 1 } },
    { "type": "table", "id": "b7", "name": "Table 1", "confidence": "high",
      "location": { "table": 1 }, "headerRow": 1, "columns": ["Column", "Meaning"],
      "rows": [ { "sourceRow": 1, "raw": { "Column": "Air display", "Meaning": "..." } } ] }
  ]
}
```

`location` за форматом: CSV `{}`, XLSX `{"sheet": "..."}`, DOCX `{"paragraph": n}` / `{"table": n}`,
PDF `{"page": n}` / `{"page": n, "table": k}`.

## Complexity Tracking

| Відхилення | Чому |
|---|---|
| Spec Kit використано як структуру документів, без CLI `specify` | `docs/06-working-agreement.md` радить брати ідеї, не інструмент; `uv`/`specify` не встановлені. Рішення записано в `docs/decisions.md` |
| Python 3.9 підтримується, хоча стек каже 3.11+ | на машині розробника лише 3.9; код без синтаксису 3.10+ |
| Таблиці PDF — евристика `pdfplumber` | позначаються `confidence: low`; для фактів беремо CSV/XLSX/DOCX |
