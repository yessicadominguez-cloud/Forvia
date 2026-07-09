# Integración Kanban Digital ↔ DeviceWISE

Contrato de comunicación entre la interfaz web (Honda 25SA) y DeviceWISE.

- **Transporte:** HTTP, formato **JSON** en ambos sentidos.
- **Origen:** la API se sirve en el **mismo host/puerto** que los HTML, por lo que todas las rutas son **relativas** (`/kanban/...`). No hay CORS.
- **Interfaz principal:** `KANBAN.html`. (`Kanban_leveling.html` es un prototipo viejo, no usa estos endpoints — conviene retirarlo.)
- **Lectura (DW → UI):** la UI hace *polling* con `GET` y refresca sola.
- **Escritura (UI → DW):** la UI manda `POST` con el cuerpo JSON indicado.

## Identidad de modelos

`models[]` en la UI se fusiona de **tres fuentes**, por lo que el campo **`id` de cada modelo debe ser el mismo** en los tres endpoints o no empatan:

| Fuente | Aporta |
|---|---|
| `GET /kanban/admin/get`  | Qué modelos existen + config (`umbral`, `estandar`, `pps`). Crea/borra modelos. |
| `GET /kanban/status/get` | Estado operativo (`ocupadas`, `tarjetas`). |
| `GET /kanban/leveling/get` | Plan por franja horaria; solo **referencia** modelos por `modeloId`. |

---

## 1. Admin — configuración de modelos

### `GET /kanban/admin/get`  *(fuente de verdad de la lista de modelos)*
Polling cada 5 s. Respuesta:
```json
{
  "linea": "Honda 25SA",
  "modelos": [
    { "id": 1, "nombre": "25SA Type-A", "umbral": 4, "estandar": 12, "pps": 80, "activo": true }
  ]
}
```
| Campo | Tipo | Significado en UI |
|---|---|---|
| `id` | int | Clave del modelo (igual en los 3 endpoints) |
| `nombre` | string | Nombre mostrado |
| `umbral` | int | Umbral crítico (`limit`). Debe ser `< estandar` |
| `estandar` | int | Batch estándar / máximo de tarjetas (`max`) |
| `pps` | int | Piezas por pallet |
| `activo` | bool | Si es `false`, la UI **elimina** el modelo de la vista |

> `quantity` (cantidad de la tabla leveling) la calcula la UI como `pps * estandar`.

### `POST /kanban/admin/post`  *(alta o edición de un modelo)*
```json
{
  "timestamp": "2026-06-16T14:00:00.000Z",
  "linea": "Honda 25SA",
  "modelo": { "id": 1, "nombre": "25SA Type-A", "umbral": 4, "estandar": 12, "pps": 80, "activo": true }
}
```
- **Edición:** `modelo.id` presente → DW actualiza ese registro.
- **Alta:** `modelo` llega **sin `id`** → DW asigna el id nuevo. La UI lo recupera en el siguiente `GET /kanban/admin/get`.

---

## 2. Status — línea y surtidor

### `GET /kanban/status/get`
Polling cada 5 s. Alimenta el monitor de Línea y la tabla de Surtidor. Respuesta:
```json
{
  "linea": "Honda 25SA",
  "modelos": [
    {
      "id": 1,
      "nombre": "25SA Type-A",
      "ocupadas": 3,
      "tarjetas": [
        { "numero": 1, "serial": "H25A-5001", "status": "IN-PROCESS" },
        { "numero": 2, "serial": "H25A-5002", "status": "IN-PROCESS" },
        { "numero": 3, "serial": "H25A-5003", "status": "IN-PROCESS" }
      ]
    }
  ]
}
```
| Campo | Tipo | Significado en UI |
|---|---|---|
| `id` | int | Debe coincidir con el `id` de Admin |
| `ocupadas` | int | Tarjetas ocupadas (`occupied`) |
| `tarjetas[].numero` | int | Posición en la secuencia LIFO (1 … `estandar`) |
| `tarjetas[].serial` | string | Serial mostrado en la tarjeta |
| `tarjetas[].status` | string | Texto de estado (ej. `IN-PROCESS`) |

> Semáforo (calculado por la UI): `ocupadas == max` → **ÓPTIMO**; `ocupadas <= umbral` → **CRÍTICO**; intermedio → **RE-ORDEN**.

### `POST /kanban/line/post`  *(botón "Surtir Producto")*
```json
{ "timestamp": "2026-06-16T14:00:00.000Z", "modeloId": 1, "nombre": "25SA Type-A", "cantidad": 5 }
```

### `POST /kanban/modelos`  *(opcional — la UI puede empujar el estado completo)*
```json
{
  "linea": "Honda 25SA",
  "modelos": [
    { "id": 1, "nombre": "25SA Type-A", "ocupadas": 3, "tarjetas": [ /* … */ ], "statusLogistico": "RE-ORDEN" }
  ]
}
```

### `POST /kanban/movimiento`  *(opcional — alta/baja de una tarjeta)*
```json
{ "modeloId": 1, "serial": "H25A-5004", "accion": "agregar", "timestamp": "2026-06-16T14:00:00.000Z" }
```
`accion`: `"agregar"` | `"retirar"`.

> Estos dos últimos endpoints están implementados en el front pero aún **sin botón** que los dispare. Documentados para cuando se necesiten.

---

## 3. Leveling Board — plan por franja horaria

### `GET /kanban/leveling/get`
Polling cada 2 s. Respuesta:
```json
{
  "referencia": "FAU-F-PSG-4640",
  "planta": "Querétaro QRO-1",
  "turno": "1er Turno",
  "horasSlots": ["07:00","07:30","08:00", "…", "22:00"],
  "filas": [
    { "rowId": 1, "modeloId": 1, "slots": [ { "tpa": 0, "pool": 0 }, { "tpa": 0, "pool": 0 } ] }
  ]
}
```
| Campo | Tipo | Significado en UI |
|---|---|---|
| `horasSlots` | string[] | Columnas de tiempo. Define cuántos `slots` lleva cada fila |
| `filas[].rowId` | int | Id de la fila del tablero |
| `filas[].modeloId` | int | Modelo de esa fila (debe existir en Admin) |
| `slots[].tpa` | int/null | Plan. Solo lectura en la UI actual (número estático) |
| `slots[].pool` | int/null | Real (solo lectura en UI). `null` = celda vacía |

> El nº de elementos de `slots` debe ser igual al de `horasSlots`.
> TPA y POOL son ambos de solo lectura en `KANBAN.html`; no hay edición en línea ni botón "Guardar Plan".

### `POST /kanban/leveling/post`  *(sin trigger actual — sin botón "Guardar Plan" en la UI)*
```json
{
  "referencia": "FAU-F-PSG-4640",
  "turno": "1er Turno",
  "horasSlots": ["07:00", "…", "22:00"],
  "filas": [
    { "rowId": 1, "modeloId": 1, "slots": [ { "tpa": 1, "pool": null }, { "tpa": 2, "pool": null } ] }
  ]
}
```
> En el POST, `tpa`/`pool` vacíos viajan como `null`.

---

## Resumen de endpoints

| Método | Ruta | Dirección | Disparador |
|---|---|---|---|
| GET  | `/kanban/admin/get`     | DW → UI | polling 5 s |
| POST | `/kanban/admin/post`    | UI → DW | guardar/alta modelo (Admin) |
| GET  | `/kanban/status/get`    | DW → UI | polling 5 s |
| POST | `/kanban/line/post`     | UI → DW | botón "Surtir Producto" |
| POST | `/kanban/modelos`       | UI → DW | (opcional, sin botón) |
| POST | `/kanban/movimiento`    | UI → DW | (opcional, sin botón) |
| GET  | `/kanban/leveling/get`  | DW → UI | polling 2 s |
| POST | `/kanban/leveling/post` | UI → DW | *(sin trigger actual — ver nota en sección 3)* |
