# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two separate static-HTML demo apps for NC Tech MES, both for Honda plant production lines. No build step,
no package manager, no framework beyond Tailwind loaded via CDN `<script>` tag — every page is meant to be
opened directly in a browser or served statically. There is nothing to compile or install.

1. **Kanban Digital (Honda 25SA line)** — `KANBAN.html` (and its byte-identical copy `index.html`, kept so
   the app loads when a static host serves `/` by default). Talks to a real external system, DeviceWISE.
2. **Recolección Mizusumashi (4 screens)** — `leveling_board.html`, `lanzador.html`, `tablero_rack.html`,
   `batch_building_box.html`. A newer, separate demo of the material-collection flow. Each page is
   standalone with its own inline app logic; there is no real backend yet, so they fall back to mock data
   and use `mock_backend.js` (`localStorage`) to fake cross-screen effects for the demo.

**These two apps do not link to each other or share JS files** (only the Tailwind CDN, Google Fonts, and
`logo_nctech.png` are common). Don't assume a change in one affects the other.

## Architecture — Kanban Digital (`KANBAN.html` / `index.html`)

**Entry point:** `KANBAN.html` contains the entire UI (styles + markup + main app logic in an inline
`<script>` at the bottom). It defines a global `models[]` array (the in-memory source of truth for the UI)
and a hand-rolled router (`switchModule('leveling'|'line'|'supplier'|'admin')` + `render()`) that
re-renders `#main-content` by fully replacing its `innerHTML` — there is no virtual DOM or component
framework. Each module has its own `render<Module>(container)` function that builds a full HTML string.

`index.html` is a **duplicate** of `KANBAN.html`, not a separate landing page — when editing one, apply the
same edit to the other (or the two will silently drift).

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

**Leveling board specifics:** `TIME_SLOTS` are 30-minute slots starting at 07:00 (wraps past midnight). Both
TPA and POOL cells are read-only static numbers sourced from the CSV feed — there is no in-UI editing or
"Guardar Plan" action in either `KANBAN.html` or `leveling_board.html`. Don't reintroduce an editable TPA
cell without checking with the user.

## Architecture — Recolección screens

`leveling_board.html`, `lanzador.html`, `tablero_rack.html`, `batch_building_box.html` are each fully
standalone: own `<style>`, own inline `<script>` at the bottom with its own `render()` and
`cargarDesdeServidor()` (polls every 5s, `setInterval(cargarDesdeServidor, 5000)`), no shared nav state with
`KANBAN.html`. Cross-navigation between the 4 screens is plain `<a href="...">` links in the header.

All 4 screens are **plant-wide, not scoped to a single línea** — the mizusumashi route serves multiple
production lines, so `linea` lives on each row/card/column (tarjeta in Lanzador, modelo in Rack/Batch Box,
fila in Leveling) rather than as a single top-level field. Don't reintroduce a single global `linea` for
these screens.

They call the same-origin endpoint contract documented in
[INTEGRACION_INTERFACES_RECOLECCION.md](INTEGRACION_INTERFACES_RECOLECCION.md) (`/kanban/leveling-planta/get`,
`/kanban/lanzador/get`, `/kanban/rack/get`, `/kanban/batch/get`, plus matching `/post` actions) — these
routes don't exist yet in this repo, so `cargarDesdeServidor()` in each file falls back to local mock data
on fetch failure.

**`mock_backend.js`** simulates the missing backend purely for the demo, using `localStorage` (key
`KANBAN_MOCK_STATE`) so an action on one screen shows up on another in the same browser:
- Lanzador discarding a card → queues a box that Tablero de Rack picks up on its next poll (`ESPERANDO`).
- Batch Building Box retiring a card (`retirarTarjeta`) → increments production, which Leveling Board adds
  to the current slot's `POOL`.

This is scaffolding only — once a real backend implements the endpoint contract, `mock_backend.js` and the
per-page mock fallbacks become dead code and should be removed together, not patched further.

## Key files

- `KANBAN.html` / `index.html` — Kanban Digital (Honda 25SA) app shell, styling, router, and all four
  module renderers (Leveling/Line/Supplier/Admin) plus their modals. Keep both files identical.
- `kanban_admin.js`, `kanban_leveling.js`, `kanban_linea_surtidor.js`, `kanban_line_cards.js` — Kanban
  Digital data feeders (see above).
- `kanbanLineCards.csv` — local CSV data source currently driving Line/Supplier/Leveling POOL in Kanban
  Digital (columns: `idModelo,noTarjeta,serial,status,modelo,time`).
- `leveling_board.html`, `lanzador.html`, `tablero_rack.html`, `batch_building_box.html` — the 4 Recolección
  Mizusumashi screens (see above).
- `mock_backend.js` — shared `localStorage`-based mock backend for the Recolección screens only.
- `INTEGRACION_DEVICEWISE.md` — authoritative API contract for Kanban Digital ↔ DeviceWISE (Spanish).
- `INTEGRACION_INTERFACES_RECOLECCION.md` — authoritative API contract for the 4 Recolección screens
  (endpoints, JSON shapes, PIK-card field glossary; Spanish).
- `logo_nctech.png` — header logo asset, shared by both apps.

## Conventions

- Code and comments are written in Spanish (matching the plant/domain terminology); keep new code consistent with that.
- No test suite, linter, or bundler exists — verify changes by opening the relevant HTML file(s) directly in a browser.
- Tailwind is loaded via the CDN `<script>` in `<head>` on every page; there's no Tailwind config file or build step.
