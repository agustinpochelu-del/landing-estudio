/**
 * Tablas de ARCA para el Libro de Sueldos Digital.
 *
 * Todo lo que hay acá sale del Anexo I de la guía de conceptos básicos
 * (`referencia/LSD-Conceptos-Basicos-y-Guia-de-Uso-V2.0.pdf`) y de la
 * planilla oficial de armado. Nada se inventa: si un código no está en el
 * anexo, no se escribe.
 *
 * Las tablas de SITUACIÓN, CONDICIÓN, ACTIVIDAD, MODALIDAD DE CONTRATACIÓN,
 * SINIESTRADO, LOCALIDAD, OBRA SOCIAL, CATEGORÍA y PUESTO **no están acá**:
 * ARCA las remite a la codificación de SICOSS / Declaración en Línea, que es
 * otro anexo. Por eso el armador valida su FORMATO (largo y que sean dígitos)
 * pero no su contenido. Cuando tengamos ese anexo, se suman acá y la
 * validación pasa a ser por contenido.
 */

/* ---------- Conceptos ARCA (Anexo I) ---------- */

/*
 * Los rangos "a ingresar por el contribuyente" son de uso libre, pero se
 * habilitan CORRELATIVOS: primero 111000, después 111001. No se puede
 * saltear, y es uno de los errores de importación más frecuentes.
 */

const CONCEPTOS_REMUNERATIVOS = [
  ['110000', 'Sueldo'],
  ['110001', 'Preaviso'],
  ['110002', 'Remuneraciones en especie'],
  ['110003', 'Comida'],
  ['110004', 'Habitación'],
  ['110005', 'Licencias por estudio'],
  ['110006', 'Donación de sangre'],
  ['110007', 'Feriado'],
  ['110008', 'Prest. dineraria Ley 24577 (primeros 10 días)'],
  ['110009', 'Prest. dineraria Ley 24577 (a cargo de ART)'],
  ['120000', 'Sueldo anual complementario'],
  ['120001', 'SAC 1er semestre'],
  ['120002', 'SAC 2do semestre'],
  ['120003', 'SAC proporcional'],
  ['130000', 'Horas extras'],
  ['130001', 'Horas extras al 50 %'],
  ['130002', 'Horas extras al 100 %'],
  ['130003', 'Horas extras al 200 %'],
  ['140000', 'Zona desfavorable'],
  ['150000', 'Adelanto vacacional'],
  ['160000', 'Adicionales'],
  ['160001', 'Adicional por antigüedad'],
  ['160002', 'Adicional por título'],
  ['160003', 'Adicional por tarea'],
  ['160004', 'Adicional por desarraigo'],
  ['170000', 'Gratificaciones y/o premios'],
  ['170001', 'Premio por presentismo'],
  ['170002', 'Premio por producción'],
  ['170003', 'Comisiones'],
  ['170004', 'Accesorios'],
  ['170005', 'Viáticos sin comprobante'],
  ['170006', 'Propinas habituales no prohibidas'],
  /* '499999' estaba acá como "Redondeo (remunerativo)" y NO existe en el
     catálogo oficial: lo habíamos deducido por simetría con el 799999.
     Sacado el 26/09/2026. El tope del rango remunerativo sí sigue siendo
     499999, que es otra cosa. */
  /* Sumados el 26/09/2026 desde el catálogo que exporta el servicio
     (`Conceptos_Afip_<CUIT>.txt`, módulo CONCEPTOS). */
  ['110010', 'Sueldo - Uso para aplicación RG 2252 - Actividades simultáneas'],
  ['110011', 'Incremento solidario - Dec. 14/2020'],
  ['120004', 'SAC - Uso para aplicación RG 2252 - Actividades simultáneas'],
  ['130004', 'Horas extras - Uso para aplicación RG 2252 - Actividades simultáneas'],
  ['140001', 'Zona desfavorable - Uso para aplicación RG 2252 - Actividades simultáneas'],
  ['150001', 'Adelanto vacacional - Uso para aplicación RG 2252 - Actividades simultáneas'],
  ['160005', 'Adicionales - Uso para aplicación RG 2252 - Actividades simultáneas'],
  ['170007', 'Gratificaciones y/o Premios - Uso para aplicación RG 2252 - Actividades simultáneas'],
  ['180000', 'Rectificativa por remuneración Ley 27.742'],
  ['181000', 'Rectificativa por remuneración Ley 27.802'],
];

const CONCEPTOS_NO_REMUNERATIVOS = [
  ['510000', 'Asignaciones familiares'],
  ['510001', 'Ayuda escolar'],
  ['510002', 'Asignación por hijo / hijo con discapacidad'],
  ['510003', 'Asignación por maternidad'],
  ['510004', 'Asignación por maternidad down'],
  ['510005', 'Asignación por matrimonio'],
  ['510006', 'Asignación por nacimiento / adopción'],
  ['510007', 'Asignación por prenatal'],
  ['520000', 'Beneficios sociales'],
  ['520001', 'Servicio de comedor'],
  ['520002', 'Gastos médicos'],
  ['520003', 'Provisión de ropa de trabajo'],
  ['520004', 'Guardería'],
  ['520005', 'Provisión de útiles escolares'],
  ['520006', 'Gastos de sepelio'],
  ['520007', 'Cursos de capacitación'],
  ['520008', 'Becas (art. 7 Ley 24.241)'],
  ['520009', 'Desempleo (art. 7 Ley 24.241)'],
  ['520010', 'Gratificación por cese laboral (art. 7 Ley 24.241)'],
  ['520011', 'Indemnización por extinción del contrato (art. 7 Ley 24.241)'],
  ['520012', 'Vacaciones no gozadas (art. 7 Ley 24.241)'],
  ['520013', 'Incapacidad permanente (art. 7 Ley 24.241)'],
  ['520014', 'Indemnización por despido'],
  ['520015', 'Indemnización sustitutiva del preaviso'],
  ['520016', 'Integración mes de despido'],
  ['520017', 'SAC sobre integración o preaviso'],
  ['520018', 'SAC sobre vacaciones no gozadas'],
  ['530000', 'Incrementos no remunerativos (con aportes OS)'],
  ['540000', 'Incrementos no remunerativos (con aportes y contribuciones OS)'],
  ['550000', 'Importes no remunerativos especiales'],
  /*
   * El 560006 NO está en el Anexo I de la guía V2.0: apareció en la
   * parametrización real de Nautical exportada del servicio en septiembre de
   * 2026. Prueba de que ARCA sumó conceptos después de 2018 sin actualizar el
   * PDF. Por eso un código desconocido pero dentro de un rango válido es un
   * aviso y no un error: lo más probable es que sea nuestro catálogo el que
   * está viejo, no el archivo el que está mal.
   */
  ['560006', 'Asignación No Remunerativa Dec. 438/2023'],
  ['799999', 'Redondeo (no remunerativo)'],
  /* Sumados el 26/09/2026 desde el catálogo que exporta el servicio
     (`Conceptos_Afip_<CUIT>.txt`, módulo CONCEPTOS). */
  ['560000', 'Mensual - PPC y CCT Especiales'],
  ['560001', 'SAC - PPC y CCT Especiales'],
  ['560002', 'SAC  Proporcional- PPC y CCT Especiales'],
  ['560003', 'Vacaciones - PPC y CCT Especiales'],
  ['560004', 'Asign. dineraria progr. sociales, educativos o empleo - Dec. 551/2022'],
  ['560005', 'Asign. No remunerativa Dec 841/2022'],
  ['570000', 'Mensual - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'],
  ['570001', 'SAC - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'],
  ['570002', 'SAC Proporcional - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'],
  ['570003', 'Vacaciones - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'],
];

const CONCEPTOS_DESCUENTOS = [
  ['810000', 'Sistema previsional'],
  ['810001', 'INSSJyP'],
  ['810002', 'Obra social'],
  ['810003', 'Fondo Solidario de Redistribución (ex ANSSAL)'],
  ['810004', 'Cuota sindical'],
  ['810005', 'Seguro de vida'],
  ['810006', 'RENATEA (ex RENATRE)'],
  ['810007', 'Préstamos'],
  ['810008', 'Impuesto a las Ganancias'],
  ['810009', 'Obra social – adherentes'],
  ['810010', 'Fondo Solidario de Redistribución (ex ANSSAL) – adherentes'],
  ['820000', 'Otros descuentos'],
  /* Sumados el 26/09/2026 desde el catálogo que exporta el servicio
     (`Conceptos_Afip_<CUIT>.txt`, módulo CONCEPTOS). */
  ['810011', 'Ajuste Aporte Dec. 561/2019'],
  ['810012', 'Salario complementario. Dec 332/2020'],
  ['810013', 'SAC – ajuste base imponible'],
  ['810014', 'Pago a cuenta Asign. dineraria progr. sociales, educativos o empleo - Dec. 551/2022'],
  ['810015', 'Sistema previsional no nacional'],
  ['810016', 'Obra Social provincial'],
];

/* Rangos de uso libre: [desde, hasta, a qué grupo pertenecen]. */
const RANGOS_LIBRES = [
  ['111000', '119999', 'Sueldo'],
  ['121000', '129999', 'SAC'],
  ['131000', '139999', 'Horas extras'],
  ['141000', '149999', 'Zona desfavorable'],
  ['151000', '159999', 'Adelanto vacacional'],
  ['161000', '169999', 'Adicionales'],
  ['171000', '179999', 'Gratificaciones y/o premios'],
  ['511000', '519999', 'Asignaciones familiares'],
  ['521000', '529999', 'Beneficios sociales'],
  ['531000', '539999', 'Incrementos NR (con aportes OS)'],
  ['541000', '549999', 'Incrementos NR (con aportes y contribuciones OS)'],
  ['551000', '559999', 'Importes no remunerativos especiales'],
  ['821000', '829999', 'Otros descuentos'],
];

/* ---------- Clasificación por rango ---------- */

const RANGO_REMUNERATIVO = ['110000', '499999'];
const RANGO_NO_REMUNERATIVO = ['510000', '799999'];
const RANGO_DESCUENTO = ['810000', '829999'];

/** Devuelve 'REMUNERATIVO', 'NO REMUNERATIVO', 'DESCUENTO' o null. */
function tipoDeConcepto(codigo) {
  const c = String(codigo || '').trim();
  if (!/^\d{6}$/.test(c)) return null;
  if (c >= RANGO_REMUNERATIVO[0] && c <= RANGO_REMUNERATIVO[1]) return 'REMUNERATIVO';
  if (c >= RANGO_NO_REMUNERATIVO[0] && c <= RANGO_NO_REMUNERATIVO[1]) return 'NO REMUNERATIVO';
  if (c >= RANGO_DESCUENTO[0] && c <= RANGO_DESCUENTO[1]) return 'DESCUENTO';
  return null;
}

const CATALOGO = new Map(
  [].concat(CONCEPTOS_REMUNERATIVOS, CONCEPTOS_NO_REMUNERATIVOS, CONCEPTOS_DESCUENTOS)
);

/** Nombre del concepto ARCA, o null si el código no está en el anexo. */
function nombreDeConcepto(codigo) {
  const c = String(codigo || '').trim();
  if (CATALOGO.has(c)) return CATALOGO.get(c);
  for (const [desde, hasta, grupo] of RANGOS_LIBRES) {
    if (c >= desde && c <= hasta) return `Uso libre del contribuyente (${grupo})`;
  }
  return null;
}

/**
 * ¿El código cae dentro de alguno de los tres rangos, aunque no lo tengamos
 * en el catálogo?
 *
 * El Anexo I que tenemos es de 2018 y quedó corto: la parametrización real de
 * un cliente trae el 560006, que ese anexo no menciona. Entonces un código
 * desconocido pero dentro de rango no se trata como error —lo más probable es
 * que nuestro catálogo esté viejo—, sino como algo para mirar.
 */
function estaEnRangoValido(codigo) {
  return tipoDeConcepto(codigo) !== null;
}

/* ---------- Conceptos con tratamiento especial ---------- */

/*
 * SAC. Todo el rango 120000–129999 lleva SIEMPRE el tope de SAC completo
 * (base 180 días) y solo puede informarse en junio y diciembre. La excepción
 * es el SAC PROPORCIONAL, que lleva tope propio calculado con los días que
 * viajan en el campo "cantidad" del registro 03.
 *
 * OJO con el código del SAC proporcional: la guía V2.0 lo nombra como 120003
 * en el cuerpo y en el Anexo I, pero los ejemplos de cálculo y el diseño del
 * registro 03 de esa misma guía dicen 123000. Los dos figuran como el SAC
 * proporcional en el mismo documento de ARCA. El armador acepta los dos y lo
 * avisa en pantalla, porque poner el que no es cambia el tope y la
 * liquidación rebota. Confirmar contra el servicio antes de cerrar el criterio.
 */
const SAC_PROPORCIONAL = ['120003', '123000'];
const SAC_RANGO = ['120000', '129999'];
const ADELANTO_VACACIONAL = '150000';
const HORAS_EXTRAS = ['130000', '130001', '130002', '130003'];

/** ¿Es un concepto de SAC proporcional, con tope propio por días? */
function esSacProporcional(codigo) {
  return SAC_PROPORCIONAL.includes(String(codigo || '').trim());
}

/** ¿Es un concepto de SAC, de los que solo van en junio y diciembre? */
function esSac(codigo) {
  const c = String(codigo || '').trim();
  return c >= SAC_RANGO[0] && c <= SAC_RANGO[1];
}

/** Conceptos que exigen informar la cantidad en el registro 03. */
function exigeCantidad(codigo) {
  const c = String(codigo || '').trim();
  return esSacProporcional(c) || c === ADELANTO_VACACIONAL || HORAS_EXTRAS.includes(c);
}

/* ---------- Los descuentos que ARCA recalcula ---------- */

/*
 * ARCA cruza estos cuatro descuentos contra las bases imponibles y verifica
 * el cálculo. Si un aporte se parametrizó como "otros descuentos" (820000),
 * el control no lo encuentra y el F931 sale mal.
 */
const APORTES_CONTROLADOS = {
  '810000': { nombre: 'Sistema previsional', base: 'rem1' },
  '810001': { nombre: 'INSSJyP', base: 'rem5' },
  '810002': { nombre: 'Obra social', base: 'rem4' },
  '810003': { nombre: 'Fondo Solidario de Redistribución', base: 'rem4' },
};

/*
 * Las modalidades de contratación del Régimen de Promoción del Empleo
 * Registrado (PER) de la **Ley 27.802 de Modernización Laboral**, art. 168,
 * Título XXII. Publicada el 06/03/2026.
 *
 * Sirven para regularizar una relación no registrada, o registrada con fecha
 * de inicio posterior a la real. Declarado un trabajador con una de estas
 * modalidades, **ARCA condona parte de sus aportes y contribuciones** y abre
 * el F931 en dos: "sin Ley 27.802" y "Ley 27.802", con códigos de ICS
 * distintos. Lo del régimen se paga aparte, por VEP o Mis Facilidades.
 *
 * Condiciones de la RG 5862/2026: inicio de la relación laboral **hasta el
 * 05/03/2026** y registración **hasta el 28/11/2026**.
 *
 * Fuente: `referencia/Ley-27802-PER-Modalidades-de-contrato.pdf` y
 * `referencia/G58-LSD-Ley-27802-PER-Ajuste-por-remuneracion.pdf`.
 */
const MODALIDADES_PER = {
  '704': { quien: 'Micro y pequeñas empresas, entidades sin fines de lucro', condonacion: 90 },
  '705': { quien: 'Medianas empresas tramo 1 y 2', condonacion: 80 },
  '706': { quien: 'Demás empleadores', condonacion: 70 },
};

/*
 * El otro camino del PER: en vez de cambiar la modalidad, se informa la
 * diferencia de remuneración con un concepto propio asociado a este concepto
 * de ARCA. Es remunerativo y suma a las bases **solo la proporción no
 * condonada**. El 180000 es el equivalente de la ley 27.742, anterior.
 */
const RECTIFICATIVAS_PER = ['180000', '181000'];

/* ---------- Tablas auxiliares del registro 04 ---------- */

const TIPOS_EMPRESA = {
  '0': 'Administración pública',
  '1': 'Decreto 814/01, art. 2 inc. B',
  '2': 'Servicios eventuales, art. 2 inc. B',
  '4': 'Decreto 814/01, art. 2 inc. A',
  '5': 'Servicios eventuales, art. 2 inc. A',
  '7': 'Enseñanza privada',
  '8': 'Decreto 1212/03 – AFA clubes',
};

/* La forma de pago 4 no está en la guía de 2018: la suma la planilla oficial. */
const FORMAS_DE_PAGO = {
  '1': 'Efectivo',
  '2': 'Cheque',
  '3': 'Acreditación',
  '4': 'Pago externo',
};

const UNIDADES = {
  $: 'Moneda',
  '%': 'Porcentaje',
  A: 'Año',
  Q: 'Quincena',
  M: 'Mes',
  D: 'Días',
  H: 'Horas',
};

const TIPOS_LIQUIDACION = {
  M: 'Mensual',
  Q: 'Quincenal',
  D: 'Por días',
  H: 'Por horas',
};

const IDENTIFICACION_ENVIO = {
  SJ: 'Informa la liquidación de sueldos y jornales y los datos de la DJ F931',
  RE: 'Informa solo datos de la DJ F931 (rectificativa)',
};

/* ---------- Perfiles que no generan libro de sueldos ---------- */

/*
 * Hay que informarlos igual para que aparezcan en la declaración jurada, pero
 * el servicio no les emite libro, ni borrador ni definitivo. Sirve para no
 * salir a buscar un libro que nunca se iba a generar.
 */
const MODALIDADES_SIN_LIBRO = {
  '002': 'Becarios – residencias médicas Ley 22127',
  '010': 'Práctica profesionalizante Dcto. 1374/11 – pasantías sin obra social',
  '027': 'Pasantías Ley 26427 – con obra social',
};

const SITUACIONES_SIN_LIBRO = {
  '16': 'Personal siniestrado de terceros, uso por la ART',
};

/* ---------- Las bases imponibles ---------- */

/*
 * El orden importa: es el que tienen en el registro 04 y el que se muestra
 * en pantalla. `tope` indica si la base está alcanzada por el tope mensual.
 */
const BASES_IMPONIBLES = [
  { clave: 'rem1', nombre: 'REM 1', destino: 'Aportes previsionales', tope: true },
  { clave: 'rem2', nombre: 'REM 2', destino: 'Contribuciones previsionales e INSSJyP', tope: false },
  { clave: 'rem3', nombre: 'REM 3', destino: 'Contribuciones FNE, asignaciones familiares y RENATRE', tope: false },
  { clave: 'rem4', nombre: 'REM 4', destino: 'Aportes obra social y FSR', tope: true },
  { clave: 'rem5', nombre: 'REM 5', destino: 'Aportes INSSJyP', tope: true },
  { clave: 'rem6', nombre: 'REM 6', destino: 'Aportes diferenciales', tope: false },
  { clave: 'rem7', nombre: 'REM 7', destino: 'Aportes regímenes especiales', tope: false },
  { clave: 'rem8', nombre: 'REM 8', destino: 'Contribuciones obra social y FSR', tope: false },
  { clave: 'rem9', nombre: 'REM 9', destino: 'Contribuciones Ley de Riesgos del Trabajo', tope: false },
  /* REM 10 no es una base de aportes ni de contribuciones: es la base sobre
     la que se calcula el crédito fiscal por cargas sociales. De ahí se
     detrae el importe de la ley 27.430. */
  { clave: 'rem10', nombre: 'REM 10', destino: 'Base del crédito fiscal por cargas sociales', tope: false },
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONCEPTOS_REMUNERATIVOS,
    CONCEPTOS_NO_REMUNERATIVOS,
    CONCEPTOS_DESCUENTOS,
    RANGOS_LIBRES,
    CATALOGO,
    tipoDeConcepto,
    nombreDeConcepto,
    estaEnRangoValido,
    esSac,
    esSacProporcional,
    exigeCantidad,
    SAC_PROPORCIONAL,
    ADELANTO_VACACIONAL,
    HORAS_EXTRAS,
    APORTES_CONTROLADOS,
    MODALIDADES_PER,
    RECTIFICATIVAS_PER,
    TIPOS_EMPRESA,
    FORMAS_DE_PAGO,
    UNIDADES,
    TIPOS_LIQUIDACION,
    IDENTIFICACION_ENVIO,
    MODALIDADES_SIN_LIBRO,
    SITUACIONES_SIN_LIBRO,
    BASES_IMPONIBLES,
  };
}
