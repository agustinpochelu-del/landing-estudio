/**
 * Las escalas salariales de convenio.
 *
 * Son el PISO. Lo que se liquida lo decide el empleador y puede estar por
 * encima —Martín Prado paga un punto más de antigüedad desde julio de 2026—,
 * pero nunca por debajo. Esta tabla existe para poder controlarlo antes de que
 * el recibo salga, no para liquidar con ella.
 *
 * ── Reglas rojas ──────────────────────────────────────────────────────────
 *
 * 1. **Cada escala sale del acuerdo paritario, y el acuerdo va citado.** Igual
 *    que los topes: se probó deducir el tope por bisección y estuvo mal dos
 *    meses seguidos. Un piso mal cargado es peor que no tener piso, porque da
 *    tranquilidad falsa.
 * 2. **Todo en centavos enteros**, como en el resto del proyecto.
 * 3. **Nada se interpola ni se proyecta.** Si el período que se liquida es
 *    posterior a la última escala cargada, el control lo dice y no controla.
 */

const CONVENIOS = [
  {
    id: 'cct-223-75',
    nombre: 'CCT 223/75 — SATSAID / ATVC',
    descripcion: 'Televisión por cable. Es el convenio de Martín Prado.',

    /*
     * Una entrada por escala vigente, de la más vieja a la más nueva. `desde`
     * es el primer período que le corresponde; rige hasta que empieza la
     * siguiente.
     */
    escalas: [
      {
        desde: '202608',
        fuente: 'Acuerdo ATVC-SATSAID del 31/08/2026, Anexo A — escala agosto 2026',
        /*
         * El aumento del 2,1 % del art. 3.1 se paga como ASIGNACIÓN NO
         * REMUNERATIVA hasta el 30/09/2026 (art. 4). Por eso la columna `anr`:
         * no está adentro del básico todavía.
         */
        nota:
          'El 2,1 % del acuerdo va como asignación no remunerativa hasta el ' +
          '30/09/2026. Desde el 01/10/2026 se convierte en remunerativa y rige ' +
          'la escala siguiente.',
        grupos: {
          1:  { basico: 176617178, presentismo: 17661718, viatico: 19015377, anr: 3663208 },
          2:  { basico: 167210674, presentismo: 16721067, viatico: 19015377, anr: 3489376 },
          3:  { basico: 157261958, presentismo: 15726196, viatico: 19015377, anr: 3305524 },
          4:  { basico: 148445408, presentismo: 14844541, viatico: 19015377, anr: 3142594 },
          5:  { basico: 140013758, presentismo: 14001376, viatico: 19015377, anr: 2986777 },
          6:  { basico: 132167083, presentismo: 13216708, viatico: 19015377, anr: 2841771 },
          7:  { basico: 124700297, presentismo: 12470030, viatico: 19015377, anr: 2703784 },
          8:  { basico: 117608353, presentismo: 11760835, viatico: 19015377, anr: 2572725 },
          9:  { basico: 110898891, presentismo: 11089889, viatico: 19015377, anr: 2448734 },
          10: { basico: 102844746, presentismo: 10284475, viatico: 19015377, anr: 2299894 },
          11: { basico:  97097589, presentismo:  9709759, viatico: 19015377, anr: 2193686 },
          12: { basico:  91635717, presentismo:  9163572, viatico: 19015377, anr: 2092751 },
        },
        /*
         * La antigüedad: **1 % por año cumplido**, confirmado por Agustín el
         * 26/09/2026.
         *
         * OJO CON ESTO. El Anexo A no la publica como porcentaje sino como un
         * importe único, $ 17.661,72, en un renglón aparte debajo de los doce
         * grupos. Ese importe es exactamente el 1 % del básico del GRUPO 1, y
         * en la escala convertida sube al 1 % del grupo 1 convertido
         * ($ 18.032,61 = 17.661,72 × 1,021), lo que confirma que el criterio es
         * "1 % del básico".
         *
         * Lo que el acuerdo NO dice es de qué básico: el del grupo 1 para
         * todos, o el de cada uno. Acá se toma **el de cada uno**, que es el
         * criterio que liquida el sistema de Prado. Si fuera el del grupo 1
         * para todos, el piso de los grupos 2 a 12 sería MÁS ALTO que el que
         * calcula este control, y los cuatro empleados de Prado estarían por
         * debajo. Está anotado como pendiente, no resuelto por cuenta propia.
         */
        antiguedadPorAnio: 0.01,
        antiguedadImportePublicado: 1766172,
        tituloSecundario: 8360534,
        tituloTerciario: 16721067,
      },

      {
        desde: '202610',
        fuente:
          'Acuerdo ATVC-SATSAID del 31/08/2026, Anexo A — escala convertida en ' +
          'remunerativo, vigente desde el 01/10/2026 (art. 4)',
        nota:
          'El 2,1 % pasó a ser remunerativo y está adentro del básico: por eso ' +
          'ya no hay columna de asignación no remunerativa.',
        /*
         * Los importes son los que PUBLICA el Anexo A, no los que sale de
         * multiplicar la escala de agosto por 1,021. Seis de los doce grupos
         * difieren en un centavo, y en las dos direcciones: los grupos 1, 4 y 9
         * publican uno menos, y los 3, 7 y 11 uno más. Es el redondeo propio
         * del acuerdo y manda el acuerdo.
         */
        grupos: {
          1:  { basico: 180326138, presentismo: 18032614, viatico: 19414700, anr: 0 },
          2:  { basico: 170722098, presentismo: 17072210, viatico: 19414700, anr: 0 },
          3:  { basico: 160564460, presentismo: 16056446, viatico: 19414700, anr: 0 },
          4:  { basico: 151562761, presentismo: 15156276, viatico: 19414700, anr: 0 },
          5:  { basico: 142954047, presentismo: 14295405, viatico: 19414700, anr: 0 },
          6:  { basico: 134942592, presentismo: 13494259, viatico: 19414700, anr: 0 },
          7:  { basico: 127319004, presentismo: 12731900, viatico: 19414700, anr: 0 },
          8:  { basico: 120078128, presentismo: 12007813, viatico: 19414700, anr: 0 },
          9:  { basico: 113227767, presentismo: 11322777, viatico: 19414700, anr: 0 },
          10: { basico: 105004486, presentismo: 10500449, viatico: 19414700, anr: 0 },
          11: { basico:  99136639, presentismo:  9913664, viatico: 19414700, anr: 0 },
          12: { basico:  93560067, presentismo:  9356007, viatico: 19414700, anr: 0 },
        },
        antiguedadPorAnio: 0.01,
        antiguedadImportePublicado: 1803261,
        tituloSecundario: 8536105,
        tituloTerciario: 17072210,
      },
    ],
  },
];

/* ---------- Consultas ---------- */

function convenioPorId(id) {
  return CONVENIOS.find((c) => c.id === id) || null;
}

/**
 * La escala del convenio vigente en un período. Devuelve null si el período es
 * anterior a la primera escala cargada o posterior a la última.
 *
 * Que devuelva null para los períodos futuros es a propósito: **el piso no se
 * proyecta**. Una paritaria no se puede adivinar, y un piso viejo aplicado a un
 * mes nuevo da tranquilidad falsa.
 */
function escalaVigente(convenio, periodo) {
  if (!convenio || !convenio.escalas || !convenio.escalas.length) return null;
  const p = String(periodo || '').replace(/\D/g, '');
  if (p.length !== 6) return null;

  let elegida = null;
  for (const e of convenio.escalas) {
    if (e.desde <= p) elegida = e;
  }
  return elegida;
}

/** El último período con escala cargada, para avisar hasta dónde llega. */
function ultimoPeriodoConEscala(convenio) {
  if (!convenio || !convenio.escalas || !convenio.escalas.length) return '';
  return convenio.escalas[convenio.escalas.length - 1].desde;
}

/**
 * Cuántos meses pasaron desde que empezó a regir la última escala cargada.
 *
 * Es lo que permite avisar que el convenio se está quedando viejo sin tener que
 * salir a buscar nada: las paritarias de esta actividad vienen cerrando cada
 * dos o tres meses, así que una escala de hace cuatro casi seguro quedó atrás.
 */
function mesesDesdeLaUltimaEscala(convenio, periodo) {
  const ultima = ultimoPeriodoConEscala(convenio);
  const p = String(periodo || '').replace(/\D/g, '');
  if (!ultima || p.length !== 6) return 0;
  const meses = (a) => Number(a.slice(0, 4)) * 12 + Number(a.slice(4, 6));
  return meses(p) - meses(ultima);
}

/**
 * Adivina el grupo salarial de un empleado por su sueldo básico.
 *
 * Sirve para no tener que cargar la categoría a mano cuando el empleador paga
 * exactamente el básico de convenio, que es el caso de los cuatro empleados de
 * Prado. Solo devuelve un grupo si el importe COINCIDE EXACTO con el de la
 * escala: si paga por encima no hay forma de saber de qué grupo es, y adivinar
 * el grupo más bajo que entra daría un piso más bajo que el que corresponde.
 */
function grupoPorBasico(escala, basicoCentavos) {
  if (!escala || !basicoCentavos) return null;
  for (const g of Object.keys(escala.grupos)) {
    if (escala.grupos[g].basico === basicoCentavos) return Number(g);
  }
  return null;
}

/**
 * Controla una liquidación contra el piso del convenio.
 *
 * `trabajadores` son los que devolvió el liquidador; `novedades`, las del mes;
 * `grupos`, un objeto { cuil: grupo } con la categoría de cada uno.
 *
 * Devuelve { controlados, sinGrupo, hallazgos, avisos }, donde cada hallazgo es
 * un concepto que quedó POR DEBAJO del convenio. Lo que está por encima no es
 * un hallazgo: el empleador puede pagar de más y es lo que hace Prado.
 */
function controlarContraConvenio(trabajadores, novedades, grupos, escala) {
  const hallazgos = [];
  const avisos = [];
  const sinGrupo = [];
  let controlados = 0;

  if (!escala) {
    return {
      controlados: 0, sinGrupo: [], hallazgos: [],
      avisos: ['No hay escala de convenio cargada para este período: no se controló el piso.'],
    };
  }

  const porCuil = new Map(novedades.map((n) => [n.cuil, n]));

  for (const t of trabajadores) {
    const n = porCuil.get(t.cuil) || {};
    const quien = t.nombre || t.cuil;
    const grupo = grupos[t.cuil];
    const piso = grupo ? escala.grupos[grupo] : null;
    if (!piso) {
      sinGrupo.push(quien);
      continue;
    }
    controlados += 1;

    /* El piso se prorratea por los días liquidados, igual que el haber. */
    const dias = Number(n.dias) || 30;
    const proporcion = (importe) => Math.round((importe * dias) / 30);

    const sumaDe = (codigos) => t.conceptos
      .filter((c) => codigos.indexOf(String(c.codigo)) >= 0)
      .reduce((s, c) => s + c.importe, 0);

    const anios = Number(n.aniosAntiguedad) || 0;
    const comparar = (que, liquidado, minimo, detalle) => {
      if (!minimo) return;
      if (liquidado >= minimo) return;
      hallazgos.push({
        cuil: t.cuil, nombre: quien, grupo, concepto: que,
        liquidado, minimo, diferencia: minimo - liquidado, detalle,
      });
    };

    const prorrateo = dias !== 30 ? `, prorrateado por ${dias} días` : '';
    comparar('Sueldo básico', sumaDe(['1']), proporcion(piso.basico),
      `el básico de la escala${prorrateo}`);
    comparar('Presentismo', sumaDe(['10']), proporcion(piso.presentismo),
      `10 % del básico de convenio${prorrateo}`);
    comparar('Viáticos', sumaDe(['11', '']), proporcion(piso.viatico),
      `el viático del Anexo A, igual para todos los grupos${prorrateo}`);
    comparar('Asignación no remunerativa', sumaDe(['910001']), proporcion(piso.anr),
      `la del acuerdo para este grupo${prorrateo}`);

    if (anios) {
      comparar('Antigüedad', sumaDe(['14']),
        proporcion(Math.round(piso.basico * escala.antiguedadPorAnio * anios)),
        `${anios} ${anios === 1 ? 'año' : 'años'} × ` +
        `${(escala.antiguedadPorAnio * 100).toLocaleString('es-AR')} % del básico de convenio` +
        prorrateo);
    }
  }

  if (sinGrupo.length) {
    avisos.push(
      `Sin grupo salarial, no se les pudo controlar el piso: ${sinGrupo.join(', ')}. ` +
      'Cargá la categoría en el legajo, o revisá que el básico coincida con el de la escala.'
    );
  }

  return { controlados, sinGrupo, hallazgos, avisos };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONVENIOS, convenioPorId, escalaVigente, ultimoPeriodoConEscala,
    mesesDesdeLaUltimaEscala, grupoPorBasico, controlarContraConvenio,
  };
}
