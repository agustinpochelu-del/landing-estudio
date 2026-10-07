/**
 * Los reservorios: lo que se acumula y se reusa mes a mes.
 *
 * Son dos archivos por empresa, más una tabla de parámetros que es común a
 * todas:
 *
 *   EMPLEADOS   una fila por CUIL con todo el registro 04 salvo los importes
 *               que salen de sumar conceptos. Están todos los empleados,
 *               hayan trabajado o no en el período que se está armando.
 *
 *   CONCEPTOS   la parametrización: cada concepto del empleador con su
 *               concepto ARCA y sus subsistemas. Los que ya están no cambian;
 *               cada tanto aparece uno nuevo y se suma.
 *
 *   TOPES       el tope de ANSeS de cada período. Vive en `topes.js` porque
 *               no depende de la empresa.
 *
 * ── Qué hace este archivo ─────────────────────────────────────────────────
 *
 * Detecta las NOVEDADES de cada mes —empleados y conceptos que aparecen en la
 * liquidación y no están en el reservorio—, propone a qué concepto ARCA
 * asignar los conceptos nuevos, y exporta los reservorios actualizados.
 *
 * ── Cómo se propone un concepto nuevo ─────────────────────────────────────
 *
 * Los empleadores numeran sus conceptos por bandas: los haberes en una, los
 * aportes en otra, las contribuciones en otra. En Nautical, por ejemplo, del 1
 * al 199 son haberes, del 200 al 299 aportes y retenciones sindicales, y del
 * 600 al 699 contribuciones patronales.
 *
 * Pero esas bandas **no se cablean acá**: se deducen del propio reservorio de
 * cada empresa. Son tres empresas distintas y no tienen por qué numerar igual,
 * y una tabla inventada produciría asignaciones que ARCA rechaza.
 *
 * La propuesta **nunca se aplica sola**. Se muestra, se confirma, y recién ahí
 * entra al reservorio. Es la regla 1 del proyecto: no se inventan datos de un
 * formato.
 */

/* ---------- Las bandas de cada empresa ---------- */

/** A qué banda de cien pertenece un código de concepto del empleador. */
function bandaDe(codigo) {
  const n = Number(String(codigo).replace(/[^0-9]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.floor(n / 100) * 100;
}

/**
 * Arma el mapa de bandas a partir de la parametrización que ya existe.
 * Para cada banda devuelve qué conceptos ARCA se usaron y cuántas veces.
 */
function bandasDeConceptos(parametrizacion) {
  const bandas = new Map();
  if (!parametrizacion) return bandas;

  for (const [codigo, par] of parametrizacion) {
    const banda = bandaDe(codigo);
    if (banda === null) continue;
    if (!bandas.has(banda)) bandas.set(banda, { banda, total: 0, porArca: new Map(), porTipo: new Map() });
    const b = bandas.get(banda);
    b.total += 1;
    b.porArca.set(par.codigoArca, (b.porArca.get(par.codigoArca) || 0) + 1);
    const tipo = tipoDeConcepto(par.codigoArca) || '?';
    b.porTipo.set(tipo, (b.porTipo.get(tipo) || 0) + 1);
  }

  /* El dominante de cada banda, y qué parte del total representa. */
  for (const b of bandas.values()) {
    let mejorArca = null;
    let mejorArcaN = 0;
    for (const [arca, n] of b.porArca) if (n > mejorArcaN) { mejorArca = arca; mejorArcaN = n; }
    let mejorTipo = null;
    let mejorTipoN = 0;
    for (const [tipo, n] of b.porTipo) if (n > mejorTipoN) { mejorTipo = tipo; mejorTipoN = n; }

    b.arcaDominante = mejorArca;
    b.arcaProporcion = b.total ? mejorArcaN / b.total : 0;
    b.tipoDominante = mejorTipo;
    b.tipoProporcion = b.total ? mejorTipoN / b.total : 0;
  }

  return bandas;
}

/**
 * Propone a qué concepto ARCA asignar un código nuevo.
 *
 * Hay dos señales, y una vale mucho más que la otra:
 *
 *   **La descripción.** Si el concepto nuevo se llama igual que uno que ya
 *   está parametrizado, casi seguro va al mismo lado. El caso típico son los
 *   conceptos que se duplican por convenio o por sucursal: en Nautical, el
 *   105 y el 110 son los dos "Adicional tareas mantenimiento", y el 204 y el
 *   206 son los dos "Sindicato".
 *
 *   **La banda de cien.** Dice el TIPO con bastante certeza —haberes,
 *   aportes, contribuciones— pero no el código exacto. La banda 100–199 de
 *   Nautical es 85% `110000`, y sin embargo el 105 va a `160000`. Por eso la
 *   banda nunca alcanza para dar una propuesta por firme.
 *
 * En los dos casos es una propuesta. Se muestra con lo que la respalda y con
 * las alternativas de la banda, y se confirma a mano.
 */
function sugerirConcepto(codigo, parametrizacion, descripcion) {
  const banda = bandaDe(codigo);
  const bandas = bandasDeConceptos(parametrizacion);
  const b = bandas.get(banda);

  const vistos = b
    ? Array.from(b.porArca.entries())
        .sort((x, y) => y[1] - x[1])
        .map(([arca, n]) => ({ arca, n, nombre: nombreDeConcepto(arca) || 'sin nombre en el Anexo I' }))
    : [];

  /* Primero: ¿hay otro concepto que se llame igual? */
  const buscado = normalizarEncabezado(descripcion || '');
  if (buscado && parametrizacion) {
    const gemelos = [];
    for (const [otroCodigo, par] of parametrizacion) {
      if (normalizarEncabezado(par.descripcion || '') === buscado) gemelos.push({ otroCodigo, par });
    }
    /* Solo sirve si todos los homónimos coinciden en el código ARCA. */
    const codigos = new Set(gemelos.map((g) => g.par.codigoArca));
    if (gemelos.length && codigos.size === 1) {
      const arca = gemelos[0].par.codigoArca;
      return {
        banda,
        hay: true,
        codigoArca: arca,
        tipo: tipoDeConcepto(arca),
        vistos,
        confianza: 'por nombre',
        motivo:
          `El concepto ${gemelos.map((g) => g.otroCodigo).join(' y el ')} se llama igual ` +
          `("${gemelos[0].par.descripcion}") y va al ${arca}.`,
      };
    }
  }

  /* Después: la banda, que dice el tipo pero no el código. */
  if (!b || b.total < 3) {
    return {
      banda,
      hay: false,
      vistos,
      motivo: b
        ? `La banda ${banda}–${banda + 99} tiene solo ${b.total} concepto${b.total === 1 ? '' : 's'} cargado${b.total === 1 ? '' : 's'} y ninguno se llama igual: no alcanza para proponer nada.`
        : `No hay ningún concepto cargado en la banda ${banda}–${banda + 99}.`,
    };
  }

  const tipoSeguro = b.tipoProporcion >= 0.8;
  return {
    banda,
    hay: true,
    /* El código dominante se ofrece como punto de partida, nunca como certeza. */
    codigoArca: b.arcaDominante,
    tipo: tipoSeguro ? b.tipoDominante : null,
    vistos,
    total: b.total,
    confianza: tipoSeguro ? 'por banda' : 'baja',
    motivo: tipoSeguro
      ? `Ninguno se llama igual. En la banda ${banda}–${banda + 99} hay ${b.total} conceptos y ${Math.round(
          b.tipoProporcion * 100
        )}% son ${b.tipoDominante.toLowerCase()}; el más usado es el ${b.arcaDominante}, pero la banda no alcanza para asegurar el código.`
      : `La banda ${banda}–${banda + 99} mezcla tipos y ninguno se llama igual: hay que elegir a mano.`,
  };
}

/* ---------- Las novedades del mes ---------- */

/**
 * Conceptos que aparecen en la liquidación y no están en el reservorio.
 * Vienen con su propuesta y con cuánto suman, para poder priorizar.
 */
function conceptosNuevos(liquidacion, parametrizacion) {
  const nuevos = new Map();
  for (const t of liquidacion.trabajadores) {
    for (const c of t.conceptos) {
      if (parametrizacion && parametrizacion.has(c.codigo)) continue;
      if (!nuevos.has(c.codigo)) {
        nuevos.set(c.codigo, {
          codigo: c.codigo,
          descripcion: c.descripcion,
          veces: 0,
          total: 0,
          cuiles: new Set(),
        });
      }
      const n = nuevos.get(c.codigo);
      n.veces += 1;
      n.total += (c.debitoCredito === 'D' ? -1 : 1) * c.importe;
      n.cuiles.add(t.cuil);
      if (!n.descripcion && c.descripcion) n.descripcion = c.descripcion;
    }
  }

  return Array.from(nuevos.values())
    .map((n) =>
      Object.assign(n, {
        cuiles: n.cuiles.size,
        sugerencia: sugerirConcepto(n.codigo, parametrizacion, n.descripcion),
      })
    )
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/**
 * Conceptos de ESTA liquidación que están en el reservorio pero todavía no
 * dados de alta en el servicio de ARCA.
 *
 * El reservorio de conceptos es una EXPORTACIÓN de lo que ARCA tiene
 * parametrizado. Una fila agregada a mano no es un hecho sino una promesa: la
 * aplicación la daba por buena —está en el reservorio, así que para ella está
 * parametrizada—, armaba el archivo sin una sola advertencia y el rechazo
 * «Código de concepto inexistente» aparecía recién en la pantalla de ARCA.
 * Pasó el 07/10/2026 con el 125 y el 532 de Nautical.
 *
 * La marca vive en `reservorios/indice.json`, en `sinAltaEnArca` de la empresa,
 * y no como una columna agregada al CSV: si alguna vez se vuelve a exportar ese
 * archivo desde el servicio, la columna agregada a mano desaparece sin aviso y
 * el aviso se cae solo. Es el mismo motivo por el que la provincia está en el
 * índice y no en el reservorio de empleados.
 *
 * `excluidos` manda sobre la marca: si el concepto no viaja en el archivo, ARCA
 * nunca lo va a ver y no hay nada que avisar.
 *
 * Devuelve solo los que aparecen en la liquidación —no toda la lista—, porque
 * lo que importa es si ESTE archivo va a rebotar.
 */
function conceptosSinAlta(liquidacion, parametrizacion, sinAlta, excluidos) {
  if (!liquidacion || !Array.isArray(liquidacion.trabajadores)) return [];

  /* Se comparan contra el código de la planilla, que llega como texto ya
     recortado: un número, o un texto con espacios, nunca daría igual. */
  const marcados = new Set((sinAlta || []).map((c) => String(c).trim()).filter(Boolean));
  if (!marcados.size) return [];
  const fuera = new Set((excluidos || []).map((c) => String(c).trim()).filter(Boolean));

  const encontrados = new Map();
  for (const t of liquidacion.trabajadores) {
    for (const c of t.conceptos || []) {
      const codigo = String(c.codigo === undefined ? '' : c.codigo).trim();
      if (!marcados.has(codigo) || fuera.has(codigo)) continue;
      if (!encontrados.has(codigo)) {
        /*
         * La descripción sale del reservorio, que es la que se ve al mirar la
         * parametrización. Si el concepto ni siquiera está mapeado, se usa la
         * de la planilla: algo hay que poder nombrar.
         */
        const enReservorio = parametrizacion && parametrizacion.get ? parametrizacion.get(codigo) : null;
        encontrados.set(codigo, {
          codigo,
          descripcion: (enReservorio && enReservorio.descripcion) || c.descripcion || '',
          codigoArca: (enReservorio && enReservorio.codigoArca) || '',
          enElReservorio: Boolean(enReservorio),
          veces: 0,
          total: 0,
          cuiles: new Set(),
        });
      }
      const e = encontrados.get(codigo);
      e.veces += 1;
      e.total += (c.debitoCredito === 'D' ? -1 : 1) * c.importe;
      e.cuiles.add(t.cuil);
    }
  }

  return Array.from(encontrados.values())
    .map((e) => Object.assign(e, { cuiles: e.cuiles.size }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/** Empleados que aparecen en la liquidación y no están en el reservorio. */
function empleadosNuevos(liquidacion, padron) {
  return liquidacion.trabajadores
    .filter((t) => !padron || !padron.has(t.cuil))
    .map((t) => ({ cuil: t.cuil, nombre: t.apellidoNombre || '', legajo: t.legajo || '' }));
}

/**
 * Qué valor tiene cada campo del reservorio en los empleados que ya están.
 *
 * Sirve para dar de alta a uno nuevo sin escribir veintiocho datos. En Nautical
 * **dieciocho de los veintiocho campos son idénticos en los diecinueve
 * empleados** —situación, condición, actividad, modalidad, siniestrado,
 * revista, días, horas, importe a detraer, las marcas—: esos no se preguntan,
 * se heredan. De los que varían, casi todos tienen dos o tres valores en uso,
 * así que se eligen de una lista en vez de tipearse.
 *
 * Lo que de verdad es propio de cada persona son el legajo y el CBU.
 *
 * Devuelve, por campo: los valores vistos con cuántas veces, cuál predomina, y
 * si es igual en todos.
 */
function valoresDelReservorio(padron) {
  const salida = {};
  if (!padron || !padron.size) return salida;

  for (const datos of padron.values()) {
    for (const [clave, valor] of Object.entries(datos)) {
      const texto = String(valor === null || valor === undefined ? '' : valor);
      if (!texto) continue;
      const cuenta = (salida[clave] = salida[clave] || new Map());
      cuenta.set(texto, (cuenta.get(texto) || 0) + 1);
    }
  }

  const final = {};
  for (const [clave, cuenta] of Object.entries(salida)) {
    const valores = Array.from(cuenta.entries())
      .map(([valor, n]) => ({ valor, n }))
      .sort((a, b) => b.n - a.n);
    final[clave] = {
      valores,
      predominante: valores[0].valor,
      /* Igual en todos solo si además lo trae TODO el padrón: un campo que
         está en cinco de diecinueve con el mismo valor no es un valor de la
         empresa, es un campo que casi nadie tiene cargado. */
      igualEnTodos: valores.length === 1 && valores[0].n === padron.size,
    };
  }
  return final;
}

/** Empleados del reservorio que no trabajaron en el período. Es normal. */
function empleadosSinLiquidacion(liquidacion, padron) {
  if (!padron) return [];
  const enLiquidacion = new Set(liquidacion.trabajadores.map((t) => t.cuil));
  return Array.from(padron.keys()).filter((cuil) => !enLiquidacion.has(cuil));
}

/* ---------- Exportar los reservorios ---------- */

function comillar(valor) {
  const texto = String(valor === null || valor === undefined ? '' : valor);
  return /[;"\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

function comoCsv(filas) {
  /* Con BOM, para que Excel lo abra en UTF-8 sin romper los acentos. */
  return '﻿' + filas.map((f) => f.map(comillar).join(';')).join('\r\n') + '\r\n';
}

/*
 * El reservorio de conceptos se escribe con los mismos encabezados que usa la
 * exportación del servicio, así que se puede volver a leer sin tocar nada y
 * se puede comparar contra una exportación nueva de LSD.
 */
const ENCABEZADOS_CONCEPTOS = [
  'Código AFIP', 'Descripción', 'Código contribuyente', 'Descripción', 'Marca repetible',
  'Aportes SIPA', 'Contribuciones SIPA', 'Aportes INSSJyP', 'Contribuciones INSSJyP',
  'Aportes obra social', 'Contribuciones obra social', 'Aportes FSR', 'Contribuciones FSR',
  'Aportes RENATEA', 'Contribuciones RENATEA', 'Contribuciones AAFF', 'Contribuciones FNE',
  'Contribuciones LRT', 'Aportes diferenciales', 'Aportes especiales',
];

const ORDEN_SUBSISTEMAS = [
  'aporteSIPA', 'contribSIPA', 'aporteINSSJyP', 'contribINSSJyP',
  'aporteOS', 'contribOS', 'aporteFSR', 'contribFSR',
  'aporteRENATEA', 'contribRENATEA', 'contribAAFF', 'contribFNE',
  'contribLRT', 'aporteDiferencial', 'aporteEspecial',
];

function csvDeConceptos(parametrizacion) {
  const filas = [ENCABEZADOS_CONCEPTOS];
  const codigos = Array.from(parametrizacion.keys()).sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true })
  );
  for (const codigo of codigos) {
    const par = parametrizacion.get(codigo);
    filas.push(
      [
        par.codigoArca,
        nombreDeConcepto(par.codigoArca) || '',
        codigo,
        par.descripcion || '',
        par.repetible ? '1' : '0',
      ].concat(ORDEN_SUBSISTEMAS.map((s) => (par.subsistemas[s] ? '1' : '0')))
    );
  }
  return comoCsv(filas);
}

/* Los encabezados del reservorio de empleados son los que el paso 4 muestra. */
const ENCABEZADOS_PADRON = {
  cuil: 'CUIL',
  apellidoNombre: 'Apellido y nombre',
  legajo: 'Legajo',
  /*
   * Estas dos no las pide el registro 04: las pide el LIQUIDADOR.
   *
   * La fecha de ingreso es la que hace que la antigüedad se calcule sola en vez
   * de cargarse a mano todos los meses, y el básico es lo único que cambia con
   * la paritaria. Sin ellas el liquidador no puede llenar las novedades y hay
   * que tipear el mes entero.
   *
   * Van acá y no en la ficha de la empresa porque son datos del empleado. El
   * armador no las mira: lee por nombre de encabezado y las ignora.
   */
  fechaIngreso: 'Fecha de ingreso',
  basico: 'Sueldo básico',
  /*
   * La categoría del convenio. Es la que dice contra qué renglón de la escala
   * se controla el piso. Si el empleador paga exactamente el básico de
   * convenio se puede deducir sola del importe; si paga por encima, no, y hay
   * que cargarla.
   */
  grupo: 'Grupo salarial',
  dependencia: 'Dependencia de revista',
  /* No va al registro 04: es para el crédito fiscal del decreto 814, que
     depende de dónde trabaja la persona. Lleva nombre igual porque se carga
     en el alta como todo lo demás. */
  provincia: 'Provincia',
  cbu: 'CBU',
  formaPago: 'Forma de pago',
  diasLiquidados: 'Días liquidados',
  conyuge: 'Cónyuge',
  hijos: 'Cantidad de hijos',
  marcaCCT: 'Marca CCT',
  marcaSCVO: 'Marca SCVO',
  marcaReduccion: 'Marca corresponde reducción',
  tipoEmpresa: 'Tipo empresa',
  situacion: 'Situación',
  condicion: 'Condición',
  actividad: 'Actividad',
  modalidad: 'Modalidad',
  siniestrado: 'Siniestrado',
  localidad: 'Código de localidad',
  revista1: 'Situación de revista 1',
  diaRevista1: 'Día inicio situación de revista 1',
  revista2: 'Situación de revista 2',
  diaRevista2: 'Día inicio situación de revista 2',
  revista3: 'Situación de revista 3',
  diaRevista3: 'Día inicio situación de revista 3',
  diasTrabajados: 'Días trabajados',
  horasTrabajadas: 'Horas trabajadas',
  obraSocial: 'Obra social',
  adherentes: 'Adherentes',
  aportePorcAdicional: 'Porcentaje de aporte adicional SS',
  contribTareaDiferencial: 'Contribución tarea diferencial',
  aporteAdicionalOS: 'Aporte adicional OS',
  contribAdicionalOS: 'Contribución adicional OS',
  baseDifAportesOS: 'Base diferencial aportes OS y FSR',
  baseDifContribOS: 'Base diferencial contribuciones OS y FSR',
  baseDifLRT: 'Base diferencial LRT',
  remMaternidad: 'Remuneración maternidad ANSeS',
  baseDifAporteSS: 'Base diferencial de aportes de Seg. Social',
  baseDifContribSS: 'Base diferencial de contribuciones de Seg. Social',
  importeDetraer: 'Importe a detraer',
  observaciones: 'Observaciones',
};

function csvDePadron(padron) {
  const claves = Object.keys(ENCABEZADOS_PADRON);
  const filas = [claves.map((k) => ENCABEZADOS_PADRON[k])];
  const cuiles = Array.from(padron.keys()).sort();
  for (const cuil of cuiles) {
    const d = padron.get(cuil);
    filas.push(claves.map((k) => (k === 'cuil' ? cuil : d[k] === undefined ? '' : d[k])));
  }
  return comoCsv(filas);
}

/**
 * Suma al reservorio de empleados lo que trajo la liquidación, para los CUIL
 * que todavía no estaban. Devuelve cuántos se agregaron.
 *
 * A los que ya estaban **no se les toca nada**: el reservorio es la fuente de
 * verdad de la relación laboral, y la planilla del mes solo trae importes.
 */
function sumarEmpleadosAlReservorio(padron, liquidacion) {
  let agregados = 0;
  for (const t of liquidacion.trabajadores) {
    if (padron.has(t.cuil)) continue;
    const datos = {};
    for (const campo of CAMPOS_PADRON) if (t[campo]) datos[campo] = t[campo];
    if (t.apellidoNombre) datos.apellidoNombre = t.apellidoNombre;
    padron.set(t.cuil, datos);
    agregados += 1;
  }
  return agregados;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    bandaDe,
    bandasDeConceptos,
    sugerirConcepto,
    conceptosNuevos,
    conceptosSinAlta,
    empleadosNuevos,
    valoresDelReservorio,
    empleadosSinLiquidacion,
    csvDeConceptos,
    csvDePadron,
    sumarEmpleadosAlReservorio,
    ENCABEZADOS_CONCEPTOS,
    ENCABEZADOS_PADRON,
  };
}
