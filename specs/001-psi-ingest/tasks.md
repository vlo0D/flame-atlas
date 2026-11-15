# Tasks: завантаження й розбір документів PSI

**Вхід:** [spec.md](spec.md), [plan.md](plan.md). `[P]` — можна робити паралельно (різні файли).

## Phase 1: Setup

- [x] T001 `pipeline/requirements.txt`, `pipeline/__init__.py`, `.venv/` і `__pycache__/` у `.gitignore`
- [x] T002 `pipeline/config/ingest.json` + `pipeline/settings.py` (конфіг + перевизначення з CLI)
- [x] T003 [P] `pipeline/log.py`

## Phase 2: Foundational

- [x] T004 `pipeline/sources/base.py`: `Source`, `InvestigationRef`, `RemoteFile`
- [x] T005 `pipeline/download.py`: сесія з повторами, пауза, атомарний запис, кеш за розміром
- [x] T006 `pipeline/extractors/base.py`: `TextBlock`, `TableBlock`, `ExtractedDocument`, `Extractor`
- [x] T007 `pipeline/extractors/__init__.py`: реєстр за розширенням
- [x] T008 [P] `pipeline/schema/*.schema.json` + `pipeline/validate_extracted.py`

## Phase 3: User Story 1 — знімок досліджень (P1)

- [x] T009 [US1] `pipeline/sources/psi.py`: search, details, дерево `files/v2`, злиття з `experimentalTable`/`added`
- [x] T010 [US1] `pipeline/selection.py`: розширення, виключені папки, розмір → `selected` + `reason`
- [x] T011 [US1] `pipeline/ingest.py`: CLI (`--ids`, `--query`, `--ext`, `--dry-run`, `--force`, `--no-download`)
- [x] T012 [P] [US1] `tests/pipeline/test_selection.py`, `tests/pipeline/test_psi_tree.py`

## Phase 4: User Story 2 — документи як JSON (P1)

- [x] T013 [P] [US2] `pipeline/extractors/tables.py`: заголовок, унікальні ключі, клітинка → рядок
- [x] T014 [P] [US2] `pipeline/extractors/csv_extractor.py`
- [x] T015 [P] [US2] `pipeline/extractors/xlsx_extractor.py`
- [x] T016 [P] [US2] `pipeline/extractors/docx_extractor.py`
- [x] T017 [P] [US2] `pipeline/extractors/pdf_extractor.py`
- [x] T018 [US2] `pipeline/investigation.py`: метадані → поля контракту
- [x] T019 [US2] `pipeline/extract.py`: CLI, `index.json`, валідація
- [x] T020 [P] [US2] `tests/pipeline/test_extractors.py` (CSV з BOM, XLSX, DOCX, PDF)

## Phase 5: User Story 3 — розширення (P2)

- [x] T021 [US3] Розділ «Як додати формат / джерело» в `pipeline/README.md`

## Phase 6: User Story 0 — файли контракту (P1)

- [x] T024 `pipeline/normalize/values.py`: числа, діапазони, переліки, наближення, одиниці, дати
- [x] T025 `pipeline/normalize/fuel.py`: матеріал, стан, форма, розміри; артефакти автозаповнення
- [x] T026 `pipeline/normalize/engine.py` + `pipeline/mappings/*.json` (22 таблиці) + `mappings/README.md`
- [x] T027 `pipeline/cards.py`, `pipeline/config/contract.json`, `pipeline/config/scenarios.json`
- [x] T028 `pipeline/build.py` → `data/processed` + `contracts/validate.py`; крок у `python3 -m pipeline`
- [x] T029 `tests/pipeline/test_normalize.py`: рушій відтворює 7 рядків фікстур; збірка проходить контракт

## Phase 7: Polish

- [x] T022 Повний запуск на 24 дослідженнях; звірка рядків (2 009 непорожніх, SC-002)
- [x] T023 Рядок у `docs/decisions.md`, запис у `docs/si-usage-log.md`, бібліотеки в `submission/references.md`
- [ ] T030 Ручна вибірка значень → `meta.quality`
