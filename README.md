# Flame Atlas

Проєкт для хакатону NASA Space Apps 2026, челендж «Flame in Freefall».
Це основний репозиторій команди: тут лежать план, код, дані й матеріали подання.

Зараз у репозиторії план, контекст для AI-агентів, формат даних, зразки й каркас сайту в `apps/web`.

**Сайт:** <https://vlo0d.github.io/flame-atlas/> — оновлюється сам після кожного пушу в `main`. Поки що показує зразки даних.

> Перед поданням цей README замінюється англійським README проєкту (задача DA-17).
> Цей текст тоді переїжджає в `docs/kit-readme.md`.

## З чого почати

| Хто | Читає |
|---|---|
| Усі | [docs/10-what-we-build.md](docs/10-what-we-build.md) — що має вийти, на прикладі |
| Усі | [docs/00-team-brief.md](docs/00-team-brief.md) — одна сторінка: дві команди, кроки |
| Усі | [AGENTS.md](AGENTS.md) — правила для людей і AI-агентів |
| Обидві команди | [contracts/README.md](contracts/README.md) — контракт даних, єдина межа між командами |
| Команда «Дані й AI» | [tracks/data-ai.md](tracks/data-ai.md), [docs/03-data-sources.md](docs/03-data-sources.md) |
| Команда «Продукт» | [tracks/product.md](tracks/product.md), [docs/01-product-spec.md](docs/01-product-spec.md) |
| Власник подання | [docs/08-submission.md](docs/08-submission.md), [docs/07-glossary.md](docs/07-glossary.md) |

## Що де лежить

```
AGENTS.md                 спільний контекст для всіх AI-агентів і людей
CLAUDE.md                 імпорт AGENTS.md для Claude Code
CHAT-MESSAGE.md           готове повідомлення для чату команди
contracts/                контракт даних між командами
  README.md               поля, правила, як змінювати
  schema/                 JSON-схеми чотирьох файлів (джерело правди)
  types.ts                типи TypeScript для сайту
  validate.py             перевірка даних: python3 contracts/validate.py data/fixtures
docs/
  00-team-brief.md        одна сторінка: мета, дві команди, кроки
  01-product-spec.md      що робить продукт, екрани, що зараз і що пізніше
  02-architecture.md      потік даних, де працює AI, формула ранжування, деплой, ризики
  03-data-sources.md      NASA PSI: 24 дослідження, колонки 22 таблиць, підводні камені
  04-contracts.md         короткий вказівник на контракт
  05-timeline.md          порядок кроків двох команд, передачі між ними, що різати
  06-working-agreement.md як працюємо з агентами; чому не BMAD і не Spec Kit цілком
  07-glossary.md          терміни горіння (чернетка)
  08-submission.md        вимоги до подання, критерії журі, чек-лист
  09-groups-and-blockers.md  дві команди, блокери, іменні відповідальності
  10-what-we-build.md     продукт простими словами, приклад використання, що здаємо
  11-psi-inventory.md     усі файли PSI: скільки їх, як дістати, що з них потрібно продукту
  12-corpus-plan.md       план: завантажити ~2 ГБ документів і таблиць PSI, корпус у JSON, контракт 1.2.0
  decisions.md            журнал рішень, склад команд
  si-usage-log.md         журнал використання AI (обов'язкове поле подання)
tracks/
  data-ai.md              задачі команди «Дані й AI» (DA-1 … DA-19)
  product.md              задачі команди «Продукт» (PR-1 … PR-12)
data/
  fixtures/               зразки чотирьох файлів у форматі контракту (справжні рядки PSI)
  review/                 шаблони ручної перевірки
submission/
  project-page.md         чернетка полів форми проєкту (англійською)
  references.md           список джерел для подання
```

## Як дати контекст агенту

1. Відкрий агента в корені репозиторію. Claude Code сам прочитає `CLAUDE.md` → `AGENTS.md`.
   Іншому агенту скажи: «Прочитай AGENTS.md».
2. Візьми шаблон промпту з `docs/09-groups-and-blockers.md`, розділ 4, і підстав номер задачі.
3. Прочитай план, який запропонує агент, перш ніж дозволити писати код.
