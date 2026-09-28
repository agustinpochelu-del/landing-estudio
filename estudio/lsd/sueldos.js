/**
 * El núcleo del armador: de una planilla de liquidación al archivo TXT
 * del Libro de Sueldos Digital, con el control previo.
 *
 * Lo que hace, en orden:
 *
 *   1. Reconoce las columnas de la planilla (`detectarColumnas`).
 *   2. Arma el modelo: una liquidación con trabajadores, y cada trabajador
 *      con sus conceptos (`armarLiquidacion`).
 *   3. Calcula las bases imponibles a partir de los conceptos y de la
 *      parametrización, aplica los topes y las compara con lo declarado
 *      (`calcularBases`, `controlar`).
 *   4. Escribe el archivo (`generarTxt`).
 *
 * ── Dos reglas que atraviesan todo ────────────────────────────────────────
 *
 * **Los importes van en centavos enteros.** Nunca en punto flotante. Una
 * liquidación que no cierra por dos centavos es un archivo rechazado.
 *
 * **Nada se corrige en silencio.** Todo ajuste, truncado o valor deducido
 * queda listado para que se pueda auditar qué se cambió y por qué.
 */

/* ---------- Importes en centavos ---------- */

/**
 * Convierte a centavos enteros. Acepta número o texto con separadores
 * argentinos ("1.234,56") o ingleses ("1,234.56"), y el signo adelante
 * o atrás.
 */
function aCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
  }

  let s = String(valor).trim();
  if (!s) return 0;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  s = s.replace(/[$\sA-Za-z]/g, '');
  /* El signo puede venir adelante o atrás, según el sistema que exportó. */
  if (/-\s*$/.test(s)) { negativo = !negativo; s = s.replace(/-\s*$/, ''); }
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1); }
  if (!s) return 0;

  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    /* El separador decimal es el que aparece último. */
    if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (ultimaComa >= 0) {
    /* Una coma sola: decimal, salvo que agrupe de a tres (1,234,567). */
    const partes = s.split(',');
    const agrupador =
      partes.length > 2 ||
      (partes[1] && partes[1].length === 3 && partes[0].length <= 3 && /^\d+$/.test(partes[1]));
    s = agrupador ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ultimoPunto >= 0) {
    const partes = s.split('.');
    if (partes.length > 2) s = s.replace(/\./g, '');
    else if (partes[1] && partes[1].length === 3 && partes[0].length <= 3) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) * (negativo ? -1 : 1);
}

/** Muestra centavos como pesos, para pantalla. Nunca para el archivo. */
function comoPesos(centavos) {
  const n = Number(centavos) || 0;
  return (n / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------- CUIT / CUIL ---------- */

/** Deja solo los dígitos. */
function soloDigitos(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/[^0-9]/g, '');
}

/**
 * Verifica el dígito verificador de un CUIT/CUIL. Vale la pena hacerlo acá:
 * un CUIL mal tipeado es de los errores que ARCA devuelve al validar, y
 * encontrarlo antes de subir el archivo ahorra una vuelta entera.
 */
function cuilValido(valor) {
  const c = soloDigitos(valor);
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(c[i]) * pesos[i];
  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 11) verificador = 0;
  if (verificador === 10) verificador = 9;
  return verificador === Number(c[10]);
}

/* ---------- Fechas ---------- */

/*
 * Excel guarda las fechas como días contados desde el 30/12/1899. Cuando la
 * celda no tiene formato de fecha, el lector no puede saber que lo es y el
 * valor llega como número pelado: la exportación del sistema de sueldos trae
 * la fecha de liquidación como 46238, que es el 04/08/2026.
 *
 * El rango se acota a propósito: de 1990 a 2079. Un número de cinco cifras
 * fuera de eso es más probable que sea otra cosa mal mapeada que una fecha.
 */
const SERIE_EXCEL_MINIMA = 32874; /* 01/01/1990 */
const SERIE_EXCEL_MAXIMA = 65380; /* 31/12/2078 */

function serieExcelAFecha(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < SERIE_EXCEL_MINIMA || n > SERIE_EXCEL_MAXIMA) return null;
  const base = Date.UTC(1899, 11, 30);
  return new Date(base + Math.round(n) * 86400000);
}

/** Lleva una fecha a AAAAMMDD. Acepta Date, "2026-03-31", "31/03/2026". */
function aFechaArca(valor) {
  if (!valor) return '';
  if (valor instanceof Date && !isNaN(valor)) {
    /*
     * En UTC, no en hora local. El lector arma las fechas de Excel con
     * Date.UTC, así que el 04/08/2026 queda como medianoche UTC; leído con
     * getFullYear/getMonth/getDate desde Argentina (GMT-3) da el 3 de agosto.
     * Un día de menos en la fecha de pago es un dato mal informado.
     */
    const a = valor.getUTCFullYear();
    const m = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(valor.getUTCDate()).padStart(2, '0');
    return `${a}${m}${d}`;
  }

  /* Serie de Excel: solo si el valor es un número entero suelto. */
  if (/^\d{5}(\.0+)?$/.test(String(valor).trim())) {
    const fecha = serieExcelAFecha(valor);
    if (fecha) {
      return (
        fecha.getUTCFullYear() +
        String(fecha.getUTCMonth() + 1).padStart(2, '0') +
        String(fecha.getUTCDate()).padStart(2, '0')
      );
    }
  }

  const texto = String(valor).trim();
  let m = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0');
  m = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return m[3] + m[2].padStart(2, '0') + m[1].padStart(2, '0');
  const digitos = soloDigitos(texto);
  if (digitos.length === 8) return digitos;
  return '';
}

/** Lleva un período a AAAAMM. Acepta "2026-03", "03/2026", Date. */
function aPeriodoArca(valor) {
  if (!valor) return '';
  /* En UTC, por el mismo motivo que en aFechaArca. */
  if (valor instanceof Date && !isNaN(valor)) {
    return `${valor.getUTCFullYear()}${String(valor.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (/^\d{5}(\.0+)?$/.test(String(valor).trim())) {
    const fecha = serieExcelAFecha(valor);
    if (fecha) {
      return fecha.getUTCFullYear() + String(fecha.getUTCMonth() + 1).padStart(2, '0');
    }
  }
  const texto = String(valor).trim();
  let m = texto.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return m[1] + m[2].padStart(2, '0');
  m = texto.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return m[2] + m[1].padStart(2, '0');
  const digitos = soloDigitos(texto);
  if (digitos.length === 6) return digitos;
  if (digitos.length === 8) return digitos.slice(0, 6);
  return '';
}

/* ---------- Reconocimiento de columnas ---------- */

/** Baja un encabezado a minúscula sin acentos ni puntuación. */
function normalizarEncabezado(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/*
 * Sinónimos generales. Los perfiles de origen (`perfiles.js`) suman los suyos
 * sin tocar esta tabla.
 */
const SINONIMOS = {
  cuil: ['cuil', 'cuil empleado', 'cuil trabajador', 'cuil del trabajador', 'nro cuil'],
  apellidoNombre: ['apellido y nombre', 'apellido nombre', 'nombre', 'empleado', 'trabajador'],
  legajo: ['legajo', 'nro legajo', 'numero de legajo'],
  /* Las dos columnas que el reservorio de empleados lleva para el liquidador y
     el armador no usa: desde cuándo trabaja y cuánto cobra de básico. */
  fechaIngreso: ['fecha de ingreso', 'fecha ingreso', 'fecha de alta'],
  basico: ['sueldo basico', 'basico', 'sueldo base'],
  grupo: ['grupo salarial', 'grupo', 'categoria'],
  dependencia: ['dependencia', 'dependencia de revista', 'sector', 'area'],
  /* Donde trabaja de verdad. No sale de la dependencia de revista: en
     Nautical hay cinco personas con dependencia Puerto Madryn que trabajan
     en Rio Negro. La usa el credito fiscal del decreto 814. */
  provincia: ['provincia', 'provincia de trabajo', 'jurisdiccion'],
  cbu: ['cbu'],
  diasLiquidados: ['dias liquidados', 'dias para proporcionar', 'dias proporcion'],
  fechaPago: ['fecha de pago', 'fecha pago'],
  formaPago: ['forma de pago', 'forma pago'],

  codigoConcepto: ['codigo concepto', 'codigo de concepto', 'concepto', 'cod concepto', 'codigo'],
  descripcionConcepto: ['descripcion concepto', 'descripcion del concepto', 'detalle', 'descripcion'],
  cantidad: ['cantidad', 'cant', 'unidades cantidad'],
  unidad: ['unidad', 'unidades'],
  importe: ['importe', 'monto', 'valor'],
  debitoCredito: ['debito credito', 'd c', 'debito o credito', 'signo'],
  periodoAjuste: ['periodo ajuste', 'periodo de ajuste', 'periodo retro'],
  /* Clasificación propia del sistema que exportó (haber, retención,
     no remunerativo, contribución). No va al archivo: la usa el perfil para
     decidir el débito/crédito y qué filas descartar. */
  tipoOrigen: ['tipo de concepto', 'tipo concepto'],
  /* Qué liquidación del período es cada fila. Tampoco va al archivo: LSD
     arma un archivo por liquidación, así que sirve para separarlas. */
  liquidacionOrigen: ['descripcion del pago', 'descripcion de tipo de liquidacion'],

  conyuge: ['conyuge'],
  hijos: ['hijos', 'cantidad de hijos'],
  marcaCCT: ['marca cct', 'cct', 'trabajador en cct'],
  marcaSCVO: ['marca scvo', 'scvo'],
  marcaReduccion: ['marca corresponde reduccion', 'corresponde reduccion', 'reduccion'],
  tipoEmpresa: ['tipo empresa', 'tipo de empresa', 'tipo empleador', 'tipo de empleador'],
  situacion: ['situacion', 'codigo situacion', 'cod situacion'],
  condicion: ['condicion', 'codigo condicion', 'cod condicion'],
  actividad: ['actividad', 'codigo actividad', 'cod actividad'],
  modalidad: ['modalidad', 'modalidad contratacion', 'codigo modalidad contratacion'],
  siniestrado: ['siniestrado', 'codigo siniestrado', 'cod siniestrado'],
  localidad: ['localidad', 'codigo de localidad', 'cod localidad', 'zona'],
  revista1: ['situacion de revista 1', 'revista 1', 'sit revista 1'],
  diaRevista1: ['dia inicio situacion de revista 1', 'dia revista 1', 'dia inicio 1'],
  revista2: ['situacion de revista 2', 'revista 2', 'sit revista 2'],
  diaRevista2: ['dia inicio situacion de revista 2', 'dia revista 2', 'dia inicio 2'],
  revista3: ['situacion de revista 3', 'revista 3', 'sit revista 3'],
  diaRevista3: ['dia inicio situacion de revista 3', 'dia revista 3', 'dia inicio 3'],
  diasTrabajados: ['dias trabajados', 'cant dias trabajados', 'cantidad dias trabajados'],
  horasTrabajadas: ['horas trabajadas', 'cant horas trabajadas'],
  obraSocial: ['obra social', 'codigo obra social', 'cod obra social'],
  adherentes: ['adherentes', 'cantidad adherentes', 'cant adherentes'],

  /* Campos del registro 04 que no salen de sumar conceptos: son datos de la
     relación laboral y viven en el reservorio de empleados. */
  aportePorcAdicional: ['porcentaje de aporte adicional ss', 'aporte adicional ss', 'aporte adicional porcentaje'],
  contribTareaDiferencial: ['contribucion tarea diferencial', 'tarea diferencial'],
  aporteAdicionalOS: ['aporte adicional os', 'aporte adicional obra social'],
  contribAdicionalOS: ['contribucion adicional os', 'contribucion adicional obra social'],
  baseDifAportesOS: ['base diferencial aportes os y fsr', 'base diferencial aportes os'],
  baseDifContribOS: ['base diferencial contribuciones os y fsr', 'base diferencial contribuciones os'],
  baseDifLRT: ['base diferencial lrt'],
  remMaternidad: ['remuneracion maternidad anses', 'remuneracion maternidad'],
  baseDifAporteSS: ['base diferencial de aportes de seg social', 'base diferencial aportes seg social'],
  baseDifContribSS: ['base diferencial de contribuciones de seg social', 'base diferencial contribuciones seg social'],

  remBruta: ['remuneracion bruta', 'rem bruta', 'bruto', 'total remuneracion'],
  rem1: ['base imponible 1', 'rem 1', 'rem1', 'remuneracion 1'],
  rem2: ['base imponible 2', 'rem 2', 'rem2', 'remuneracion 2'],
  rem3: ['base imponible 3', 'rem 3', 'rem3', 'remuneracion 3'],
  rem4: ['base imponible 4', 'rem 4', 'rem4', 'remuneracion 4'],
  rem5: ['base imponible 5', 'rem 5', 'rem5', 'remuneracion 5'],
  rem6: ['base imponible 6', 'rem 6', 'rem6', 'remuneracion 6'],
  rem7: ['base imponible 7', 'rem 7', 'rem7', 'remuneracion 7'],
  rem8: ['base imponible 8', 'rem 8', 'rem8', 'remuneracion 8'],
  rem9: ['base imponible 9', 'rem 9', 'rem9', 'remuneracion 9'],
  rem10: ['base imponible 10', 'rem 10', 'rem10', 'remuneracion 10'],
  importeDetraer: ['importe a detraer', 'detraccion', 'importe detraer'],
  observaciones: ['observaciones', 'observacion'],
};

/**
 * Empareja los encabezados de la planilla con los campos del modelo.
 * Devuelve { columnas: {campo: indice}, sinAsignar: [encabezados] }.
 *
 * Primero busca coincidencia exacta y después que el encabezado empiece
 * con el sinónimo, que es lo que salva los "Importe $" y los "CUIL Nro.".
 */
function detectarColumnas(encabezados, perfil) {
  const normalizados = encabezados.map(normalizarEncabezado);
  const columnas = {};
  const usados = new Set();

  /*
   * Un perfil puede BLOQUEAR un campo. Hace falta porque hay exportaciones
   * con columnas que se llaman igual que un campo de LSD y significan otra
   * cosa: "Condición" que dice "Mensualizado" en vez del código de condición
   * de ARCA, o "Forma de pago" que dice "Depósito bancario" en vez de 3.
   * Dejarlas enganchar es peor que no reconocerlas: el archivo sale con un
   * dato que parece bien y está mal.
   */
  const bloqueados = new Set((perfil && perfil.ignorar) || []);

  const tabla = {};
  for (const campo of Object.keys(SINONIMOS)) {
    if (bloqueados.has(campo)) continue;
    const propios = perfil && perfil.sinonimos && perfil.sinonimos[campo] ? perfil.sinonimos[campo] : [];
    /* Los del perfil van primero: mandan sobre los generales. */
    tabla[campo] = propios.concat(SINONIMOS[campo]);
  }

  for (const modo of ['exacto', 'empieza']) {
    for (const campo of Object.keys(tabla)) {
      if (columnas[campo] !== undefined) continue;
      for (const alias of tabla[campo]) {
        const i = normalizados.findIndex((h, idx) => {
          if (usados.has(idx) || !h) return false;
          return modo === 'exacto' ? h === alias : h.startsWith(alias);
        });
        if (i >= 0) { columnas[campo] = i; usados.add(i); break; }
      }
    }
  }

  const sinAsignar = encabezados
    .map((h, i) => ({ h, i }))
    .filter((c) => c.h && !usados.has(c.i))
    .map((c) => c.h);

  return { columnas, sinAsignar };
}

/* ---------- El modelo ---------- */

/** Lee una celda por nombre de campo, o devuelve '' si la columna no está. */
function celda(fila, columnas, campo) {
  const i = columnas[campo];
  if (i === undefined) return '';
  const v = fila[i];
  return v === null || v === undefined ? '' : v;
}

/**
 * Arma la liquidación a partir de las filas de la planilla.
 *
 * La planilla viene en formato largo: una fila por concepto liquidado, con
 * los datos del trabajador repetidos. Los datos de trabajador se toman de la
 * primera fila de cada CUIL; si una fila posterior los trae distintos, se
 * avisa y se conserva el primero.
 *
 * `cabecera` son los datos que no vienen en la planilla y los pone el
 * usuario: CUIT, período, tipo y número de liquidación.
 */
function armarLiquidacion(filas, columnas, cabecera, avisos, perfil, opciones) {
  const config = opciones || {};
  const excluidos = new Set(config.excluidos || []);
  const trabajadores = new Map();
  const descartados = new Map();
  const discrepancias = new Map();
  let avisoDeSigno = false;
  const camposTrabajador = [
    'legajo', 'dependencia', 'cbu', 'diasLiquidados', 'fechaPago', 'formaPago',
    'conyuge', 'hijos', 'marcaCCT', 'marcaSCVO', 'marcaReduccion', 'tipoEmpresa',
    'situacion', 'condicion', 'actividad', 'modalidad', 'siniestrado', 'localidad',
    'revista1', 'diaRevista1', 'revista2', 'diaRevista2', 'revista3', 'diaRevista3',
    'diasTrabajados', 'horasTrabajadas', 'obraSocial', 'adherentes', 'observaciones',
    'apellidoNombre',
  ];
  const camposBase = ['remBruta', 'rem1', 'rem2', 'rem3', 'rem4', 'rem5', 'rem6', 'rem7', 'rem8', 'rem9', 'rem10', 'importeDetraer'];

  filas.forEach((fila, indice) => {
    const nroFila = indice + 2; /* +1 por el encabezado, +1 porque Excel cuenta desde 1 */
    const cuil = soloDigitos(celda(fila, columnas, 'cuil'));
    if (!cuil) return; /* fila vacía o de totales */

    /* La fecha se normaliza siempre igual, tanto al guardarla como al
       compararla contra las filas siguientes. Si no, la fila 2 guarda
       "20260630", la fila 3 trae "30/06/2026" y parecen distintas: la
       planilla queda llena de discrepancias que no existen. */
    const valorDeCampo = (campo) => {
      const bruto = celda(fila, columnas, campo);
      /* La fecha se pasa CRUDA: si la celda vino como Date, convertirla a
         texto antes la rompe y no hay forma de recuperarla. */
      if (campo === 'fechaPago') return aFechaArca(bruto);
      return String(bruto).trim();
    };

    if (!trabajadores.has(cuil)) {
      const t = { cuil, filaOrigen: nroFila, conceptos: [], declarado: {} };
      for (const campo of camposTrabajador) t[campo] = valorDeCampo(campo);
      for (const campo of camposBase) {
        const bruto = celda(fila, columnas, campo);
        t.declarado[campo] = bruto === '' ? null : aCentavos(bruto);
      }
      trabajadores.set(cuil, t);
    } else {
      /* Un dato de trabajador que cambia entre filas es señal de planilla
         mal armada: se conserva el primero y se avisa. */
      const t = trabajadores.get(cuil);
      for (const campo of camposTrabajador) {
        const nuevo = valorDeCampo(campo);
        if (nuevo && t[campo] && nuevo !== t[campo] && campo !== 'apellidoNombre') {
          /*
           * Se junta por trabajador y campo, no por fila. Un eventual que se
           * embarca cuatro veces en el mes aparece con doce renglones y dos
           * fechas de pago: doce avisos diciendo lo mismo no informan más que
           * uno, y el ruido es lo que hace que después no se lea ninguno.
           */
          const clave = `${cuil}|${campo}`;
          const ya = discrepancias.get(clave) || { cuil, campo, valores: new Set([t[campo]]), filas: 0 };
          ya.valores.add(nuevo);
          ya.filas += 1;
          discrepancias.set(clave, ya);
        }
      }
    }

    const t = trabajadores.get(cuil);
    const codigo = String(celda(fila, columnas, 'codigoConcepto')).trim();
    if (!codigo) return; /* fila de trabajador sin concepto: se acepta */

    const importeBruto = aCentavos(celda(fila, columnas, 'importe'));
    const tipoOrigen = String(celda(fila, columnas, 'tipoOrigen')).trim();

    /*
     * Filas que el origen trae pero que no van al libro. El caso concreto son
     * las CONTRIBUCIONES PATRONALES: figuran en el resumen del sistema de
     * sueldos, pero el registro 03 solo lleva lo que aparece en el recibo, y
     * ARCA calcula las contribuciones a partir de las bases. Si se cuelan, el
     * servicio las rechaza una por una por no estar parametrizadas.
     */
    /*
     * Conceptos que el estudio decidió no pasar al libro. El caso conocido es
     * un embargo por cuota alimentaria, que el servicio no admite. Es una
     * decisión por empresa, no del formato: se carga en pantalla.
     */
    const motivoDescarte = excluidos.has(codigo)
      ? 'conceptos que decidiste no pasar al libro'
      : perfil && perfil.descartarPorTipo
      ? perfil.descartarPorTipo[tipoOrigen]
      : null;
    if (motivoDescarte) {
      const ya = descartados.get(motivoDescarte) || { motivo: motivoDescarte, filas: 0, total: 0 };
      ya.filas += 1;
      ya.total += Math.abs(importeBruto);
      descartados.set(motivoDescarte, ya);
      return;
    }

    let dc = String(celda(fila, columnas, 'debitoCredito')).trim().toUpperCase().charAt(0);

    if (dc !== 'D' && dc !== 'C') {
      /*
       * Sin columna de débito/crédito hay dos fuentes, en este orden:
       * el perfil, que sabe de qué lado del recibo cae cada tipo de concepto
       * del sistema de origen; y el signo del importe, que siempre invierte
       * —una devolución de préstamo viene como no remunerativo en negativo—.
       */
      const porTipo = perfil && perfil.debitoCreditoPorTipo ? perfil.debitoCreditoPorTipo[tipoOrigen] : null;
      dc = porTipo || 'C';
      if (importeBruto < 0) dc = dc === 'D' ? 'C' : 'D';

      if (columnas.debitoCredito === undefined && !avisoDeSigno) {
        avisoDeSigno = true;
        avisos.push(
          porTipo
            ? 'La planilla no trae columna de débito/crédito: se deduce del tipo de concepto del sistema de origen, y el importe negativo lo invierte.'
            : 'La planilla no trae columna de débito/crédito: se deduce del signo del importe (negativo = débito).'
        );
      }
    }

    t.conceptos.push({
      filaOrigen: nroFila,
      codigo,
      descripcion: String(celda(fila, columnas, 'descripcionConcepto')).trim(),
      cantidad: aCentavos(celda(fila, columnas, 'cantidad')),
      /* Si el origen no trae unidad, la del perfil. Los archivos aceptados
         llevan '$' en todos los renglones, aun en los que tienen cantidad. */
      unidad:
        String(celda(fila, columnas, 'unidad')).trim().charAt(0) ||
        (perfil && perfil.unidadPorDefecto) ||
        '',
      importe: Math.abs(importeBruto),
      debitoCredito: dc,
      periodoAjuste: aPeriodoArca(celda(fila, columnas, 'periodoAjuste')),
    });
  });

  /*
   * Consolidar es lo último: recién con todas las filas leídas se sabe si un
   * trabajador aparece en más de una liquidación del período.
   */
  let juntados = 0;
  const sinPadron = [];
  for (const t of trabajadores.values()) {
    /* Primero el padrón, que completa los datos de la relación laboral, y
       después la consolidación de los conceptos repetidos. */
    if (!aplicarPadron(t, config.padron)) sinPadron.push(t.cuil);
    /* Hay exportaciones que no traen ninguna fecha: la de Martín Prado es una
       hoja de conceptos e importes y nada más. La fecha de pago es un dato de
       la liquidación, no del trabajador, así que se toma de la cabecera. */
    if (!t.fechaPago && cabecera.fechaPago) t.fechaPago = aFechaArca(cabecera.fechaPago);
    juntados += consolidarConceptos(t, config.parametrizacion, avisos);
  }
  if (sinPadron.length) {
    avisos.push(
      `No están en el padrón, así que los datos de su relación laboral van vacíos: ${sinPadron.join(', ')}.`
    );
  }

  /* Lo descartado se cuenta y se dice: nada se saca en silencio. */
  for (const d of descartados.values()) {
    avisos.push(
      `Se dejaron afuera ${d.filas} filas por $ ${comoPesos(d.total)}: ${d.motivo}`
    );
  }

  /*
   * Un aviso por trabajador y por campo, con todos los valores que aparecieron.
   *
   * La fecha de pago tiene texto propio porque su caso normal no es una
   * planilla mal armada: es el personal eventual, que se embarca cuando hace
   * falta y cobra en más de una fecha dentro del mes. La liquidación se
   * unifica igual —el registro 02 lleva una sola fecha por trabajador— y eso
   * es lo correcto, así que el aviso lo dice en esos términos y no como si
   * hubiera algo que arreglar.
   */
  /* Las fechas viajan como AAAAMMDD; en un aviso se leen mejor al derecho. */
  const enCriollo = (f) =>
    /^\d{8}$/.test(f) ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : f;

  for (const d of discrepancias.values()) {
    const valores = Array.from(d.valores);
    if (d.campo === 'fechaPago') {
      avisos.push(
        `El CUIL ${d.cuil} cobró en más de una fecha dentro del período ` +
          `(${valores.map(enCriollo).join(' y ')}). Se unifica en una sola liquidación, que es ` +
          `lo que corresponde cuando el trabajador se embarca más de una vez, y en el registro 02 va ` +
          `la primera: ${enCriollo(valores[0])}.`
      );
    } else {
      avisos.push(
        `El CUIL ${d.cuil} trae "${d.campo}" con más de un valor en la planilla ` +
          `(${valores.map((v) => `"${v}"`).join(', ')}), en ${d.filas} ${d.filas === 1 ? 'fila' : 'filas'}. ` +
          `Se usa el primero.`
      );
    }
  }

  return {
    cuit: soloDigitos(cabecera.cuit),
    envio: cabecera.envio || 'SJ',
    periodo: aPeriodoArca(cabecera.periodo),
    tipoLiquidacion: (cabecera.tipoLiquidacion || 'M').toUpperCase(),
    nroLiquidacion: soloDigitos(cabecera.nroLiquidacion) || '1',
    /* La rúbrica va en blanco salvo que la empresa la venga informando: ver
       la nota del campo en `registros.js`. */
    fechaRubrica: cabecera.fechaRubrica ? aFechaArca(cabecera.fechaRubrica) : '',
    /* Relleno del legajo y del código de concepto: ver la nota en generarTxt. */
    anchoLegajo: Number(cabecera.anchoLegajo) || 0,
    anchoCodigoConcepto: Number(cabecera.anchoCodigoConcepto) || 0,
    omitirConceptosEnCero: Boolean(cabecera.omitirConceptosEnCero),
    /* Las dos correcciones de la empresa: ver `conceptosParaElArchivo`. */
    consolidar: cabecera.consolidar && typeof cabecera.consolidar === 'object' ? cabecera.consolidar : null,
    aportesAlValorCalculado: Boolean(cabecera.aportesAlValorCalculado),
    trabajadores: Array.from(trabajadores.values()),
    descartados: Array.from(descartados.values()),
  };
}

/* ---------- Parametrización ---------- */

/*
 * La parametrización dice, para cada concepto del empleador, a qué concepto
 * ARCA está asociado y qué subsistemas toca. Sin ella no se pueden calcular
 * las bases imponibles, así que el control queda a medias.
 *
 * Se puede exportar desde el módulo CONCEPTOS del propio servicio LSD.
 */

const SUBSISTEMAS = [
  'aporteSIPA', 'contribSIPA', 'aporteINSSJyP', 'contribINSSJyP',
  'aporteOS', 'contribOS', 'aporteFSR', 'contribFSR',
  'aporteRENATEA', 'contribRENATEA', 'contribAAFF', 'contribFNE',
  'contribLRT', 'aporteDiferencial', 'aporteEspecial',
];

/* Qué subsistema alimenta cada base imponible. */
const BASE_POR_SUBSISTEMA = {
  rem1: ['aporteSIPA'],
  rem2: ['contribSIPA', 'contribINSSJyP'],
  rem3: ['contribFNE', 'contribAAFF', 'contribRENATEA'],
  rem4: ['aporteOS', 'aporteFSR'],
  rem5: ['aporteINSSJyP'],
  rem6: ['aporteDiferencial'],
  rem7: ['aporteEspecial'],
  rem8: ['contribOS', 'contribFSR'],
  rem9: ['contribLRT'],
};

/**
 * Lee la parametrización desde las filas de una planilla exportada de LSD.
 * Espera un código de empleador, un código ARCA y los quince subsistemas.
 * Devuelve un Map de código de empleador -> { codigoArca, subsistemas }.
 */
function leerParametrizacion(filas, encabezados, avisos) {
  const normalizados = encabezados.map(normalizarEncabezado);
  const buscar = (...alias) => {
    for (const a of alias) {
      const i = normalizados.findIndex((h) => h === a || h.startsWith(a));
      if (i >= 0) return i;
    }
    return -1;
  };

  /*
   * Los encabezados reales del export del servicio son "Código AFIP" y
   * "Código contribuyente" —verificado contra la exportación de Nautical—,
   * y el código ARCA viene PRIMERO. Ojo con buscar por "codigo" a secas: como
   * la búsqueda acepta prefijos, "codigo" engancha "Código AFIP" y termina
   * tomando el código de ARCA como si fuera el del empleador, con lo cual la
   * parametrización queda dada vuelta y ningún concepto matchea.
   */
  const iArca = buscar('codigo afip', 'codigo de concepto arca', 'codigo concepto arca', 'concepto arca', 'codigo arca');
  const iEmpleador = buscar('codigo contribuyente', 'codigo de concepto empleador', 'codigo concepto empleador', 'concepto empleador', 'codigo empleador');

  if (iEmpleador < 0 || iArca < 0) {
    avisos.push('No se reconocieron las columnas de la parametrización: hacen falta el código del empleador y el código ARCA.');
    return new Map();
  }

  const columnasSub = {};
  const aliasSub = {
    aporteSIPA: ['aportes sistema previsional argentino sipa', 'aportes sipa', 'aportes sistema previsional'],
    contribSIPA: ['contribuciones sistema previsional argentino sipa', 'contribuciones sipa', 'contribuciones sistema previsional'],
    aporteINSSJyP: ['aportes inssjyp', 'aportes inssjp'],
    contribINSSJyP: ['contribuciones inssjyp', 'contribuciones inssjp'],
    aporteOS: ['aportes obra social'],
    contribOS: ['contribuciones obra social'],
    aporteFSR: ['aportes fondo solidario de redistribucion', 'aportes fondo solidario', 'aportes fsr'],
    contribFSR: ['contribuciones fondo solidario de redistribucion', 'contribuciones fondo solidario', 'contribuciones fsr'],
    aporteRENATEA: ['aportes renatea', 'aportes renatre'],
    contribRENATEA: ['contribuciones renatea', 'contribuciones renatre'],
    /* Las formas cortas —"Contribuciones AAFF", "Aportes diferenciales"— son
       las que usa el export real del servicio; las largas están en la guía. */
    contribAAFF: ['contribuciones aaff', 'contribuciones asignaciones familiares', 'asignaciones familiares'],
    contribFNE: ['contribuciones fne', 'contribuciones fondo nacional de empleo', 'fondo nacional de empleo'],
    contribLRT: ['contribuciones lrt', 'contribuciones ley de riesgos del trabajo', 'riesgos del trabajo'],
    aporteDiferencial: ['aportes diferenciales', 'aportes regimenes diferenciales', 'regimenes diferenciales'],
    aporteEspecial: ['aportes especiales', 'aportes regimenes especiales', 'regimenes especiales'],
  };
  for (const clave of SUBSISTEMAS) columnasSub[clave] = buscar(...aliasSub[clave]);

  /*
   * La marca de repetición dice si un concepto puede aparecer más de una vez
   * para el mismo trabajador en la misma liquidación. Importa al consolidar:
   * los que NO son repetibles hay que sumarlos en un solo renglón.
   */
  const iRepetible = buscar('marca repetible', 'marca de repeticion', 'repetible');
  /* La descripción del empleador es la SEGUNDA "Descripción": la primera es la
     del concepto ARCA. Se guarda para poder reescribir el reservorio igual. */
  const descripciones = normalizados
    .map((h, i) => (h === 'descripcion' ? i : -1))
    .filter((i) => i >= 0);
  const iDescripcion = descripciones.length > 1 ? descripciones[1] : -1;

  const mapa = new Map();
  for (const fila of filas) {
    const codigo = String(fila[iEmpleador] === undefined ? '' : fila[iEmpleador]).trim();
    const arca = String(fila[iArca] === undefined ? '' : fila[iArca]).trim();
    if (!codigo || !arca) continue;
    const subsistemas = {};
    for (const clave of SUBSISTEMAS) {
      const i = columnasSub[clave];
      subsistemas[clave] = i >= 0 && String(fila[i]).trim() === '1';
    }
    const repetible = iRepetible >= 0 && String(fila[iRepetible]).trim() === '1';
    const descripcion = iDescripcion >= 0 ? String(fila[iDescripcion] || '').trim() : '';
    mapa.set(codigo, { codigoArca: arca, subsistemas, repetible, descripcion });
  }
  return mapa;
}

/* ---------- El padrón de empleados ---------- */

/*
 * Los atributos de la relación laboral —obra social, modalidad, situación,
 * condición, actividad, localidad, CBU, categoría, puesto— salen del alta en
 * Simplificación Registral y de datos del sistema, y **no cambian de un mes a
 * otro**. Lo único mensual son los importes.
 *
 * Por eso viven en un padrón aparte: una fila por CUIL, que se arma una vez
 * por empresa y se vuelve a usar todos los meses. La planilla de liquidación
 * solo aporta los conceptos.
 *
 * Si un dato viene en los dos lados, manda la planilla del mes: el padrón
 * completa, no pisa.
 */

const CAMPOS_PADRON = [
  'legajo',
  /* Para el liquidador, no para el registro 04. El armador las lee y no las
     usa; sin ellas el liquidador no puede llenar las novedades solo. */
  'fechaIngreso', 'basico', 'grupo',
  'dependencia', 'provincia', 'cbu', 'formaPago', 'diasLiquidados',
  'conyuge', 'hijos', 'marcaCCT', 'marcaSCVO', 'marcaReduccion', 'tipoEmpresa',
  'situacion', 'condicion', 'actividad', 'modalidad', 'siniestrado', 'localidad',
  'revista1', 'diaRevista1', 'revista2', 'diaRevista2', 'revista3', 'diaRevista3',
  'diasTrabajados', 'horasTrabajadas', 'obraSocial', 'adherentes', 'observaciones',
  /* Los del registro 04 que son importes pero NO salen de sumar conceptos:
     aportes y contribuciones adicionales, bases diferenciales, maternidad y la
     detracción de la ley 27.430. Son datos de la relación laboral. */
  'aportePorcAdicional', 'contribTareaDiferencial',
  'aporteAdicionalOS', 'contribAdicionalOS',
  'baseDifAportesOS', 'baseDifContribOS', 'baseDifLRT',
  'remMaternidad', 'baseDifAporteSS', 'baseDifContribSS', 'importeDetraer',
];

/**
 * Lee el padrón. Espera una columna de CUIL y una por cada campo, con los
 * mismos nombres que muestra el paso 4.
 */
function leerPadron(filas, encabezados, avisos) {
  const { columnas } = detectarColumnas(encabezados, null);
  if (columnas.cuil === undefined) {
    if (avisos) avisos.push('El padrón no tiene columna de CUIL: no se puede usar.');
    return new Map();
  }

  const mapa = new Map();
  for (const fila of filas) {
    const cuil = soloDigitos(fila[columnas.cuil]);
    if (!cuil) continue;
    const datos = {};
    for (const campo of CAMPOS_PADRON) {
      const i = columnas[campo];
      if (i === undefined) continue;
      const valor = String(fila[i] === null || fila[i] === undefined ? '' : fila[i]).trim();
      if (valor) datos[campo] = valor;
    }
    mapa.set(cuil, datos);
  }
  return mapa;
}

/** Completa con el padrón lo que la planilla del mes no trajo. */
function aplicarPadron(trabajador, padron) {
  if (!padron || !padron.size) return true;
  const datos = padron.get(trabajador.cuil);
  if (!datos) return false;
  for (const campo of CAMPOS_PADRON) {
    if (datos[campo] && !trabajador[campo]) trabajador[campo] = datos[campo];
  }
  return true;
}

/* ---------- Consolidación ---------- */

/**
 * Junta en un solo renglón los conceptos que aparecen más de una vez para el
 * mismo trabajador.
 *
 * Pasa siempre que el período tiene más de una liquidación —los haberes del
 * mes y una final por una baja— y el trabajador está en las dos. LSD arma un
 * archivo por período y no admite el mismo concepto dos veces para el mismo
 * CUIL, salvo que la parametrización lo marque como repetible.
 *
 * Se suma con signo: un débito resta. Si el neto queda negativo, el renglón
 * cambia de lado y el importe se escribe positivo, que es como lo espera el
 * registro 03.
 */
function consolidarConceptos(trabajador, parametrizacion, avisos) {
  const grupos = new Map();
  /*
   * `orden` conserva el orden en que los conceptos aparecen en la planilla.
   * Hace falta porque el archivo se compara renglón por renglón contra el que
   * se presentó: hasta el 25/09/2026 esto devolvía primero los repetibles y
   * después los agrupados, y con eso el aguinaldo de junio se adelantaba tres
   * lugares. Mismos conceptos y mismos importes, pero ninguna línea calzaba.
   */
  const orden = [];

  for (const c of trabajador.conceptos) {
    const par = parametrizacion ? parametrizacion.get(c.codigo) : null;
    /* Los repetibles se dejan como vienen: la parametrización los habilita. */
    if (par && par.repetible) {
      orden.push({ suelto: c });
      continue;
    }
    const clave = `${c.codigo}|${c.periodoAjuste || ''}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, { base: c, veces: 1, importe: 0, cantidad: 0 });
      orden.push({ clave });
    } else {
      grupos.get(clave).veces += 1;
    }
    const g = grupos.get(clave);
    const signo = c.debitoCredito === 'D' ? -1 : 1;
    g.importe += signo * c.importe;
    g.cantidad += signo * c.cantidad;
    if (!g.base.unidad && c.unidad) g.base.unidad = c.unidad;
  }

  let juntados = 0;
  const resultado = orden.map((x) => {
    if (x.suelto) return x.suelto;
    const g = grupos.get(x.clave);
    if (g.veces > 1) juntados += g.veces - 1;
    return Object.assign({}, g.base, {
      importe: Math.abs(g.importe),
      cantidad: Math.abs(g.cantidad),
      debitoCredito: g.importe < 0 ? 'D' : 'C',
      vecesConsolidado: g.veces,
    });
  });

  if (juntados && avisos) {
    avisos.push(
      `CUIL ${trabajador.cuil}: se juntaron ${juntados} ${
        juntados === 1 ? 'renglón repetido' : 'renglones repetidos'
      } en su concepto, porque el trabajador aparece en más de una liquidación del período.`
    );
  }

  trabajador.conceptos = resultado;
  return juntados;
}

/* ---------- Cálculo de bases ---------- */

/**
 * Calcula las bases imponibles de un trabajador a partir de sus conceptos y
 * de la parametrización, y aplica los topes.
 *
 * `parametros` trae los valores del período que fija ANSeS y que cambian
 * todos los trimestres: `topeMes` en centavos. Si no viene, no se aplica
 * tope y se dice en pantalla: es preferible a inventar un número.
 *
 * El tope de SAC sale de la guía: tope del mes / 360 = tope diario; por los
 * días informados en el campo cantidad del concepto de SAC proporcional.
 */
function calcularBases(trabajador, parametrizacion, parametros, avisos) {
  const bases = { rem1: 0, rem2: 0, rem3: 0, rem4: 0, rem5: 0, rem6: 0, rem7: 0, rem8: 0, rem9: 0, rem10: 0 };
  let remBruta = 0;
  let diasSacProporcional = 0;
  let diasVacaciones = 0;
  const sinParametrizar = [];

  for (const concepto of trabajador.conceptos) {
    const par = parametrizacion ? parametrizacion.get(concepto.codigo) : null;
    if (!par) {
      if (parametrizacion && parametrizacion.size) sinParametrizar.push(concepto.codigo);
      continue;
    }
    concepto.codigoArca = par.codigoArca;
    const tipo = tipoDeConcepto(par.codigoArca);
    concepto.tipoArca = tipo;

    /* El signo: un débito resta de la base, un crédito suma. */
    const signo = concepto.debitoCredito === 'D' ? -1 : 1;

    if (tipo === 'REMUNERATIVO' || tipo === 'NO REMUNERATIVO') {
      remBruta += signo * concepto.importe;
    }

    /* Los descuentos no forman base: se retienen sobre ella. */
    if (tipo === 'DESCUENTO') continue;

    for (const base of Object.keys(BASE_POR_SUBSISTEMA)) {
      const alcanza = BASE_POR_SUBSISTEMA[base].some((s) => par.subsistemas[s]);
      if (alcanza) bases[base] += signo * concepto.importe;
    }

    if (esSacProporcional(par.codigoArca)) diasSacProporcional += signo * concepto.cantidad;
    if (String(par.codigoArca).trim() === ADELANTO_VACACIONAL) diasVacaciones += signo * concepto.cantidad;
  }

  /* Los días viajan en el campo cantidad, que es decimal de dos posiciones. */
  diasSacProporcional = diasSacProporcional / 100;
  diasVacaciones = diasVacaciones / 100;

  const topes = { topeMes: null, topeDiarioSac: null, topeSac: null, topeAplicar: null, recorto: false };
  if (parametros && parametros.topeMes) {
    topes.topeMes = parametros.topeMes;
    /*
     * El tope diario es el del mes dividido 360, pero NO se redondea antes de
     * multiplicarlo por los días: se redondea recién el resultado. Con el
     * ejemplo publicado por ARCA —tope de $81.918,55 y 70 días— redondear
     * primero da $15.928,50 y la guía dice $15.928,61. Once centavos alcanzan
     * para que la liquidación no valide.
     */
    topes.topeDiarioSac = Math.round(parametros.topeMes / 360);
    topes.topeSac = Math.round((parametros.topeMes * Math.max(0, diasSacProporcional)) / 360);
    topes.topeAplicar = topes.topeMes + topes.topeSac;

    for (const base of BASES_IMPONIBLES) {
      if (!base.tope || bases[base.clave] === undefined) continue;
      if (bases[base.clave] > topes.topeAplicar) {
        bases[base.clave] = topes.topeAplicar;
        /* Queda anotado si el tope llegó a recortar algo: con adelanto
           vacacional, una base recortada puede estar mal recortada, porque
           esos días suman un tope propio que la guía no explica. */
        topes.recorto = true;
      }
    }
  } else if (avisos) {
    avisos.push('No se cargó el tope mensual de ANSeS del período: las bases con tope se calculan sin topear.');
  }

  /*
   * REM 10 es la base sobre la que se calcula el **crédito fiscal por cargas
   * sociales**: REM 2 menos el importe a detraer de la ley 27.430. No es una
   * base de aportes ni de contribuciones, y por eso no lleva tope.
   *
   * La detracción no sale de la liquidación —es un dato de la relación
   * laboral— y vive en el reservorio de empleados.
   *
   * El anexo dice que no puede quedar por debajo del mínimo previsional
   * vigente. Ese mínimo no lo tenemos, así que el piso acá es cero y el
   * control avisa si la resta se lo come.
   */
  const detraccion = aCentavos(trabajador.importeDetraer);
  bases.rem10 = detraccion ? Math.max(bases.rem2 - detraccion, 0) : 0;
  if (detraccion && bases.rem2 - detraccion < 0 && avisos) {
    avisos.push(
      `CUIL ${trabajador.cuil}: la detracción de $ ${comoPesos(detraccion)} es mayor que la REM 2, ` +
        'así que la REM 10 quedó en cero. Verificá contra el mínimo previsional del período.'
    );
  }

  /*
   * El adelanto vacacional lleva tope propio, separado del mensual y sin SAC.
   * La guía dice que hay que informar los días para proporcionarlo, pero NO
   * publica el divisor. Como no se inventa, se avisa y no se topea.
   */
  if (diasVacaciones > 0 && avisos) {
    avisos.push(
      `Hay ${diasVacaciones} días de adelanto vacacional: ese tope es independiente del mensual y la guía de ARCA no publica cómo se proporciona. Verificá la base contra el borrador del servicio.`
    );
  }

  return { bases, remBruta, diasSacProporcional, diasVacaciones, topes, sinParametrizar };
}

/* ---------- Controles ---------- */

/**
 * Corre los controles sobre la liquidación armada.
 * Devuelve una lista de hallazgos { nivel, cuil, mensaje }, donde el nivel
 * es 'error' (el archivo va a rebotar) o 'aviso' (conviene mirarlo).
 */
function controlar(liquidacion, parametrizacion, parametros) {
  const hallazgos = [];
  const err = (cuil, mensaje) => hallazgos.push({ nivel: 'error', cuil, mensaje });
  const avi = (cuil, mensaje) => hallazgos.push({ nivel: 'aviso', cuil, mensaje });

  /* --- Cabecera --- */
  if (!cuilValido(liquidacion.cuit)) err('', `El CUIT del empleador no es válido: ${liquidacion.cuit || '(vacío)'}.`);
  if (!/^\d{6}$/.test(liquidacion.periodo)) err('', `El período tiene que ser AAAAMM: ${liquidacion.periodo || '(vacío)'}.`);
  if (liquidacion.envio === 'SJ' && !TIPOS_LIQUIDACION[liquidacion.tipoLiquidacion]) {
    err('', `El tipo de liquidación tiene que ser M, Q, D o H: ${liquidacion.tipoLiquidacion || '(vacío)'}.`);
  }
  if (!liquidacion.trabajadores.length) err('', 'La planilla no trajo ningún trabajador con CUIL.');

  /*
   * Sin reservorio de empleados el registro 04 sale entero en ceros —sin obra
   * social, modalidad, situación, condición, actividad ni localidad— y el 02
   * sale sin forma de pago. ARCA rechaza el archivo completo.
   *
   * Se detecta por el resultado y no por si el archivo se cargó: lo que
   * importa es que los trabajadores tengan los datos, vengan de donde vengan.
   * La planilla mensual no los trae, así que si faltan en todos, falta el
   * reservorio.
   */
  const sinDatosDeAlta = liquidacion.trabajadores.filter(
    (t) => !String(t.situacion || '').trim() && !String(t.obraSocial || '').trim()
  ).length;
  if (liquidacion.trabajadores.length && sinDatosDeAlta === liquidacion.trabajadores.length) {
    err('',
      'Ningún trabajador tiene los datos de la relación laboral —obra social, ' +
      'situación, condición, actividad, modalidad, localidad—, así que el registro 04 ' +
      'va a salir en ceros y ARCA va a rechazar el archivo entero. Falta cargar el ' +
      'reservorio de empleados en el paso 2.');
  } else if (sinDatosDeAlta) {
    err('',
      `${sinDatosDeAlta} de ${liquidacion.trabajadores.length} trabajadores no están en el ` +
      'reservorio de empleados: su registro 04 va a salir en ceros.');
  }

  const mes = Number(liquidacion.periodo.slice(4, 6));

  for (const t of liquidacion.trabajadores) {
    /* --- Identidad --- */
    if (!cuilValido(t.cuil)) {
      err(t.cuil, `El CUIL no pasa el dígito verificador (fila ${t.filaOrigen}).`);
    }

    /* --- Registro 02 --- */
    if (!t.fechaPago) err(t.cuil, 'Falta la fecha de pago, que es obligatoria en el registro 02.');
    /*
     * La forma de pago es OBLIGATORIA: va en el último carácter del registro
     * 02 y ARCA la rechaza vacía con «Forma de pago inválida, es distinta de
     * 1, 2, 3 y 4». Antes el control decía algo solo cuando venía un valor
     * equivocado, así que la ausencia —que es el caso frecuente, porque sale
     * del reservorio de empleados y no de la planilla— pasaba en silencio y se
     * descubría recién al importar.
     */
    const formaPago = String(t.formaPago === undefined || t.formaPago === null ? '' : t.formaPago).trim();
    if (!formaPago || formaPago === '0') {
      err(t.cuil, 'Falta la forma de pago, que va en el registro 02 y ARCA exige entre 1 y 4. Sale del reservorio de empleados.');
    } else if (!FORMAS_DE_PAGO[formaPago]) {
      err(t.cuil, `La forma de pago "${t.formaPago}" no existe. Son 1 efectivo, 2 cheque, 3 acreditación, 4 pago externo.`);
    }
    if (String(t.formaPago).trim() === '3' && !soloDigitos(t.cbu)) {
      err(t.cuil, 'La forma de pago es acreditación pero no tiene CBU, que en ese caso es obligatorio.');
    }
    if (t.cbu && soloDigitos(t.cbu).length !== 22) {
      err(t.cuil, `El CBU tiene ${soloDigitos(t.cbu).length} dígitos y tiene que tener 22.`);
    }

    /* --- Registro 04 --- */
    if (t.tipoEmpresa && !TIPOS_EMPRESA[String(t.tipoEmpresa).trim()]) {
      avi(t.cuil, `El tipo de empresa "${t.tipoEmpresa}" no figura en la tabla de la guía.`);
    }
    const dias = Number(soloDigitos(t.diasTrabajados) || 0);
    const horas = Number(soloDigitos(t.horasTrabajadas) || 0);
    if (dias && horas) {
      err(t.cuil, `Vienen ${dias} días trabajados y ${horas} horas trabajadas. ARCA exige que uno de los dos sea cero.`);
    }
    if (!t.revista1) avi(t.cuil, 'No trae situación de revista 1, que es obligatoria.');

    /* Perfiles que no generan libro: no es un error, pero conviene saberlo. */
    const modalidad = String(soloDigitos(t.modalidad)).padStart(3, '0');
    if (MODALIDADES_SIN_LIBRO[modalidad]) {
      avi(t.cuil, `Modalidad ${modalidad} (${MODALIDADES_SIN_LIBRO[modalidad]}): entra en la DDJJ pero no genera libro de sueldos.`);
    }
    const situacion = String(soloDigitos(t.situacion)).padStart(2, '0');
    if (SITUACIONES_SIN_LIBRO[situacion]) {
      avi(t.cuil, `Situación ${situacion} (${SITUACIONES_SIN_LIBRO[situacion]}): entra en la DDJJ pero no genera libro de sueldos.`);
    }

    /* --- Conceptos --- */
    if (!t.conceptos.length) {
      err(t.cuil, 'No tiene ningún concepto liquidado. Revisá el perfil del trabajador o si falta cargarle la liquidación.');
    }

    for (const c of t.conceptos) {
      /* El concepto ARCA se resuelve acá y no se espera a `calcularBases`:
         si se lee `c.codigoArca` antes de que ese cálculo corra, viene
         indefinido y los controles de abajo se saltean sin decir nada. */
      const par = parametrizacion ? parametrizacion.get(c.codigo) : null;
      const arca = par ? par.codigoArca : c.codigoArca;
      if (parametrizacion && parametrizacion.size && !arca) {
        /*
         * Sin parametrización el código del empleador sale tal cual al
         * registro 03, y ARCA devuelve «Código de concepto inexistente NNN»,
         * que es su manera de decir que ese número no es un concepto suyo.
         * Las dos salidas son atarlo a un concepto ARCA o no informarlo.
         */
        err(
          t.cuil,
          `El concepto "${c.codigo}" (fila ${c.filaOrigen}) no está en la parametrización. ARCA lo va ` +
            'a rechazar con «Código de concepto inexistente». O se le ata un concepto ARCA en el ' +
            'reservorio, o va en los conceptos que no se pasan al libro.'
        );
        continue;
      }
      if (!arca) continue;

      if (!nombreDeConcepto(arca)) {
        /* Dentro de rango pero fuera de nuestro catálogo: lo más probable es
           que el Anexo I de 2018 esté corto, no que el código esté mal. */
        if (estaEnRangoValido(arca)) {
          avi(
            t.cuil,
            `El concepto ARCA ${arca} no figura en el Anexo I de 2018 pero cae en el rango de ${tipoDeConcepto(arca).toLowerCase()}s. Probablemente ARCA lo sumó después: verificalo una vez y seguí.`
          );
        } else {
          err(t.cuil, `El concepto ARCA ${arca} no es un código válido (concepto "${c.codigo}", fila ${c.filaOrigen}).`);
        }
      }
      if (exigeCantidad(arca) && !c.cantidad) {
        err(
          t.cuil,
          `El concepto ARCA ${arca} exige informar la cantidad y viene en cero (fila ${c.filaOrigen}). Sin los días, el tope se calcula mal.`
        );
      }
      if (esSac(arca) && !esSacProporcional(arca) && mes !== 6 && mes !== 12) {
        err(
          t.cuil,
          `El concepto de SAC ${arca} solo puede informarse en junio y diciembre, y el período es ${liquidacion.periodo}. Para proporcionarlo va el SAC proporcional.`
        );
      }
      if (esSacProporcional(arca)) {
        avi(
          t.cuil,
          `Usa el concepto ${arca} como SAC proporcional. La guía de ARCA nombra los dos códigos (120003 y 123000) para lo mismo: confirmá cuál toma el servicio antes de subir.`
        );
      }
      const tipo = tipoDeConcepto(arca);
      if (par && tipo === 'REMUNERATIVO') {
        const faltan = ['aporteSIPA', 'contribSIPA', 'aporteINSSJyP', 'contribINSSJyP', 'aporteOS', 'contribOS', 'aporteFSR', 'contribFSR', 'contribAAFF', 'contribFNE', 'contribLRT']
          .filter((s) => !par.subsistemas[s]);
        if (faltan.length) {
          err(
            t.cuil,
            `El concepto "${c.codigo}" es remunerativo pero no tiene marcados todos los subsistemas. ARCA los pide todos en 1 salvo regímenes diferenciales y especiales.`
          );
        }
      }
      if (par && tipo === 'DESCUENTO') {
        const marcados = SUBSISTEMAS.filter((s) => par.subsistemas[s]);
        if (marcados.length) {
          err(t.cuil, `El concepto "${c.codigo}" es un descuento y tiene subsistemas marcados. Van todos en 0.`);
        }
      }
    }

    /* --- Bases imponibles: el control que tiene que dar cero --- */
    const calculo = calcularBases(t, parametrizacion, parametros, null);
    t.calculo = calculo;

    /*
     * Ninguna base imponible puede superar la remuneración bruta.
     *
     * ARCA lo valida y devuelve «Base imponible N (x) es mayor a la
     * remuneración bruta (y)», con el número de línea del registro 04 y nada
     * más: no dice qué concepto lo causó, así que hay que salir a buscarlo a
     * mano concepto por concepto. Por eso este control nombra al culpable.
     *
     * La guía define la bruta como «la suma de los conceptos remunerativos y
     * no remunerativos liquidados en el mes». Un concepto no remunerativo
     * informado como DÉBITO la baja; si además no tiene ningún subsistema
     * marcado, no baja ninguna base, y la base queda por encima de la bruta.
     *
     * Cuando eso pasa, casi siempre el concepto es en realidad un descuento
     * —una retención, un embargo— mapeado a un código no remunerativo en vez
     * de uno de la familia 81/82. Un descuento no es remuneración: no entra en
     * la bruta ni en las bases, y el problema desaparece.
     */
    const bruta = calculo.remBruta;
    /* REM 10 queda afuera: no es una base de aportes ni de contribuciones,
       es la base del crédito fiscal, y sale de restarle la detracción a la
       REM 2. Si la REM 2 está bien, ésta no puede pasarse sola. */
    const excedidas = BASES_IMPONIBLES
      .filter((b) => b.clave !== 'rem10')
      .filter((b) => calculo.bases[b.clave] !== undefined && calculo.bases[b.clave] > bruta)
      .map((b) => `Base imponible ${b.clave.replace('rem', '')}`);
    if (excedidas.length) {
      const sospechosos = t.conceptos
        .filter((c) => {
          const par = parametrizacion ? parametrizacion.get(c.codigo) : null;
          if (!par || c.debitoCredito !== 'D') return false;
          if (tipoDeConcepto(par.codigoArca) !== 'NO REMUNERATIVO') return false;
          return !SUBSISTEMAS.some((s) => par.subsistemas[s]);
        })
        .map((c) => `"${c.codigo}"`);

      err(
        t.cuil,
        `${excedidas.join(', ')} supera${excedidas.length > 1 ? 'n' : ''} la remuneración bruta ` +
          `($ ${comoPesos(bruta)}). ARCA lo rechaza.` +
          (sospechosos.length
            ? ` Lo causa${sospechosos.length > 1 ? 'n' : ''} el concepto ${sospechosos.join(', ')}: ` +
              'va como no remunerativo en débito y sin subsistemas, así que baja la bruta y no baja ' +
              'ninguna base. Si es un descuento, va con un código 81/82 en el reservorio; si no se ' +
              'informa al libro, va en los conceptos que no se pasan.'
            : '')
      );
    }

    /* --- Los aportes que ARCA recalcula --- */

    /*
     * ARCA no se conforma con la base: recalcula el aporte y lo cruza contra
     * el concepto informado. Si no coinciden devuelve "El aporte de SIPA
     * calculado por AFIP en el periodo es de $X y Ud. informó $Y", y el libro
     * definitivo sale con SUS números, no con los del recibo.
     *
     * Las alícuotas las pone quien liquida, porque cambian. Sin alícuotas
     * cargadas, este control no corre.
     */
    if (parametros && parametros.alicuotas && parametrizacion && parametrizacion.size) {
      const a = parametros.alicuotas;
      const adherentes = Number(soloDigitos(t.adherentes) || 0);
      const base = (clave) =>
        t.declarado[clave] !== null && t.declarado[clave] !== undefined
          ? t.declarado[clave]
          : (calculo.bases[clave] || 0);

      /* El aporte de obra social sube por cada adherente que no integra el
         grupo familiar: es lo que explica que ARCA calcule más. */
      const esperados = {
        '810000': { nombre: 'SIPA', valor: Math.round((base('rem1') * a.sipa) / 100) },
        '810001': { nombre: 'INSSJyP', valor: Math.round((base('rem5') * a.inssjyp) / 100) },
        '810002': {
          nombre: 'obra social',
          valor: Math.round((base('rem4') * (a.obraSocial + adherentes * a.adherente)) / 100),
        },
      };

      const informados = {};
      for (const c of t.conceptos) {
        const par = parametrizacion.get(c.codigo);
        if (!par || !esperados[par.codigoArca]) continue;
        const signo = c.debitoCredito === 'D' ? 1 : -1;
        informados[par.codigoArca] = (informados[par.codigoArca] || 0) + signo * c.importe;
      }

      /*
       * Con adelanto vacacional la base lleva un tope propio que se suma al
       * mensual, y la guía no publica cómo se proporciona. En esos casos la
       * base puede ser legítimamente mayor que la topeada acá, así que el
       * hallazgo baja a aviso en vez de darse por error.
       */
      const conVacaciones = calculo.diasVacaciones > 0 && calculo.topes.recorto;

      /*
       * Régimen de Promoción del Empleo Registrado (Ley 27.802). Con una
       * modalidad 704, 705 o 706, ARCA **condona** el 90, 80 o 70 % de los
       * aportes y los expone aparte en el F931. Recalcularlos enteros da un
       * error que no existe, así que acá se avisa en vez de controlar.
       *
       * Lo mismo cuando se informa la diferencia de remuneración con un
       * concepto del PER: suma a las bases solo la proporción no condonada.
       */
      const per = MODALIDADES_PER[soloDigitos(t.modalidad)];
      const conRectificativaPer = t.conceptos.some((c) => {
        const par = parametrizacion.get(c.codigo);
        return par && RECTIFICATIVAS_PER.indexOf(String(par.codigoArca).trim()) >= 0;
      });
      if (per || conRectificativaPer) {
        hallazgos.push({
          nivel: 'aviso',
          cuil: t.cuil,
          mensaje: per
            ? `Está en el régimen de la ley 27.802 con modalidad ${soloDigitos(t.modalidad)} ` +
              `(${per.quien}): ARCA condona el ${per.condonacion} % de sus aportes y los expone ` +
              'aparte en el F931. El control de aportes no corre para este trabajador.'
            : 'Tiene un concepto de rectificativa por remuneración de la ley 27.802: ' +
              'suma a las bases solo la proporción no condonada, así que el control de ' +
              'aportes no corre para este trabajador.',
        });
      }

      for (const arca of Object.keys(esperados)) {
        if (per || conRectificativaPer) break;
        if (informados[arca] === undefined) continue;
        const dif = esperados[arca].valor - informados[arca];
        if (Math.abs(dif) <= 1) continue;

        const texto =
          `El aporte de ${esperados[arca].nombre} tendría que dar $ ${comoPesos(
            esperados[arca].valor
          )} sobre la base informada, y el recibo retuvo $ ${comoPesos(informados[arca])}. ` +
          `Diferencia de $ ${comoPesos(dif)}.`;

        if (liquidacion.aportesAlValorCalculado) {
          /*
           * La empresa decidió informar el aporte que corresponde y no el del
           * recibo, así que el archivo ya sale corregido: esto no es algo que
           * ARCA vaya a rechazar, es plata que pone el empleador. Dejarlo como
           * error haría que el paso 5 dijera «35 errores» sobre un archivo que
           * está bien.
           */
          avi(
            t.cuil,
            `${texto} Se informa el valor calculado, así que ARCA no lo va a rechazar: ` +
              `esos $ ${comoPesos(dif)} quedan a cargo de la empresa.`
          );
        } else if (conVacaciones) {
          avi(
            t.cuil,
            `${texto} Tiene ${calculo.diasVacaciones} días de adelanto vacacional, que llevan tope propio: ` +
              'la base puede ser mayor que la topeada acá, así que hay que mirarlo a mano.'
          );
        } else {
          err(
            t.cuil,
            `${texto} Si no se corrige, el libro definitivo sale con el número de ARCA y no con el del recibo.`
          );
        }
      }
    }


    if (parametrizacion && parametrizacion.size) {
      if (t.declarado.remBruta !== null && t.declarado.remBruta !== calculo.remBruta) {
        err(
          t.cuil,
          `La remuneración bruta declarada ($ ${comoPesos(t.declarado.remBruta)}) no coincide con la que sale de los conceptos ($ ${comoPesos(calculo.remBruta)}). Diferencia de $ ${comoPesos(t.declarado.remBruta - calculo.remBruta)}.`
        );
      }
      for (const base of BASES_IMPONIBLES) {
        const declarado = t.declarado[base.clave];
        if (declarado === null) continue;
        const calculado = calculo.bases[base.clave];
        if (declarado !== calculado) {
          err(
            t.cuil,
            `${base.nombre} declarada ($ ${comoPesos(declarado)}) no coincide con la calculada ($ ${comoPesos(calculado)}). Diferencia de $ ${comoPesos(declarado - calculado)}. Destino: ${base.destino}.`
          );
        }
      }
    }

    /* --- El cuadro de datos complementarios no admite negativos --- */
    for (const base of BASES_IMPONIBLES) {
      const valor = t.declarado[base.clave] !== null && t.declarado[base.clave] !== undefined
        ? t.declarado[base.clave]
        : calculo.bases[base.clave];
      if (valor < 0) {
        err(t.cuil, `${base.nombre} da negativa ($ ${comoPesos(valor)}). El F931 rechaza los valores negativos del cuadro de datos complementarios.`);
      }
    }
  }

  return hallazgos;
}

/* ---------- Generación del archivo ---------- */

/**
 * Escribe el TXT completo. Devuelve { texto, lineas, avisos }.
 *
 * El orden es el que espera el servicio: la cabecera 01 y después, por
 * trabajador, su 02, sus 03, su 04, y si corresponde el 05 y el 06.
 */
/**
 * Los conceptos tal como van al archivo, que no siempre son los de la planilla.
 *
 * Hay dos correcciones, las dos decididas por el estudio y las dos anotadas en
 * el reservorio de la empresa. Ninguna es silenciosa: cada una deja su aviso.
 *
 * ── 1. Conceptos que se informan juntos ───────────────────────────────────
 *
 * Nautical liquida las vacaciones en dos renglones: `80` «Vacaciones» en
 * crédito y `100` «Descuento p/vacaciones pagas» en débito, los dos atados al
 * concepto ARCA 150000 y los dos con los mismos días.
 *
 * Informados así, ARCA suma +8 días y −8 días, le da CERO días de vacaciones,
 * no puede calcular el tope del adelanto vacacional y termina descartando el
 * importe neto de la base. Eso fue exactamente el rechazo de CAYO en 202609:
 * «la base imponible 1 informada (2.614.111,07) difiere de la determinada
 * (2.488.012,95)», y la diferencia —126.098,12— es justo el neto.
 *
 * Se informa el neto con el concepto de vacaciones, que es lo que el estudio
 * viene haciendo y lo que hacía el armado que ARCA aceptaba: ahí sólo aparece
 * el `80`, con sus días.
 *
 * ── 2. Aportes al valor que corresponde ───────────────────────────────────
 *
 * ARCA recalcula SIPA, obra social e INSSJyP sobre las bases declaradas y los
 * cruza contra lo retenido. Si no coinciden, el libro definitivo sale con SUS
 * números igual, así que informar el del recibo sólo agrega un rechazo.
 *
 * En 202609 el sistema de sueldos de Nautical venía topeando con una tabla
 * vieja y retuvo de menos en once empleados. Decisión del estudio: se informa
 * lo que hay que informar, y la diferencia es carga de la empresa.
 *
 * Por eso va como opción por empresa y no como regla: reescribir un importe
 * retenido es cambiar lo que dice el libro respecto del recibo, y eso lo
 * decide quien liquida, no el armador.
 */
function conceptosParaElArchivo(t, liquidacion, parametros, avisos) {
  const signoDe = (c) => (c.debitoCredito === 'D' ? -1 : 1);
  /*
   * Copias, siempre. Las dos correcciones cambian importes, y el archivo se
   * genera más de una vez por pantalla —cada recálculo lo vuelve a armar—.
   * Tocando los conceptos de verdad, la segunda pasada corrige lo corregido:
   * el neto de vacaciones salió $504.392,49 en vez de $126.098,12 por esto.
   */
  let conceptos = t.conceptos.map((c) => Object.assign({}, c));

  /* --- 1. Los que se informan juntos --- */
  const juntar = liquidacion.consolidar;
  if (juntar && Object.keys(juntar).length) {
    const porCodigo = new Map(conceptos.map((c) => [String(c.codigo), c]));
    const absorbidos = new Set();

    for (const c of conceptos) {
      const destinoCodigo = juntar[String(c.codigo)];
      if (!destinoCodigo) continue;
      const destino = porCodigo.get(String(destinoCodigo));
      if (!destino) {
        avisos.push(
          `CUIL ${t.cuil}: el concepto "${c.codigo}" se informa junto con el "${destinoCodigo}", ` +
            'pero el "' + destinoCodigo + '" no está en su liquidación. Se informa por separado.'
        );
        continue;
      }
      /* El neto respeta los signos; la cantidad queda la del que recibe,
         porque es el que lleva los días que ARCA necesita para topear. */
      const neto = signoDe(destino) * destino.importe + signoDe(c) * c.importe;
      avisos.push(
        `CUIL ${t.cuil}: se informó el neto de "${destinoCodigo}" y "${c.codigo}" en un solo ` +
          `renglón, $ ${comoPesos(Math.abs(neto))}, con ${(destino.cantidad / 100).toLocaleString('es-AR')} ` +
          'de cantidad. Los dos van al mismo concepto ARCA y separados se anulan los días.'
      );
      destino.importe = Math.abs(neto);
      destino.debitoCredito = neto < 0 ? 'D' : 'C';
      absorbidos.add(c);
    }
    if (absorbidos.size) conceptos = conceptos.filter((c) => !absorbidos.has(c));
  }

  /* --- 2. Los aportes, al valor que corresponde --- */
  const a = parametros && parametros.alicuotas;
  if (liquidacion.aportesAlValorCalculado && a && t.calculo) {
    const base = (clave) =>
      t.declarado[clave] !== null && t.declarado[clave] !== undefined
        ? t.declarado[clave]
        : (t.calculo.bases[clave] || 0);
    const adherentes = Number(soloDigitos(t.adherentes) || 0);

    const esperados = {
      '810000': { nombre: 'SIPA', valor: Math.round((base('rem1') * a.sipa) / 100) },
      '810001': { nombre: 'INSSJyP', valor: Math.round((base('rem5') * a.inssjyp) / 100) },
      '810002': {
        nombre: 'obra social',
        valor: Math.round((base('rem4') * (a.obraSocial + adherentes * a.adherente)) / 100),
      },
    };

    for (const [codigoArca, esperado] of Object.entries(esperados)) {
      const suyos = conceptos.filter((c) => String(c.codigoArca || '').trim() === codigoArca);
      if (!suyos.length) continue;
      if (suyos.length > 1) {
        /* Con dos renglones para el mismo aporte no hay manera de saber en
           cuál va la diferencia, y repartirla sería inventar. */
        avisos.push(
          `CUIL ${t.cuil}: el aporte de ${esperado.nombre} viene en ${suyos.length} renglones ` +
            `(${suyos.map((c) => `"${c.codigo}"`).join(', ')}), así que se dejó como estaba. ` +
            'Corregirlo automáticamente obligaría a decidir en cuál va la diferencia.'
        );
        continue;
      }
      const c = suyos[0];
      if (c.importe === esperado.valor) continue;
      avisos.push(
        `CUIL ${t.cuil}: el aporte de ${esperado.nombre} se informó en $ ${comoPesos(esperado.valor)}, ` +
          `que es lo que corresponde sobre la base. El recibo retuvo $ ${comoPesos(c.importe)}: ` +
          `la diferencia de $ ${comoPesos(esperado.valor - c.importe)} queda a cargo de la empresa.`
      );
      c.importe = esperado.valor;
    }
  }

  return conceptos;
}

function generarTxt(liquidacion, parametros) {
  const avisos = [];
  const lineas = [];

  /*
   * Relleno del legajo y del código de concepto.
   *
   * Los tres archivos aceptados que tenemos a la vista rellenan estos dos
   * campos de tres maneras distintas, y ARCA aceptó los tres:
   *
   *   Nautical 2022-2023   código a la derecha en las 10 posiciones
   *   Martín Prado 2026    código a la derecha en 4, después espacios
   *   plantilla oficial    a la izquierda, que es lo que hacíamos
   *
   * Así que el relleno no es parte del formato: el servicio recorta el campo.
   * Se conserva igual, por empresa, para poder comparar lo que generamos
   * contra lo que se presentó sin que la diferencia sea puro espacio.
   */
  const alinear = (valor, ancho) => {
    const texto = valor === null || valor === undefined ? '' : String(valor).trim();
    return ancho ? texto.padStart(ancho, ' ') : texto;
  };

  /*
   * El archivo va AGRUPADO POR TIPO DE REGISTRO: la cabecera, después todos
   * los 02, después todos los 03, después todos los 04.
   *
   * No es una interpretación: es lo que dice la planilla oficial en cada hoja
   * —"copiar el contenido ... a continuación de los registros de tipo 3 ya
   * copiados"— y es como están los once archivos aceptados que tenemos a la
   * vista, de las dos empresas y de 2022 a 2026. Hasta el 25/09/2026 esto se
   * escribía intercalado por trabajador (02, sus 03, su 04), que es como lo
   * describe la guía de 2018 en prosa.
   */
  const r02 = [], r03 = [], r04 = [], r06 = [];
  let enCeroOmitidos = 0;

  lineas.push(
    armarLinea('01', {
      cuit: liquidacion.cuit,
      envio: liquidacion.envio,
      periodo: liquidacion.periodo,
      /* Con envío 'RE' el tipo y los días base van en blanco. */
      tipoLiquidacion: liquidacion.envio === 'RE' ? '' : liquidacion.tipoLiquidacion,
      nroLiquidacion: liquidacion.nroLiquidacion,
      diasBase: liquidacion.envio === 'RE' ? '' : '30',
      cantidadReg04: String(liquidacion.trabajadores.length),
    }, avisos)
  );

  for (const t of liquidacion.trabajadores) {
    r02.push(
      armarLinea('02', {
        cuil: t.cuil,
        legajo: alinear(t.legajo, liquidacion.anchoLegajo),
        dependencia: t.dependencia,
        cbu: soloDigitos(t.cbu),
        diasLiquidados: soloDigitos(t.diasLiquidados) || '0',
        fechaPago: t.fechaPago,
        fechaRubrica: liquidacion.fechaRubrica,
        formaPago: soloDigitos(t.formaPago) || '0',
      }, avisos)
    );

    for (const c of conceptosParaElArchivo(t, liquidacion, parametros, avisos)) {
      /*
       * Los renglones en cero se informan igual: los archivos aceptados de
       * Nautical traen 72, y varios llevan una cantidad que sí dice algo (días
       * informados con importe 0). No es una regla del formato.
       *
       * El armado de Martín Prado, en cambio, no los copia. Con la opción
       * prendida se reproduce ese archivo tal cual, y lo omitido se avisa.
       */
      if (liquidacion.omitirConceptosEnCero && !Math.round(Number(c.importe) || 0)) {
        enCeroOmitidos += 1;
        continue;
      }
      r03.push(
        armarLinea('03', {
          cuil: t.cuil,
          codigoConcepto: alinear(c.codigo, liquidacion.anchoCodigoConcepto),
          cantidad: c.cantidad,
          unidad: c.unidad,
          importe: c.importe,
          debitoCredito: c.debitoCredito,
          /* En blanco cuando el concepto es del período informado: es lo que
             hacen la plantilla oficial y los archivos que ARCA acepta. */
          periodoAjuste: c.periodoAjuste,
        }, avisos)
      );
    }

    /* Lo declarado manda sobre lo calculado: si la planilla trae la base,
       se escribe la de la planilla. Solo se completa lo que falta. */
    const calculado = t.calculo ? t.calculo.bases : {};
    const base = (clave) =>
      t.declarado[clave] !== null && t.declarado[clave] !== undefined
        ? t.declarado[clave]
        : (calculado[clave] || 0);

    r04.push(
      armarLinea('04', {
        cuil: t.cuil,
        conyuge: soloDigitos(t.conyuge) || '0',
        hijos: soloDigitos(t.hijos) || '0',
        marcaCCT: soloDigitos(t.marcaCCT) || '0',
        marcaSCVO: soloDigitos(t.marcaSCVO) || '0',
        marcaReduccion: soloDigitos(t.marcaReduccion) || '0',
        tipoEmpresa: String(t.tipoEmpresa || '0').trim(),
        situacion: soloDigitos(t.situacion),
        condicion: soloDigitos(t.condicion),
        actividad: soloDigitos(t.actividad),
        modalidad: soloDigitos(t.modalidad),
        siniestrado: soloDigitos(t.siniestrado),
        localidad: soloDigitos(t.localidad),
        revista1: soloDigitos(t.revista1),
        diaRevista1: soloDigitos(t.diaRevista1),
        revista2: soloDigitos(t.revista2),
        diaRevista2: soloDigitos(t.diaRevista2),
        revista3: soloDigitos(t.revista3),
        diaRevista3: soloDigitos(t.diaRevista3),
        diasTrabajados: soloDigitos(t.diasTrabajados),
        horasTrabajadas: soloDigitos(t.horasTrabajadas),
        aportePorcAdicional: aCentavos(t.aportePorcAdicional),
        contribTareaDiferencial: aCentavos(t.contribTareaDiferencial),
        obraSocial: soloDigitos(t.obraSocial),
        adherentes: soloDigitos(t.adherentes),
        aporteAdicionalOS: aCentavos(t.aporteAdicionalOS),
        contribAdicionalOS: aCentavos(t.contribAdicionalOS),
        baseDifAportesOS: aCentavos(t.baseDifAportesOS),
        baseDifContribOS: aCentavos(t.baseDifContribOS),
        baseDifLRT: aCentavos(t.baseDifLRT),
        remMaternidad: aCentavos(t.remMaternidad),
        remBruta: t.declarado.remBruta !== null && t.declarado.remBruta !== undefined
          ? t.declarado.remBruta
          : (t.calculo ? t.calculo.remBruta : 0),
        rem1: base('rem1'),
        rem2: base('rem2'),
        rem3: base('rem3'),
        rem4: base('rem4'),
        rem5: base('rem5'),
        rem6: base('rem6'),
        rem7: base('rem7'),
        rem8: base('rem8'),
        rem9: base('rem9'),
        baseDifAporteSS: aCentavos(t.baseDifAporteSS),
        baseDifContribSS: aCentavos(t.baseDifContribSS),
        rem10: base('rem10'),
        /* La detracción de la ley 27.430 no sale de la liquidación: es un dato
           del período y del trabajador, así que vive en el reservorio. */
        importeDetraer:
          t.declarado.importeDetraer !== null && t.declarado.importeDetraer !== undefined
            ? t.declarado.importeDetraer
            : aCentavos(t.importeDetraer),
      }, avisos)
    );

    if (t.observaciones) {
      r06.push(armarLinea('06', { cuil: t.cuil, observaciones: t.observaciones }, avisos));
    }
  }

  if (enCeroOmitidos) {
    avisos.push(
      `Se dejaron afuera ${enCeroOmitidos} renglones con importe 0, como hace el armado de la empresa.`
    );
  }

  /* El 06 va al final: no hay archivo aceptado con observaciones a la vista,
     así que se lo trata como un bloque más y queda dicho acá. */
  lineas.push(...r02, ...r03, ...r04, ...r06);

  /*
   * SIN salto de línea final.
   *
   * ARCA lee el archivo por líneas y una línea vacía al final es un registro
   * más: el validador devuelve «El tipo de Registro de la línea N es
   * inválido: ""», con N = cantidad de registros + 1. Pasó con el envío
   * 202609 de Nautical, que tenía 223 registros y se quejó de la línea 224.
   *
   * Verificado contra `Armado 08-26 Nau.txt`, que ARCA aceptó: termina en el
   * último dígito del último registro 04, sin CRLF.
   */
  return { texto: lineas.join('\r\n'), lineas, avisos };
}

/**
 * Codifica el texto en ANSI (Windows-1252), que es lo que pide ARCA.
 * Los caracteres que no existen en esa tabla se reemplazan por su versión
 * sin acento, y si no hay equivalente, por un espacio. Cada reemplazo
 * queda avisado.
 */
function aWindows1252(texto, avisos) {
  const reemplazos = { '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', ' ': ' ' };
  const bytes = [];
  const perdidos = new Set();

  for (const caracter of texto) {
    let ch = reemplazos[caracter] !== undefined ? reemplazos[caracter] : caracter;
    for (const c of ch) {
      const punto = c.codePointAt(0);
      if (punto <= 0xff && !(punto >= 0x80 && punto <= 0x9f)) {
        bytes.push(punto);
      } else {
        const sinAcento = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
        const p2 = sinAcento.codePointAt(0);
        if (sinAcento.length === 1 && p2 <= 0xff) {
          bytes.push(p2);
        } else {
          bytes.push(0x20);
          perdidos.add(c);
        }
      }
    }
  }

  if (perdidos.size && avisos) {
    avisos.push(`Se reemplazaron por espacio caracteres que no existen en ANSI: ${Array.from(perdidos).join(' ')}`);
  }
  return new Uint8Array(bytes);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    aCentavos,
    comoPesos,
    soloDigitos,
    cuilValido,
    aFechaArca,
    aPeriodoArca,
    normalizarEncabezado,
    SINONIMOS,
    detectarColumnas,
    armarLiquidacion,
    consolidarConceptos,
    CAMPOS_PADRON,
    leerPadron,
    aplicarPadron,
    leerParametrizacion,
    SUBSISTEMAS,
    BASE_POR_SUBSISTEMA,
    calcularBases,
    controlar,
    generarTxt,
    aWindows1252,
  };
}
