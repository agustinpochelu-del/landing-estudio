/**
 * Pruebas del importador. Se abren en pruebas.html.
 *
 * Hay dos partes: verificaciones de las funciones sueltas, y una corrida
 * completa sobre el Excel real para que los totales se puedan comparar
 * contra la planilla de origen.
 */

const resultados = [];
let corriendo = '';

function suite(nombre) { corriendo = nombre; }

function verificar(descripcion, condicion, detalle) {
  resultados.push({ suite: corriendo, descripcion, ok: !!condicion, detalle: detalle || '' });
}

function igual(descripcion, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  verificar(descripcion, ok, ok ? '' : `esperaba ${JSON.stringify(esperado)}, obtuvo ${JSON.stringify(obtenido)}`);
}

/* ---------- Importes ---------- */

suite('Lectura de importes');
igual('número común', aCentavos(1234.56), 123456);
igual('formato argentino', aCentavos('1.234,56'), 123456);
igual('formato inglés', aCentavos('1,234.56'), 123456);
igual('con símbolo de peso', aCentavos('$ 1.234,56'), 123456);
igual('negativo', aCentavos('-149550'), -14955000);
igual('entre paréntesis', aCentavos('(1.234,56)'), -123456);
igual('miles sin decimales', aCentavos('1.234.567'), 123456700);
igual('vacío', aCentavos(''), null);
igual('cero', aCentavos(0), 0);
igual('el redondeo no arrastra error', aCentavos(0.1 + 0.2), 30);

suite('Escritura de importes');
igual('formato de pantalla', pesos(123456), '1.234,56');
igual('negativo en pantalla', pesos(-14955000), '-149.550,00');
igual('centavos solos', pesos(5), '0,05');

/* ---------- Fechas ---------- */

suite('Fechas');
igual('objeto Date', aFechaArca(new Date(Date.UTC(2025, 5, 1))), '20250601');
igual('ISO', aFechaArca('2025-06-01'), '20250601');
igual('barra argentina', aFechaArca('01/06/2025'), '20250601');
igual('ya en formato ARCA', aFechaArca('20250601'), '20250601');
igual('serial de Excel', aFechaArca(45809), '20250601');
igual('fecha imposible', aFechaArca('31/02/2025'), null);
igual('basura', aFechaArca('no es fecha'), null);
igual('período', periodoDeFecha('20250601'), '2025-06');

/* ---------- CUIT ---------- */

suite('CUIT');
verificar('CUIT real válido', cuitValido('30711291519'));
verificar('otro CUIT real', cuitValido('30546741253'));
verificar('dígito verificador cambiado', !cuitValido('30711291518'));
verificar('menos de 11 dígitos', !cuitValido('3071129151'));
verificar('vacío', !cuitValido(''));

/* ---------- Campos de ancho fijo ---------- */

suite('Campos de ancho fijo');
igual('texto rellena a la derecha', campoTexto('HOLA', 8), 'HOLA    ');
igual('texto se recorta', campoTexto('OSDE ORGANIZACION DE SERVICIOS DIRECTOS', 30), 'OSDE ORGANIZACION DE SERVICIOS');
igual('texto sin acentos', campoTexto('MUÑOZ SÁNCHEZ', 15), 'MUNOZ SANCHEZ  ');
igual('número rellena con ceros', campoNumero('345', 20), '00000000000000000345');
igual('número ignora separadores', campoNumero('30-71129151-9', 11), '30711291519');
igual('importe', campoImporte(4250000), '000000004250000');
igual('importe cero', campoImporte(0), '000000000000000');
igual('importe negativo va en valor absoluto', campoImporte(-14955000), '000000014955000');
igual('tipo de cambio uno', campoTipoCambio(1), '0001000000');
igual('tipo de cambio con decimales', campoTipoCambio(1234.5), '1234500000');
igual('cantidad de alícuotas', campoCantidadAlicuotas(2), '2');

verificar('un texto demasiado largo se recorta, no explota', campoTexto('X'.repeat(50), 30).length === 30);
try { campoImporte(999999999999999999); verificar('un importe fuera de rango avisa', false); }
catch (e) { verificar('un importe fuera de rango avisa', true); }

/* ---------- Tipos de comprobante ---------- */

suite('Tipos de comprobante');
igual('formato de Mis Comprobantes', resolverTipoComprobante('1 - Factura A'), '001');
igual('nota de débito', resolverTipoComprobante('2 - Nota de Débito A'), '002');
igual('nota de crédito', resolverTipoComprobante('3 - Nota de Crédito A'), '003');
igual('código directo', resolverTipoComprobante('001'), '001');
igual('número suelto', resolverTipoComprobante(6), '006');
igual('solo texto', resolverTipoComprobante('FACTURAS B'), '006');
igual('texto sin acentos', resolverTipoComprobante('Nota de Credito B'), '008');
igual('desconocido', resolverTipoComprobante('Remito X'), null);
verificar('003 es nota de crédito', esNotaDeCredito('003'));
verificar('001 no es nota de crédito', !esNotaDeCredito('001'));

/* ---------- Alícuotas ---------- */

const TASAS = armarTasas(ALICUOTAS, ALICUOTAS_HABITUALES);

suite('Resolución de alícuotas');
{
  const r = resolverAlicuotas(3512397, 737603, TASAS);
  igual('21% exacto: estado', r.estado, 'exacta');
  igual('21% exacto: una línea al 0005', r.lineas.map((l) => l.codigo), ['0005']);
  igual('21% exacto: el IVA no se toca', r.lineas[0].ivaCentavos, 737603);
}
{
  const r = resolverAlicuotas(848135, 89054, TASAS);
  igual('10,5% exacto', [r.estado, r.lineas[0].codigo], ['exacta', '0004']);
}
{
  /* AMX: 25,55% efectivo, solo puede ser 21 + 27 */
  const r = resolverAlicuotas(7567500, 1933201, TASAS);
  igual('mixta 21+27: estado', r.estado, 'sugerida');
  igual('mixta 21+27: códigos', r.lineas.map((l) => l.codigo).sort(), ['0005', '0006']);
  igual('mixta 21+27: los netos suman el neto total',
    r.lineas.reduce((s, l) => s + l.netoCentavos, 0), 7567500);
  igual('mixta 21+27: los IVA suman el IVA total',
    r.lineas.reduce((s, l) => s + l.ivaCentavos, 0), 1933201);
}
{
  const r = resolverAlicuotas(0, 0, TASAS);
  igual('sin gravado', [r.estado, r.lineas.length], ['sin_gravado', 0]);
}
{
  const r = resolverAlicuotas(100000, 99999, TASAS);
  igual('IVA imposible', r.estado, 'sin_resolver');
}
{
  /* Toda descomposición tiene que conservar neto e IVA, siempre. */
  let conserva = true;
  for (let neto = 100000; neto < 20000000; neto += 137771) {
    for (const iva of [Math.round(neto * 0.21), Math.round(neto * 0.105), Math.round(neto * 0.2555)]) {
      const r = resolverAlicuotas(neto, iva, TASAS);
      if (r.estado === 'sin_resolver' || r.estado === 'sin_gravado') continue;
      const sn = r.lineas.reduce((s, l) => s + l.netoCentavos, 0);
      const si = r.lineas.reduce((s, l) => s + l.ivaCentavos, 0);
      if (sn !== neto || si !== iva) { conserva = false; break; }
    }
  }
  verificar('en 435 casos generados, neto e IVA siempre se conservan', conserva);
}

/* ---------- Detección de columnas ---------- */

suite('Detección de columnas');
{
  const m = detectarColumnas(['Fecha', 'Tipo', 'Pto Vta', 'Número', 'CUIT',
    'Denominación Emisor', 'Neto Gravado Total', 'Otros Tributos', 'Total IVA', 'Imp. Total']);
  igual('fecha', m.fecha, 0);
  igual('tipo', m.tipo, 1);
  igual('punto de venta', m.puntoVenta, 2);
  igual('número', m.numero, 3);
  igual('CUIT', m.documentoNro, 4);
  igual('denominación', m.denominacion, 5);
  igual('neto', m.neto, 6);
  igual('otros tributos', m.otrosTributos, 7);
  igual('IVA', m.iva, 8);
  igual('total', m.total, 9);
}

/* ---------- Perfiles de origen ---------- */

suite('Perfiles de origen');
{
  const misComprobantes = ['Fecha', 'Tipo', 'Punto de Venta', 'Número', 'CUIT',
    'Denominación Emisor', 'Tipo Doc. Receptor', 'Neto Gravado Total',
    'Otros Tributos', 'Total IVA', 'Imp. Total'];

  const hallazgo = detectarPerfil(misComprobantes, normalizarEncabezado);
  igual('reconoce Mis Comprobantes', hallazgo.perfil.id, 'mis-comprobantes');
  verificar('encontró más de una señal', hallazgo.puntaje >= 2,
    'señales: ' + hallazgo.senalesEncontradas.join(', '));

  const cualquiera = detectarPerfil(['columna a', 'columna b'], normalizarEncabezado);
  igual('sin señales cae en el genérico', cualquiera.perfil.id, 'generico');
  igual('y con puntaje cero', cualquiera.puntaje, 0);

  igual('perfilPorId encuentra el que existe', perfilPorId('mis-comprobantes').id, 'mis-comprobantes');
  igual('perfilPorId con un id inventado cae en el genérico', perfilPorId('tango-2030').id, 'generico');

  /* El genérico no puede aportar sinónimos: si aportara, ensuciaría todo. */
  igual('el genérico no aporta sinónimos', Object.keys(perfilPorId('generico').sinonimos).length, 0);

  /* Ningún perfil puede declarar un id repetido. */
  const ids = PERFILES.map((p) => p.id);
  igual('los id de perfil son únicos', ids.length, new Set(ids).size);
  verificar('todos los perfiles tienen nombre y notas',
    PERFILES.every((p) => p.nombre && p.notas));
}

suite('Vocabulario propio del perfil');
{
  /* Un origen imaginario que llama "FA" a la factura A y "DOC" al CUIT.
     Sirve para verificar el mecanismo, no describe a ningún sistema real. */
  const alias = { FA: '001', 'NC A': '003' };

  igual('el alias del perfil resuelve', resolverTipoComprobante('FA', alias), '001');
  igual('sin alias no resuelve', resolverTipoComprobante('FA'), null);
  igual('el alias tiene prioridad sobre la tabla general',
    resolverTipoComprobante('Nota de Credito A', { 'NOTA DE CREDITO A': '013' }), '013');
  igual('lo que el alias no cubre sigue funcionando',
    resolverTipoComprobante('1 - Factura A', alias), '001');

  igual('alias de documento', resolverTipoDocumento('RUT', { RUT: '80' }), '80');
  igual('sin alias, RUT no existe', resolverTipoDocumento('RUT'), null);
  igual('el código numérico sigue mandando', resolverTipoDocumento('96', { '96': '80' }), '96');
}

suite('Sinónimos del perfil en la detección de columnas');
{
  const encabezados = ['Fecha', 'Tipo', 'PV', 'Nro', 'CUIT', 'Razon Social',
    'Neto', 'IVA', 'Total'];

  /* Sin perfil, "Razon Social" ya lo toma el sinónimo general. */
  const base = detectarColumnas(encabezados, null);
  igual('la detección general encuentra la razón social', base.denominacion, 5);

  /* Un perfil puede redirigir un encabezado a otro campo. */
  const conPerfil = detectarColumnas(encabezados, null, { despacho: ['razon social'] });
  igual('el sinónimo del perfil gana', conPerfil.despacho, 5);
  verificar('y la denominación se va a otra columna o queda sin asignar',
    conPerfil.denominacion !== 5);

  /* Los sinónimos del perfil no rompen lo que ya funcionaba. */
  igual('el resto se sigue detectando igual', conPerfil.total, 8);
}

/* ---------- Nombres de archivo ---------- */

suite('Nombres de archivo');
igual('compras, cabecera, con período y CUIT',
  nombreArchivo('compras', 'cabecera', '2025-06', '30711291519'),
  'LIBRO_IVA_DIGITAL_COMPRAS_CBTE_30711291519_202506.txt');
igual('compras, alícuotas',
  nombreArchivo('compras', 'alicuotas', '2025-06', '30711291519'),
  'LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_30711291519_202506.txt');
igual('imputado a un período distinto al de los comprobantes',
  nombreArchivo('compras', 'cabecera', '2026-01', '30711291519'),
  'LIBRO_IVA_DIGITAL_COMPRAS_CBTE_30711291519_202601.txt');
igual('sin período queda solo el CUIT',
  nombreArchivo('compras', 'cabecera', null, '30711291519'),
  'LIBRO_IVA_DIGITAL_COMPRAS_CBTE_30711291519.txt');
igual('sin CUIT ni período',
  nombreArchivo('compras', 'cabecera', null, ''),
  'LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt');
igual('ventas usa su propio nombre',
  nombreArchivo('ventas', 'cabecera', '2025-06', ''),
  'LIBRO_IVA_DIGITAL_VENTAS_CBTE_202506.txt');

/* ---------- Configuración común a las corridas ---------- */

const CONFIG = {
  documentoTipoPorDefecto: '80',
  monedaPorDefecto: 'PES',
  notasCreditoEnPositivo: true,
  cuitCorredor: '',
  denominacionCorredor: '',
  ivaComision: 0,
};

const TABLAS = {
  ALICUOTAS, ALICUOTAS_HABITUALES, alicuotaPorTasa,
  resolverTipoComprobante, esNotaDeCredito, resolverTipoDocumento,
};

/* ---------- Tipo de documento ---------- */

suite('Tipo de documento');
igual('por nombre', resolverTipoDocumento('CUIT'), '80');
igual('en minúscula', resolverTipoDocumento('cuit'), '80');
igual('con puntos', resolverTipoDocumento('C.U.I.T.'), '80');
igual('DNI', resolverTipoDocumento('DNI'), '96');
igual('CUIL', resolverTipoDocumento('CUIL'), '86');
igual('por código', resolverTipoDocumento('80'), '80');
igual('por número', resolverTipoDocumento(96), '96');
igual('desconocido', resolverTipoDocumento('Carnet del club'), null);
igual('vacío', resolverTipoDocumento(''), null);

/* ---------- Detección del detalle por alícuota ---------- */

suite('Detección del detalle por alícuota');
{
  const encabezados = ['Fecha', 'Tipo', 'Punto de Venta', 'Número', 'CUIT', 'Denominación Emisor',
    'Tipo Doc. Receptor', 'IVA 10,5%', 'Neto Grav. IVA 10,5%', 'IVA 21%', 'Neto Grav. IVA 21%',
    'IVA 27%', 'Neto Grav. IVA 27%', 'Neto Gravado Total', 'Otros Tributos', 'Total IVA', 'Imp. Total'];

  const det = detectarAlicuotas(encabezados, TABLAS);
  igual('encuentra tres alícuotas', det.length, 3);
  igual('vienen ordenadas por tasa', det.map((d) => d.codigo), ['0004', '0005', '0006']);
  igual('10,5%: columna del IVA', det[0].colIva, 7);
  igual('10,5%: columna del neto', det[0].colNeto, 8);
  igual('21%: columna del IVA', det[1].colIva, 9);
  igual('21%: columna del neto', det[1].colNeto, 10);
  igual('27%: columna del IVA', det[2].colIva, 11);
  igual('27%: columna del neto', det[2].colNeto, 12);

  /* "Total IVA" no tiene porcentaje: no es una columna de alícuota. */
  const mapa = detectarColumnas(encabezados, indicesDeAlicuotas(det));
  igual('Total IVA queda como el IVA del comprobante', mapa.iva, 15);
  igual('Neto Gravado Total queda como el neto', mapa.neto, 13);
  igual('Imp. Total queda como el total', mapa.total, 16);
  igual('detecta el tipo de documento', mapa.documentoTipo, 6);
  igual('el CUIT no se confunde con el tipo de documento', mapa.documentoNro, 4);

  /* Un par incompleto no se toma. */
  igual('una columna suelta de IVA no alcanza',
    detectarAlicuotas(['Fecha', 'IVA 21%'], TABLAS).length, 0);
  igual('con las dos columnas sí',
    detectarAlicuotas(['Fecha', 'IVA 21%', 'Neto IVA 21%'], TABLAS).length, 1);
  igual('una alícuota que no está en la tabla se ignora',
    detectarAlicuotas(['IVA 13%', 'Neto IVA 13%'], TABLAS).length, 0);
}

/* ---------- Ventas, con datos armados a mano ---------- */

suite('Libro de ventas');
{
  const encabezados = ['Fecha', 'Tipo', 'Pto Vta', 'Número', 'CUIT', 'Denominación Receptor',
    'Neto Gravado', 'Total IVA', 'Imp. Total', 'Op. Exentas', 'Perc IIBB'];
  const filas = [
    ['2025-06-05', '1 - Factura A', 4, 128, '30546741253', 'OSDE ORGANIZACION DE SERVICIOS', 100000, 21000, 124500, 0, 3500],
    ['2025-06-20', '6 - Factura B', 4, 129, '20258064519', 'SUAREZ NICOLAS MARCELO', 50000, 5250, 55250, 0, 0],
    ['2025-06-28', '3 - Nota de Crédito A', 4, 12, '30546741253', 'OSDE ORGANIZACION DE SERVICIOS', -10000, -2100, -12100, 0, 0],
  ];

  const mapa = detectarColumnas(encabezados);
  igual('detecta el receptor como denominación', mapa.denominacion, 5);
  igual('detecta la percepción de IIBB', mapa.percIibb, 10);

  const cbtes = normalizarComprobantes(filas, mapa, CONFIG, TABLAS);
  cuadrar(cbtes);
  igual('los tres comprobantes se leen', cbtes.length, 3);
  igual('ninguno tiene problemas', cbtes.flatMap((c) => c.problemas).length, 0);

  const salida = generar(cbtes, 'ventas', CONFIG);
  const cab = salida.cabecera.split('\r\n').filter(Boolean);
  const ali = salida.alicuotas.split('\r\n').filter(Boolean);

  igual('tres cabeceras', cab.length, 3);
  igual('tres líneas de alícuota', ali.length, 3);
  verificar('las cabeceras de ventas tienen 266 posiciones', cab.every((l) => l.length === 266));
  verificar('las alícuotas de ventas tienen 62 posiciones', ali.every((l) => l.length === 62));

  const corte = (l, d, h) => l.substring(d - 1, h);
  igual('ventas, campo 1 fecha', corte(cab[0], 1, 8), '20250605');
  igual('ventas, campo 2 tipo', corte(cab[0], 9, 11), '001');
  igual('ventas, campo 3 punto de venta', corte(cab[0], 12, 16), '00004');
  igual('ventas, campo 4 número', corte(cab[0], 17, 36), '00000000000000000128');
  igual('ventas, campo 5 número hasta', corte(cab[0], 37, 56), '00000000000000000128');
  igual('ventas, campo 6 código de documento', corte(cab[0], 57, 58), '80');
  igual('ventas, campo 7 documento', corte(cab[0], 59, 78), '00000000030546741253');
  igual('ventas, campo 8 denominación', corte(cab[0], 79, 108), 'OSDE ORGANIZACION DE SERVICIOS');
  igual('ventas, campo 9 importe total', corte(cab[0], 109, 123), '000000012450000');
  igual('ventas, campo 12 exentas', corte(cab[0], 154, 168), '0'.repeat(15));
  igual('ventas, campo 14 percepción IIBB', corte(cab[0], 184, 198), '000000000350000');
  igual('ventas, campo 17 moneda', corte(cab[0], 229, 231), 'PES');
  igual('ventas, campo 19 cantidad de alícuotas', corte(cab[0], 242, 242), '1');
  igual('ventas, campo 20 código de operación', corte(cab[0], 243, 243), ' ');
  igual('ventas, campo 22 fecha de vencimiento', corte(cab[0], 259, 266), '00000000');

  igual('ventas alícuotas, campo 1 tipo', corte(ali[0], 1, 3), '001');
  igual('ventas alícuotas, campo 3 número', corte(ali[0], 9, 28), '00000000000000000128');
  igual('ventas alícuotas, campo 4 neto', corte(ali[0], 29, 43), '000000010000000');
  igual('ventas alícuotas, campo 5 alícuota', corte(ali[0], 44, 47), '0005');
  igual('ventas alícuotas, campo 6 impuesto', corte(ali[0], 48, 62), '000000002100000');

  igual('la factura B queda al 10,5%', corte(ali[1], 44, 47), '0004');
  igual('la nota de crédito va en positivo', corte(cab[2], 109, 123), '000000001210000');
  igual('la nota de crédito lleva tipo 003', corte(cab[2], 9, 11), '003');

  const ctrl = salida.control;
  igual('ventas: la suma de las partes da el total', ctrl.archivo.descuadre, 0);
  igual('ventas: el total es 124.500 + 55.250 + 12.100', ctrl.archivo.total, 19185000);
}

/* ---------- Corrida completa sobre el Excel real ---------- */

/** Prepara una hoja del Excel real: perfil, encabezados, mapa y comprobantes. */
function prepararHoja(libroExcel, nombre) {
  const hoja = libroExcel.hojas.find((h) => h.nombre === nombre);
  if (!hoja) throw new Error(`La planilla no tiene la hoja «${nombre}».`);

  const filas = hoja.filas;
  const encabezados = filas[0].map((c) => String(c ?? ''));
  const perfil = detectarPerfil(encabezados, normalizarEncabezado).perfil;
  const config = { ...CONFIG, perfil };
  const columnasAlicuota = detectarAlicuotas(encabezados, TABLAS);
  const mapa = detectarColumnas(
    encabezados, indicesDeAlicuotas(columnasAlicuota), perfil.sinonimos
  );
  const comprobantes = normalizarComprobantes(filas.slice(1), mapa, config, TABLAS, columnasAlicuota);
  const ajustes = cuadrar(comprobantes);
  return { encabezados, perfil, mapa, columnasAlicuota, comprobantes, ajustes };
}

/* Se levanta cuando la planilla de prueba no está en la carpeta. No es una
   falla del importador: la planilla tiene datos reales de clientes y por eso
   no se publica junto con la aplicación. */
class SinPlanilla extends Error {}

async function corridaReal() {
  let respuesta;
  try {
    respuesta = await fetch('Facturas de compras.xlsx');
  } catch {
    throw new SinPlanilla();
  }
  if (!respuesta.ok) throw new SinPlanilla();
  const libroExcel = await leerXlsx(await respuesta.arrayBuffer());

  igual('la planilla tiene las dos hojas',
    libroExcel.hojas.map((h) => h.nombre), ['Hoja1', 'comprobantes']);

  const conDetalle = prepararHoja(libroExcel, 'comprobantes');
  const { comprobantes, ajustes } = conDetalle;

  suite('Corrida sobre el Excel real');
  igual('se reconoce el origen', conDetalle.perfil.id, 'mis-comprobantes');
  igual('se leyeron los 128 comprobantes', comprobantes.length, 128);
  igual('se detectaron las tres alícuotas', conDetalle.columnasAlicuota.length, 3);

  const conProblemas = comprobantes.filter((c) => c.problemas.length);
  verificar('ningún comprobante tiene errores bloqueantes', conProblemas.length === 0,
    conProblemas.slice(0, 5).map((c) => `fila ${c.filaPlanilla}: ${c.problemas[0].mensaje}`).join(' | '));

  const porEstado = {};
  for (const c of comprobantes) porEstado[c.alicuotas.estado] = (porEstado[c.alicuotas.estado] || 0) + 1;
  igual('los 128 salen del detalle de la planilla', porEstado.declarada, 128);
  igual('ninguno queda por deducir', porEstado.sugerida, undefined);

  igual('118 con una alícuota', comprobantes.filter((c) => c.lineas.length === 1).length, 118);
  igual('10 con dos alícuotas', comprobantes.filter((c) => c.lineas.length === 2).length, 10);

  /* El IVA de cada línea tiene que dar el neto por la tasa. */
  const malCalculadas = comprobantes.flatMap((c) => c.lineas
    .filter((l) => Math.abs(Math.round(l.netoCentavos * alicuotaPorCodigo(l.codigo).tasa) - l.ivaCentavos) > 1)
    .map((l) => `fila ${c.filaPlanilla} al ${alicuotaPorCodigo(l.codigo).etiqueta}`));
  verificar('en cada línea el IVA da neto por tasa', malCalculadas.length === 0,
    malCalculadas.slice(0, 5).join(' | '));

  /* El origen redondea cada importe por separado, así que 13 comprobantes
     traen diferencias de entre uno y cinco centavos contra su propio total. */
  igual('se ajustaron 13 diferencias de redondeo', ajustes.length, 13);
  verificar('ningún ajuste supera los 5 centavos',
    ajustes.every((a) => Math.abs(a.centavos) <= 5));
  igual('los ajustes suman lo mismo que la diferencia de neto del control',
    ajustes.filter((a) => a.destino === 'neto gravado').reduce((s, a) => s + a.centavos, 0), -9);

  const descuadrados = comprobantes.filter((c) => c.diferencia !== 0);
  verificar('todos los comprobantes cierran contra su importe total',
    descuadrados.length === 0,
    descuadrados.slice(0, 5).map((c) => `fila ${c.filaPlanilla}: ${pesos(c.diferencia)}`).join(' | '));

  /* Las notas de crédito tienen que haber quedado en positivo. */
  const notas = comprobantes.filter((c) => c.esNotaCredito);
  igual('hay 6 notas de crédito', notas.length, 6);
  verificar('las notas de crédito quedaron en positivo',
    notas.every((c) => c.total > 0 && c.lineas.every((l) => l.netoCentavos > 0)));

  /* Generación por período */
  const periodos = [...new Set(comprobantes.map((c) => c.periodo))].sort();
  igual('siete períodos', periodos.length, 7);

  const resumen = [];
  let totalCabeceras = 0, totalAlicuotas = 0;
  const cabecerasSueltas = [];
  const alicuotasSueltas = [];

  for (const p of periodos) {
    const delPeriodo = comprobantes.filter((c) => c.periodo === p);
    const salida = generar(delPeriodo, 'compras', CONFIG);
    totalCabeceras += salida.filasCabecera;
    totalAlicuotas += salida.filasAlicuotas;

    const lineasCab = salida.cabecera.split('\r\n').filter(Boolean);
    const lineasAli = salida.alicuotas.split('\r\n').filter(Boolean);
    cabecerasSueltas.push(...lineasCab);
    alicuotasSueltas.push(...lineasAli);

    verificar(`${p}: cabeceras de 325 posiciones`,
      lineasCab.every((l) => l.length === 325));
    verificar(`${p}: alícuotas de 84 posiciones`,
      lineasAli.every((l) => l.length === 84));

    /* La cantidad declarada en la cabecera tiene que coincidir con las líneas. */
    let declaradas = 0;
    for (const l of lineasCab) declaradas += Number(l.substring(237, 238));
    verificar(`${p}: la cantidad de alícuotas declarada coincide con el archivo`,
      declaradas === lineasAli.length,
      `declaradas ${declaradas}, líneas ${lineasAli.length}`);

    const ctrl = salida.control;
    verificar(`${p}: la suma de las partes da el importe total`,
      ctrl.archivo.descuadre === 0, `descuadre ${pesos(ctrl.archivo.descuadre)}`);

    resumen.push({ periodo: p, comprobantes: delPeriodo.length, ctrl, ajustes });
  }

  igual('la suma de cabeceras de todos los períodos da 128', totalCabeceras, 128);
  igual('las líneas de alícuotas son 128 + 10 mixtas = 138', totalAlicuotas, 138);

  /* El archivo que junta todos los períodos convive con los de cada período:
     tiene que ser exactamente la unión de aquellos, sin perder ni duplicar. */
  const junto = generar(comprobantes, 'compras', CONFIG);
  const cabJunto = junto.cabecera.split('\r\n').filter(Boolean);
  const aliJunto = junto.alicuotas.split('\r\n').filter(Boolean);

  igual('el archivo con todo trae los 128 comprobantes', junto.filasCabecera, 128);
  igual('el archivo con todo trae las 138 líneas de alícuota', junto.filasAlicuotas, 138);
  igual('sus cabeceras son las mismas que las de los siete períodos',
    cabJunto.slice().sort(), cabecerasSueltas.slice().sort());
  igual('sus alícuotas son las mismas que las de los siete períodos',
    aliJunto.slice().sort(), alicuotasSueltas.slice().sort());
  igual('el total es el mismo que sumando los períodos por separado',
    junto.control.archivo.total,
    resumen.reduce((s, r) => s + r.ctrl.archivo.total, 0));
  igual('y cierra', junto.control.archivo.descuadre, 0);

  let declaradasJunto = 0;
  for (const l of cabJunto) declaradasJunto += Number(l.substring(237, 238));
  igual('la cantidad de alícuotas declarada coincide con el archivo',
    declaradasJunto, aliJunto.length);

  /* Imputar a otro período no toca la fecha de ningún comprobante. */
  const fechasEnArchivo = cabJunto.map((l) => l.substring(0, 8));
  verificar('las fechas del archivo son las de los comprobantes, no las del período',
    fechasEnArchivo.every((f, i) => f === comprobantes[i].fecha));
  verificar('ninguna fecha quedó reescrita a 2026',
    !fechasEnArchivo.some((f) => f.startsWith('2026')));

  verificarPosiciones(comprobantes);
  verificarRecalculo(comprobantes);
  const comparacion = compararHojas(libroExcel, conDetalle);

  return { comprobantes, ajustes, periodos, resumen, comparacion };
}

/**
 * Compara la hoja sin detalle (donde hay que deducir la descomposición)
 * contra la hoja con el detalle abierto. Sirve para saber cuánto le erraba
 * la deducción, que es lo que se usa cuando la planilla no trae el detalle.
 */
function compararHojas(libroExcel, conDetalle) {
  suite('Deducción contra detalle declarado');

  const deducido = prepararHoja(libroExcel, 'Hoja1');
  igual('la Hoja1 no trae detalle por alícuota', deducido.columnasAlicuota.length, 0);
  igual('tiene los mismos 128 comprobantes', deducido.comprobantes.length, 128);

  const clave = (c) => [c.tipo, c.puntoVenta, c.numero, c.documentoNro].join('|');
  const porClave = new Map(conDetalle.comprobantes.map((c) => [clave(c), c]));

  const diferencias = [];
  let iguales = 0;

  for (const d of deducido.comprobantes) {
    const real = porClave.get(clave(d));
    if (!real) continue;

    const arma = (c) => c.lineas
      .map((l) => `${l.codigo}:${l.netoCentavos}:${l.ivaCentavos}`)
      .sort().join(' ');

    if (arma(d) === arma(real)) { iguales++; continue; }

    diferencias.push({
      filaPlanilla: d.filaPlanilla,
      denominacion: d.denominacion,
      deducido: d.lineas.map((l) => ({ ...l })),
      real: real.lineas.map((l) => ({ ...l })),
      /* Cuánto se movió el neto de cada tramo entre una y otra. */
      desvio: Math.max(...real.lineas.map((l) => {
        const par = d.lineas.find((x) => x.codigo === l.codigo);
        return par ? Math.abs(par.netoCentavos - l.netoCentavos) : Math.abs(l.netoCentavos);
      })),
    });
  }

  /* 122 salen idénticos: los 118 de una alícuota más 4 de los 10 mixtos.
     Los 6 restantes difieren solo en cómo se reparte el redondeo. */
  igual('122 de 128 se deducen idénticos al detalle real', iguales, 122);
  igual('solo difieren 6 comprobantes', diferencias.length, 6);
  verificar('donde difiere, el desvío no pasa de 17 centavos',
    diferencias.every((x) => x.desvio <= 17),
    diferencias.map((x) => `fila ${x.filaPlanilla}: ${pesos(x.desvio)}`).join(' | '));

  const conCodigosDistintos = diferencias.filter((x) =>
    x.deducido.map((l) => l.codigo).sort().join() !== x.real.map((l) => l.codigo).sort().join());
  igual('la deducción acertó siempre qué alícuotas eran', conCodigosDistintos.length, 0);

  /* Los totales del comprobante no cambian: lo que se mueve es el reparto. */
  for (const x of diferencias) {
    const sumaD = x.deducido.reduce((s, l) => s + l.netoCentavos, 0);
    const sumaR = x.real.reduce((s, l) => s + l.netoCentavos, 0);
    if (sumaD !== sumaR) {
      verificar(`fila ${x.filaPlanilla}: el neto total coincide`, false, `${sumaD} contra ${sumaR}`);
    }
  }
  verificar('en los mixtos el neto total siempre coincide', true);

  return { diferencias, iguales };
}

/**
 * El cuadre se rehace cada vez que el usuario cambia una alícuota a mano.
 * Tiene que dar siempre lo mismo: ni acumular ajustes ni perderlos del informe.
 */
function verificarRecalculo(comprobantes) {
  suite('Recálculo del cuadre');

  const foto = () => ({
    ajustes: cuadrar(comprobantes).length,
    neto: comprobantes.reduce((s, c) => s + c.lineas.reduce((t, l) => t + l.netoCentavos, 0), 0),
    otros: comprobantes.reduce((s, c) => s + c.otrosTributos, 0),
    descuadrados: comprobantes.filter((c) => c.diferencia !== 0).length,
  });

  const primera = foto();
  const segunda = foto();
  const tercera = foto();

  igual('cuadrar dos veces da lo mismo', segunda, primera);
  igual('cuadrar tres veces da lo mismo', tercera, primera);
  igual('siguen siendo 13 ajustes después de recalcular', tercera.ajustes, 13);
  igual('ningún comprobante queda descuadrado', tercera.descuadrados, 0);

  /* Ahora se simula lo que hace el usuario: reemplazar la descomposición a
     mano. Se invierten las dos líneas de un mixto, que conserva los totales. */
  const mixto = comprobantes.find((c) => c.lineas.length === 2);
  const original = mixto.lineas.map((l) => ({ ...l }));
  fijarLineas(mixto, original.slice().reverse());
  const despues = foto();

  igual('editar a mano no cambia la cantidad de ajustes', despues.ajustes, 13);
  igual('editar a mano no descuadra nada', despues.descuadrados, 0);
  igual('el neto total no se mueve', despues.neto, primera.neto);

  /* Se vuelve a dejar como estaba para no ensuciar el control de importes. */
  fijarLineas(mixto, original);
  cuadrar(comprobantes);
}

/**
 * Decodifica el primer registro campo por campo y lo compara con lo que
 * dice el diseño de ARCA. Contar posiciones a ojo no sirve.
 */
function verificarPosiciones(comprobantes) {
  suite('Posiciones de los campos');

  /* SEGELEC, primera fila del Excel: 01/06/2025, Factura A 00003-00074425,
     CUIT 30711291519, neto 35.123,97, IVA 7.376,03, total 42.500,00 */
  const c = comprobantes[0];
  const cab = registroComprasCabeceraDePrueba(c);
  const ali = registroComprasAlicuotaDePrueba(c, c.lineas[0]);

  /* corte(linea, desde, hasta) con las posiciones tal cual las numera ARCA. */
  const corte = (linea, desde, hasta) => linea.substring(desde - 1, hasta);

  const campos = [
    ['1  fecha', corte(cab, 1, 8), '20250601'],
    ['2  tipo de comprobante', corte(cab, 9, 11), '001'],
    ['3  punto de venta', corte(cab, 12, 16), '00003'],
    ['4  número', corte(cab, 17, 36), '00000000000000074425'],
    ['5  despacho de importación', corte(cab, 37, 52), ' '.repeat(16)],
    ['6  código de documento', corte(cab, 53, 54), '80'],
    ['7  CUIT del vendedor', corte(cab, 55, 74), '00000000030711291519'],
    ['8  razón social', corte(cab, 75, 104), 'SEGELEC S.R.L.'.padEnd(30, ' ')],
    ['9  importe total', corte(cab, 105, 119), '000000004250000'],
    ['10 no gravado', corte(cab, 120, 134), '0'.repeat(15)],
    ['11 exentas', corte(cab, 135, 149), '0'.repeat(15)],
    ['12 percepción IVA', corte(cab, 150, 164), '0'.repeat(15)],
    ['13 percepción nacionales', corte(cab, 165, 179), '0'.repeat(15)],
    ['14 percepción IIBB', corte(cab, 180, 194), '0'.repeat(15)],
    ['15 percepción municipales', corte(cab, 195, 209), '0'.repeat(15)],
    ['16 impuestos internos', corte(cab, 210, 224), '0'.repeat(15)],
    ['17 moneda', corte(cab, 225, 227), 'PES'],
    ['18 tipo de cambio', corte(cab, 228, 237), '0001000000'],
    ['19 cantidad de alícuotas', corte(cab, 238, 238), '1'],
    ['20 código de operación', corte(cab, 239, 239), ' '],
    ['21 crédito fiscal computable', corte(cab, 240, 254), '000000000737603'],
    ['22 otros tributos', corte(cab, 255, 269), '0'.repeat(15)],
    ['23 CUIT del corredor', corte(cab, 270, 280), '0'.repeat(11)],
    ['24 denominación del corredor', corte(cab, 281, 310), ' '.repeat(30)],
    ['25 IVA comisión', corte(cab, 311, 325), '0'.repeat(15)],
  ];
  for (const [nombre, obtenido, esperado] of campos) {
    igual('cabecera, campo ' + nombre, obtenido, esperado);
  }

  const camposAli = [
    ['1 tipo de comprobante', corte(ali, 1, 3), '001'],
    ['2 punto de venta', corte(ali, 4, 8), '00003'],
    ['3 número', corte(ali, 9, 28), '00000000000000074425'],
    ['4 código de documento', corte(ali, 29, 30), '80'],
    ['5 CUIT del vendedor', corte(ali, 31, 50), '00000000030711291519'],
    ['6 neto gravado', corte(ali, 51, 65), '000000003512397'],
    ['7 alícuota', corte(ali, 66, 69), '0005'],
    ['8 impuesto liquidado', corte(ali, 70, 84), '000000000737603'],
  ];
  for (const [nombre, obtenido, esperado] of camposAli) {
    igual('alícuotas, campo ' + nombre, obtenido, esperado);
  }

  /* Y el mismo control sobre una nota de crédito, que va en positivo. */
  const nc = comprobantes.find((x) => x.esNotaCredito);
  const cabNc = registroComprasCabeceraDePrueba(nc);
  igual('la nota de crédito lleva tipo 003', corte(cabNc, 9, 11), '003');
  verificar('el importe total de la nota de crédito no tiene signo',
    /^\d{15}$/.test(corte(cabNc, 105, 119)));
  igual('el importe total de la nota de crédito es el valor absoluto',
    Number(corte(cabNc, 105, 119)), Math.abs(nc.total));
}

/* generar() arma los registros de a lotes; acá se necesita uno solo. */
function registroComprasCabeceraDePrueba(c) {
  return generar([c], 'compras', CONFIG).cabecera.split('\r\n')[0];
}
function registroComprasAlicuotaDePrueba(c) {
  return generar([c], 'compras', CONFIG).alicuotas.split('\r\n')[0];
}

/* ---------- Presentación ---------- */

function pintarResultados(faltaPlanilla) {
  const cont = document.getElementById('resultados');
  let aviso = '';

  if (faltaPlanilla) {
    aviso = '<div class="cartel ojo"><strong>La corrida sobre la planilla real no se ejecutó</strong>' +
      '<code>Facturas de compras.xlsx</code> no está en esta carpeta, y no se publica junto con la ' +
      'aplicación porque tiene datos de clientes. Lo que ves abajo son solo las verificaciones de ' +
      'cálculo. Para correr todo, abrí esta página desde la carpeta del proyecto en el estudio.</div>';
  }

  const porSuite = new Map();
  for (const r of resultados) {
    if (!porSuite.has(r.suite)) porSuite.set(r.suite, []);
    porSuite.get(r.suite).push(r);
  }

  let html = aviso;
  for (const [nombre, items] of porSuite) {
    const fallan = items.filter((i) => !i.ok).length;
    html += `<section class="suite ${fallan ? 'con-fallas' : ''}">`;
    html += `<h2>${nombre} <span class="cuenta">${items.length - fallan}/${items.length}</span></h2><ul>`;
    for (const i of items) {
      html += `<li class="${i.ok ? 'ok' : 'mal'}"><span class="marca">${i.ok ? '✓' : '✗'}</span> ${i.descripcion}`;
      if (!i.ok && i.detalle) html += `<div class="detalle">${i.detalle}</div>`;
      html += '</li>';
    }
    html += '</ul></section>';
  }
  cont.innerHTML = html;

  const total = resultados.length;
  const fallan = resultados.filter((r) => !r.ok).length;
  const enc = document.getElementById('encabezado');
  enc.className = fallan ? 'mal' : 'ok';
  enc.textContent = fallan
    ? `${fallan} de ${total} verificaciones fallan`
    : `Las ${total} verificaciones pasan` + (faltaPlanilla ? ' (sin la planilla real)' : '');
}

function pintarControl(datos) {
  const filas = [
    ['Neto gravado', 'neto'],
    ['IVA', 'iva'],
    ['No gravado', 'noGravado'],
    ['Exento', 'exento'],
    ['Percepciones', 'percepciones'],
    ['Impuestos internos', 'impInternos'],
    ['Otros tributos', 'otrosTributos'],
    ['Importe total', 'total'],
  ];

  let html = '<table><caption>Totales de todos los períodos: planilla contra archivo generado</caption>';
  html += '<thead><tr><th scope="col">Concepto</th><th scope="col">Planilla</th><th scope="col">Archivo TXT</th><th scope="col">Diferencia</th></tr></thead><tbody>';

  const acum = { planilla: {}, archivo: {} };
  for (const [, clave] of filas) { acum.planilla[clave] = 0; acum.archivo[clave] = 0; }
  for (const r of datos.resumen) {
    for (const [, clave] of filas) {
      acum.planilla[clave] += r.ctrl.planilla[clave];
      acum.archivo[clave] += r.ctrl.archivo[clave];
    }
  }

  for (const [etiqueta, clave] of filas) {
    const dif = acum.archivo[clave] - acum.planilla[clave];
    html += `<tr><th scope="row">${etiqueta}</th>`;
    html += `<td class="num">${pesos(acum.planilla[clave])}</td>`;
    html += `<td class="num">${pesos(acum.archivo[clave])}</td>`;
    html += `<td class="num ${dif === 0 ? 'cero' : 'distinto'}">${pesos(dif)}</td></tr>`;
  }
  html += '</tbody></table>';

  html += '<table><caption>Comprobantes y líneas por período</caption>';
  html += '<thead><tr><th scope="col">Período</th><th scope="col">Comprobantes</th><th scope="col">Neto gravado</th><th scope="col">IVA</th><th scope="col">Importe total</th><th scope="col">Descuadre</th></tr></thead><tbody>';
  for (const r of datos.resumen) {
    html += `<tr><th scope="row">${r.periodo}</th><td class="num">${r.comprobantes}</td>`;
    html += `<td class="num">${pesos(r.ctrl.archivo.neto)}</td>`;
    html += `<td class="num">${pesos(r.ctrl.archivo.iva)}</td>`;
    html += `<td class="num">${pesos(r.ctrl.archivo.total)}</td>`;
    html += `<td class="num ${r.ctrl.archivo.descuadre === 0 ? 'cero' : 'distinto'}">${pesos(r.ctrl.archivo.descuadre)}</td></tr>`;
  }
  html += '</tbody></table>';

  if (datos.ajustes.length) {
    html += '<table><caption>Diferencias de redondeo ajustadas</caption>';
    html += '<thead><tr><th scope="col">Fila</th><th scope="col">Proveedor</th><th scope="col">Ajuste</th><th scope="col">Aplicado a</th></tr></thead><tbody>';
    for (const a of datos.ajustes) {
      html += `<tr><td class="num">${a.filaPlanilla}</td><td>${a.denominacion}</td><td class="num">${pesos(a.centavos)}</td><td>${a.destino}</td></tr>`;
    }
    html += '</tbody></table>';
  }

  const mixtos = datos.comprobantes.filter((c) => c.lineas.length > 1);
  html += '<table><caption>Comprobantes con más de una alícuota, según el detalle de la planilla</caption>';
  html += '<thead><tr><th scope="col">Fila</th><th scope="col">Fecha</th><th scope="col">Proveedor</th><th scope="col">Neto</th><th scope="col">IVA</th><th scope="col">Detalle</th></tr></thead><tbody>';
  for (const c of mixtos) {
    const det = c.lineas.map((l) => `${alicuotaPorCodigo(l.codigo).etiqueta}: ${pesos(l.netoCentavos)}`).join(' · ');
    html += `<tr><td class="num">${c.filaPlanilla}</td><td class="num">${c.fecha}</td><td>${c.denominacion}</td>`;
    html += `<td class="num">${pesos(c.neto)}</td><td class="num">${pesos(c.iva)}</td><td>${det}</td></tr>`;
  }
  html += '</tbody></table>';

  if (datos.comparacion) {
    html += '<table><caption>Qué tan cerca quedaba la deducción cuando no hay detalle ' +
      `(${datos.comparacion.iguales} de 128 idénticos)</caption>`;
    html += '<thead><tr><th scope="col">Fila</th><th scope="col">Proveedor</th>' +
      '<th scope="col">Deducido</th><th scope="col">Real</th><th scope="col">Desvío</th></tr></thead><tbody>';
    for (const x of datos.comparacion.diferencias) {
      const arma = (ls) => ls.map((l) => `${alicuotaPorCodigo(l.codigo).etiqueta}: ${pesos(l.netoCentavos)}`).join(' · ');
      html += `<tr><td class="num">${x.filaPlanilla}</td><td>${x.denominacion}</td>`;
      html += `<td>${arma(x.deducido)}</td><td>${arma(x.real)}</td>`;
      html += `<td class="num ${x.desvio <= 100 ? 'cero' : 'distinto'}">${pesos(x.desvio)}</td></tr>`;
    }
    html += '</tbody></table>';
  }

  document.getElementById('control').innerHTML = html;
}

(async () => {
  let datos = null;
  let faltaPlanilla = false;
  try {
    datos = await corridaReal();
  } catch (e) {
    if (e instanceof SinPlanilla) {
      faltaPlanilla = true;
    } else {
      suite('Corrida sobre el Excel real');
      verificar('la corrida termina sin errores', false, e.message);
    }
  }
  pintarResultados(faltaPlanilla);
  if (datos) pintarControl(datos);
})();
