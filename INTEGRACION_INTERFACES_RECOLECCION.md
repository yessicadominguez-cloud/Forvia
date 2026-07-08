# Integración Interfaces de Recolección (Lanzador / Rack / Batch Building Box / Leveling Board)

Contrato de comunicación para las 4 interfaces del proceso de recolección tipo mizusumashi
(recolector de material → Lanzador → Formador de Lotes/Batch Building Box), documentado a partir
del diagrama de flujo `Flujo de Aplicación E-Kanban.drawio.pdf`.

- **Transporte:** HTTP, formato **JSON**. Mismo host/puerto que los HTML, rutas relativas.
- **Archivos:** `leveling_board.html`, `lanzador.html`, `tablero_rack.html`, `batch_building_box.html`.
  Cada uno es standalone (no comparten nav); cada uno hace su propio polling con fallback a datos mock.
- Estas rutas son **nuevas**, no colisionan con las de `INTEGRACION_DEVICEWISE.md` (Honda 25SA / Surtidor).

## Conceptos (del PDF)

| Concepto | Significado |
|---|---|
| **Tarjeta PIK** | Contiene la información del producto que se está recolectando. |
| **Lanzador** | Contenedor físico para organizar las tarjetas PIK por prioridad. |
| **Batch Building Box (BBB / Formador de Lotes)** | Tablero para colocar tarjetas PIK y controlar producción; indica cuándo hacer un cambio de modelo. |
| **Leveling Board** | Tabla plan (TPA) vs. real (POOL) por franja de 30 min, todas las líneas de planta; cada fila trae además su estado de alerta y escalación por retraso. |

### Tarjeta PIK — campos comunes

| Campo | Tipo | Ejemplo |
|---|---|---|
| `tarjetaId` | string | `"A7911-205-06-01"` |
| `linea` | string | `"L-20 EM"` |
| `noParte` | string | `"A7911-205-06"` |
| `sebango` | string | Ubicación en el shopstock, ej. `"R3MF1-01"` |
| `cliente` | string | Cliente final que recibe el producto, ej. `"Mitsuba Monterrey"` |
| `clienteInterno` | string | Cliente interno que recibe, ej. `"TPA Mitsuba"` |
| `cantidad` | int | Piezas por caja/tarjeta |
| `tarjetaNum` / `tarjetaTotal` | int | Nº de tarjeta y total de tarjetas del lote (ej. `01` de `14`) |
| `tipo` | string | `"normal"` \| `"produccion"` \| `"cambio_modelo"` (tarjetas marcadoras del Lanzador) |

---

## 1. Leveling Board (planta completa)

Confirmado contra screenshot real del sistema (`Necesidad E-KANBAN.pptx.pdf`, pág. 11): el Leveling Board
es **multi-línea** (todas las líneas de la planta en una sola tabla), con columnas fijas de identificación
por fila y un grid de franjas de 30 min con TPA (plan, editable) y POOL (real, solo lectura) por franja.

### `GET /kanban/leveling-planta/get`
Polling cada 5 s.
```json
{
  "fecha": "Martes 11/03/2025",
  "horasSlots": ["07:00", "07:30", "…", "22:00"],
  "filas": [
    {
      "cliente": "PDP_2244_AF2MITSUB",
      "sapModel": "A7911-205-06",
      "linea": "L20EM",
      "recoleccion": "CONTENEDOR",
      "piezasPorPallet": 80,
      "prioridad": 1,
      "cantidad": 960,
      "pallets": 12.0,
      "horaInicio": "07:00",
      "slots": [ { "tpa": 3, "pool": 3 }, { "tpa": 4, "pool": 3 } ],
      "nivelEscalacion": 1,
      "escaladoA": "Supervisor de línea"
    }
  ]
}
```
Coloreo de celda en UI: verde si `tpa === pool` (a tiempo) · ámbar si difieren (desfase). El nº de
`slots` por fila debe igualar el de `horasSlots`.

`nivelEscalacion` (columna "Alerta", primera de la tabla): `0`/ausente = OK · `1` = escalado a supervisor
· `2` = escalado a gerente (`escaladoA` trae el nombre/rol). Refleja la escalación por retraso que
menciona el diagrama de flujo — es un estado de negocio por línea, no se recalcula solo del desfase
TPA/POOL de una franja puntual.

### `POST /kanban/leveling-planta/post` *(botón "Guardar Plan", edita TPA por franja)*
```json
{ "fecha": "Martes 11/03/2025", "filas": [ /* mismo shape que el GET, con tpa editado */ ], "timestamp": "2026-07-08T09:00:00.000Z" }
```

---

## 2. Lanzador

### `GET /kanban/lanzador/get`
Polling cada 5 s. Cada prioridad es una columna del casillero físico; `cola[0]` es la tarjeta en producción actual.
```json
{
  "linea": "L-20 EM",
  "turno": "1er Turno",
  "slots": [
    {
      "prioridad": 1,
      "cola": [
        { "tarjetaId": "A7911-205-06-01", "noParte": "A7911-205-06", "sebango": "R3MF1-01",
          "cliente": "Mitsuba Monterrey", "clienteInterno": "TPA Mitsuba", "cantidad": 40,
          "tarjetaNum": 1, "tarjetaTotal": 14, "tipo": "produccion" }
      ]
    }
  ]
}
```

### `POST /kanban/lanzador/post` *(descartar tarjeta al producir, o registrar cambio de modelo)*
```json
{ "accion": "descartar_tarjeta", "prioridad": 1, "tarjetaId": "A7911-205-06-01", "timestamp": "2026-07-08T09:00:00.000Z" }
```
`accion`: `"descartar_tarjeta"` | `"cambio_modelo"`.

---

## 3. Tablero de Rack

### `GET /kanban/rack/get`
Polling cada 5 s. `posiciones` sigue una secuencia LIFO igual que el resto de tableros del proyecto (posición más alta = más reciente).
```json
{
  "linea": "L-20 EM",
  "modelos": [
    {
      "modeloId": 1,
      "noParte": "A7911-205-06",
      "posiciones": [
        { "posicion": 1, "estado": "ESPERANDO", "tarjeta": { "tarjetaId": "A7911-205-06-01", "sebango": "R3MF1-01", "idCaja": "CJ-001001", "numSerie": "10010001137", "cantidad": 40, "tarjetaNum": 1, "tarjetaTotal": 14, "hora": "07:08", "lote": 1 } },
        { "posicion": 2, "estado": "LIBRE", "tarjeta": null }
      ]
    }
  ]
}
```
`estado`: `"ESPERANDO"` (caja en rack esperando ser surtida) | `"LIBRE"`.
`tarjeta.idCaja` / `tarjeta.numSerie`: mismos campos que en Batch Building Box — identifican la caja física
y el producto que trae dentro. `tarjeta.hora`: hora en que la caja quedó en espera en el rack.
`tarjeta.lote`: nº de lote al que pertenece.

### `POST /kanban/rack/post` *(botón "Surtir")*
```json
{ "accion": "surtir", "modeloId": 1, "posicion": 1, "timestamp": "2026-07-08T09:00:00.000Z" }
```

---

## 4. Batch Building Box (Formador de Lotes)

### `GET /kanban/batch/get`
Polling cada 5 s. Cada modelo es una columna física; `filas` va de 1 a N (tamaño de lote), `filaCambioModelo` marca dónde ocurre el próximo corte de modelo (equivalente a la flecha en el tablero físico).
```json
{
  "linea": "L-20 EM",
  "modelos": [
    {
      "modeloId": 1,
      "noParte": "A7911-205-06",
      "filaCambioModelo": 7,
      "filas": [
        { "numero": 1, "estado": "RETIRADA", "tarjeta": { "tarjetaId": "A7911-205-06-01", "idCaja": "CJ-001001", "numSerie": "10010001137", "tarjetaNum": 1, "tarjetaTotal": 14, "hora": "07:12", "lote": 1 } },
        { "numero": 2, "estado": "PENDIENTE", "tarjeta": null }
      ]
    }
  ]
}
```
`tarjeta.idCaja`: identificador físico de la caja. `tarjeta.numSerie`: número de serie del producto dentro
de la caja (mismo campo `serial` que trae `kanbanLineCards.csv` en el proyecto Honda 25SA).
`tarjeta.hora`: hora en que la caja salió de línea (se registró el retiro). `tarjeta.lote`: nº de lote al
que pertenece la tarjeta dentro de ese modelo (se incrementa cada vez que se cruza `filaCambioModelo`).
`estado` de cada fila: `"PENDIENTE"` (caja aún no sale de línea) · `"RETIRADA"` (tarjeta colocada, caja fuera de línea) · `"SURTIDA"` (ya se envió a TSA/POOL).

### `POST /kanban/batch/post` *(colocar tarjeta al salir la caja de línea, o marcar surtida)*
```json
{ "accion": "retirar_tarjeta", "modeloId": 1, "numeroFila": 2, "timestamp": "2026-07-08T09:00:00.000Z" }
```
`accion`: `"retirar_tarjeta"` (caja sale de línea, se coloca su tarjeta) | `"marcar_surtida"` (se retira del BBB hacia TSA/POOL).

> Nota: en el proceso físico real, al llegar a `filaCambioModelo` las tarjetas retiradas se re-forman a
> mano en la parte de atrás del Lanzador (ver `Necesidad E-KANBAN.pptx.pdf`, pág. 8). Esa realimentación
> **no** está modelada aquí — el Lanzador se alimenta manualmente, no desde este endpoint.

---

## Resumen de endpoints

| Método | Ruta | Dirección | Disparador |
|---|---|---|---|
| GET  | `/kanban/leveling-planta/get` | servidor → UI | polling 5 s |
| POST | `/kanban/leveling-planta/post` | UI → servidor | botón "Guardar Plan" (edita TPA) |
| GET  | `/kanban/lanzador/get` | servidor → UI | polling 5 s |
| POST | `/kanban/lanzador/post` | UI → servidor | descartar tarjeta / cambio de modelo |
| GET  | `/kanban/rack/get` | servidor → UI | polling 5 s |
| POST | `/kanban/rack/post` | UI → servidor | botón "Surtir" |
| GET  | `/kanban/batch/get` | servidor → UI | polling 5 s |
| POST | `/kanban/batch/post` | UI → servidor | retirar tarjeta / marcar surtida |
