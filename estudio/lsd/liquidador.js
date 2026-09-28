/**
 * Liquidador de sueldos simples.
 *
 * Para las empresas cuya liquidación es una cuenta corta —hoy Martín Prado—,
 * la hace acá y no la lee de una exportación. Así los errores que veníamos
 * detectando en el paso 5 no llegan a ocurrir:
 *
 *   · las bases dejan de salir de números sin redondear;
 *   · el concepto no remunerativo deja de sumarse a las nueve bases;
 *   · los no remunerativos que se pagan dejan de faltar en el libro;
 *   · el tope y las alícuotas salen de un solo lugar, actualizado.
 *
 * Emite exactamente la misma forma que el armador ya sabe leer —una fila por
 * concepto liquidado— así que las dos piezas se verifican por separado y la
 * prueba de punta a punta sale gratis.
 *
 * ── Reglas rojas ──────────────────────────────────────────────────────────
 *
 * 1. **Todo en centavos enteros.** Cada concepto se redondea al crearse, y la
 *    base imponible es la SUMA DE LOS CONCEPTOS REDONDEADOS. Eso es lo que
 *    hace que la base declarada coincida con lo que ARCA suma del registro 03.
 * 2. **Las alícuotas y los porcentajes no se inventan.** Cada uno viene con la
 *    fuente anotada al lado. Si no está verificado contra un recibo real o
 *    contra el convenio, no se escribe.
 * 3. **Nada se calcula en silencio.** Todo lo que el liquidador deduce o no
 *    puede resolver sale en `avisos`.
 */

/* ---------- De dónde salen los porcentajes ---------- */

/*
 * Ya no salen de acá. Los adicionales con su porcentaje, los aportes con su
 * alícuota, la escala de antigüedad y los divisores viven en la FICHA DE
 * LIQUIDACIÓN de la empresa, en `empresa.js`.
 *
 * Estuvieron acá, escritos en código, con el nombre de Prado pegado en cada
 * constante. Así la segunda empresa obligaba a tocar JS, y una paritaria
 * también. La ficha los saca afuera sin perder ni una de las fuentes: cada
 * porcentaje sigue con el recibo o el convenio donde se lo verificó anotado al
 * lado.
 *
 * `FICHA_PRADO` es la de fábrica y la que usan las pruebas, porque los ocho
 * meses de 2026 de Prado son el banco de pruebas de todo el liquidador.
 */

/*
 * Los días del mes con los que se prorratea, cuando la ficha no lo dice. ARCA
 * cuenta meses de 30 días y el recibo divide por 30, no por los días corridos
 * del calendario.
 */
const DIAS_DEL_MES = 30;

/* ---------- Utilidades ---------- */

/** Redondea a centavos enteros. Es la única forma de redondear del módulo. */
function centavos(pesos) {
  return Math.round(Number(pesos) || 0);
}

/**
 * Aplica un porcentaje a un importe en centavos y devuelve centavos enteros.
 * El redondeo va acá, una sola vez, y nunca antes.
 */
function porcentajeDe(importeCentavos, porcentaje) {
  return Math.round(importeCentavos * porcentaje);
}

/* ---------- Liquidación de un trabajador ---------- */

/**
 * Liquida un trabajador a partir de sus novedades.
 *
 * `novedad` trae, en centavos enteros donde diga "importe":
 *   cuil, nombre
 *   basico              importe del sueldo básico por mes completo
 *   dias                días liquidados (30 = mes completo)
 *   porcentajeAntiguedad  0.04, 0.02, o 0 si no corresponde
 *   aCuentaNeto         el "a cuenta de futuros aumentos", NETO de aportes
 *   anr                 asignación no remunerativa del acuerdo
 *   viaticos            viáticos no remunerativos
 *   redondeo            ajuste para llegar al neto redondo
 *
 * Devuelve { cuil, nombre, conceptos, remuneracion, aportes, noRemunerativo,
 *            neto, avisos }.
 */
function liquidarTrabajador(novedad, avisos, ficha) {
  /*
   * Sin ficha se liquida con la de Prado. Es lo que hace que las pruebas de los
   * ocho meses sigan corriendo tal cual, y el único lugar del proyecto donde
   * una empresa es el valor por omisión. La pantalla SIEMPRE pasa la ficha, y
   * hay una prueba que liquida la misma novedad con dos fichas distintas para
   * que no se pueda volver a clavar un porcentaje acá sin que se note.
   */
  const f = ficha || FICHA_PRADO;
  const C = f.conceptos || {};
  const antig = f.antiguedad || {};
  const diasDelMes = Number(f.diasDelMes) || DIAS_DEL_MES;
  const divisorVac = Number(f.divisorVacaciones) || 25;

  const conceptos = [];
  const aviso = (texto) => { if (avisos) avisos.push(`CUIL ${novedad.cuil}: ${texto}`); };

  const sumar = (codigo, descripcion, importe, clase, cantidad) => {
    if (!importe) return;
    conceptos.push({
      codigo, descripcion, importe: Math.abs(importe),
      cantidad: cantidad === undefined ? 100 : cantidad,
      unidad: '$',
      debitoCredito: clase === 'aporte' ? 'D' : 'C',
      clase,
      /* Sin código no hay renglón del registro 03: se paga pero no se informa. */
      sinConcepto: !codigo,
    });
  };

  /* 1. El sueldo básico, prorrateado por días. */
  const basicoMes = centavos(novedad.basico);
  const dias = Number(novedad.dias) || diasDelMes;
  const basico = Math.round((basicoMes * dias) / diasDelMes);
  /*
   * La cantidad va en 1,00 y no en los días. La planilla oficial solo exige
   * la cantidad en SAC proporcional, adelanto vacacional y horas extras; en
   * el resto es optativa, y los archivos aceptados de las tres empresas
   * llevan 1,00 en todos los renglones. Los días viajan donde corresponde:
   * `diasLiquidados` del registro 02 y `diasTrabajados` del 04.
   */
  sumar(C.basico.codigo, C.basico.descripcion, basico, 'remunerativo');

  /*
   * 2. Las vacaciones, si las hubo. El día de vacaciones sale de dividir por
   * 25 y no por 30, que es lo que manda el artículo 155 de la LCT.
   */
  const diasVacaciones = Number(novedad.diasVacaciones) || 0;
  const vacaciones = diasVacaciones
    ? Math.round((basicoMes * diasVacaciones) / divisorVac)
    : 0;
  if (vacaciones) {
    sumar(C.vacaciones.codigo, C.vacaciones.descripcion,
      vacaciones, 'remunerativo', diasVacaciones * 100);
    if (dias + diasVacaciones !== diasDelMes) {
      aviso(
        `los días trabajados (${dias}) más los de vacaciones (${diasVacaciones}) ` +
        `no dan ${diasDelMes}.`
      );
    }
  }

  /*
   * 3. Los haberes que son un porcentaje. Se calculan sobre el básico ya
   * prorrateado MÁS las vacaciones, que es lo que hacen los recibos de
   * febrero: `=+(E13+E14)*0.1`.
   */
  const baseDePorcentajes = basico + vacaciones;
  for (const h of f.adicionales || []) {
    sumar(h.codigo, h.descripcion, porcentajeDe(baseDePorcentajes, h.porcentaje), 'remunerativo');
  }

  /*
   * 4. La antigüedad.
   *
   * Sale de los años cumplidos por la escala del convenio. El porcentaje
   * explícito, si viene, gana: sirve para reproducir un mes viejo tal como se
   * liquidó, y para los casos que la escala no cubra.
   */
  const anios = Number(novedad.aniosAntiguedad) || 0;
  const pctExplicito = Number(novedad.porcentajeAntiguedad) || 0;
  const pctPorAnio = Number(antig.porcentajePorAnio) || 0;
  const pctPorEscala = anios * pctPorAnio;
  const pctAnt = pctExplicito || pctPorEscala;
  if (pctExplicito && pctPorEscala && Math.abs(pctExplicito - pctPorEscala) > 0.0001) {
    aviso(
      `la antigüedad se liquida al ${(pctExplicito * 100).toFixed(2)} % y por la escala del ` +
      `convenio —${pctPorAnio * 100} % por año, ${anios} ` +
      `${anios === 1 ? 'año' : 'años'}— le corresponde ${(pctPorEscala * 100).toFixed(2)} %.`
    );
  }
  if (pctAnt) {
    sumar(antig.codigo, antig.descripcion,
      porcentajeDe(baseDePorcentajes, pctAnt), 'remunerativo');
  }

  /*
   * 5. El sueldo anual complementario.
   *
   * Es la MITAD de los haberes habituales del mes —básico, presentismo, zona y
   * antigüedad—, tal cual la fórmula del recibo: `=SUM(E13:E16)/2`. El "a
   * cuenta de futuros aumentos" queda afuera del rango a propósito, y por eso
   * se calcula acá, antes de agregarlo.
   *
   * Vale mientras el sueldo suba todos los meses, porque entonces el mes que
   * se liquida es el mejor del semestre, que es lo que manda la ley. Si algún
   * mes bajara, esto habría que mirarlo.
   */
  const habituales = conceptos
    .filter((c) => c.clase === 'remunerativo')
    .reduce((t, c) => t + c.importe, 0);
  const cuotaSac = Number(novedad.sac) || 0;
  if (cuotaSac) {
    sumar(C.sac.codigo,
      `SAC ${cuotaSac === 1 ? '1ra' : '2da'} cuota`,
      Math.round(habituales / 2), 'remunerativo');
  }

  /*
   * 6. El "a cuenta de futuros aumentos".
   *
   * Se decide en NETO —es lo que el empleado se lleva por ese concepto— y hay
   * que llevarlo a bruto. El divisor es 1 menos la suma de los aportes, porque
   * todos se calculan sobre la misma base: 1 - 0,23 = 0,77.
   */
  const tasaAportes = (f.aportes || []).reduce((t, a) => t + (Number(a.alicuota) || 0), 0);
  const aCuentaNeto = centavos(novedad.aCuentaNeto);
  if (aCuentaNeto) {
    sumar(C.aCuenta.codigo, C.aCuenta.descripcion,
      Math.round(aCuentaNeto / (1 - tasaAportes)), 'remunerativo');
    if (centavos(novedad.baseAportes)) {
      aviso(
        'tiene base de aportes reducida y "a cuenta de futuros aumentos" a la vez: ' +
        'el pasaje a bruto divide por 0,77 y con la base reducida el neto no cae ' +
        'donde debería. Verificá el neto, o cargá el a cuenta ya en bruto.'
      );
    }
  }

  /* 7. La remuneración es la suma de los conceptos YA REDONDEADOS. */
  const remuneracion = conceptos
    .filter((c) => c.clase === 'remunerativo')
    .reduce((t, c) => t + c.importe, 0);

  /*
   * 8. Los aportes.
   *
   * Cada uno sobre la remuneración, salvo que el trabajador tenga una **base
   * de aportes** distinta. Eso pasa cuando hay un beneficio que reduce los
   * aportes de seguridad social: entonces SIPA, INSSJyP y obra social se
   * calculan sobre esa base y el sindical sigue sobre el total.
   *
   * La base reducida es la que se declara en REM 1, 4 y 5, y el recibo se
   * alinea con ella: **lo que manda en cargas sociales es el F931**, así que
   * el recibo no puede retener más de lo que se declara. Antes pasaba al
   * revés y la diferencia se la comía el trabajador.
   */
  const baseAportes = centavos(novedad.baseAportes);
  const baseSS = baseAportes || remuneracion;
  if (baseAportes && baseAportes !== remuneracion) {
    aviso(
      `los aportes de seguridad social van sobre $ ${(baseAportes / 100).toFixed(2)} ` +
      `y no sobre los $ ${(remuneracion / 100).toFixed(2)} de la remuneración. ` +
      'Esa misma base tiene que ir en REM 1, 4 y 5.'
    );
  }
  for (const a of f.aportes || []) {
    const base = a.deLaSeguridadSocial ? baseSS : remuneracion;
    sumar(a.codigo, a.descripcion, porcentajeDe(base, a.alicuota), 'aporte');
  }
  const aportes = conceptos
    .filter((c) => c.clase === 'aporte')
    .reduce((t, c) => t + c.importe, 0);

  /* 9. Los no remunerativos. */
  const anr = centavos(novedad.anr);
  if (anr) sumar(C.anr.codigo, C.anr.descripcion, anr, 'noRemunerativo');

  const viaticos = centavos(novedad.viaticos);
  if (viaticos) {
    sumar(C.viaticos.codigo, C.viaticos.descripcion, viaticos, 'noRemunerativo');
    /* Se pagan en el recibo y no se informan: son acuerdos no homologados.
       Queda dicho en cada liquidación, porque es plata que se paga. */
    aviso(
      `se le pagan $ ${(viaticos / 100).toFixed(2)} de viáticos, que van en el recibo y ` +
      'no se informan: salen de acuerdos no homologados.'
    );
  }

  /*
   * 10. El SAC de los conceptos no remunerativos: la mitad de lo que se paga
   * sin aportes. La fórmula del recibo es `=(ANR + viáticos)/2`.
   */
  if (cuotaSac && (anr || viaticos)) {
    const sacNoRem = Math.round((anr + viaticos) / 2);
    sumar(C.sacNoRemunerativo.codigo,
      `SAC ${cuotaSac === 1 ? '1ra' : '2da'} cuota no remunerativo`,
      sacNoRem, 'noRemunerativo');
    aviso(
      `el SAC no remunerativo de $ ${(sacNoRem / 100).toFixed(2)} no tiene concepto ` +
      'parametrizado en el servicio: se paga en el recibo y no puede informarse al libro.'
    );
  }

  const redondeo = centavos(novedad.redondeo);
  if (redondeo) {
    /* Cantidad 1,00 como el resto: los archivos de la empresa alternan entre
       0,00 y 1,00 en este renglón y ninguno de los dos significa nada. */
    sumar(C.redondeo.codigo, C.redondeo.descripcion, redondeo, 'noRemunerativo');
  }

  const noRemunerativo = conceptos
    .filter((c) => c.clase === 'noRemunerativo')
    .reduce((t, c) => t + c.importe, 0);

  const neto = remuneracion - aportes + noRemunerativo;

  /*
   * El neto se paga en pesos enteros: para eso está el concepto Redondeo. En
   * los meses sin SAC además cae en un múltiplo de $100.000, porque el "a
   * cuenta" se elige para eso. Si quedan centavos sueltos, casi siempre es el
   * redondeo mal calculado, así que conviene que se vea.
   */
  if (neto % 100 !== 0) {
    const enteros = Math.round(neto / 100) * 100;
    aviso(
      `el neto quedó en $ ${(neto / 100).toFixed(2)}, que no es un importe entero. ` +
      `Con un redondeo de $ ${((redondeo + enteros - neto) / 100).toFixed(2)} cerraría.`
    );
  }

  return {
    cuil: novedad.cuil,
    nombre: novedad.nombre || '',
    conceptos,
    remuneracion,
    aportes,
    noRemunerativo,
    neto,
    /* Distinta de la remuneración solo cuando hay un beneficio que reduce los
       aportes de seguridad social. Es la que va a REM 1, 4 y 5. */
    baseAportes: baseSS,
  };
}

/**
 * Liquida el período completo.
 *
 * Devuelve { trabajadores, filas, avisos }, donde `filas` es la planilla en la
 * forma que lee el armador: encabezados más una fila por concepto liquidado.
 */
function liquidarPeriodo(novedades, ficha) {
  const avisos = [];
  const trabajadores = novedades.map((n) => liquidarTrabajador(n, avisos, ficha));

  /* La misma forma que la hoja "Conceptos y totales" que ya leemos, para que
     el armador no tenga que enterarse de que el origen cambió. */
  /*
   * Las tres últimas columnas son las bases de aportes, y solo se completan
   * cuando el trabajador tiene una base reducida por un beneficio. El armador
   * las lee como base DECLARADA y respeta lo declarado sobre lo calculado, que
   * es justo lo que hace falta: esa base no sale de los conceptos.
   *
   * Vacías para el resto, que es lo normal: ahí el armador las calcula.
   */
  const encabezados = [
    'C.U.I.L.', 'nombre', 'Número de concepto', 'Descripción de concepto',
    'Cantidad liquidada', 'Importe liquidado', 'Apellido materno', 'Columna1', 'Columna2',
    'Base imponible 1', 'Base imponible 4', 'Base imponible 5',
  ];
  const filas = [];
  let sinInformar = 0;
  let conBaseReducida = 0;
  for (const t of trabajadores) {
    const reducida = t.baseAportes !== t.remuneracion;
    if (reducida) conBaseReducida += 1;
    const base = reducida ? t.baseAportes / 100 : '';
    for (const c of t.conceptos) {
      /* Lo que no tiene concepto parametrizado se paga pero no se informa:
         va al recibo y no a la planilla. Queda contado más abajo. */
      if (c.sinConcepto) { sinInformar += c.importe; continue; }
      filas.push([
        t.cuil, t.nombre, c.codigo, c.descripcion,
        c.cantidad / 100, c.importe / 100, '', c.debitoCredito,
        String(c.codigo).padStart(4, ' '),
        base, base, base,
      ]);
    }
  }

  if (conBaseReducida) {
    avisos.push(
      `${conBaseReducida} ${conBaseReducida === 1 ? 'trabajador lleva' : 'trabajadores llevan'} ` +
      'base de aportes reducida: la planilla la pasa en REM 1, 4 y 5 para que lo ' +
      'declarado y el recibo digan lo mismo.'
    );
  }

  if (sinInformar) {
    avisos.push(
      `Quedan $ ${(sinInformar / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ` +
      'pagados que no entran en la planilla porque no tienen concepto parametrizado.'
    );
  }

  return { trabajadores, encabezados, filas, avisos, sinInformar, conBaseReducida };
}

/* ---------- Las novedades del mes ---------- */

const ENCABEZADOS_NOVEDADES = [
  'CUIL', 'Apellido y nombre', 'Días trabajados', 'Días de vacaciones', 'Sueldo básico',
  'Años de antigüedad', '% antigüedad', 'SAC', 'Base de aportes', 'A cuenta futuros aumentos (neto)', 'ANR', 'Viáticos', 'Redondeo',
];

/*
 * Qué es mensual y qué no, para que se sepa qué hay que tocar cada mes:
 *
 *   Sueldo básico    cambia con la paritaria, no todos los meses
 *   % antigüedad     cambia cuando el empleado cumple años de servicio
 *   Días             30, salvo alta, baja o licencia sin goce
 *   A cuenta         se define cada mes, es el que ajusta el neto
 *   ANR              sale del acuerdo del período
 *   Viáticos         sale del acuerdo del período
 *   Redondeo         para llegar al neto redondo
 */
function leerNovedades(filas, encabezados, avisos) {
  const normalizados = encabezados.map(normalizarEncabezado);
  const buscar = (...alias) => {
    for (const a of alias) {
      const i = normalizados.findIndex((h) => h === a || h.startsWith(a));
      if (i >= 0) return i;
    }
    return -1;
  };
  const col = {
    cuil: buscar('cuil'),
    nombre: buscar('apellido y nombre', 'nombre'),
    dias: buscar('dias trabajados', 'dias'),
    diasVacaciones: buscar('dias de vacaciones', 'vacaciones'),
    basico: buscar('sueldo basico', 'basico'),
    aniosAntiguedad: buscar('anios de antiguedad', 'años de antiguedad'),
    porcentajeAntiguedad: buscar('porcentaje antiguedad', 'antiguedad'),
    sac: buscar('sac', 'aguinaldo'),
    baseAportes: buscar('base de aportes', 'base aportes'),
    aCuentaNeto: buscar('a cuenta futuros aumentos', 'a cuenta'),
    anr: buscar('anr'),
    viaticos: buscar('viaticos'),
    redondeo: buscar('redondeo'),
  };

  if (col.cuil < 0 || col.basico < 0) {
    if (avisos) avisos.push('Las novedades tienen que traer al menos CUIL y sueldo básico.');
    return [];
  }

  const novedades = [];
  for (const fila of filas) {
    const cuil = soloDigitos(fila[col.cuil]);
    if (!cuil) continue;
    const dato = (clave) => (col[clave] < 0 ? '' : fila[col[clave]]);
    /* El porcentaje viene como 4 y 2, no como 0,04: es lo que se entiende al
       leer la planilla. */
    const pct = aCentavos(dato('porcentajeAntiguedad'));
    novedades.push({
      cuil,
      nombre: String(dato('nombre') || '').trim(),
      dias: Number(String(dato('dias')).replace(',', '.')) || DIAS_DEL_MES,
      diasVacaciones: Number(String(dato('diasVacaciones')).replace(',', '.')) || 0,
      basico: aCentavos(dato('basico')),
      aniosAntiguedad: Number(String(dato('aniosAntiguedad')).replace(',', '.')) || 0,
      porcentajeAntiguedad: pct ? pct / 10000 : 0,
      /* 1 o 2, según qué cuota del aguinaldo se liquida. Vacío es sin SAC. */
      sac: Number(String(dato('sac')).replace(/[^0-9]/g, '')) || 0,
      /* Vacío = los aportes van sobre la remuneración entera. */
      baseAportes: aCentavos(dato('baseAportes')),
      aCuentaNeto: aCentavos(dato('aCuentaNeto')),
      anr: aCentavos(dato('anr')),
      viaticos: aCentavos(dato('viaticos')),
      redondeo: aCentavos(dato('redondeo')),
    });
  }
  return novedades;
}

/* ---------- Las novedades salen del legajo ---------- */

/**
 * Los años de antigüedad cumplidos al último día del período.
 *
 * Acepta la fecha como DD/MM/AAAA —que es como la escribe cualquiera— o como
 * AAAA-MM-DD. Devuelve null si no se entiende, para que quien llame avise en
 * vez de liquidar una antigüedad inventada.
 */
function aniosDeAntiguedad(fechaIngreso, periodo) {
  const texto = String(fechaIngreso || '').trim();
  if (!texto) return null;

  let anio;
  let mes;
  let dia;
  const barras = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = texto.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (barras) {
    dia = Number(barras[1]); mes = Number(barras[2]); anio = Number(barras[3]);
  } else if (iso) {
    anio = Number(iso[1]); mes = Number(iso[2]); dia = Number(iso[3]);
  } else {
    return null;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const p = String(periodo || '').replace(/\D/g, '');
  if (p.length !== 6) return null;
  const anioP = Number(p.slice(0, 4));
  const mesP = Number(p.slice(4, 6));
  /* El último día del período: el día 0 del mes siguiente. */
  const finDelPeriodo = new Date(anioP, mesP, 0);

  let anios = finDelPeriodo.getFullYear() - anio;
  /* Si todavía no llegó el aniversario dentro del período, falta un año. */
  const mesFin = finDelPeriodo.getMonth() + 1;
  const diaFin = finDelPeriodo.getDate();
  if (mesFin < mes || (mesFin === mes && diaFin < dia)) anios -= 1;
  return anios < 0 ? 0 : anios;
}

/**
 * Arma las novedades del período a partir del reservorio de empleados.
 *
 * Es lo que reemplaza al archivo de novedades: cada empleado entra con el mes
 * completo, su básico del legajo y la antigüedad calculada desde su fecha de
 * ingreso. Después en pantalla se toca solo lo que cambió.
 *
 * `padron` es el Map del reservorio de empleados; `periodo`, AAAAMM.
 *
 * Los que tienen fecha de baja anterior al período quedan afuera. Los que no
 * tienen básico entran igual, en cero, y se avisa: es mejor que se vea el
 * renglón vacío que que el empleado desaparezca de la liquidación.
 */
function novedadesDeLegajos(padron, periodo, avisos) {
  const novedades = [];
  const cuiles = Array.from(padron.keys()).sort();

  for (const cuil of cuiles) {
    const d = padron.get(cuil) || {};
    const nombre = String(d.apellidoNombre || '').trim();
    const quien = nombre || `CUIL ${cuil}`;

    const anios = aniosDeAntiguedad(d.fechaIngreso, periodo);
    if (anios === null && avisos) {
      avisos.push(
        `${quien} no tiene fecha de ingreso en el legajo: la antigüedad queda en cero. ` +
        'Cargala en el reservorio de empleados para que se calcule sola.'
      );
    }
    if (anios !== null && anios < 0 && avisos) {
      avisos.push(`${quien} ingresa después del período que se está liquidando.`);
    }

    const basico = aCentavos(d.basico);
    if (!basico && avisos) {
      avisos.push(
        `${quien} no tiene sueldo básico en el legajo. Cargalo para que la paritaria ` +
        'se aplique sola el mes que viene.'
      );
    }

    novedades.push({
      cuil,
      nombre,
      dias: Number(d.diasTrabajados) || DIAS_DEL_MES,
      diasVacaciones: 0,
      basico,
      aniosAntiguedad: anios === null ? 0 : anios,
      /* Vacío a propósito: así manda la escala de la ficha. Se completa solo
         para reproducir un mes viejo tal como se liquidó. */
      porcentajeAntiguedad: 0,
      sac: 0,
      baseAportes: 0,
      aCuentaNeto: 0,
      anr: 0,
      viaticos: 0,
      redondeo: 0,
    });
  }

  return novedades;
}

/**
 * Despeja el "a cuenta de futuros aumentos" NETO que hace falta para llegar a
 * un neto objetivo. Es la cuenta que hoy se hace a mano en el Excel.
 *
 * Devuelve el neto del concepto, en centavos, o 0 si ya se llega sin él.
 *
 * La resta sola no alcanza. El concepto se carga en neto y se pasa a bruto
 * dividiendo por 0,77, y ese redondeo no se puede deshacer: la diferencia
 * entre el objetivo y el neto sin el concepto da un centavo de menos. Por eso
 * se toma esa resta como punto de partida y se prueban los centavos de al
 * lado, que son pocos y la cuenta es barata.
 */
function aCuentaParaLlegarA(netoObjetivo, novedad, ficha) {
  const objetivo = centavos(netoObjetivo);
  const sinACuenta = liquidarTrabajador(
    Object.assign({}, novedad, { aCuentaNeto: 0 }), null, ficha);
  const punto = objetivo - sinACuenta.neto;
  if (punto <= 0) return 0;

  const netoCon = (aCuentaNeto) =>
    liquidarTrabajador(Object.assign({}, novedad, { aCuentaNeto }), null, ficha).neto;

  let mejor = punto;
  let mejorDistancia = Math.abs(netoCon(punto) - objetivo);
  for (let d = -3; d <= 3; d += 1) {
    const candidato = punto + d;
    if (candidato <= 0) continue;
    const distancia = Math.abs(netoCon(candidato) - objetivo);
    /* Con dos que den igual, gana el más chico: se paga lo mínimo que llega. */
    if (distancia < mejorDistancia || (distancia === mejorDistancia && candidato < mejor)) {
      mejor = candidato;
      mejorDistancia = distancia;
    }
  }
  return mejor;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DIAS_DEL_MES,
    ENCABEZADOS_NOVEDADES, leerNovedades, novedadesDeLegajos, aniosDeAntiguedad,
    liquidarTrabajador, liquidarPeriodo, aCuentaParaLlegarA,
  };
}
