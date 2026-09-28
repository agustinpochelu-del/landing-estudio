/**
 * La pantalla del liquidador.
 *
 * Arma las novedades del mes desde el legajo, las deja tocar en una grilla,
 * liquida y muestra los recibos. El cálculo vive en `liquidador.js` y los
 * porcentajes en `empresa.js`: acá no hay ninguna cuenta.
 *
 * Antes esta pantalla pedía un archivo `Novedades <CUIT> <período>.csv` que no
 * existía en ninguna parte: había que escribirlo a mano. Los ocho de Prado los
 * hice yo para reproducir 2026. Ahora las novedades salen del legajo —básico y
 * fecha de ingreso— y se tipea solo lo que cambió.
 */

const $ = (id) => document.getElementById(id);

const estado = {
  cuit: '',
  periodo: '',
  ficha: null,
  padron: null,
  novedades: null,
  liquidacion: null,
  recibosEmitidos: null,
  /* El neto que se quiere para cada CUIL, cuando se lo escribió a mano. Se
     guarda para que el renglón no se borre al repintar. */
  netoObjetivo: {},
  avisosDelLegajo: [],
};

/* ---------- Utilidades de pantalla ---------- */

const pesos = (centavos) =>
  (centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Escapa lo que va adentro del HTML. Los nombres vienen de un archivo. */
const texto = (v) =>
  String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function avisosEn(id, avisos, clase) {
  $(id).innerHTML = avisos && avisos.length
    ? `<div class="aviso ${clase || ''}">${avisos.map((a) => `<div>${texto(a)}</div>`).join('')}</div>`
    : '';
}

/** AAAAMM del mes en curso, que es el que casi siempre se está liquidando. */
function periodoDeHoy() {
  const h = new Date();
  return `${h.getFullYear()}${String(h.getMonth() + 1).padStart(2, '0')}`;
}

const aMesInput = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : '');
const dePeriodoInput = (v) => String(v || '').replace('-', '');

function conectarSoltar(idZona, idInput, alElegir) {
  const zona = $(idZona);
  const input = $(idInput);
  input.addEventListener('change', () => {
    if (input.files && input.files[0]) alElegir(input.files[0]);
  });
  ['dragenter', 'dragover'].forEach((e) =>
    zona.addEventListener(e, (ev) => { ev.preventDefault(); zona.classList.add('encima'); })
  );
  ['dragleave', 'drop'].forEach((e) =>
    zona.addEventListener(e, (ev) => { ev.preventDefault(); zona.classList.remove('encima'); })
  );
  zona.addEventListener('drop', (ev) => {
    const archivo = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (archivo) alElegir(archivo);
  });
}

/** Pasa un archivo a { encabezados, filas }, salteando filas vacías. */
async function filasDe(archivo, nombreHoja) {
  const leido = await leerPlanilla(archivo);
  let filas;
  if (leido && leido.hojas) {
    const hoja = nombreHoja
      ? leido.hojas.find((h) => h.nombre.startsWith(nombreHoja))
      : leido.hojas.slice().sort((a, b) => (b.filas || []).length - (a.filas || []).length)[0];
    filas = hoja ? hoja.filas : [];
  } else {
    filas = leido || [];
  }
  const utiles = filas.filter((f) =>
    f.some((c) => c !== null && c !== undefined && String(c).trim() !== '')
  );
  return { encabezados: utiles[0] || [], filas: utiles.slice(1) };
}

function bajarTexto(nombre, contenido, tipo) {
  const blob = new Blob(['﻿' + contenido], { type: tipo || 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Paso 1: la empresa y el mes ---------- */

function pintarSelectorDeEmpresas() {
  const sel = $('empresa');
  const empresas = empresasConFicha();
  sel.innerHTML = empresas
    .map((e) => `<option value="${texto(e.cuit)}">${texto(e.nombre)} — ${texto(e.cuit)}</option>`)
    .join('');
  if (!estado.cuit && empresas.length) estado.cuit = empresas[0].cuit;
  sel.value = estado.cuit;
}

function pintarFicha() {
  const f = estado.ficha;
  if (!f) {
    $('ficha').innerHTML = '';
    return;
  }
  const { errores, avisos } = controlarFicha(f);
  const pct = (n) => `${(n * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;

  const adicionales = (f.adicionales || [])
    .map((h) => `${texto(h.descripcion)} ${pct(h.porcentaje)}`).join(' · ') || '—';
  const aportes = (f.aportes || [])
    .map((a) => `${texto(a.descripcion)} ${pct(a.alicuota)}`).join(' · ') || '—';
  const tasa = (f.aportes || []).reduce((t, a) => t + (Number(a.alicuota) || 0), 0);

  $('ficha').innerHTML = `
    <div class="ficha-resumen">
      <div><dt>Convenio</dt><dd>${texto(f.convenio || '—')}</dd></div>
      <div><dt>Adicionales</dt><dd>${adicionales}</dd></div>
      <div><dt>Antigüedad</dt><dd>${
        f.antiguedad && f.antiguedad.porcentajePorAnio
          ? `${pct(f.antiguedad.porcentajePorAnio)} por año`
          : 'sin escala: va el % del empleado'
      }</dd></div>
      <div><dt>Aportes</dt><dd>${aportes}</dd></div>
      <div><dt>Suman</dt><dd>${pct(tasa)} — el a cuenta se divide por ${
        (1 - tasa).toLocaleString('es-AR', { minimumFractionDigits: 2 })
      }</dd></div>
      <div><dt>Vacaciones</dt><dd>básico ÷ ${f.divisorVacaciones} (art. 155 LCT)</dd></div>
    </div>
    ${errores.length ? `<div class="aviso mal">${errores.map((e) => `<div>${texto(e)}</div>`).join('')}</div>` : ''}
    ${avisos.length ? `<div class="aviso">${avisos.map((a) => `<div>${texto(a)}</div>`).join('')}</div>` : ''}`;
}

/* ---------- Paso 2: la grilla de novedades ---------- */

/*
 * Las columnas de la grilla. `campo` es la clave de la novedad; `escala` cuánto
 * vale 1 en la pantalla frente a lo que guarda la novedad:
 *
 *   dinero   se tipea en pesos y se guarda en centavos  → 100
 *   días     se tipea y se guarda igual                 → 1
 *   % antig. se tipea 4 y se guarda 0,04                → 0,01
 */
const COLUMNAS_GRILLA = [
  { campo: 'dias', titulo: 'Días', ayuda: 'trab.', corto: true, escala: 1, paso: 1 },
  { campo: 'diasVacaciones', titulo: 'Vac.', ayuda: 'días', corto: true, escala: 1, paso: 1 },
  { campo: 'basico', titulo: 'Sueldo básico', ayuda: 'del legajo', escala: 100, corte: true },
  { campo: 'aniosAntiguedad', titulo: 'Años', ayuda: 'de antig.', corto: true, escala: 1, paso: 1 },
  { campo: 'porcentajeAntiguedad', titulo: '% antig.', ayuda: 'si se pisa', corto: true, escala: 0.01, paso: 0.5 },
  { campo: 'sac', titulo: 'SAC', ayuda: '1 o 2', corto: true, escala: 1, paso: 1, corte: true },
  { campo: 'anr', titulo: 'ANR', ayuda: 'del acuerdo', escala: 100 },
  { campo: 'viaticos', titulo: 'Viáticos', ayuda: 'no se informan', escala: 100 },
  { campo: 'baseAportes', titulo: 'Base de aportes', ayuda: 'solo si se reduce', escala: 100, corte: true },
  { campo: 'aCuentaNeto', titulo: 'A cuenta', ayuda: 'neto', escala: 100 },
  { campo: 'redondeo', titulo: 'Redondeo', ayuda: '', escala: 100 },
];

/** Lo que se muestra en la celda: vacío cuando es cero, para no ensuciar. */
function valorEnPantalla(novedad, col) {
  const bruto = Number(novedad[col.campo]) || 0;
  if (!bruto) return '';
  const v = bruto / col.escala;
  return col.escala === 100
    ? v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(v);
}

/**
 * Lee un número tipeado a la argentina: punto de miles y coma decimal.
 *
 * Las celdas son de texto y no `type="number"` justamente por esto: un campo
 * numérico del navegador espera el punto decimal del inglés y descarta
 * "1.028.447,46" entero, así que la columna del sueldo básico salía vacía
 * aunque el importe estuviera cargado.
 *
 * Devuelve NaN si no se entiende, para no convertir un error de tipeo en un
 * cero que pasa desapercibido.
 */
function aNumero(crudo) {
  const t = String(crudo === null || crudo === undefined ? '' : crudo).trim();
  if (!t) return 0;

  let limpio;
  if (t.indexOf(',') >= 0) {
    /* Con coma, la coma es el decimal y los puntos son de miles. */
    limpio = t.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = t.split('.');
    /* Un solo punto con uno o dos dígitos atrás es un decimal tipeado a la
       inglesa —pasa, porque el teclado numérico tiene punto—. El resto son
       separadores de miles. */
    limpio = partes.length === 2 && partes[1].length <= 2 ? t : partes.join('');
  }

  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
}

function pintarGrilla() {
  const contenedor = $('grilla');
  if (!estado.novedades || !estado.novedades.length) {
    contenedor.innerHTML =
      '<p class="nota">Elegí la empresa y cargá el legajo en el paso 1.</p>';
    $('resumen-novedades').textContent = 'Sin cargar';
    $('bajar-novedades').disabled = true;
    $('bajar-legajo').disabled = true;
    return;
  }

  const porCuil = new Map(
    (estado.liquidacion ? estado.liquidacion.trabajadores : []).map((t) => [t.cuil, t])
  );

  const encabezados = COLUMNAS_GRILLA.map(
    (c) => `<th class="${c.corte ? 'corte' : ''}">${texto(c.titulo)}<small>${texto(c.ayuda)}</small></th>`
  ).join('');

  const filas = estado.novedades.map((n) => {
    const celdas = COLUMNAS_GRILLA.map((c) => {
      /* Los años salen de la fecha de ingreso: es un dato del legajo, no una
         novedad del mes. Se muestra y no se tipea, así nadie lo desincroniza. */
      if (c.campo === 'aniosAntiguedad') {
        return `<td class="calculado ${c.corte ? 'corte' : ''}">${
          n.sinFechaIngreso ? '—' : Number(n.aniosAntiguedad) || 0
        }</td>`;
      }
      return `<td class="${c.corte ? 'corte' : ''}">
        <input type="text" inputmode="decimal" class="${c.corto ? 'corto' : ''}"
          data-cuil="${texto(n.cuil)}" data-campo="${c.campo}"
          value="${valorEnPantalla(n, c)}"
          aria-label="${texto(c.titulo)} de ${texto(n.nombre || n.cuil)}"></td>`;
    }).join('');

    const t = porCuil.get(n.cuil);
    const objetivo = estado.netoObjetivo[n.cuil];
    return `<tr>
      <td class="empleado">
        <div class="n">${texto(n.nombre || n.cuil)}</div>
        <div class="c">${texto(n.cuil)}${n.legajo ? ` · leg. ${texto(n.legajo)}` : ''}</div>
      </td>
      ${celdas}
      <td class="corte">
        <input type="text" inputmode="decimal" class="objetivo" data-cuil="${texto(n.cuil)}"
          data-campo="netoObjetivo"
          value="${objetivo ? pesos(objetivo) : ''}"
          placeholder="${t ? pesos(t.neto) : ''}"
          aria-label="Neto a pagar de ${texto(n.nombre || n.cuil)}"></td>
      <td class="calculado">${t ? pesos(t.neto) : ''}</td>
    </tr>`;
  }).join('');

  const totalNeto = (estado.liquidacion ? estado.liquidacion.trabajadores : [])
    .reduce((s, t) => s + t.neto, 0);

  contenedor.innerHTML = `<table class="novedades">
    <thead><tr>
      <th>Empleado</th>
      ${encabezados}
      <th class="corte">Neto a pagar<small>se puede fijar</small></th>
      <th>Liquidado<small>neto</small></th>
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr>
      <td>${estado.novedades.length} empleados</td>
      <td colspan="${COLUMNAS_GRILLA.length + 1}"></td>
      <td>${pesos(totalNeto)}</td>
    </tr></tfoot>
  </table>`;

  $('resumen-novedades').textContent =
    `${estado.novedades.length} empleados · neto $ ${pesos(totalNeto)}`;
  $('bajar-novedades').disabled = false;
  $('bajar-legajo').disabled = !estado.padron;
}

/**
 * Una celda cambió.
 *
 * No se repinta la grilla entera: se perdería el foco y lo que se está
 * tipeando. Se recalcula, se actualizan los recibos y solo los dos números que
 * la fila muestra al final.
 */
function alCambiarCelda(input) {
  const cuil = input.dataset.cuil;
  const campo = input.dataset.campo;
  const novedad = estado.novedades.find((n) => n.cuil === cuil);
  if (!novedad) return;

  const numero = aNumero(input.value);
  if (!Number.isFinite(numero)) {
    /* Lo que no se entiende no se convierte en cero en silencio: se marca y se
       deja como está hasta que se corrija. */
    input.classList.add('mal-tipeado');
    return;
  }
  input.classList.remove('mal-tipeado');

  if (campo === 'netoObjetivo') {
    /*
     * El neto se fija y el "a cuenta de futuros aumentos" se despeja para
     * llegar. Es la cuenta que hoy se hace a mano en el Excel, y la razón por
     * la que el a cuenta cambia todos los meses.
     */
    const objetivo = Math.round(numero * 100);
    estado.netoObjetivo[cuil] = objetivo || 0;
    novedad.aCuentaNeto = objetivo
      ? aCuentaParaLlegarA(objetivo, Object.assign({}, novedad, { aCuentaNeto: 0 }), estado.ficha)
      : 0;
    liquidar();
    pintarGrilla();
    return;
  }

  const col = COLUMNAS_GRILLA.find((c) => c.campo === campo);
  novedad[campo] = col && col.escala === 100
    ? Math.round(numero * 100)
    : col && col.escala === 0.01
    ? numero / 100
    : numero;

  /* Tocar a mano el a cuenta deja sin sentido el neto fijado. */
  if (campo === 'aCuentaNeto') delete estado.netoObjetivo[cuil];

  /* Si había un neto fijado y cambió otra cosa, se vuelve a despejar el a
     cuenta para que el neto siga cayendo donde se pidió. */
  const objetivo = estado.netoObjetivo[cuil];
  if (objetivo && campo !== 'aCuentaNeto') {
    novedad.aCuentaNeto = aCuentaParaLlegarA(
      objetivo, Object.assign({}, novedad, { aCuentaNeto: 0 }), estado.ficha);
  }

  liquidar();
  refrescarFila(cuil, objetivo && campo !== 'aCuentaNeto');
}

/** Actualiza los números calculados de una fila sin repintar la grilla. */
function refrescarFila(cuil, tambienElACuenta) {
  const t = (estado.liquidacion ? estado.liquidacion.trabajadores : [])
    .find((x) => x.cuil === cuil);
  if (!t) return;
  const fila = document.querySelector(`input[data-cuil="${cuil}"]`);
  const tr = fila && fila.closest('tr');
  if (!tr) return;
  const celdas = tr.querySelectorAll('td.calculado');
  const ultima = celdas[celdas.length - 1];
  if (ultima) ultima.textContent = pesos(t.neto);

  if (tambienElACuenta) {
    const campo = tr.querySelector('input[data-campo="aCuentaNeto"]');
    const novedad = estado.novedades.find((n) => n.cuil === cuil);
    if (campo && novedad && document.activeElement !== campo) {
      campo.value = novedad.aCuentaNeto ? pesos(novedad.aCuentaNeto) : '';
    }
  }

  const total = estado.liquidacion.trabajadores.reduce((s, x) => s + x.neto, 0);
  const pie = document.querySelector('table.novedades tfoot td:last-child');
  if (pie) pie.textContent = pesos(total);
  $('resumen-novedades').textContent =
    `${estado.novedades.length} empleados · neto $ ${pesos(total)}`;
}

/* ---------- Liquidar ---------- */

function liquidar() {
  if (!estado.novedades || !estado.novedades.length || !estado.ficha) {
    estado.liquidacion = null;
    return;
  }
  estado.liquidacion = liquidarPeriodo(estado.novedades, estado.ficha);
  guardarNovedades(estado.cuit, estado.periodo, estado.novedades);
  pintarRecibos();
  pintarConvenio();
  pintarCotejo();
  pintarPlanilla();
  avisosEn('avisos', estado.liquidacion.avisos);
}

/* ---------- Paso 3: el piso del convenio ---------- */

/**
 * El grupo salarial de cada empleado.
 *
 * Primero el que diga el legajo. Si no está, se deduce del sueldo básico
 * cuando coincide EXACTO con un renglón de la escala, que es el caso cuando el
 * empleador paga el básico de convenio. Si paga por encima no se puede deducir,
 * y el control lo dice en vez de suponer el grupo más bajo que entre: eso daría
 * un piso más bajo que el que corresponde y taparía justo lo que hay que ver.
 */
function gruposDeEmpleados(escala) {
  const grupos = {};
  const deducidos = [];
  for (const n of estado.novedades || []) {
    const d = (estado.padron && estado.padron.get(n.cuil)) || {};
    const delLegajo = Number(String(d.grupo || '').replace(/\D/g, ''));
    if (delLegajo && escala && escala.grupos[delLegajo]) {
      grupos[n.cuil] = delLegajo;
      continue;
    }
    const deducido = grupoPorBasico(escala, n.basico);
    if (deducido) {
      grupos[n.cuil] = deducido;
      deducidos.push(`${n.nombre || n.cuil}: grupo ${deducido}`);
    }
  }
  return { grupos, deducidos };
}

function pintarConvenio() {
  const contenedor = $('convenio');
  const convenio = estado.ficha && estado.ficha.convenioId
    ? convenioPorId(estado.ficha.convenioId)
    : null;

  if (!estado.liquidacion || !convenio) {
    contenedor.innerHTML = !convenio
      ? '<p class="nota">Esta empresa no tiene convenio asociado en la ficha: no hay piso contra el cual controlar.</p>'
      : '';
    $('resumen-convenio').textContent = convenio ? 'Sin controlar' : 'Sin convenio';
    return;
  }

  const escala = escalaVigente(convenio, estado.periodo);
  const atraso = mesesDesdeLaUltimaEscala(convenio, estado.periodo);

  /*
   * El aviso de escala vieja es la mitad del trabajo de "mantener el convenio
   * actualizado": no hace falta salir a buscar nada para saber que hay que ir a
   * buscar. Las paritarias de esta actividad vienen cerrando cada dos o tres
   * meses.
   */
  const avisoAtraso = atraso >= 3
    ? `<div class="aviso">La última escala cargada de ${texto(convenio.nombre)} rige desde ` +
      `${texto(ultimoPeriodoConEscala(convenio))}, hace ${atraso} meses. Las paritarias de ` +
      'esta actividad vienen cerrando cada dos o tres meses: buscá el acuerdo nuevo y ' +
      'cargalo en <code>convenios.js</code>, porque el piso puede haber subido.</div>'
    : '';

  if (!escala) {
    contenedor.innerHTML = avisoAtraso +
      `<div class="aviso mal">No hay escala de ${texto(convenio.nombre)} para ` +
      `${texto(estado.periodo)}. El piso no se proyecta desde una escala vieja: ` +
      'una paritaria no se puede adivinar.</div>';
    $('resumen-convenio').textContent = 'sin escala para el período';
    return;
  }

  const { grupos, deducidos } = gruposDeEmpleados(escala);
  const r = controlarContraConvenio(
    estado.liquidacion.trabajadores, estado.novedades, grupos, escala);

  const avisoDeducidos = deducidos.length
    ? `<div class="aviso">El grupo salarial no estaba en el legajo y se dedujo del sueldo ` +
      `básico, que coincide exacto con la escala: ${texto(deducidos.join(' · '))}. ` +
      'Cargalo en el legajo para no depender de esa coincidencia.</div>'
    : '';

  const cabecera =
    `<p class="nota">${texto(convenio.nombre)} · escala vigente desde ` +
    `${texto(escala.desde)} · <em>${texto(escala.fuente)}</em>` +
    (escala.nota ? `<br>${texto(escala.nota)}` : '') + '</p>';

  if (!r.hallazgos.length) {
    contenedor.innerHTML = cabecera + avisoAtraso + avisoDeducidos +
      (r.controlados
        ? `<div class="aviso bien">Los ${r.controlados} empleados controlados están en el ` +
          'convenio o por encima. Ninguno queda por debajo del piso.</div>'
        : '') +
      (r.avisos.length ? `<div class="aviso">${r.avisos.map((a) => `<div>${texto(a)}</div>`).join('')}</div>` : '');
    $('resumen-convenio').textContent = r.controlados
      ? `${r.controlados} controlados · ninguno por debajo`
      : 'no se pudo controlar a nadie';
    return;
  }

  const filas = r.hallazgos.map((h) => `<tr>
    <td>${texto(h.nombre)}<br><small>grupo ${h.grupo} · ${texto(h.detalle)}</small></td>
    <td>${texto(h.concepto)}</td>
    <td class="num">${pesos(h.liquidado)}</td>
    <td class="num">${pesos(h.minimo)}</td>
    <td class="num distinto">${pesos(h.diferencia)}</td>
  </tr>`).join('');

  const total = r.hallazgos.reduce((s, h) => s + h.diferencia, 0);

  contenedor.innerHTML = cabecera + avisoAtraso + avisoDeducidos +
    `<div class="aviso mal">Hay ${r.hallazgos.length} ${
      r.hallazgos.length === 1 ? 'concepto' : 'conceptos'
    } por debajo del convenio, por $ ${pesos(total)} en total.</div>` +
    `<table class="recibo-detalle">
      <thead><tr>
        <th>Empleado</th><th>Concepto</th><th>Liquidado</th><th>Mínimo</th><th>Falta</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>` +
    (r.avisos.length ? `<div class="aviso">${r.avisos.map((a) => `<div>${texto(a)}</div>`).join('')}</div>` : '');

  $('resumen-convenio').textContent =
    `${r.hallazgos.length} por debajo del piso · faltan $ ${pesos(total)}`;
}

/* ---------- Paso 3: los recibos ---------- */

function pintarRecibos() {
  const contenedor = $('recibos');
  if (!estado.liquidacion) {
    contenedor.innerHTML = '';
    $('resumen-recibos').textContent = 'Sin liquidar';
    pintarConvenio();
    return;
  }

  contenedor.innerHTML = estado.liquidacion.trabajadores
    .map((t) => {
      const renglones = t.conceptos
        .map((c) => {
          const col = { remunerativo: '', aporte: '', noRemunerativo: '' };
          col[c.clase] = pesos(c.importe);
          return `<tr>
            <td>${c.codigo ? `${texto(c.codigo)} · ` : ''}${texto(c.descripcion)}${
              c.sinConcepto ? ' <small>(no se informa)</small>' : ''
            }</td>
            <td class="num">${c.cantidad ? (c.cantidad / 100).toLocaleString('es-AR') : ''}</td>
            <td class="num">${col.remunerativo}</td>
            <td class="num">${col.aporte}</td>
            <td class="num">${col.noRemunerativo}</td>
          </tr>`;
        })
        .join('');
      return `<div class="recibo">
        <h3>${texto(t.nombre || t.cuil)}</h3>
        <div class="cuil">${texto(t.cuil)}</div>
        <table class="recibo-detalle">
          <thead><tr>
            <th>Concepto</th><th>Cantidad</th>
            <th>Remuneración</th><th>Descuentos</th><th>No remunerativo</th>
          </tr></thead>
          <tbody>
            ${renglones}
            <tr class="suma">
              <td>Subtotales</td><td></td>
              <td class="num">${pesos(t.remuneracion)}</td>
              <td class="num">${pesos(t.aportes)}</td>
              <td class="num">${pesos(t.noRemunerativo)}</td>
            </tr>
            <tr class="neto">
              <td colspan="4">Neto a pagar</td>
              <td class="num">${pesos(t.neto)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
    })
    .join('');

  const total = estado.liquidacion.trabajadores.reduce((s, t) => s + t.neto, 0);
  $('resumen-recibos').textContent =
    `${estado.liquidacion.trabajadores.length} recibos · neto $ ${pesos(total)}`;
}

/* ---------- Paso 4: cotejo contra el recibo emitido ---------- */

/**
 * Lee los recibos del `Sueldos_MM-AAAA.xlsm`: una hoja por empleado, con el
 * bloque que arranca en "Descripción de Conceptos". Se toma el PRIMER bloque,
 * que es la copia del empleador; abajo está repetida la del empleado.
 */
function leerRecibosEmitidos(libro) {
  const SALTAR = /^(DATOS|Hoja|Conceptos y totales|Gomez)/i;
  const porCuil = new Map();

  for (const hoja of libro.hojas) {
    if (SALTAR.test(hoja.nombre)) continue;
    const filas = hoja.filas || [];
    let cuil = '';
    let inicio = -1;
    for (let i = 0; i < Math.min(filas.length, 30); i++) {
      const fila = filas[i] || [];
      /*
       * El CUIL se busca por su encabezado y se lee de la fila de abajo. Tomar
       * el primer número de once dígitos que aparezca no sirve: la cabecera del
       * recibo trae antes el CUIT del empleador, en la línea "CIIT:", y
       * entonces los cuatro recibos quedaban con el mismo CUIL.
       */
      if (!cuil) {
        const col = fila.findIndex((c) => normalizarEncabezado(c) === 'cuil');
        if (col >= 0) {
          const abajo = filas[i + 1] || [];
          const d = soloDigitos(abajo[col]);
          if (d.length === 11 && cuilValido(d)) cuil = d;
        }
      }
      if (inicio < 0 && String(fila[0] || '').trim().startsWith('Descripci')) inicio = i + 1;
    }
    if (!cuil || inicio < 0) continue;

    const conceptos = [];
    for (let i = inicio; i < filas.length; i++) {
      const fila = filas[i] || [];
      const nombre = String(fila[0] || '').trim();
      if (/^(Observaci|Firma|Recib)/.test(nombre)) break;
      if (!nombre) continue;
      const rem = aCentavos(fila[4]);
      const ded = aCentavos(fila[5]);
      const noRem = aCentavos(fila[6]);
      if (!rem && !ded && !noRem) continue;
      conceptos.push({ descripcion: nombre, remuneracion: rem, aporte: ded, noRemunerativo: noRem });
    }
    if (conceptos.length) {
      porCuil.set(cuil, {
        hoja: hoja.nombre,
        conceptos,
        remuneracion: conceptos.reduce((s, c) => s + c.remuneracion, 0),
        aportes: conceptos.reduce((s, c) => s + c.aporte, 0),
        noRemunerativo: conceptos.reduce((s, c) => s + c.noRemunerativo, 0),
      });
    }
  }
  return porCuil;
}

function pintarCotejo() {
  const contenedor = $('cotejo');
  if (!estado.liquidacion || !estado.recibosEmitidos) {
    contenedor.innerHTML = '<p class="nota">Cargá el recibo emitido acá arriba.</p>';
    $('resumen-cotejo').textContent = 'Opcional';
    return;
  }

  let distintos = 0;
  let cotejados = 0;
  const bloques = estado.liquidacion.trabajadores.map((t) => {
    const emitido = estado.recibosEmitidos.get(t.cuil);
    if (!emitido) {
      return `<div class="recibo"><h3>${texto(t.nombre || t.cuil)}</h3>
        <p class="nota">No está en el archivo de recibos emitidos.</p></div>`;
    }
    cotejados += 1;
    const emitidoNeto = emitido.remuneracion - emitido.aportes + emitido.noRemunerativo;
    const lineas = [
      ['Remuneración', t.remuneracion, emitido.remuneracion],
      ['Descuentos', t.aportes, emitido.aportes],
      ['No remunerativo', t.noRemunerativo, emitido.noRemunerativo],
      ['Neto', t.neto, emitidoNeto],
    ];
    const renglones = lineas
      .map(([que, nuestro, suyo]) => {
        const dif = nuestro - suyo;
        if (dif) distintos += 1;
        return `<tr>
          <td>${que}</td>
          <td class="num">${pesos(nuestro)}</td>
          <td class="num">${pesos(suyo)}</td>
          <td class="num ${dif ? 'distinto' : 'igual'}">${dif ? pesos(dif) : 'coincide'}</td>
        </tr>`;
      })
      .join('');
    return `<div class="recibo">
      <h3>${texto(t.nombre || t.cuil)}</h3>
      <div class="cuil">${texto(t.cuil)} · hoja «${texto(emitido.hoja)}»</div>
      <table class="recibo-detalle">
        <thead><tr><th></th><th>Liquidado acá</th><th>Recibo emitido</th><th>Diferencia</th></tr></thead>
        <tbody>${renglones}</tbody>
      </table>
    </div>`;
  });

  contenedor.innerHTML = bloques.join('');
  /* Sin nadie cotejado no se puede decir que coincide: no se comparó nada. */
  $('resumen-cotejo').textContent = !cotejados
    ? 'no se pudo cotejar ningún empleado'
    : distintos
    ? `${cotejados} cotejados · ${distintos} subtotales con diferencia`
    : `${cotejados} cotejados · todo coincide al centavo`;
}

/* ---------- Paso 5: la planilla para el armador ---------- */

function pintarPlanilla() {
  const boton = $('bajar-planilla');
  if (!estado.liquidacion) {
    boton.disabled = true;
    $('previa-planilla').innerHTML = '';
    $('resumen-planilla').textContent = '';
    return;
  }
  const { encabezados, filas } = estado.liquidacion;
  boton.disabled = false;
  $('resumen-planilla').textContent = `${filas.length} conceptos liquidados`;
  $('previa-planilla').innerHTML = `<table class="recibo-detalle">
    <thead><tr>${encabezados.map((e) => `<th>${texto(e)}</th>`).join('')}</tr></thead>
    <tbody>${filas
      .slice(0, 12)
      .map((f) => `<tr>${f.map((c) => `<td class="num">${c === '' ? '' : texto(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>
    ${filas.length > 12 ? `<p class="nota">Se muestran las primeras 12 de ${filas.length}.</p>` : ''}`;
}

const aCampoCsv = (v) => {
  const t = v === null || v === undefined ? '' : String(v);
  /* Coma decimal, que es lo que espera el lector y lo que abre Excel acá. */
  return /^-?\d+\.\d+$/.test(t) ? t.replace('.', ',') : t;
};

function bajarPlanilla() {
  if (!estado.liquidacion) return;
  const { encabezados, filas } = estado.liquidacion;
  const csv = [encabezados].concat(filas).map((f) => f.map(aCampoCsv).join(';')).join('\r\n') + '\r\n';
  bajarTexto(`Liquidacion ${estado.cuit} ${estado.periodo}.csv`, csv);
}

/**
 * Baja las novedades tal como quedaron en la grilla.
 *
 * Sirve de respaldo de lo que se tipeó y de banco de pruebas: los ocho archivos
 * de 2026 de Prado son eso, y cualquier cambio del liquidador se corre contra
 * ellos.
 */
function bajarNovedades() {
  if (!estado.novedades) return;
  const filas = [ENCABEZADOS_NOVEDADES].concat(estado.novedades.map((n) => [
    n.cuil, n.nombre,
    n.dias || '', n.diasVacaciones || '',
    n.basico ? (n.basico / 100).toFixed(2) : '',
    n.aniosAntiguedad || '',
    n.porcentajeAntiguedad ? (n.porcentajeAntiguedad * 100).toFixed(2) : '',
    n.sac || '',
    n.baseAportes ? (n.baseAportes / 100).toFixed(2) : '',
    n.aCuentaNeto ? (n.aCuentaNeto / 100).toFixed(2) : '',
    n.anr ? (n.anr / 100).toFixed(2) : '',
    n.viaticos ? (n.viaticos / 100).toFixed(2) : '',
    n.redondeo ? (n.redondeo / 100).toFixed(2) : '',
  ]));
  const csv = filas.map((f) => f.map(aCampoCsv).join(';')).join('\r\n') + '\r\n';
  bajarTexto(`Novedades ${estado.cuit} ${estado.periodo}.csv`, csv);
}

/**
 * Baja el legajo con el básico que quedó en la grilla.
 *
 * Es lo que cierra el círculo de la paritaria: se actualiza el básico una vez
 * acá, se baja el legajo, y el mes que viene ya sale con el sueldo nuevo.
 */
function bajarLegajo() {
  if (!estado.padron) return;
  for (const n of estado.novedades || []) {
    const d = estado.padron.get(n.cuil);
    if (d && n.basico) d.basico = (n.basico / 100).toFixed(2);
  }
  guardarPadron(estado.cuit, estado.padron);
  bajarTexto(`Empleados ${estado.cuit}.csv`, csvDePadron(estado.padron));
}

/* ---------- Armar y rearmar ---------- */

/**
 * Arma las novedades del período: las guardadas si ya se trabajó este mes, o
 * unas nuevas desde el legajo.
 *
 * `forzar` las rehace desde el legajo pisando lo guardado. Es el botón
 * «Rehacer desde el legajo», para cuando se actualizó un básico o una fecha de
 * ingreso y se quiere volver a arrancar.
 */
function armarNovedades(forzar) {
  estado.avisosDelLegajo = [];
  if (!estado.ficha || !estado.periodo) {
    estado.novedades = null;
    pintarGrilla();
    return;
  }

  const guardadas = forzar ? null : novedadesGuardadas(estado.cuit, estado.periodo);
  if (guardadas) {
    estado.novedades = guardadas;
    estado.avisosDelLegajo.push(
      `Se recuperaron las novedades de ${estado.periodo} que quedaron guardadas en esta ` +
      'computadora. «Rehacer desde el legajo» las vuelve a armar desde cero.'
    );
  } else if (estado.padron && estado.padron.size) {
    const avisos = [];
    estado.novedades = novedadesDeLegajos(estado.padron, estado.periodo, avisos);
    /* La fecha de ingreso que falta se marca en la novedad para que la grilla
       muestre un guion en vez de un cero, que se confundiría con "sin antigüedad". */
    for (const n of estado.novedades) {
      const d = estado.padron.get(n.cuil) || {};
      n.sinFechaIngreso = !d.fechaIngreso;
      n.legajo = d.legajo || '';
    }
    estado.avisosDelLegajo = avisos;
    estado.netoObjetivo = {};
  } else {
    estado.novedades = null;
    pintarGrilla();
    return;
  }

  /* El legajo tiene el nombre y el número; las novedades guardadas no siempre. */
  if (estado.padron) {
    for (const n of estado.novedades) {
      const d = estado.padron.get(n.cuil) || {};
      if (!n.nombre) n.nombre = d.apellidoNombre || '';
      if (n.legajo === undefined) n.legajo = d.legajo || '';
      if (n.sinFechaIngreso === undefined) n.sinFechaIngreso = !d.fechaIngreso;
    }
  }

  avisosEn('avisos-novedades', estado.avisosDelLegajo);
  liquidar();
  pintarGrilla();
}

async function cambiarEmpresaOPeriodo() {
  estado.cuit = $('empresa').value;
  estado.periodo = dePeriodoInput($('periodo').value);
  estado.ficha = fichaDeEmpresa(estado.cuit);
  estado.recibosEmitidos = null;

  /*
   * El legajo sale de la carpeta `reservorios/` de la aplicación, que es el
   * original; lo guardado en el navegador es una copia y queda de respaldo.
   * Es el mismo criterio que el armador: si el dato es el mismo todos los
   * meses, no tiene que entrar por la pantalla.
   */
  const deLaCarpeta = await legajoDeLaCarpeta(estado.cuit);
  estado.padron = deLaCarpeta || padronGuardado(estado.cuit);

  $('resumen-empresa').textContent = estado.ficha
    ? `${estado.ficha.nombre} · ${estado.periodo}${
        estado.padron ? ` · ${estado.padron.size} empleados` : ' · sin legajo'
      }`
    : 'sin ficha de liquidación';
  $('estado-padron').innerHTML = estado.padron
    ? `<div class="aviso bien">Legajo ${
        deLaCarpeta ? 'de la carpeta de la aplicación' : 'guardado en esta computadora'
      } · ${estado.padron.size} empleados. Soltá el archivo si querés reemplazarlo.</div>`
    : '';

  const tope = topeDelPeriodo(estado.periodo);
  if (!tope) {
    $('estado-padron').innerHTML +=
      `<div class="aviso">No hay tope cargado para ${texto(estado.periodo)}. El liquidador no lo ` +
      `usa, pero el armador sí: la tabla llega hasta ${texto(ultimoPeriodoConTope())}.</div>`;
  }

  pintarFicha();
  armarNovedades(false);
}

/**
 * El legajo de una empresa, sacado de `reservorios/`.
 *
 * Devuelve null si esa empresa no está en la carpeta o el archivo no se puede
 * leer: en los dos casos el que llama cae a lo guardado en el navegador, que
 * es como funcionaba antes.
 */
async function legajoDeLaCarpeta(cuit) {
  if (!cuit) return null;
  try {
    const dela = await reservoriosDeLaCarpeta(cuit);
    if (!dela || !dela.empleados) return null;
    const { encabezados, filas } = await filasDe(dela.empleados);
    const avisos = [];
    const padron = leerPadron(filas, encabezados, avisos);
    if (!padron.size) return null;
    /* Se guarda como caché: la próxima vez entra igual aunque el servidor no
       esté, y el liquidador arranca con el legajo puesto. */
    guardarPadron(cuit, padron);
    return padron;
  } catch (error) {
    return null;
  }
}

/* ---------- Cargar archivos ---------- */

async function cargarPadron(archivo) {
  try {
    const { encabezados, filas } = await filasDe(archivo);
    const avisos = [];
    const padron = leerPadron(filas, encabezados, avisos);
    if (!padron.size) {
      $('estado-padron').innerHTML =
        '<div class="aviso mal">No se reconoció ningún empleado en el archivo.</div>';
      return;
    }
    estado.padron = padron;
    guardarPadron(estado.cuit, padron);

    const sinFecha = Array.from(padron.values()).filter((d) => !d.fechaIngreso).length;
    const sinBasico = Array.from(padron.values()).filter((d) => !d.basico).length;
    const faltantes = [];
    if (sinFecha) {
      faltantes.push(
        `${sinFecha} sin fecha de ingreso: su antigüedad no se puede calcular y hay que ` +
        'cargar el porcentaje a mano.'
      );
    }
    if (sinBasico) {
      faltantes.push(
        `${sinBasico} sin sueldo básico: hay que tipearlo en la grilla. Si lo cargás una vez ` +
        'y bajás el legajo actualizado, el mes que viene ya sale solo.'
      );
    }

    $('estado-padron').innerHTML =
      `<div class="aviso bien">${texto(archivo.name)} · ${padron.size} empleados</div>` +
      (faltantes.length
        ? `<div class="aviso">${faltantes.map((f) => `<div>${texto(f)}</div>`).join('')}</div>`
        : '');
    $('resumen-empresa').textContent =
      `${estado.ficha ? estado.ficha.nombre : estado.cuit} · ${estado.periodo} · ${padron.size} empleados`;

    armarNovedades(true);
  } catch (error) {
    $('estado-padron').innerHTML =
      `<div class="aviso mal">No se pudo leer: ${texto(error.message)}</div>`;
  }
}

async function cargarCotejo(archivo) {
  try {
    const libro = await leerPlanilla(archivo);
    if (!libro || !libro.hojas) throw new Error('hace falta el .xlsm con una hoja por empleado');
    estado.recibosEmitidos = leerRecibosEmitidos(libro);
    $('estado-cotejo').innerHTML = `<div class="aviso bien">
      ${texto(archivo.name)} · ${estado.recibosEmitidos.size} recibos leídos</div>`;
    pintarCotejo();
  } catch (error) {
    $('estado-cotejo').innerHTML =
      `<div class="aviso mal">No se pudo leer: ${texto(error.message)}</div>`;
  }
}

/* ---------- Arranque ---------- */

if (!memoriaDisponible()) {
  $('estado-memoria').innerHTML =
    '<div class="aviso">Este navegador no deja guardar nada en esta computadora ' +
    '—suele pasar en una ventana privada—, así que el legajo y las novedades se ' +
    'pierden al cerrar. Bajá los archivos antes de salir.</div>';
}

$('periodo').value = aMesInput(periodoDeHoy());
pintarSelectorDeEmpresas();

$('empresa').addEventListener('change', cambiarEmpresaOPeriodo);
$('periodo').addEventListener('change', cambiarEmpresaOPeriodo);
$('rehacer').addEventListener('click', () => armarNovedades(true));
$('bajar-planilla').addEventListener('click', bajarPlanilla);
$('bajar-novedades').addEventListener('click', bajarNovedades);
$('bajar-legajo').addEventListener('click', bajarLegajo);

/* Un solo oyente para toda la grilla: se repinta seguido y así no hay que
   volver a enganchar un oyente por celda cada vez. */
$('grilla').addEventListener('change', (ev) => {
  if (ev.target && ev.target.dataset && ev.target.dataset.campo) alCambiarCelda(ev.target);
});

conectarSoltar('soltar-padron', 'archivo-padron', cargarPadron);
conectarSoltar('soltar-cotejo', 'archivo-cotejo', cargarCotejo);

cambiarEmpresaOPeriodo();
