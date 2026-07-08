// ── Datos de fallback (usados cuando el servidor no responde) ─────────────────
window.KANBAN_LINEA_SURTIDOR = {
  linea:  "Honda 25SA",
  modelos: [
    {
      id:       1,
      nombre:   "25SA Type-A",
      ocupadas: 3,
      tarjetas: [
        { numero: 1, serial: "H25A-5001", status: "IN-PROCESS" },
        { numero: 2, serial: "H25A-5002", status: "IN-PROCESS" },
        { numero: 3, serial: "H25A-5003", status: "IN-PROCESS" }
      ]
    },
    {
      id:       2,
      nombre:   "25SA Type-B",
      ocupadas: 2,
      tarjetas: [
        { numero: 1, serial: "H25B-5001", status: "IN-PROCESS" },
        { numero: 2, serial: "H25B-5002", status: "IN-PROCESS" }
      ]
    },
    {
      id:       3,
      nombre:   "25SA Sport",
      ocupadas: 0,
      tarjetas: []
    },
    {
      id:       4,
      nombre:   "25SA EV",
      ocupadas: 5,
      tarjetas: [
        { numero: 1, serial: "H25E-5001", status: "IN-PROCESS" },
        { numero: 2, serial: "H25E-5002", status: "IN-PROCESS" },
        { numero: 3, serial: "H25E-5003", status: "IN-PROCESS" },
        { numero: 4, serial: "H25E-5004", status: "IN-PROCESS" },
        { numero: 5, serial: "H25E-5005", status: "IN-PROCESS" }
      ]
    }
  ]
};

// ── URL del sistema externo (mismo origen que los HTML) ───────────────────────
const LINEA_SURTIDOR_API_GET = '/kanban/status/get';

// ── Namespace del módulo ──────────────────────────────────────────────────────
const LineasSurtidor = (() => {

  // Sincroniza window.KANBAN_LINEA_SURTIDOR → models[].
  // Solo actualiza campos operacionales para no sobreescribir la config de Admin.
  function cargar() {
    const data = window.KANBAN_LINEA_SURTIDOR;
    if (!data?.modelos || typeof models === 'undefined') return;

    data.modelos.forEach(src => {
      const m = models.find(x => x.id === src.id);
      if (m) {
        m.occupied = src.ocupadas;
        m.tarjetas = src.tarjetas ?? [];
      } else {
        models.push({
          id:       src.id,
          name:     src.nombre,
          customer: 'HONDA',
          line:     data.linea ?? 'Honda 25SA',
          collect:  'PALLET',
          pps:      0,
          priority: 1,
          quantity: 0,
          prefix:   '',
          occupied: src.ocupadas,
          max:      0,
          limit:    0,
          tarjetas: src.tarjetas ?? []
        });
      }
    });

    if (data.linea) _setFooter('footer-line', data.linea);
  }

  // GET al sistema externo: obtiene el status actualizado de todos los modelos.
  async function cargarDesdeServidor() {
    try {
      const res = await fetch(LINEA_SURTIDOR_API_GET, {
        method:  'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data?.modelos)) {
        window.KANBAN_LINEA_SURTIDOR.modelos = data.modelos;
        if (data.linea) window.KANBAN_LINEA_SURTIDOR.linea = data.linea;
      }
    } catch (e) {
      console.warn('[LineasSurtidor] Servidor no disponible, usando datos locales:', e.message);
    }

    cargar();
  }

  // Polling GET cada 5 segundos
  function iniciarPolling() {
    setInterval(async () => {
      await cargarDesdeServidor();
      if (typeof currentModule !== 'undefined' &&
          (currentModule === 'line' || currentModule === 'supplier')) {
        render();
      }
    }, 5000);
  }

  // Envía el estado de todos los modelos al sistema externo
  function enviarStatus() {
    const data = window.KANBAN_LINEA_SURTIDOR;
    const modelos = (typeof models !== 'undefined' ? models : []).map(m => ({
      id:              m.id,
      nombre:          m.name,
      ocupadas:        m.occupied,
      tarjetas:        m.tarjetas ?? [],
      statusLogistico: _calcStatus(m)
    }));

    return fetch('/kanban/modelos', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        linea:   data?.linea ?? 'Honda 25SA',
        modelos
      })
    }).catch(e => console.warn('[LineasSurtidor.enviarStatus]', e.message));
  }

  // Envía el movimiento de una tarjeta kanban al sistema externo
  function enviarMovimientoTarjeta(modeloId, serial, accion) {
    return fetch('/kanban/movimiento', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        modeloId,
        serial,
        accion,     // "agregar" | "retirar"
        timestamp: new Date().toISOString()
      })
    }).catch(e => console.warn('[LineasSurtidor.enviarMovimientoTarjeta]', e.message));
  }

  function _calcStatus(m) {
    if (m.occupied === m.max)  return 'OPTIMO';
    if (m.occupied <= m.limit) return 'CRITICO';
    return 'RE-ORDEN';
  }

  function _setFooter(id, val) {
    const el = document.getElementById(id);
    if (el && val) el.textContent = val;
  }

  return { cargar, cargarDesdeServidor, enviarStatus, enviarMovimientoTarjeta, iniciarPolling };
})();
