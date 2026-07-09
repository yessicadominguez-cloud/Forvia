# Integración Interfaces de Recolección (Lanzador / Rack / Batch Building Box / Leveling Board)

Contrato de comunicación para las 4 interfaces del proceso de recolección tipo mizusumashi
(recolector de material → Lanzador → Formador de Lotes/Batch Building Box), documentado a partir
del diagrama de flujo `Flujo de Aplicación E-Kanban.drawio.pdf`.

- **Transporte:** HTTP, formato **JSON**. Mismo host/puerto que los HTML, rutas relativas.
- **Archivos:** `leveling_board.html`, `lanzador.html`, `tablero_rack.html`, `batch_building_box.html`.
  Cada uno es standalone (no comparten nav); cada uno hace su propio polling con fallback a datos mock.
- Estas rutas son **nuevas**, no colisionan con las de `INTEGRACION_DEVICEWISE.md` (Honda 25SA / Surtidor).

### `mock_backend.js` — simulación de conexión entre pantallas (solo para el mockup)

Mientras no hay servidor real, `mock_backend.js` usa `localStorage` para que una acción en una
pantalla se refleje en otra dentro del mismo navegador, imitando el flujo real:

- **Lanzador → Rack:** al descartar una tarjeta, se encola una caja nueva que Rack recoge en su
  siguiente polling y muestra como posición `ESPERANDO`.
- **Batch Building Box → Leveling Board:** al retirar una tarjeta (`retirarTarjeta`), se suma 1 a la
  producción del modelo; Leveling Board lo refleja sumándolo al `POOL` de la franja actual.

Esto **no reemplaza** el contrato de endpoints de abajo — cuando exista servidor real, cada
`GET .../get` trae el estado ya consolidado y `mock_backend.js` deja de ser necesario.

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
por fila y un grid de franjas de 30 min con TPA (plan) y POOL (real, solo lectura) por franja. TPA no se
edita celda por celda en la UI — Planeación lo publica como `.csv` y se carga con el botón/dropzone de
`leveling_board.html` (ver más abajo).

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

### `POST /kanban/leveling-planta/post` *(no invocado desde ninguna pantalla actual)*
TPA y POOL son de solo lectura en `leveling_board.html` y en el módulo Leveling de `KANBAN.html` — no hay
botón "Guardar Plan" ni edición en línea. Este endpoint queda documentado por si una futura pantalla de
planeación necesita escribir el TPA vía API; hoy ningún cliente lo llama.
```json
{ "fecha": "Martes 11/03/2025", "filas": [ /* mismo shape que el GET, con tpa actualizado */ ], "timestamp": "2026-07-08T09:00:00.000Z" }
```

### Carga de TPA por CSV (`leveling_board.html`, solo mockup)
Mientras no exista el endpoint anterior, `leveling_board.html` trae un botón/dropzone ("Arrastra o haz
click para cargar TPA") que lee un `.csv` **local** (no se sube a ningún servidor) y actualiza el TPA en
memoria + `localStorage` vía `MockBackend.guardarTablero`. Formato esperado: una fila por `sapModel`, una
columna por franja horaria (mismo texto que las columnas visibles, ej. `07:00`, `07:30`, …):
```csv
SAP Model,07:00,07:30,08:00
A7911-205-06,5,3,0
```
Filas cuyo `SAP Model` no coincide con ninguna fila del tablero se ignoran (se reporta el conteo en el
mensaje de estado). No reemplaza el contrato real — cuando exista `POST /kanban/leveling-planta/post`, el
CSV podría convertirse en el disparador que arma ese payload, pero eso no está implementado.

---

## 2. Lanzador

### `GET /kanban/lanzador/get`
Polling cada 5 s. Cada prioridad es una columna del casillero físico; `cola[0]` es la tarjeta en producción
actual. El Lanzador es **de planta completa**, no de una sola línea: la ruta del mizusumashi organiza
tarjetas de varias líneas en el mismo casillero, por eso `linea` vive en cada tarjeta y no como campo global.
```json
{
  "turno": "1er Turno",
  "slots": [
    {
      "prioridad": 1,
      "cola": [
        { "tarjetaId": "A7911-205-06-01", "noParte": "A7911-205-06", "linea": "L20EM", "sebango": "R3MF1-01",
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
Cada columna (modelo) es de una línea distinta — el Rack es **de planta completa**, por eso `linea` vive en
cada modelo y no como campo global.
```json
{
  "modelos": [
    {
      "modeloId": 1,
      "noParte": "A7911-205-06",
      "linea": "L20EM",
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
Cada columna (modelo) es de una línea distinta — el Batch Building Box es **de planta completa**, por eso
`linea` vive en cada modelo y no como campo global.
```json
{
  "modelos": [
    {
      "modeloId": 1,
      "noParte": "A7911-205-06",
      "linea": "L20EM",
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
| POST | `/kanban/leveling-planta/post` | UI → servidor | *(sin trigger actual — ver nota en sección 1)* |
| GET  | `/kanban/lanzador/get` | servidor → UI | polling 5 s |
| POST | `/kanban/lanzador/post` | UI → servidor | descartar tarjeta / cambio de modelo |
| GET  | `/kanban/rack/get` | servidor → UI | polling 5 s |
| POST | `/kanban/rack/post` | UI → servidor | botón "Surtir" |
| GET  | `/kanban/batch/get` | servidor → UI | polling 5 s |
| POST | `/kanban/batch/post` | UI → servidor | retirar tarjeta / marcar surtida |
