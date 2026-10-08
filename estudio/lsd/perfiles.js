/**
 * Perfiles de origen.
 *
 * Cada sistema de sueldos exporta la liquidación con sus propios
 * encabezados. Un perfil declara esas particularidades en un solo lugar,
 * para que sumar un origen nuevo no obligue a tocar el núcleo.
 *
 * Un perfil no reemplaza a la detección general: la complementa. Los
 * sinónimos de `sueldos.js` se prueban igual; los del perfil se suman y
 * tienen prioridad.
 *
 * Todos los perfiles de acá salen de exportaciones REALES. La regla 1 del
 * proyecto es no inventar nombres de columna: un perfil inventado produce
 * archivos que ARCA rechaza y nadie sabe por qué.
 *
 * ── Para sumar un origen nuevo ────────────────────────────────────────────
 *
 * 1. Conseguí una exportación REAL de ese sistema, de un período real.
 *    Si el archivo no está a la vista, el perfil no se escribe.
 * 2. Agregá un objeto a PERFILES con:
 *      id            identificador corto, en minúsculas y con guiones
 *      nombre        cómo se muestra en pantalla
 *      descripcion   una línea sobre de dónde sale el archivo
 *      senales       encabezados que delatan a ese origen, normalizados
 *                    con normalizarEncabezado(). Cuantos más propios, mejor.
 *      sinonimos     { campo: ['encabezado', ...] } que se suman a los
 *                    generales. En MINÚSCULA y sin puntuación.
 *      notas         lo que haya que saber al leer archivos de ese origen:
 *                    si las bases vienen o no, si los descuentos vienen en
 *                    negativo, si el SAC viene abierto.
 * 3. Sumá una prueba en `pruebas.js` con los encabezados reales.
 *
 * Si además viene en otro FORMATO (ancho fijo, XML), eso no se resuelve acá
 * sino en `xlsx.js`, que es quien convierte un archivo en filas.
 */

const PERFILES = [
  {
    id: 'generico',
    nombre: 'Planilla genérica',
    descripcion: 'Cualquier planilla con una fila de encabezados reconocibles.',
    senales: [],
    sinonimos: {},
    notas:
      'Es el que se usa cuando ningún otro perfil reconoce el archivo. ' +
      'Se apoya solo en los sinónimos generales de sueldos.js. ' +
      'Espera una fila por concepto liquidado, con el CUIL repetido.',
  },

  {
    id: 'conceptos-y-totales',
    nombre: 'Sistema de sueldos — Conceptos y totales',
    descripcion:
      'La hoja "Conceptos y totales" del sistema de sueldos que usan Nautical, ' +
      'Martín Prado y Viviana Barbano. Una fila por concepto liquidado.',
    /*
     * Encabezados verificados contra "Sueldos Nau 08-2026.xlsx" y
     * "Sueldos_08-2026 Martin (1).xlsm". El mismo sistema exporta plantillas
     * distintas según la empresa: la de Nautical trae cuarenta columnas y la
     * de Prado nueve. Las señales que siguen están en las dos.
     *
     * Hubo un perfil aparte para la variante de Prado y fue un error: sus
     * columnas "propias" —Apellido materno, Columna1, Columna2— también están
     * en la de Nautical, así que le ganaba en su propio archivo.
     */
    senales: [
      'c u i l',
      'numero de concepto',
      'descripcion de concepto',
      'cantidad liquidada',
      'importe liquidado',
      /* Estas dos solo están en la plantilla larga, la de Nautical. */
      'tipo de concepto',
      'descripcion del pago',
    ],
    sinonimos: {
      /* "C.U.I.L." queda como "c u i l" al normalizar: los puntos se comen. */
      cuil: ['c u i l'],
      codigoConcepto: ['numero de concepto'],
      /* Sin esto, "Descripción de convenio" gana por ser la primera columna
         que empieza con "descripcion". */
      descripcionConcepto: ['descripcion de concepto'],
      cantidad: ['cantidad liquidada'],
      importe: ['importe liquidado'],
      legajo: ['numero de legajo'],
      /* 'apellido' primero: la planilla de Nautical trae las dos columnas y la
         que corresponde es "Apellido". La de Martín Prado solo trae "nombre". */
      apellidoNombre: ['apellido', 'nombre'],
      /* Y la columna «Nombre», que queda para el nombre de pila. En la
         planilla de Martín Prado no hay «Apellido», así que la gana
         `apellidoNombre` y esta no engancha nada: una columna va a un solo
         campo. */
      nombreDePila: ['nombre'],
      /* No hay fecha de pago: la del recibo es la de liquidación. */
      fechaPago: ['fecha de liquidacion'],
      tipoOrigen: ['tipo de concepto'],
      /*
       * El débito/crédito viene resuelto en una columna que Excel bautizó
       * solo. Es un nombre pobre y es el que tiene el archivo, en los dos
       * clientes. Se prefiere a deducirlo del tipo de concepto porque la
       * planilla de Martín Prado no trae tipo, y sin esto sus descuentos
       * —que vienen en POSITIVO— saldrían como haberes.
       */
      debitoCredito: ['columna1'],
    },
    /*
     * Columnas que existen con ese nombre pero no quieren decir lo que quiere
     * decir LSD. Dejarlas enganchar es peor que ignorarlas.
     */
    ignorar: [
      'condicion',   /* dice "Mensualizado", no el código de condición */
      'formaPago',   /* dice "Depósito bancario", no 1 a 4 */
      'obraSocial',  /* dice "OSPM" o "SANSAL", no siempre el código RNOS */
      'modalidad',   /* "Código de tipo de contrato" es la tabla del sistema */
    ],
    /*
     * El sistema clasifica cada concepto por el lado del recibo en que cae.
     * Verificado contra el PDF de agosto 2026 columna por columna:
     *   1 Haber · 2 Retención · 4 Asignación no remunerativa
     *   5 Retención de Ganancias · 6 Devolución de Ganancias · 7 Redondeo
     * El signo del importe invierte siempre: una devolución de préstamo viene
     * como tipo 4 en negativo y es un débito.
     */
    debitoCreditoPorTipo: { 1: 'C', 2: 'D', 4: 'C', 5: 'D', 6: 'C', 7: 'C' },
    /* El export no trae unidad. Los archivos que ARCA viene aceptando llevan
       '$' en todos los renglones, incluso en los que informan cantidad. */
    unidadPorDefecto: '$',
    /*
     * El tipo 8 son las contribuciones patronales (611 a 618). Aparecen en el
     * resumen del sistema pero NO van al libro: el registro 03 lleva lo que
     * está en el recibo, y ARCA calcula las contribuciones desde las bases.
     * Además nunca están parametrizadas, así que si se cuelan el servicio las
     * rechaza una por una. En agosto de 2026 eran 149 de las 339 filas.
     */
    descartarPorTipo: {
      8: 'contribuciones patronales, que ARCA calcula desde las bases y no van en el libro',
    },
    notas:
      'Trae las contribuciones patronales mezcladas con el recibo y hay que ' +
      'sacarlas. No trae bases imponibles, ni los códigos de situación, ' +
      'condición, actividad y modalidad de ARCA: esos salen de la planilla de ' +
      'importación. Puede traer más de una liquidación del mismo período ' +
      '(una mensual y una de bajas): se juntan en un solo archivo, sumando los ' +
      'conceptos que se repiten para el mismo trabajador.',
  },

  {
    id: 'lsd-exportado',
    nombre: 'Liquidación exportada de LSD',
    descripcion:
      'La exportación en txt que ofrece el módulo CONSULTAS del propio servicio, ya convertida a planilla.',
    senales: ['base imponible 1', 'base imponible 4', 'base imponible 9', 'remuneracion bruta'],
    sinonimos: {},
    notas:
      'Sirve para releer una liquidación ya presentada, compararla contra la ' +
      'del mes siguiente o rearmar el archivo con una corrección. Trae las ' +
      'bases ya calculadas, así que el control las compara en vez de deducirlas.',
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
 * El puntaje es cuántas señales del perfil aparecen. Sin señales, cae en el
 * genérico, que nunca estorba porque no aporta sinónimos propios.
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
