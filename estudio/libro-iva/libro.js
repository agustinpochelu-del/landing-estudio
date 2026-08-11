/**
 * Núcleo del importador del Libro de IVA Digital.
 *
 * Todo el dinero se maneja en centavos enteros. Nunca en punto flotante:
 * un comprobante que cierra por dos centavos es un archivo rechazado.
 */

/* ---------- Importes en centavos ---------- */

/**
 * Lleva un valor de planilla a centavos enteros.
 * Acepta 1234.56, "1.234,56", "1,234.56", "$ 1.234,56", "(1.234,56)".
 * Devuelve null si no es un número.
 */
function aCentavos(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null;
    return Math.round(valor * 100);
  }

  let s = String(valor).trim();
  if (!s) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  s = s.replace(/[$\sA-Za-z]/g, '');
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1); }
  if (!s) return null;

  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    /* El separador decimal es el que aparece último. */
    if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (ultimaComa >= 0) {
    /* Una coma sola: decimal, salvo que agrupe de a tres (1,234,567). */
    const partes = s.split(',');
    const agrupador = partes.length > 2 || (partes[1] && partes[1].length === 3 && partes[0].length <= 3 && /^\d+$/.test(partes[1]));
    s = agrupador ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ultimoPunto >= 0) {
    const partes = s.split('.');
    if (partes.length > 2) s = s.replace(/\./g, '');
    else if (partes[1] && partes[1].length === 3 && partes[0].length <= 3) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (negativo ? -1 : 1);
}

/** Centavos -> texto legible en formato argentino: 1234567 -> "12.345,67". */
function pesos(centavos) {
  if (centavos == null) return '';
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  const ent = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = String(abs % 100).padStart(2, '0');
  return (neg ? '-' : '') + ent + ',' + dec;
}

/* ---------- Fechas ---------- */

/** Lleva un valor de planilla a "AAAAMMDD", o null si no se entiende. */
function aFechaArca(valor) {
  if (valor == null || valor === '') return null;

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const a = valor.getUTCFullYear();
    const m = valor.getUTCMonth() + 1;
    const d = valor.getUTCDate();
    return `${a}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  }

  /* Serial de Excel suelto */
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    return aFechaArca(new Date(Date.UTC(1899, 11, 30) + Math.round(valor * 86400000)));
  }

  const s = String(valor).trim();

  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);              // AAAAMMDD
  if (m) return validarFecha(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);        // AAAA-MM-DD
  if (m) return validarFecha(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);      // DD/MM/AAAA
  if (m) {
    let a = +m[3];
    if (a < 100) a += a < 70 ? 2000 : 1900;
    return validarFecha(a, +m[2], +m[1]);
  }
  return null;
}

function validarFecha(a, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1900 || a > 2999) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() + 1 !== m || f.getUTCDate() !== d) return null;
  return `${a}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

/** "20250615" -> "2025-06" */
function periodoDeFecha(fechaArca) {
  return fechaArca ? fechaArca.slice(0, 4) + '-' + fechaArca.slice(4, 6) : null;
}

/* ---------- CUIT ---------- */

/** Verifica el dígito verificador. Devuelve true/false. */
function cuitValido(cuit) {
  const s = String(cuit == null ? '' : cuit).replace(/\D/g, '');
  if (s.length !== 11) return false;
  const pesosDv = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(s[i]) * pesosDv[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(s[10]);
}

/* ---------- Campos de ancho fijo ---------- */

/** Reemplaza acentos y caracteres fuera de ASCII, que el TXT no admite. */
function aAscii(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ñÑ]/g, (c) => (c === 'ñ' ? 'n' : 'N'))
    .replace(/[^\x20-\x7E]/g, ' ');
}

/** Alfanumérico: alineado a la izquierda, relleno con espacios, recortado. */
function campoTexto(valor, largo) {
  const s = aAscii(valor).replace(/\s+/g, ' ').trim();
  return (s.length > largo ? s.slice(0, largo) : s.padEnd(largo, ' '));
}

/** Numérico: solo dígitos, alineado a la derecha, relleno con ceros. */
function campoNumero(valor, largo) {
  const s = String(valor == null ? '' : valor).replace(/\D/g, '');
  if (s.length > largo) throw new Error(`El valor "${valor}" no entra en ${largo} dígitos.`);
  return s.padStart(largo, '0');
}

/** Importe: 13 enteros y 2 decimales sin punto, en 15 posiciones. */
function campoImporte(centavos, largo = 15) {
  const c = Math.round(centavos == null ? 0 : centavos);
  const s = String(Math.abs(c));
  if (s.length > largo) throw new Error(`El importe ${pesos(c)} no entra en ${largo} posiciones.`);
  return s.padStart(largo, '0');
}

/** Cantidad de alícuotas: una sola posición, así que no puede pasar de 9. */
function campoCantidadAlicuotas(cantidad) {
  if (cantidad > 9) {
    throw new Error(`Un comprobante no puede tener más de 9 alícuotas y tiene ${cantidad}.`);
  }
  return String(cantidad);
}

/** Tipo de cambio: 4 enteros y 6 decimales sin punto, en 10 posiciones. */
function campoTipoCambio(valor) {
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  const v = Number.isFinite(n) && n > 0 ? n : 1;
  return String(Math.round(v * 1e6)).padStart(10, '0');
}

/* ---------- Resolución de alícuotas ---------- */

/*
 * Pares de alícuotas ordenados por probabilidad. El resolutor prueba en
 * este orden y se queda con el primero que dé importes no negativos.
 */
const PARES_PREFERIDOS = [
  ['0005', '0004'], // 21 + 10,5  (el caso más común)
  ['0005', '0006'], // 21 + 27    (telefonía, servicios)
  ['0005', '0003'], // 21 + 0
  ['0004', '0003'], // 10,5 + 0
  ['0006', '0003'], // 27 + 0
  ['0004', '0006'], // 10,5 + 27
  ['0005', '0008'], // 21 + 5
  ['0005', '0009'], // 21 + 2,5
  ['0004', '0008'],
  ['0004', '0009'],
];

/** Tolerancia de redondeo en centavos, más laxa cuanto mayor el importe. */
function tolerancia(netoCentavos) {
  return Math.max(2, Math.ceil(Math.abs(netoCentavos) / 1e7));
}

/**
 * Descompone neto + IVA en líneas de alícuota.
 * Devuelve { estado, lineas, alternativas, detalle }.
 *   estado: 'exacta' | 'sugerida' | 'sin_resolver' | 'sin_gravado'
 *   lineas: [{ codigo, netoCentavos, ivaCentavos }]
 */
function resolverAlicuotas(netoCentavos, ivaCentavos, tasas) {
  const neto = Math.round(netoCentavos || 0);
  const iva = Math.round(ivaCentavos || 0);

  if (neto === 0 && iva === 0) {
    return { estado: 'sin_gravado', lineas: [], alternativas: [], detalle: 'Sin importe gravado.' };
  }

  const tol = tolerancia(neto);

  /* 1) ¿Cierra con una sola alícuota? */
  for (const codigo of tasas.habituales.concat(tasas.resto)) {
    const tasa = tasas.porCodigo[codigo];
    if (Math.abs(Math.round(neto * tasa) - iva) <= tol) {
      return {
        estado: 'exacta',
        lineas: [{ codigo, netoCentavos: neto, ivaCentavos: iva }],
        alternativas: [],
        detalle: `Cierra al ${tasas.etiqueta[codigo]}.`,
      };
    }
  }

  if (neto === 0) {
    return {
      estado: 'sin_resolver', lineas: [], alternativas: [],
      detalle: 'Hay IVA pero el neto gravado es cero.',
    };
  }

  /* 2) ¿Cierra con dos alícuotas? Se prueban todos los pares posibles. */
  const alternativas = [];
  const codigos = tasas.habituales.concat(tasas.resto);
  for (let i = 0; i < codigos.length; i++) {
    for (let j = 0; j < codigos.length; j++) {
      if (i === j) continue;
      const c1 = codigos[i], c2 = codigos[j];
      const a1 = tasas.porCodigo[c1], a2 = tasas.porCodigo[c2];
      if (a1 <= a2) continue;

      /* x*a1 + (neto-x)*a2 = iva  ->  x = (iva - neto*a2) / (a1 - a2) */
      const x = Math.round((iva - neto * a2) / (a1 - a2));
      const y = neto - x;
      if (x <= 0 || y <= 0) continue;

      /* El reparto del IVA absorbe el redondeo en la línea más grande. */
      let iva1 = Math.round(x * a1);
      let iva2 = iva - iva1;
      const esperado2 = Math.round(y * a2);
      if (Math.abs(iva2 - esperado2) > tol) continue;

      const clave = c1 + '|' + c2;
      if (alternativas.some((al) => al.clave === clave)) continue;
      alternativas.push({
        clave,
        lineas: [
          { codigo: c1, netoCentavos: x, ivaCentavos: iva1 },
          { codigo: c2, netoCentavos: y, ivaCentavos: iva2 },
        ],
        preferencia: indicePreferencia(c1, c2),
      });
    }
  }

  if (!alternativas.length) {
    const efectiva = (iva / neto * 100).toFixed(2);
    return {
      estado: 'sin_resolver', lineas: [], alternativas: [],
      detalle: `No hay combinación de alícuotas que dé ${efectiva}% efectivo.`,
    };
  }

  alternativas.sort((a, b) => a.preferencia - b.preferencia);
  const elegida = alternativas[0];
  const etiquetas = elegida.lineas.map((l) => tasas.etiqueta[l.codigo]).join(' + ');
  return {
    estado: 'sugerida',
    lineas: elegida.lineas,
    alternativas,
    detalle: `Sugerido ${etiquetas}. Confirmalo contra el comprobante.`,
  };
}

/**
 * Lee las alícuotas del detalle abierto de la planilla. No deduce nada:
 * los importes vienen del comprobante.
 *
 * Si la planilla también trae los totales de neto y de IVA, se controlan
 * contra la suma del detalle. Si no los trae, se calculan desde el detalle.
 */
function leerAlicuotasDeclaradas(fila, detalle, c, enValorAbsoluto, mapa) {
  const lineas = [];
  let sumaNeto = 0;
  let sumaIva = 0;

  for (const col of detalle) {
    let neto = aCentavos(fila[col.colNeto]) || 0;
    let iva = aCentavos(fila[col.colIva]) || 0;
    if (enValorAbsoluto) { neto = Math.abs(neto); iva = Math.abs(iva); }
    if (neto === 0 && iva === 0) continue;

    lineas.push({ codigo: col.codigo, netoCentavos: neto, ivaCentavos: iva });
    sumaNeto += neto;
    sumaIva += iva;
  }

  /* Sin totales propios, el detalle es la única fuente. */
  if (mapa.neto == null) c.neto = sumaNeto;
  if (mapa.iva == null) c.iva = sumaIva;

  const difNeto = sumaNeto - c.neto;
  const difIva = sumaIva - c.iva;
  if (difNeto !== 0 || difIva !== 0) {
    return {
      estado: 'sin_resolver', lineas: [], alternativas: [],
      detalle: `El detalle por alícuota no coincide con los totales: ` +
        `neto ${difNeto >= 0 ? '+' : ''}${pesos(difNeto)}, IVA ${difIva >= 0 ? '+' : ''}${pesos(difIva)}.`,
    };
  }

  if (!lineas.length) {
    return { estado: 'sin_gravado', lineas: [], alternativas: [], detalle: 'Sin importe gravado.' };
  }

  const etiquetas = lineas.map((l) => detalle.find((d) => d.codigo === l.codigo).etiqueta);
  return {
    estado: 'declarada',
    lineas,
    alternativas: [],
    detalle: `Del detalle de la planilla: ${etiquetas.join(' + ')}.`,
  };
}

function indicePreferencia(c1, c2) {
  const i = PARES_PREFERIDOS.findIndex(
    (p) => (p[0] === c1 && p[1] === c2) || (p[0] === c2 && p[1] === c1)
  );
  return i < 0 ? PARES_PREFERIDOS.length : i;
}

/** Arma el índice de tasas que usa el resolutor a partir de la tabla de ARCA. */
function armarTasas(alicuotas, habituales) {
  const porCodigo = {};
  const etiqueta = {};
  for (const a of alicuotas) { porCodigo[a.codigo] = a.tasa; etiqueta[a.codigo] = a.etiqueta; }
  const resto = alicuotas.map((a) => a.codigo).filter((c) => !habituales.includes(c));
  return { porCodigo, etiqueta, habituales: habituales.slice(), resto };
}

/* ---------- Detección de columnas ---------- */

/*
 * Sinónimos de encabezado para cada campo. Se comparan normalizados,
 * así que "Denominación Emisor" y "denominacion emisor" son lo mismo.
 */
const SINONIMOS = {
  fecha: ['fecha', 'fecha de emision', 'fecha emision', 'fecha comprobante', 'fecha cbte', 'fecha de comprobante'],
  tipo: ['tipo', 'tipo de comprobante', 'tipo comprobante', 'tipo cbte', 'comprobante'],
  puntoVenta: ['pto vta', 'punto de venta', 'punto venta', 'pto de venta', 'ptovta', 'pv'],
  numero: ['numero', 'nro', 'n', 'numero de comprobante', 'nro comprobante', 'numero desde', 'nro cbte', 'comprobante nro'],
  numeroHasta: ['numero hasta', 'nro hasta', 'hasta'],
  documentoTipo: ['tipo doc', 'tipo de documento', 'tipo doc emisor', 'tipo doc receptor', 'tipo documento'],
  documentoNro: ['cuit', 'nro doc', 'numero de documento', 'cuit emisor', 'cuit vendedor', 'cuit receptor', 'cuit comprador', 'nro de documento receptor', 'nro doc emisor', 'documento'],
  denominacion: ['denominacion emisor', 'denominacion', 'razon social', 'emisor', 'proveedor', 'vendedor', 'denominacion receptor', 'cliente', 'comprador', 'apellido y nombre'],
  neto: ['neto gravado total', 'neto gravado', 'importe neto gravado', 'neto', 'imp neto gravado'],
  iva: ['total iva', 'iva', 'importe iva', 'imp iva', 'iva total'],
  total: ['imp total', 'importe total', 'total', 'importe total de la operacion'],
  noGravado: ['neto no gravado', 'no gravado', 'imp neto no gravado', 'conceptos no gravados', 'importe no gravado'],
  exento: ['op exentas', 'operaciones exentas', 'exento', 'imp op exentas', 'importe exento', 'exentas'],
  percIva: ['iva perc', 'percepcion iva', 'perc iva', 'percepciones iva', 'iva percepciones'],
  percNacionales: ['otros tributos nacionales', 'percepcion nacionales', 'perc nacionales', 'imp nacionales', 'percepciones nacionales'],
  percIibb: ['perc iibb', 'percepcion iibb', 'iibb', 'ingresos brutos', 'percepcion ingresos brutos', 'imp ing brutos'],
  percMunicipales: ['perc municipales', 'percepcion municipal', 'municipales', 'imp municipales', 'percepcion municipales'],
  impInternos: ['impuestos internos', 'imp internos', 'internos'],
  otrosTributos: ['otros tributos', 'otros trib', 'otros impuestos'],
  moneda: ['moneda', 'cod moneda', 'codigo de moneda'],
  tipoCambio: ['tipo cambio', 'tipo de cambio', 'cotizacion'],
  creditoComputable: ['credito fiscal computable', 'credito computable', 'cf computable'],
  despacho: ['despacho', 'despacho de importacion', 'despacho importacion'],
  fechaVencimiento: ['fecha de vencimiento', 'fecha vencimiento', 'vencimiento', 'fecha de pago', 'fecha vto'],
};

function normalizarEncabezado(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Busca columnas con el detalle abierto por alícuota, del estilo
 * "Neto Grav. IVA 10,5%" junto a "IVA 10,5%".
 *
 * Devuelve [{ codigo, tasa, etiqueta, colNeto, colIva }] ordenado por tasa.
 * Si la planilla trae este detalle no hay nada que deducir: los importes
 * vienen del comprobante.
 */
function detectarAlicuotas(encabezados, tablas) {
  const porTasa = new Map();

  encabezados.forEach((bruto, i) => {
    const h = normalizarEncabezado(bruto);
    /* Tiene que nombrar al IVA y traer un porcentaje: "iva 10 5" del encabezado
       normalizado, donde la coma decimal ya se volvió un espacio. */
    const m = h.match(/\biva\s+(\d+)(?:\s+(\d+))?\s*$/);
    if (!m) return;

    const tasa = Number(m[1] + '.' + (m[2] || '0')) / 100;
    const alicuota = tablas.alicuotaPorTasa(tasa);
    if (!alicuota) return;

    const esNeto = /\bneto\b/.test(h);
    if (!porTasa.has(alicuota.codigo)) {
      porTasa.set(alicuota.codigo, {
        codigo: alicuota.codigo, tasa: alicuota.tasa, etiqueta: alicuota.etiqueta,
        colNeto: null, colIva: null,
      });
    }
    const par = porTasa.get(alicuota.codigo);
    if (esNeto) { if (par.colNeto == null) par.colNeto = i; }
    else if (par.colIva == null) par.colIva = i;
  });

  /* Un par suelto no sirve: hacen falta las dos columnas. */
  return [...porTasa.values()]
    .filter((p) => p.colNeto != null && p.colIva != null)
    .sort((a, b) => a.tasa - b.tasa);
}

/** Los índices de columna que ocupa el detalle por alícuota. */
function indicesDeAlicuotas(alicuotas) {
  return new Set(alicuotas.flatMap((a) => [a.colNeto, a.colIva]));
}

/**
 * Empareja los encabezados de la planilla con los campos conocidos.
 * Devuelve { campo: índice de columna }.
 * `excluidas` son columnas ya tomadas por el detalle de alícuotas.
 */
function detectarColumnas(encabezados, excluidas) {
  const normalizados = encabezados.map(normalizarEncabezado);
  const mapa = {};
  const usadas = new Set(excluidas || []);

  /* Primero las coincidencias exactas, después las parciales. */
  for (const exacto of [true, false]) {
    for (const [campo, opciones] of Object.entries(SINONIMOS)) {
      if (mapa[campo] != null) continue;
      for (let i = 0; i < normalizados.length; i++) {
        if (usadas.has(i) || !normalizados[i]) continue;
        const h = normalizados[i];
        const pega = exacto
          ? opciones.includes(h)
          : opciones.some((o) => o.length >= 4 && (h.includes(o) || o.includes(h)));
        if (pega) { mapa[campo] = i; usadas.add(i); break; }
      }
    }
  }
  return mapa;
}

/* ---------- Normalización de filas ---------- */

/**
 * Convierte las filas crudas de la planilla en comprobantes normalizados,
 * usando el mapa de columnas y la configuración.
 */
function normalizarComprobantes(filas, mapa, config, tablas, columnasAlicuota) {
  const tasas = armarTasas(tablas.ALICUOTAS, tablas.ALICUOTAS_HABITUALES);
  const detalle = columnasAlicuota || [];
  const salida = [];

  const leer = (fila, campo) => (mapa[campo] == null ? null : fila[mapa[campo]] ?? null);

  filas.forEach((fila, i) => {
    if (!fila || fila.every((c) => c == null || String(c).trim() === '')) return;

    const problemas = [];
    const c = {
      indice: i,
      filaPlanilla: i + 2, // +1 por el encabezado, +1 porque las planillas cuentan desde 1
      problemas,
    };

    /* Fecha */
    c.fecha = aFechaArca(leer(fila, 'fecha'));
    if (!c.fecha) problemas.push({ campo: 'fecha', mensaje: 'Fecha ilegible o vacía.' });
    c.periodo = periodoDeFecha(c.fecha);

    /* Tipo de comprobante */
    const tipoBruto = leer(fila, 'tipo');
    c.tipoBruto = tipoBruto;
    c.tipo = tablas.resolverTipoComprobante(tipoBruto);
    if (!c.tipo) problemas.push({ campo: 'tipo', mensaje: `Tipo de comprobante no reconocido: "${tipoBruto ?? ''}".` });
    c.esNotaCredito = c.tipo ? tablas.esNotaDeCredito(c.tipo) : false;

    /* Punto de venta y número */
    c.puntoVenta = String(leer(fila, 'puntoVenta') ?? '').replace(/\D/g, '');
    if (!c.puntoVenta) problemas.push({ campo: 'puntoVenta', mensaje: 'Falta el punto de venta.' });
    else if (c.puntoVenta.length > 5) problemas.push({ campo: 'puntoVenta', mensaje: 'El punto de venta tiene más de 5 dígitos.' });

    c.numero = String(leer(fila, 'numero') ?? '').replace(/\D/g, '');
    if (!c.numero) problemas.push({ campo: 'numero', mensaje: 'Falta el número de comprobante.' });
    else if (c.numero.length > 20) problemas.push({ campo: 'numero', mensaje: 'El número tiene más de 20 dígitos.' });

    c.numeroHasta = String(leer(fila, 'numeroHasta') ?? '').replace(/\D/g, '') || c.numero;

    /* Contraparte */
    const docBruto = leer(fila, 'documentoNro');
    c.documentoNro = String(docBruto ?? '').replace(/\D/g, '');
    /* La planilla puede traer el código ("80") o el nombre ("CUIT"). */
    c.documentoTipo = tablas.resolverTipoDocumento(leer(fila, 'documentoTipo'));
    if (!c.documentoTipo) {
      c.documentoTipo = c.documentoNro.length === 11 ? '80' : config.documentoTipoPorDefecto;
    }
    if (!c.documentoNro) {
      problemas.push({ campo: 'documentoNro', mensaje: 'Falta el CUIT o documento de la contraparte.' });
    } else if (c.documentoTipo === '80' && !cuitValido(c.documentoNro)) {
      problemas.push({ campo: 'documentoNro', mensaje: `El CUIT ${c.documentoNro} no pasa el dígito verificador.` });
    }

    const denomBruta = String(leer(fila, 'denominacion') ?? '').trim();
    c.denominacion = denomBruta;
    c.denominacionTruncada = aAscii(denomBruta).replace(/\s+/g, ' ').trim().length > 30;
    if (!denomBruta) problemas.push({ campo: 'denominacion', mensaje: 'Falta la razón social.' });

    /* Importes */
    /* Con notas de crédito en positivo se informa el valor absoluto:
       el tipo 003 ya le indica a ARCA que el comprobante resta. */
    const enValorAbsoluto = c.esNotaCredito && config.notasCreditoEnPositivo;
    c.enValorAbsoluto = enValorAbsoluto;
    const tomar = (campo) => {
      const v = aCentavos(leer(fila, campo));
      if (v == null) return 0;
      return enValorAbsoluto ? Math.abs(v) : v;
    };

    c.neto = tomar('neto');
    c.iva = tomar('iva');
    c.total = tomar('total');
    c.noGravado = tomar('noGravado');
    c.exento = tomar('exento');
    c.percIva = tomar('percIva');
    c.percNacionales = tomar('percNacionales');
    c.percIibb = tomar('percIibb');
    c.percMunicipales = tomar('percMunicipales');
    c.impInternos = tomar('impInternos');
    c.otrosTributos = tomar('otrosTributos');

    /* Las alícuotas van acá porque el crédito computable y el total
       reconstruido dependen del neto y del IVA. */
    c.alicuotas = detalle.length
      ? leerAlicuotasDeclaradas(fila, detalle, c, enValorAbsoluto, mapa)
      : resolverAlicuotas(c.neto, c.iva, tasas);

    const creditoBruto = mapa.creditoComputable != null ? tomar('creditoComputable') : null;
    c.creditoComputable = creditoBruto != null && creditoBruto !== 0 ? creditoBruto : c.iva;

    c.moneda = String(leer(fila, 'moneda') ?? '').trim().toUpperCase() || config.monedaPorDefecto;
    c.tipoCambio = mapa.tipoCambio != null ? leer(fila, 'tipoCambio') : 1;
    c.despacho = String(leer(fila, 'despacho') ?? '').trim();
    c.fechaVencimiento = aFechaArca(leer(fila, 'fechaVencimiento'));
    c.codigoOperacion = ' ';

    /* Si no vino el total, se reconstruye desde las partes. */
    if (!c.total) {
      c.total = c.neto + c.iva + c.noGravado + c.exento + c.percIva + c.percNacionales +
        c.percIibb + c.percMunicipales + c.impInternos + c.otrosTributos;
      c.totalReconstruido = true;
    }

    /* Copia intacta de lo que trajo la planilla, para poder rehacer el cuadre. */
    c.otrosTributosOriginal = c.otrosTributos;

    fijarLineas(c, c.alicuotas.lineas);
    if (c.alicuotas.estado === 'sin_resolver') {
      problemas.push({ campo: 'alicuotas', mensaje: c.alicuotas.detalle });
    }

    salida.push(c);
  });

  return salida;
}

/* ---------- Cuadre de cada comprobante ---------- */

/**
 * Asigna las líneas de alícuota de un comprobante y guarda los netos sin
 * tocar. Hay que usar esto siempre que se reemplacen las líneas: el cuadre
 * necesita poder volver al punto de partida antes de recalcular.
 */
function fijarLineas(c, lineas) {
  c.lineas = lineas.map((l) => ({ ...l }));
  c.netosBase = c.lineas.map((l) => l.netoCentavos);
}

/** Suma de todo lo que ARCA espera que dé el importe total. */
function sumaPartes(c) {
  const neto = c.lineas.reduce((s, l) => s + l.netoCentavos, 0);
  const iva = c.lineas.reduce((s, l) => s + l.ivaCentavos, 0);
  return neto + iva + c.noGravado + c.exento + c.percIva + c.percNacionales +
    c.percIibb + c.percMunicipales + c.impInternos + c.otrosTributos;
}

/**
 * Ajusta las diferencias de redondeo del origen para que el total cierre.
 * Cada ajuste queda anotado: nada se corrige en silencio.
 */
function cuadrar(comprobantes, toleranciaCentavos = 5) {
  const ajustes = [];

  for (const c of comprobantes) {
    /* Se vuelve al punto de partida: así se puede recalcular las veces que
       haga falta sin que los ajustes se acumulen ni se pierdan del informe. */
    if (c.otrosTributosOriginal != null) c.otrosTributos = c.otrosTributosOriginal;
    if (c.netosBase) {
      c.lineas.forEach((l, i) => { if (c.netosBase[i] != null) l.netoCentavos = c.netosBase[i]; });
    }
    delete c.ajustado;
    c.problemas = c.problemas.filter((p) => p.campo !== 'total');

    c.diferencia = c.total - sumaPartes(c);
    if (c.diferencia === 0) continue;

    if (Math.abs(c.diferencia) > toleranciaCentavos) {
      c.problemas.push({
        campo: 'total',
        mensaje: `El total no cierra por ${pesos(c.diferencia)}. Revisá el comprobante.`,
      });
      continue;
    }

    /* Primero se intenta absorber en otros tributos; si no, en el neto mayor. */
    let destino = null;
    if (c.otrosTributos !== 0 && c.otrosTributos + c.diferencia >= 0) {
      c.otrosTributos += c.diferencia;
      destino = 'otros tributos';
    } else if (c.lineas.length) {
      const mayor = c.lineas.reduce((a, b) => (Math.abs(b.netoCentavos) > Math.abs(a.netoCentavos) ? b : a));
      mayor.netoCentavos += c.diferencia;
      destino = 'neto gravado';
    }

    if (destino) {
      ajustes.push({
        filaPlanilla: c.filaPlanilla,
        denominacion: c.denominacion,
        centavos: c.diferencia,
        destino,
      });
      c.ajustado = { centavos: c.diferencia, destino };
      c.diferencia = c.total - sumaPartes(c);
    }
  }

  return ajustes;
}

/* ---------- Armado de los registros ---------- */

const LARGOS = {
  comprasCabecera: 325,
  comprasAlicuotas: 84,
  ventasCabecera: 266,
  ventasAlicuotas: 62,
};

function registroComprasCabecera(c, config) {
  const linea =
    campoNumero(c.fecha, 8) +
    campoNumero(c.tipo, 3) +
    campoNumero(c.puntoVenta, 5) +
    campoNumero(c.numero, 20) +
    campoTexto(c.despacho, 16) +
    campoNumero(c.documentoTipo, 2) +
    campoNumero(c.documentoNro, 20) +
    campoTexto(c.denominacion, 30) +
    campoImporte(c.total) +
    campoImporte(c.noGravado) +
    campoImporte(c.exento) +
    campoImporte(c.percIva) +
    campoImporte(c.percNacionales) +
    campoImporte(c.percIibb) +
    campoImporte(c.percMunicipales) +
    campoImporte(c.impInternos) +
    campoTexto(c.moneda, 3) +
    campoTipoCambio(c.tipoCambio) +
    campoCantidadAlicuotas(c.lineas.length) +
    (c.codigoOperacion || ' ') +
    campoImporte(c.creditoComputable) +
    campoImporte(c.otrosTributos) +
    campoNumero(config.cuitCorredor || '', 11) +
    campoTexto(config.denominacionCorredor || '', 30) +
    campoImporte(config.ivaComision || 0);

  verificarLargo(linea, LARGOS.comprasCabecera, 'compras cabecera', c);
  return linea;
}

function registroComprasAlicuota(c, linea) {
  const r =
    campoNumero(c.tipo, 3) +
    campoNumero(c.puntoVenta, 5) +
    campoNumero(c.numero, 20) +
    campoNumero(c.documentoTipo, 2) +
    campoNumero(c.documentoNro, 20) +
    campoImporte(linea.netoCentavos) +
    campoNumero(linea.codigo, 4) +
    campoImporte(linea.ivaCentavos);

  verificarLargo(r, LARGOS.comprasAlicuotas, 'compras alícuotas', c);
  return r;
}

function registroVentasCabecera(c) {
  const linea =
    campoNumero(c.fecha, 8) +
    campoNumero(c.tipo, 3) +
    campoNumero(c.puntoVenta, 5) +
    campoNumero(c.numero, 20) +
    campoNumero(c.numeroHasta || c.numero, 20) +
    campoNumero(c.documentoTipo, 2) +
    campoNumero(c.documentoNro, 20) +
    campoTexto(c.denominacion, 30) +
    campoImporte(c.total) +
    campoImporte(c.noGravado) +
    campoImporte(c.percNoCategorizados || 0) +
    campoImporte(c.exento) +
    campoImporte(c.percNacionales) +
    campoImporte(c.percIibb) +
    campoImporte(c.percMunicipales) +
    campoImporte(c.impInternos) +
    campoTexto(c.moneda, 3) +
    campoTipoCambio(c.tipoCambio) +
    campoCantidadAlicuotas(c.lineas.length) +
    (c.codigoOperacion || ' ') +
    campoImporte(c.otrosTributos) +
    campoNumero(c.fechaVencimiento || '', 8);

  verificarLargo(linea, LARGOS.ventasCabecera, 'ventas cabecera', c);
  return linea;
}

function registroVentasAlicuota(c, linea) {
  const r =
    campoNumero(c.tipo, 3) +
    campoNumero(c.puntoVenta, 5) +
    campoNumero(c.numero, 20) +
    campoImporte(linea.netoCentavos) +
    campoNumero(linea.codigo, 4) +
    campoImporte(linea.ivaCentavos);

  verificarLargo(r, LARGOS.ventasAlicuotas, 'ventas alícuotas', c);
  return r;
}

function verificarLargo(linea, esperado, cual, c) {
  if (linea.length !== esperado) {
    throw new Error(
      `El registro de ${cual} quedó en ${linea.length} posiciones y tiene que tener ${esperado}. ` +
      `Fila ${c.filaPlanilla} de la planilla.`
    );
  }
}

/* ---------- Generación ---------- */

/**
 * Genera los dos archivos de un período.
 * Devuelve { cabecera, alicuotas, comprobantes, control }.
 */
function generar(comprobantes, libro, config) {
  const cabeceras = [];
  const alicuotas = [];

  const esCompras = libro === 'compras';
  for (const c of comprobantes) {
    cabeceras.push(esCompras ? registroComprasCabecera(c, config) : registroVentasCabecera(c));
    for (const l of c.lineas) {
      alicuotas.push(esCompras ? registroComprasAlicuota(c, l) : registroVentasAlicuota(c, l));
    }
  }

  return {
    cabecera: cabeceras.join('\r\n') + (cabeceras.length ? '\r\n' : ''),
    alicuotas: alicuotas.join('\r\n') + (alicuotas.length ? '\r\n' : ''),
    filasCabecera: cabeceras.length,
    filasAlicuotas: alicuotas.length,
    control: totalesDeControl(comprobantes),
  };
}

/**
 * Totales para verificar contra la planilla de origen.
 * "planilla" es lo que trajo el Excel; "archivo" es lo que se escribió en el TXT.
 */
function totalesDeControl(comprobantes) {
  const cero = () => ({
    comprobantes: 0, neto: 0, iva: 0, noGravado: 0, exento: 0,
    percepciones: 0, impInternos: 0, otrosTributos: 0, total: 0,
  });

  const planilla = cero();
  const archivo = cero();

  for (const c of comprobantes) {
    const percepciones = c.percIva + c.percNacionales + c.percIibb + c.percMunicipales;

    planilla.comprobantes++;
    planilla.neto += c.neto;
    planilla.iva += c.iva;
    planilla.noGravado += c.noGravado;
    planilla.exento += c.exento;
    planilla.percepciones += percepciones;
    planilla.impInternos += c.impInternos;
    planilla.otrosTributos += c.otrosTributosOriginal != null ? c.otrosTributosOriginal : c.otrosTributos;
    planilla.total += c.total;

    archivo.comprobantes++;
    archivo.neto += c.lineas.reduce((s, l) => s + l.netoCentavos, 0);
    archivo.iva += c.lineas.reduce((s, l) => s + l.ivaCentavos, 0);
    archivo.noGravado += c.noGravado;
    archivo.exento += c.exento;
    archivo.percepciones += percepciones;
    archivo.impInternos += c.impInternos;
    archivo.otrosTributos += c.otrosTributos;
    archivo.total += c.total;
  }

  const diferencia = {};
  for (const k of Object.keys(planilla)) diferencia[k] = archivo[k] - planilla[k];

  /* El archivo cierra si la suma de partes da el total informado. */
  archivo.sumaPartes = archivo.neto + archivo.iva + archivo.noGravado + archivo.exento +
    archivo.percepciones + archivo.impInternos + archivo.otrosTributos;
  archivo.descuadre = archivo.sumaPartes - archivo.total;

  return { planilla, archivo, diferencia };
}

/* ---------- Nombres de archivo ---------- */

function nombreArchivo(libro, cual, periodo, cuit) {
  const per = (periodo || '').replace('-', '');
  const base = libro === 'compras'
    ? (cual === 'cabecera' ? 'LIBRO_IVA_DIGITAL_COMPRAS_CBTE' : 'LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS')
    : (cual === 'cabecera' ? 'LIBRO_IVA_DIGITAL_VENTAS_CBTE' : 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS');
  return [base, cuit || '', per].filter(Boolean).join('_') + '.txt';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    aCentavos, pesos, aFechaArca, periodoDeFecha, cuitValido, aAscii,
    campoTexto, campoNumero, campoImporte, campoTipoCambio, campoCantidadAlicuotas,
    resolverAlicuotas, armarTasas, detectarColumnas, detectarAlicuotas,
    indicesDeAlicuotas, leerAlicuotasDeclaradas, normalizarEncabezado,
    normalizarComprobantes, cuadrar, sumaPartes, fijarLineas, generar, totalesDeControl,
    nombreArchivo, LARGOS, SINONIMOS,
  };
}
