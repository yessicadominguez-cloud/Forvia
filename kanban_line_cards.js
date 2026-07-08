// ── Alimentación de los tableros Line y Leveling desde kanbanLineCards.csv ─────
//
// Reemplaza a los feeders anteriores (LineasSurtidor / Leveling vía HTTP).
// Estructura esperada del CSV:
//   idModelo, noTarjeta, serial, status, modelo, time
//
//   • Line     → cada fila del CSV es UNA tarjeta (se ignora noTarjeta).
//                occupied = nº de filas del modelo.
//   • Leveling → POOL de cada franja de 30 min = nº de tarjetas cuyo 'time'
//                cae en esa franja. TPA NO se toca (queda editable).
//   • Config (max/umbral/pps/nombre) sale de Admin; los modelos del CSV que no
//     existan en Admin se registran ahí con valores por defecto.

const CSV_URL       = 'kanbanLineCards.csv';
const DEFAULT_MAX   = 12;   // batch estándar por defecto (modelos nuevos del CSV)
const DEFAULT_LIMIT = 4;    // umbral crítico por defecto
const DEFAULT_PPS   = 80;   // piezas por pallet por defecto
const LINECARDS_POLL_MS = 5000;

// ── Namespace del módulo ──────────────────────────────────────────────────────
const LineCards = (() => {

  // Lee el CSV y vuelca su contenido a los tableros. Cache-bust para el polling.
  async function cargarDesdeCSV() {
    try {
      const res = await fetch(CSV_URL + '?t=' + Date.now(), { headers: { 'Accept': 'text/csv' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      _aplicar(_parseCSV(text));
    } catch (e) {
      console.warn('[LineCards] No se pudo leer el CSV:', e.message);
    }
  }

  // Agrupa por idModelo y aplica a Line + Leveling
  function _aplicar(rows) {
    const byModel = new Map();
    rows.forEach(r => {
      const id = parseInt(r.idModelo, 10);
      if (Number.isNaN(id)) return;
      if (!byModel.has(id)) byModel.set(id, []);
      byModel.get(id).push(r);
    });
    _aplicarLine(byModel);
    _aplicarLeveling(byModel);
  }

  // ── Tablero LINE (y Surtidor, que comparte occupied) ───────────────────────
  function _aplicarLine(byModel) {
    if (typeof models === 'undefined') return;

    // Registrar en Admin los modelos nuevos del CSV (Admin + defaults)
    if (window.KANBAN_ADMIN && Array.isArray(window.KANBAN_ADMIN.modelos)) {
      byModel.forEach((cards, id) => {
        if (!window.KANBAN_ADMIN.modelos.find(c => c.id === id)) {
          window.KANBAN_ADMIN.modelos.push({
            id,
            nombre:   cards[0].modelo || ('Modelo ' + id),
            umbral:   DEFAULT_LIMIT,
            estandar: DEFAULT_MAX,
            pps:      DEFAULT_PPS,
            activo:   true
          });
        }
      });
      // Sincroniza KANBAN_ADMIN → models[] (crea/actualiza config; no borra los del CSV)
      if (typeof Admin !== 'undefined' && Admin.cargar) Admin.cargar();
    }

    // Vuelca tarjetas y ocupación desde el CSV
    models.forEach(m => {
      const cards = byModel.get(m.id);
      if (cards) {
        m.occupied = cards.length;
        m.tarjetas = cards.map((r, i) => ({
          numero: i + 1,            // posición secuencial (noTarjeta se ignora)
          serial: r.serial,
          status: r.status
        }));
      } else {
        m.occupied = 0;
        m.tarjetas = [];
      }
    });
  }

  // ── Tablero LEVELING (columna POOL) ────────────────────────────────────────
  function _aplicarLeveling(byModel) {
    if (typeof levelingRows === 'undefined' || typeof TIME_SLOTS === 'undefined') return;

    // Asegurar una fila por cada modelo del CSV (preservando TPA existente)
    byModel.forEach((cards, id) => {
      if (!levelingRows.find(r => r.modelId === id)) {
        levelingRows.push({
          rowId:   (typeof nextRowId !== 'undefined' ? nextRowId++ : id),
          modelId: id,
          slots:   TIME_SLOTS.map(() => ({ tpa: '', pool: '' }))
        });
      }
    });

    // Recalcular POOL en cada fila sin tocar TPA
    levelingRows.forEach(row => {
      // Normalizar longitud de slots al horario actual, conservando TPA
      if (row.slots.length !== TIME_SLOTS.length) {
        const old = row.slots;
        row.slots = TIME_SLOTS.map((_, i) => old[i] ?? { tpa: '', pool: '' });
      }
      const cards  = byModel.get(row.modelId) || [];
      const counts = new Array(TIME_SLOTS.length).fill(0);
      cards.forEach(r => {
        const idx = _slotIndexForTime(r.time);
        if (idx >= 0) counts[idx]++;
      });
      row.slots.forEach((s, i) => { s.pool = counts[i] ? String(counts[i]) : ''; });
    });
  }

  // Devuelve el índice de TIME_SLOTS para un timestamp "YYYY-MM-DD HH:MM:SS.mmm"
  function _slotIndexForTime(t) {
    const m = String(t).match(/(\d{1,2}):(\d{2})/);
    if (!m) return -1;
    const hh = String(parseInt(m[1], 10)).padStart(2, '0');
    const mm = parseInt(m[2], 10) < 30 ? '00' : '30';
    return TIME_SLOTS.indexOf(`${hh}:${mm}`);
  }

  // ── Parseo de CSV (soporta campos entre comillas) ──────────────────────────
  function _parseCSV(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return [];
    const headers = _splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const cells = _splitCsvLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i] : ''; });
      return obj;
    });
  }

  function _splitCsvLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }  // comilla escapada ""
          else inQ = false;
        } else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  // ── Polling: relee el CSV periódicamente ───────────────────────────────────
  function iniciarPolling() {
    setInterval(async () => {
      await cargarDesdeCSV();
      if (typeof currentModule !== 'undefined' &&
          (currentModule === 'line' || currentModule === 'supplier' || currentModule === 'leveling')) {
        // No re-renderizar si el usuario está editando una celda (TPA del Leveling)
        const activo   = document.activeElement;
        const editando = activo && activo.classList && activo.classList.contains('cell-input');
        if (!editando) render();
      }
    }, LINECARDS_POLL_MS);
  }

  return { cargarDesdeCSV, iniciarPolling };
})();
