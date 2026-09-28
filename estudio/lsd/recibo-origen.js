/**
 * Origen «un recibo por hoja».
 *
 * El libro de sueldos de Martín Prado no es una tabla: es una planilla con un
 * **recibo dibujado por hoja**, una hoja por empleado. Este archivo lo convierte
 * en la misma tabla que el armador ya sabe leer —la de «Conceptos y totales»—,
 * así que de acá para abajo no se entera nadie de la diferencia. Es lo que dice
 * `perfiles.js`: un formato distinto se resuelve en el lector, no en el perfil.
 *
 * Cuatro cosas que tiene este libro y que hay que saber antes de tocarlo. Las
 * cuatro se verificaron contra «Sueldos_08-2026 Martin (1).xlsm»:
 *
 * **El recibo está DOS VECES en cada hoja.** Primero la copia del empleador y
 * abajo la del empleado, idénticas. Leer la hoja entera duplica todos los
 * importes. Se corta en el primer «Subtotal».
 *
 * **La hoja resumen está incompleta.** «Conceptos y totales - Liquid_01» no
 * trae los conceptos no remunerativos: en agosto de 2026 le faltaban los
 * viáticos y el ANR de los cuatro empleados, $ 849.424,60. Por eso se lee el
 * recibo y no el resumen, aunque el resumen sea una tabla y el recibo no.
 *
 * **Hay hojas que no son empleados.** «DATOS» tiene fechas de 2016 y
 * «Gomez VAC 2013» es un recibo viejo sin CUIL. La regla no es una lista de
 * nombres: una hoja sin CUIL no es un empleado del período.
 *
 * **El recibo no trae el código del concepto**, solo su descripción, y la
 * descripción no coincide con la del reservorio: el recibo dice «Zona» y el
 * reservorio «Zona Desfavorable». Por eso el alias viaja en el reservorio de la
 * empresa. Un concepto sin alias **no se inventa**: sale con el código vacío y
 * el control del paso 5 lo muestra como sin parametrizar.
 */

/* Dónde cae cada dato adentro del recibo. Son posiciones de la plantilla, no
   encabezados: la plantilla es un dibujo y no tiene fila de títulos. */
const RECIBO = {
  descripcion: 0,
  unidades: 2,
  porcentaje: 3,
  remuneracion: 4,
  descuentos: 5,
  noRemunerativo: 6,
};

const RE_CUIL_RECIBO = /^\s*(\d{2})-?(\d{8})-?(\d)\s*$/;

/* La fila que abre la tabla de conceptos. Antes de ella está la cabecera del
   recibo, y ahí la columna de los no remunerativos la ocupa «REMUNERACIÓN
   BÁSICA»: leerla como concepto metía el básico dos veces y el subtotal no
   cerraba por ese importe exacto. */
const RE_ABRE_CONCEPTOS = /descripci[oó]n\s+de\s+concepto/i;

/* El período que paga el recibo. Un recibo de otro período no es de esta
   liquidación: en el libro de Prado quedó «Gomez VAC 2013», que tiene CUIL y
   Subtotal como cualquier otro y es de hace trece años. */
const RE_PERIODO_ABONADO = /per[ií]odo\s+abonado/i;

/** La fila de encabezados que espera el perfil «conceptos-y-totales». */
const ENCABEZADOS_CONVERTIDOS = [
  'C.U.I.L.', 'nombre', 'Número de concepto', 'Descripción de concepto',
  'Cantidad liquidada', 'Importe liquidado', 'Columna1',
];

function textoDe(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function numeroDe(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

function claveDescripcion(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * ¿Este libro es de los que traen un recibo por hoja?
 *
 * La señal es la plantilla del recibo, no el nombre del archivo: dos o más
 * hojas con un CUIL en su cabecera y la palabra «Subtotal» más abajo.
 */
function esLibroDeRecibos(libro) {
  let hojasConRecibo = 0;
  for (const hoja of (libro && libro.hojas) || []) {
    if (cuilDeLaHoja(hoja.filas) && tieneSubtotal(hoja.filas)) hojasConRecibo += 1;
    if (hojasConRecibo >= 2) return true;
  }
  return false;
}

function cuilDeLaHoja(filas) {
  for (const fila of filas.slice(0, 20)) {
    for (const celda of fila || []) {
      const m = RE_CUIL_RECIBO.exec(textoDe(celda));
      if (m) return m[1] + m[2] + m[3];
    }
  }
  return '';
}

function tieneSubtotal(filas) {
  return filas.some((f) => (f || []).some((c) => textoDe(c).toLowerCase() === 'subtotal'));
}

/** AAAAMM del «Período Abonado» del recibo, o '' si no se pudo leer. */
function periodoDelRecibo(filas) {
  for (let i = 0; i < filas.length; i += 1) {
    const f = filas[i] || [];
    if (!f.some((c) => RE_PERIODO_ABONADO.test(textoDe(c)))) continue;
    const abajo = filas[i + 1] || [];
    for (const celda of abajo) {
      const t = textoDe(celda);
      const m = /^(\d{4})-(\d{2})-\d{2}/.exec(t);
      if (m) return m[1] + m[2];
    }
  }
  return '';
}

function nombreDeLaHoja(filas) {
  /* El nombre está en la primera columna de la fila del CUIL. */
  for (const fila of filas.slice(0, 20)) {
    for (const celda of fila || []) {
      if (RE_CUIL_RECIBO.test(textoDe(celda))) return textoDe((fila || [])[0]);
    }
  }
  return '';
}

/**
 * Convierte el libro de recibos en una hoja con una fila por concepto.
 *
 * `alias` es { descripción normalizada: código de concepto } y sale del
 * reservorio de la empresa. Devuelve la hoja convertida y, aparte, los avisos
 * y los controles: cada recibo suma sus conceptos y se enfrenta al Subtotal que
 * el propio recibo imprime. Si no cierra, se dice.
 */
function recibosAFilas(libro, config) {
  const cfg = config || {};
  const tabla = [ENCABEZADOS_CONVERTIDOS.slice()];
  const avisos = [];
  const controles = [];
  const sinAlias = new Set();
  const dejadosAfuera = new Map();
  const porAlias = new Map(
    Object.entries(cfg.alias || {}).map(([d, c]) => [claveDescripcion(d), String(c)])
  );
  /* Conceptos que la empresa decidió no pasar al libro, por descripción: el
     recibo no trae código, así que no se pueden excluir por número. */
  const afuera = new Set((cfg.excluidos || []).map(claveDescripcion));

  for (const hoja of (libro && libro.hojas) || []) {
    const filas = hoja.filas || [];
    const cuil = cuilDeLaHoja(filas);
    if (!cuil || !tieneSubtotal(filas)) {
      /* No es un recibo: la hoja de datos de la empresa, el resumen, o un
         recibo viejo que quedó en el libro. Se dice cuál se dejó afuera. */
      if (filas.length > 3) avisos.push(`La hoja «${hoja.nombre}» no es un recibo: no tiene CUIL. No se leyó.`);
      continue;
    }

    const nombre = nombreDeLaHoja(filas);
    const periodoRecibo = periodoDelRecibo(filas);
    if (cfg.periodo && periodoRecibo && periodoRecibo !== cfg.periodo) {
      avisos.push(
        `La hoja «${hoja.nombre}» es un recibo de ${periodoRecibo.slice(4)}/${
          periodoRecibo.slice(0, 4)}, no de ${cfg.periodo.slice(4)}/${
          cfg.periodo.slice(0, 4)}. No se leyó.`
      );
      continue;
    }

    const suma = { remuneracion: 0, descuentos: 0, noRemunerativo: 0 };
    let subtotal = null;
    let enConceptos = false;

    for (const fila of filas) {
      const f = fila || [];
      /* Recién después del encabezado de la tabla empiezan los conceptos. */
      if (!enConceptos) {
        if (f.some((c) => RE_ABRE_CONCEPTOS.test(textoDe(c)))) enConceptos = true;
        continue;
      }
      /* El primer «Subtotal» cierra la copia del empleador. Lo que sigue es la
         copia del empleado, que es la misma y no se vuelve a leer. */
      if (f.some((c) => textoDe(c).toLowerCase() === 'subtotal')) {
        subtotal = {
          remuneracion: numeroDe(f[RECIBO.remuneracion]),
          descuentos: numeroDe(f[RECIBO.descuentos]),
          noRemunerativo: numeroDe(f[RECIBO.noRemunerativo]),
        };
        break;
      }

      const desc = textoDe(f[RECIBO.descripcion]);
      if (!desc || RE_CUIL_RECIBO.test(desc)) continue;

      const rem = numeroDe(f[RECIBO.remuneracion]);
      const des = numeroDe(f[RECIBO.descuentos]);
      const nor = numeroDe(f[RECIBO.noRemunerativo]);
      if (!rem && !des && !nor) continue;

      /* De qué lado del recibo cae decide el débito/crédito, igual que en el
         resumen del sistema: lo que se paga es crédito, lo que se retiene es
         débito. */
      const importe = rem || des || nor;
      const dc = des ? 'D' : 'C';

      /* Lo excluido SUMA al control del recibo —está en el papel— pero no sale
         al archivo. Si no sumara, el subtotal del recibo no cerraría y el
         control gritaría por algo que decidimos nosotros. */
      suma.remuneracion += rem;
      suma.descuentos += des;
      suma.noRemunerativo += nor;

      if (afuera.has(claveDescripcion(desc))) {
        dejadosAfuera.set(desc, (dejadosAfuera.get(desc) || 0) + importe);
        continue;
      }

      const codigo = porAlias.get(claveDescripcion(desc)) || '';
      if (!codigo) sinAlias.add(desc);

      tabla.push([
        cuil, nombre, codigo, desc,
        numeroDe(f[RECIBO.unidades]) || 1,
        importe, dc,
      ]);
    }

    /* El control: lo que sumamos contra lo que el recibo dice que suma. */
    if (subtotal) {
      for (const col of ['remuneracion', 'descuentos', 'noRemunerativo']) {
        controles.push({
          hoja: hoja.nombre, cuil, nombre, columna: col,
          calculado: Math.round(suma[col] * 100),
          declarado: Math.round(subtotal[col] * 100),
        });
      }
    } else {
      avisos.push(`El recibo de «${hoja.nombre}» no tiene Subtotal: no se pudo controlar.`);
    }
  }

  for (const [d, importe] of dejadosAfuera) {
    avisos.push(
      `El concepto «${d}» no entra al archivo por decisión del estudio: ` +
        `$ ${(Math.round(importe * 100) / 100).toLocaleString('es-AR', {minimumFractionDigits: 2})} ` +
        'en total. Está en el recibo y no en el libro.'
    );
  }

  for (const d of sinAlias) {
    avisos.push(
      `El concepto «${d}» no tiene código en el reservorio de la empresa: sale sin ` +
        'parametrizar y el control del paso 5 lo va a marcar.'
    );
  }

  return {
    hoja: { nombre: 'Recibos (convertidos)', filas: tabla },
    avisos,
    controles,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    esLibroDeRecibos,
    recibosAFilas,
    claveDescripcion,
    ENCABEZADOS_CONVERTIDOS,
  };
}
