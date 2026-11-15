# Джерела даних: NASA PSI

Усе нижче перевірено наживо 14 листопада 2026. Дані PSI відкриті, без логіну, ліцензія CC0-1.0.
Вкладка Resources челенджу називає PSI «джерелом даних, на яких має бути побудований застосунок».
Готових наборів даних NASA не додала.

## 1. Ресурси з вкладки Resources челенджу

| Ресурс | Навіщо нам |
|---|---|
| [PSI: Combustion Science](https://psi.nasa.gov/physci/repo/search?q=combustion) | основні дані |
| [NASA Combustion Science (Glenn)](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/) | короткі описи більшості досліджень; джерело для карток і глосарія |
| [A Researcher's Guide to ISS Combustion Science](https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/) | огляд 2015 року на 50+ сторінок; читає предметник, додаємо в пошук як загальне джерело |
| [ScienceCasts: відео про горіння на МКС](https://www.youtube.com/watch?v=W1oXykoz9zg) | 3.6 хвилини, вступ для всієї команди |
| [Apollo 1](https://sma.nasa.gov/sma-disciplines/accllp/apollo-1), [Apollo 13](https://sma.nasa.gov/sma-disciplines/accllp/apollo-13), [пожежа на «Мирі»](https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/) | мотивація для демо |
| Spinoff: [балони пожежників](https://spinoff.nasa.gov/node/9582), [детектор диму](https://spinoff.nasa.gov/node/9407), [одяг пожежників](https://spinoff.nasa.gov/node/9918) | розділ «застосування на Землі» |

## 2. API PSI

Базова адреса: `https://psi.nasa.gov`.

| Що | Запит |
|---|---|
| Список досліджень | `GET /geode-py/ws/repo/search?term=&source=psi&type=investigation&size=300` — 133 дослідження, фільтруємо Research Area = Combustion Science |
| Деталі дослідження | `GET /geode-py/ws/repo/investigations/PSI-25` |
| Посилання на файл | `GET /geode-py/ws/studies/PSI-25/download?file=<encodeURIComponent(file_name)>&version=<version>&redirect=false` — повертає тимчасове посилання на `psi-repo-prod.s3.amazonaws.com`, файл качаємо другим запитом |

Поля відповіді «деталі», які нам потрібні:

- `accession`, `title`, `investigationAcronym`, `doi`, `projectType` (`Microgravity Investigation` або `Ground Investigation`);
- `objective`, `approach`, `hypothesis`, `researchImpacts` — готовий текст для картки;
- `experimentHardware`, `flightProgram`, `researchArea`, `subResearchArea`, `managingNasaCenter`;
- `investigationStartDate`, `investigationEndDate`, `licenseIdentifier`, `totalFileSize`;
- `publications[]` — назва, автори, DOI (повних текстів немає);
- `experimentalTable[]` — `file_name`, `file_size`, `version`, `s3_path`;
- `added[]` — список файлів: `file_name`, `file_size`, `remote_path` (у шляху назва папки), `version`.

### Підводні камені

1. **`added[]` буває порожнім.** У PSI-99 (SAFFIRE-II), PSI-69 (FLEX), PSI-68 (FLEX-2), PSI-22 (E-FIELD)
   список порожній, у PSI-106, PSI-20, PSI-21, PSI-62, PSI-60 в ньому один файл, хоча документи на сайті є.
   На кроці 1 відкриваємо сторінку такого дослідження в браузері, дивимось у DevTools → Network,
   яким запитом сайт отримує дерево файлів, і додаємо цей запит в ingest. Запасний шлях: вручну завантажити
   1–2 ключові документи на кожне таке дослідження.
2. **Документи бувають великі й старих форматів.** BASS-II Summary Report — PDF на 46.7 МБ.
   У DAFT звіти в `.doc` і `.ppt`. Ставимо ліміт 60 МБ на файл, старі формати конвертуємо через
   LibreOffice (`soffice --headless --convert-to pdf`) або пропускаємо із записом у журнал.
3. **Папки `Raw Data` не чіпаємо.** Загальний обсяг: BASS-II 275 ГБ, FLEX 924 ГБ, FLEX-2 1.2 ТБ,
   Flame Design 2.2 ТБ, CFI-G 2.1 ТБ.
4. **Потрібні папки:** `Experimental table`, `Science Documents` (ReadMe, SRD, Test Matrices),
   `Reports` (Summary або Final Report), за потреби `Reference Data`.
5. **Тимчасові посилання S3 швидко спливають.** Посилання отримуємо безпосередньо перед завантаженням.
6. **Не навантажуємо сервер.** Запити послідовно, з паузою, з кешем на диску. Повторний запуск
   ingest не має нічого качати вдруге.
7. **CSV починається з BOM.** Читати з `encoding="utf-8-sig"`, інакше назва першої колонки буде зіпсована.
8. **ReadMe — це словник колонок.** У папці `Science Documents` кожного дослідження є малий файл ReadMe
   (у BASS-II це 21 КБ, .docx). Там пояснено, що означає кожна колонка таблиці. Без нього колонку легко
   витлумачити неправильно: у BASS-II швидкість потоку лежить у колонці `Air display`, а не `Fan display`.
   ReadMe читаємо перед маппінгом кожної таблиці.

## 3. 24 дослідження з горіння

Кількість рядків — це рядки даних у таблиці експериментів. Напрям безпеки — робоча гіпотеза,
яку предметник підтверджує за документами.

| ID | Назва | Обладнання | Рядків | Статей | Напрям (гіпотеза) |
|---|---|---|---|---|---|
| PSI-26 | BASS | MSG | 122 | 10 | prevention, suppression |
| PSI-25 | BASS-II | MSG | 129 | 17 | prevention |
| PSI-98 | SAFFIRE-I | Cygnus | 4 | 6 | prevention |
| PSI-99 | SAFFIRE-II | Cygnus | 15 | 7 | prevention |
| PSI-100 | SAFFIRE-III | Cygnus | 2 | 3 | prevention |
| PSI-102 | SAME | Comparative Soot Diagnostic | 8 | 16 | detection |
| PSI-101 | SAME-R | Comparative Soot Diagnostic | 109 | 6 | detection |
| PSI-47 | DAFT / DAFT-2 | TSI P-Trak | 2 | 2 | detection |
| PSI-107 | SPICE | MSG | 469 | 9 | fundamentals (сажа, точка димоутворення) |
| PSI-106 | SLICE | MSG, канал SPICE | 12 | 5 | fundamentals |
| PSI-69 | FLEX | CIR, MDCA | 274 | 51 | suppression |
| PSI-68 | FLEX-2 | CIR, MDCA | 8 | 48 | suppression, fundamentals |
| PSI-39 | CFI | CIR, MDCA | 87 | 7 | fundamentals (холодне полум'я) |
| PSI-10 | ACME Flame Design | CIR, ACME | 207 + 120 | 33 | fundamentals (сажа) |
| PSI-20 | ACME BRE | CIR, ACME | 18 | 16 | prevention (горючість матеріалів на газовому пальнику) |
| PSI-21 | ACME CLD Flame | CIR, ACME | 32 | 18 | fundamentals |
| PSI-22 | ACME E-FIELD Flames | CIR, ACME | 32 | 25 | fundamentals (імітація часткової гравітації) |
| PSI-23 | ACME s-Flame | CIR, ACME | 18 | 44 | fundamentals |
| PSI-159 | ACME CFI-G | CIR, ACME | 179 + 1015 | 2 | fundamentals (холодне полум'я, до 85% O₂) |
| PSI-142 | Cool Flame Transitions, Counterflow Flames (наземне) | лабораторія | 8 | 12 | fundamentals |
| PSI-62 | Concurrent Flame Spread Modeling vs BASS (наземне) | — | — | 4 | prevention |
| PSI-60 | Computational and Experimental Analysis of SPICE Data (наземне) | — | — | 1 | fundamentals |
| PSI-117 | Cool Flame Dynamics, CFD (наземне) | — | — | 10 | fundamentals |
| PSI-115 | SAME Data for Smoke Modeling (наземне) | — | — | 0 | detection |

Разом 2 870 рядків у 22 таблицях, з них **2 009 непорожніх**: у `CFI-G_Inverse Flames.csv` 861 з 1 015 рядків
складаються лише з ком (перевірено 14.11 скриптом `python3 -m pipeline`). Не кожен рядок є окремим тестом: частина таблиць містить
підсумки днів тестів або рядки матриці умов.

## 4. Колонки 22 таблиць експериментів

Назви колонок наведено дослівно, з одруківками джерела.

### Тверді матеріали

**PSI-26 BASS** (`BASS.csv`, 122 рядки, один рядок = тест)
`Date, GMT, As Run Test #, Test #, Sample #, Fuel Sample Material`
Приклад: `3/30/2012, 90, 1, 1, 4, SIBAL 2 cm`.
Умов атмосфери й потоку в таблиці немає. Їх беремо з Test Matrices і ReadMe.

**PSI-25 BASS-II** (`BASS-II.csv`, 129, тест)
`PI, Test #, Date, GMT, Sample #, Fuel Sample Material, Flow restrictor, Fan display, Air display, Radiometer gain (1000 250 50 10), Total Frames Shot, Calibrated initial O2 % by vol, Calibrated final O2 % by vol, Initial CO2 % by vol, Final CO2 % by vol, Initial CO (ppm), Final CO (ppm)`
Приклад: `Bhattacharjee, B1, 2/19/2014, 50, 147, 100 micron PMMA film   2 cm wide, 2, 62, 5, 50, 57, 22.2, 22.2, 0.44, 0.44, 0, 6`.
Значення колонок пояснює ReadMe дослідження:
- `Air display` — швидкість потоку в каналі, см/с. Датчик повільний (близько хвилини), показ стабільний лише при сталому режимі;
- `Fan display` — напруга вентилятора × 10, а не швидкість;
- `Flow restrictor` — обмежувач потоку: 0 дає найбільший потік, 2 найменший;
- кисень відкалібровано за бортовим аналізатором МКС; `OR` у колонці CO означає понад 1000 ppm.

Наслідку тесту в таблиці немає. У файлі Test Matrices (xlsx) ті самі колонки, наслідку там теж немає.

**PSI-98 SAFFIRE-I** (`SAFFIRE-1.csv`, 4)
`Sample Number, Material, Sample Thickness (cm), Sample Length (cm), Sample Width (cm), Air Flow (cm/s), Percent O2, Ignition Power (W), Ignition Time (s), Burn Time (s), Flow Direction, Camera 1, Camera 2`
Приклад: `S1, SIBAL Fabric, 0.37, 40.6, 94, 20, 21.5 - 21.7, 182, 8, 420, Concurrent`.
Є рядки, які описують не тест, а відеодані.

**PSI-99 SAFFIRE-II** (`SAFFIRE-2.csv`, 15)
`Sample Number, Material, Samle Thickness, Sample Length, Sample Width (cm), Air Flow (cm/s), Percent O2 (Note 1), Ignition Power (W), Ignition Time (s), Burn Time (s), Flow Direction, ?-g Burn Length, ?-g Spread Length, 1-g Burn Length, 1-g Spread Rate, Camera 1, Camera 2`
Приклад: `2-2, Silicone, 0.61 mm, 29 cm, 5 cm, 20 cm/s, ~ 22.1, 80 W, 9.2 s, Insignificant, Concurrent, ~ 0, n/a, 7.6 cm, 1.2 mm/s`.
Одиниці стоять у значеннях, є текст замість чисел (`Insignificant`, `Complete`, `Acceleratory`),
одруківки (`037 mm`), `?-g` — це зіпсований символ `µ-g`. Таблиця містить порівняння з 1 g.

**PSI-100 SAFFIRE-III** (`SAFFIRE-3.csv`, 2)
`Sample Number, Material, Sample Thickness, Sample Length, Sample Width, Air Flow, Direction, Camera 1, Camera 2`

### Дим і виявлення

**PSI-102 SAME** (`SAME.csv`, 8)
`Sample #, Sample Material, Air Flow (cm/s), Weight loss rate (mg/min), Aging Duration (minutes)`

**PSI-101 SAME-R** (`SAME-R.csv`, 109)
`Sample Type, SAME Test #, Description, Date, Inlet velocity (cm/s), Rt/R0, Duration (sec), Primary aging time (sec), Primary mixing time (sec), Net aging time (sec)`
Приклад: `Kapton, 51, B.L. new formula, 21-Jul, 8.1, 1.38, 60, 11, 8, 38`. Дата без року.

**PSI-47 DAFT / DAFT-2** (`DAFT.csv`, 2)
`Session Name, Actual Day, Hardware Description, Sample Material, Sampled Location` — текстові описи сесій.

### Краплі рідкого палива

**PSI-69 FLEX** (`FLEX.csv`, 274, тест)
`FLEX Test #, FLEX Identifier, Test Date, Test GMT, Fuel, Ambient pressure; mmHg, O initial ambient composition; mole fraction, N initial ambient composition; mole fraction, CO initial ambient composition; mole fraction, He initial ambient composition; mole fraction, Droplet initial diameter; mm, Visible flame extinction diameter; mm, Burning rate; mm, Burn time; s, Test end`
Приклад: `1, 20CAL08, 3/5/2009, 17:22:03, Methanol, 757.7, 0.21, 0.79, 0, 0, 1.69, 0.89, 0.52, 4.3, Disruption`.
Тиск у mmHg, склад у мольних частках. Колонки `O`, `N`, `CO` — це O₂, N₂ і CO₂ зі втраченими індексами:
звірити з ReadMe перед маппінгом.

**PSI-68 FLEX-2** (`Flex2.csv`, 8, рядок матриці умов)
`Sample (Fuel Type), Initial Droplet Diameter (mm), Ambient Gas Mixture, Oxygen Mole Fraction, Ambient Pressure (atm), Ambient Temperature (C), Flow Velocity (cm/s)`
Приклад: `IsoOctane (pure), 1.5 - 5, O2/N2 or O2/He, 0.17; 0.21;0.25; 0.3, 0.5; 1.0; 1.5; 2.0; or 3.0, 25, 0.1 - 5`.
Це не окремі тести, а діапазони й переліки на паливо.

**PSI-39 CFI** (`CFI.csv`, 87, тест)
`Flex Number, Test Date, Local Time, CIR, Pressure, Oxygen, Nitrogen, Helium, Fiber, Fuel`
Приклад: `1206, 9-Mar-17, 02:03:08 pm est, f068a03, 1 atm, 0.21, 0.79, 0, No, C12H26`.

### Газове полум'я

**PSI-107 SPICE** (`Spice.csv`, 469, тест)
`GMT date, GMT ignition, GMT Flame Off, Fuel, Nozzle (mm), Fuel Rate (sccm), Fuel Rate (mg/s), HC Fuel Rate (mg/s), Air Rate (cm/s)`
Є повторні рядки.

**PSI-106 SLICE** (`Slice.csv`, 12, день тестів)
`Test Date, Fuel Type` — наприклад `2012-FEB-20, 20% C2H4 (balance N2)`.

**PSI-10 ACME Flame Design** (два файли)
Normal (207): `Flame Type, Day, Fuel, Test, Xfuel, mfuel (mg/s), mN2 (mg/s), mtot (mg/s), XO2 (init), XO2 (final), pinit (atm), pfinal (atm), pmean (atm), mean Zst, Tad (K)`
Inverse (120): `Flame Type, Day, Test, XO2, mO2 (mg/s), mN2 (mg/s), mtot (mg/s), XC2H4 initial, XC2H4 final, pinit (atm), pfinal (atm), pmean (atm), mean Zst, Tad (K)`
У числових колонках трапляється текст `RAMPED`.

**PSI-20 ACME BRE** (`ACME BRE.csv`, 18, день тестів)
`Year, Month, Date, Burner Size (mm), Fuel Bottle, Oxygen Conc (percent), Flames Ignited, Notes`
Приклад: `2019, Feb, 8, 25, 100% C2H4, 21; 26.5; 40, 10, ...`. Кілька значень O₂ в одній клітинці.
Тиск у таблиці не вказано (про це сказано у виносці).

**PSI-21 ACME CLD Flame** (`CLD Flame.csv`, 32, день тестів)
`Test Type, Test Day, Fuel MFC, N2 MFC, Fuel Bottle, Fuel conc. Range, Flames ignited, Notes`

**PSI-22 ACME E-FIELD Flames** (`ACME E-FIELD Flames.csv`, 32, день тестів)
`Test Type, Test Day, Year, Month, Date, Mesh Polarity, Fuel Bottle, Fuel Conc, Flames Ignited, Notes`

**PSI-23 ACME s-Flame** (`ACME s-Flame.csv`, 18, день тестів)
`Test Type, Test Day*, Year, Month, Date, Atmosphere*, Fuel Bottle, Flames Ignited*, Notes`
Атмосфера текстом: `~21% O2 with N2`, `~30% O2 with N2`.

**PSI-159 ACME CFI-G** (два файли)
Normal (179): `Flame Type, Day, Fuel, Test, Cool flame?, XO2 before test, XO2 after test, approx p (bar), Xf, mHC (mg/s), TFP, Tad (K), Zst, Hot ignition, burn time (sec), Self-ext or flow term, Peak burner T (C), Comments`
Inverse (1015): `Flame Type, Day, Fuel, Test, Xf before test, Xf after test, approx p (bar), XO2, HC burnrate (mg/s), O2 flow rate (mg/s), TFP, Tad (K), Zst, Hot ignition, burn time (sec), Self -ext or flow term, Peak burner Temp (C), Peak burner temp (K), Color, Comments`
Приклад: `Normal, 1, ethane, 21088A1, , 0.3939, 0.389822946, 0.9443956, 1, 2, No, 2719.32, 0.1027, Yes, 50, SE, 290.6`.
`SE` = self-extinguished, `FT` = flow terminated. Найбільша й найчистіша таблиця з наслідком тесту.

### Наземне

**PSI-142** (`Data Summary Table.csv`, 8, посилання)
`Data ID, Data Description, Reference Publication Link, Figure ID in Reference` — вказує на рисунки у статтях.

## 5. Що це означає для нормалізації

- **Три рівні деталізації:** окремий тест, підсумок дня тестів, рядок матриці умов. Тому в `TestRecord`
  є поле `granularity`, а числа мають тип `Num` з діапазоном і переліком.
- **Одиниці різні:** mmHg, atm, bar; мольні частки й відсотки; одиниці всередині значень.
- **У ACME-таблицях колонка `Notes` — це виноски до всієї таблиці**, розкладені по рядках, а не примітки
  до конкретного рядка. Їх переносимо в `tableNotes` маппінгу.
- **Назви колонок не завжди зрозумілі без ReadMe.** Перед маппінгом таблиці читаємо ReadMe її дослідження.
- **Частини умов у таблицях немає** (BASS, BRE, SAME): вони в ReadMe, Test Matrices і звітах.
  Такі поля заповнюємо з документа з посиланням і додаємо шлях поля в `norm.inferred`.
- **Пріоритет маппінгу:** BASS-II → FLEX → CFI-G → SAFFIRE I–III → SPICE → BASS → Flame Design → CFI →
  SAME-R, SAME → BRE → FLEX-2 → решта.

## 6. Статті

У PSI лише метадані: приблизно 350 посилань. Анотації беремо за DOI:

- OpenAlex: `https://api.openalex.org/works/doi:<DOI>` (анотація в `abstract_inverted_index`, є `open_access.oa_url`);
- Crossref: `https://api.crossref.org/works/<DOI>` (анотація є не завжди);
- звіти NASA: `https://ntrs.nasa.gov` (пошук за назвою дослідження).

Повні тексти платних статей не завантажуємо й не зберігаємо.
