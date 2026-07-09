// ── Backend simulado compartido entre las 4 interfaces (solo para el mockup) ──
//
// En producción esto lo reemplaza un servidor real (ver INTEGRACION_INTERFACES_RECOLECCION.md).
// Mientras tanto, usa localStorage para que una acción en una pestaña (ej. retirar una
// tarjeta en Batch Building Box) se refleje en las demás (ej. sube el POOL en Leveling Board)
// sin necesitar servidor.

const MockBackend = (() => {
  const KEY = 'KANBAN_MOCK_STATE';

  // Fecha local en formato YYYY-MM-DD, para detectar cuándo cambia el día.
  function _hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function _load() {
    let state;
    try { state = JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { state = {}; }
    // El mockup no tiene servidor que resetee el turno/día — sin esto, producción,
    // cola del rack y tableros guardados de un día anterior seguirían sumando hoy.
    if (state._fecha !== _hoy()) {
      state = { _fecha: _hoy() };
      _save(state);
    }
    return state;
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

  // ── Estado propio de cada tablero (Lanzador/Rack/Batch) ─────────────────────
  // Cada pantalla es un <a href> distinto (recarga completa), así que las mutaciones
  // en memoria (window.KANBAN_*) se pierden al navegar y volver. Se guardan aquí para
  // que el tablero recupere su último estado en vez de reiniciar al fallback fijo.
  function guardarTablero(nombre, data) {
    const state = _load();
    state.tableros = state.tableros ?? {};
    state.tableros[nombre] = data;
    _save(state);
  }
  function leerTablero(nombre) {
    return _load().tableros?.[nombre] ?? null;
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  return { registrarProduccion, getProduccion, agregarCajaRack, tomarCajasRack, guardarTablero, leerTablero, reset };
})();
