# HOJAS_INICIALES — Estructura de hojas auxiliares

`inicializarHojas()` crea automáticamente estas 9 hojas en el mismo Google Sheet donde están `PMP_2026` y `Registro_MP-2026`. Es idempotente: si una hoja ya existe, no la toca (salvo que se pase `force: true`).

## `Eventos`
Eventos por equipo (MP ejecutadas, envíos al servicio técnico, recepciones, etc.). No reemplaza la programación PMP — es un historial paralelo.

| Columna | Header | Tipo | Notas |
|---|---|---|---|
| A | id | UUID | clave |
| B | equipoKey | string | `inv:<n>` o `id:<n>` |
| C | tipo | enum | `mp` · `envio` · `solicitud` · `recepcion` · `reparacion` (dropdown) |
| D | fecha | date | ISO `YYYY-MM-DD` |
| E | resultado | enum | Si · Si-RA · C1..C8 · FS · Baja · NU |
| F | estadoEquipo | string | Operativo · No operativo · En servicio técnico |
| G | ejecutor | string | nombre del responsable |
| H | observacion | text | sanitizado (prefijo `'` si empieza con `=+-@`) |
| I | nEnvio | string | n° envío externo |
| J | empresa | string | servicio técnico externo |
| K | folio | string | folio interno |
| L | comentario | text | |
| M | folioGuia | string | guía de despacho |
| N | createdAt | ISO datetime | |

## `Pendientes`

| Columna | Header | Tipo | Notas |
|---|---|---|---|
| A | id | UUID | |
| B | equipoKey | string | vacío si es pendiente suelto |
| C | descripcion | text | sanitizado |
| D | fechaCreacion | date | |
| E | fechaCompromiso | date | |
| F | ejecutor | string | |
| G | prioridad | enum | `alta` · `media` · `baja` (dropdown) |
| H | etiquetas | string | separadas por `|` |
| I | estado | enum | `abierto` · `cerrado` (dropdown) |
| J | tareas | JSON | `[{texto, done}]` serializado |
| K | actualizaciones | JSON | `[{id, fecha, texto}]` serializado |

## `Reprogramaciones`

| Columna | Header | Tipo | Notas |
|---|---|---|---|
| A | id | UUID | |
| B | equipoKey | string | |
| C | mesOrigen | int 1..12 | |
| D | causal | enum | C1..C8 (dropdown) |
| E | mesDestino | int 1..12 | vacío si C2/C3/C4 |
| F | fechaRegistro | ISO datetime | |
| G | comentario | text | |

## `ResultadosOverride`
Resultados que **el usuario** marca desde la app sin tocar la hoja `Registro_MP-2026`. Cuando los KPIs y la ficha consultan un mes, el override prevalece sobre el valor del Registro.

| Columna | Header | Tipo | Notas |
|---|---|---|---|
| A | equipoKey | string | clave |
| B | mes | int 1..12 | |
| C | resultado | enum | Si · Si-RA · C1..C8 · FS · Baja · NU (dropdown) |
| D | fechaRegistro | ISO datetime | |
| E | usuario | email | sesión GAS |

## `Asignaciones`

| Columna | Header | Tipo | Notas |
|---|---|---|---|
| A | equipoKey | string | |
| B | mes | int 1..12 | |
| C | ejecutor | string | uno de los 11 oficiales |
| D | fechaAsignacion | ISO datetime | |

## `Snapshot`
Foto del estado del Registro/PMP en un momento dado. Cada toma agrega filas con un mismo `timestamp`. Se conservan los últimos 5 snapshots.

| Columna | Header | Tipo | Notas |
|---|---|---|---|
| A | timestamp | ISO datetime | identifica el snapshot |
| B | equipoKey | string | |
| C | mes | int 1..12 | |
| D | tipo | enum | `P` (programación) o `R` (resultado) |
| E | valor | string | el código (X/R/RA/PM/Si/etc.) |

## `Inconsistencias`

| Columna | Header | Tipo | Notas |
|---|---|---|---|
| A | id | UUID | |
| B | fechaDeteccion | ISO datetime | |
| C | equipoKey | string | |
| D | tipo | enum | `si_desaparecida` · `si_a_causal` · `causal_cambiada` · `override_no_reflejado` · `equipo_desaparecido` · `equipo_nuevo` · `cambio_catastro` · `baja_nueva` |
| E | mes | int 0..12 | 0 = aplica al año |
| F | valorAntes | string | |
| G | valorDespues | string | |
| H | estado | enum | `nueva` · `revisada` · `descartada` · `convertida_pendiente` |
| I | comentario | text | |
| J | pendienteVinculadoId | UUID | si fue convertida |

## `Config`
Pares key/value editables desde la UI o directamente en la hoja.

| key | value inicial | descripción |
|---|---|---|
| SPREADSHEET_ID | auto | poblado por `inicializarHojas` |
| WEB_APP_URL | vacío | pegado tras desplegar |
| EJECUTORES | 11 oficiales separados por `|` | edición masiva |
| FAMILIAS_EXTRA | vacío | mapeo palabra=Familia separado por `|` |
| ANIO_OPERATIVO | 2026 | |
| TZ | America/Santiago | |
| DEBUG | false | |
| EMAIL_NOTIFICACIONES | vacío | destino de recordatorios |
| NOTIFICAR_INICIO_MES | false | trigger mensual |
| MODO_OFFLINE_FORZADO | false | sólo cliente |
| SCHEMA_VERSION | 1.0.0 | migraciones automáticas |

## `AuditLog`
Toda escritura realizada por la app queda registrada acá. Se purga automáticamente a 90 días.

| Columna | Header | Tipo |
|---|---|---|
| A | timestamp | ISO datetime |
| B | usuario | email |
| C | accion | `crear` · `editar` · `eliminar` · `marcar_revisada` · `convertir_pendiente` · `aplicar_plantilla` · `tomar_snapshot` · `importar_respaldo` · `inicializar_hojas` |
| D | entidad | `pendiente` · `evento` · `reprogramacion` · `override` · `asignacion` · `inconsistencia` · `config` · `snapshot` · `plantilla` |
| E | entidadId | string |
| F | detalle | JSON serializado |
