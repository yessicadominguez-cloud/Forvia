// ── Datos de fallback (usados cuando el servidor no responde) ─────────────────
window.KANBAN_LEVELING = {
  referencia: "FAU-F-PSG-4640",
  planta:     "Querétaro QRO-1",
  turno:      "1er Turno",
  horasSlots: [
    "07:00","07:30","08:00","08:30","09:00","09:30",
    "10:00","10:30","11:00","11:30","12:00","12:30",
    "13:00","13:30","14:00","14:30","15:00","15:30",
    "16:00","16:30","17:00","17:30","18:00","18:30",
    "19:00","19:30","20:00","20:30","21:00","21:30","22:00"
  ],
  filas: [
    { rowId: 1, modeloId: 1, slots: Array(31).fill(null).map(() => ({ tpa: 0, pool: 0 })) },
    { rowId: 2, modeloId: 2, slots: Array(31).fill(null).map(() => ({ tpa: 0, pool: 0 })) },
    { rowId: 3, modeloId: 3, slots: Array(31).fill(null).map(() => ({ tpa: 0, pool: 0 })) },
    { rowId: 4, modeloId: 4, slots: Array(31).fill(null).map(() => ({ tpa: 0, pool: 0 })) }
  ]
};

// ── URL del sistema externo (mismo origen que los HTML) ───────────────────────
const LEVELING_API_GET  = '/kanban/leveling/get';
const LEVELING_API_POST = '/kanban/leveling/post';

// ── Namespace del módulo ──────────────────────────────────────────────────────
const Leveling = (() => {

  // Carga los datos de window.KANBAN_LEVELING sobre el estado en memoria de KANBAN.html
  function cargar() {
    const data = window.KANBAN_LEVELING;
    if (!data) return;

    // Actualizar TIME_SLOTS si el servidor envía un horario diferente
    if (Array.isArray(data.horasSlots) && typeof TIME_SLOTS !== 'undefined') {
      TIME_SLOTS.length = 0;
      data.horasSlots.forEach(h => TIME_SLOTS.push(h));
    }

    // Mapear filas del servidor → levelingRows (array global en KANBAN.html)
    if (Array.isArray(data.filas) && typeof levelingRows !== 'undefined') {
      levelingRows = data.filas
        .filter(f => f.modeloId != null)
        .map(f => ({
          rowId:   f.rowId,
          modelId: f.modeloId,
          slots:   (f.slots ?? []).map(s => ({
            tpa:  s.tpa  !== undefined && s.tpa  !== null ? String(s.tpa)  : '',
            pool: s.pool !== undefined && s.pool !== null ? String(s.pool) : ''
          }))
        }));

      if (levelingRows.length > 0) {
        nextRowId = Math.max(...levelingRows.map(r => r.rowId)) + 1;
      }
    }

    _setFooter('footer-shift', data.turno);
  }

  // GET al sistema externo: obtiene el plan de leveling actualizado.
  // Si el servidor no responde, usa window.KANBAN_LEVELING como fallback.
  async function cargarDesdeServidor() {
    try {
      const res = await fetch(LEVELING_API_GET, {
        method:  'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        window.KANBAN_LEVELING = data;
      }
    } catch (e) {
      console.warn('[Leveling] Servidor no disponible, usando datos locales:', e.message);
    }

    cargar();
  }

  // Convierte levelingRows al formato del servidor y lo envía al sistema externo
  function guardar(filas) {
    const payload = _buildPayload(filas);
    return fetch(LEVELING_API_POST, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    }).catch(e => console.warn('[Leveling.guardar]', e.message));
  }

  // Construye el payload para el endpoint POST
  function _buildPayload(filas) {
    const data = window.KANBAN_LEVELING;
    return {
      referencia: data?.referencia ?? '',
      turno:      data?.turno      ?? '',
      horasSlots: data?.horasSlots ?? [],
      filas: filas.map(row => ({
        rowId:    row.rowId,
        modeloId: row.modelId,
        slots:    row.slots.map(s => ({
          tpa:  s.tpa  !== '' ? Number(s.tpa)  : null,
          pool: s.pool !== '' ? Number(s.pool) : null
        }))
      }))
    };
  }

  // Polling GET cada 2 segundos.
  // No re-renderiza si hay una celda en edición, para no borrar lo que el usuario teclea.
  function iniciarPolling() {
    setInterval(async () => {
      await cargarDesdeServidor();
      if (typeof currentModule !== 'undefined' && currentModule === 'leveling') {
        const activo = document.activeElement;
        const editando = activo && activo.classList && activo.classList.contains('cell-input');
        if (!editando) {
          renderLeveling(document.getElementById('main-content'));
        }
      }
    }, 2000);
  }

  function _setFooter(id, val) {
    const el = document.getElementById(id);
    if (el && val) el.textContent = val;
  }

  return { cargar, cargarDesdeServidor, guardar, iniciarPolling };
})();
