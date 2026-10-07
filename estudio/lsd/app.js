/**
 * La interfaz del armador.
 *
 * Acá no hay reglas de negocio: todo lo que decide qué se escribe en el
 * archivo vive en `sueldos.js`, `registros.js` y `tablas.js`. Este archivo
 * solo junta lo que el usuario carga, se lo pasa al núcleo y muestra el
 * resultado.
 *
 * Los pasos se abren solos cuando piden una acción —columnas sin asignar, un
 * control que no cierra— más el paso 6, que es lo que se viene a buscar.
 */

const estado = {
  parametrizacion: null,
  padron: null,
  nombrePadron: '',
  nombreParametrizacion: '',
  filas: null,
  encabezados: null,
  perfil: null,
  columnas: null,
  sinAsignar: [],
  liquidacion: null,
  hallazgos: [],
  archivo: null,
  /* La configuracion del origen «un recibo por hoja», si la empresa la tiene
     anotada en el reservorio, y el resultado de la ultima conversion. */
  recibos: null,
  conversionRecibos: null,
  /* La provincia de toda la empresa, para el credito del decreto 814. */
  provinciaDeLaEmpresa: '',
};

const $ = (id) => document.getElementById(id);
const escapar = (t) =>
  String(t === null || t === undefined ? '' : t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

/* ---------- Zonas para soltar archivos ---------- */

function conectarSoltar(idZona, idInput, alElegir) {
  const zona = $(idZona);
  const input = $(idInput);

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) alElegir(input.files[0]);
  });

  ['dragenter', 'dragover'].forEach((evento) =>
    zona.addEventListener(evento, (e) => {
      e.preventDefault();
      zona.classList.add('encima');
    })
  );
  ['dragleave', 'drop'].forEach((evento) =>
    zona.addEventListener(evento, (e) => {
      e.preventDefault();
      zona.classList.remove('encima');
    })
  );
  zona.addEventListener('drop', (e) => {
    const archivo = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (archivo) alElegir(archivo);
  });
}

/* ---------- Paso 1: datos de la liquidación ---------- */

/*
 * El período que con más probabilidad se está armando hoy.
 *
 * En los primeros veinte días del mes se está trabajando sobre el mes anterior:
 * la liquidación de agosto se arma en los primeros días de septiembre. Pasado
 * el 20, lo que se arma ya es el mes corriente.
 *
 * Es una sugerencia y nada más. Queda escrita en el campo, a la vista, con el
 * cartelito al lado diciendo cuál eligió, y se pisa escribiendo encima. El
 * período se escribe en el archivo, así que no puede decidirse en silencio.
 */
const DIA_DE_CORTE = 20;

function periodoSugerido(hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (d.getDate() <= DIA_DE_CORTE) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function sugerirPeriodo() {
  const campo = $('periodo');
  if (!campo || campo.value.trim()) return;        // lo escrito manda
  campo.value = periodoSugerido();
  const ayuda = $('ayuda-periodo');
  if (ayuda) {
    ayuda.textContent =
      new Date().getDate() <= DIA_DE_CORTE
        ? 'AAAAMM · sugerido el mes anterior'
        : 'AAAAMM · sugerido el mes corriente';
  }
}

function leerCabecera() {
  return {
    cuit: $('cuit').value,
    periodo: $('periodo').value,
    nroLiquidacion: $('nroLiquidacion').value,
    tipoLiquidacion: $('tipoLiquidacion').value,
    envio: $('envio').value,
    /* Solo se usa cuando la planilla no trae fecha: la de Martín Prado y la
       de Viviana Barbano son hojas de conceptos e importes y nada más. */
    fechaPago: $('fechaPago').value,
    fechaRubrica: $('fechaRubrica').value,
    /*
     * El relleno de estos dos campos no es parte del formato —ARCA recorta—,
     * pero los archivos aceptados de las tres empresas lo escriben así, y
     * conservarlo deja comparar contra el mes anterior sin que la diferencia
     * sea puro espacio. Ver la nota en `generarTxt`.
     */
    anchoLegajo: 10,
    anchoCodigoConcepto: 4,
    /* Las correcciones que la empresa tiene anotadas en el reservorio. */
    consolidar: (estado.correcciones || {}).consolidar || null,
    aportesAlValorCalculado: Boolean((estado.correcciones || {}).aportesAlValorCalculado),
  };
}

/** Los códigos que el estudio decidió no pasar al libro. */
function leerExcluidos() {
  return $('excluidos')
    .value.split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function leerParametros() {
  /*
   * El tope se toma del reservorio según el período, y solo se pisa si se
   * cargó uno a mano. Así no hay que acordarse de actualizarlo cada mes.
   */
  let tope = aCentavos($('topeMes').value);
  if (!tope) {
    const delReservorio = topeDelPeriodo(aPeriodoArca($('periodo').value));
    if (delReservorio) tope = delReservorio.tope;
  }

  /* Las alícuotas van en puntos porcentuales, no en centavos. */
  const porc = (id) => {
    const v = $(id).value.trim().replace(',', '.');
    const n = Number(v);
    return v && Number.isFinite(n) ? n : null;
  };
  const sipa = porc('alicSipa');
  const inssjyp = porc('alicInssjyp');
  const obraSocial = porc('alicOS');

  /* El control corre solo con las tres cargadas: media alícuota no sirve. */
  const alicuotas =
    sipa !== null && inssjyp !== null && obraSocial !== null
      ? { sipa, inssjyp, obraSocial, adherente: porc('alicAdherente') || 0 }
      : null;

  return { topeMes: tope > 0 ? tope : null, alicuotas };
}

function pintarResumenDatos() {
  const c = leerCabecera();
  const periodo = aPeriodoArca(c.periodo);
  if (!c.cuit || !periodo) {
    $('resumen-datos').textContent = 'Sin completar';
    return;
  }
  const tope = leerParametros().topeMes;
  const delReservorio = topeDelPeriodo(periodo);
  const origen = $('topeMes').value.trim()
    ? ' (a mano)'
    : delReservorio
    ? ` (${delReservorio.fuente})`
    : '';
  $('resumen-datos').textContent =
    `CUIT ${c.cuit} · período ${periodo} · liquidación ${c.nroLiquidacion || '1'}` +
    (tope ? ` · tope $ ${comoPesos(tope)}${origen}` : ' · sin tope para ese período');
  pintarOrigenDelTope(periodo, delReservorio);
}

['cuit', 'periodo', 'nroLiquidacion', 'tipoLiquidacion', 'envio', 'topeMes', 'excluidos',
  'alicSipa', 'alicInssjyp', 'alicOS', 'alicAdherente'].forEach((id) =>
  $(id).addEventListener('input', () => {
    if (id === 'cuit') recuperarReservorios();
    pintarResumenDatos();
    recalcular();
  })
);

/* ---------- Los reservorios se recuerdan ---------- */

/*
 * Los dos reservorios se arman una vez por empresa y sirven todos los meses,
 * pero el armador los olvidaba al cerrar la pestaña y había que volver a
 * soltarlos en cada sesión.
 *
 * Eso no era solo incómodo: es lo que hizo que el envío 202609 de Nautical
 * saliera sin el reservorio de empleados, con los diecinueve registros 04 en
 * cero y sin forma de pago, y ARCA lo rechazara entero. El dato estaba —los
 * diecinueve empleados tienen su forma de pago, y coincide con la del archivo
 * que ARCA aceptó en junio—: lo que faltaba era el archivo cargado.
 *
 * Se guardan en esta computadora y en ningún servidor, igual que en el
 * liquidador. El archivo de la carpeta de la empresa sigue siendo el respaldo.
 */
function cuitDeLaPantalla() {
  return soloDigitos($('cuit').value);
}

let ultimoCuitRecuperado = '';

async function recuperarReservorios() {
  const cuit = cuitDeLaPantalla();
  if (cuit.length !== 11 || cuit === ultimoCuitRecuperado) return;
  ultimoCuitRecuperado = cuit;

  /* Primero la carpeta de la aplicación, que es el original. La memoria del
     navegador es una copia de eso, y queda de respaldo para las empresas que
     todavía no tienen su archivo en la carpeta. */
  if (await traerReservoriosDeLaCarpeta(cuit)) return;

  const par = parametrizacionGuardada(cuit);
  const pad = padronGuardado(cuit);
  if (!par && !pad) return;

  const recuperado = [];
  /* Lo que ya está cargado a mano manda: si acaba de soltar un archivo, no se
     lo pisa con lo guardado de antes. */
  if (par && (!estado.parametrizacion || !estado.parametrizacion.size)) {
    estado.parametrizacion = par;
    recuperado.push(`${par.size} conceptos`);
    $('detalle-parametrizacion').innerHTML =
      `<div class="aviso bien">Reservorio de conceptos recuperado de esta computadora:
       <strong>${par.size}</strong> conceptos. Soltá el archivo si querés reemplazarlo.</div>`;
  }
  if (pad && (!estado.padron || !estado.padron.size)) {
    estado.padron = pad;
    recuperado.push(`${pad.size} empleados`);
    $('detalle-padron').innerHTML =
      `<div class="aviso bien">Reservorio de empleados recuperado de esta computadora:
       <strong>${pad.size}</strong> empleados. Soltá el archivo si querés reemplazarlo.</div>`;
  }

  if (recuperado.length) {
    pintarResumenPaso2();
    recalcular();
  }
}

/**
 * Carga los dos reservorios desde la carpeta de la aplicación.
 *
 * Devuelve true solo cuando los dos entraron. Si alguno falta, devuelve false
 * a propósito: el que sí está ya quedó cargado, y lo que devuelve decide si se
 * sigue buscando el otro en la memoria del navegador. Un archivo roto en la
 * carpeta no puede dejar sin usar una copia que sí estaba.
 *
 * Los archivos van por el mismo `cargarParametrizacion` / `cargarPadron` que
 * usa el arrastre a mano: un solo camino de lectura, un solo lugar donde puede
 * leer distinto.
 */
async function traerReservoriosDeLaCarpeta(cuit) {
  let dela;
  try {
    dela = await reservoriosDeLaCarpeta(cuit);
  } catch (error) {
    return false;
  }
  if (!dela) return false;

  /*
   * Los conceptos que la empresa no pasa al libro son de la empresa, no del
   * mes: entran con el reservorio y no hay que volver a escribirlos. Si en
   * pantalla ya hay algo escrito, manda lo escrito.
   */
  const campoExcluidos = $('excluidos');
  if (campoExcluidos && dela.excluidos.length && !campoExcluidos.value.trim()) {
    campoExcluidos.value = dela.excluidos.join(', ');
  }

  /*
   * Las alícuotas de aportes, por el mismo motivo y con más urgencia.
   *
   * Sin ellas no corre el control que recalcula SIPA, obra social e INSSJyP
   * sobre las bases y los cruza contra lo retenido en el recibo. Ese control
   * existía y estaba bien —da lo mismo que ARCA, al centavo—, pero como las
   * alícuotas había que tipearlas en cada liquidación, nunca corría: el
   * armador dijo «sin errores» y ARCA devolvió treinta y cinco.
   */
  /* Las dos correcciones al archivo son de la empresa y se aplican al generar:
     no hay campo en pantalla, se ven en los avisos del paso 5. */
  estado.correcciones = {
    consolidar: dela.consolidar,
    aportesAlValorCalculado: dela.aportesAlValorCalculado,
  };

  /*
   * Como lee el origen esta empresa. Entra ahora, al elegir el empleador, que
   * es antes de que se suelte la planilla: cuando `cargarPlanilla` detecte un
   * libro de recibos, la tabla de alias ya tiene que estar.
   */
  estado.recibos = dela.recibos;
  estado.provinciaDeLaEmpresa = dela.provincia;

  const alic = dela.alicuotas;
  if (alic) {
    for (const [id, valor] of [
      ['alicSipa', alic.sipa], ['alicInssjyp', alic.inssjyp],
      ['alicOS', alic.obraSocial], ['alicAdherente', alic.adherente],
    ]) {
      const campo = $(id);
      if (campo && !campo.value.trim() && valor !== undefined && valor !== null) {
        campo.value = String(valor).replace('.', ',');
      }
    }
  }

  const de = dela.nombre ? ` de ${dela.nombre}` : '';
  if (dela.conceptos) await cargarParametrizacion(dela.conceptos, `la carpeta de la aplicación${de}`);
  if (dela.empleados) await cargarPadron(dela.empleados, `la carpeta de la aplicación${de}`);

  if (dela.faltan.length) {
    /* No se presume la causa: puede faltar el archivo, o estar cifrado y la
       frase no ser la que corresponde. El motivo lo trae cada uno. */
    $('detalle-padron').innerHTML +=
      `<div class="aviso mal">No se pudo abrir lo que el índice de <code>reservorios/</code>
       nombra — ${escapar(dela.faltan.join('; '))}. Ese reservorio sale de lo guardado en esta
       computadora, o hay que soltarlo a mano acá abajo.</div>`;
  }

  pintarResumenPaso2();
  plegarPaso2SiYaEsta();
  recalcular();
  return Boolean(dela.conceptos && dela.empleados);
}

/**
 * Llena la lista de empleadores con lo que haya en `reservorios/indice.json`.
 *
 * Elegir de una lista en vez de escribir once dígitos no es solo comodidad: un
 * CUIT mal tipeado no da error, da una empresa vacía —sin reservorios, sin
 * ficha— y eso se parece demasiado a «la aplicación no encuentra los datos».
 *
 * Si la carpeta no está, la lista queda escondida y todo sigue como antes.
 */
async function llenarListaDeEmpleadores() {
  const caja = $('caja-empleador');
  const lista = $('empleador');
  if (!caja || !lista) return;

  const indice = await indiceDeReservorios();
  const empresas = indice && indice.empresas ? Object.entries(indice.empresas) : [];
  if (!empresas.length) return;

  empresas.sort((a, b) => String(a[1].nombre || '').localeCompare(String(b[1].nombre || ''), 'es'));
  lista.innerHTML =
    '<option value="">Elegir…</option>' +
    empresas
      .map(([cuit, e]) => `<option value="${escapar(cuit)}">${escapar(e.nombre || cuit)}</option>`)
      .join('');
  caja.hidden = false;

  lista.addEventListener('change', () => {
    if (!lista.value) return;
    $('cuit').value = lista.value;
    recuperarReservorios();
    pintarResumenDatos();
    recalcular();
  });

  /* Si el CUIT ya venía escrito, la lista lo acompaña. */
  const cuit = cuitDeLaPantalla();
  if (cuit && empresas.some(([c]) => c === cuit)) lista.value = cuit;

  $('cuit').addEventListener('input', () => {
    const escrito = cuitDeLaPantalla();
    lista.value = empresas.some(([c]) => c === escrito) ? escrito : '';
  });
}

/** Dice de dónde salió el tope, o que falta cargarlo. */
function pintarOrigenDelTope(periodo, delReservorio) {
  const caja = $('origen-tope');
  if (!caja) return;
  if ($('topeMes').value.trim()) {
    caja.innerHTML = '<div class="aviso ojo">Se está usando el tope cargado a mano, no el del reservorio.</div>';
  } else if (delReservorio) {
    caja.innerHTML = `<div class="aviso bien">
      Tope de ${escapar(periodo)}: <strong>$ ${comoPesos(delReservorio.tope)}</strong>.
      ${
        delReservorio.fuente === 'resolución'
          ? `Lo fija la <strong>${escapar(delReservorio.nota)}</strong>, así que es el valor publicado.`
          : delReservorio.fuente === 'libro'
          ? `Sale del libro de sueldos definitivo (${escapar(delReservorio.nota)}): confirmalo contra la resolución del período.`
          : `Está <strong>despejado</strong> del Digesto (${escapar(delReservorio.nota)}): ese método erró hasta $45.000, así que buscá la resolución.`
      }
    </div>`;
  } else {
    caja.innerHTML = `<div class="aviso mal">
      No hay tope cargado para el período ${escapar(periodo || '(sin período)')}.
      Sacalo del libro de sueldos definitivo —el aporte de jubilación dividido
      la alícuota— y sumalo a <code>topes.js</code>, o cargalo acá a mano.
      La tabla llega hasta ${escapar(ultimoPeriodoConTope() || 'ningún período')}.
    </div>`;
  }
}

/* ---------- Paso 2: lo que no cambia mes a mes ---------- */

function pintarResumenPaso2() {
  const partes = [];
  partes.push(
    estado.parametrizacion && estado.parametrizacion.size
      ? `${estado.parametrizacion.size} conceptos`
      : 'sin reservorio de conceptos'
  );
  partes.push(
    estado.padron && estado.padron.size ? `${estado.padron.size} empleados` : 'sin reservorio de empleados'
  );
  const fuera = leerExcluidos();
  if (fuera.length) partes.push(`${fuera.length} concepto${fuera.length === 1 ? '' : 's'} afuera`);
  $('resumen-parametrizacion').textContent = partes.join(' · ');

  plegarPaso2SiYaEsta();
}

/*
 * El paso 2 venía CERRADO en el HTML, y era el único paso de carga que lo
 * estaba: el 1, el 3 y el 6 vienen abiertos. Así el acordeón pasaba
 * desapercibido y se llegaba al final sin ninguno de los dos reservorios, con
 * el registro 04 en ceros y sin forma de pago. Fue exactamente lo que pasó con
 * el envío de Nautical, dos veces.
 *
 * Ahora viene abierto y se pliega solo cuando los dos están cargados, que es lo
 * que cuenta la historia bien: se hace una vez y después no molesta.
 */
let paso2PlegadoSolo = false;

function plegarPaso2SiYaEsta() {
  const paso = $('paso-parametrizacion');
  if (!paso || paso2PlegadoSolo) return;
  const completo = estado.parametrizacion && estado.parametrizacion.size
    && estado.padron && estado.padron.size;
  if (!completo) return;
  /* Una sola vez: si después se abre a mano, no se vuelve a cerrar solo. */
  paso2PlegadoSolo = true;
  paso.open = false;
}


async function cargarParametrizacion(archivo, origen) {
  const caja = $('detalle-parametrizacion');
  try {
    const libro = await leerPlanilla(archivo);
    const hoja = libro.hojas.find((h) => h.filas.length > 1) || libro.hojas[0];
    if (!hoja || hoja.filas.length < 2) throw new Error('La planilla no tiene filas.');

    const avisos = [];
    const encabezados = hoja.filas[0].map((h) => String(h === null || h === undefined ? '' : h));
    estado.parametrizacion = leerParametrizacion(hoja.filas.slice(1), encabezados, avisos);
    estado.nombreParametrizacion = archivo.name;
    guardarParametrizacion(cuitDeLaPantalla(), estado.parametrizacion);

    const cantidad = estado.parametrizacion.size;
    pintarResumenPaso2();

    let html = origen
      ? `<div class="aviso bien">Reservorio de conceptos: <strong>${cantidad}</strong> conceptos,
         desde ${escapar(origen)}. Soltá un archivo si querés reemplazarlo.</div>`
      : '';
    if (avisos.length) {
      html += `<div class="aviso ojo">${avisos.map(escapar).join('<br>')}</div>`;
    }
    if (cantidad) {
      const filas = Array.from(estado.parametrizacion.entries())
        .slice(0, 12)
        .map(([codigo, par]) => {
          const nombre = nombreDeConcepto(par.codigoArca);
          const tipo = tipoDeConcepto(par.codigoArca);
          return `<tr>
            <td><code>${escapar(codigo)}</code></td>
            <td><code>${escapar(par.codigoArca)}</code></td>
            <td>${nombre ? escapar(nombre) : '<span class="marca mal">no está en el Anexo I</span>'}</td>
            <td>${tipo ? escapar(tipo) : '—'}</td>
          </tr>`;
        })
        .join('');
      html += `<div class="tabla-envoltorio"><table>
        <thead><tr><th>Concepto empleador</th><th>Concepto ARCA</th><th>Descripción</th><th>Tipo</th></tr></thead>
        <tbody>${filas}</tbody></table></div>`;
      if (cantidad > 12) {
        html += `<p class="nota">Se muestran los primeros 12 de ${cantidad}.</p>`;
      }
    }
    caja.innerHTML = html;
  } catch (error) {
    estado.parametrizacion = null;
    pintarResumenPaso2();
    caja.innerHTML = `<div class="aviso mal">No se pudo leer la parametrización: ${escapar(error.message)}</div>`;
  }
  recalcular();
}

/** El padrón: una fila por CUIL con los datos de la relación laboral. */
async function cargarPadron(archivo) {
  const caja = $('detalle-padron');
  try {
    const libro = await leerPlanilla(archivo);
    const hoja = libro.hojas.filter((h) => h.filas.length > 1).sort((a, b) => b.filas.length - a.filas.length)[0];
    if (!hoja) throw new Error('El reservorio de empleados no tiene filas.');

    const avisos = [];
    const encabezados = hoja.filas[0].map((h) => String(h === null || h === undefined ? '' : h));
    estado.padron = leerPadron(hoja.filas.slice(1), encabezados, avisos);
    estado.nombrePadron = archivo.name;
    guardarPadron(cuitDeLaPantalla(), estado.padron);

    let html = avisos.length ? `<div class="aviso ojo">${avisos.map(escapar).join('<br>')}</div>` : '';
    html += estado.padron.size
      ? `<div class="aviso bien">Reservorio de empleados: <strong>${estado.padron.size}</strong> empleados desde «${escapar(archivo.name)}».</div>`
      : `<div class="aviso mal">No se reconoció ningún empleado en «${escapar(archivo.name)}».</div>`;
    caja.innerHTML = html;
    pintarResumenPaso2();
  } catch (error) {
    estado.padron = null;
    pintarResumenPaso2();
    caja.innerHTML = `<div class="aviso mal">No se pudo leer el reservorio de empleados: ${escapar(error.message)}</div>`;
  }
  recalcular();
}

/* ---------- Paso 3: la planilla ---------- */

/**
 * Convierte el libro en una tabla si vino como «un recibo por hoja».
 *
 * Devuelve siempre las hojas que hay que ofrecer en el paso 3. Si el libro es
 * una tabla —el caso de siempre— devuelve las de siempre y no pasa nada.
 *
 * Esto vive en el lector y no en el perfil a propósito: `perfiles.js` resuelve
 * QUÉ columna es cada cosa, y acá el problema es anterior, que no hay columnas.
 * El libro de Martín Prado es un recibo dibujado por hoja, una hoja por
 * empleado. Convertido, de acá para abajo es la misma tabla de «Conceptos y
 * totales» que el armador ya sabía leer, y no hay un segundo camino de armado.
 *
 * Cómo lee el recibo cada empresa —la tabla de alias y los conceptos que no
 * pasan al libro— está en el reservorio, no acá: son datos de la empresa.
 */
function convertirSiEsLibroDeRecibos(libro) {
  estado.conversionRecibos = null;
  if (typeof esLibroDeRecibos !== 'function' || !esLibroDeRecibos(libro)) return libro.hojas;

  const cfg = estado.recibos || {};
  /*
   * El período de la pantalla es el que decide qué recibo es de esta
   * liquidación. En el libro de Prado quedó un recibo de 2017 que tiene CUIL y
   * Subtotal como cualquier otro: sin el período entraba a la nómina.
   */
  const conv = recibosAFilas(libro, {
    periodo: ($('periodo').value || '').trim(),
    alias: cfg.alias || {},
    excluidos: cfg.excluidos || [],
  });
  estado.conversionRecibos = conv;
  return [conv.hoja].concat(libro.hojas);
}

/**
 * Lo que hubo que decidir al convertir los recibos, y si cada uno cierra.
 *
 * El control no es contra otro archivo nuestro: es contra el papel. Cada recibo
 * imprime su propio Subtotal de remunerativos, descuentos y no remunerativos, y
 * lo que sumamos leyendo sus filas tiene que dar exactamente eso. Si no da, la
 * conversión leyó mal y hay que decirlo en el paso 3, antes de que el error
 * viaje disfrazado de importe legítimo hasta el archivo.
 */
function panelDeLaConversion(conv) {
  const COLUMNAS = { remuneracion: 'remunerativos', descuentos: 'descuentos', noRemunerativo: 'no remunerativos' };
  const noCierran = conv.controles.filter((c) => c.calculado !== c.declarado);
  const empleados = new Set(conv.controles.map((c) => c.cuil)).size;

  let html = noCierran.length
    ? `<div class="aviso mal">
        <strong>${noCierran.length} de ${conv.controles.length} subtotales no cierran contra el
        recibo.</strong> No armes el archivo así: lo que sumamos no es lo que dice el papel.
        <div class="detalle">${noCierran
          .map(
            (c) =>
              `<p>${escapar(c.nombre || c.hoja)} — ${COLUMNAS[c.columna] || c.columna}:
               el recibo dice <strong>$ ${comoPesos(c.declarado)}</strong> y sumando sus conceptos
               dan <strong>$ ${comoPesos(c.calculado)}</strong>
               (${c.calculado > c.declarado ? 'de más' : 'de menos'}
               $ ${comoPesos(Math.abs(c.calculado - c.declarado))}).</p>`
          )
          .join('')}</div>
      </div>`
    : `<div class="aviso bien">
        Se leyeron <strong>${empleados}</strong> recibos y los
        <strong>${conv.controles.length}</strong> subtotales cierran al centavo contra lo que
        imprime cada uno. Los importes del libro son los del recibo.
      </div>`;

  if (conv.avisos.length) {
    html += `<details class="aviso ojo plegable">
      <summary><strong>Lo que se decidió al leer los recibos</strong>
        <span class="cuantos">${conv.avisos.length} ${
      conv.avisos.length === 1 ? 'decisión' : 'decisiones'
    }</span></summary>
      <div class="detalle">${conv.avisos.map((a) => `<p>${escapar(a)}</p>`).join('')}</div>
    </details>`;
  }

  return html;
}


async function cargarPlanilla(archivo) {
  const caja = $('detalle-planilla');
  try {
    const libro = await leerPlanilla(archivo);
    const hojas = convertirSiEsLibroDeRecibos(libro);
    const conDatos = hojas.filter((h) => h.filas.length > 1);
    if (!conDatos.length) throw new Error('La planilla no tiene filas de datos.');

    /*
     * Un libro de sueldos exportado trae varias hojas —datos de la empresa,
     * nómina, conceptos— y la que interesa es la de los conceptos. Quedarse
     * con la primera que tenga datos agarra "Datos de la Empresa" y su única
     * fila. Se elige la más larga, que es siempre la del detalle, y se deja
     * cambiarla a mano.
     */
    conDatos.sort((a, b) => b.filas.length - a.filas.length);
    /*
     * Salvo cuando hay una hoja convertida: esa manda, y no por ser la mas
     * larga. Cada hoja de recibo tiene sus sesenta filas de dibujo, asi que el
     * criterio del largo elige un recibo suelto y el armador lee un empleado
     * en vez de la nomina entera.
     */
    if (estado.conversionRecibos) {
      const donde = conDatos.indexOf(estado.conversionRecibos.hoja);
      if (donde > 0) conDatos.unshift(conDatos.splice(donde, 1)[0]);
    }
    estado.hojas = conDatos;
    estado.nombrePlanilla = archivo.name;
    usarHoja(0);
  } catch (error) {
    estado.filas = null;
    estado.hojas = null;
    $('resumen-planilla').textContent = 'No se pudo leer';
    caja.innerHTML = `<div class="aviso mal">No se pudo leer la planilla: ${escapar(error.message)}</div>`;
    recalcular();
  }
}

/** Toma una de las hojas del libro como la liquidación a procesar. */
function usarHoja(indice) {
  const caja = $('detalle-planilla');
  const hoja = estado.hojas[indice];
  estado.hojaElegida = indice;

  estado.encabezados = hoja.filas[0].map((h) => String(h === null || h === undefined ? '' : h));
  estado.filas = hoja.filas.slice(1);

  const deteccion = detectarPerfil(estado.encabezados, normalizarEncabezado);
  estado.perfil = deteccion.perfil;

  $('resumen-planilla').textContent = `${estado.filas.length} filas · ${estado.nombrePlanilla}`;

  let html = `<div class="aviso bien">
    Se leyeron <strong>${estado.filas.length}</strong> filas de la hoja
    «${escapar(hoja.nombre)}». Origen reconocido:
    <strong>${escapar(estado.perfil.nombre)}</strong>.
    </div>`;

  if (estado.hojas.length > 1) {
    const opciones = estado.hojas
      .map(
        (h, i) =>
          `<option value="${i}"${i === indice ? ' selected' : ''}>${escapar(h.nombre)} — ${
            h.filas.length - 1
          } filas</option>`
      )
      .join('');
    html += `<div class="campos"><div>
      <label for="hoja">Hoja de la planilla
        <span class="ayuda">El libro trae ${estado.hojas.length} hojas con datos</span>
      </label>
      <select id="hoja">${opciones}</select>
    </div></div>`;
  }

  html += `<p class="nota">${escapar(estado.perfil.notas)}</p>`;
  if (estado.conversionRecibos && hoja === estado.conversionRecibos.hoja) {
    html += panelDeLaConversion(estado.conversionRecibos);
  }
  caja.innerHTML = html;

  if ($('hoja')) {
    $('hoja').addEventListener('change', (e) => usarHoja(Number(e.target.value)));
  }
  recalcular();
}

/* ---------- Paso 4: columnas ---------- */

function pintarColumnas() {
  const caja = $('cuerpo-columnas');
  if (!estado.filas) {
    $('resumen-columnas').textContent = 'Todavía no hay planilla';
    caja.innerHTML = '<p class="nota">Cargá la planilla del paso 3.</p>';
    return;
  }

  const asignadas = Object.keys(estado.columnas);
  $('resumen-columnas').textContent = estado.sinAsignar.length
    ? `${asignadas.length} reconocidas · ${estado.sinAsignar.length} sin asignar`
    : `${asignadas.length} reconocidas`;

  const filas = asignadas
    .sort()
    .map(
      (campo) => `<tr>
        <td><code>${escapar(campo)}</code></td>
        <td>${escapar(estado.encabezados[estado.columnas[campo]])}</td>
      </tr>`
    )
    .join('');

  let html = `<div class="tabla-envoltorio"><table>
      <thead><tr><th>Campo del archivo</th><th>Columna de la planilla</th></tr></thead>
      <tbody>${filas}</tbody></table></div>`;

  if (estado.sinAsignar.length) {
    html += `<div class="aviso ojo">
      Estas columnas no se usaron. Si alguna tenía que entrar al archivo, hay que
      sumar su encabezado a los sinónimos de <code>sueldos.js</code> o al perfil de
      origen: <strong>${estado.sinAsignar.map(escapar).join('</strong>, <strong>')}</strong>.
    </div>`;
  }

  /* Los campos obligatorios que no aparecieron. */
  const obligatorios = { cuil: 'CUIL', codigoConcepto: 'código de concepto', importe: 'importe' };
  const faltan = Object.keys(obligatorios).filter((c) => estado.columnas[c] === undefined);
  if (faltan.length) {
    html =
      `<div class="aviso mal">Falta reconocer ${faltan
        .map((c) => `<strong>${obligatorios[c]}</strong>`)
        .join(', ')}. Sin eso no se puede armar el archivo.</div>` + html;
  }

  caja.innerHTML = html;
  $('paso-columnas').open = estado.sinAsignar.length > 0 || faltan.length > 0;
}

/* ---------- Paso 5: el control ---------- */

function pintarControl() {
  const caja = $('cuerpo-control');
  if (!estado.liquidacion) {
    $('resumen-control').textContent = 'Todavía no se corrió';
    caja.innerHTML = '<p class="nota">Cargá la planilla del paso 3.</p>';
    return;
  }

  const errores = estado.hallazgos.filter((h) => h.nivel === 'error');
  const avisos = estado.hallazgos.filter((h) => h.nivel === 'aviso');

  $('resumen-control').textContent = errores.length
    ? `${errores.length} ${errores.length === 1 ? 'error' : 'errores'}` +
      (avisos.length ? ` · ${avisos.length} para mirar` : '')
    : avisos.length
    ? `Sin errores · ${avisos.length} para mirar`
    : 'Sin observaciones';

  let html = errores.length
    ? `<div class="aviso mal">Hay <strong>${errores.length}</strong> ${
        errores.length === 1 ? 'cosa' : 'cosas'
      } que ARCA va a rechazar. Conviene corregirlas antes de subir el archivo.</div>`
    : `<div class="aviso bien">Ningún control encontró un motivo de rechazo.</div>`;

  /*
   * Los dos reservorios se cargan en el paso 2, y el aviso tiene que llevar
   * hasta ahí. Nombrar el paso no alcanza: el acordeón venía cerrado y se
   * llegaba al final del armado sin ninguno de los dos.
   */
  const faltaConceptos = !estado.parametrizacion || !estado.parametrizacion.size;
  const faltaPadron = !estado.padron || !estado.padron.size;
  if (faltaConceptos || faltaPadron) {
    const cuales = faltaConceptos && faltaPadron
      ? 'los dos reservorios —conceptos y empleados—'
      : faltaConceptos ? 'el reservorio de conceptos' : 'el reservorio de empleados';
    html += `<div class="aviso ojo">
      Falta cargar ${cuales}. Se cargan una sola vez por empresa y después
      vuelven solos al escribir el CUIT.
      <button type="button" class="suave" id="ir-al-paso2">Ir al paso 2</button>
    </div>`;
  }
  if (faltaConceptos) {
    html += `<div class="aviso ojo">
      Sin la parametrización de conceptos no se pueden calcular las bases
      imponibles: el control revisa el formato, pero no verifica que las bases
      cierren, que es lo que más rebota.
    </div>`;
  }

  const item = (h) =>
    `<li class="${h.nivel}">${h.cuil ? `<span class="quien">${escapar(h.cuil)}</span>` : ''}${escapar(h.mensaje)}</li>`;

  if (estado.hallazgos.length) {
    html += `<ul class="lista-hallazgos">${errores.map(item).join('')}${avisos.map(item).join('')}</ul>`;
  }

  /* El cuadro de bases: es la forma de verificar sin leer código. */
  if (estado.parametrizacion && estado.parametrizacion.size) {
    const filas = estado.liquidacion.trabajadores
      .map((t) => {
        if (!t.calculo) return '';
        const celdas = BASES_IMPONIBLES.map((b) => {
          if (b.clave === 'rem10') return '';
          const calculado = t.calculo.bases[b.clave] || 0;
          const declarado = t.declarado[b.clave];
          const difiere = declarado !== null && declarado !== undefined && declarado !== calculado;
          return `<td class="numero">${comoPesos(calculado)}${
            difiere ? `<br><span class="marca mal">declara ${comoPesos(declarado)}</span>` : ''
          }</td>`;
        }).join('');
        return `<tr>
          <td><code>${escapar(t.cuil)}</code><br>${escapar(t.apellidoNombre || '')}</td>
          <td class="numero">${comoPesos(t.calculo.remBruta)}</td>
          ${celdas}
        </tr>`;
      })
      .join('');

    const columnas = BASES_IMPONIBLES.filter((b) => b.clave !== 'rem10')
      .map((b) => `<th class="numero" title="${escapar(b.destino)}">${b.nombre}</th>`)
      .join('');

    html += `<h3 style="margin-top:26px;font-size:15px;color:var(--green-800)">Las bases, trabajador por trabajador</h3>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Trabajador</th><th class="numero">Rem. bruta</th>${columnas}</tr></thead>
        <tbody>${filas}</tbody></table></div>
      <p class="nota">
        El número grande es el que sale de los conceptos. Si abajo aparece en rojo
        «declara», es lo que traía la planilla y no coincide: esa diferencia es la
        que ARCA devuelve al validar.
      </p>`;
  }

  caja.innerHTML = html;
  $('paso-control').open = errores.length > 0;

  /* El botón del aviso abre el paso 2 y lleva hasta ahí, porque nombrarlo no
     alcanzó: el acordeón venía cerrado y se pasaba de largo. */
  if ($('ir-al-paso2')) {
    $('ir-al-paso2').addEventListener('click', () => {
      const paso = $('paso-parametrizacion');
      paso.open = true;
      paso.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

/* ---------- Paso 6: el archivo ---------- */

function pintarArchivo() {
  const caja = $('cuerpo-archivo');
  if (!estado.archivo) {
    $('resumen-archivo').textContent = 'Todavía no se generó';
    caja.innerHTML = '<p class="nota">Cargá la planilla del paso 3 para generar el archivo.</p>';
    return;
  }

  const { lineas, avisos } = estado.archivo;
  const porTipo = {};
  for (const l of lineas) porTipo[l.slice(0, 2)] = (porTipo[l.slice(0, 2)] || 0) + 1;

  /* El resumen del paso dice que ya se puede bajar. El botón está adentro del
     paso 6 y queda al fondo de la página: sin esto hay que abrir el paso para
     enterarse de que el archivo está listo. */
  $('resumen-archivo').textContent = `${lineas.length} registros · listo para bajar`;

  const detalle = Object.keys(porTipo)
    .sort()
    .map((t) => `<strong>${porTipo[t]}</strong> del tipo <code>${t}</code>`)
    .join(' · ');

  let html = `<div class="aviso bien">El archivo tiene ${lineas.length} registros: ${detalle}.</div>`;

  /* El crédito fiscal se guardó al recalcular. Se avisa acá porque es plata que
     se toma, y tiene que constar que quedó registrada y dónde se consulta. */
  if (estado.credito && (estado.credito.filas.length || estado.credito.faltantes.length)) {
    const c = estado.credito;
    html += `<div class="aviso bien">
      <strong>Crédito fiscal por cargas sociales: $ ${comoPesos(c.total)}</strong>
      sobre ${c.filas.length} ${c.filas.length === 1 ? 'trabajador' : 'trabajadores'}.
      Quedó guardado para este período — se consulta en
      <a href="credito.html">Crédito fiscal</a>.${
        c.filas.filter((f) => f.origen === 'empresa').length
          ? ` ${c.filas.filter((f) => f.origen === 'empresa').length} de ellos tomaron la
             provincia cargada para toda la empresa, no una propia del reservorio de empleados.`
          : ''}${
        c.faltantes.length
          ? ` <span class="marca mal">${c.faltantes.length} sin calcular</span>, que no suman al total: ${
              escapar(c.faltantes.map((f) => `${f.nombre} (${f.motivo})`).join('; '))}.`
          : ''}
    </div>`;
  }

  /* El detalle de los ajustes va plegado. Son decenas de renglones —uno por
     aporte recalculado— y abiertos dejaban el botón de bajar el archivo dos
     pantallas más abajo. El encabezado dice cuántos son, así que se ve que hubo
     ajustes sin tener que abrirlo: nada se corrige en silencio. */
  if (avisos.length) {
    html += `<details class="aviso ojo plegable">
      <summary><strong>Lo que se ajustó al escribir</strong>
        <span class="cuantos">${avisos.length} ${
          avisos.length === 1 ? 'ajuste' : 'ajustes'}</span></summary>
      <div class="detalle">${avisos.map((a) => `<p>${escapar(a)}</p>`).join('')}</div>
    </details>`;
  }

  const errores = estado.hallazgos.filter((h) => h.nivel === 'error').length;
  if (errores) {
    html += `<div class="aviso mal">
      El archivo se puede bajar igual, pero el control del paso 5 encontró
      ${errores} ${errores === 1 ? 'problema' : 'problemas'}: si lo subís así, es
      muy probable que la validación de ARCA lo devuelva.
    </div>`;
  }

  /* La botonera va ARRIBA del cuadro de conceptos. Estaba después, y el cuadro
     ocupa una pantalla entera: había que scrollear hasta el fondo de todo para
     encontrar cómo bajar el archivo. */
  html += `<div class="botonera">
      <button id="bajar">Bajar el archivo TXT</button>
      <button id="copiar" class="suave">Copiar al portapapeles</button>
    </div>
    <p class="nota">
      Se guarda como <code>LSD_${escapar(estado.liquidacion.cuit || '')}_${
        escapar(estado.liquidacion.periodo || '')}_${
        escapar(String(estado.liquidacion.nroLiquidacion || ''))}.txt</code>
      en la carpeta de descargas del navegador.
    </p>`;

  /*
   * El mismo cuadro que devuelve el Digesto Resumen del servicio, para poder
   * comparar contra él sin sacar cuentas: cada concepto con su total, y los
   * descuentos en negativo, que es como los muestra ARCA.
   */
  const porConcepto = new Map();
  for (const t of estado.liquidacion.trabajadores) {
    for (const c of t.conceptos) {
      const g = porConcepto.get(c.codigo) || { codigo: c.codigo, descripcion: c.descripcion, total: 0 };
      g.total += (c.debitoCredito === 'D' ? -1 : 1) * c.importe;
      if (!g.descripcion && c.descripcion) g.descripcion = c.descripcion;
      porConcepto.set(c.codigo, g);
    }
  }
  const conceptos = Array.from(porConcepto.values()).sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'es', { numeric: true })
  );
  const totalGeneral = conceptos.reduce((a, c) => a + c.total, 0);

  html += `<h3 class="subtitulo">Para comparar contra el Digesto Resumen</h3>
    <p class="nota">
      Es el mismo cuadro que devuelve el servicio después de subir el archivo.
      Si estos números coinciden con los del Digesto, entró lo que se quiso mandar.
    </p>
    <div class="tabla-envoltorio"><table>
      <thead><tr><th>Código</th><th>Descripción</th><th class="numero">Importe total</th></tr></thead>
      <tbody>${conceptos
        .map(
          (c) => `<tr>
            <td><code>${escapar(c.codigo)}</code></td>
            <td>${escapar(c.descripcion || '')}</td>
            <td class="numero">${comoPesos(c.total)}</td>
          </tr>`
        )
        .join('')}
        <tr><td colspan="2"><strong>Importes totales</strong></td>
        <td class="numero"><strong>${comoPesos(totalGeneral)}</strong></td></tr>
      </tbody></table></div>
    <p class="nota">
      Trabajadores: <strong>${estado.liquidacion.trabajadores.length}</strong> ·
      conceptos distintos: <strong>${conceptos.length}</strong> ·
      registros ${Object.keys(porTipo)
        .sort()
        .map((t) => `<code>${t}</code> ${porTipo[t]}`)
        .join(' · ')}.
    </p>`;

  const previa = lineas.slice(0, 12).join('\n');
  html += `<div class="previa">${escapar(previa)}${
    lineas.length > 12 ? `\n… y ${lineas.length - 12} registros más` : ''
  }</div>`;

  html += `<p class="nota">
    Se baja en codificación ANSI (Windows-1252) y con fin de línea de Windows,
    que es lo que pide el servicio. No lo abras y lo vuelvas a guardar con un
    editor que lo pase a UTF-8.
  </p>`;

  caja.innerHTML = html;

  $('bajar').addEventListener('click', bajarArchivo);
  $('copiar').addEventListener('click', async () => {
    await navigator.clipboard.writeText(estado.archivo.texto);
    $('copiar').textContent = 'Copiado';
    setTimeout(() => ($('copiar').textContent = 'Copiar al portapapeles'), 1600);
  });
}

function bajarArchivo() {
  const avisos = [];
  const bytes = aWindows1252(estado.archivo.texto, avisos);
  const blob = new Blob([bytes], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LSD_${estado.liquidacion.cuit}_${estado.liquidacion.periodo}_${estado.liquidacion.nroLiquidacion}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Las novedades del mes y los reservorios ---------- */

/*
 * Cada mes aparecen empleados o conceptos que no están en los reservorios.
 * Acá se muestran, se propone a qué concepto ARCA va cada uno, y se deja
 * bajar el reservorio actualizado.
 *
 * La propuesta nunca se aplica sola: se acepta una por una.
 */

/** Los conceptos nuevos que ya se aceptaron en esta sesión. */
const aceptados = new Map();

/** Los empleados que se dieron de alta en esta sesión. */
const altasDeEmpleados = new Map();

function pintarNovedades() {
  const caja = $('novedades');
  if (!caja) return;

  if (!estado.liquidacion) {
    caja.innerHTML = '';
    return;
  }

  /*
   * Sin parametrización cargada, TODOS los conceptos de la liquidación se ven
   * nuevos, y la pantalla los ofrecía uno por uno para clasificar a mano. En
   * Nautical son sesenta y seis y el reservorio ya los tiene a todos: no hay
   * nada que clasificar, falta el archivo del paso 2.
   *
   * El síntoma engañaba, porque cada tarjeta decía "no hay ningún concepto
   * cargado en la banda 0-99" —que suena a un problema de esa banda— cuando lo
   * que pasaba es que no había ningún concepto cargado en NINGUNA banda.
   */
  if (!estado.parametrizacion || !estado.parametrizacion.size) {
    const codigos = new Set();
    for (const t of estado.liquidacion.trabajadores) {
      for (const c of t.conceptos) if (c.codigo) codigos.add(String(c.codigo));
    }
    caja.innerHTML = `<div class="aviso mal">
      <strong>Falta el reservorio de conceptos del paso 2.</strong>
      Sin él no hay contra qué atar los ${codigos.size} conceptos que trae la
      liquidación: aparecerían todos como nuevos y habría que clasificarlos a
      mano de a uno. Soltá el <code>Conceptos &lt;CUIT&gt;.csv</code> de la
      empresa y esto se resuelve solo.
    </div>`;
    return;
  }

  const conceptos = conceptosNuevos(estado.liquidacion, estado.parametrizacion).filter(
    (c) => !aceptados.has(c.codigo)
  );
  const empleados = empleadosNuevos(estado.liquidacion, estado.padron);
  const ausentes = empleadosSinLiquidacion(estado.liquidacion, estado.padron);

  if (!conceptos.length && !empleados.length && !aceptados.size) {
    caja.innerHTML = `<div class="aviso bien">
      Ningún empleado ni concepto nuevo: los reservorios ya cubren todo lo que
      trae la liquidación.${
        ausentes.length
          ? ` Hay ${ausentes.length} empleado${ausentes.length === 1 ? '' : 's'} en el reservorio que no ${
              ausentes.length === 1 ? 'trabajó' : 'trabajaron'
            } este período, que es normal.`
          : ''
      }
    </div>`;
    return;
  }

  let html = '';

  if (empleados.length) {
    html += pintarAltaDeEmpleados(empleados);
  }

  if (conceptos.length) {
    html += `<h3 class="subtitulo">Conceptos que no están en el reservorio</h3>
      <p class="nota">
        La propuesta sale de mirar cómo está parametrizada la banda de cien a la
        que pertenece cada código, en el reservorio de esta misma empresa. Es una
        propuesta: <strong>confirmala antes de aceptarla</strong>.
      </p>`;

    for (const c of conceptos) {
      const s = c.sugerencia;
      const marca =
        s.confianza === 'por nombre'
          ? '<span class="marca bien">hay uno que se llama igual</span>'
          : s.confianza === 'por banda'
          ? '<span class="marca ojo">solo por la banda</span>'
          : '<span class="marca mal">hay que elegir</span>';

      html += `<div class="novedad">
        <div class="novedad-titulo">
          <code>${escapar(c.codigo)}</code> ${escapar(c.descripcion || 'sin descripción')} ${marca}
        </div>
        <p class="nota">
          Aparece ${c.veces} ${c.veces === 1 ? 'vez' : 'veces'} en
          ${c.cuiles} ${c.cuiles === 1 ? 'trabajador' : 'trabajadores'},
          por $ ${comoPesos(c.total)}. ${escapar(s.motivo)}
        </p>`;

      if (s.hay && s.vistos.length) {
        html += `<p class="nota">En esa banda ya hay:
          ${s.vistos
            .map((v) => `<code>${escapar(v.arca)}</code> ${escapar(v.nombre)} (${v.n})`)
            .join(' · ')}</p>`;
      }

      html += `<div class="campos">
          <div>
            <label for="arca-${escapar(c.codigo)}">Concepto ARCA</label>
            <input type="text" id="arca-${escapar(c.codigo)}" value="${escapar(s.codigoArca || '')}"
              placeholder="110000" inputmode="numeric">
          </div>
          <div style="align-self:end">
            <button class="suave" data-aceptar="${escapar(c.codigo)}">Sumar al reservorio</button>
          </div>
        </div>
      </div>`;
    }
  }

  if (altasDeEmpleados.size) {
    html += `<div class="aviso ojo">
      Dados de alta en esta sesión:
      ${Array.from(altasDeEmpleados.entries())
        .map(([cuil, nombre]) => `<code>${escapar(cuil)}</code> ${escapar(nombre)}`)
        .join(' · ')}.
      <strong>Bajá el reservorio de empleados</strong> y guardalo en la carpeta de la
      empresa: si no, el alta vive solo en este navegador y el mes que viene no está.
      ${estado.correcciones ? 'Si esta empresa está publicada, el archivo hay que volver a cifrarlo.' : ''}
    </div>`;
  }

  if (aceptados.size) {
    html += `<div class="aviso ojo">
      Sumados al reservorio en esta sesión:
      ${Array.from(aceptados.entries())
        .map(([cod, arca]) => `<code>${escapar(cod)}</code> → <code>${escapar(arca)}</code>`)
        .join(' · ')}.
      <strong>Bajá el reservorio actualizado</strong> para no perderlos.
      Ojo: sumarlo acá no lo crea en ARCA. El concepto también hay que darlo de
      alta en el módulo <strong>CONCEPTOS</strong> del servicio, o el archivo
      vuelve con «Código de concepto inexistente».
    </div>`;
  }

  html += `<div class="botonera">
      <button id="bajar-conceptos" class="suave">Bajar el reservorio de conceptos</button>
      <button id="bajar-padron" class="suave">Bajar el reservorio de empleados</button>
    </div>`;

  caja.innerHTML = html;

  caja.querySelectorAll('[data-aceptar]').forEach((boton) =>
    boton.addEventListener('click', () => aceptarConcepto(boton.dataset.aceptar))
  );
  caja.querySelectorAll('[data-alta]').forEach((boton) =>
    boton.addEventListener('click', () => altaDeEmpleado(boton.dataset.alta))
  );
  if ($('bajar-conceptos')) $('bajar-conceptos').addEventListener('click', bajarConceptos);
  if ($('bajar-padron')) $('bajar-padron').addEventListener('click', bajarPadron);
}

/* ---------- El alta de un empleado ---------- */

/*
 * Qué se pregunta y qué se hereda.
 *
 * La planilla del mes trae CUIL, nombre, legajo e importes. Todo lo que pide el
 * registro 04 —obra social, modalidad, condición, localidad, CBU, forma de
 * pago— sale del alta en Simplificación Registral, no de la liquidación. Por eso
 * un empleado nuevo entra con el registro 04 en ceros y ARCA rechaza el archivo.
 *
 * Pero la mayoría de esos campos es de la EMPRESA, no de la persona: en
 * Nautical, dieciocho de veintiocho son idénticos en los diecinueve empleados.
 * Esos se heredan sin preguntar. De los que varían, casi todos tienen dos o
 * tres valores en uso y se eligen de una lista.
 *
 * Así un alta son seis o siete datos, no veintiocho. Y los que se eligen de la
 * lista no se pueden tipear mal.
 */
const ORDEN_DEL_ALTA = [
  'legajo', 'cbu', 'formaPago', 'obraSocial', 'dependencia', 'provincia',
  'localidad', 'conyuge', 'hijos', 'adherentes', 'marcaCCT',
  'fechaIngreso', 'basico', 'grupo',
];

/** Un campo con pocos valores distintos se elige; el resto se escribe. */
const TOPE_DE_LISTA = 6;

function pintarAltaDeEmpleados(empleados) {
  const visto = valoresDelReservorio(estado.padron);
  const heredados = Object.keys(visto).filter((k) => visto[k].igualEnTodos);

  let html = `<h3 class="subtitulo">Empleados que no están en el reservorio</h3>
    <p class="nota">
      Sin estos datos el registro 04 sale en ceros y ARCA rechaza el archivo:
      la obra social, la modalidad, la condición y la localidad salen del alta,
      no de la liquidación.
    </p>`;

  if (heredados.length) {
    html += `<p class="nota">
      No hace falta cargarlos todos. <strong>${heredados.length} campos</strong> son
      iguales en los ${estado.padron.size} empleados de esta empresa y se heredan solos:
      ${heredados.map((k) => `<code>${escapar(ENCABEZADOS_PADRON[k] || k)}</code>`).join(' · ')}.
    </p>`;
  }

  for (const e of empleados) {
    html += `<div class="novedad">
      <div class="novedad-titulo">
        <code>${escapar(e.cuil)}</code> ${escapar(e.nombre || 'sin nombre')}
        ${e.legajo ? `<span class="marca bien">legajo ${escapar(e.legajo)}</span>` : ''}
      </div>
      <div class="campos">`;

    for (const clave of ORDEN_DEL_ALTA) {
      const datos = visto[clave];
      if (datos && datos.igualEnTodos) continue;        /* se hereda */
      const etiqueta = ENCABEZADOS_PADRON[clave] || clave;
      const id = `alta-${e.cuil}-${clave}`;
      /* El legajo ya lo trae la planilla: se propone y se puede corregir. */
      const propuesto = clave === 'legajo' ? e.legajo || '' : '';

      if (datos && datos.valores.length <= TOPE_DE_LISTA) {
        const opciones = datos.valores
          .map(
            (v) =>
              `<option value="${escapar(v.valor)}"${v.valor === datos.predominante ? ' selected' : ''}>${
                escapar(v.valor)} — ${v.n} de ${estado.padron.size}</option>`
          )
          .join('');
        html += `<div>
          <label for="${id}">${escapar(etiqueta)}
            <span class="ayuda">lo que usan los demás</span>
          </label>
          <select id="${id}">${opciones}<option value="">(otro, a mano)</option></select>
        </div>`;
      } else {
        html += `<div>
          <label for="${id}">${escapar(etiqueta)}${
            clave === 'cbu' ? ' <span class="ayuda">22 dígitos, o vacío si cobra en efectivo</span>' : ''
          }</label>
          <input type="text" id="${id}" value="${escapar(propuesto)}">
        </div>`;
      }
    }

    html += `<div style="align-self:end">
          <button class="suave" data-alta="${escapar(e.cuil)}">Dar de alta en el reservorio</button>
        </div>
      </div>
    </div>`;
  }

  return html;
}

/**
 * Da de alta al empleado: lo que se eligió en pantalla, más lo que es igual
 * para toda la empresa.
 *
 * Queda guardado en esta computadora, pero **el reservorio de verdad es el
 * archivo**: por eso abajo insiste con bajarlo. Si no se baja, el alta vive
 * solo en este navegador y el mes que viene no está.
 */
function altaDeEmpleado(cuil) {
  const nuevo = empleadosNuevos(estado.liquidacion, estado.padron).find((e) => e.cuil === cuil);
  if (!nuevo) return;

  const visto = valoresDelReservorio(estado.padron);
  const datos = {};

  /* Primero lo que es de la empresa. */
  for (const [clave, d] of Object.entries(visto)) {
    if (d.igualEnTodos) datos[clave] = d.predominante;
  }
  /* Después lo que se cargó, que manda sobre lo heredado. */
  for (const clave of ORDEN_DEL_ALTA) {
    const campo = $(`alta-${cuil}-${clave}`);
    if (!campo) continue;
    const valor = String(campo.value || '').trim();
    if (valor) datos[clave] = valor;
  }
  if (nuevo.nombre) datos.apellidoNombre = nuevo.nombre;

  const formaPago = soloDigitos(datos.formaPago || '');
  if (!formaPago || !FORMAS_DE_PAGO[formaPago]) {
    alert('La forma de pago tiene que ser 1 efectivo, 2 cheque, 3 acreditación o 4 pago externo.');
    return;
  }
  if (formaPago === '3' && soloDigitos(datos.cbu || '').length !== 22) {
    alert('Cobra por acreditación, así que el CBU es obligatorio y tiene que tener 22 dígitos.');
    return;
  }

  if (!estado.padron) estado.padron = new Map();
  estado.padron.set(cuil, datos);
  guardarPadron(cuitDeLaPantalla(), estado.padron);
  altasDeEmpleados.set(cuil, nuevo.nombre || cuil);

  pintarResumenPaso2();
  recalcular();
}

/**
 * Suma un concepto nuevo al reservorio con el código ARCA que se haya
 * confirmado. Los subsistemas se arman según el tipo, que es la regla del
 * Anexo I: los remunerativos van con todo en 1 y los descuentos con todo en 0.
 */
function aceptarConcepto(codigo) {
  const campo = $('arca-' + codigo);
  const arca = campo ? campo.value.trim() : '';

  if (!/^\d{6}$/.test(arca)) {
    alert('El concepto ARCA tiene que ser un código de seis dígitos.');
    return;
  }
  const tipo = tipoDeConcepto(arca);
  if (!tipo) {
    alert(`El código ${arca} no cae en ninguno de los tres rangos de ARCA.`);
    return;
  }

  /* Los remunerativos llevan todos los subsistemas en 1, salvo regímenes
     diferenciales y especiales; los descuentos, todos en 0. Es la regla del
     Anexo I y es lo que evita el rechazo más común al importar. */
  const subsistemas = {};
  const marcarTodos = tipo === 'REMUNERATIVO';
  for (const s of SUBSISTEMAS) subsistemas[s] = marcarTodos;
  if (marcarTodos) {
    subsistemas.aporteDiferencial = false;
    subsistemas.aporteEspecial = false;
    subsistemas.aporteRENATEA = false;
    subsistemas.contribRENATEA = false;
  }

  if (!estado.parametrizacion) estado.parametrizacion = new Map();
  const nuevo = conceptosNuevos(estado.liquidacion, estado.parametrizacion).find((c) => c.codigo === codigo);
  estado.parametrizacion.set(codigo, {
    codigoArca: arca,
    subsistemas,
    repetible: false,
    descripcion: nuevo ? nuevo.descripcion : '',
  });
  aceptados.set(codigo, arca);
  pintarResumenPaso2();
  recalcular();
}

function bajarTexto(texto, nombre) {
  const avisos = [];
  const bytes = aWindows1252(texto, avisos);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function nombreDeEmpresa() {
  const cuit = soloDigitos($('cuit').value) || 'empresa';
  return cuit;
}

function bajarConceptos() {
  if (!estado.parametrizacion || !estado.parametrizacion.size) {
    alert('Todavía no hay conceptos cargados.');
    return;
  }
  bajarTexto(csvDeConceptos(estado.parametrizacion), `Conceptos ${nombreDeEmpresa()}.csv`);
}

function bajarPadron() {
  const padron = estado.padron || new Map();
  const agregados = sumarEmpleadosAlReservorio(padron, estado.liquidacion);
  estado.padron = padron;
  bajarTexto(csvDePadron(padron), `Empleados ${nombreDeEmpresa()}.csv`);
  if (agregados) {
    pintarResumenPaso2();
    pintarNovedades();
  }
}

/* ---------- Las liquidaciones del período ---------- */

/*
 * El sistema de sueldos exporta el mes entero, y un mes puede tener más de una
 * liquidación: los haberes y una final por una baja. Un mismo trabajador puede
 * estar en las dos.
 *
 * LSD arma UN archivo por período, así que las dos se juntan en una. Lo que no
 * se puede es mandar el mismo concepto dos veces para el mismo CUIL: eso se
 * consolida sumando, salvo que la parametrización marque el concepto como
 * repetible. De eso se ocupa `consolidarConceptos` en el núcleo; acá solo se
 * muestra qué se juntó.
 */
function liquidacionesDeLaPlanilla() {
  const i = estado.columnas ? estado.columnas.liquidacionOrigen : undefined;
  if (i === undefined || !estado.filas) return [];

  const grupos = new Map();
  for (const fila of estado.filas) {
    const nombre = String(fila[i] === null || fila[i] === undefined ? '' : fila[i]).trim() || '(sin nombre)';
    grupos.set(nombre, (grupos.get(nombre) || 0) + 1);
  }
  return Array.from(grupos.entries()).map(([nombre, filas]) => ({ nombre, filas }));
}

function pintarSelectorLiquidacion() {
  const caja = $('selector-liquidacion');
  if (!caja) return;

  const grupos = liquidacionesDeLaPlanilla();
  if (grupos.length < 2) {
    caja.innerHTML = '';
    return;
  }

  caja.innerHTML = `<div class="aviso ojo">
      La planilla trae <strong>${grupos.length} liquidaciones</strong> del período
      y se juntan en un solo archivo:
      ${grupos.map((g) => `<strong>${escapar(g.nombre)}</strong> (${g.filas} filas)`).join(' y ')}.
      Si un trabajador está en las dos, sus conceptos repetidos se suman en un
      renglón; el detalle de qué se juntó está en el control del paso 5.
    </div>`;
}

/* ---------- El ciclo ---------- */

function recalcular() {
  if (!estado.filas) {
    pintarColumnas();
    pintarControl();
    pintarArchivo();
    return;
  }

  const deteccion = detectarColumnas(estado.encabezados, estado.perfil);
  estado.columnas = deteccion.columnas;
  estado.sinAsignar = deteccion.sinAsignar;

  pintarSelectorLiquidacion();

  const avisos = [];
  estado.liquidacion = armarLiquidacion(
    estado.filas,
    estado.columnas,
    leerCabecera(),
    avisos,
    estado.perfil,
    {
      parametrizacion: estado.parametrizacion,
      padron: estado.padron,
      excluidos: leerExcluidos(),
    }
  );

  const parametros = leerParametros();
  /* Si el control se rompe, tiene que verse: taparlo con el catch de la carga
     deja la pantalla en verde con los hallazgos del intento anterior. */
  try {
    estado.hallazgos = controlar(estado.liquidacion, estado.parametrizacion, parametros);
  } catch (error) {
    estado.hallazgos = [
      { nivel: 'error', cuil: '', mensaje: `El control se interrumpió: ${error.message}` },
    ];
  }
  for (const a of avisos) estado.hallazgos.push({ nivel: 'aviso', cuil: '', mensaje: a });

  /* El aviso del tope se genera al calcular, no al controlar. */
  const avisosCalculo = [];
  for (const t of estado.liquidacion.trabajadores) {
    calcularBases(t, estado.parametrizacion, parametros, avisosCalculo);
  }
  for (const a of Array.from(new Set(avisosCalculo))) {
    estado.hallazgos.push({ nivel: 'aviso', cuil: '', mensaje: a });
  }

  try {
    estado.archivo = generarTxt(estado.liquidacion, parametros);
  } catch (error) {
    estado.archivo = null;
    estado.hallazgos.unshift({ nivel: 'error', cuil: '', mensaje: `No se pudo escribir el archivo: ${error.message}` });
  }

  registrarCreditoFiscal();

  pintarColumnas();
  pintarControl();
  pintarArchivo();
  pintarNovedades();
}

/*
 * El credito fiscal del decreto 814 se calcula y se GUARDA en cada armado.
 *
 * Se hace aca, y no en una pantalla aparte, porque en este punto ya esta todo:
 * la REM 10 de cada trabajador y la provincia que trajo el reservorio de
 * empleados. Pedirle que cargue la planilla de nuevo en otra pagina para
 * recalcular lo mismo seria hacerle hacer dos veces el mismo trabajo.
 *
 * Lo guardado se consulta despues en `credito.html`, por empleador y periodo.
 */
function registrarCreditoFiscal() {
  estado.credito = null;
  if (typeof calcularCredito !== 'function' || !estado.liquidacion) return;

  const trabajadores = estado.liquidacion.trabajadores || [];
  if (!trabajadores.length) return;

  const porCuil = new Map();
  for (const t of trabajadores) porCuil.set(String(t.cuil), t.provincia || '');

  /*
   * La provincia del trabajador manda sobre la de la empresa. Nautical tiene
   * gente en dos provincias y la columna del padron es la unica forma de
   * saberlo; Prado y Barbano trabajan todos en Chubut y seria copiar el mismo
   * dato en cada fila. Si alguna vez el padron de ellos trae la columna, gana
   * el padron sin tocar nada.
   */
  const deLaEmpresa = estado.provinciaDeLaEmpresa || '';
  const resultado = calcularCredito(trabajadores, (cuil) => {
    const propia = porCuil.get(String(cuil)) || '';
    if (propia) return { provincia: propia, origen: 'empleado' };
    return deLaEmpresa ? { provincia: deLaEmpresa, origen: 'empresa' } : { provincia: '', origen: '' };
  });
  estado.credito = resultado;

  const cab = leerCabecera();
  const nombre = (($('empleador') || {}).selectedOptions || [])[0];
  guardarCredito(cab.cuit, cab.periodo, nombre ? nombre.textContent : '', resultado);
}

conectarSoltar('soltar-parametrizacion', 'archivo-parametrizacion', cargarParametrizacion);
conectarSoltar('soltar-padron', 'archivo-padron', cargarPadron);
conectarSoltar('soltar-planilla', 'archivo-planilla', cargarPlanilla);

if (!memoriaDisponible()) {
  $('detalle-parametrizacion').innerHTML =
    '<div class="aviso ojo">Este navegador no deja guardar nada en esta computadora ' +
    '—suele pasar en una ventana privada—, así que los reservorios hay que soltarlos ' +
    'en cada sesión.</div>';
}

/* Si el CUIT ya viene escrito, los reservorios se recuperan sin tocar nada. */
llenarListaDeEmpleadores();
recuperarReservorios();
sugerirPeriodo();
pintarResumenDatos();
pintarResumenPaso2();
recalcular();
