/**
 * La ficha de liquidación de la empresa.
 *
 * Es el tercer reservorio. Los otros dos —empleados y conceptos— dicen QUIÉN
 * trabaja y CÓMO se informa cada concepto a ARCA. Éste dice CUÁNTO se paga:
 * los adicionales con su porcentaje, los aportes con su alícuota, la escala de
 * antigüedad y los divisores.
 *
 * Existe porque todo esto estaba escrito adentro de `liquidador.js`, en código,
 * con el nombre de una empresa pegado en cada constante. Así la segunda empresa
 * obligaba a tocar JS, y una paritaria también.
 *
 * ── Reglas rojas ──────────────────────────────────────────────────────────
 *
 * 1. **Ningún porcentaje se inventa.** Cada uno viene con la fuente anotada:
 *    el recibo donde se lo vio, el convenio, o el acuerdo. Una ficha inventada
 *    liquida mal y nadie se entera hasta que el empleado reclama.
 * 2. **La ficha es de la empresa, no del período.** Lo que cambia todos los
 *    meses son las novedades; lo que cambia con la paritaria es el básico del
 *    empleado, que vive en el reservorio de empleados.
 */

/* ---------- Cómo se guarda ---------- */

/*
 * Las fichas quedan en la memoria del navegador de esta computadora, una por
 * CUIT. No viajan a ningún servidor: es el mismo criterio que el resto del
 * proyecto, donde la planilla nunca sale del navegador.
 *
 * Igual se pueden bajar como archivo. La memoria del navegador se borra sola
 * —basta con limpiar los datos del sitio— así que no es el respaldo: el
 * respaldo es el archivo en la carpeta de la empresa.
 */
const CLAVE_FICHAS = 'lsd.fichas';

function memoriaDisponible() {
  try {
    const p = '__lsd__';
    localStorage.setItem(p, '1');
    localStorage.removeItem(p);
    return true;
  } catch (e) {
    return false;
  }
}

function fichasGuardadas() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_FICHAS) || '{}') || {};
  } catch (e) {
    /* Un JSON roto no puede dejar la página sin arrancar. */
    return {};
  }
}

function guardarFicha(ficha) {
  if (!ficha || !ficha.cuit) return false;
  try {
    const todas = fichasGuardadas();
    todas[String(ficha.cuit)] = ficha;
    localStorage.setItem(CLAVE_FICHAS, JSON.stringify(todas));
    return true;
  } catch (e) {
    return false;
  }
}

function fichaDeCuit(cuit) {
  return fichasGuardadas()[String(cuit || '').trim()] || null;
}

function olvidarFicha(cuit) {
  try {
    const todas = fichasGuardadas();
    delete todas[String(cuit)];
    localStorage.setItem(CLAVE_FICHAS, JSON.stringify(todas));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- El legajo y las novedades, también guardados ---------- */

/*
 * El reservorio de empleados y las novedades del mes quedan guardados con la
 * misma regla que las fichas: en esta computadora y en ningún servidor.
 *
 * Hace falta porque sin esto la pantalla arranca en cero cada vez y hay que
 * volver a soltar todo. Las novedades se guardan por CUIT y período, así que
 * volver a un mes ya liquidado lo muestra tal como quedó.
 *
 * El archivo sigue siendo el respaldo: la memoria del navegador se borra sola
 * al limpiar los datos del sitio.
 */
const CLAVE_PADRONES = 'lsd.padrones';
const CLAVE_NOVEDADES = 'lsd.novedades';
const CLAVE_CONCEPTOS = 'lsd.conceptos';

function leerGuardado(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave) || '{}') || {};
  } catch (e) {
    return {};
  }
}

function escribirGuardado(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (e) {
    /* Puede fallar por cuota o por modo privado. No es motivo para perder la
       liquidación: se sigue trabajando en memoria y se avisa arriba. */
    return false;
  }
}

/** Guarda el padrón de un CUIT. El Map se serializa como pares. */
function guardarPadron(cuit, padron) {
  if (!cuit || !padron) return false;
  const todos = leerGuardado(CLAVE_PADRONES);
  todos[String(cuit)] = Array.from(padron.entries());
  return escribirGuardado(CLAVE_PADRONES, todos);
}

/** El padrón guardado de un CUIT, como Map, o null. */
function padronGuardado(cuit) {
  const pares = leerGuardado(CLAVE_PADRONES)[String(cuit)];
  return Array.isArray(pares) && pares.length ? new Map(pares) : null;
}

/**
 * Guarda la parametrización de conceptos de un CUIT.
 *
 * Es el mismo criterio que el padrón, y hace falta por el mismo motivo: los dos
 * reservorios se arman una vez por empresa y se usan todos los meses. Tener que
 * volver a soltarlos en cada sesión no solo es incómodo: es lo que hace que un
 * mes salga sin ellos y ARCA rechace el archivo entero.
 */
function guardarParametrizacion(cuit, parametrizacion) {
  if (!cuit || !parametrizacion || !parametrizacion.size) return false;
  const todas = leerGuardado(CLAVE_CONCEPTOS);
  todas[String(cuit)] = Array.from(parametrizacion.entries());
  return escribirGuardado(CLAVE_CONCEPTOS, todas);
}

/** La parametrización guardada de un CUIT, como Map, o null. */
function parametrizacionGuardada(cuit) {
  const pares = leerGuardado(CLAVE_CONCEPTOS)[String(cuit)];
  return Array.isArray(pares) && pares.length ? new Map(pares) : null;
}

/** Olvida los dos reservorios de un CUIT. Para cuando hay que empezar limpio. */
function olvidarReservorios(cuit) {
  for (const clave of [CLAVE_CONCEPTOS, CLAVE_PADRONES]) {
    const todos = leerGuardado(clave);
    delete todos[String(cuit)];
    escribirGuardado(clave, todos);
  }
  return true;
}

/* ---------- Los reservorios que vienen con la aplicación ---------- */

/*
 * Hasta acá los dos reservorios entraban de una sola manera: soltando el
 * archivo en la pantalla. La memoria del navegador los recordaba después, pero
 * esa memoria es una copia, no el original: se borra al limpiar los datos del
 * sitio, no existe en otra computadora ni en otro navegador, y sobre todo hay
 * que acertar la primera vez.
 *
 * Eso convertía en trabajo mensual algo que no cambia nunca. Y peor: el mes que
 * alguien no lo acertaba, el archivo salía con los registros 04 en cero y ARCA
 * lo rechazaba entero. Ya pasó, con el envío 202609 de Nautical.
 *
 * Ahora los reservorios viven en la carpeta `reservorios/` de la aplicación,
 * un archivo por empresa, y se leen solos al escribir el CUIT. La memoria del
 * navegador queda como caché de eso, no como el único lugar donde está el dato.
 *
 * ── Para sumar una empresa ────────────────────────────────────────────────
 * Copiar sus dos CSV a `reservorios/` y anotarla en `reservorios/indice.json`.
 * No hay que tocar código.
 *
 * ── Qué hay adentro ───────────────────────────────────────────────────────
 * CUIL, nombre, CBU y datos de la relación laboral de los empleados de cada
 * cliente. La carpeta no se publica y no entra en ningún repositorio público:
 * es el mismo criterio que las planillas de liquidación.
 */
const CARPETA_RESERVORIOS = 'reservorios';

/** El índice se pide una sola vez por sesión; después se reusa la promesa. */
let promesaDelIndice = null;

/**
 * El índice de `reservorios/`, o null si la carpeta no está.
 *
 * Que no esté no es un error: la aplicación sigue funcionando igual soltando
 * los archivos a mano, que es como funcionó siempre.
 */
async function indiceDeReservorios() {
  if (!promesaDelIndice) {
    promesaDelIndice = fetch(`${CARPETA_RESERVORIOS}/indice.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return promesaDelIndice;
}

/**
 * Trae un archivo de la carpeta como `File`, con los bytes tal cual.
 *
 * Se devuelve un File y no el texto a propósito: así lo lee exactamente el
 * mismo camino que un archivo soltado a mano —mismo lector, misma
 * decodificación, mismos avisos—. Un segundo camino de lectura sería un
 * segundo lugar donde se puede leer distinto.
 */
async function archivoDeReservorio(nombre, opciones) {
  const config = opciones || {};
  const resp = await fetch(`${CARPETA_RESERVORIOS}/${encodeURIComponent(nombre)}`, { cache: 'no-store' });
  if (resp.ok) return new File([await resp.arrayBuffer()], nombre);

  /*
   * El archivo en claro no está: puede estar cifrado.
   *
   * El índice nombra siempre el CSV, y acá se prueba `<nombre>.enc`. Así el
   * MISMO índice sirve en las dos partes: en esta computadora está el CSV y se
   * abre sin preguntar nada; en el sitio publicado está solo el `.enc` y se
   * pide la frase. Un índice distinto para cada lado sería un segundo lugar
   * donde las dos versiones pueden dejar de coincidir.
   *
   * El reservorio de empleados lleva CUIL, nombre y CBU: por eso se publica
   * cifrado y se abre en el navegador. Ver `cifrado.js`.
   */
  const respCifrado = await fetch(`${CARPETA_RESERVORIOS}/${encodeURIComponent(nombre)}.enc`, { cache: 'no-store' });
  if (!respCifrado.ok) throw new Error(`no se pudo leer «${nombre}» (${resp.status})`);

  /* Si lo que hay es el cifrado y el dato ya está guardado en esta
     computadora, no se pide la frase para llegar a lo mismo. */
  if (config.sinFrase) return null;

  const sobre = JSON.parse(new TextDecoder().decode(await respCifrado.arrayBuffer()));
  const frase = await pedirFrase(
    `Para abrir «${sobre.nombre || nombre}» hace falta la frase. Se escribe una vez por navegador.`
  );
  if (!frase) throw new Error('hace falta la frase; también se puede soltar el archivo a mano');

  try {
    const descifrado = await descifrarSobre(sobre, frase);
    return new File([descifrado.bytes], descifrado.nombre || nombre);
  } catch (error) {
    /* Con la frase equivocada se la olvida, para que el próximo intento la
       vuelva a pedir en vez de fallar para siempre con la misma. */
    olvidarFrase();
    throw error;
  }
}

/**
 * Los reservorios de una empresa, sacados de la carpeta.
 *
 * Devuelve `{ nombre, conceptos, empleados, excluidos, faltan }` o null si ese
 * CUIT no está en el índice. `conceptos` y `empleados` son File o null;
 * `faltan` enumera los que el índice nombra pero la carpeta no tiene, que es
 * el caso a avisar: el índice promete un archivo que no está.
 *
 * `excluidos` son los conceptos que esa empresa no pasa al libro. Es un dato
 * de la empresa, no del mes, así que vive acá y no en un campo que haya que
 * volver a tipear en cada liquidación.
 */
async function reservoriosDeLaCarpeta(cuit) {
  const indice = await indiceDeReservorios();
  const empresa = indice && indice.empresas && indice.empresas[String(cuit)];
  if (!empresa) return null;

  const salida = {
    nombre: empresa.nombre || '',
    conceptos: null,
    empleados: null,
    excluidos: Array.isArray(empresa.excluidos) ? empresa.excluidos.map(String) : [],
    alicuotas: empresa.alicuotas && typeof empresa.alicuotas === 'object' ? empresa.alicuotas : null,
    /* Las dos correcciones al archivo: ver `conceptosParaElArchivo`. */
    consolidar: empresa.consolidar && typeof empresa.consolidar === 'object' ? empresa.consolidar : null,
    aportesAlValorCalculado: Boolean(empresa.aportesAlValorCalculado),
    /*
     * El origen «un recibo por hoja»: la tabla de alias —descripcion del
     * recibo a codigo de concepto de la empresa— y los conceptos que no pasan
     * al libro, por descripcion. Van juntos porque los dos son del formato del
     * origen, no del mes. Ver `recibo-origen.js`.
     */
    recibos: empresa.recibos && typeof empresa.recibos === 'object' ? empresa.recibos : null,
    /*
     * La provincia donde trabaja la gente, cuando es una sola para toda la
     * empresa. Es el valor por defecto del credito fiscal del decreto 814: si
     * el reservorio de empleados trae la provincia del trabajador, manda esa.
     */
    provincia: String(empresa.provincia || ''),
    faltan: [],
  };
  for (const cual of ['conceptos', 'empleados']) {
    if (!empresa[cual]) continue;
    try {
      /*
       * Si el padrón ya está guardado en esta computadora y lo único que hay
       * en la carpeta es el cifrado, no se pide la frase: sería pedirla para
       * llegar al mismo dato. Devuelve null y el que llama cae solo a lo
       * guardado. Con el CSV en claro presente, en cambio, se lee siempre: la
       * carpeta es el original y lo guardado es la copia.
       */
      salida[cual] = await archivoDeReservorio(empresa[cual], {
        sinFrase: cual === 'empleados' && Boolean(padronGuardado(cuit)),
      });
    } catch (error) {
      salida.faltan.push(`${cual}: ${error.message}`);
    }
  }
  return salida;
}

function claveNovedades(cuit, periodo) {
  return `${String(cuit)}-${String(periodo)}`;
}

function guardarNovedades(cuit, periodo, novedades) {
  if (!cuit || !periodo) return false;
  const todas = leerGuardado(CLAVE_NOVEDADES);
  todas[claveNovedades(cuit, periodo)] = novedades;
  return escribirGuardado(CLAVE_NOVEDADES, todas);
}

function novedadesGuardadas(cuit, periodo) {
  const n = leerGuardado(CLAVE_NOVEDADES)[claveNovedades(cuit, periodo)];
  return Array.isArray(n) && n.length ? n : null;
}

/** Los períodos que ya tienen novedades guardadas para un CUIT, más nuevo primero. */
function periodosConNovedades(cuit) {
  const prefijo = `${String(cuit)}-`;
  return Object.keys(leerGuardado(CLAVE_NOVEDADES))
    .filter((k) => k.startsWith(prefijo))
    .map((k) => k.slice(prefijo.length))
    .sort()
    .reverse();
}

/* ---------- La ficha de Martín Prado ---------- */

/*
 * Todo lo de acá está verificado contra los ocho recibos de 2026, donde las
 * fórmulas del xlsm traen los porcentajes explícitos, y contra los libros
 * definitivos que ARCA aceptó. Es la única ficha que viene cargada: las demás
 * empresas se cargan a mano una vez y quedan guardadas.
 */
const FICHA_PRADO = {
  cuit: '20227823357',
  nombre: 'Martín Prado',
  convenio: 'SATSAID — Televisión por cable',
  /*
   * El convenio cuya escala es el PISO de esta liquidación (`convenios.js`).
   * Prado paga por encima —un punto más de antigüedad desde julio de 2026—,
   * así que la escala no liquida: controla.
   */
  convenioId: 'cct-223-75',

  /*
   * ARCA cuenta meses de 30 días, y el recibo divide por 30 y no por los días
   * corridos del calendario.
   */
  diasDelMes: 30,

  /*
   * El día de vacaciones sale de dividir el sueldo mensual por 25 y no por 30:
   * lo manda el artículo 155 de la Ley de Contrato de Trabajo. Por eso el día
   * de vacaciones vale más que el día trabajado.
   */
  divisorVacaciones: 25,

  /*
   * Los adicionales que son un porcentaje. Se calculan sobre el básico ya
   * prorrateado MÁS las vacaciones, que es lo que hace la fórmula del recibo
   * de febrero: `=+(E13+E14)*0.1`.
   */
  adicionales: [
    { codigo: '10', descripcion: 'Presentismo', porcentaje: 0.10 },
    { codigo: '12', descripcion: 'Zona', porcentaje: 0.30 },
  ],

  /*
   * La escala de antigüedad: **1 % por año cumplido**, según Agustín
   * (26/09/2026).
   *
   * Corroborada contra los ocho meses de 2026 empleado por empleado. De los 26
   * meses-empleado liquidados, 19 dan exacto con esta escala y 7 no:
   *
   *   · ENERO A MAYO cierra en los 15 casos, sin excepción.
   *     González y Quiroga 2 % con 2 años cumplidos, Adad 1 % con 1 año.
   *   · JUNIO cierra en González y Quiroga —los dos cumplen años en junio y
   *     pasaron a 3 %— y NO en Adad, que saltó a 2 % teniendo 1 año cumplido.
   *   · JULIO Y AGOSTO no cierran en ninguno: los tres llevan exactamente un
   *     punto de más (4 %, 4 % y 2 % donde la escala da 3 %, 3 % y 1 %).
   *
   * Los siete desvíos son todos del mismo signo y del mismo tamaño: un punto de
   * más, a partir de junio. La escala no los explica y no se los inventa acá.
   *
   * El porcentaje explícito de la novedad sigue teniendo prioridad sobre la
   * escala, así que los ocho meses se reproducen tal como se liquidaron.
   */
  antiguedad: { codigo: '14', descripcion: 'Antigüedad', porcentajePorAnio: 0.01 },

  /*
   * Los aportes del trabajador. La columna "%" de los recibos los trae
   * explícitos en los ocho meses.
   *
   * El 33 y el 34 van los dos al concepto ARCA 810004 (cuota sindical): son dos
   * códigos del contribuyente para el mismo concepto y ARCA los acepta como dos
   * renglones.
   *
   * `deLaSeguridadSocial` marca los que se recortan cuando el trabajador tiene
   * una base de aportes reducida. El sindical y el de F/A no son de seguridad
   * social: van siempre sobre la remuneración entera. Verificado en el libro
   * definitivo de 04, 05 y 06/2026, donde a Adad le recortaron los tres de
   * arriba y estos dos quedaron sobre el total.
   */
  aportes: [
    { codigo: '30', descripcion: 'Jubilación', alicuota: 0.11, deLaSeguridadSocial: true },
    { codigo: '31', descripcion: 'Ley 19032', alicuota: 0.03, deLaSeguridadSocial: true },
    { codigo: '32', descripcion: 'Obra Social', alicuota: 0.03, deLaSeguridadSocial: true },
    { codigo: '33', descripcion: 'Sindicato', alicuota: 0.03 },
    { codigo: '34', descripcion: 'F/A/Social', alicuota: 0.03 },
  ],

  /* Los códigos del contribuyente para los conceptos que el liquidador arma
     solo. Un código vacío significa "se paga y no se informa". */
  conceptos: {
    basico: { codigo: '1', descripcion: 'Sueldo Básico' },
    vacaciones: { codigo: '19', descripcion: 'Vacaciones' },
    sac: { codigo: '3', descripcion: 'SAC' },
    aCuenta: { codigo: '13', descripcion: 'A cta de Futuros Aumentos' },
    anr: { codigo: '910001', descripcion: 'ANR' },
    /*
     * El SAC de los no remunerativos no tiene concepto parametrizado: el
     * servicio no exporta ninguno para eso. Va al recibo pero no puede ir al
     * libro, y el liquidador lo dice en vez de perderlo en silencio.
     */
    sacNoRemunerativo: { codigo: '', descripcion: 'SAC no remunerativo' },
    /*
     * Los viáticos se pagan y no se informan. Decisión de Agustín del
     * 26/09/2026: salen de acuerdos NO HOMOLOGADOS, así que no van al libro.
     *
     * Si algún día se homologan, el concepto del contribuyente es el 11, y hay
     * que mirar antes su parametrización: hoy apunta a `110000 Sueldo`, que es
     * remunerativo en los quince subsistemas. Informarlos así sumaría
     * $ 190.153,77 a cada base de 08/2026 y $ 32.326,13 de aportes por empleado.
     */
    viaticos: { codigo: '', descripcion: 'Viáticos' },
    redondeo: { codigo: '20', descripcion: 'Redondeo' },
  },
};

/* Las fichas que vienen cargadas de fábrica, por CUIT. */
const FICHAS_DE_FABRICA = { '20227823357': FICHA_PRADO };

/**
 * La ficha de un CUIT: primero la guardada en esta computadora, después la de
 * fábrica. Devuelve null si no hay ninguna.
 */
function fichaDeEmpresa(cuit) {
  const clave = String(cuit || '').replace(/\D/g, '');
  return fichaDeCuit(clave) || FICHAS_DE_FABRICA[clave] || null;
}

/** Los CUIT que tienen ficha, para ofrecerlos en pantalla. */
function empresasConFicha() {
  const claves = new Set(Object.keys(FICHAS_DE_FABRICA).concat(Object.keys(fichasGuardadas())));
  return Array.from(claves)
    .map((cuit) => {
      const f = fichaDeEmpresa(cuit);
      return { cuit, nombre: (f && f.nombre) || cuit, guardada: !!fichaDeCuit(cuit) };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Controla una ficha antes de liquidar con ella. Devuelve los errores, que son
 * cosas que harían liquidar mal, y los avisos, que son cosas para mirar.
 *
 * Una ficha a medias es peor que ninguna: liquida números que parecen bien.
 */
function controlarFicha(ficha) {
  const errores = [];
  const avisos = [];
  if (!ficha) return { errores: ['No hay ficha de liquidación para esta empresa.'], avisos };

  if (!/^\d{11}$/.test(String(ficha.cuit || ''))) {
    errores.push('El CUIT de la ficha no tiene once dígitos.');
  }
  if (!(Number(ficha.diasDelMes) > 0)) errores.push('Falta los días del mes.');
  if (!(Number(ficha.divisorVacaciones) > 0)) errores.push('Falta el divisor de vacaciones.');
  if (!ficha.conceptos || !ficha.conceptos.basico || !ficha.conceptos.basico.codigo) {
    errores.push('Falta el código del concepto de sueldo básico.');
  }
  if (!Array.isArray(ficha.aportes) || !ficha.aportes.length) {
    errores.push('La ficha no tiene ningún aporte: el neto saldría igual al bruto.');
  }

  const tasa = (ficha.aportes || []).reduce((t, a) => t + (Number(a.alicuota) || 0), 0);
  if (tasa >= 1) {
    errores.push(
      `Los aportes suman ${(tasa * 100).toFixed(2)} %: el pasaje a bruto del "a cuenta" ` +
      'dividiría por cero o por un número negativo.'
    );
  }
  if (tasa > 0.30) {
    avisos.push(`Los aportes suman ${(tasa * 100).toFixed(2)} %, que es más de lo habitual.`);
  }

  for (const a of ficha.aportes || []) {
    if (!a.codigo) errores.push(`El aporte "${a.descripcion || 'sin nombre'}" no tiene código.`);
  }
  for (const h of ficha.adicionales || []) {
    if (!h.codigo) errores.push(`El adicional "${h.descripcion || 'sin nombre'}" no tiene código.`);
  }

  const sinInformar = Object.keys(ficha.conceptos || {})
    .map((k) => ficha.conceptos[k])
    .filter((c) => c && !c.codigo)
    .map((c) => c.descripcion);
  if (sinInformar.length) {
    avisos.push(
      `Se pagan y no se informan: ${sinInformar.join(', ')}. ` +
      'Salen en el recibo y quedan afuera de la planilla del libro.'
    );
  }

  return { errores, avisos };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FICHA_PRADO, FICHAS_DE_FABRICA,
    fichaDeEmpresa, empresasConFicha, controlarFicha,
    guardarFicha, fichaDeCuit, olvidarFicha, fichasGuardadas, memoriaDisponible,
    guardarPadron, padronGuardado,
    guardarParametrizacion, parametrizacionGuardada, olvidarReservorios,
    guardarNovedades, novedadesGuardadas, periodosConNovedades,
  };
}
