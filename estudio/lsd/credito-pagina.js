/**
 * La pantalla de consulta del crédito fiscal por cargas sociales.
 *
 * Acá no se calcula nada: lo que se muestra lo grabó el armador cuando armó el
 * libro de ese período, que es el momento en que están la REM 10 y la provincia
 * de cada trabajador. Esta pantalla lee, muestra y exporta.
 *
 * El registro vive en esta computadora, en el navegador. Es el mismo lugar
 * donde viven los reservorios, y tiene la misma limitación: si se abre en otra
 * máquina, no está. Por eso hay un botón para bajar todo a CSV y dejarlo en la
 * carpeta del cliente, que es el respaldo de verdad.
 */

const $ = (id) => document.getElementById(id);
const escapar = (t) =>
  String(t === null || t === undefined ? '' : t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

/** 202609 -> 09/2026, que es como se lee un período. */
function comoPeriodo(p) {
  const s = String(p || '');
  return s.length === 6 ? `${s.slice(4)}/${s.slice(0, 4)}` : s;
}

function comoFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR');
}

let empleadorElegido = '';

function pintarEmpleadores() {
  const lista = $('empleador');
  const empresas = empleadoresConRegistro();

  if (!empresas.length) {
    $('sin-nada').hidden = false;
    $('caja-empleador').hidden = true;
    $('contenido').innerHTML = '';
    return;
  }
  $('sin-nada').hidden = true;
  $('caja-empleador').hidden = false;

  lista.innerHTML = empresas
    .map(
      (e) =>
        `<option value="${escapar(e.cuit)}">${escapar(e.empleador)} — ${
          e.periodos} ${e.periodos === 1 ? 'período' : 'períodos'}</option>`
    )
    .join('');

  if (!empleadorElegido || !empresas.some((e) => e.cuit === empleadorElegido)) {
    empleadorElegido = empresas[0].cuit;
  }
  lista.value = empleadorElegido;
  pintarHistorial();
}

function pintarHistorial() {
  const { empleador, periodos } = historialDe(empleadorElegido);
  if (!periodos.length) {
    $('contenido').innerHTML = '<p class="nota">Este empleador no tiene períodos guardados.</p>';
    return;
  }

  const totalGeneral = periodos.reduce((a, p) => a + (p.total || 0), 0);

  const filas = periodos
    .map(
      (p) => `<tr>
        <td><strong>${escapar(comoPeriodo(p.periodo))}</strong></td>
        <td class="numero">${p.trabajadores}</td>
        <td class="numero"><strong>$ ${comoPesos(p.total)}</strong></td>
        <td>${p.sinCalcular
          ? `<span class="marca mal">${p.sinCalcular} sin calcular</span>`
          : '<span class="marca bien">completo</span>'}</td>
        <td class="chico">${escapar(comoFecha(p.calculadoEl))}</td>
        <td class="acciones">
          <button class="suave chico" data-ver="${escapar(p.periodo)}">Ver el detalle</button>
          <button class="borrar chico" data-borrar="${escapar(p.periodo)}">Borrar</button>
        </td>
      </tr>`
    )
    .join('');

  $('contenido').innerHTML = `
    <h2>${escapar(empleador)}</h2>
    <div class="aviso bien">
      <strong>$ ${comoPesos(totalGeneral)}</strong> de crédito fiscal en
      ${periodos.length} ${periodos.length === 1 ? 'período' : 'períodos'} guardados.
    </div>
    <div class="tabla-marco">
      <table>
        <thead><tr>
          <th>Período</th><th class="numero">Trabajadores</th>
          <th class="numero">Crédito</th><th>Estado</th>
          <th>Calculado</th><th></th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="botonera">
      <button id="bajar-csv">Bajar todo a CSV</button>
    </div>
    <div id="detalle"></div>`;

  $('contenido')
    .querySelectorAll('[data-ver]')
    .forEach((b) => b.addEventListener('click', () => pintarDetalle(b.dataset.ver)));
  $('contenido')
    .querySelectorAll('[data-borrar]')
    .forEach((b) => b.addEventListener('click', () => borrar(b.dataset.borrar)));
  $('bajar-csv').addEventListener('click', bajarCsv);
}

/**
 * Borra lo guardado de un período.
 *
 * Existe porque un período se puede haber guardado mal: con la planilla
 * equivocada, con el período mal escrito en la cabecera, o antes de corregir el
 * reservorio. Volver a armarlo bien lo pisa solo —el último armado manda—, pero
 * un período que directamente no va no tenía forma de salir, y un crédito de
 * más es plata que se toma y no corresponde.
 *
 * Se pregunta antes, y se pregunta con los números a la vista: acá no hay
 * papelera ni deshacer, esto borra de esta computadora y listo.
 */
function borrar(periodo) {
  const { periodos } = historialDe(empleadorElegido);
  const p = periodos.find((x) => x.periodo === periodo);
  if (!p) return;

  const seguro = window.confirm(
    `Borrar el crédito de ${comoPeriodo(periodo)}: $ ${comoPesos(p.total)} sobre ` +
      `${p.trabajadores} ${p.trabajadores === 1 ? 'trabajador' : 'trabajadores'}.\n\n` +
      'Se borra de esta computadora y no se puede deshacer. Si el período estaba mal, ' +
      'volver a armarlo en el armador lo vuelve a guardar bien.'
  );
  if (!seguro) return;

  borrarPeriodo(empleadorElegido, periodo);
  /* Se repinta todo desde el registro: si al empleador no le queda ningún
     período, tiene que desaparecer de la lista, y el detalle que estaba abierto
     puede ser justamente el que se borró. */
  pintarEmpleadores();
}

function pintarDetalle(periodo) {
  const { periodos } = historialDe(empleadorElegido);
  const p = periodos.find((x) => x.periodo === periodo);
  if (!p) return;

  const filas = p.filas
    .map(
      (f) => `<tr>
        <td><code>${escapar(f.cuil)}</code><br>${escapar(f.nombre)}</td>
        <td>${escapar(f.provincia)}${
          f.origen === 'empresa'
            ? '<br><span class="chico">cargada para toda la empresa</span>'
            : ''
        }</td>
        <td class="numero">$ ${comoPesos(f.rem10)}</td>
        <td class="numero">${String(f.alicuota).replace('.', ',')} %</td>
        <td class="numero"><strong>$ ${comoPesos(f.credito)}</strong></td>
      </tr>`
    )
    .join('');

  const faltan = p.faltantes.length
    ? `<div class="aviso ojo">
        <strong>Sin calcular: ${p.faltantes.length}.</strong> No entran al total.
        <div class="detalle">${p.faltantes
          .map((f) => `<p>${escapar(f.nombre)} (${escapar(f.cuil)}): ${escapar(f.motivo)}.</p>`)
          .join('')}</div>
      </div>`
    : '';

  $('detalle').innerHTML = `
    <h3>El detalle de ${escapar(comoPeriodo(periodo))}</h3>
    ${faltan}
    <div class="tabla-marco">
      <table>
        <thead><tr>
          <th>Trabajador</th><th>Provincia</th>
          <th class="numero">REM 10</th><th class="numero">Alícuota</th>
          <th class="numero">Crédito</th>
        </tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr>
          <th colspan="4">Total del período</th>
          <th class="numero">$ ${comoPesos(p.total)}</th>
        </tr></tfoot>
      </table>
    </div>`;
  $('detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* El respaldo que sobrevive al navegador: una fila por trabajador y período. */
function bajarCsv() {
  const { empleador, periodos } = historialDe(empleadorElegido);
  const lineas = [
    ['CUIT', 'Empleador', 'Periodo', 'CUIL', 'Trabajador', 'Provincia',
     'Origen de la provincia', 'REM 10', 'Alicuota %', 'Credito fiscal'].join(';'),
  ];
  /* Con coma decimal, que es como lo lee el Excel de acá. */
  const pesos = (c) => (c / 100).toFixed(2).replace('.', ',');

  for (const p of periodos) {
    for (const f of p.filas) {
      lineas.push([
        empleadorElegido, empleador, p.periodo, f.cuil, f.nombre, f.provincia,
        f.origen === 'empresa' ? 'reservorio de la empresa' : 'reservorio de empleados',
        pesos(f.rem10), String(f.alicuota).replace('.', ','), pesos(f.credito),
      ].join(';'));
    }
  }

  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Credito fiscal ${empleadorElegido}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('empleador').addEventListener('change', () => {
  empleadorElegido = $('empleador').value;
  $('detalle') && ($('detalle').innerHTML = '');
  pintarHistorial();
});

pintarEmpleadores();
