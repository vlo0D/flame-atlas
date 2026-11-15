# Інвентар файлів NASA PSI: що є і що беремо

Перевірено наживо 15 листопада 2026 скриптом `python3 -m pipeline.inventory`.
Скрипт не качає жодного файла даних: він читає лише метадані й списки файлів.

Результат:
- `data/review/psi-inventory.csv` — 307 файлів, які нам потрібні (`need`) або можуть знадобитись (`maybe`),
  з причиною в колонці `reason`;
- `data/review/psi-inventory.json` — підсумки по кожному дослідженню й папці, включно з сирими даними;
- `.cache/psi/inventory-all.csv` — повний список усіх 66 567 файлів (не комітимо).

## 1. Коротко

| | Файлів | Обсяг |
|---|---|---|
| Усього в 24 дослідженнях Combustion Science | 66 567 | **13.5 ТБ** |
| Потрібні (`need`): 22 таблиці експериментів + 24 документи-словники | 46 | **7 МБ** |
| Можливо згодяться (`maybe`): звіти, SRD, таблиці аналізу | 261 | 1.0 ГБ |
| Не беремо (`skip`): сирі дані, калібрування, інженерні документи, презентації, архіви | 66 260 | 13.5 ТБ |

Плюс метадані 24 досліджень з API (JSON, по кілька десятків КБ) і 352 посилання на статті.

**Висновок:** усе, що потрібно продукту, важить менше за 10 МБ. 99.9% обсягу PSI — це сирі дані
(відео, кадри, телеметрія), і вони поза межами проєкту (AGENTS.md, правило 12).

## 2. API: як дістати повний список файлів

| Що | Запит |
|---|---|
| Усі дослідження | `GET /geode-py/ws/repo/search?term=&source=psi&type=investigation&size=300` — 133 дослідження, з них 24 мають `Research Area = Combustion Science` |
| Метадані дослідження | `GET /geode-py/ws/repo/investigations/PSI-25` |
| **Повне дерево файлів** | `POST /geode-py/ws/files/v2`, тіло `{"folder": "", "fileType": "study", "studyId": "PSI-25", "version": <version з метаданих>}` |
| Посилання на файл | `GET /geode-py/ws/studies/PSI-25/download?file=<назва>&version=<version файла>&redirect=false` |

Що з'ясували:

1. **Поле `added[]` у метаданих — це не список файлів.** Це різниця з попередньою версією дослідження,
   тому в PSI-99, PSI-69 та інших воно порожнє. Повне дерево віддає `files/v2`: цей запит робить сам сайт PSI
   на вкладці «Data files and documents». Логін не потрібен.
2. **Список повний.** Сума розмірів з `files/v2` збігається з `totalFileSize` метаданих
   (13 496.75 ГБ проти 13 496.77 ГБ; різниця 18 МБ у PSI-99, PSI-39 і PSI-26).
3. **У кожного файла своя версія.** Для завантаження брати `version` файла з дерева, а не версію дослідження.
4. **Посилання на завантаження приходить простим текстом**, а не JSON (принаймні для ZIP-файлів метаданих).
   Код має приймати обидва варіанти.
5. **Обмежених файлів немає**: `restricted = false` в усіх 66 567.
6. **Пошук `term=combustion` повертає 26 досліджень**, а не 24: ще PSI-108 (STDCE-1, Fluid Physics)
   і PSI-181 (Materials Science). Фільтруємо за `Research Area`, а не за пошуковим словом.

## 3. Папки PSI

| Папка | Файлів | ГБ | Беремо? |
|---|---|---|---|
| Raw Data | 65 629 | 13 482.13 | ні: відео, кадри, телеметрія |
| Calibration | 183 | 9.86 | ні |
| Presentations | 99 | 1.29 | ні |
| Reference Data | 59 | 1.13 | лише PDF-описи (`maybe`), архіви й відео ні |
| Engineering Documents | 185 | 1.02 | ні, крім одного словника колонок s-Flame |
| Analyzed Data | 244 | 1.00 | таблиці (`maybe`); для PSI-117 це єдині дані |
| Science Documents | 80 | 0.19 | **так**: ReadMe, DoD, матриці тестів; решта `maybe` |
| Reports | 29 | 0.14 | `maybe`: фінальні звіти для карток |
| Representative Image(s) | 13 | 0.00 | ні |
| Investigation Metadata Files | 24 | 0.00 | ні: ISA-Tab-копія того, що віддає JSON API |
| Experimental table | 22 | 0.00 | **так**: це головні дані |

## 4. Що саме потрібно продукту (`need`, 46 файлів)

### 22 таблиці експериментів
Ті самі 22 CSV, що описані в `docs/03-data-sources.md`, розділ 4. Вони вже зведені в `data/processed`.

### 24 документи, які пояснюють колонки й умови
ReadMe є лише в шести дослідженнях. В інших ту саму роль виконують DoD (Description of Data),
«data interpretation», «data file description» і матриці тестів.

| Дослідження | Документи | Навіщо |
|---|---|---|
| PSI-20 ACME BRE | `ACME_BRE_Readme.docx`, `BRE_data_interpretation_20220804.pdf`, `ACME_non-imaging_data_file_description.pdf`, `ACME-BRE_Test_Summary.docx` | значення колонок; тиску в таблиці немає, шукати в Test Summary |
| PSI-22 E-FIELD | `E-FIELD Flames DoD.pdf`, `data interpretation document.pdf`, `non-imaging data file description.pdf` | колонки, полярність сітки |
| PSI-23 s-Flame | `s-Flame DoD.pdf`, `s-Flame_data_interpretation_20210920.pdf` (у Engineering Documents), `non-imaging data file description.pdf` | атмосфера записана текстом |
| PSI-25 BASS-II | `BASS-II_ReadMe.docx`, `BASS-II_Test.Matrices.xlsx` | потік у колонці `Air display` |
| PSI-26 BASS | `Planned_Test Matrix.xlsx`, `As Run_Test Matrix.xlsx` | у таблиці BASS немає умов атмосфери й потоку: вони тут |
| PSI-39 CFI | `CFI_DataSummary_Spreadsheet_Jan2021.xlsx` | зведення тестів CFI |
| PSI-47 DAFT | `DAFT Retrieved Data Summary.xls` (Analyzed Data) | таблиця DAFT має лише 2 текстові рядки |
| PSI-68 FLEX-2 | `FLEX-2 DoD.docx` | колонки матриці умов |
| PSI-69 FLEX | `FLEX DoD.docx` | колонки `O`, `N`, `CO` |
| PSI-98, PSI-100 SAFFIRE-I/III | `SAFFIRE-I and SAFFIRE-III Readme.docx` (той самий файл у двох дослідженнях) | колонки, рядки про відео |
| PSI-99 SAFFIRE-II | `SAFFIRE-II Readme.docx` | колонки µ-g і 1 g |
| PSI-115 (наземне) | `DataOrganizationDocument.pdf` | структура даних SAME для моделювання диму |
| PSI-117 (наземне) | `ReadMe_List_of_Data.xlsx` (Analyzed Data) | перелік CSV з даними, таблиці експериментів немає |
| PSI-142 (наземне) | `PSI data summary Princeton with links.xlsx` (Analyzed Data) | повніша версія таблиці-посилань |

Без словника лишаються PSI-10 Flame Design, PSI-21 CLD Flame, PSI-101 SAME-R, PSI-102 SAME,
PSI-106 SLICE, PSI-107 SPICE і PSI-159 CFI-G. Для них найближчі джерела — фінальні звіти й SRD
з `maybe` (PSI-21 і PSI-106 не мають жодного документа, лише таблицю й сирі дані).

## 5. Що може знадобитись пізніше (`maybe`, 261 файл, 1 ГБ)

- **Фінальні звіти** (11 файлів): `FinalRpt_ACMEFlameDesign.pdf`, `BASS-II Summary Report.pdf` (49 МБ),
  `CFI Science Final Report.pdf`, `SAME_Final Science Report.pdf` тощо. Потрібні для карток з цитатами
  з документів (зараз картки беруть текст лише з метаданих PSI) і для поля `fireSafetyRelevance`.
- **SRD** (Science Requirements Document, 8 файлів): заплановані умови тестів, якщо їх немає в таблиці.
- **Таблиці Analyzed Data**: SAME і SAME-R (144 файли, 0.7 ГБ), DAFT, PSI-117
  (екстинкція крапель, холодне полум'я — єдині числа цього наземного дослідження).

## 6. Дослідження без даних

| ID | Що є |
|---|---|
| PSI-60, PSI-62 (наземні) | лише ZIP метаданих: ні таблиць, ні документів. Для карток є тільки метадані API і статті |
| PSI-115 (наземне) | 44 файли `.dat` з моделювання диму (254 МБ) і один документ; таблиці немає |
| PSI-117 (наземне) | 9 малих таблиць у Analyzed Data; таблиці експериментів немає |
| PSI-21 CLD Flame, PSI-106 SLICE | таблиця експериментів і сирі дані, документів немає |

## 7. Що з цього випливає для пайплайна

1. `ingest` має брати список файлів з `files/v2`, а не з `added[]`. Тоді запасний шлях
   «вручну завантажити документи» з `03-data-sources.md` не потрібен.
2. Завантажувати 46 файлів `need` (7 МБ): 22 CSV у `data/raw/PSI-xx/tables/`, документи в `data/raw/PSI-xx/docs/`.
   Документи `.docx`, `.pdf`, `.xlsx` уже в `.gitignore` для `data/raw`.
3. `maybe` качати лише під конкретну задачу: картки з документів (DA-12), умови для BASS і BRE (DA-10).
4. Перед DA-10 прочитати словники з розділу 4: для BASS умови атмосфери й потоку лежать у матрицях тестів,
   а в зведених даних зараз `null`.
