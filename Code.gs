/****************************************************************************
 * Gestión MP 2026 — Apps Script backend (Code.gs)
 * Hospital Hernán Henríquez Aravena · Encargado: Cristian Beltrán
 *
 * Único endpoint: doPost(e). Router por { action, payload, token, sheetId }.
 * Frontend: gestion_mp_2026.html (standalone, fetch directo).
 *
 * Despliegue:
 *   1. Pega tu API_TOKEN en TOKEN.
 *   2. (Opcional) Pega tu SPREADSHEET_ID en SHEET_ID; o déjalo '' y el
 *      cliente lo envía en cada request.
 *   3. Implementar → Aplicación Web → Ejecutar como: yo · Acceso: cualquiera.
 *   4. Copia la URL → pégala en la app (Configuración → WEB_APP_URL).
 *   5. Desde el editor de Apps Script, ejecuta una vez setupTriggers()
 *      si quieres triggers diarios/mensuales.
 ***************************************************************************/

const TOKEN = 'PEGA_TU_TOKEN_AQUI';
const SHEET_ID = '';
const TZ = 'America/Santiago';
const SCHEMA_VERSION = '1.0.0';
const CACHE_TTL_SEC = 300;

const SHEETS = {
  PMP: 'PMP_2026',
  REG: 'Registro_MP-2026',
  EVENTOS: 'Eventos',
  PENDIENTES: 'Pendientes',
  REPROGS: 'Reprogramaciones',
  OVERRIDE: 'ResultadosOverride',
  ASIGN: 'Asignaciones',
  SNAPSHOT: 'Snapshot',
  INCONS: 'Inconsistencias',
  CONFIG: 'Config',
  AUDIT: 'AuditLog'
};

const EJECUTORES_DEFAULT = [
  'Carlos Bahamondes Seguel',
  'Cristián Beltrán Oviedo',
  'Cristina Rozas Urrutia',
  'Daniel Díaz Neira',
  'Ignacio Berner Bergara',
  'Macarena Toledo',
  'Marco Ulloa',
  'Matías Soazo Garrido',
  'Personal externo',
  'Ricardo Matus Aroca',
  'Tito Millapán Riquelme'
];

const CODIGOS_PMP = ['X', 'R', 'RA', 'PM'];
const CODIGOS_REG = ['Si', 'Si-RA', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'FS', 'Baja', 'NU'];
const PRIORIDADES = ['alta', 'media', 'baja'];
const ESTADOS_PEND = ['abierto', 'cerrado'];
const TIPOS_EVENTO = ['mp', 'envio', 'solicitud', 'recepcion', 'reparacion'];
const TIPOS_INCONS = ['si_desaparecida', 'si_a_causal', 'causal_cambiada', 'override_no_reflejado', 'equipo_desaparecido', 'equipo_nuevo', 'cambio_catastro', 'baja_nueva'];

/* =====================================================================
 * Entry point
 * ===================================================================== */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }
    const fn = ACTIONS[body.action];
    if (!fn) return jsonResponse({ ok: false, error: 'unknown_action:' + body.action });
    const payload = body.payload || {};
    if (body.sheetId) payload.__sheetId = body.sheetId;
    const result = fn(payload);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  return jsonResponse({ ok: true, msg: 'Gestión MP 2026 API. Usa POST.', ts: Date.now() });
}

const ACTIONS = {
  health: (p) => ({ ok: true, ts: Date.now(), schema: SCHEMA_VERSION, sheetOk: testSheet_(p) }),
  inicializarHojas: (p) => withLock(() => inicializarHojas_(p)),
  cargarMaestro: (p) => withLock(() => cargarMaestro_(p)),
  toggleHojasSistema: (p) => withLock(() => toggleHojasSistema_(p)),
  getConfig: (p) => getConfig_(p),
  setConfig: (p) => withLock(() => setConfig_(p)),
  getEquipos: (p) => getEquipos_(p),
  getKPIs: (p) => getKPIs_(p),
  buscarEquipos: (p) => buscarEquipos_(p),
  getPendientes: (p) => getPendientes_(p),
  savePendiente: (p) => withLock(() => savePendiente_(p)),
  togglePendiente: (p) => withLock(() => togglePendiente_(p)),
  deletePendiente: (p) => withLock(() => deletePendiente_(p)),
  getEventos: (p) => getEventos_(p),
  saveEvento: (p) => withLock(() => saveEvento_(p)),
  deleteEvento: (p) => withLock(() => deleteEvento_(p)),
  getReprogs: (p) => getReprogs_(p),
  saveReprogramacion: (p) => withLock(() => saveReprogramacion_(p)),
  deleteReprogramacion: (p) => withLock(() => deleteReprogramacion_(p)),
  getOverrides: (p) => getOverrides_(p),
  saveResultadoOverride: (p) => withLock(() => saveResultadoOverride_(p)),
  deleteResultadoOverride: (p) => withLock(() => deleteResultadoOverride_(p)),
  getAsignaciones: (p) => getAsignaciones_(p),
  saveAsignacion: (p) => withLock(() => saveAsignacion_(p)),
  generarPlantillaMensual: (p) => withLock(() => generarPlantillaMensual_(p)),
  aplicarPlantillaCargada: (p) => withLock(() => aplicarPlantillaCargada_(p)),
  tomarSnapshot: (p) => withLock(() => tomarSnapshot_(p)),
  listarSnapshots: (p) => listarSnapshots_(p),
  compararSnapshot: (p) => compararSnapshot_(p),
  getInconsistencias: (p) => getInconsistencias_(p),
  marcarInconsistencia: (p) => withLock(() => marcarInconsistencia_(p)),
  convertirInconsistenciaEnPendiente: (p) => withLock(() => convertirInconsistenciaEnPendiente_(p)),
  getVerificacionCarga: (p) => getVerificacionCarga_(p),
  exportarRespaldo: (p) => exportarRespaldo_(p),
  importarRespaldo: (p) => withLock(() => importarRespaldo_(p)),
  getAuditLog: (p) => getAuditLog_(p),
  aplicarMutacionesEnLote: (p) => withLock(() => aplicarMutacionesEnLote_(p)),
  notificarInicioMes: (p) => notificarInicioMes_(),
  backupDiario: (p) => backupDiario_(),
  purgarAuditLog: (p) => withLock(() => purgarAuditLog_()),
  resetHojasAuxiliares: (p) => withLock(() => inicializarHojas_({ ...p, force: true }))
};

/* =====================================================================
 * Helpers
 * ===================================================================== */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(10000);
    if (!locked) return { ok: false, error: 'lock_timeout' };
    return fn();
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    if (locked) try { lock.releaseLock(); } catch (e) {}
  }
}

function ss_(payload) {
  const id = (payload && payload.__sheetId) || SHEET_ID;
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(payload, name) {
  const s = ss_(payload).getSheetByName(name);
  if (!s) throw new Error('sheet_not_found:' + name);
  return s;
}

function sheetOrNull_(payload, name) {
  return ss_(payload).getSheetByName(name);
}

function testSheet_(payload) {
  try {
    const s = ss_(payload);
    return !!s;
  } catch (e) { return false; }
}

function sanitizeForCell_(v) {
  if (v == null) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v;
  const s = String(v);
  if (s.length && '=+-@'.indexOf(s.charAt(0)) >= 0) return "'" + s;
  return s;
}

function escapeForLog_(v) {
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

function nowIso_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function uid_() {
  return Utilities.getUuid();
}

function getUser_() {
  try { return Session.getActiveUser().getEmail() || 'anonimo'; }
  catch (e) { return 'anonimo'; }
}

function invalidateCache_() {
  try { CacheService.getScriptCache().removeAll(['equipos_v1', 'kpis_v1']); } catch (e) {}
}

function audit_(payload, accion, entidad, entidadId, detalle) {
  try {
    const s = sheetOrNull_(payload, SHEETS.AUDIT);
    if (!s) return;
    s.appendRow([nowIso_(), getUser_(), accion, entidad, entidadId || '', escapeForLog_(detalle || {})]);
  } catch (e) {}
}

function equipoKeyOf_(inv, id) {
  inv = (inv == null ? '' : String(inv)).trim();
  if (inv && inv.toUpperCase() !== 'N/A') return 'inv:' + inv;
  return 'id:' + String(id || '').trim();
}

function familiaDe_(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.indexOf('monitor') >= 0) return 'Monitores';
  if (n.indexOf('ventilador') >= 0) return 'Ventiladores';
  if (n.indexOf('desfibrilador') >= 0 || n.indexOf('dea') >= 0) return 'Desfibriladores';
  if (n.indexOf('anestesia') >= 0) return 'M. Anestesia';
  if (n.indexOf('incubadora') >= 0) return 'Incubadoras';
  if (n.indexOf('diálisis') >= 0 || n.indexOf('dialisis') >= 0) return 'M. Diálisis';
  return 'Otros';
}

/* =====================================================================
 * inicializarHojas / schema
 * ===================================================================== */
function inicializarHojas_(payload) {
  const ss = ss_(payload);
  const force = payload && payload.force === true;

  const defs = [
    { name: SHEETS.EVENTOS, headers: ['id','equipoKey','tipo','fecha','resultado','estadoEquipo','ejecutor','observacion','nEnvio','empresa','folio','comentario','folioGuia','createdAt'],
      validations: { 'C': TIPOS_EVENTO } },
    { name: SHEETS.PENDIENTES, headers: ['id','equipoKey','descripcion','fechaCreacion','fechaCompromiso','ejecutor','prioridad','etiquetas','estado','tareas','actualizaciones'],
      validations: { 'G': PRIORIDADES, 'I': ESTADOS_PEND } },
    { name: SHEETS.REPROGS, headers: ['id','equipoKey','mesOrigen','causal','mesDestino','fechaRegistro','comentario'],
      validations: { 'D': ['C1','C2','C3','C4','C5','C6','C7','C8'] } },
    { name: SHEETS.OVERRIDE, headers: ['equipoKey','mes','resultado','fechaRegistro','usuario'],
      validations: { 'C': CODIGOS_REG } },
    { name: SHEETS.ASIGN, headers: ['equipoKey','mes','ejecutor','fechaAsignacion'],
      validations: {} },
    { name: SHEETS.SNAPSHOT, headers: ['timestamp','equipoKey','mes','tipo','valor'] },
    { name: SHEETS.INCONS, headers: ['id','fechaDeteccion','equipoKey','tipo','mes','valorAntes','valorDespues','estado','comentario','pendienteVinculadoId'],
      validations: { 'D': TIPOS_INCONS, 'H': ['nueva','revisada','descartada','convertida_pendiente'] } },
    { name: SHEETS.CONFIG, headers: ['key','value','descripcion'] },
    { name: SHEETS.AUDIT, headers: ['timestamp','usuario','accion','entidad','entidadId','detalle'] }
  ];

  const created = [];
  defs.forEach((def) => {
    let s = ss.getSheetByName(def.name);
    if (s && force) {
      const idx = ss.getSheetByName(def.name).getIndex();
      ss.deleteSheet(s);
      s = null;
    }
    if (!s) {
      s = ss.insertSheet(def.name);
      s.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
        .setFontWeight('bold').setBackground('#1f3a64').setFontColor('#ffffff');
      s.setFrozenRows(1);
      created.push(def.name);
    }
    // Apply validations
    if (def.validations) {
      Object.keys(def.validations).forEach((col) => {
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(def.validations[col], true).setAllowInvalid(true).build();
        const colNum = col.charCodeAt(0) - 64;
        s.getRange(2, colNum, Math.max(s.getMaxRows() - 1, 1), 1).setDataValidation(rule);
      });
    }
  });

  // Config defaults
  const cfg = ss.getSheetByName(SHEETS.CONFIG);
  if (cfg.getLastRow() <= 1) {
    const rows = [
      ['SPREADSHEET_ID', ss.getId(), 'ID interno del archivo (auto)'],
      ['WEB_APP_URL', '', 'URL de despliegue (pega tras desplegar)'],
      ['EJECUTORES', EJECUTORES_DEFAULT.join('|'), '11 ejecutores oficiales, separados por |'],
      ['FAMILIAS_EXTRA', '', 'Mapeo extra palabra→familia, formato palabra=Familia|palabra=Familia'],
      ['ANIO_OPERATIVO', '2026', 'Año del programa actual'],
      ['TZ', TZ, 'Zona horaria'],
      ['DEBUG', 'false', 'Logs verbosos en consola servidor'],
      ['EMAIL_NOTIFICACIONES', '', 'Email destino de recordatorios mensuales'],
      ['NOTIFICAR_INICIO_MES', 'false', 'Si true, envía email cada inicio de mes'],
      ['MODO_OFFLINE_FORZADO', 'false', 'Solo cliente, no se usa servidor'],
      ['SCHEMA_VERSION', SCHEMA_VERSION, 'Versión del esquema de hojas auxiliares']
    ];
    cfg.getRange(2, 1, rows.length, 3).setValues(rows);
  }

  // Por defecto, ocultar hojas de sistema (todas las auxiliares EXCEPTO Config)
  const ocultarPorDefecto = payload && payload.mostrarTodo === true ? false : true;
  if (ocultarPorDefecto) {
    defs.forEach((def) => {
      // Config queda visible para edición manual; el resto se oculta
      if (def.name === SHEETS.CONFIG) return;
      const s = ss.getSheetByName(def.name);
      if (s) try { s.hideSheet(); } catch (e) {}
    });
  }

  // Reordenar: PMP_2026 y Registro_MP-2026 quedan primeras
  try {
    const pmpS = ss.getSheetByName(SHEETS.PMP);
    if (pmpS) ss.setActiveSheet(pmpS), ss.moveActiveSheet(1);
    const regS = ss.getSheetByName(SHEETS.REG);
    if (regS) ss.setActiveSheet(regS), ss.moveActiveSheet(2);
  } catch (e) {}

  audit_(payload, 'inicializar_hojas', 'config', '', { creadas: created, force: force, ocultarPorDefecto });
  invalidateCache_();
  return { ok: true, data: { creadas: created, schema: SCHEMA_VERSION, hojasSistemaOcultas: ocultarPorDefecto } };
}

/* =====================================================================
 * Toggle visibilidad hojas de sistema
 * ===================================================================== */
function toggleHojasSistema_(payload) {
  const ss = ss_(payload);
  const mostrar = payload && payload.mostrar === true;
  const auxiliares = [SHEETS.EVENTOS, SHEETS.PENDIENTES, SHEETS.REPROGS, SHEETS.OVERRIDE,
    SHEETS.ASIGN, SHEETS.SNAPSHOT, SHEETS.INCONS, SHEETS.AUDIT];
  let cambiadas = 0;
  auxiliares.forEach((n) => {
    const s = ss.getSheetByName(n);
    if (!s) return;
    try {
      if (mostrar) { s.showSheet(); cambiadas++; }
      else { s.hideSheet(); cambiadas++; }
    } catch (e) {}
  });
  audit_(payload, 'editar', 'config', 'visibilidad', { mostrar, cambiadas });
  return { ok: true, data: { mostrar, cambiadas } };
}

/* =====================================================================
 * Cargar archivo maestro — reemplaza PMP_2026 y Registro_MP-2026
 *   payload: { pmpRows: [[...]], regRows: [[...]], replace: true }
 *   Cada matriz es 2D: filas completas (incluido encabezados en fila 7).
 * ===================================================================== */
function cargarMaestro_(payload) {
  const ss = ss_(payload);
  const pmpRows = payload.pmpRows || [];
  const regRows = payload.regRows || [];
  if (!pmpRows.length && !regRows.length) return { ok: false, error: 'sin_datos' };

  function escribirHoja(nombre, rows) {
    if (!rows.length) return 0;
    // Calcular ancho máximo
    let maxCols = 0;
    rows.forEach((r) => { if (r.length > maxCols) maxCols = r.length; });
    // Normalizar a igual longitud y sanitizar
    const normalized = rows.map((r) => {
      const out = new Array(maxCols);
      for (let i = 0; i < maxCols; i++) out[i] = sanitizeForCell_(r[i]);
      return out;
    });
    let s = ss.getSheetByName(nombre);
    if (!s) {
      s = ss.insertSheet(nombre);
    } else {
      s.clear();
      // limpiar formatos sólo en zona de datos
    }
    // Asegurar dimensiones suficientes
    if (s.getMaxRows() < normalized.length) s.insertRowsAfter(s.getMaxRows(), normalized.length - s.getMaxRows());
    if (s.getMaxColumns() < maxCols) s.insertColumnsAfter(s.getMaxColumns(), maxCols - s.getMaxColumns());
    s.getRange(1, 1, normalized.length, maxCols).setValues(normalized);
    // Formato encabezado en fila 7 (PMP) o equivalente
    try {
      s.getRange(7, 1, 1, maxCols).setFontWeight('bold').setBackground('#1f3a64').setFontColor('#ffffff');
      s.setFrozenRows(7);
    } catch (e) {}
    return normalized.length;
  }

  let totalPmp = 0, totalReg = 0;
  if (pmpRows.length) totalPmp = escribirHoja(SHEETS.PMP, pmpRows);
  if (regRows.length) totalReg = escribirHoja(SHEETS.REG, regRows);

  // Asegurar que están al frente
  try {
    const pmpS = ss.getSheetByName(SHEETS.PMP);
    if (pmpS) { ss.setActiveSheet(pmpS); ss.moveActiveSheet(1); }
    const regS = ss.getSheetByName(SHEETS.REG);
    if (regS) { ss.setActiveSheet(regS); ss.moveActiveSheet(2); }
  } catch (e) {}

  invalidateCache_();
  audit_(payload, 'cargar_maestro', 'config', '', { pmpFilas: totalPmp, regFilas: totalReg });
  return { ok: true, data: { pmpFilas: totalPmp, regFilas: totalReg } };
}

/* =====================================================================
 * Config get/set
 * ===================================================================== */
function getConfig_(payload) {
  const s = sheet_(payload, SHEETS.CONFIG);
  const data = s.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) out[String(data[i][0])] = String(data[i][1] == null ? '' : data[i][1]);
  }
  return { ok: true, data: out };
}

function setConfig_(payload) {
  const s = sheet_(payload, SHEETS.CONFIG);
  const updates = payload.updates || {};
  const data = s.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) map[String(data[i][0])] = i + 1;
  }
  Object.keys(updates).forEach((k) => {
    const v = sanitizeForCell_(updates[k]);
    if (map[k]) {
      s.getRange(map[k], 2).setValue(v);
    } else {
      s.appendRow([k, v, '']);
    }
  });
  audit_(payload, 'editar', 'config', '', updates);
  return { ok: true };
}

/* =====================================================================
 * getEquipos — parsea PMP_2026 + Registro_MP-2026
 * ===================================================================== */
function getEquipos_(payload) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('equipos_v1');
  if (cached && !payload.nocache) {
    try { return { ok: true, data: JSON.parse(cached), fromCache: true }; } catch (e) {}
  }
  const ssObj = ss_(payload);
  const pmp = ssObj.getSheetByName(SHEETS.PMP);
  const reg = ssObj.getSheetByName(SHEETS.REG);
  if (!pmp) return { ok: false, error: 'sheet_not_found:' + SHEETS.PMP };
  const pmpVals = pmp.getDataRange().getValues();
  const regVals = reg ? reg.getDataRange().getValues() : [];
  const equipos = [];
  // Headers in row 7 (index 6), data starts row 8 (index 7)
  for (let i = 7; i < pmpVals.length; i++) {
    const row = pmpVals[i];
    if (row.every((c) => c === '' || c == null)) continue;
    const id = String(row[1] || '').trim();
    const inventario = String(row[3] || '').trim();
    const equipoNombre = String(row[4] || '').trim();
    const isSlot = !equipoNombre;
    const mesesP = [];
    for (let m = 0; m < 12; m++) mesesP.push(String(row[19 + m] || '').trim());
    const mesesReg = [];
    const regRow = regVals[i] || [];
    for (let m = 0; m < 12; m++) {
      mesesReg.push({
        p: String(regRow[19 + 2 * m] || '').trim(),
        r: String(regRow[20 + 2 * m] || '').trim()
      });
    }
    const eq = {
      key: equipoKeyOf_(inventario, id),
      id: id,
      familia: String(row[0] || '').trim(),
      carpeta: String(row[2] || '').trim(),
      inventario: inventario,
      equipo: equipoNombre,
      servicio: String(row[5] || '').trim(),
      unidad: String(row[6] || '').trim(),
      ubicacion: String(row[7] || '').trim(),
      procedencia: String(row[8] || '').trim(),
      marca: String(row[9] || '').trim(),
      modelo: String(row[10] || '').trim(),
      serie: String(row[11] || '').trim(),
      anio: String(row[12] || '').trim(),
      vidaUtil: String(row[13] || '').trim(),
      clasificacion: String(row[14] || '').trim(),
      enuBaja: String(row[15] || '').trim(),
      frecuencia: String(row[17] || '').trim(),
      mesesP: mesesP,
      mesesReg: mesesReg,
      isSlot: isSlot,
      familiaCalc: familiaDe_(equipoNombre)
    };
    equipos.push(eq);
  }
  try { cache.put('equipos_v1', JSON.stringify(equipos), CACHE_TTL_SEC); } catch (e) {}
  return { ok: true, data: equipos };
}

/* =====================================================================
 * KPIs
 * ===================================================================== */
function getKPIs_(payload) {
  const res = getEquipos_(payload);
  if (!res.ok) return res;
  const equipos = res.data;
  const month = new Date().getMonth(); // 0..11
  let programadas = 0, programadasMes = 0;
  let ejecutadas = 0, ejecutadasMes = 0;
  let pendientes = 0, fsbn = 0;
  let porFamilia = {};
  const overridesRes = getOverrides_(payload);
  const overrides = overridesRes.ok ? overridesRes.data : {};
  equipos.forEach((eq) => {
    if (eq.isSlot) return;
    const fam = eq.familiaCalc;
    if (!porFamilia[fam]) porFamilia[fam] = 0;
    porFamilia[fam]++;
    for (let m = 0; m < 12; m++) {
      const p = eq.mesesP[m];
      const reg = eq.mesesReg[m] || { p: '', r: '' };
      let r = reg.r;
      const ov = (overrides[eq.key] || {})[m];
      if (ov) r = ov;
      if (p === 'X' || p === 'R' || p === 'RA' || p === 'PM') {
        programadas++;
        if (m === month) programadasMes++;
      }
      if (r === 'Si' || r === 'Si-RA') {
        ejecutadas++;
        if (m === month) ejecutadasMes++;
      } else if (r === 'FS' || r === 'Baja' || r === 'NU') {
        fsbn++;
      }
    }
  });
  pendientes = programadas - ejecutadas - fsbn;
  if (pendientes < 0) pendientes = 0;
  return { ok: true, data: {
    programadas, programadasMes, ejecutadas, ejecutadasMes, pendientes, fsbn,
    porFamilia, mesActual: month + 1, cumplimiento: programadas ? Math.round(ejecutadas * 100 / programadas) : 0
  }};
}

/* =====================================================================
 * Búsqueda equipos
 * ===================================================================== */
function buscarEquipos_(payload) {
  const res = getEquipos_(payload);
  if (!res.ok) return res;
  const q = String(payload.q || '').toLowerCase().trim();
  const filtros = payload.filtros || {};
  const equipos = res.data.filter((eq) => {
    if (eq.isSlot && !payload.incluirSlots) return false;
    if (filtros.servicio && eq.servicio !== filtros.servicio) return false;
    if (filtros.familia && eq.familiaCalc !== filtros.familia) return false;
    if (!q) return true;
    const blob = (eq.equipo + '|' + eq.inventario + '|' + eq.serie + '|' + eq.marca + '|' + eq.modelo + '|' + eq.ubicacion).toLowerCase();
    return blob.indexOf(q) >= 0;
  });
  return { ok: true, data: equipos.slice(0, 500), total: equipos.length };
}

/* =====================================================================
 * Pendientes
 * ===================================================================== */
function getPendientes_(payload) {
  const s = sheet_(payload, SHEETS.PENDIENTES);
  const data = s.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    out.push({
      id: r[0], equipoKey: r[1] || '', descripcion: r[2] || '',
      fechaCreacion: r[3] || '', fechaCompromiso: r[4] || '',
      ejecutor: r[5] || '', prioridad: r[6] || 'media',
      etiquetas: r[7] ? String(r[7]).split('|').filter(Boolean) : [],
      estado: r[8] || 'abierto',
      tareas: parseJson_(r[9], []),
      actualizaciones: parseJson_(r[10], [])
    });
  }
  return { ok: true, data: out };
}

function savePendiente_(payload) {
  const s = sheet_(payload, SHEETS.PENDIENTES);
  const p = payload.pendiente || {};
  const data = s.getDataRange().getValues();
  let rowIdx = -1;
  if (p.id) {
    for (let i = 1; i < data.length; i++) if (data[i][0] === p.id) { rowIdx = i + 1; break; }
  } else {
    p.id = uid_();
    if (!p.fechaCreacion) p.fechaCreacion = nowIso_().slice(0, 10);
  }
  const row = [
    p.id, p.equipoKey || '', sanitizeForCell_(p.descripcion || ''),
    p.fechaCreacion || '', p.fechaCompromiso || '',
    p.ejecutor || '', p.prioridad || 'media',
    (p.etiquetas || []).join('|'), p.estado || 'abierto',
    JSON.stringify(p.tareas || []), JSON.stringify(p.actualizaciones || [])
  ];
  if (rowIdx > 0) s.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  else s.appendRow(row);
  audit_(payload, rowIdx > 0 ? 'editar' : 'crear', 'pendiente', p.id, { descripcion: p.descripcion });
  return { ok: true, data: p };
}

function togglePendiente_(payload) {
  const s = sheet_(payload, SHEETS.PENDIENTES);
  const id = payload.id;
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const nuevo = data[i][8] === 'cerrado' ? 'abierto' : 'cerrado';
      s.getRange(i + 1, 9).setValue(nuevo);
      audit_(payload, 'editar', 'pendiente', id, { estado: nuevo });
      return { ok: true, data: { id, estado: nuevo } };
    }
  }
  return { ok: false, error: 'not_found' };
}

function deletePendiente_(payload) {
  const s = sheet_(payload, SHEETS.PENDIENTES);
  const id = payload.id;
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { s.deleteRow(i + 1); audit_(payload, 'eliminar', 'pendiente', id, {}); return { ok: true }; }
  }
  return { ok: false, error: 'not_found' };
}

/* =====================================================================
 * Eventos
 * ===================================================================== */
function getEventos_(payload) {
  const s = sheet_(payload, SHEETS.EVENTOS);
  const data = s.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    out.push({
      id: r[0], equipoKey: r[1] || '', tipo: r[2] || '',
      fecha: r[3] || '', resultado: r[4] || '', estadoEquipo: r[5] || '',
      ejecutor: r[6] || '', observacion: r[7] || '', nEnvio: r[8] || '',
      empresa: r[9] || '', folio: r[10] || '', comentario: r[11] || '',
      folioGuia: r[12] || '', createdAt: r[13] || ''
    });
  }
  return { ok: true, data: out };
}

function saveEvento_(payload) {
  const s = sheet_(payload, SHEETS.EVENTOS);
  const ev = payload.evento || {};
  const data = s.getDataRange().getValues();
  let rowIdx = -1;
  if (ev.id) {
    for (let i = 1; i < data.length; i++) if (data[i][0] === ev.id) { rowIdx = i + 1; break; }
  } else {
    ev.id = uid_();
    ev.createdAt = nowIso_();
  }
  const row = [
    ev.id, ev.equipoKey || '', ev.tipo || '', ev.fecha || '', ev.resultado || '',
    ev.estadoEquipo || '', ev.ejecutor || '', sanitizeForCell_(ev.observacion || ''),
    ev.nEnvio || '', ev.empresa || '', ev.folio || '', sanitizeForCell_(ev.comentario || ''),
    ev.folioGuia || '', ev.createdAt || nowIso_()
  ];
  if (rowIdx > 0) s.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  else s.appendRow(row);
  audit_(payload, rowIdx > 0 ? 'editar' : 'crear', 'evento', ev.id, { tipo: ev.tipo, equipoKey: ev.equipoKey });
  return { ok: true, data: ev };
}

function deleteEvento_(payload) {
  const s = sheet_(payload, SHEETS.EVENTOS);
  const id = payload.id;
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { s.deleteRow(i + 1); audit_(payload, 'eliminar', 'evento', id, {}); return { ok: true }; }
  }
  return { ok: false, error: 'not_found' };
}

/* =====================================================================
 * Reprogramaciones
 * ===================================================================== */
function getReprogs_(payload) {
  const s = sheet_(payload, SHEETS.REPROGS);
  const data = s.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    out.push({
      id: r[0], equipoKey: r[1], mesOrigen: Number(r[2]) || 0,
      causal: r[3] || '', mesDestino: r[4] === '' ? null : Number(r[4]),
      fechaRegistro: r[5] || '', comentario: r[6] || ''
    });
  }
  return { ok: true, data: out };
}

function saveReprogramacion_(payload) {
  const s = sheet_(payload, SHEETS.REPROGS);
  const re = payload.reprog || {};
  if (!re.id) re.id = uid_();
  if (!re.fechaRegistro) re.fechaRegistro = nowIso_();
  const data = s.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) if (data[i][0] === re.id) { rowIdx = i + 1; break; }
  const row = [re.id, re.equipoKey || '', Number(re.mesOrigen) || '', re.causal || '',
    re.mesDestino == null || re.mesDestino === '' ? '' : Number(re.mesDestino),
    re.fechaRegistro, sanitizeForCell_(re.comentario || '')];
  if (rowIdx > 0) s.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  else s.appendRow(row);
  audit_(payload, rowIdx > 0 ? 'editar' : 'crear', 'reprogramacion', re.id, re);
  return { ok: true, data: re };
}

function deleteReprogramacion_(payload) {
  const s = sheet_(payload, SHEETS.REPROGS);
  const id = payload.id;
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { s.deleteRow(i + 1); audit_(payload, 'eliminar', 'reprogramacion', id, {}); return { ok: true }; }
  }
  return { ok: false, error: 'not_found' };
}

/* =====================================================================
 * Overrides
 * ===================================================================== */
function getOverrides_(payload) {
  const s = sheetOrNull_(payload, SHEETS.OVERRIDE);
  if (!s) return { ok: true, data: {} };
  const data = s.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    const k = r[0]; const m = Number(r[1]);
    if (!out[k]) out[k] = {};
    out[k][m - 1] = r[2];
  }
  return { ok: true, data: out };
}

function saveResultadoOverride_(payload) {
  const s = sheet_(payload, SHEETS.OVERRIDE);
  const key = payload.equipoKey;
  const mes = Number(payload.mes); // 1..12
  const resultado = payload.resultado;
  const data = s.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) if (data[i][0] === key && Number(data[i][1]) === mes) { rowIdx = i + 1; break; }
  const row = [key, mes, resultado, nowIso_(), getUser_()];
  if (rowIdx > 0) s.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  else s.appendRow(row);
  audit_(payload, rowIdx > 0 ? 'editar' : 'crear', 'override', key + ':' + mes, { resultado });
  invalidateCache_();
  return { ok: true };
}

function deleteResultadoOverride_(payload) {
  const s = sheet_(payload, SHEETS.OVERRIDE);
  const key = payload.equipoKey;
  const mes = Number(payload.mes);
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key && Number(data[i][1]) === mes) {
      s.deleteRow(i + 1); audit_(payload, 'eliminar', 'override', key + ':' + mes, {});
      invalidateCache_(); return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

/* =====================================================================
 * Asignaciones
 * ===================================================================== */
function getAsignaciones_(payload) {
  const s = sheetOrNull_(payload, SHEETS.ASIGN);
  if (!s) return { ok: true, data: {} };
  const data = s.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    const k = r[0]; const m = Number(r[1]);
    if (!out[k]) out[k] = {};
    out[k][m - 1] = r[2];
  }
  return { ok: true, data: out };
}

function saveAsignacion_(payload) {
  const s = sheet_(payload, SHEETS.ASIGN);
  const key = payload.equipoKey;
  const mes = Number(payload.mes);
  const ejecutor = payload.ejecutor || '';
  const data = s.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) if (data[i][0] === key && Number(data[i][1]) === mes) { rowIdx = i + 1; break; }
  if (!ejecutor) {
    if (rowIdx > 0) { s.deleteRow(rowIdx); audit_(payload, 'eliminar', 'asignacion', key + ':' + mes, {}); }
    return { ok: true };
  }
  const row = [key, mes, ejecutor, nowIso_()];
  if (rowIdx > 0) s.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  else s.appendRow(row);
  audit_(payload, rowIdx > 0 ? 'editar' : 'crear', 'asignacion', key + ':' + mes, { ejecutor });
  return { ok: true };
}

/* =====================================================================
 * Plantilla mensual
 * ===================================================================== */
function generarPlantillaMensual_(payload) {
  const mes = Number(payload.mes); // 1..12
  if (!mes) return { ok: false, error: 'mes_requerido' };
  const ssObj = ss_(payload);
  const eqRes = getEquipos_(payload);
  if (!eqRes.ok) return eqRes;
  const asignRes = getAsignaciones_(payload);
  const asignaciones = asignRes.data || {};
  const nombreHoja = 'Plantilla_' + String(mes).padStart(2, '0') + '_' + (new Date().getFullYear());
  let s = ssObj.getSheetByName(nombreHoja);
  if (s) ssObj.deleteSheet(s);
  s = ssObj.insertSheet(nombreHoja);
  const headers = ['ID','N°Inventario','Equipo','Servicio','Ubicación','Marca','Modelo','Serie','Frecuencia','Código','Responsable','Fecha Ejecución','Resultado','Observaciones'];
  s.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1f3a64').setFontColor('#ffffff');
  s.setFrozenRows(1);
  const rows = [];
  eqRes.data.forEach((eq) => {
    if (eq.isSlot) return;
    const cod = eq.mesesP[mes - 1];
    if (!cod) return;
    const resp = (asignaciones[eq.key] || {})[mes - 1] || '';
    rows.push([eq.id, eq.inventario, eq.equipo, eq.servicio, eq.ubicacion, eq.marca, eq.modelo, eq.serie, eq.frecuencia, cod, resp, '', '', '']);
  });
  if (rows.length) s.getRange(2, 1, rows.length, headers.length).setValues(rows);
  s.autoResizeColumns(1, headers.length);
  audit_(payload, 'crear', 'plantilla', nombreHoja, { mes, total: rows.length });
  return { ok: true, data: { hoja: nombreHoja, total: rows.length } };
}

function aplicarPlantillaCargada_(payload) {
  const items = payload.items || [];
  let aplicadas = 0;
  items.forEach((it) => {
    if (it.responsable) {
      saveAsignacion_({ __sheetId: payload.__sheetId, equipoKey: it.equipoKey, mes: it.mes, ejecutor: it.responsable });
      aplicadas++;
    }
    if (it.resultado) {
      saveResultadoOverride_({ __sheetId: payload.__sheetId, equipoKey: it.equipoKey, mes: it.mes, resultado: it.resultado });
    }
  });
  audit_(payload, 'aplicar_plantilla', 'plantilla', '', { total: items.length, aplicadas });
  return { ok: true, data: { aplicadas } };
}

/* =====================================================================
 * Snapshot
 * ===================================================================== */
function tomarSnapshot_(payload) {
  const s = sheet_(payload, SHEETS.SNAPSHOT);
  const eqRes = getEquipos_({ ...payload, nocache: true });
  if (!eqRes.ok) return eqRes;
  const ts = nowIso_();
  const rows = [];
  eqRes.data.forEach((eq) => {
    if (eq.isSlot) return;
    for (let m = 0; m < 12; m++) {
      if (eq.mesesP[m]) rows.push([ts, eq.key, m + 1, 'P', eq.mesesP[m]]);
      const rr = eq.mesesReg[m] || {};
      if (rr.r) rows.push([ts, eq.key, m + 1, 'R', rr.r]);
    }
  });
  if (rows.length) s.getRange(s.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  // Purgar: conservar últimos 5 snapshots
  purgarSnapshotsViejos_(s);
  audit_(payload, 'tomar_snapshot', 'snapshot', ts, { filas: rows.length });
  return { ok: true, data: { ts, filas: rows.length } };
}

function purgarSnapshotsViejos_(s) {
  const data = s.getDataRange().getValues();
  if (data.length < 2) return;
  const tss = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) tss[data[i][0]] = true;
  }
  const sorted = Object.keys(tss).sort();
  if (sorted.length <= 5) return;
  const remove = new Set(sorted.slice(0, sorted.length - 5));
  for (let i = data.length - 1; i >= 1; i--) {
    if (remove.has(String(data[i][0]))) s.deleteRow(i + 1);
  }
}

function listarSnapshots_(payload) {
  const s = sheet_(payload, SHEETS.SNAPSHOT);
  const data = s.getDataRange().getValues();
  const counts = {};
  for (let i = 1; i < data.length; i++) {
    const t = data[i][0];
    if (!t) continue;
    counts[t] = (counts[t] || 0) + 1;
  }
  return { ok: true, data: Object.keys(counts).sort().map((t) => ({ ts: t, filas: counts[t] })) };
}

function compararSnapshot_(payload) {
  const s = sheet_(payload, SHEETS.SNAPSHOT);
  const data = s.getDataRange().getValues();
  if (data.length < 2) return { ok: true, data: { incons: [] } };
  let target = payload.ts;
  if (!target) {
    const tss = new Set();
    for (let i = 1; i < data.length; i++) if (data[i][0]) tss.add(data[i][0]);
    const sorted = Array.from(tss).sort();
    target = sorted[sorted.length - 1];
  }
  const snap = {}; // key+mes+tipo → val
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== target) continue;
    const r = data[i];
    snap[r[1] + '|' + r[2] + '|' + r[3]] = r[4];
  }
  const eqRes = getEquipos_({ ...payload, nocache: true });
  if (!eqRes.ok) return eqRes;
  const overridesRes = getOverrides_(payload);
  const overrides = overridesRes.data || {};
  const incons = [];
  const seenKeys = new Set();
  eqRes.data.forEach((eq) => {
    if (eq.isSlot) return;
    seenKeys.add(eq.key);
    for (let m = 0; m < 12; m++) {
      const pNow = eq.mesesP[m] || '';
      const rNow = (eq.mesesReg[m] || {}).r || '';
      const pPrev = snap[eq.key + '|' + (m + 1) + '|P'] || '';
      const rPrev = snap[eq.key + '|' + (m + 1) + '|R'] || '';
      // si_desaparecida
      if ((rPrev === 'Si' || rPrev === 'Si-RA') && rNow === '') {
        incons.push(mkIncons_('si_desaparecida', eq.key, m + 1, rPrev, rNow));
      }
      // si_a_causal
      if ((rPrev === 'Si' || rPrev === 'Si-RA') && rNow && rNow !== rPrev && (rNow.charAt(0) === 'C' || rNow === 'FS' || rNow === 'Baja' || rNow === 'NU')) {
        incons.push(mkIncons_('si_a_causal', eq.key, m + 1, rPrev, rNow));
      }
      // causal_cambiada
      if (rPrev && rNow && rPrev.charAt(0) === 'C' && rNow.charAt(0) === 'C' && rPrev !== rNow) {
        incons.push(mkIncons_('causal_cambiada', eq.key, m + 1, rPrev, rNow));
      }
      // override_no_reflejado
      const ov = (overrides[eq.key] || {})[m];
      if (ov && ov !== rNow) {
        incons.push(mkIncons_('override_no_reflejado', eq.key, m + 1, ov, rNow));
      }
      // baja_nueva
      if (rNow === 'Baja' && rPrev !== 'Baja') {
        incons.push(mkIncons_('baja_nueva', eq.key, m + 1, rPrev, rNow));
      }
    }
  });
  // equipo_desaparecido / equipo_nuevo
  const prevKeys = new Set();
  Object.keys(snap).forEach((k) => prevKeys.add(k.split('|')[0]));
  prevKeys.forEach((k) => { if (!seenKeys.has(k)) incons.push(mkIncons_('equipo_desaparecido', k, 0, '', '')); });
  seenKeys.forEach((k) => { if (!prevKeys.has(k)) incons.push(mkIncons_('equipo_nuevo', k, 0, '', '')); });

  if (payload.persistir !== false) {
    persistirInconsistencias_(payload, incons);
  }
  return { ok: true, data: { ts: target, incons } };
}

function mkIncons_(tipo, equipoKey, mes, antes, despues) {
  return {
    id: uid_(), fechaDeteccion: nowIso_(), equipoKey, tipo, mes,
    valorAntes: antes, valorDespues: despues, estado: 'nueva', comentario: '', pendienteVinculadoId: ''
  };
}

function persistirInconsistencias_(payload, incons) {
  if (!incons.length) return;
  const s = sheet_(payload, SHEETS.INCONS);
  const data = s.getDataRange().getValues();
  const existing = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][7] === 'nueva') existing.add(data[i][2] + '|' + data[i][3] + '|' + data[i][4]);
  }
  const rows = [];
  incons.forEach((ic) => {
    const sig = ic.equipoKey + '|' + ic.tipo + '|' + ic.mes;
    if (existing.has(sig)) return;
    rows.push([ic.id, ic.fechaDeteccion, ic.equipoKey, ic.tipo, ic.mes, ic.valorAntes, ic.valorDespues, ic.estado, ic.comentario, ic.pendienteVinculadoId]);
  });
  if (rows.length) s.getRange(s.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
}

/* =====================================================================
 * Inconsistencias
 * ===================================================================== */
function getInconsistencias_(payload) {
  const s = sheet_(payload, SHEETS.INCONS);
  const data = s.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    out.push({
      id: r[0], fechaDeteccion: r[1], equipoKey: r[2], tipo: r[3], mes: Number(r[4]) || 0,
      valorAntes: r[5], valorDespues: r[6], estado: r[7], comentario: r[8],
      pendienteVinculadoId: r[9]
    });
  }
  return { ok: true, data: out };
}

function marcarInconsistencia_(payload) {
  const s = sheet_(payload, SHEETS.INCONS);
  const id = payload.id; const estado = payload.estado || 'revisada';
  const comentario = payload.comentario || '';
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      s.getRange(i + 1, 8).setValue(estado);
      s.getRange(i + 1, 9).setValue(sanitizeForCell_(comentario));
      audit_(payload, 'marcar_revisada', 'inconsistencia', id, { estado, comentario });
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

function convertirInconsistenciaEnPendiente_(payload) {
  const s = sheet_(payload, SHEETS.INCONS);
  const id = payload.id;
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const row = data[i];
      const pend = {
        equipoKey: row[2],
        descripcion: 'Inconsistencia ' + row[3] + ' mes ' + row[4] + ': ' + row[5] + ' → ' + row[6],
        prioridad: 'media',
        estado: 'abierto',
        fechaCreacion: nowIso_().slice(0, 10),
        etiquetas: ['inconsistencia', row[3]],
        tareas: [], actualizaciones: []
      };
      const saved = savePendiente_({ __sheetId: payload.__sheetId, pendiente: pend });
      s.getRange(i + 1, 8).setValue('convertida_pendiente');
      s.getRange(i + 1, 10).setValue(saved.data.id);
      audit_(payload, 'convertir_pendiente', 'inconsistencia', id, { pendienteId: saved.data.id });
      return { ok: true, data: { pendienteId: saved.data.id } };
    }
  }
  return { ok: false, error: 'not_found' };
}

/* =====================================================================
 * Verificación de carga
 * ===================================================================== */
function getVerificacionCarga_(payload) {
  const eqRes = getEquipos_(payload);
  if (!eqRes.ok) return eqRes;
  const equipos = eqRes.data;
  const filasPMP = equipos.length;
  let validos = 0, slots = 0;
  const porFamilia = {};
  const codigosPmpMes = {}; // mes → cod → count
  const codigosRegMes = {};
  const invSeen = {};
  const duplicados = [];
  equipos.forEach((eq) => {
    if (eq.isSlot) { slots++; return; }
    validos++;
    porFamilia[eq.familiaCalc] = (porFamilia[eq.familiaCalc] || 0) + 1;
    if (eq.inventario) {
      if (invSeen[eq.inventario]) duplicados.push({ inv: eq.inventario, ids: [invSeen[eq.inventario], eq.id] });
      invSeen[eq.inventario] = eq.id;
    }
    for (let m = 0; m < 12; m++) {
      const p = eq.mesesP[m];
      if (p) {
        if (!codigosPmpMes[m + 1]) codigosPmpMes[m + 1] = {};
        codigosPmpMes[m + 1][p] = (codigosPmpMes[m + 1][p] || 0) + 1;
      }
      const r = (eq.mesesReg[m] || {}).r;
      if (r) {
        if (!codigosRegMes[m + 1]) codigosRegMes[m + 1] = {};
        codigosRegMes[m + 1][r] = (codigosRegMes[m + 1][r] || 0) + 1;
      }
    }
  });
  return { ok: true, data: {
    filasPMP, validos, slots, porFamilia, codigosPmpMes, codigosRegMes, duplicados,
    cargadoEn: nowIso_()
  }};
}

/* =====================================================================
 * Backup / Respaldo JSON
 * ===================================================================== */
function exportarRespaldo_(payload) {
  const eqRes = getEquipos_(payload);
  if (!eqRes.ok) return eqRes;
  const eventos = getEventos_(payload).data || [];
  const pendientes = getPendientes_(payload).data || [];
  const reprogs = getReprogs_(payload).data || [];
  const overrides = getOverrides_(payload).data || {};
  const asignaciones = getAsignaciones_(payload).data || {};
  const verifInfo = getVerificacionCarga_(payload).data || null;
  // Reorganizar al formato esperado por la versión HTML actual:
  const eventosByKey = {}; eventos.forEach((e) => { (eventosByKey[e.equipoKey] = eventosByKey[e.equipoKey] || []).push(e); });
  const pendByKey = {}; pendientes.forEach((p) => { (pendByKey[p.equipoKey || ''] = pendByKey[p.equipoKey || ''] || []).push(p); });
  const reprogByKey = {}; reprogs.forEach((r) => {
    const k = r.equipoKey; if (!reprogByKey[k]) reprogByKey[k] = {};
    reprogByKey[k][(r.mesDestino || r.mesOrigen) - 1] = 'R';
  });
  return { ok: true, data: {
    schema: SCHEMA_VERSION,
    ts: nowIso_(),
    equipos: eqRes.data,
    eventos: eventosByKey,
    pendientes: pendByKey,
    reprogs: reprogByKey,
    reprogramaciones: reprogs,
    resultadosOverride: overrides,
    asignaciones: asignaciones,
    verifInfo: verifInfo
  }};
}

function importarRespaldo_(payload) {
  const data = payload.respaldo || {};
  let totales = { eventos: 0, pendientes: 0, reprogs: 0, overrides: 0, asignaciones: 0 };
  // Eventos
  if (data.eventos) {
    Object.keys(data.eventos).forEach((k) => {
      (data.eventos[k] || []).forEach((ev) => {
        ev.equipoKey = ev.equipoKey || k;
        saveEvento_({ __sheetId: payload.__sheetId, evento: ev });
        totales.eventos++;
      });
    });
  }
  // Pendientes (HTML actual: por keyEq)
  if (data.pendientes) {
    Object.keys(data.pendientes).forEach((k) => {
      (data.pendientes[k] || []).forEach((p) => {
        p.equipoKey = p.equipoKey || (k === '' ? '' : k);
        savePendiente_({ __sheetId: payload.__sheetId, pendiente: p });
        totales.pendientes++;
      });
    });
  }
  // Reprogs (formato legacy: {keyEq: {mesIdx: 'R'}})
  if (data.reprogs) {
    Object.keys(data.reprogs).forEach((k) => {
      Object.keys(data.reprogs[k] || {}).forEach((mIdx) => {
        saveReprogramacion_({ __sheetId: payload.__sheetId, reprog: {
          equipoKey: k, mesOrigen: Number(mIdx) + 1, causal: 'C1',
          mesDestino: Number(mIdx) + 1, fechaRegistro: data.ts || nowIso_(), comentario: 'Importado'
        }});
        totales.reprogs++;
      });
    });
  }
  if (data.reprogramaciones) {
    (data.reprogramaciones || []).forEach((re) => {
      saveReprogramacion_({ __sheetId: payload.__sheetId, reprog: re });
      totales.reprogs++;
    });
  }
  // Overrides
  if (data.resultadosOverride) {
    Object.keys(data.resultadosOverride).forEach((k) => {
      Object.keys(data.resultadosOverride[k]).forEach((m) => {
        saveResultadoOverride_({ __sheetId: payload.__sheetId, equipoKey: k, mes: Number(m) + 1, resultado: data.resultadosOverride[k][m] });
        totales.overrides++;
      });
    });
  }
  // Asignaciones
  if (data.asignaciones) {
    Object.keys(data.asignaciones).forEach((k) => {
      Object.keys(data.asignaciones[k]).forEach((m) => {
        saveAsignacion_({ __sheetId: payload.__sheetId, equipoKey: k, mes: Number(m) + 1, ejecutor: data.asignaciones[k][m] });
        totales.asignaciones++;
      });
    });
  }
  audit_(payload, 'importar_respaldo', 'config', '', totales);
  return { ok: true, data: totales };
}

/* =====================================================================
 * Audit log
 * ===================================================================== */
function getAuditLog_(payload) {
  const s = sheetOrNull_(payload, SHEETS.AUDIT);
  if (!s) return { ok: true, data: [] };
  const data = s.getDataRange().getValues();
  const limit = Math.min(Number(payload.limit) || 500, 2000);
  const out = [];
  for (let i = data.length - 1; i >= 1 && out.length < limit; i--) {
    const r = data[i]; if (!r[0]) continue;
    let det = {};
    try { det = JSON.parse(r[5] || '{}'); } catch (e) { det = { raw: String(r[5]) }; }
    out.push({ timestamp: r[0], usuario: r[1], accion: r[2], entidad: r[3], entidadId: r[4], detalle: det });
  }
  return { ok: true, data: out };
}

function purgarAuditLog_(payload) {
  const s = sheetOrNull_(payload, SHEETS.AUDIT);
  if (!s) return { ok: true };
  const data = s.getDataRange().getValues();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  let eliminadas = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    const ts = data[i][0];
    if (!ts) continue;
    if (new Date(ts) < cutoff) { s.deleteRow(i + 1); eliminadas++; }
  }
  return { ok: true, data: { eliminadas } };
}

/* =====================================================================
 * Batch
 * ===================================================================== */
function aplicarMutacionesEnLote_(payload) {
  const items = payload.items || [];
  const resultados = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const fn = ACTIONS[it.action];
    if (!fn) { resultados.push({ ok: false, error: 'unknown_action:' + it.action, idx: i, localId: it.localId }); continue; }
    try {
      const r = fn(Object.assign({}, it.payload || {}, { __sheetId: payload.__sheetId }));
      resultados.push(Object.assign({}, r, { idx: i, localId: it.localId }));
    } catch (e) {
      resultados.push({ ok: false, error: String(e && e.message || e), idx: i, localId: it.localId });
    }
  }
  return { ok: true, data: resultados };
}

/* =====================================================================
 * Notificaciones / Backup
 * ===================================================================== */
function notificarInicioMes_() {
  const cfg = getConfig_({}).data || {};
  if (cfg.NOTIFICAR_INICIO_MES !== 'true') return { ok: true, data: { skipped: true } };
  const email = cfg.EMAIL_NOTIFICACIONES;
  if (!email) return { ok: false, error: 'sin_email' };
  const mes = new Date().getMonth() + 1;
  const eqRes = getEquipos_({ nocache: true });
  if (!eqRes.ok) return eqRes;
  const asignRes = getAsignaciones_({});
  const asign = asignRes.data || {};
  let total = 0;
  const porResp = {};
  eqRes.data.forEach((eq) => {
    if (eq.isSlot) return;
    if (eq.mesesP[mes - 1]) {
      total++;
      const resp = (asign[eq.key] || {})[mes - 1] || 'Sin asignar';
      porResp[resp] = (porResp[resp] || 0) + 1;
    }
  });
  let body = 'Programa MP – Mes ' + mes + '\n\nTotal equipos a mantener: ' + total + '\n\nPor responsable:\n';
  Object.keys(porResp).sort().forEach((r) => body += '  ' + r + ': ' + porResp[r] + '\n');
  MailApp.sendEmail(email, 'MP 2026 — Mes ' + mes + ' (' + total + ' equipos)', body);
  return { ok: true, data: { enviadoA: email, total } };
}

function backupDiario_() {
  const ssObj = SpreadsheetApp.getActiveSpreadsheet();
  const folderName = 'Respaldos_MP_2026';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm');
  const copy = DriveApp.getFileById(ssObj.getId()).makeCopy('MP2026_' + stamp, folder);
  // Conservar últimos 30
  const files = [];
  const iter = folder.getFiles();
  while (iter.hasNext()) files.push(iter.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  for (let i = 30; i < files.length; i++) files[i].setTrashed(true);
  return { ok: true, data: { copy: copy.getName(), conservados: Math.min(files.length, 30) } };
}

/* =====================================================================
 * Triggers
 * ===================================================================== */
function setupTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('purgarAuditLog_').timeBased().everyDays(1).atHour(3).create();
  ScriptApp.newTrigger('backupDiario_').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('notificarInicioMes_').timeBased().onMonthDay(1).atHour(8).create();
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
}

/* =====================================================================
 * Seed test data (ejecutable desde editor)
 * ===================================================================== */
function seedTestData_() {
  const ssObj = SpreadsheetApp.getActiveSpreadsheet();
  inicializarHojas_({ __sheetId: ssObj.getId() });
  // Crear PMP_2026 si no existe
  let pmp = ssObj.getSheetByName(SHEETS.PMP);
  if (!pmp) {
    pmp = ssObj.insertSheet(SHEETS.PMP);
    const headers = ['Familia','ID','N°Carpeta','N°Inventario','Equipo','Servicio','Unidad','Ubicación','Procedencia','Marca','Modelo','Serie','Año','Vida útil','Clasificación','ENU/Baja','Observación','Frecuencia','Responsable'];
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    pmp.getRange(7, 1, 1, headers.length + 12).setValues([headers.concat(meses)]).setFontWeight('bold');
  }
  let reg = ssObj.getSheetByName(SHEETS.REG);
  if (!reg) {
    reg = ssObj.insertSheet(SHEETS.REG);
    const headers = ['','ID','N°Carpeta','N°Inventario','Equipo','Servicio','Unidad','Ubicación','Procedencia','Marca','Modelo','Serie','Año','Vida útil','Clasificación','ENU/Baja','Observación','Frecuencia','Responsable'];
    const meses = [];
    ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].forEach((m) => { meses.push(m + ' P'); meses.push(m + ' R'); });
    reg.getRange(7, 1, 1, headers.length + 24).setValues([headers.concat(meses)]).setFontWeight('bold');
  }

  const familias = ['Monitor multiparamétrico','Ventilador volumétrico','Desfibrilador','Máquina de Anestesia','Incubadora neonatal','Máquina de Diálisis','Bomba de infusión','Electrocardiógrafo'];
  const servicios = ['UCI Adultos','Pabellón','Neonatología','Urgencia','Pediatría','UCI Coronaria'];
  const marcas = ['Mindray','Dräger','Philips','GE','Maquet'];
  const rows = [];
  const regRows = [];
  for (let i = 0; i < 20; i++) {
    const nombre = familias[i % familias.length];
    const inv = 'INV' + (1000 + i);
    const id = 'EQ-' + (100 + i);
    const row = [familiaDe_(nombre), id, 'C-' + i, inv, nombre,
      servicios[i % servicios.length], 'Unidad ' + (i % 3 + 1), 'Sala ' + i, 'Donación',
      marcas[i % marcas.length], 'Modelo-' + i, 'SER' + i, 2018 + (i % 5), 5, 'Crítico', 'Operativo', '', 'Trimestral', ''];
    const mesesP = new Array(12).fill('');
    [1, 4, 7, 10].forEach((m) => { mesesP[m] = 'X'; });
    if (i % 7 === 0) mesesP[2] = 'RA';
    rows.push(row.concat(mesesP));
    // Registro
    const regRow = ['', id, 'C-' + i, inv, nombre,
      servicios[i % servicios.length], 'Unidad ' + (i % 3 + 1), 'Sala ' + i, 'Donación',
      marcas[i % marcas.length], 'Modelo-' + i, 'SER' + i, 2018 + (i % 5), 5, 'Crítico', 'Operativo', '', 'Trimestral', ''];
    const mesesReg = [];
    for (let m = 0; m < 12; m++) {
      mesesReg.push(mesesP[m] || '');
      mesesReg.push((mesesP[m] === 'X' && m < 3) ? (i % 3 === 0 ? 'Si' : (i % 5 === 0 ? 'C5' : '')) : '');
    }
    regRows.push(regRow.concat(mesesReg));
  }
  pmp.getRange(8, 1, rows.length, rows[0].length).setValues(rows);
  reg.getRange(8, 1, regRows.length, regRows[0].length).setValues(regRows);
  // Pendientes
  const pend = ssObj.getSheetByName(SHEETS.PENDIENTES);
  const today = nowIso_().slice(0, 10);
  for (let i = 0; i < 10; i++) {
    pend.appendRow([uid_(), 'inv:INV' + (1000 + i), 'Revisar accesorio del equipo ' + i, today, today,
      EJECUTORES_DEFAULT[i % EJECUTORES_DEFAULT.length], ['alta','media','baja'][i % 3], 'test',
      'abierto', '[]', '[]']);
  }
  invalidateCache_();
  Logger.log('seedTestData OK');
}

/* =====================================================================
 * Util
 * ===================================================================== */
function parseJson_(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}
