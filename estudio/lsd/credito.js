/**
 * El crédito fiscal por cargas sociales (Decreto 814/2001).
 *
 * Sobre la REM 10 de cada trabajador se computa un porcentaje que depende de
 * **dónde trabaja**, y ese importe se toma como crédito fiscal de IVA.
 *
 * Tres cosas que este archivo da por sentadas, y conviene que se lean antes de
 * tocarlo:
 *
 * **La provincia no se deduce.** En Nautical, la «Dependencia de revista» del
 * reservorio dice Puerto Madryn para cinco personas que trabajan en Río Negro.
 * Deducirla de ahí les aplicaría 6,65 % en vez de 3,86 %: casi el doble de
 * crédito, con un número plausible.
 *
 * Sale de dos lugares, y de ninguno más: la columna `Provincia` del reservorio
 * de empleados, que es el dato del trabajador y **manda**, o la provincia de la
 * empresa en `reservorios/indice.json`, para los empleadores cuya gente trabaja
 * toda en el mismo lugar. Cuál de los dos se usó viaja en la fila y se ve en la
 * pantalla: es un dato declarado, no adivinado, pero no son igual de firmes.
 *
 * **Las alícuotas que están acá son las dos que confirmó el estudio.** El anexo
 * del decreto tiene una tabla entera por zona, y no está en `referencia/`. Una
 * provincia que no figure acá **no se calcula**: se lista aparte pidiendo el
 * dato. Inventar un porcentaje es inventar plata.
 *
 * **La REM 10 ya viene calculada** por `calcularBases` en `sueldos.js`, que la
 * define como REM 2 menos la detracción de la ley 27.430. Acá no se recalcula
 * nada de eso: se toma la base y se le aplica el porcentaje.
 */

/* Alícuotas por provincia, en por ciento sobre la REM 10. Confirmadas por
   Agustín el 27/09/2026. Son fijas: no cambian con el período. */
const ALICUOTAS_CREDITO = new Map([
  ['chubut', 6.65],
  ['rio negro', 3.86],
]);

/** El nombre de la provincia sin acentos ni mayúsculas, para poder compararlo. */
function normalizarProvincia(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/**
 * La provincia de un trabajador y de dónde salió.
 *
 * `provinciaDe` puede devolver el nombre pelado —que es lo que hacía cuando la
 * provincia salía siempre del reservorio de empleados— o `{ provincia, origen }`
 * cuando hay más de un lugar de donde puede venir. El origen viaja hasta la
 * pantalla: una provincia puesta por defecto para toda la empresa y una cargada
 * empleado por empleado valen lo mismo para la cuenta, pero no valen lo mismo
 * para quien tenga que revisarla.
 */
function provinciaDelTrabajador(provinciaDe, cuil) {
  const crudo = provinciaDe ? provinciaDe(cuil) : '';
  if (crudo && typeof crudo === 'object') {
    return { provincia: String(crudo.provincia || ''), origen: String(crudo.origen || '') };
  }
  return { provincia: String(crudo || ''), origen: '' };
}

/** La alícuota de esa provincia, o null si no la tenemos. */
function alicuotaDe(provincia) {
  const clave = normalizarProvincia(provincia);
  return clave && ALICUOTAS_CREDITO.has(clave) ? ALICUOTAS_CREDITO.get(clave) : null;
}

/**
 * El crédito de una liquidación, trabajador por trabajador.
 *
 * `trabajadores` son los de la liquidación ya armada, con `calculo.bases.rem10`
 * en centavos enteros. `provinciaDe` recibe un CUIL y devuelve la provincia que
 * trae el reservorio de empleados.
 *
 * Devuelve las filas que se pudieron calcular, el total, y **por separado** las
 * que no: sin provincia cargada, o con una provincia sin alícuota conocida. Las
 * que no se pudieron calcular no suman cero al total: no están.
 */
function calcularCredito(trabajadores, provinciaDe) {
  const filas = [];
  const faltantes = [];
  let total = 0;

  for (const t of trabajadores || []) {
    const rem10 = (t.calculo && t.calculo.bases && t.calculo.bases.rem10) || 0;
    const { provincia, origen } = provinciaDelTrabajador(provinciaDe, t.cuil);
    const alicuota = alicuotaDe(provincia);

    if (!provincia) {
      faltantes.push({ cuil: t.cuil, nombre: t.apellidoNombre || '', rem10,
        motivo: 'sin provincia: no la trae el reservorio de empleados ni el de la empresa' });
      continue;
    }
    if (alicuota === null) {
      faltantes.push({ cuil: t.cuil, nombre: t.apellidoNombre || '', rem10, provincia,
        motivo: `no tenemos la alícuota de ${provincia}` });
      continue;
    }

    /* Centavos enteros y un solo redondeo, al final. */
    const credito = Math.round((rem10 * alicuota) / 100);
    total += credito;
    filas.push({
      cuil: t.cuil,
      nombre: t.apellidoNombre || '',
      provincia,
      origen,
      rem10,
      alicuota,
      credito,
    });
  }

  filas.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return { filas, faltantes, total };
}

/* ---------- El registro: qué se tomó, por empleador y por período ---------- */

const CLAVE_REGISTRO = 'lsd.creditoFiscal.v1';

function leerRegistro() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_REGISTRO) || '{}') || {};
  } catch (error) {
    return {};
  }
}

function escribirRegistro(datos) {
  try {
    localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(datos));
    return true;
  } catch (error) {
    return false;          // navegador sin almacenamiento: la pantalla lo dice
  }
}

/**
 * Guarda lo tomado en un período. Vuelve a escribir el mismo período si ya
 * estaba: el último armado manda, porque es el que refleja la liquidación final.
 */
function guardarCredito(cuit, periodo, empleador, resultado) {
  const datos = leerRegistro();
  const ce = String(cuit || '').replace(/\D/g, '');
  const pe = String(periodo || '').replace(/\D/g, '');
  if (!ce || pe.length !== 6) return false;

  datos[ce] = datos[ce] || { empleador: empleador || ce, periodos: {} };
  datos[ce].empleador = empleador || datos[ce].empleador;
  datos[ce].periodos[pe] = {
    calculadoEl: new Date().toISOString(),
    total: resultado.total,
    trabajadores: resultado.filas.length,
    sinCalcular: resultado.faltantes.length,
    filas: resultado.filas,
    faltantes: resultado.faltantes,
  };
  return escribirRegistro(datos);
}

/** Lo guardado de un empleador, del período más nuevo al más viejo. */
function historialDe(cuit) {
  const ce = String(cuit || '').replace(/\D/g, '');
  const empresa = leerRegistro()[ce];
  if (!empresa) return { empleador: '', periodos: [] };
  const periodos = Object.entries(empresa.periodos || {})
    .map(([periodo, d]) => ({ periodo, ...d }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo));
  return { empleador: empresa.empleador || ce, periodos };
}

/** Los empleadores que tienen algo guardado. */
function empleadoresConRegistro() {
  const datos = leerRegistro();
  return Object.entries(datos)
    .map(([cuit, d]) => ({
      cuit,
      empleador: d.empleador || cuit,
      periodos: Object.keys(d.periodos || {}).length,
    }))
    .sort((a, b) => String(a.empleador).localeCompare(String(b.empleador), 'es'));
}

function borrarPeriodo(cuit, periodo) {
  const datos = leerRegistro();
  const ce = String(cuit || '').replace(/\D/g, '');
  if (!datos[ce] || !datos[ce].periodos) return false;
  delete datos[ce].periodos[String(periodo)];
  if (!Object.keys(datos[ce].periodos).length) delete datos[ce];
  return escribirRegistro(datos);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ALICUOTAS_CREDITO,
    normalizarProvincia,
    alicuotaDe,
    calcularCredito,
    guardarCredito,
    historialDe,
    empleadoresConRegistro,
    borrarPeriodo,
    CLAVE_REGISTRO,
  };
}
