// ── Datos de configuración por defecto (fallback cuando el servidor no responde)
window.KANBAN_ADMIN = {
  linea: "Honda 25SA",
  modelos: [
    { id: 1, nombre: "25SA Type-A", umbral: 4,  estandar: 12, pps: 80,  activo: true },
    { id: 2, nombre: "25SA Type-B", umbral: 3,  estandar: 10, pps: 64,  activo: true },
    { id: 3, nombre: "25SA Sport",  umbral: 4,  estandar: 12, pps: 48,  activo: true },
    { id: 4, nombre: "25SA EV",     umbral: 4,  estandar: 12, pps: 100, activo: true }
  ]
};

// ── URL base del sistema externo (mismo origen que los HTML) ──────────────────
const ADMIN_API_GET  = '/kanban/admin/get';
const ADMIN_API_POST = '/kanban/admin/post';

// ── Namespace del módulo ──────────────────────────────────────────────────────
const Admin = (() => {

  // ── Lectura desde el servidor (GET) ────────────────────────────────────────

  // Solicita la configuración actualizada al sistema externo.
  // Si el servidor no responde, usa los datos en window.KANBAN_ADMIN como fallback.
  // Llamar en window.onload y en cada ciclo de polling.
  async function cargarDesdeServidor() {
    try {
      const res = await fetch(ADMIN_API_GET, {
        method:  'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Sobreescribir datos locales con la respuesta del servidor
      if (Array.isArray(data?.modelos)) {
        window.KANBAN_ADMIN.modelos = data.modelos;
        if (data.linea) window.KANBAN_ADMIN.linea = data.linea;
      }
    } catch (e) {
      console.warn('[Admin] Servidor no disponible, usando datos locales:', e.message);
    }

    // Sincronizar al array global models[] (en memoria de KANBAN.html)
    _sincronizarModels();
  }

  // ── Sincronización en memoria ───────────────────────────────────────────────

  // Aplica los datos de window.KANBAN_ADMIN → models[] sin reemplazar el array
  function cargar() {
    _sincronizarModels();
  }

  function _sincronizarModels() {
    const data = window.KANBAN_ADMIN;
    if (!data?.modelos || typeof models === 'undefined') return;

    const activos = data.modelos.filter(cfg => cfg.activo !== false);

    // Actualizar existentes o agregar nuevos
    activos.forEach(cfg => {
      const m = models.find(x => x.id === cfg.id);
      if (m) {
        m.name     = cfg.nombre;
        m.limit    = cfg.umbral;
        m.max      = cfg.estandar;
        m.pps      = cfg.pps;
        m.quantity = cfg.pps * cfg.estandar;
      } else {
        const prefix = 'H25' + cfg.nombre.replace(/\s+/g, '').replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase();
        models.push({
          id: cfg.id, name: cfg.nombre, customer: 'HONDA', line: 'Honda 25SA',
          collect: 'PALLET', pps: cfg.pps, priority: 1, quantity: cfg.pps * cfg.estandar,
          prefix, occupied: 0, max: cfg.estandar, limit: cfg.umbral
        });
      }
    });

    // Eliminar modelos que el servidor ya no envía
    const idsActivos = activos.map(cfg => cfg.id);
    for (let i = models.length - 1; i >= 0; i--) {
      if (!idsActivos.includes(models[i].id)) models.splice(i, 1);
    }
  }

  // ── Escritura al servidor (POST) ────────────────────────────────────────────

  // Actualiza un modelo en memoria y persiste al sistema externo.
  // Retorna Promise para que saveAdminModel() pueda encadenar enviarConfig().
  async function guardarConfigModelo(modeloId, params) {
    // 1. Actualizar en window.KANBAN_ADMIN
    const cfg = (window.KANBAN_ADMIN?.modelos ?? []).find(m => m.id === modeloId);
    if (cfg) {
      if (params.nombre   !== undefined) cfg.nombre   = params.nombre;
      if (params.umbral   !== undefined) cfg.umbral   = params.umbral;
      if (params.estandar !== undefined) cfg.estandar = params.estandar;
      if (params.pps      !== undefined) cfg.pps      = params.pps;
    } else {
      // Modelo nuevo: agregarlo al registro local
      window.KANBAN_ADMIN.modelos.push({
        id:       modeloId,
        nombre:   params.nombre   ?? '',
        umbral:   params.umbral   ?? 4,
        estandar: params.estandar ?? 12,
        pps:      params.pps      ?? 0,
        activo:   true
      });
    }

    // 2. Reflejar en models[]
    _sincronizarModels();
  }

  // Envía solo el modelo indicado al sistema externo (para ediciones).
  // Lee desde models[] que es la fuente de verdad del UI.
  async function enviarConfig(modeloId) {
    const m = (typeof models !== 'undefined' ? models : []).find(x => x.id === modeloId);
    if (!m) return;
    const cfgAdmin = (window.KANBAN_ADMIN?.modelos ?? []).find(x => x.id === modeloId);

    const payload = {
      timestamp: new Date().toISOString(),
      linea:     window.KANBAN_ADMIN?.linea ?? 'Honda 25SA',
      modelo: {
        id:       m.id,
        nombre:   m.name,
        umbral:   m.limit,
        estandar: m.max,
        pps:      m.pps,
        activo:   cfgAdmin?.activo ?? true
      }
    };

    try {
      const res = await fetch(ADMIN_API_POST, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn('[Admin.enviarConfig]', e.message);
    }
  }

  // Envía un modelo nuevo al servidor sin asignar ID local.
  // El servidor asigna el ID; el GET del polling lo sincroniza de vuelta.
  async function enviarNuevoModelo(params) {
    const payload = {
      timestamp: new Date().toISOString(),
      linea:     window.KANBAN_ADMIN?.linea ?? 'Honda 25SA',
      modelo: {
        nombre:   params.nombre,
        umbral:   params.umbral,
        estandar: params.estandar,
        pps:      params.pps,
        activo:   true
      }
    };

    try {
      const res = await fetch(ADMIN_API_POST, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn('[Admin.enviarNuevoModelo]', e.message);
    }
  }

  // Activa o desactiva un modelo y notifica al sistema externo
  function toggleModeloActivo(modeloId, activo) {
    const cfg = (window.KANBAN_ADMIN?.modelos ?? []).find(m => m.id === modeloId);
    if (!cfg) return;
    cfg.activo = activo;
    guardarConfigModelo(modeloId, { activo }).then(() => enviarConfig(modeloId));
  }

  // ── Polling con GET ─────────────────────────────────────────────────────────

  // Refresca la configuración desde el sistema externo cada 5 segundos.
  // Usa fetch GET en lugar de inyección de script, ya que la fuente de verdad es la BD SQL.
  function iniciarPolling() {
    setInterval(async () => {
      await cargarDesdeServidor();
      if (typeof currentModule !== 'undefined' && currentModule === 'admin') {
        render();
      }
    }, 5000);
  }

  return {
    cargar,
    cargarDesdeServidor,
    guardarConfigModelo,
    enviarConfig,
    enviarNuevoModelo,
    toggleModeloActivo,
    iniciarPolling
  };
})();
