/**
 * M&A Capital — Bitácora Ejecutiva, Tablero de Notas y Pulso Comercial
 * Servidor en Google Apps Script. La base de datos es esta misma Hoja de cálculo de Google.
 *
 * Cómo se instala (una sola vez):
 *   1. Crea una Hoja de cálculo de Google nueva (por ejemplo «M&A · Bitácora y Ventas»).
 *   2. Extensiones › Apps Script. Borra lo que haya y pega TODO este archivo. Guarda.
 *   3. Implementar › Nueva implementación › tipo «Aplicación web».
 *        Ejecutar como: Yo        ·        Quién tiene acceso: Cualquier usuario
 *      Autoriza los permisos que pide Google (es tu propia cuenta).
 *   4. Copia la URL que termina en /exec y pégala en el dashboard (o envíala para dejarla fija).
 *   5. (Opcional) Ejecuta una vez la función instalarAvisoDiario para el correo de cada mañana.
 *
 * Seguridad: aunque la URL sea pública, cada pedido trae la sesión del dashboard M&A.
 * El script la verifica con Supabase y solo responde a usuarios con el módulo correspondiente.
 */

const SB_URL  = '__SUPABASE_URL__';
const SB_ANON = '__SUPABASE_ANON__';

const TABLAS = {
  Tareas: ['id','titulo','descripcion','responsable','proyecto','prioridad','estado','avance','inicio','limite','obstaculo','impacto','creado','creado_por','actualizado','actualizado_por','cerrado','etiquetas','recurrencia','depende_de','enlace','aprobador','aprobacion'],
  Notas:  ['id','titulo','texto','color','fijada','tarea_id','autor','creado','actualizado','tablero','etiquetas','recordar','orden'],
  Comentarios: ['id','tarea_id','texto','autor','creado'],
  Historial: ['fecha','usuario','tarea_id','titulo','cambio'],
  Ventas: ['Fecha','Producto','Categoria','Cliente','Vendedor','Cantidad','Precio_unitario','Costo_unitario'],
  Gastos: ['Fecha','Concepto','Categoria','Tipo','Monto'],
  Stock:  ['Producto','Categoria','Stock','Stock_minimo','Costo_unitario','Precio_venta']
};

/* ---------------- entrada ---------------- */
// Los pedidos llegan por GET (?q=JSON, más fiable: no se pierde en las redirecciones de Google) o por POST.
function doGet(e) {
  if (e && e.parameter && e.parameter.q) return procesar_(e.parameter.q);
  return ContentService.createTextOutput('M&A Capital · servicio de Bitácora Ejecutiva y Pulso Comercial activo.');
}

function doPost(e) {
  return procesar_((e && e.postData && e.postData.contents) || '{}');
}

function procesar_(texto) {
  let r;
  try {
    const b = JSON.parse(texto || '{}');
    const cache = CacheService.getScriptCache();               // revisar las pestañas solo cada 10 minutos (más rápido)
    if (!cache.get('hoja_ok')) { prepararHoja_(); cache.put('hoja_ok', '1', 600); }
    const yo = usuario_(b.token);
    const [area, accion] = String(b.accion || '').split('.');
    if (area === 'bitacora') { exigir_(yo, b.token, 'bitacora'); r = bitacora_(accion, b, yo); }
    else if (area === 'ventas') { exigir_(yo, b.token, 'ventas'); r = ventas_(accion, b, yo); }
    else if (area === 'notas') { exigir_(yo, b.token, 'notas'); r = notas_(accion, b, yo); }
    else if (area === 'info') r = { email: yo.email, hoja: SpreadsheetApp.getActive().getUrl() };
    else throw new Error('Acción desconocida');
    r = { ok: true, datos: r };
  } catch (err) {
    r = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- sesión del dashboard (Supabase) ---------------- */
function usuario_(token) {
  if (!token) throw new Error('Falta la sesión: entra desde el dashboard M&A.');
  const cache = CacheService.getScriptCache(), k = 'u_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  const c = cache.get(k); if (c) return JSON.parse(c);
  const res = UrlFetchApp.fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('La sesión venció: vuelve a entrar al dashboard.');
  const u = { email: String(JSON.parse(res.getContentText()).email || '').toLowerCase() };
  cache.put(k, JSON.stringify(u), 300);
  return u;
}
function exigir_(yo, token, modulo) {
  const cache = CacheService.getScriptCache(), k = 'm_' + modulo + '_' + yo.email;
  if (cache.get(k) === '1') return;
  const res = UrlFetchApp.fetch(SB_URL + '/rest/v1/rpc/ma_tiene_modulo', { method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ p_modulo: modulo }), headers: { apikey: SB_ANON, Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200 || res.getContentText().trim() !== 'true') throw new Error('Tu usuario no tiene acceso a este módulo.');
  cache.put(k, '1', 300);
}

/* ---------------- hoja ---------------- */
function prepararHoja_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(TABLAS).forEach(n => {
    let h = ss.getSheetByName(n);
    if (!h) { h = ss.insertSheet(n); h.getRange(1, 1, 1, TABLAS[n].length).setValues([TABLAS[n]]).setFontWeight('bold').setBackground('#1b3a5c').setFontColor('#ffffff'); h.setFrozenRows(1); return; }
    const cab = h.getLastColumn() ? h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String) : [];
    const faltan = TABLAS[n].filter(c => cab.indexOf(c) < 0);
    if (faltan.length) h.getRange(1, cab.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold').setBackground('#1b3a5c').setFontColor('#ffffff');
  });
  const hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > Object.keys(TABLAS).length && hoja1.getLastRow() === 0) ss.deleteSheet(hoja1);
}
function zona_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
function valor_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, zona_(), v.getHours() || v.getMinutes() ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
  return v;
}
function leer_(nombre) {
  const h = SpreadsheetApp.getActive().getSheetByName(nombre);
  const n = h.getLastRow(); if (n < 2) return [];
  const datos = h.getRange(1, 1, n, h.getLastColumn()).getValues(), cab = datos[0].map(String);
  return datos.slice(1).filter(f => f.some(x => x !== '' && x !== null)).map(f => { const o = {}; cab.forEach((c, i) => { if (c) o[c] = valor_(f[i]); }); return o; });
}
function guardar_(nombre, obj) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const h = SpreadsheetApp.getActive().getSheetByName(nombre), cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
    const col = cab.indexOf('id') + 1;
    const ids = col && h.getLastRow() > 1 ? h.getRange(2, col, h.getLastRow() - 1, 1).getValues().map(x => String(x[0])) : [];
    const fila = cab.map(c => obj[c] == null ? '' : obj[c]);
    const i = ids.indexOf(String(obj.id));
    if (i >= 0) h.getRange(i + 2, 1, 1, cab.length).setValues([fila]); else h.appendRow(fila);
    return obj;
  } finally { lock.releaseLock(); }
}
function borrar_(nombre, id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const h = SpreadsheetApp.getActive().getSheetByName(nombre);
    if (h.getLastRow() < 2) return false;
    const col = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String).indexOf('id') + 1;
    const ids = h.getRange(2, col, h.getLastRow() - 1, 1).getValues().map(x => String(x[0]));
    const i = ids.indexOf(String(id)); if (i < 0) return false;
    h.deleteRow(i + 2); return true;
  } finally { lock.releaseLock(); }
}
const ahora_ = () => Utilities.formatDate(new Date(), zona_(), "yyyy-MM-dd'T'HH:mm:ss");
function anotar_(yo, t, cambio) {
  SpreadsheetApp.getActive().getSheetByName('Historial').appendRow([ahora_(), yo.email, t.id, t.titulo, cambio]);
}
function mover_(fecha, rec) {
  if (!fecha) return '';
  const d = new Date(String(fecha).slice(0, 10) + 'T12:00:00');
  if (rec === 'Semanal') d.setDate(d.getDate() + 7);
  else if (rec === 'Quincenal') d.setDate(d.getDate() + 14);
  else if (rec === 'Mensual') d.setMonth(d.getMonth() + 1);
  else if (rec === 'Trimestral') d.setMonth(d.getMonth() + 3);
  else return fecha;
  return Utilities.formatDate(d, zona_(), 'yyyy-MM-dd');
}

/* ---------------- Bitácora Ejecutiva ---------------- */
function bitacora_(accion, b, yo) {
  if (accion === 'listar') return { tareas: leer_('Tareas'), notas: leer_('Notas'), comentarios: leer_('Comentarios'), historial: leer_('Historial').slice(-400), hoja: SpreadsheetApp.getActive().getUrl() };
  if (accion === 'guardarTarea') {
    const t = Object.assign({}, b.tarea || {});
    if (!t.titulo) throw new Error('La tarea necesita un título.');
    const antes = t.id ? leer_('Tareas').filter(x => String(x.id) === String(t.id))[0] : null;
    // la página manda su propio id: si Google reintenta el pedido, se actualiza la misma fila (nunca duplica)
    if (!t.id) t.id = Utilities.getUuid();
    if (antes) { if (!t.creado) t.creado = antes.creado; if (!t.creado_por) t.creado_por = antes.creado_por; }
    else if (!t.creado) { t.creado = ahora_(); t.creado_por = yo.email; }
    t.actualizado = ahora_(); t.actualizado_por = yo.email;
    if (t.estado === 'Hecha' && !t.cerrado) t.cerrado = ahora_().slice(0, 10);
    if (t.estado !== 'Hecha') t.cerrado = '';
    guardar_('Tareas', t);
    if (!antes) anotar_(yo, t, 'Creó la tarea');
    else {
      if (antes.estado !== t.estado) anotar_(yo, t, 'Estado: ' + (antes.estado || '—') + ' → ' + t.estado + (t.estado === 'Bloqueada' && t.obstaculo ? ' (' + t.obstaculo + ')' : ''));
      if (String(antes.responsable || '') !== String(t.responsable || '')) anotar_(yo, t, 'Responsable: ' + (t.responsable || '—'));
      if (String(antes.aprobacion || '') !== String(t.aprobacion || '') && t.aprobacion) anotar_(yo, t, 'Aprobación: ' + t.aprobacion);
    }
    // tarea recurrente: al cerrarla se crea la siguiente
    let siguiente = null;
    if (t.estado === 'Hecha' && (!antes || antes.estado !== 'Hecha') && t.recurrencia && t.recurrencia !== 'No') {
      siguiente = Object.assign({}, t, { id: Utilities.getUuid(), estado: 'Pendiente', avance: 0, cerrado: '', obstaculo: '', impacto: '', aprobacion: t.aprobador ? 'Pendiente' : '',
        inicio: mover_(t.inicio, t.recurrencia), limite: mover_(t.limite, t.recurrencia), creado: ahora_(), creado_por: yo.email });
      guardar_('Tareas', siguiente); anotar_(yo, siguiente, 'Creada automáticamente (' + t.recurrencia.toLowerCase() + ')');
    }
    return siguiente ? Object.assign({}, t, { _siguiente: siguiente }) : t;
  }
  if (accion === 'comentar') {
    if (!b.tarea_id || !String(b.texto || '').trim()) throw new Error('Escribe el comentario.');
    return guardar_('Comentarios', { id: b.id || Utilities.getUuid(), tarea_id: b.tarea_id, texto: String(b.texto).trim(), autor: yo.email, creado: ahora_() });
  }
  if (accion === 'borrarComentario') return borrar_('Comentarios', b.id);
  if (accion === 'borrarTarea') return borrar_('Tareas', b.id);
  if (accion === 'guardarNota') {
    const n = Object.assign({}, b.nota || {});
    if (!n.id) n.id = Utilities.getUuid();
    const ya = leer_('Notas').filter(x => String(x.id) === String(n.id))[0];
    if (ya) { if (!n.creado) n.creado = ya.creado; if (!n.autor) n.autor = ya.autor; }
    if (!n.creado) n.creado = ahora_();
    if (!n.autor) n.autor = yo.email;
    n.actualizado = ahora_();
    return guardar_('Notas', n);
  }
  if (accion === 'borrarNota') return borrar_('Notas', b.id);
  throw new Error('Acción desconocida');
}

/* ---------------- Tablero de Notas ---------------- */
function notas_(accion, b, yo) {
  if (accion === 'listar') return { notas: leer_('Notas'), tareas: leer_('Tareas').filter(t => t.estado !== 'Hecha').map(t => ({ id: t.id, titulo: t.titulo })), hoja: SpreadsheetApp.getActive().getUrl() };
  if (accion === 'guardar') return bitacora_('guardarNota', b, yo);
  if (accion === 'crearTarea') return bitacora_('guardarTarea', { tarea: b.tarea }, yo);   // «convertir en tarea» y pendientes del acta
  if (accion === 'borrar') return borrar_('Notas', b.id);
  throw new Error('Acción desconocida');
}

/* ---------------- Pulso Comercial ---------------- */
function ventas_(accion, b, yo) {
  if (accion === 'datos') return { ventas: leer_('Ventas'), gastos: leer_('Gastos'), stock: leer_('Stock'), hoja: SpreadsheetApp.getActive().getUrl() };
  throw new Error('Acción desconocida');
}

/* ---------------- correo de cada mañana (opcional) ---------------- */
function instalarAvisoDiario() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'avisoDiario').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('avisoDiario').timeBased().everyDays(1).atHour(7).create();
}
function avisoDiario() {
  prepararHoja_();
  const hoy = Utilities.formatDate(new Date(), zona_(), 'yyyy-MM-dd');
  const abiertas = leer_('Tareas').filter(t => t.estado !== 'Hecha' && String(t.responsable || '').indexOf('@') > 0);
  const porPersona = {}, aprobar = {}, recordar = {};
  abiertas.forEach(t => { const l = String(t.limite || ''); if ((l && l <= hoy) || t.estado === 'Bloqueada') (porPersona[t.responsable] = porPersona[t.responsable] || []).push(t); });
  leer_('Tareas').forEach(t => { if (t.aprobacion === 'Pendiente' && String(t.aprobador || '').indexOf('@') > 0) (aprobar[t.aprobador] = aprobar[t.aprobador] || []).push(t); });
  leer_('Notas').forEach(n => { if (String(n.recordar || '').slice(0, 10) === hoy && String(n.autor || '').indexOf('@') > 0) (recordar[n.autor] = recordar[n.autor] || []).push(n); });
  Object.keys(aprobar).concat(Object.keys(recordar)).forEach(e => { porPersona[e] = porPersona[e] || []; });
  Object.keys(porPersona).forEach(email => {
    const ts = porPersona[email].sort((a, b) => String(a.limite).localeCompare(String(b.limite)));
    const extra = (aprobar[email] || []).map(t => `<li>Por aprobar: <b>${t.titulo}</b>${t.responsable ? ' (' + t.responsable + ')' : ''}</li>`).join('') +
      (recordar[email] || []).map(n => `<li>Recordatorio: <b>${n.titulo || ''}</b> ${n.texto || ''}</li>`).join('');
    const filas = ts.map(t => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${t.titulo}</b>${t.proyecto ? '<br><span style="color:#888">' + t.proyecto + '</span>' : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${t.limite || '—'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${t.estado === 'Bloqueada' ? 'Bloqueada: ' + (t.obstaculo || '') : (t.limite < hoy ? 'Vencida' : 'Vence hoy')}</td></tr>`).join('');
    MailApp.sendEmail({ to: email, subject: `Bitácora Ejecutiva · pendientes de hoy`,
      htmlBody: `<div style="font-family:Arial,sans-serif;color:#0f1c2e"><h2 style="color:#1b3a5c;margin:0 0 8px">Buenos días</h2>${ts.length ? '<p>Estas tareas están vencidas, vencen hoy o están bloqueadas:</p>' : ''}
        <table style="border-collapse:collapse;font-size:14px">${filas}</table>${extra ? '<ul style="font-size:14px">' + extra + '</ul>' : ''}<p style="color:#888;font-size:12px">M&amp;A Capital · Bitácora Ejecutiva</p></div>` });
  });
}

/* ---------------- datos de ejemplo (opcional) ----------------
 * cargarEjemplo: llena Ventas, Gastos y Stock (últimos 22 meses, para comparar año contra año), Tareas, Notas, Comentarios e
 * Historial con datos INVENTADOS para ver los dashboards funcionando. Cada fila lleva «(ejemplo)»
 * (y en tareas, notas y comentarios un id que empieza con «ej-»).
 * borrarEjemplos: quita solo esas filas y deja intactos los datos reales. */
function agregarFilas_(nombre, objs) {
  if (!objs.length) return;
  const h = SpreadsheetApp.getActive().getSheetByName(nombre), cab = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  h.getRange(h.getLastRow() + 1, 1, objs.length, cab.length).setValues(objs.map(o => cab.map(c => o[c] == null ? '' : o[c])));
}
function cargarEjemplo() {
  prepararHoja_(); borrarEjemplos();
  let sem = 7; const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647, el = a => a[Math.floor(rnd() * a.length)];
  const E = ' (ejemplo)', z = zona_(), f = d => Utilities.formatDate(d, z, 'yyyy-MM-dd');
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  // producto, categoría, precio, costo, peso (frecuencia), unidades máx.
  const P = [['Consultoría financiera','Servicios',1200,420,5,1],['Avalúo de inmueble','Servicios',650,210,7,1],['Valuación de portafolio','Servicios',4800,1900,1,1],
             ['Due diligence','Legal',2400,900,3,1],['Redacción de contrato','Legal',380,90,6,1],['Estructuración de fideicomiso','Legal',3500,1300,1,1],
             ['Gestión de alquileres','Inmobiliario',520,180,6,1],['Corretaje de venta','Inmobiliario',2900,800,1,1],
             ['Administración de fondos','Inversión',3100,1250,2,1],['Asesoría tributaria','Servicios',900,300,3,1],
             ['Kits de bienvenida','Comercial',60,35,4,8],['Brochure impreso','Comercial',12,4,3,30]];
  const bolsa = []; P.forEach((p, i) => { for (let k = 0; k < p[4]; k++) bolsa.push(i); });
  const CL = ['Inversiones Alfa','Grupo Beta','Comercial Delta','Fundación Omega','Constructora Sigma','Banco Épsilon','Familia Rivera','Hotelera Kappa','Desarrollos Zeta','Particular'];
  const PESO_CL = [6,5,4,2,4,3,2,3,3,8], bolsaCl = []; PESO_CL.forEach((w, i) => { for (let k = 0; k < w; k++) bolsaCl.push(i); });
  const VE = ['Ana Pérez','Luis Gómez','Carlos Díaz','Omayra Ríos'];
  const ventas = [], porMes = {};
  const DIAS = 660;
  for (let i = DIAS; i >= 0; i--) {
    const d = new Date(hoy.getTime() - i * 864e5), dow = d.getDay();
    if (dow === 0) continue;                                   // domingos sin ventas
    const crec = 0.8 + 0.6 * (DIAS - i) / DIAS, temp = d.getMonth() === 11 ? 1.3 : d.getMonth() === 0 ? 0.8 : 1;
    const n = Math.floor(rnd() * 4.2 * crec * temp * (dow === 6 ? 0.4 : 1));
    for (let k = 0; k < n; k++) {
      const p = P[el(bolsa)], q = 1 + Math.floor(rnd() * p[5]), dto = rnd() < 0.15 ? 0.9 : 1;
      ventas.push([f(d), p[0] + E, p[1], CL[el(bolsaCl)], el(VE), q, Math.round(p[2] * dto), p[3]]);
      const m = f(d).slice(0, 7); porMes[m] = (porMes[m] || 0) + q * p[2] * dto;
    }
  }
  const gastos = [];
  for (let m = 22; m >= 0; m--) {
    const dia = n => new Date(hoy.getFullYear(), hoy.getMonth() - m, n, 12), mes = f(dia(1)).slice(0, 7);
    const fijos = [['Alquiler de oficina','Oficina',4200,1],['Planilla','Personal',18500,28],['Cargas sociales','Personal',2300,28],['Software y licencias','Tecnología',900,5],
                   ['Seguros','Administración',650,10],['Contabilidad externa','Administración',800,15],['Internet y telefonía','Tecnología',320,8]];
    if (m <= 5) fijos[1][2] = 19800; else if (m >= 13) { fijos[1][2] = 17200; fijos[0][2] = 3900; }   // ajustes de planilla y alquiler
    fijos.forEach(g => { if (dia(g[3]) <= hoy && dia(g[3]) >= new Date(hoy.getTime() - DIAS * 864e5)) gastos.push([f(dia(g[3])), g[0] + E, g[1], 'Fijo', g[2]]); });
    const varis = [['Comisiones de venta','Comercial',Math.round((porMes[mes] || 0) * 0.05),25],['Publicidad digital','Comercial',600 + Math.round(rnd() * 900),12],
                   ['Viáticos','Operación',300 + Math.round(rnd() * 600),18],['Electricidad','Oficina',420 + Math.round(rnd() * 160),20],['Mensajería y courier','Operación',90 + Math.round(rnd() * 120),22]];
    if (m % 3 === 0) varis.push(['Capacitación','Personal',1200 + Math.round(rnd() * 800),16]);
    if (m === 2 || m === 14) varis.push(['Evento con clientes','Comercial',3800,9]);
    varis.forEach(g => { if (g[2] > 0 && dia(g[3]) <= hoy && dia(g[3]) >= new Date(hoy.getTime() - DIAS * 864e5)) gastos.push([f(dia(g[3])), g[0] + E, g[1], 'Variable', g[2]]); });
  }
  const stock = [['Kits de bienvenida','Comercial',18,25,35,60],['Brochure impreso','Comercial',240,150,4,12],['Agenda corporativa','Comercial',60,20,9,18],
                 ['Papelería corporativa','Insumos',12,20,8,0],['Tóner de impresora','Insumos',3,4,65,0],['Carpetas de cierre','Insumos',140,50,1.2,0],
                 ['Sobres membretados','Insumos',800,300,0.3,0],['Licencias de software','Tecnología',25,5,120,0],['Discos externos','Tecnología',2,3,85,0],['Tarjetas de presentación','Insumos',900,500,0.05,0]]
    .map(s => [s[0] + E].concat(s.slice(1)));
  const ss = SpreadsheetApp.getActive();
  [['Ventas', ventas], ['Gastos', gastos], ['Stock', stock]].forEach(([n, filas]) => {
    if (!filas.length) return; const h = ss.getSheetByName(n);
    h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  });
  const b = ejemploBitacora_(f, hoy);
  return { ventas: ventas.length, gastos: gastos.length, stock: stock.length, tareas: b.tareas, notas: b.notas };
}
function ejemploBitacora_(f, hoy) {
  const E = ' (ejemplo)', d = n => f(new Date(hoy.getTime() + n * 864e5)), t = (n, h) => d(n) + 'T' + (h || '09:00') + ':00';
  const P = ['Ana Pérez','Luis Gómez','Omayra Ríos','Carlos Díaz','Mariela Vargas','Jorge Castillo'];
  const X = ['Cierre mensual Pantera','Due diligence Finca 45678','Renovación de contratos','Auditoría 2026','Lanzamiento Fondo II','Data Room inversionistas'];
  // titulo, resp, proyecto, prioridad, estado, avance, inicio, límite, obstáculo, impacto, etiquetas, recurrencia, depende (índice), aprobador, aprobación
  const T = [
    ['Conciliar bancos del mes',1,0,'Alta','En curso',60,-2,3,'','','banco, cierre','Mensual','','',''],
    ['Enviar balance a gerencia',0,0,'Crítica','Pendiente',0,0,1,'','','cierre','Mensual',0,'Martina','Pendiente'],
    ['Revisar certificado del Registro Público',2,1,'Alta','Bloqueada',40,-6,-1,'Falta el certificado actualizado del Registro','Alto','legal','No','','',''],
    ['Redactar promesa de compraventa',2,1,'Media','En curso',30,-3,6,'','','legal','No',2,'Martina','Pendiente'],
    ['Llamar a inquilino Local 3',3,2,'Media','Pendiente',0,1,4,'','','inquilinos','No','','',''],
    ['Preparar adenda de renta',3,2,'Alta','Bloqueada',20,-8,2,'Esperando respuesta del inquilino','Medio','inquilinos','No',4,'',''],
    ['Reunión con auditores',0,3,'Media','Hecha',100,-10,-6,'','','auditoría','No','','Martina','Aprobada'],
    ['Entregar anexos de cuentas por cobrar',1,3,'Alta','Hecha',100,-14,-9,'','','auditoría','No','','',''],
    ['Cargar avalúos al Data Room',4,5,'Media','En curso',50,-5,5,'','','data room','No','','',''],
    ['Actualizar flujo de caja',1,0,'Crítica','En curso',80,-4,-1,'','','banco','Semanal','','',''],
    ['Firmar paz y salvo municipal',2,1,'Media','Hecha',100,-20,-15,'','','legal','No','','',''],
    ['Revisar vencimientos de poderes',2,2,'Baja','Pendiente',0,3,20,'','','legal','Trimestral','','',''],
    ['Borrador del memorando de oferta',5,4,'Crítica','En curso',45,-12,8,'','','fondo II','No','','Martina','Cambios pedidos'],
    ['Definir estructura de comisiones del fondo',5,4,'Alta','Hecha',100,-25,-12,'','','fondo II','No','','Martina','Aprobada'],
    ['Opinión legal del fondo',2,4,'Alta','Bloqueada',35,-9,4,'El regulador no ha respondido la consulta','Alto','fondo II, legal','No',13,'',''],
    ['Presentación para inversionistas',4,4,'Alta','Pendiente',0,2,14,'','','fondo II','No',12,'Martina','Pendiente'],
    ['Ordenar carpetas del Data Room',4,5,'Media','Hecha',100,-18,-11,'','','data room','No','','',''],
    ['Subir estados financieros auditados',1,5,'Alta','Pendiente',0,5,10,'','','data room','No',7,'',''],
    ['Control de accesos del Data Room',3,5,'Media','En curso',70,-6,1,'','','data room','No','','',''],
    ['Renovar contrato Bodega 7',3,2,'Alta','Hecha',100,-30,-21,'','','inquilinos','No','','Martina','Aprobada'],
    ['Cobro de morosos de septiembre',0,2,'Crítica','En curso',55,-15,-3,'','','cobros','No','','',''],
    ['Informe de ocupación',4,0,'Media','Hecha',100,-8,-4,'','','informes','Mensual','','',''],
    ['Cierre de nómina',1,0,'Alta','Hecha',100,-6,-2,'','','planilla','Quincenal','','',''],
    ['Inspección técnica Finca 45678',3,1,'Media','Pendiente',0,6,18,'','','','No','','',''],
    ['Contestar requerimientos de auditoría',0,3,'Alta','En curso',40,-3,7,'','','auditoría','No','','',''],
    ['Carta de gerencia de auditoría',5,3,'Media','Pendiente',0,10,30,'','','auditoría','No',24,'Martina',''],
    ['Actualizar política de inversiones',5,4,'Baja','Pendiente',0,15,45,'','','políticas','No','','',''],
    ['Revisión de seguros de propiedades',4,2,'Media','Bloqueada',25,-12,-2,'La aseguradora no envía la cotización','Bajo','seguros','No','','',''],
    ['Reporte trimestral a inversionistas',4,0,'Alta','Hecha',100,-40,-33,'','','informes','Trimestral','','Martina','Aprobada'],
    ['Depuración de proveedores',1,3,'Baja','Hecha',100,-50,-44,'','','','No','','',''],
    ['Plan de mantenimiento 2027',3,2,'Media','Pendiente',0,20,50,'','','','No','','',''],
    ['Conciliación de depósitos de garantía',0,2,'Alta','Hecha',100,-26,-19,'','','inquilinos, banco','No','','','']];
  const tareas = T.map((x, i) => ({ id: 'ej-t' + i, titulo: x[0] + E, descripcion: '', responsable: P[x[1]], proyecto: X[x[2]], prioridad: x[3], estado: x[4], avance: x[5],
    inicio: d(x[6]), limite: d(x[7]), obstaculo: x[8], impacto: x[9], creado: t(x[6]), creado_por: 'ejemplo', actualizado: t(x[4] === 'Bloqueada' ? -3 : -1), actualizado_por: 'ejemplo',
    cerrado: x[4] === 'Hecha' ? d(x[7] - (i % 3)) : '', etiquetas: x[10], recurrencia: x[11], depende_de: x[12] === '' ? '' : 'ej-t' + x[12], enlace: '', aprobador: x[13], aprobacion: x[14] }));
  agregarFilas_('Tareas', tareas);
  // titulo, texto, color, fijada, tarea, columna, etiquetas, recordar (días), autor
  const N = [
    ['Acuerdos reunión lunes','[x] Cerrar conciliaciones antes del jueves\n[ ] Pedir certificado RP actualizado\n[ ] Revisar flujo con Martina','amarillo','true','','Acuerdos','reunión','',0],
    ['Idea','Agregar al informe mensual el comparativo de cap rate por activo.','azul','false','','Ideas','informes','',1],
    ['Pendiente con el banco','Confirmar fecha de firma de la carta de aprobación.','rosa','false','ej-t2','Recordatorios','banco',0,2],
    ['Llamar al avaluador','Por la Finca 45678.','naranja','false','ej-t23','Por hacer','',2,3],
    ['Para el cierre','[ ] Estados de cuenta\n[ ] Planilla\n[x] Facturas de proveedores','verde','false','ej-t0','Por hacer','cierre','',1],
    ['Visita a Local 3','El inquilino pidió revisar el aire acondicionado antes de renovar.','lila','false','ej-t4','Recordatorios','inquilinos',-1,3],
    ['Fondo II — pendientes','[x] Estructura de comisiones\n[ ] Opinión legal\n[ ] Memorando de oferta\n[ ] Presentación','amarillo','true','ej-t12','Acuerdos','fondo II','',5],
    ['Idea','Tablero de ocupación por propiedad con alerta cuando baje del 85%.','azul','false','','Ideas','informes','',4],
    ['Comité de inversiones','Se aprobó revisar la tasa de descuento de las valuaciones cada trimestre.','verde','false','','Decisiones','comité','',5],
    ['Decisión','Los contratos nuevos se firman con adenda de mantenimiento incluida.','verde','false','','Decisiones','legal, inquilinos','',2],
    ['Cumpleaños del equipo','Jorge — 28 de este mes. Coordinar detalle.','rosa','false','','Recordatorios','equipo',9,0],
    ['Seguros','Pedir otra cotización si la aseguradora no responde esta semana.','naranja','false','ej-t27','Por hacer','seguros',3,4],
    ['Lecciones de la auditoría','• Anexos listos una semana antes\n• Un responsable por cada requerimiento','lila','false','ej-t24','Ideas','auditoría','',0],
    ['Data Room','[x] Carpetas ordenadas\n[ ] Estados auditados\n[ ] Accesos por inversionista','verde','false','ej-t8','Por hacer','data room','',4],
    ['Llamada con inversionista','Pidió el reporte trimestral en inglés.','amarillo','false','','Recordatorios','inversionistas',1,5]];
  const notas = N.map((x, i) => ({ id: 'ej-n' + i, titulo: x[0] + E, texto: x[1], color: x[2], fijada: x[3], tarea_id: x[4], autor: P[x[8]], creado: t(-i - 1), actualizado: t(-Math.floor(i / 2)),
    tablero: x[5], etiquetas: x[6], recordar: x[7] === '' ? '' : d(x[7]), orden: '' }));
  agregarFilas_('Notas', notas);
  const C = [[0,'Faltan los estados de cuenta del Banco General.',1,-1],[2,'Ya se pidió al Registro, responden el viernes.',2,-2],[1,'¿Lo enviamos antes del comité?',0,0],
    [12,'Martina pidió ajustar la sección de riesgos.',5,-2],[12,'Ajustado, lo vuelvo a enviar mañana.',5,-1],[14,'Llamé al regulador, quedaron en responder esta semana.',2,-1],
    [5,'El inquilino pide 30 días más para decidir.',3,-4],[20,'Quedan 3 inquilinos por cobrar.',0,-2],[27,'Segunda llamada a la aseguradora sin respuesta.',4,-1],
    [8,'Subidos 18 de 24 avalúos.',4,0],[18,'Accesos creados para 5 inversionistas.',3,-1],[24,'Faltan 4 requerimientos por contestar.',0,-1]];
  agregarFilas_('Comentarios', C.map((c, i) => ({ id: 'ej-c' + i, tarea_id: 'ej-t' + c[0], texto: c[1] + E, autor: P[c[2]], creado: t(c[3], '1' + (i % 8) + ':15') })));
  const H = [];
  T.forEach((x, i) => {
    H.push([t(x[6]), P[x[1]], 'ej-t' + i, x[0] + E, 'Creó la tarea']);
    if (x[4] !== 'Pendiente') H.push([t(x[6] + 1, '10:30'), P[x[1]], 'ej-t' + i, x[0] + E, 'Estado: Pendiente → En curso']);
    if (x[4] === 'Bloqueada') H.push([t(-3, '15:00'), P[x[1]], 'ej-t' + i, x[0] + E, 'Estado: En curso → Bloqueada (' + x[8] + ')']);
    if (x[4] === 'Hecha') H.push([tareas[i].cerrado + 'T16:00:00', P[x[1]], 'ej-t' + i, x[0] + E, 'Estado: En curso → Hecha']);
    if (x[14] === 'Aprobada' || x[14] === 'Cambios pedidos') H.push([t(Math.min(x[7], 0) - 1, '11:00'), 'Martina', 'ej-t' + i, x[0] + E, 'Aprobación: ' + x[14]]);
  });
  H.sort((a, b) => a[0].localeCompare(b[0]));
  const hh = SpreadsheetApp.getActive().getSheetByName('Historial'); hh.getRange(hh.getLastRow() + 1, 1, H.length, 5).setValues(H);
  return { tareas: tareas.length, notas: notas.length };
}
function borrarEjemplos() {
  const ss = SpreadsheetApp.getActive();
  const ej = /\(ejemplo\)\s*$/, id = /^ej-/;
  [['Ventas', 'Producto', ej], ['Gastos', 'Concepto', ej], ['Stock', 'Producto', ej], ['Tareas', 'id', id], ['Notas', 'id', id], ['Comentarios', 'id', id], ['Historial', 'tarea_id', id]].forEach(([n, col, rx]) => {
    const h = ss.getSheetByName(n); if (!h || h.getLastRow() < 2) return;
    const datos = h.getRange(1, 1, h.getLastRow(), h.getLastColumn()).getValues(), c = datos[0].map(String).indexOf(col); if (c < 0) return;
    const quedan = datos.slice(1).filter(f => !rx.test(String(f[c])));
    if (quedan.length === datos.length - 1) return;
    h.getRange(2, 1, datos.length - 1, datos[0].length).clearContent();
    if (quedan.length) h.getRange(2, 1, quedan.length, datos[0].length).setValues(quedan);
  });
}
