# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Kanban Digital board for the Honda 25SA production line (NC Tech MES). No build step, no
package manager, no framework — it's a static HTML file plus a handful of plain `<script>` files, meant to
be dropped onto the same host/port that serves the external DeviceWISE system it talks to. Open
`KANBAN.html` directly (or serve the folder statically) to run it; there is nothing to compile or install.

## Architecture

**Entry point:** `KANBAN.html` contains the entire UI (styles + markup + main app logic in an inline
`<script>` at the bottom). It defines a global `models[]` array (the in-memory source of truth for the UI)
and a hand-rolled router (`switchModule('leveling'|'line'|'supplier'|'admin')` + `render()`) that
re-renders `#main-content` by fully replacing its `innerHTML` — there is no virtual DOM or component
framework. Each module has its own `render<Module>(container)` function that builds a full HTML string.

**Data feeder modules** (loaded as separate `<script>` tags before the inline script, each an IIFE exposing
a small namespace on `window`): `kanban_admin.js` (`Admin`), `kanban_leveling.js` (`Leveling`),
`kanban_linea_surtidor.js` (`LineasSurtidor`), `kanban_line_cards.js` (`LineCards`). These own the
GET/POST calls to the external DeviceWISE API and reconcile server data back into the page-global `models`
/ `levelingRows` / `TIME_SLOTS` arrays defined in `KANBAN.html`. They rely on those globals existing already
(checked via `typeof models === 'undefined'` guards), so load order matters and these files are not usable
standalone.

**Current wiring (see `window.onload` at the bottom of `KANBAN.html`):** Only `Admin` and `LineCards` are
active. `Admin.cargarDesdeServidor()` is the source of truth for model config (name/umbral/estandar/pps).
`LineCards.cargarDesdeCSV()` reads `kanbanLineCards.csv` (polled every 5s) to drive both the Line/Surtidor
occupancy (`models[].occupied`/`tarjetas`) and the Leveling board's read-only POOL column — it also
auto-registers any model id present in the CSV but missing from Admin, using `DEFAULT_MAX`/`DEFAULT_LIMIT`/
`DEFAULT_PPS`. `LineasSurtidor` (status/get endpoint) and `Leveling.cargarDesdeServidor()` (leveling/get
endpoint) are older HTTP feeders now disabled in favor of the CSV — their code is still present and correct
but not called. Don't re-enable them without checking with the user, since the CSV is the current intended
data source.

**Model identity:** every model has an integer `id` that must match across all three data sources (Admin
config, status/line-cards occupancy, leveling rows' `modeloId`). See
[INTEGRACION_DEVICEWISE.md](INTEGRACION_DEVICEWISE.md) for the full request/response contract with
DeviceWISE (endpoints, polling intervals, field semantics, the ÓPTIMO/RE-ORDEN/CRÍTICO status thresholds
based on `occupied` vs `limit`/`max`).

**Leveling board specifics:** `TIME_SLOTS` are 30-minute slots starting at 07:00 (wraps past midnight).
While a `.cell-input` (TPA cell) is focused, polling-triggered re-renders are skipped so the user's typing
isn't clobbered — any code touching the Leveling polling loops must preserve this behavior.

## Key files

- `KANBAN.html` — app shell, styling, router, and all four module renderers (Leveling/Line/Supplier/Admin) plus their modals.
- `kanban_admin.js`, `kanban_leveling.js`, `kanban_linea_surtidor.js`, `kanban_line_cards.js` — data feeders (see above).
- `kanbanLineCards.csv` — local CSV data source currently driving Line/Supplier/Leveling POOL (columns: `idModelo,noTarjeta,serial,status,modelo,time`).
- `INTEGRACION_DEVICEWISE.md` — the authoritative API contract with the external DeviceWISE system (Spanish).
- `logo_nctech.png` — header logo asset.

## Conventions

- Code and comments are written in Spanish (matching the plant/domain terminology); keep new code consistent with that.
- No test suite, linter, or bundler exists — verify changes by opening `KANBAN.html` in a browser.
- Tailwind is loaded via the CDN `<script>` in `<head>`; there's no Tailwind config file or build step.
