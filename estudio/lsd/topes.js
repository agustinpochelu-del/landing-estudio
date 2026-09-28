/**
 * El reservorio de topes: la base imponible máxima de cada período.
 *
 * No depende de la empresa, así que vive acá y no en la carpeta de cada
 * cliente. Es lo que hace falta para topear REM 1, REM 4 y REM 5.
 *
 * ── De dónde sale ─────────────────────────────────────────────────────────
 *
 * **De la resolución de ANSeS**, que lo fija todos los meses por la movilidad
 * del decreto 274/2024 y lo publica en el Boletín Oficial. Cada valor va con
 * su número de resolución para poder ir al documento.
 *
 * Antes se sacaba de dos maneras peores, y las dos se abandonaron el
 * 25/09/2026:
 *
 *   **libro**      el aporte del libro definitivo dividido la alícuota. Da
 *                  bien salvo por centavos, porque el aporte ya viene
 *                  redondeado. Sigue sirviendo como CONTROL CRUZADO.
 *   **despejado**  bisección sobre el total del Digesto. **Erraba feo.** Se
 *                  había validado contra marzo y abril, que daban al centavo,
 *                  pero contra las resoluciones falló en dos de cuatro:
 *                  febrero por $32.625,78 de más y mayo por $45.821,06 de
 *                  menos. No se usa más.
 *
 * ── Cómo se mantiene ──────────────────────────────────────────────────────
 *
 * La resolución del mes siguiente sale a fin de mes. Se carga acá con su
 * número y listo. Un período que no está en la tabla no se inventa: el
 * armador lo dice y pide que se cargue a mano.
 */

const TOPES = [
  { periodo: '202601', tope: 382337295, fuente: 'resolución', nota: 'Res. ANSeS 381/2025' },
  { periodo: '202602', tope: 393233908, fuente: 'resolución', nota: 'Res. ANSeS 21/2026' },
  { periodo: '202603', tope: 404559045, fuente: 'resolución', nota: 'Res. ANSeS 38/2026' },
  { periodo: '202604', tope: 416291257, fuente: 'resolución', nota: 'Res. ANSeS 74/2026' },
  { periodo: '202605', tope: 430361901, fuente: 'resolución', nota: 'Res. ANSeS 110/2026' },
  { periodo: '202606', tope: 441465238, fuente: 'resolución', nota: 'Res. ANSeS 139/2026' },
  { periodo: '202607', tope: 450956741, fuente: 'resolución', nota: 'Res. ANSeS 186/2026' },
  { periodo: '202608', tope: 459479823, fuente: 'resolución', nota: 'Res. ANSeS 232/2026, BO 30/07/2026' },
  { periodo: '202609', tope: 469174847, fuente: 'resolución', nota: 'Res. ANSeS 257/2026' },
];


const TOPES_POR_PERIODO = new Map(TOPES.map((t) => [t.periodo, t]));

/**
 * El tope de un período, o null si no está cargado.
 * Devuelve el registro entero para poder mostrar de dónde salió.
 */
function topeDelPeriodo(periodo) {
  return TOPES_POR_PERIODO.get(String(periodo || '').trim()) || null;
}

/** El último período cargado, para avisar hasta dónde llega la tabla. */
function ultimoPeriodoConTope() {
  const periodos = TOPES.map((t) => t.periodo).sort();
  return periodos.length ? periodos[periodos.length - 1] : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TOPES, topeDelPeriodo, ultimoPeriodoConTope };
}
