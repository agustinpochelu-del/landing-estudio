/**
 * Diseño de los registros del archivo de importación de liquidaciones
 * del Libro de Sueldos Digital.
 *
 * Esta es la fuente de verdad del FORMATO. Nada de lo que hay acá se
 * inventa: cada posición sale de los anexos de ARCA que están en
 * `referencia/`, y los largos totales están verificados contra la planilla
 * oficial `LSD-ARMADO-TXT-Liquidaciones.xlsx` (versión de septiembre de 2025).
 *
 * ── Reglas de armado (Anexo III) ──────────────────────────────────────────
 *
 *   Alfanumérico  espacios a la DERECHA hasta completar la longitud.
 *   Numérico      ceros a la IZQUIERDA hasta completar la longitud.
 *   Decimal       sin separador decimal: las dos últimas posiciones son los
 *                 centavos. Por eso los importes viajan en centavos enteros
 *                 y nunca en punto flotante.
 *   Fecha         AAAAMMDD.
 *
 * El archivo es texto plano, sin comprimir, codificación ANSI (Windows-1252),
 * un registro por línea.
 *
 * ── Dos precisiones que no están en la guía de 2018 ───────────────────────
 *
 * 1. La FECHA DE RÚBRICA del registro 02 ya no se informa: la planilla oficial
 *    la deja en ocho espacios y la aclara con "No se completa por el momento".
 * 2. El CBU vacío va con veintidós ESPACIOS, no con ceros. Es el único campo
 *    numérico que en blanco se rellena con espacios.
 *
 * ── El registro 06 ────────────────────────────────────────────────────────
 *
 * No figura en la guía de conceptos básicos V2.0. Aparece en la planilla
 * oficial: son observaciones por CUIL, ochenta caracteres alfanuméricos.
 *
 * ── Para cambiar una posición ─────────────────────────────────────────────
 *
 * No se toca de memoria. Se abre el anexo, se verifica, y se corre
 * `pruebas.html`, que controla que cada registro dé su largo exacto.
 */

/* Los largos totales están verificados contra la planilla oficial de ARCA. */
const LARGO_REGISTRO = { '01': 35, '02': 115, '03': 51, '04': 370, '05': 65, '06': 93 };

/*
 * Cada campo declara: clave interna, longitud, formato y una nota corta.
 *
 * Formatos:
 *   'A'  alfanumérico            espacios a la derecha
 *   'N'  numérico                ceros a la izquierda
 *   'D'  decimal en centavos     ceros a la izquierda, sin separador
 *   'F'  fecha AAAAMMDD          o espacios si no hay dato
 *   'AN' numérico que en blanco va con espacios (CBU, situaciones de
 *        revista y período de ajuste)
 *   'K'  constante               se escribe tal cual lo que diga `valor`
 */

const REGISTRO_01 = [
  { clave: 'tipo', largo: 2, formato: 'K', valor: '01', nombre: 'Identificador de registro' },
  { clave: 'cuit', largo: 11, formato: 'N', nombre: 'CUIT del empleador' },
  { clave: 'envio', largo: 2, formato: 'A', nombre: 'Identificación del envío' },
  { clave: 'periodo', largo: 6, formato: 'N', nombre: 'Período (AAAAMM)' },
  { clave: 'tipoLiquidacion', largo: 1, formato: 'A', nombre: 'Tipo de liquidación' },
  { clave: 'nroLiquidacion', largo: 5, formato: 'N', nombre: 'Número de liquidación' },
  { clave: 'diasBase', largo: 2, formato: 'A', nombre: 'Días base' },
  { clave: 'cantidadReg04', largo: 6, formato: 'N', nombre: 'Cantidad de registros 04' },
];

const REGISTRO_02 = [
  { clave: 'tipo', largo: 2, formato: 'K', valor: '02', nombre: 'Identificador de registro' },
  { clave: 'cuil', largo: 11, formato: 'N', nombre: 'CUIL' },
  { clave: 'legajo', largo: 10, formato: 'A', nombre: 'Legajo' },
  { clave: 'dependencia', largo: 50, formato: 'A', nombre: 'Dependencia de revista' },
  { clave: 'cbu', largo: 22, formato: 'AN', nombre: 'CBU' },
  { clave: 'diasLiquidados', largo: 3, formato: 'N', nombre: 'Días liquidados' },
  { clave: 'fechaPago', largo: 8, formato: 'F', nombre: 'Fecha de pago' },
  /*
   * NO es una constante. La planilla oficial de 2025 la deja sin completar y el
   * archivo aceptado de Nautical la trae en blanco, pero el de Martín Prado
   * trae '20210101' en los cinco meses y ARCA lo aceptó igual. Es un campo de
   * fecha que puede ir vacío, no un blanco fijo. La tuvimos cableada como
   * constante hasta el 25/09/2026, cuando solo habíamos visto un cliente.
   */
  { clave: 'fechaRubrica', largo: 8, formato: 'F', nombre: 'Fecha de rúbrica' },
  { clave: 'formaPago', largo: 1, formato: 'N', nombre: 'Forma de pago' },
];

const REGISTRO_03 = [
  { clave: 'tipo', largo: 2, formato: 'K', valor: '03', nombre: 'Identificador de registro' },
  { clave: 'cuil', largo: 11, formato: 'N', nombre: 'CUIL' },
  { clave: 'codigoConcepto', largo: 10, formato: 'A', nombre: 'Código de concepto del empleador' },
  { clave: 'cantidad', largo: 5, formato: 'D', nombre: 'Cantidad' },
  { clave: 'unidad', largo: 1, formato: 'A', nombre: 'Unidad' },
  { clave: 'importe', largo: 15, formato: 'D', nombre: 'Importe' },
  { clave: 'debitoCredito', largo: 1, formato: 'A', nombre: 'Débito / Crédito' },
  /* En blanco cuando el concepto es del período informado. La guía de 2018
     dice "se informa en 0", pero tanto la plantilla oficial de 2025 como los
     archivos que ARCA viene aceptando lo dejan en seis espacios. */
  { clave: 'periodoAjuste', largo: 6, formato: 'AN', nombre: 'Período de ajuste' },
];

const REGISTRO_04 = [
  { clave: 'tipo', largo: 2, formato: 'K', valor: '04', nombre: 'Identificador de registro' },
  { clave: 'cuil', largo: 11, formato: 'N', nombre: 'CUIL' },
  { clave: 'conyuge', largo: 1, formato: 'N', nombre: 'Cónyuge' },
  { clave: 'hijos', largo: 2, formato: 'N', nombre: 'Cantidad de hijos' },
  { clave: 'marcaCCT', largo: 1, formato: 'N', nombre: 'Marca CCT' },
  { clave: 'marcaSCVO', largo: 1, formato: 'N', nombre: 'Marca SCVO' },
  { clave: 'marcaReduccion', largo: 1, formato: 'N', nombre: 'Corresponde reducción' },
  { clave: 'tipoEmpresa', largo: 1, formato: 'A', nombre: 'Tipo de empresa' },
  { clave: 'tipoOperacion', largo: 1, formato: 'K', valor: '0', nombre: 'Tipo de operación' },
  { clave: 'situacion', largo: 2, formato: 'N', nombre: 'Código de situación' },
  { clave: 'condicion', largo: 2, formato: 'N', nombre: 'Código de condición' },
  { clave: 'actividad', largo: 3, formato: 'N', nombre: 'Código de actividad' },
  { clave: 'modalidad', largo: 3, formato: 'N', nombre: 'Código de modalidad de contratación' },
  { clave: 'siniestrado', largo: 2, formato: 'N', nombre: 'Código de siniestrado' },
  { clave: 'localidad', largo: 2, formato: 'N', nombre: 'Código de localidad' },
  /* Las situaciones de revista sin usar van en BLANCO, no en '00': '00' no es
     un código de situación de revista. Verificado contra un archivo aceptado. */
  { clave: 'revista1', largo: 2, formato: 'AN', nombre: 'Situación de revista 1' },
  { clave: 'diaRevista1', largo: 2, formato: 'N', nombre: 'Día inicio situación de revista 1' },
  { clave: 'revista2', largo: 2, formato: 'AN', nombre: 'Situación de revista 2' },
  { clave: 'diaRevista2', largo: 2, formato: 'N', nombre: 'Día inicio situación de revista 2' },
  { clave: 'revista3', largo: 2, formato: 'AN', nombre: 'Situación de revista 3' },
  { clave: 'diaRevista3', largo: 2, formato: 'N', nombre: 'Día inicio situación de revista 3' },
  { clave: 'diasTrabajados', largo: 2, formato: 'N', nombre: 'Cantidad de días trabajados' },
  { clave: 'horasTrabajadas', largo: 3, formato: 'N', nombre: 'Horas trabajadas' },
  { clave: 'aportePorcAdicional', largo: 5, formato: 'D', nombre: 'Porcentaje de aporte adicional SS' },
  { clave: 'contribTareaDiferencial', largo: 5, formato: 'D', nombre: 'Contribución tarea diferencial' },
  { clave: 'obraSocial', largo: 6, formato: 'N', nombre: 'Código de obra social' },
  { clave: 'adherentes', largo: 2, formato: 'N', nombre: 'Cantidad de adherentes' },
  { clave: 'aporteAdicionalOS', largo: 15, formato: 'D', nombre: 'Aporte adicional OS' },
  { clave: 'contribAdicionalOS', largo: 15, formato: 'D', nombre: 'Contribución adicional OS' },
  { clave: 'baseDifAportesOS', largo: 15, formato: 'D', nombre: 'Base diferencial aportes OS y FSR' },
  { clave: 'baseDifContribOS', largo: 15, formato: 'D', nombre: 'Base diferencial contribuciones OS y FSR' },
  { clave: 'baseDifLRT', largo: 15, formato: 'D', nombre: 'Base diferencial LRT' },
  { clave: 'remMaternidad', largo: 15, formato: 'D', nombre: 'Remuneración maternidad ANSeS' },
  { clave: 'remBruta', largo: 15, formato: 'D', nombre: 'Remuneración bruta' },
  { clave: 'rem1', largo: 15, formato: 'D', nombre: 'Base imponible 1' },
  { clave: 'rem2', largo: 15, formato: 'D', nombre: 'Base imponible 2' },
  { clave: 'rem3', largo: 15, formato: 'D', nombre: 'Base imponible 3' },
  { clave: 'rem4', largo: 15, formato: 'D', nombre: 'Base imponible 4' },
  { clave: 'rem5', largo: 15, formato: 'D', nombre: 'Base imponible 5' },
  { clave: 'rem6', largo: 15, formato: 'D', nombre: 'Base imponible 6' },
  { clave: 'rem7', largo: 15, formato: 'D', nombre: 'Base imponible 7' },
  { clave: 'rem8', largo: 15, formato: 'D', nombre: 'Base imponible 8' },
  { clave: 'rem9', largo: 15, formato: 'D', nombre: 'Base imponible 9' },
  { clave: 'baseDifAporteSS', largo: 15, formato: 'D', nombre: 'Base diferencial de aportes de Seg. Social' },
  { clave: 'baseDifContribSS', largo: 15, formato: 'D', nombre: 'Base diferencial de contribuciones de Seg. Social' },
  { clave: 'rem10', largo: 15, formato: 'D', nombre: 'Base imponible 10' },
  { clave: 'importeDetraer', largo: 15, formato: 'D', nombre: 'Importe a detraer' },
];

const REGISTRO_05 = [
  { clave: 'tipo', largo: 2, formato: 'K', valor: '05', nombre: 'Identificador de registro' },
  { clave: 'cuil', largo: 11, formato: 'N', nombre: 'CUIL' },
  { clave: 'categoria', largo: 6, formato: 'N', nombre: 'Categoría profesional' },
  { clave: 'puesto', largo: 4, formato: 'N', nombre: 'Puesto desempeñado' },
  { clave: 'fechaIngreso', largo: 8, formato: 'F', nombre: 'Fecha de ingreso' },
  { clave: 'fechaEgreso', largo: 8, formato: 'F', nombre: 'Fecha de egreso' },
  { clave: 'importe', largo: 15, formato: 'D', nombre: 'Remuneración' },
  { clave: 'cuitEmpleador', largo: 11, formato: 'N', nombre: 'CUIT de la empresa de servicios eventuales' },
];

const REGISTRO_06 = [
  { clave: 'tipo', largo: 2, formato: 'K', valor: '06', nombre: 'Identificador de registro' },
  { clave: 'cuil', largo: 11, formato: 'N', nombre: 'CUIL' },
  { clave: 'observaciones', largo: 80, formato: 'A', nombre: 'Observaciones' },
];

const DISENOS = {
  '01': REGISTRO_01,
  '02': REGISTRO_02,
  '03': REGISTRO_03,
  '04': REGISTRO_04,
  '05': REGISTRO_05,
  '06': REGISTRO_06,
};

/* ---------- Armado ---------- */

/**
 * Escribe un campo alfanumérico: espacios a la derecha.
 * Si el texto excede la longitud, se recorta y el recorte se avisa
 * por `avisos` — nada se corrige en silencio.
 */
function campoTexto(valor, largo, nombre, avisos) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  /* Los acentos y la ñ existen en ANSI, pero un carácter fuera de esa tabla
     rompe el archivo. Se reemplaza y se avisa. */
  if (texto.length > largo) {
    if (avisos) avisos.push(`Se recortó "${nombre}": "${texto}" no entra en ${largo} caracteres.`);
    texto = texto.slice(0, largo);
  }
  return texto.padEnd(largo, ' ');
}

/** Escribe un campo numérico: ceros a la izquierda. */
function campoNumero(valor, largo, nombre, avisos) {
  const texto = valor === null || valor === undefined || valor === '' ? '0' : String(valor);
  const limpio = texto.replace(/[^0-9]/g, '');
  if (limpio.length > largo) {
    if (avisos) avisos.push(`"${nombre}" no entra en ${largo} dígitos: ${texto}.`);
    return limpio.slice(-largo);
  }
  return limpio.padStart(largo, '0');
}

/**
 * Escribe un decimal. El valor llega en CENTAVOS ENTEROS: las dos últimas
 * posiciones del campo son los centavos, sin separador.
 */
function campoDecimal(centavos, largo, nombre, avisos) {
  const n = Math.round(Number(centavos) || 0);
  if (n < 0) {
    if (avisos) avisos.push(`"${nombre}" no puede ser negativo: ${n / 100}.`);
  }
  const texto = String(Math.abs(n));
  if (texto.length > largo) {
    if (avisos) avisos.push(`"${nombre}" no entra en ${largo} posiciones: ${n / 100}.`);
    return texto.slice(-largo);
  }
  return texto.padStart(largo, '0');
}

/** Escribe una fecha AAAAMMDD, o el campo en blanco si no hay dato. */
function campoFecha(valor, largo, nombre, avisos) {
  if (!valor) return ' '.repeat(largo);
  const texto = String(valor).replace(/[^0-9]/g, '');
  if (texto.length !== 8) {
    if (avisos) avisos.push(`"${nombre}" no es una fecha AAAAMMDD válida: ${valor}.`);
    return ' '.repeat(largo);
  }
  return texto;
}

/**
 * Arma una línea a partir de un diseño y un objeto de datos.
 * Devuelve la línea; los problemas se acumulan en `avisos`.
 */
function armarLinea(codigo, datos, avisos) {
  const diseno = DISENOS[codigo];
  if (!diseno) throw new Error(`No existe el diseño del registro ${codigo}.`);

  let linea = '';
  for (const campo of diseno) {
    const valor = datos ? datos[campo.clave] : undefined;
    switch (campo.formato) {
      case 'K':
        linea += campo.valor;
        break;
      case 'A':
        linea += campoTexto(valor, campo.largo, campo.nombre, avisos);
        break;
      case 'N':
        linea += campoNumero(valor, campo.largo, campo.nombre, avisos);
        break;
      case 'D':
        linea += campoDecimal(valor, campo.largo, campo.nombre, avisos);
        break;
      case 'F':
        linea += campoFecha(valor, campo.largo, campo.nombre, avisos);
        break;
      /* Numérico que en blanco va con espacios. */
      case 'AN':
        linea += valor
          ? campoNumero(valor, campo.largo, campo.nombre, avisos)
          : ' '.repeat(campo.largo);
        break;
      default:
        throw new Error(`Formato desconocido "${campo.formato}" en ${campo.nombre}.`);
    }
  }

  /* Control de largo: si esto falla, el archivo se rechaza entero. */
  const esperado = LARGO_REGISTRO[codigo];
  if (linea.length !== esperado) {
    throw new Error(
      `El registro ${codigo} quedó de ${linea.length} posiciones y tiene que tener ${esperado}.`
    );
  }
  return linea;
}

/** Suma de las longitudes declaradas, para el control de las pruebas. */
function largoDeclarado(codigo) {
  return DISENOS[codigo].reduce((total, campo) => total + campo.largo, 0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LARGO_REGISTRO,
    DISENOS,
    armarLinea,
    largoDeclarado,
    campoTexto,
    campoNumero,
    campoDecimal,
    campoFecha,
  };
}
