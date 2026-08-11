/**
 * Tablas del sistema del Libro de IVA Digital.
 * Transcriptas del anexo "Tablas del SISTEMA" de ARCA.
 */

/* Alícuotas de IVA: código de 4 dígitos -> tasa decimal. */
const ALICUOTAS = [
  { codigo: '0003', tasa: 0, etiqueta: '0,00 %' },
  { codigo: '0009', tasa: 0.025, etiqueta: '2,50 %' },
  { codigo: '0008', tasa: 0.05, etiqueta: '5,00 %' },
  { codigo: '0004', tasa: 0.105, etiqueta: '10,50 %' },
  { codigo: '0005', tasa: 0.21, etiqueta: '21,00 %' },
  { codigo: '0006', tasa: 0.27, etiqueta: '27,00 %' },
];

/* Las que aparecen en la práctica. El resolutor prueba primero estas. */
const ALICUOTAS_HABITUALES = ['0005', '0004', '0006', '0003'];

function alicuotaPorCodigo(codigo) {
  return ALICUOTAS.find((a) => a.codigo === codigo) || null;
}

/** Busca la alícuota por su tasa decimal: 0.105 -> la del código 0004. */
function alicuotaPorTasa(tasa) {
  return ALICUOTAS.find((a) => Math.abs(a.tasa - tasa) < 1e-9) || null;
}

/* Códigos de operación. El vacío se informa como espacio. */
const CODIGOS_OPERACION = [
  { codigo: ' ', descripcion: 'No corresponde' },
  { codigo: 'A', descripcion: 'No alcanzado' },
  { codigo: 'C', descripcion: 'Operación de canje' },
  { codigo: 'D', descripcion: 'Devolución IVA turistas extranjeros' },
  { codigo: 'E', descripcion: 'Operaciones exentas' },
  { codigo: 'N', descripcion: 'No gravado' },
  { codigo: 'T', descripcion: 'Reintegro Decreto 1043/2016' },
  { codigo: 'X', descripcion: 'Importación / exportación del exterior' },
  { codigo: 'Z', descripcion: 'Importación / exportación zona franca' },
];

/* Tipos de documento. Solo los que se usan en la práctica del libro. */
const TIPOS_DOCUMENTO = [
  { codigo: '80', descripcion: 'CUIT' },
  { codigo: '86', descripcion: 'CUIL' },
  { codigo: '87', descripcion: 'CDI' },
  { codigo: '89', descripcion: 'Libreta de enrolamiento' },
  { codigo: '90', descripcion: 'Libreta cívica' },
  { codigo: '91', descripcion: 'CI extranjera' },
  { codigo: '92', descripcion: 'En trámite' },
  { codigo: '93', descripcion: 'Acta de nacimiento' },
  { codigo: '94', descripcion: 'Pasaporte' },
  { codigo: '96', descripcion: 'DNI' },
  { codigo: '99', descripcion: 'Sin identificar / venta global diaria' },
];

/*
 * Las planillas suelen traer el tipo de documento escrito ("CUIT", "DNI")
 * en vez del código. Esto lo lleva al código de dos dígitos.
 */
const ALIAS_DOCUMENTO = {
  CUIT: '80', CUIL: '86', CDI: '87',
  'LIBRETA DE ENROLAMIENTO': '89', LE: '89',
  'LIBRETA CIVICA': '90', LC: '90',
  'CI EXTRANJERA': '91', 'CEDULA EXTRANJERA': '91',
  'EN TRAMITE': '92',
  'ACTA DE NACIMIENTO': '93',
  PASAPORTE: '94',
  DNI: '96', 'DOC NACIONAL DE IDENTIDAD': '96', 'DOCUMENTO NACIONAL DE IDENTIDAD': '96',
  'SIN IDENTIFICAR': '99', 'CONSUMIDOR FINAL': '99', 'VENTA GLOBAL DIARIA': '99',
};

/**
 * Acepta "80", 80, "CUIT", "C.U.I.T.". Devuelve null si no lo reconoce.
 * `aliasExtra` es el vocabulario propio del perfil de origen, si lo hay:
 * tiene prioridad sobre la tabla general.
 */
function resolverTipoDocumento(valor, aliasExtra) {
  if (valor == null || valor === '') return null;

  const bruto = String(valor).trim();
  if (/^\d{1,2}$/.test(bruto)) {
    const cod = bruto.padStart(2, '0');
    return TIPOS_DOCUMENTO.some((t) => t.codigo === cod) ? cod : null;
  }

  /* El normalizado convierte los puntos en espacios, así que "C.U.I.T."
     queda como "C U I T": hay que probar también la versión sin espacios. */
  const norm = normalizarTexto(bruto);
  const compacto = norm.replace(/\s+/g, '');
  const extra = aliasExtra || {};

  return extra[norm] || extra[compacto] ||
    ALIAS_DOCUMENTO[norm] || ALIAS_DOCUMENTO[compacto] || null;
}

/* Monedas. PES es la única que se usa salvo operaciones con el exterior. */
const MONEDAS = [
  { codigo: 'PES', descripcion: 'Pesos argentinos' },
  { codigo: 'DOL', descripcion: 'Dólar estadounidense' },
  { codigo: '060', descripcion: 'Euro' },
  { codigo: '012', descripcion: 'Real' },
  { codigo: '011', descripcion: 'Pesos uruguayos' },
  { codigo: '033', descripcion: 'Peso chileno' },
];

/* Tipos de comprobante. Tabla completa del anexo. */
const TIPOS_COMPROBANTE = [
  ['001', 'Facturas A'],
  ['002', 'Notas de débito A'],
  ['003', 'Notas de crédito A'],
  ['004', 'Recibos A'],
  ['005', 'Notas de venta al contado A'],
  ['006', 'Facturas B'],
  ['007', 'Notas de débito B'],
  ['008', 'Notas de crédito B'],
  ['009', 'Recibos B'],
  ['010', 'Notas de venta al contado B'],
  ['011', 'Facturas C'],
  ['012', 'Notas de débito C'],
  ['013', 'Notas de crédito C'],
  ['015', 'Recibos C'],
  ['016', 'Notas de venta al contado C'],
  ['017', 'Liquidación de servicios públicos clase A'],
  ['018', 'Liquidación de servicios públicos clase B'],
  ['019', 'Facturas de exportación'],
  ['020', 'Notas de débito por operaciones con el exterior'],
  ['021', 'Notas de crédito por operaciones con el exterior'],
  ['022', 'Facturas - permiso exportación simplificado Dto. 855/97'],
  ['023', 'Comprobantes A de compra primaria sector pesquero marítimo'],
  ['024', 'Comprobantes A de consignación primaria sector pesquero marítimo'],
  ['025', 'Comprobantes B de compra primaria sector pesquero marítimo'],
  ['026', 'Comprobantes B de consignación primaria sector pesquero marítimo'],
  ['027', 'Liquidación única comercial impositiva clase A'],
  ['028', 'Liquidación única comercial impositiva clase B'],
  ['029', 'Liquidación única comercial impositiva clase C'],
  ['030', 'Comprobantes de compra de bienes usados'],
  ['032', 'Comprobantes para reciclar materiales'],
  ['033', 'Liquidación primaria de granos'],
  ['034', 'Comprobantes A del apartado A inciso f) RG 1415'],
  ['035', 'Comprobantes B del anexo I apartado A inciso f) RG 1415'],
  ['036', 'Comprobantes C del anexo I apartado A inciso f) RG 1415'],
  ['037', 'Notas de débito o documento equivalente RG 1415'],
  ['038', 'Notas de crédito o documento equivalente RG 1415'],
  ['039', 'Otros comprobantes A que cumplen con la RG 1415'],
  ['040', 'Otros comprobantes B que cumplen con la RG 1415'],
  ['041', 'Otros comprobantes C que cumplen con la RG 1415'],
  ['043', 'Nota de crédito liquidación única comercial impositiva clase B'],
  ['044', 'Nota de crédito liquidación única comercial impositiva clase C'],
  ['045', 'Nota de débito liquidación única comercial impositiva clase A'],
  ['046', 'Nota de débito liquidación única comercial impositiva clase B'],
  ['047', 'Nota de débito liquidación única comercial impositiva clase C'],
  ['048', 'Nota de crédito liquidación única comercial impositiva clase A'],
  ['049', 'Comprobantes de compra de bienes no registrables a consumidores finales'],
  ['050', 'Recibo factura A régimen de factura de crédito'],
  ['051', 'Facturas M'],
  ['052', 'Notas de débito M'],
  ['053', 'Notas de crédito M'],
  ['054', 'Recibos M'],
  ['055', 'Notas de venta al contado M'],
  ['056', 'Comprobantes M del anexo I apartado A inciso f) RG 1415'],
  ['057', 'Otros comprobantes M que cumplan con la RG 1415'],
  ['058', 'Cuentas de venta y líquido producto M'],
  ['059', 'Liquidaciones M'],
  ['060', 'Cuentas de venta y líquido producto A'],
  ['061', 'Cuentas de venta y líquido producto B'],
  ['063', 'Liquidaciones A'],
  ['064', 'Liquidaciones B'],
  ['066', 'Despacho de importación'],
  ['068', 'Liquidación C'],
  ['070', 'Recibos factura de crédito'],
  ['081', 'Tique factura A controladores fiscales'],
  ['082', 'Tique factura B'],
  ['083', 'Tique'],
  ['090', 'Nota de crédito otros comprobantes que no cumplen con la RG 1415'],
  ['099', 'Otros comprobantes que no cumplen con la RG 1415'],
  ['109', 'Tique C'],
  ['110', 'Tique nota de crédito'],
  ['111', 'Tique factura C'],
  ['112', 'Tique nota de crédito A'],
  ['113', 'Tique nota de crédito B'],
  ['114', 'Tique nota de crédito C'],
  ['115', 'Tique nota de débito A'],
  ['116', 'Tique nota de débito B'],
  ['117', 'Tique nota de débito C'],
  ['118', 'Tique factura M'],
  ['119', 'Tique nota de crédito M'],
  ['120', 'Tique nota de débito M'],
  ['150', 'Liquidación de compra primaria sector tabacalero A'],
  ['151', 'Liquidación de compra primaria sector tabacalero B'],
  ['157', 'Cuenta de venta y líquido producto A - sector avícola'],
  ['158', 'Cuenta de venta y líquido producto B - sector avícola'],
  ['159', 'Liquidación de compra A - sector avícola'],
  ['160', 'Liquidación de compra B - sector avícola'],
  ['161', 'Liquidación de compra directa A - sector avícola'],
  ['162', 'Liquidación de compra directa B - sector avícola'],
  ['163', 'Liquidación de compra directa C - sector avícola'],
  ['164', 'Liquidación de venta directa A - sector avícola'],
  ['165', 'Liquidación de venta directa B - sector avícola'],
  ['166', 'Liquidación de contratación de crianza pollos parrilleros A'],
  ['167', 'Liquidación de contratación de crianza pollos parrilleros B'],
  ['168', 'Liquidación de contratación de crianza pollos parrilleros C'],
  ['169', 'Liquidación de crianza pollos parrilleros A'],
  ['170', 'Liquidación de crianza pollos parrilleros B'],
  ['171', 'Liquidación de compra de caña de azúcar A'],
  ['172', 'Liquidación de compra de caña de azúcar B'],
  ['180', 'Cuenta de venta y líquido producto A - sector pecuario'],
  ['182', 'Cuenta de venta y líquido producto B - sector pecuario'],
  ['183', 'Liquidación de compra A - sector pecuario'],
  ['185', 'Liquidación de compra B - sector pecuario'],
  ['186', 'Liquidación de compra directa A - sector pecuario'],
  ['188', 'Liquidación de compra directa B - sector pecuario'],
  ['189', 'Liquidación de compra directa C - sector pecuario'],
  ['190', 'Liquidación de venta directa A - sector pecuario'],
  ['191', 'Liquidación de venta directa B - sector pecuario'],
  ['195', 'Factura clase T'],
  ['196', 'Nota de débito clase T'],
  ['197', 'Nota de crédito clase T'],
  ['201', 'Factura de crédito electrónica MiPyME (FCE) A'],
  ['202', 'Nota de débito electrónica MiPyME (FCE) A'],
  ['203', 'Nota de crédito electrónica MiPyME (FCE) A'],
  ['206', 'Factura de crédito electrónica MiPyME (FCE) B'],
  ['207', 'Nota de débito electrónica MiPyME (FCE) B'],
  ['208', 'Nota de crédito electrónica MiPyME (FCE) B'],
  ['211', 'Factura de crédito electrónica MiPyME (FCE) C'],
  ['212', 'Nota de débito electrónica MiPyME (FCE) C'],
  ['213', 'Nota de crédito electrónica MiPyME (FCE) C'],
  ['331', 'Liquidación secundaria de granos'],
  ['332', 'Certificación electrónica (granos)'],
].map(([codigo, descripcion]) => ({ codigo, descripcion }));

function tipoComprobantePorCodigo(codigo) {
  return TIPOS_COMPROBANTE.find((t) => t.codigo === codigo) || null;
}

/* Los tipos que restan: las notas de crédito. Sirve para el panel de control. */
const TIPOS_NOTA_CREDITO = new Set([
  '003', '008', '013', '021', '038', '043', '044', '048',
  '053', '090', '110', '112', '113', '114', '119', '197', '203', '208', '213',
]);

function esNotaDeCredito(codigo) {
  return TIPOS_NOTA_CREDITO.has(codigo);
}

/*
 * "Mis Comprobantes" exporta el tipo como texto ("1 - Factura A", "FACTURA A",
 * "Nota de Crédito B"...). Esto lo lleva al código de tres dígitos.
 */
function normalizarTexto(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/* Índice de descripciones normalizadas -> código, para el reconocimiento por texto. */
const INDICE_COMPROBANTES = (() => {
  const idx = new Map();
  for (const t of TIPOS_COMPROBANTE) {
    idx.set(normalizarTexto(t.descripcion), t.codigo);
  }
  /* Variantes en singular y abreviadas que usa "Mis Comprobantes". */
  const alias = {
    'FACTURA A': '001', 'FACTURAS A': '001', 'FAC A': '001',
    'NOTA DE DEBITO A': '002', 'ND A': '002',
    'NOTA DE CREDITO A': '003', 'NC A': '003',
    'RECIBO A': '004',
    'FACTURA B': '006', 'FAC B': '006',
    'NOTA DE DEBITO B': '007', 'ND B': '007',
    'NOTA DE CREDITO B': '008', 'NC B': '008',
    'RECIBO B': '009',
    'FACTURA C': '011', 'FAC C': '011',
    'NOTA DE DEBITO C': '012', 'ND C': '012',
    'NOTA DE CREDITO C': '013', 'NC C': '013',
    'RECIBO C': '015',
    'FACTURA M': '051',
    'NOTA DE DEBITO M': '052',
    'NOTA DE CREDITO M': '053',
    'FACTURA DE EXPORTACION': '019',
    'FACTURA E': '019',
    'DESPACHO DE IMPORTACION': '066',
    'TIQUE FACTURA A': '081',
    'TIQUE FACTURA B': '082',
    'TIQUE FACTURA C': '111',
  };
  for (const [k, v] of Object.entries(alias)) idx.set(k, v);
  return idx;
})();

/**
 * Devuelve el código de 3 dígitos, o null si no lo reconoce.
 * Acepta "001", 1, "1 - Factura A", "Factura A", "FACTURAS A".
 *
 * `aliasExtra` es el vocabulario propio del perfil de origen, si lo hay.
 * Tiene prioridad sobre la tabla general: un sistema puede llamarle "FA" a
 * la factura A, y eso solo vale para ese origen.
 */
function resolverTipoComprobante(valor, aliasExtra) {
  if (valor == null || valor === '') return null;

  const extra = aliasExtra || {};
  const buscar = (texto) => {
    const n = normalizarTexto(texto);
    return extra[n] || INDICE_COMPROBANTES.get(n) || null;
  };

  /* Número puro: 1 -> 001 */
  if (typeof valor === 'number' && Number.isInteger(valor)) {
    const cod = String(valor).padStart(3, '0');
    return tipoComprobantePorCodigo(cod) ? cod : null;
  }

  const bruto = String(valor).trim();

  /* El alias del perfil se prueba antes que nada: puede reasignar hasta un
     texto que la tabla general ya conoce. */
  const porAlias = extra[normalizarTexto(bruto)];
  if (porAlias) return porAlias;

  /* "001" o "1" */
  if (/^\d{1,3}$/.test(bruto)) {
    const cod = bruto.padStart(3, '0');
    return tipoComprobantePorCodigo(cod) ? cod : null;
  }

  /* "1 - Factura A" / "001 - FACTURAS A": el número manda. */
  const conNumero = bruto.match(/^\s*(\d{1,3})\s*[-–—:]\s*(.+)$/);
  if (conNumero) {
    const cod = conNumero[1].padStart(3, '0');
    if (tipoComprobantePorCodigo(cod)) return cod;
    return buscar(conNumero[2]);
  }

  return buscar(bruto);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ALICUOTAS, ALICUOTAS_HABITUALES, alicuotaPorCodigo, alicuotaPorTasa,
    CODIGOS_OPERACION, TIPOS_DOCUMENTO, MONEDAS, resolverTipoDocumento,
    TIPOS_COMPROBANTE, tipoComprobantePorCodigo,
    esNotaDeCredito, resolverTipoComprobante, normalizarTexto,
  };
}
