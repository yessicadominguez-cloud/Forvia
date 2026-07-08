// ── Backend simulado compartido entre las 4 interfaces (solo para el mockup) ──
//
// En producción esto lo reemplaza un servidor real (ver INTEGRACION_INTERFACES_RECOLECCION.md).
// Mientras tanto, usa localStorage para que una acción en una pestaña (ej. retirar una
// tarjeta en Batch Building Box) se refleje en las demás (ej. sube el POOL en Leveling Board)
// sin necesitar servidor.

const MockBackend = (() => {
  const KEY = 'KANBAN_MOCK_STATE';

  function _load() {
    try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
  }
  function _save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  // ── Producción (alimenta el POOL del Leveling Board) ───────────────────────
  // Se llama cuando una caja realmente sale de línea (BBB.retirarTarjeta / Rack.surtir).
  function registrarProduccion(noParte, cantidadCajas = 1) {
    const state = _load();
    state.produccion = state.produccion ?? {};
    state.produccion[noParte] = (state.produccion[noParte] ?? 0) + cantidadCajas;
    _save(state);
  }
  function getProduccion(noParte) {
    return _load().produccion?.[noParte] ?? 0;
  }

  // ── Cola de cajas nuevas para el Tablero de Rack ───────────────────────────
  // Lanzador.descartarTarjeta empuja aquí; Rack las toma en su próximo polling.
  function agregarCajaRack(noParte, tarjeta) {
    const state = _load();
    state.rackPendiente = state.rackPendiente ?? {};
    state.rackPendiente[noParte] = state.rackPendiente[noParte] ?? [];
    state.rackPendiente[noParte].push(tarjeta);
    _save(state);
  }
  function tomarCajasRack(noParte) {
    const state = _load();
    const cajas = state.rackPendiente?.[noParte] ?? [];
    if (cajas.length && state.rackPendiente) {
      state.rackPendiente[noParte] = [];
      _save(state);
    }
    return cajas;
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  return { registrarProduccion, getProduccion, agregarCajaRack, tomarCajasRack, reset };
})();
