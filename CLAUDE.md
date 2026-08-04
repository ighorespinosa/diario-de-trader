# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository actually is

The project is the Markdown document [diario_de_trade_especificacao_completa_v2.md](diario_de_trade_especificacao_completa_v2.md) plus a `prototype/` directory that holds the runnable extraction of the app it describes. There is no build system, package manager, or test runner — `prototype/index.html` runs directly via `file://`, no bundler or dev server needed.

Section 12 of the document ("Apêndice — Código-fonte completo e literal") embeds that same prototype (HTML + CSS + Chart.js/Google Fonts via CDN + 12 JS modules by responsibility, e.g. `storage.js`, `data.js`, `killzone.js`, `calculations.js`, `render.js`, `form.js`) as one fenced code block per file in `prototype/`. That embedded code is the authoritative reference implementation — every rule, formula, and field described in sections 1–11 was extracted directly from it, and the blocks in section 12 are byte-for-byte copies of the files in `prototype/`, never retyped by hand. The `<script>` tags in `prototype/index.html` load in a specific order that mirrors the original single-file script's top-to-bottom execution order — some modules (e.g. `killzone.js`) run top-level code immediately on load, so that order is load-bearing, not cosmetic. See the note at the top of section 12 for the one exception (isolating `renderChart` into its own `chart.js`) and why it's safe.

There are no commands to build, lint, or test in this repo. The document states the prototype is covered by 64 automated jsdom-based tests (section 11), but that test suite is not included here — only its coverage is described narratively.

## How to work in this repo

- Treat the Markdown document as the single source of truth. Do not invent behavior, field names, element IDs, or formulas that aren't in it — cross-check against the literal code in section 12 when a description in sections 1–11 seems ambiguous.
- If asked to modify app behavior, edit **both** the narrative spec (relevant section 1–11) and the actual files in `prototype/` consistently, then regenerate section 12's fenced blocks from those files (copy, don't retype) so the doc and the code never drift apart.
- `prototype/` already exists as the maintained, tested extraction — don't re-extract from section 12 unless `prototype/` is missing or out of sync. Don't "clean up" or refactor the extracted code beyond what's asked.
- Preserve the versioning convention: the doc explicitly says v2 replaces v1 and lists exactly what changed (section header at the top, and section 8 "bugs already fixed — do not reintroduce"). If asked to produce a v3, follow the same pattern: state what changed, keep everything else byte-identical, and append rather than delete history.
- Section 8 lists specific bugs already fixed in this codebase (render-order bug hiding the table on Chart.js failure, a stale `updatePreview()` reference, a `window.storage` availability-check timing bug, a CSS specificity collision on the edit banner, and the old named-timezone killzone calculation). Do not reintroduce any of these when refactoring.

## Core domain logic (read before touching financial calculations)

These are the parts of the spec most likely to need careful review, since they involve money and historical data integrity:

- **R-multiple P&L formula** (section 4.1): `risco = |entrada − stop|`; `movimento` is entrada→saída distance, sign-flipped for `Venda` vs `Compra`; `R = movimento / risco`; `ganho = valorEntrada × R`. Zero risk (entrada == stop) must block calculation, not divide by zero.
- **Chronological compounding balance** (`computeSeries()`, section 4.3): trades are sorted by date+time and balance compounds forward; a month's configured `initial` capital resets the balance **only on that month's first trade** (tracked via an `appliedMonths` set) — months with no configured capital simply continue compounding from the prior month, they never reset to 0.
- **Legacy migration rules** (section 3 and 4.2): old records lacking `resultInput`, `confluences`, or `valorEntrada` must be upgraded in place following the exact rules given — in particular, legacy `resultMode:'percentual'` records must keep using `pctBasis:'capital'` (percent of account balance) rather than being reinterpreted as percent of trade entry value, or historical balances would change retroactively.
- **Killzone calculation** (section 4.8): must use pure UTC arithmetic (`getTimezoneOffset()`) against a user-configurable UTC offset — never a named IANA timezone (`Intl.DateTimeFormat` with `America/...`) — since that was the exact bug the v2 rewrite fixed.

## Storage model

Four keys, each JSON-stringified, via a `window.storage.get/set` API with automatic fallback to `localStorage` (section 3): `trades-data`, `capital-config`, `filter-config`, `location-config`. The `stGet`/`stSet` wrappers must check `window.storage` availability on **every call**, not once at init — checking once caused a real bug where late host injection made the app silently fall back to non-persistent storage (section 8, bug 3).

When porting to native platforms, section 9 gives the intended replacement per platform (SQLite/Room/CoreData/JSON file) — the data shapes and migration rules must stay identical regardless of storage backend.
