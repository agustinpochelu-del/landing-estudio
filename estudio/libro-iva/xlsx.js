/**
 * Lector mínimo de planillas .xlsx y .csv, sin dependencias.
 *
 * Un .xlsx es un ZIP con XML adentro. Acá se abre el ZIP a mano y se
 * descomprime con DecompressionStream, que ya viene en el navegador.
 * Solo lee lo necesario: valores de celda, textos compartidos y si una
 * celda tiene formato de fecha.
 */

/* ---------- ZIP ---------- */

/** Abre un ZIP y devuelve un Map de nombre de archivo -> Uint8Array. */
async function abrirZip(buffer) {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  /* El directorio central se ubica desde el final: hay que buscar el EOCD. */
  let eocd = -1;
  const minimo = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minimo; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no es un ZIP válido (no se encontró el fin del directorio).');

  const cantidad = dv.getUint16(eocd + 10, true);
  let puntero = dv.getUint32(eocd + 16, true);

  const archivos = new Map();
  for (let n = 0; n < cantidad; n++) {
    if (dv.getUint32(puntero, true) !== 0x02014b50) break;

    const metodo = dv.getUint16(puntero + 10, true);
    const compriLargo = dv.getUint32(puntero + 20, true);
    const nombreLargo = dv.getUint16(puntero + 28, true);
    const extraLargo = dv.getUint16(puntero + 30, true);
    const comentLargo = dv.getUint16(puntero + 32, true);
    const offsetLocal = dv.getUint32(puntero + 42, true);
    const nombre = new TextDecoder('utf-8').decode(
      bytes.subarray(puntero + 46, puntero + 46 + nombreLargo)
    );

    /* La cabecera local repite los largos de nombre y extra, que pueden diferir. */
    const nomLocal = dv.getUint16(offsetLocal + 26, true);
    const extLocal = dv.getUint16(offsetLocal + 28, true);
    const inicio = offsetLocal + 30 + nomLocal + extLocal;
    const crudo = bytes.subarray(inicio, inicio + compriLargo);

    archivos.set(nombre, { metodo, crudo });
    puntero += 46 + nombreLargo + extraLargo + comentLargo;
  }

  /* Descomprime a demanda para no inflar entradas que no se usan. */
  const cache = new Map();
  return {
    tiene: (nombre) => archivos.has(nombre),
    nombres: () => [...archivos.keys()],
    async texto(nombre) {
      if (cache.has(nombre)) return cache.get(nombre);
      const entrada = archivos.get(nombre);
      if (!entrada) return null;
      let datos;
      if (entrada.metodo === 0) {
        datos = entrada.crudo;
      } else if (entrada.metodo === 8) {
        datos = await inflar(entrada.crudo);
      } else {
        throw new Error('Método de compresión no soportado en ' + nombre);
      }
      const txt = new TextDecoder('utf-8').decode(datos);
      cache.set(nombre, txt);
      return txt;
    },
  };
}

async function inflar(crudo) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador no puede descomprimir el archivo. Probá con Chrome o Edge actualizado.');
  }
  const flujo = new Blob([crudo]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/* ---------- XML ---------- */

function parsearXml(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('No se pudo leer el XML interno de la planilla.');
  }
  return doc;
}

/** Convierte "A1", "BC12" al índice de columna base cero. */
function columnaDeReferencia(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/* Formatos numéricos incorporados que representan fechas. */
const FORMATOS_FECHA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Serial de Excel -> Date. El origen es 1899-12-30 por el bug del año 1900. */
function serialAFecha(serial) {
  const ms = Math.round(serial * 86400000);
  return new Date(Date.UTC(1899, 11, 30) + ms);
}

/* ---------- Lectura de la planilla ---------- */

/**
 * Lee un .xlsx y devuelve { hojas: [{ nombre, filas }] }.
 * Cada fila es un arreglo de valores (string, number, Date o null).
 */
async function leerXlsx(buffer) {
  const zip = await abrirZip(buffer);

  /* Textos compartidos */
  const compartidos = [];
  const sst = await zip.texto('xl/sharedStrings.xml');
  if (sst) {
    for (const si of parsearXml(sst).getElementsByTagName('si')) {
      /* Un <si> puede venir partido en varios <t> por formato enriquecido. */
      let txt = '';
      for (const t of si.getElementsByTagName('t')) txt += t.textContent;
      compartidos.push(txt);
    }
  }

  /* Estilos: qué xf apunta a un formato de fecha */
  const estilosEsFecha = [];
  const estilos = await zip.texto('xl/styles.xml');
  if (estilos) {
    const doc = parsearXml(estilos);
    const personalizados = new Map();
    for (const nf of doc.getElementsByTagName('numFmt')) {
      personalizados.set(
        Number(nf.getAttribute('numFmtId')),
        nf.getAttribute('formatCode') || ''
      );
    }
    const cellXfs = doc.getElementsByTagName('cellXfs')[0];
    if (cellXfs) {
      for (const xf of cellXfs.getElementsByTagName('xf')) {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        let fecha = FORMATOS_FECHA.has(id);
        if (!fecha && personalizados.has(id)) {
          /* Un formato propio es fecha si tiene y/m/d fuera de literales. */
          const codigo = personalizados.get(id).replace(/\[[^\]]*\]|"[^"]*"/g, '');
          fecha = /[yYdD]/.test(codigo) || /m{3,}/.test(codigo);
        }
        estilosEsFecha.push(fecha);
      }
    }
  }

  /* Nombres de hoja y su archivo correspondiente */
  const hojas = [];
  const wb = await zip.texto('xl/workbook.xml');
  const rels = await zip.texto('xl/_rels/workbook.xml.rels');
  const mapaRels = new Map();
  if (rels) {
    for (const r of parsearXml(rels).getElementsByTagName('Relationship')) {
      mapaRels.set(r.getAttribute('Id'), r.getAttribute('Target'));
    }
  }
  const referencias = [];
  if (wb) {
    for (const s of parsearXml(wb).getElementsByTagName('sheet')) {
      const rid = s.getAttribute('r:id') ||
        s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let destino = mapaRels.get(rid) || null;
      if (destino) {
        destino = destino.replace(/^\/?xl\//, '').replace(/^\//, '');
        referencias.push({ nombre: s.getAttribute('name') || 'Hoja', ruta: 'xl/' + destino });
      }
    }
  }
  if (!referencias.length) {
    /* Sin workbook.xml legible: se busca la primera hoja por convención. */
    for (const n of zip.nombres()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(n)) {
        referencias.push({ nombre: 'Hoja1', ruta: n });
        break;
      }
    }
  }

  for (const ref of referencias) {
    const xml = await zip.texto(ref.ruta);
    if (!xml) continue;
    hojas.push({ nombre: ref.nombre, filas: leerFilas(parsearXml(xml), compartidos, estilosEsFecha) });
  }

  if (!hojas.length) throw new Error('La planilla no tiene hojas legibles.');
  return { hojas };
}

function leerFilas(doc, compartidos, estilosEsFecha) {
  const filas = [];
  for (const fila of doc.getElementsByTagName('row')) {
    const salida = [];
    for (const celda of fila.getElementsByTagName('c')) {
      const col = columnaDeReferencia(celda.getAttribute('r') || '');
      const tipo = celda.getAttribute('t');
      let valor = null;

      if (tipo === 'inlineStr') {
        let txt = '';
        for (const t of celda.getElementsByTagName('t')) txt += t.textContent;
        valor = txt;
      } else {
        const v = celda.getElementsByTagName('v')[0];
        const bruto = v ? v.textContent : null;
        if (bruto != null && bruto !== '') {
          if (tipo === 's') {
            valor = compartidos[Number(bruto)] ?? '';
          } else if (tipo === 'b') {
            valor = bruto === '1';
          } else if (tipo === 'str' || tipo === 'e') {
            valor = bruto;
          } else {
            const num = Number(bruto);
            const s = Number(celda.getAttribute('s') || 0);
            valor = (!Number.isNaN(num) && estilosEsFecha[s]) ? serialAFecha(num) : num;
          }
        }
      }

      if (col >= 0) {
        while (salida.length < col) salida.push(null);
        salida[col] = valor;
      }
    }
    filas.push(salida);
  }

  /* Recorta filas totalmente vacías del final. */
  while (filas.length && filas[filas.length - 1].every((c) => c == null || c === '')) filas.pop();
  return filas;
}

/* ---------- CSV ---------- */

/** Lee un CSV detectando el separador (coma, punto y coma o tabulación). */
function leerCsv(texto) {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);

  const primera = texto.split(/\r?\n/, 1)[0] || '';
  const candidatos = [';', ',', '\t'];
  let sep = ';';
  let mejor = -1;
  for (const c of candidatos) {
    const n = primera.split(c).length;
    if (n > mejor) { mejor = n; sep = c; }
  }

  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entreComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') { entreComillas = true; continue; }
    if (ch === sep) { fila.push(campo); campo = ''; continue; }
    if (ch === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    if (ch === '\r') continue;
    campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }

  while (filas.length && filas[filas.length - 1].every((c) => String(c).trim() === '')) filas.pop();
  return { hojas: [{ nombre: 'CSV', filas }] };
}

/* ---------- Punto de entrada ---------- */

/**
 * Recibe un File y devuelve { hojas: [{ nombre, filas }] }.
 *
 * ── Para sumar un formato nuevo ─────────────────────────────────────────
 *
 * Este archivo tiene una sola responsabilidad: convertir un archivo en filas.
 * Todo lo que sigue después —qué columna es cuál, cómo se llaman los tipos de
 * comprobante— es problema de `perfiles.js` y `libro.js`, y no hay que tocarlo.
 *
 * Para leer, por ejemplo, un TXT de ancho fijo de otro sistema:
 *
 *   1. Escribí una función `leerLoQueSea(texto|buffer)` que devuelva
 *      `{ hojas: [{ nombre, filas }] }`, donde `filas[0]` son los encabezados
 *      y el resto los datos. Los valores pueden ser string, number o Date;
 *      `libro.js` sabe interpretar los tres.
 *   2. Sumá la extensión al `if` de abajo.
 *   3. Sumá el perfil correspondiente en `perfiles.js` y una prueba con un
 *      archivo real.
 *
 * Si el formato no tiene fila de encabezados —el caso típico del ancho fijo—,
 * inventala en el lector: devolvé una primera fila con los nombres que después
 * declare el perfil. Así el resto del programa no se entera de la diferencia.
 */
async function leerPlanilla(archivo) {
  const nombre = (archivo.name || '').toLowerCase();
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
    return leerCsv(await archivo.text());
  }
  if (nombre.endsWith('.xls')) {
    throw new Error('El formato .xls viejo no se puede leer. Guardalo como .xlsx o .csv desde Excel.');
  }
  return leerXlsx(await archivo.arrayBuffer());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { leerPlanilla, leerXlsx, leerCsv, columnaDeReferencia, serialAFecha };
}
