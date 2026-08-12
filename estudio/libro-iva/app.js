/**
 * Interfaz del importador. Coordina los pasos: leer la planilla, mapear
 * columnas, resolver los comprobantes dudosos, controlar los importes
 * y escribir los TXT.
 */

const TABLAS = {
  ALICUOTAS, ALICUOTAS_HABITUALES, alicuotaPorTasa,
  resolverTipoComprobante, esNotaDeCredito, resolverTipoDocumento,
};

const estado = {
  planilla: null,        // { hojas }
  hoja: 0,
  encabezados: [],
  filas: [],
  mapa: {},
  columnasAlicuota: [],
  perfil: perfilPorId('generico'),
  perfilAutomatico: true,   // false una vez que se elige a mano
  comprobantes: [],
  ajustes: [],
  libro: 'compras',
  cuit: '',
  config: {
    documentoTipoPorDefecto: '80',
    monedaPorDefecto: 'PES',
    notasCreditoEnPositivo: true,
    cuitCorredor: '',
    denominacionCorredor: '',
    ivaComision: 0,
  },
  periodoImputacion: '',   // "2026-01": nombra el archivo que junta todo
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-01" -> "enero de 2026" */
function nombreDePeriodo(periodo) {
  const m = String(periodo || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodo || '';
  return `${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

const $ = (id) => document.getElementById(id);
const escapar = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Pasos plegables ----------
 * Cada paso se abre o se cierra haciendo clic en su título. El programa
 * sugiere cuáles conviene dejar abiertos —los que piden atención—, pero en
 * cuanto el usuario abre o cierra uno a mano, esa decisión manda: no se le
 * vuelve a mover solo. El resumen gris del título cuenta qué hay adentro para
 * no tener que abrirlo. */

const plegables = {};        // id del paso -> { boton, cuerpo, resumen }
const abiertosAMano = new Set();

function prepararPlegables() {
  for (const seccion of document.querySelectorAll('.paso')) {
    const boton = seccion.querySelector('.cabecera');
    const cuerpo = seccion.querySelector('.cuerpo');
    if (!boton || !cuerpo) continue;

    plegables[seccion.id] = { boton, cuerpo, resumen: $(`resumen-${seccion.id}`) };
    boton.addEventListener('click', () => {
      abiertosAMano.add(seccion.id);
      plegar(seccion.id, cuerpo.hidden);
    });
  }
}

function plegar(id, abierto) {
  const p = plegables[id];
  if (!p) return;
  p.cuerpo.hidden = !abierto;
  p.boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
}

/** Estado sugerido: solo se aplica si el usuario no tocó ese paso. */
function sugerir(id, abierto) {
  if (!abiertosAMano.has(id)) plegar(id, abierto);
}

/** El resumen gris del título, con el color de la señal si corresponde. */
function resumir(id, texto, clase) {
  const p = plegables[id];
  if (!p || !p.resumen) return;
  p.resumen.textContent = texto || '';
  p.resumen.className = 'aclaracion' + (clase ? ' ' + clase : '');
}

/* ---------- Paso 1: cargar la planilla ---------- */

function prepararCarga() {
  const zona = $('zona-carga');
  const input = $('archivo');

  zona.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => { if (input.files[0]) cargar(input.files[0]); });

  for (const evento of ['dragenter', 'dragover']) {
    zona.addEventListener(evento, (e) => { e.preventDefault(); zona.classList.add('encima'); });
  }
  for (const evento of ['dragleave', 'drop']) {
    zona.addEventListener(evento, (e) => { e.preventDefault(); zona.classList.remove('encima'); });
  }
  zona.addEventListener('drop', (e) => {
    const archivo = e.dataTransfer.files[0];
    if (archivo) cargar(archivo);
  });
}

async function cargar(archivo) {
  const resumen = $('resumen-archivo');
  resumen.innerHTML = '<div class="cartel ojo">Leyendo la planilla…</div>';
  try {
    estado.planilla = await leerPlanilla(archivo);
    estado.nombreArchivo = archivo.name;
    estado.hoja = hojaPreferida(estado.planilla.hojas);

    const selector = $('hoja');
    selector.innerHTML = estado.planilla.hojas
      .map((h, i) => {
        const conDetalle = detalleDeHoja(h).length;
        return `<option value="${i}">${escapar(h.nombre)}` +
          (conDetalle ? ` — con detalle por alícuota` : '') + '</option>';
      }).join('');
    selector.value = String(estado.hoja);

    tomarHoja();
    for (const id of ['paso-config', 'paso-columnas', 'paso-revision', 'paso-control', 'paso-archivos']) {
      $(id).hidden = false;
    }
  } catch (e) {
    resumen.innerHTML = `<div class="cartel mal"><strong>No se pudo leer el archivo</strong>${escapar(e.message)}</div>`;
  }
}

/** Muestra el perfil de origen detectado y permite cambiarlo. */
function pintarPerfil() {
  const sel = $('perfil');
  sel.innerHTML = PERFILES
    .map((p) => `<option value="${p.id}">${escapar(p.nombre)}</option>`).join('');
  sel.value = estado.perfil.id;

  const nota = $('nota-perfil');
  if (estado.perfilAutomatico) {
    nota.textContent = estado.perfilPuntaje
      ? `Reconocido por los encabezados. ${estado.perfil.notas}`
      : 'Ningún perfil reconoció el archivo, así que se usa el genérico.';
  } else {
    nota.textContent = `Elegido a mano. ${estado.perfil.notas}`;
  }
}

/** Las columnas de detalle por alícuota que tiene una hoja, si tiene. */
function detalleDeHoja(hoja) {
  const primera = (hoja.filas || []).find((f) => f && f.some((c) => c != null && String(c).trim() !== ''));
  if (!primera) return [];
  return detectarAlicuotas(primera.map((c) => String(c ?? '')), TABLAS);
}

/**
 * Si alguna hoja trae el detalle abierto por alícuota, esa es la que sirve:
 * evita tener que deducir la descomposición.
 */
function hojaPreferida(hojas) {
  const conDetalle = hojas.findIndex((h) => detalleDeHoja(h).length > 0);
  return conDetalle >= 0 ? conDetalle : 0;
}

/** Toma la hoja elegida, separa encabezados y detecta las columnas. */
function tomarHoja() {
  const hoja = estado.planilla.hojas[estado.hoja];
  const filas = hoja.filas.filter((f) => f && f.some((c) => c != null && String(c).trim() !== ''));
  if (!filas.length) throw new Error('La hoja está vacía.');

  estado.encabezados = filas[0].map((c) => String(c ?? '').trim());
  estado.filas = filas.slice(1);
  estado.columnasAlicuota = detectarAlicuotas(estado.encabezados, TABLAS);

  if (estado.perfilAutomatico) {
    const hallazgo = detectarPerfil(estado.encabezados, normalizarEncabezado);
    estado.perfil = hallazgo.perfil;
    estado.perfilPuntaje = hallazgo.puntaje;
  }
  estado.config.perfil = estado.perfil;
  pintarPerfil();

  estado.mapa = detectarColumnas(
    estado.encabezados,
    indicesDeAlicuotas(estado.columnasAlicuota),
    estado.perfil.sinonimos
  );

  const detalle = estado.columnasAlicuota.length
    ? ` Trae el detalle abierto por alícuota (${estado.columnasAlicuota.map((a) => a.etiqueta).join(', ')}), ` +
      'así que no hay que deducir nada.'
    : ' No trae detalle por alícuota: la descomposición se deduce del neto y el IVA.';

  $('resumen-archivo').innerHTML =
    `<div class="cartel ${estado.columnasAlicuota.length ? 'bien' : 'ojo'}">` +
    `<strong>${escapar(estado.nombreArchivo)}</strong>` +
    `${estado.filas.length} filas en la hoja «${escapar(hoja.nombre)}», ` +
    `${estado.encabezados.filter(Boolean).length} columnas.${detalle}</div>`;

  recalcular();
}

/* ---------- Paso 2: configuración ---------- */

function prepararConfig() {
  $('moneda').innerHTML = MONEDAS
    .map((m) => `<option value="${m.codigo}">${escapar(m.descripcion)}</option>`).join('');
  $('moneda').value = 'PES';

  $('hoja').addEventListener('change', (e) => { estado.hoja = Number(e.target.value); tomarHoja(); });
  $('perfil').addEventListener('change', (e) => {
    estado.perfil = perfilPorId(e.target.value);
    estado.perfilAutomatico = false;
    tomarHoja();
  });
  $('libro').addEventListener('change', (e) => { estado.libro = e.target.value; recalcular(); });
  $('moneda').addEventListener('change', (e) => { estado.config.monedaPorDefecto = e.target.value; recalcular(); });
  $('nc-positivo').addEventListener('change', (e) => {
    estado.config.notasCreditoEnPositivo = e.target.checked; recalcular();
  });
  $('periodo-imputacion').addEventListener('input', (e) => {
    estado.periodoImputacion = e.target.value;
    pintarArchivos();
  });

  $('cuit').addEventListener('input', (e) => {
    const limpio = e.target.value.replace(/\D/g, '');
    estado.cuit = limpio;
    const valido = !limpio || cuitValido(limpio);
    e.target.classList.toggle('invalido', !valido);
    $('nota-cuit').textContent = !limpio
      ? 'Se usa solo para nombrar los archivos.'
      : (valido ? 'CUIT válido.' : 'El dígito verificador no da.');
    pintarArchivos();
    acomodarPasos();
  });
}

/* ---------- Paso 3: columnas ---------- */

/* Qué campos se muestran y en qué orden, según el libro. */
const CAMPOS_VISIBLES = {
  comunes: [
    ['fecha', 'Fecha del comprobante', true],
    ['tipo', 'Tipo de comprobante', true],
    ['puntoVenta', 'Punto de venta', true],
    ['numero', 'Número', true],
    ['documentoNro', 'CUIT / documento', true],
    ['documentoTipo', 'Tipo de documento', false],
    ['denominacion', 'Razón social', true],
    ['neto', 'Neto gravado', true],
    ['iva', 'IVA', true],
    ['total', 'Importe total', true],
    ['noGravado', 'No gravado', false],
    ['exento', 'Exento', false],
    ['percIibb', 'Percepción Ingresos Brutos', false],
    ['percMunicipales', 'Percepción municipal', false],
    ['impInternos', 'Impuestos internos', false],
    ['otrosTributos', 'Otros tributos', false],
    ['moneda', 'Moneda', false],
    ['tipoCambio', 'Tipo de cambio', false],
  ],
  compras: [
    ['despacho', 'Despacho de importación', false],
    ['percIva', 'Percepción de IVA', false],
    ['percNacionales', 'Percepción impuestos nacionales', false],
    ['creditoComputable', 'Crédito fiscal computable', false],
  ],
  ventas: [
    ['numeroHasta', 'Número hasta', false],
    ['percNacionales', 'Percepción impuestos nacionales', false],
    ['fechaVencimiento', 'Fecha de vencimiento o pago', false],
  ],
};

function camposDelLibro() {
  return CAMPOS_VISIBLES.comunes.concat(CAMPOS_VISIBLES[estado.libro]);
}

/** Valor de una celda para mostrar de muestra, sin la parafernalia de Date. */
function paraMostrar(valor) {
  if (valor == null) return '';
  if (valor instanceof Date) {
    return [
      String(valor.getUTCDate()).padStart(2, '0'),
      String(valor.getUTCMonth() + 1).padStart(2, '0'),
      valor.getUTCFullYear(),
    ].join('/');
  }
  return String(valor);
}

function pintarColumnas() {
  const opciones = ['<option value="">— sin asignar —</option>'].concat(
    estado.encabezados.map((h, i) =>
      `<option value="${i}">${escapar(h || `columna ${i + 1}`)}</option>`)
  ).join('');

  let html = '<div class="tabla-scroll"><table><thead><tr>' +
    '<th scope="col">Campo de ARCA</th><th scope="col">Columna de la planilla</th>' +
    '<th scope="col">Primer valor</th></tr></thead><tbody>';

  for (const [campo, etiqueta, obligatorio] of camposDelLibro()) {
    const indice = estado.mapa[campo];
    const muestra = indice != null && estado.filas.length
      ? paraMostrar(estado.filas[0][indice]) : '';
    const falta = obligatorio && indice == null;

    html += '<tr>';
    html += `<th scope="row">${escapar(etiqueta)}` +
      (obligatorio ? ' <span class="aviso" title="obligatorio">•</span>' : '') + '</th>';
    html += `<td><select data-campo="${campo}" ${falta ? 'class="invalido"' : ''}>${opciones}</select></td>`;
    html += `<td class="mono">${escapar(muestra.length > 40 ? muestra.slice(0, 40) + '…' : muestra)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  if (estado.columnasAlicuota.length) {
    html += '<div class="tabla-scroll" style="margin-top:1.2rem"><table>';
    html += '<caption>Detalle por alícuota que trae la planilla</caption>';
    html += '<thead><tr><th scope="col">Alícuota</th><th scope="col">Código ARCA</th>' +
      '<th scope="col">Columna del neto</th><th scope="col">Columna del IVA</th></tr></thead><tbody>';
    for (const a of estado.columnasAlicuota) {
      html += `<tr><th scope="row">${a.etiqueta}</th><td class="mono">${a.codigo}</td>`;
      html += `<td>${escapar(estado.encabezados[a.colNeto])}</td>`;
      html += `<td>${escapar(estado.encabezados[a.colIva])}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }

  const tomadas = indicesDeAlicuotas(estado.columnasAlicuota);
  const sinUsar = estado.encabezados
    .map((h, i) => ({ h, i }))
    .filter((c) => c.h && !Object.values(estado.mapa).includes(c.i) && !tomadas.has(c.i));
  if (sinUsar.length) {
    html += `<p class="nota" style="margin-top:.8rem;font-size:.84rem;opacity:.75">` +
      `Columnas que no se usan: ${sinUsar.map((c) => escapar(c.h)).join(', ')}.</p>`;
  }

  const cont = $('columnas');
  cont.innerHTML = html;

  for (const sel of cont.querySelectorAll('select[data-campo]')) {
    sel.value = estado.mapa[sel.dataset.campo] ?? '';
    sel.addEventListener('change', (e) => {
      const campo = e.target.dataset.campo;
      if (e.target.value === '') delete estado.mapa[campo];
      else estado.mapa[campo] = Number(e.target.value);
      recalcular();
    });
  }
}

/* ---------- Recálculo ---------- */

function recalcular() {
  estado.comprobantes = normalizarComprobantes(
    estado.filas, estado.mapa, estado.config, TABLAS, estado.columnasAlicuota
  );
  estado.ajustes = cuadrar(estado.comprobantes);
  pintarColumnas();
  pintarRevision();
  pintarControl();
  pintarArchivos();
  acomodarPasos();
}

/**
 * Deja abiertos los pasos que piden atención y cierra los que están en orden,
 * y le pone a cada título un resumen de lo que hay adentro. Se llama después
 * de cada recálculo; los pasos que el usuario abrió o cerró él no se tocan.
 */
function acomodarPasos() {
  /* 1. La planilla: una vez leída, lo único que importa es qué se leyó. */
  if (estado.planilla) {
    resumir('paso-archivo',
      `${estado.nombreArchivo} · ${estado.filas.length} filas` +
      (estado.columnasAlicuota.length ? ' · con detalle por alícuota' : ''));
    sugerir('paso-archivo', false);
  }

  /* 2. Qué libro y de quién. Queda abierto: el CUIT hay que escribirlo. */
  resumir('paso-config',
    (estado.libro === 'compras' ? 'Compras' : 'Ventas') +
    (estado.cuit ? ` · CUIT ${estado.cuit}` : ' · sin CUIT'));

  /* 3. Las columnas: solo se abre si falta asignar algo obligatorio. */
  const faltan = camposDelLibro()
    .filter(([campo, , obligatorio]) => obligatorio && estado.mapa[campo] == null);
  resumir('paso-columnas',
    faltan.length
      ? (faltan.length === 1
        ? 'Falta asignar un campo obligatorio'
        : `Faltan asignar ${faltan.length} campos obligatorios`)
      : `${Object.keys(estado.mapa).length} columnas reconocidas`,
    faltan.length ? 'aviso' : '');
  sugerir('paso-columnas', faltan.length > 0);

  /* 4. Lo que hay que revisar. */
  const rev = estado.revision || { pendientes: 0, errores: 0 };
  const partes = [];
  if (rev.errores) partes.push(`${rev.errores} con datos que no sirven`);
  if (rev.pendientes) partes.push(`${rev.pendientes} por confirmar`);
  if (estado.ajustes.length && !partes.length) partes.push(`${estado.ajustes.length} redondeos ajustados`);
  resumir('paso-revision',
    partes.length ? partes.join(' · ') : 'No queda nada por revisar',
    rev.errores ? 'mal' : (rev.pendientes ? 'aviso' : (partes.length ? '' : 'bien')));
  sugerir('paso-revision', rev.errores > 0 || rev.pendientes > 0);

  /* 5. Control de importes: cerrado mientras dé cero, que es lo esperable. */
  const ctrl = estado.control || { sinExplicar: 0, descuadre: 0 };
  const cierra = ctrl.sinExplicar === 0 && ctrl.descuadre === 0;
  resumir('paso-control',
    cierra
      ? (estado.ajustes.length ? 'Cierra, con centavos de redondeo' : 'Cierra: la diferencia da cero')
      : 'Hay diferencias que no cierran',
    cierra ? 'bien' : 'mal');
  sugerir('paso-control', !cierra);

  /* 6. Los archivos: es lo que se viene a buscar, queda siempre abierto. */
  const arch = estado.archivos || { archivos: 0, comprobantes: 0 };
  resumir('paso-archivos',
    arch.archivos
      ? `${arch.archivos} archivos · ${arch.comprobantes} comprobantes`
      : 'No hay nada para escribir',
    arch.archivos ? '' : 'mal');
  sugerir('paso-archivos', true);
}

/** Comprobantes que no se pueden escribir todavía. */
function trabados() {
  return estado.comprobantes.filter((c) => c.problemas.length || c.alicuotas.estado === 'sin_resolver');
}

/* ---------- Paso 4: revisión ---------- */

function pintarRevision() {
  const cont = $('revision');
  const conError = estado.comprobantes.filter((c) => c.problemas.length);
  const pendientes = estado.comprobantes.filter(
    (c) => !c.problemas.length && (c.alicuotas.estado === 'sugerida' || c.alicuotas.estado === 'sin_resolver')
  );

  let html = '';

  if (conError.length) {
    html += `<div class="cartel mal"><strong>${conError.length} comprobante${conError.length > 1 ? 's' : ''} con datos que no sirven</strong>`;
    html += 'Hay que corregirlos en la planilla o reasignar la columna. Ninguno se va a escribir en el archivo.<ul>';
    for (const c of conError.slice(0, 12)) {
      html += `<li>Fila ${c.filaPlanilla}${c.denominacion ? ' — ' + escapar(c.denominacion) : ''}: ${escapar(c.problemas[0].mensaje)}</li>`;
    }
    if (conError.length > 12) html += `<li>… y ${conError.length - 12} más.</li>`;
    html += '</ul></div>';
  }

  if (estado.ajustes.length) {
    const suma = estado.ajustes.reduce((s, a) => s + Math.abs(a.centavos), 0);
    html += `<div class="cartel ojo"><strong>${estado.ajustes.length} comprobantes traían diferencias de redondeo</strong>` +
      `Suman ${pesos(suma)} en total y se ajustaron para que cada comprobante cierre contra su importe total. ` +
      `El detalle está en el control de importes.</div>`;
  }

  if (!pendientes.length && !conError.length) {
    html += '<div class="cartel bien"><strong>No queda nada por revisar</strong>' +
      (estado.columnasAlicuota.length
        ? 'Las alícuotas salen del detalle de la planilla y el neto y el IVA de cada comprobante cierran contra sus totales.'
        : 'Todos los comprobantes cierran con una alícuota exacta.') +
      '</div>';
  }

  for (const c of pendientes) html += tarjetaRevision(c);

  cont.innerHTML = html;
  estado.revision = { pendientes: pendientes.length, errores: conError.length };

  for (const tarjeta of cont.querySelectorAll('.revision')) engancharRevision(tarjeta);
}

function tarjetaRevision(c) {
  const clase = c.alicuotas.estado === 'sin_resolver' ? 'trabada'
    : (c.confirmado ? 'resuelta' : 'pendiente');
  const efectiva = c.neto ? (c.iva / c.neto * 100).toFixed(2) : '0,00';

  let html = `<article class="revision ${clase}" data-indice="${c.indice}">`;
  html += `<h3>${escapar(c.denominacion || 'Sin razón social')} ` +
    `<span class="etiqueta ${c.alicuotas.estado}">${c.alicuotas.estado === 'sugerida' ? 'sugerido' : 'sin resolver'}</span></h3>`;
  html += `<p class="meta">Fila ${c.filaPlanilla} · ${escapar(c.fecha || '')} · ` +
    `${escapar(tipoComprobantePorCodigo(c.tipo)?.descripcion || '')} ${escapar(c.puntoVenta)}-${escapar(c.numero)}<br>` +
    `Neto <b>${pesos(c.neto)}</b> · IVA <b>${pesos(c.iva)}</b> · alícuota efectiva <b>${efectiva}%</b></p>`;

  const alternativas = c.alicuotas.alternativas || [];
  if (alternativas.length) {
    html += '<div class="opciones">';
    alternativas.forEach((alt, i) => {
      const texto = alt.lineas
        .map((l) => `${alicuotaPorCodigo(l.codigo).etiqueta} sobre ${pesos(l.netoCentavos)} → IVA ${pesos(l.ivaCentavos)}`)
        .join('  +  ');
      const elegida = (c.opcionElegida ?? 0) === i && !c.usaManual;
      html += `<label class="opcion"><input type="radio" name="alt-${c.indice}" value="${i}" ${elegida ? 'checked' : ''}>` +
        `<span>${escapar(texto)}</span></label>`;
    });
    html += `<label class="opcion"><input type="radio" name="alt-${c.indice}" value="manual" ${c.usaManual ? 'checked' : ''}>` +
      '<span>Cargarlo a mano</span></label>';
    html += '</div>';
  } else {
    html += `<div class="cartel mal" style="margin:0 0 .6rem">${escapar(c.alicuotas.detalle)}</div>`;
  }

  /* Carga manual: un neto por alícuota, el IVA se calcula solo. */
  const manualAbierto = c.usaManual || !alternativas.length;
  html += `<div class="manual" ${manualAbierto ? '' : 'hidden'}>`;
  html += '<table><thead><tr><th scope="col">Alícuota</th><th scope="col">Neto gravado</th>' +
    '<th scope="col">IVA calculado</th></tr></thead><tbody>';
  for (const a of ALICUOTAS) {
    const valor = c.manual && c.manual[a.codigo] != null ? pesos(c.manual[a.codigo]) : '';
    html += `<tr><th scope="row">${a.etiqueta}</th>`;
    html += `<td><input type="text" class="num" data-alicuota="${a.codigo}" value="${valor}" placeholder="0,00"></td>`;
    html += `<td class="num" data-iva="${a.codigo}">—</td></tr>`;
  }
  html += '</tbody></table><p class="saldo" data-saldo>—</p></div>';
  html += '</article>';
  return html;
}

function engancharRevision(tarjeta) {
  const indice = Number(tarjeta.dataset.indice);
  const c = estado.comprobantes.find((x) => x.indice === indice);
  if (!c) return;

  const manual = tarjeta.querySelector('.manual');

  for (const radio of tarjeta.querySelectorAll(`input[name="alt-${indice}"]`)) {
    radio.addEventListener('change', () => {
      if (radio.value === 'manual') {
        c.usaManual = true;
        manual.hidden = false;
      } else {
        c.usaManual = false;
        c.opcionElegida = Number(radio.value);
        fijarLineas(c, c.alicuotas.alternativas[c.opcionElegida].lineas);
        c.confirmado = true;
        manual.hidden = true;
        reCuadrar();
      }
      actualizarManual(tarjeta, c);
    });
  }

  for (const input of tarjeta.querySelectorAll('input[data-alicuota]')) {
    input.addEventListener('input', () => {
      c.manual = c.manual || {};
      const v = aCentavos(input.value);
      if (v == null) delete c.manual[input.dataset.alicuota];
      else c.manual[input.dataset.alicuota] = v;
      actualizarManual(tarjeta, c);
    });
  }

  actualizarManual(tarjeta, c);
}

/** Recalcula el IVA de la carga manual y avisa si cierra o no. */
function actualizarManual(tarjeta, c) {
  const saldo = tarjeta.querySelector('[data-saldo]');
  if (!c.usaManual && (c.alicuotas.alternativas || []).length) {
    saldo.textContent = '';
    return;
  }

  const lineas = [];
  let sumaNeto = 0, sumaIva = 0;
  for (const a of ALICUOTAS) {
    const neto = (c.manual && c.manual[a.codigo]) || 0;
    const celda = tarjeta.querySelector(`[data-iva="${a.codigo}"]`);
    if (!neto) { if (celda) celda.textContent = '—'; continue; }
    const iva = Math.round(neto * a.tasa);
    if (celda) celda.textContent = pesos(iva);
    lineas.push({ codigo: a.codigo, netoCentavos: neto, ivaCentavos: iva });
    sumaNeto += neto;
    sumaIva += iva;
  }

  const difNeto = sumaNeto - c.neto;
  const difIva = sumaIva - c.iva;

  if (!lineas.length) {
    saldo.className = 'saldo aviso';
    saldo.textContent = 'Cargá el neto de cada alícuota.';
    return;
  }

  if (difNeto === 0 && difIva === 0) {
    saldo.className = 'saldo ok';
    saldo.textContent = 'Cierra: el neto y el IVA dan exactamente los del comprobante.';
    fijarLineas(c, lineas);
    c.confirmado = true;
    reCuadrar();
  } else {
    saldo.className = 'saldo distinto';
    saldo.textContent =
      `Falta ajustar: neto ${difNeto >= 0 ? '+' : ''}${pesos(difNeto)}, IVA ${difIva >= 0 ? '+' : ''}${pesos(difIva)}.`;
    c.confirmado = false;
  }
}

/**
 * Recalcula el cuadre después de una edición manual, sin volver a normalizar
 * (eso perdería lo que el usuario acaba de resolver). cuadrar() ya vuelve
 * solo al punto de partida, así que se lo puede llamar cuantas veces haga falta.
 */
function reCuadrar() {
  estado.ajustes = cuadrar(estado.comprobantes);
  pintarControl();
  pintarArchivos();
  acomodarPasos();
}

/* ---------- Paso 5: control ---------- */

const FILAS_CONTROL = [
  ['Neto gravado', 'neto'],
  ['IVA', 'iva'],
  ['No gravado', 'noGravado'],
  ['Exento', 'exento'],
  ['Percepciones', 'percepciones'],
  ['Impuestos internos', 'impInternos'],
  ['Otros tributos', 'otrosTributos'],
  ['Importe total', 'total'],
];

function pintarControl() {
  const buenos = comprobantesEscribibles();
  const ctrl = totalesDeControl(buenos);
  const ajusteNeto = estado.ajustes
    .filter((a) => a.destino === 'neto gravado').reduce((s, a) => s + a.centavos, 0);

  let html = '<div class="tabla-scroll"><table>';
  html += '<caption>Todos los comprobantes que se van a escribir</caption>';
  html += '<thead><tr><th scope="col">Concepto</th><th scope="col">Planilla</th>' +
    '<th scope="col">Archivo TXT</th><th scope="col">Diferencia</th></tr></thead><tbody>';

  let sinExplicar = 0;
  for (const [etiqueta, clave] of FILAS_CONTROL) {
    const dif = ctrl.diferencia[clave];
    /* Una diferencia explicada por un ajuste de redondeo no es un error. */
    const explicada = dif !== 0 && clave === 'neto' && dif === ajusteNeto;
    const clase = dif === 0 ? 'cero' : (explicada ? 'aviso' : 'distinto');
    const texto = pesos(dif) + (explicada ? ' (redondeo)' : '');
    if (dif !== 0 && !explicada) sinExplicar++;
    html += `<tr><th scope="row">${etiqueta}</th>`;
    html += `<td class="num">${pesos(ctrl.planilla[clave])}</td>`;
    html += `<td class="num">${pesos(ctrl.archivo[clave])}</td>`;
    html += `<td class="num ${clase}">${texto}</td></tr>`;
  }

  estado.control = { sinExplicar, descuadre: ctrl.archivo.descuadre };

  html += '</tbody><tfoot><tr><th scope="row">Suma de las partes contra el total</th>';
  html += `<td class="num" colspan="2">${pesos(ctrl.archivo.sumaPartes)}</td>`;
  html += `<td class="num ${ctrl.archivo.descuadre === 0 ? 'cero' : 'distinto'}">${pesos(ctrl.archivo.descuadre)}</td>`;
  html += '</tr></tfoot></table></div>';

  const trab = trabados();
  if (trab.length) {
    html += `<div class="cartel mal" style="margin-top:1rem"><strong>${trab.length} comprobantes quedan afuera</strong>` +
      'No se cuentan en estos totales porque todavía no se pueden escribir.</div>';
  }

  if (estado.ajustes.length) {
    html += '<div class="tabla-scroll"><table><caption>Diferencias de redondeo ajustadas</caption>';
    html += '<thead><tr><th scope="col">Fila</th><th scope="col">Proveedor</th>' +
      '<th scope="col">Ajuste</th><th scope="col">Aplicado a</th></tr></thead><tbody>';
    for (const a of estado.ajustes) {
      html += `<tr><td class="num">${a.filaPlanilla}</td><td>${escapar(a.denominacion)}</td>` +
        `<td class="num">${pesos(a.centavos)}</td><td>${a.destino}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }

  html += '<div class="botonera"><button type="button" id="bajar-control">Descargar el control en CSV</button></div>';

  $('control').innerHTML = html;
  $('bajar-control').addEventListener('click', bajarControl);
}

function comprobantesEscribibles() {
  return estado.comprobantes.filter(
    (c) => !c.problemas.length && c.alicuotas.estado !== 'sin_resolver' && c.lineas.length >= 0
  );
}

/* De dónde salió la descomposición por alícuota de cada comprobante. */
const ORIGEN_ALICUOTA = {
  declarada: 'del detalle de la planilla',
  exacta: 'deducida, cierra exacto',
  sugerida: 'deducida, sin confirmar',
  sin_gravado: 'sin importe gravado',
  sin_resolver: 'sin resolver',
};

function bajarControl() {
  const buenos = comprobantesEscribibles();
  const filas = [['Periodo', 'Fila', 'Fecha', 'Tipo', 'Punto de venta', 'Numero', 'CUIT',
    'Razon social', 'Neto gravado', 'IVA', 'Otros tributos', 'Importe total',
    'Alicuotas', 'Estado', 'Ajuste de redondeo']];

  for (const c of buenos) {
    const neto = c.lineas.reduce((s, l) => s + l.netoCentavos, 0);
    const iva = c.lineas.reduce((s, l) => s + l.ivaCentavos, 0);
    filas.push([
      c.periodo, c.filaPlanilla, c.fecha, c.tipo, c.puntoVenta, c.numero, c.documentoNro,
      c.denominacion, pesos(neto), pesos(iva), pesos(c.otrosTributos), pesos(c.total),
      c.lineas.map((l) => alicuotaPorCodigo(l.codigo).etiqueta).join(' + '),
      c.confirmado ? 'confirmado a mano' : ORIGEN_ALICUOTA[c.alicuotas.estado] || c.alicuotas.estado,
      c.ajustado ? pesos(c.ajustado.centavos) + ' en ' + c.ajustado.destino : '',
    ]);
  }

  const csv = filas
    .map((f) => f.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  bajarTexto('﻿' + csv, `control_libro_iva_${estado.libro}.csv`, 'text/csv;charset=utf-8');
}

/* ---------- Paso 6: archivos ---------- */

function pintarArchivos() {
  const cont = $('archivos');
  const buenos = comprobantesEscribibles();

  if (!buenos.length) {
    cont.innerHTML = '<div class="cartel mal"><strong>No hay nada para escribir</strong>' +
      'Revisá el paso anterior.</div>';
    estado.archivos = { archivos: 0, comprobantes: 0 };
    return;
  }

  const grupos = agrupar(buenos);
  estado.archivos = { archivos: grupos.length * 2, comprobantes: buenos.length };
  let html = '';

  const trab = trabados();
  if (trab.length) {
    html += `<div class="cartel ojo"><strong>Quedan ${trab.length} comprobantes sin resolver</strong>` +
      'Los archivos se pueden generar igual, pero sin ellos.</div>';
  }

  for (const g of grupos) {
    let salida;
    try {
      salida = generar(g.comprobantes, estado.libro, estado.config);
    } catch (e) {
      html += `<div class="cartel mal"><strong>${escapar(g.etiqueta)}</strong>${escapar(e.message)}</div>`;
      continue;
    }
    g.salida = salida;

    html += `<div class="periodo${g.combinado ? ' combinado' : ''}">`;
    html += `<span class="nombre">${escapar(g.etiqueta)}</span>`;
    html += `<span class="detalle">${salida.filasCabecera} comprobantes · ${salida.filasAlicuotas} líneas de alícuota · ` +
      `total ${pesos(salida.control.archivo.total)}` +
      (g.combinado ? `<br>${escapar(rangoDeFechas(g.comprobantes))}` : '') +
      `<br><span class="mono">${escapar(nombreArchivo(estado.libro, 'cabecera', g.periodo, estado.cuit))}</span>` +
      `<br><span class="mono">${escapar(nombreArchivo(estado.libro, 'alicuotas', g.periodo, estado.cuit))}</span>` +
      '</span>';
    html += `<span class="acciones">` +
      `<button type="button" class="chico" data-bajar="cabecera" data-grupo="${escapar(g.clave)}">Comprobantes</button>` +
      `<button type="button" class="chico" data-bajar="alicuotas" data-grupo="${escapar(g.clave)}">Alícuotas</button>` +
      '</span></div>';
  }

  const combinado = grupos.find((g) => g.combinado);
  if (combinado) {
    html += estado.periodoImputacion
      ? `<div class="cartel ojo" style="margin-top:1rem"><strong>El archivo con todo junto se imputa a ${escapar(nombreDePeriodo(estado.periodoImputacion))}</strong>` +
        'Cada comprobante conserva su fecha original adentro del archivo: el período es solo el de la presentación en la que los subís.</div>'
      : '<div class="cartel ojo" style="margin-top:1rem"><strong>El archivo con todo junto no tiene período en el nombre</strong>' +
        'Cargá el período arriba si querés identificarlo. El contenido es el mismo con o sin él.</div>';
  }

  const porPeriodo = grupos.filter((g) => !g.combinado);
  html += '<div class="botonera">';
  html += `<button type="button" class="primario" id="bajar-periodos">Descargar los ${porPeriodo.length * 2} de cada período</button>`;
  if (combinado) {
    html += '<button type="button" class="primario" id="bajar-combinado">Descargar los 2 de todo junto</button>';
  }
  html += '<button type="button" id="ver-muestra">Ver una línea de ejemplo</button></div>';
  html += '<div id="muestra"></div>';

  cont.innerHTML = html;
  estado.grupos = grupos;

  for (const b of cont.querySelectorAll('[data-bajar]')) {
    b.addEventListener('click', () => {
      const g = grupos.find((x) => x.clave === b.dataset.grupo);
      bajarArchivo(g, b.dataset.bajar);
    });
  }
  $('bajar-periodos').addEventListener('click', () => bajarTodo(porPeriodo));
  if (combinado) $('bajar-combinado').addEventListener('click', () => bajarTodo([combinado]));
  $('ver-muestra').addEventListener('click', () => verMuestra(grupos));
}

/**
 * Un grupo por período del comprobante, y además uno que los junta a todos.
 * Los dos juegos conviven: se descarga el que haga falta.
 */
function agrupar(comprobantes) {
  const periodos = [...new Set(comprobantes.map((c) => c.periodo))].sort();

  const grupos = periodos.map((p) => ({
    clave: p,
    etiqueta: p,
    periodo: p,
    combinado: false,
    comprobantes: comprobantes.filter((c) => c.periodo === p),
  }));

  /* Con un solo período el combinado sería el mismo archivo. */
  if (periodos.length > 1) {
    const imputado = estado.periodoImputacion;
    grupos.push({
      clave: '__todo__',
      etiqueta: imputado ? nombreDePeriodo(imputado) : 'Todos los períodos',
      periodo: imputado || null,
      combinado: true,
      comprobantes,
    });
  }

  return grupos;
}

/** El rango de fechas que abarca un grupo, para mostrarlo. */
function rangoDeFechas(comprobantes) {
  const fechas = comprobantes.map((c) => c.fecha).filter(Boolean).sort();
  if (!fechas.length) return '';
  const linda = (f) => `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;
  return fechas[0] === fechas[fechas.length - 1]
    ? linda(fechas[0])
    : `del ${linda(fechas[0])} al ${linda(fechas[fechas.length - 1])}`;
}

function bajarArchivo(grupo, cual) {
  const nombre = nombreArchivo(estado.libro, cual, grupo.periodo, estado.cuit);
  bajarTexto(grupo.salida[cual], nombre, 'text/plain;charset=us-ascii');
}

async function bajarTodo(grupos) {
  for (const g of grupos) {
    bajarArchivo(g, 'cabecera');
    await new Promise((r) => setTimeout(r, 250));
    bajarArchivo(g, 'alicuotas');
    await new Promise((r) => setTimeout(r, 250));
  }
}

function bajarTexto(texto, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Muestra la primera línea de cada archivo, con las posiciones marcadas. */
function verMuestra(grupos) {
  const g = grupos[0];
  if (!g || !g.salida) return;
  const cab = g.salida.cabecera.split('\r\n')[0] || '';
  const ali = g.salida.alicuotas.split('\r\n')[0] || '';
  const regla = (n) => {
    let s = '';
    for (let i = 10; i <= n; i += 10) s = s.padEnd(i - String(i).length, '·') + i;
    return s.padEnd(n, '·');
  };

  $('muestra').innerHTML =
    '<div class="tabla-scroll"><pre class="mono">' +
    `<strong>Comprobantes (${cab.length} posiciones)</strong>\n` +
    escapar(regla(cab.length)) + '\n' + escapar(cab) + '\n\n' +
    `<strong>Alícuotas (${ali.length} posiciones)</strong>\n` +
    escapar(regla(ali.length)) + '\n' + escapar(ali) +
    '</pre></div>';
}

/* ---------- Arranque ---------- */

prepararPlegables();
prepararCarga();
prepararConfig();
