/**
 * Perfiles de origen.
 *
 * Cada sistema exporta los comprobantes con sus propios encabezados y su
 * propio vocabulario para los tipos de comprobante. Un perfil declara esas
 * particularidades en un solo lugar, para que sumar un origen nuevo no
 * obligue a tocar el núcleo.
 *
 * Un perfil no reemplaza a la detección general: la complementa. Los
 * sinónimos de `libro.js` se prueban igual; los del perfil se suman.
 *
 * ── Para sumar un origen nuevo ────────────────────────────────────────────
 *
 * 1. Conseguí una exportación REAL de ese sistema. No inventes nombres de
 *    columna ni códigos de comprobante: si el archivo no está a la vista,
 *    el perfil no se escribe.
 * 2. Agregá un objeto a PERFILES con:
 *      id            identificador corto, en minúsculas y con guiones
 *      nombre        cómo se muestra en pantalla
 *      descripcion   una línea sobre de dónde sale el archivo
 *      senales       encabezados que delatan a ese origen (normalizados).
 *                    Cuantos más propios, mejor: son los que lo distinguen.
 *      sinonimos     { campo: ['encabezado', ...] } que se suman a los
 *                    generales. Van en MINÚSCULA y sin puntuación: se comparan
 *                    con normalizarEncabezado(), que baja todo a minúscula.
 *      aliasComprobante  { 'TEXTO': '001', ... } vocabulario propio de tipos.
 *                    Acá las claves van en MAYÚSCULA, porque se comparan con
 *                    normalizarTexto(): "N/C" queda como "N C". Si el sistema
 *                    guarda la clase por un lado ("FAC") y la letra pegada al
 *                    número, el núcleo reintenta con las dos juntas: "FAC A".
 *      aliasDocumento    { 'TEXTO': '80', ... }
 *      notas         lo que haya que saber al leer archivos de ese origen
 * 3. Sumá una prueba en `pruebas.js` con los encabezados reales: que el
 *    perfil se detecte y que las columnas se mapeen donde corresponde.
 *
 * Si el archivo además viene en otro FORMATO (ancho fijo, XML, JSON), eso no
 * se resuelve acá sino en `xlsx.js`, que es quien convierte un archivo en
 * filas. Ver la nota "Para sumar un formato nuevo" de ese archivo.
 */

const PERFILES = [
  {
    id: 'mis-comprobantes',
    nombre: 'Mis Comprobantes (ARCA)',
    descripcion: 'Exportación del servicio Mis Comprobantes del portal de ARCA.',
    senales: [
      'denominacion emisor',
      'denominacion receptor',
      'tipo doc emisor',
      'tipo doc receptor',
      'imp total',
      'neto gravado',
    ],
    sinonimos: {
      /* En compras la contraparte es el emisor; en ventas, el receptor. */
      denominacion: ['denominacion emisor', 'denominacion receptor'],
      documentoNro: ['nro doc emisor', 'nro doc receptor'],
      documentoTipo: ['tipo doc emisor', 'tipo doc receptor'],
      total: ['imp total'],
      noGravado: ['imp neto no gravado'],
      exento: ['imp op exentas'],
      otrosTributos: ['otros tributos'],
      percIva: ['iva perc'],
      moneda: ['moneda'],
      tipoCambio: ['tipo cambio'],
    },
    aliasComprobante: {},
    aliasDocumento: {},
    notas:
      'Trae el tipo como "1 - Factura A" y el documento escrito ("CUIT"). ' +
      'La hoja con el detalle por alícuota es la que conviene usar.',
  },

  {
    id: 'nautical',
    nombre: 'Nautical',
    descripcion: 'Exportación de compras del sistema Nautical.',
    senales: [
      'fecha emi',
      'cod prove',
      'nom prove',
      'identiftri',
      't comp',
      'n comp',
      'imp neto',
      'otrosimp',
    ],
    sinonimos: {
      fecha: ['fecha emi'],
      denominacion: ['nom prove'],
      documentoNro: ['identiftri'],
      tipo: ['t comp'],
      /* Letra, punto de venta y número, todo pegado: "A0255200092533". */
      comprobanteNro: ['n comp'],
      neto: ['imp neto'],
      iva: ['imp iva'],
      total: ['imp total'],
      exento: ['imp exento'],
      otrosTributos: ['otrosimp'],
      percIva: ['perc iva'],
    },
    /* El sistema guarda la clase del comprobante ("FAC", "N/C") separada de la
       letra, que viaja pegada al número, y recién juntas dicen de qué
       comprobante se trata. Están solo los que aparecen en la exportación
       real: si alguna vez sale una nota de débito, el importador la va a
       marcar como no reconocida y hay que sumar acá el código de la tabla. */
    aliasComprobante: {
      'FAC A': '001', 'FAC B': '006', 'FAC C': '011',
      'N C A': '003', 'N C B': '008', 'N C C': '013',
    },
    aliasDocumento: {},
    notas:
      'Abre el IVA por alícuota (IVA_21, IVA_10.5, IVA_27) pero no el neto, ' +
      'así que el neto de cada una se calcula y se ajusta al neto declarado. ' +
      'Las notas de crédito vienen en negativo. COD_PROVE, COND_IVA, ' +
      'PORC_IVA y DIF_CTRL no se usan: son datos internos del sistema.',
  },

  {
    id: 'generico',
    nombre: 'Planilla genérica',
    descripcion: 'Cualquier planilla con una fila de encabezados reconocibles.',
    senales: [],
    sinonimos: {},
    aliasComprobante: {},
    aliasDocumento: {},
    notas:
      'Es el que se usa cuando ningún otro perfil reconoce el archivo. ' +
      'Se apoya solo en los sinónimos generales de libro.js.',
  },
];

const PERFIL_POR_DEFECTO = 'generico';

function perfilPorId(id) {
  return PERFILES.find((p) => p.id === id) || PERFILES.find((p) => p.id === PERFIL_POR_DEFECTO);
}

/**
 * Elige el perfil que mejor explica los encabezados de la planilla.
 * Devuelve { perfil, puntaje, senalesEncontradas }.
 *
 * El puntaje es cuántas señales del perfil aparecen. Empate o cero señales
 * cae en el perfil genérico, que nunca estorba porque no aporta sinónimos.
 */
function detectarPerfil(encabezados, normalizar) {
  const vistos = new Set(encabezados.map(normalizar).filter(Boolean));

  let mejor = null;
  for (const perfil of PERFILES) {
    if (!perfil.senales.length) continue;
    const encontradas = perfil.senales.filter((s) => vistos.has(s));
    if (!encontradas.length) continue;
    if (!mejor || encontradas.length > mejor.puntaje) {
      mejor = { perfil, puntaje: encontradas.length, senalesEncontradas: encontradas };
    }
  }

  return mejor || { perfil: perfilPorId(PERFIL_POR_DEFECTO), puntaje: 0, senalesEncontradas: [] };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PERFILES, PERFIL_POR_DEFECTO, perfilPorId, detectarPerfil };
}
