/* Motor de armado de estados contables.
   Toma el plan de exposición y los datos del ente, y devuelve los estados, los
   anexos, las notas y la planilla de controles. Es el port de
   herramientas/armar_eecc.py: si cambia uno, cambia el otro. */

(function (global) {
  "use strict";

  const TOL = 0.05;
  const RAIZ = "..";

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                 "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  /* ---------- formato ---------- */

  function pesos(x, decimales) {
    if (x === null || x === undefined) return "";
    const n = decimales === undefined ? 0 : decimales;
    if (Math.round(x * Math.pow(10, n)) === 0) x = 0;   // nada de "-0"
    return new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: n, maximumFractionDigits: n,
    }).format(x);
  }

  function porciento(x) {
    return new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(x * 100) + " %";
  }

  function fechaCorta(iso) {
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  }

  function fechaLarga(iso) {
    const [a, m, d] = iso.split("-");
    return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
  }

  /* ---------- carga ---------- */

  /* Sin caché: el plan y los datos del ente cambian todo el tiempo. Y antes que
     el disco, la bolsa: un ejercicio recién importado se lee de ahí, que es lo
     único que hay cuando la aplicación corre en línea. */
  async function json(ruta) {
    if (window.Bolsa) return window.Bolsa.json(ruta);
    const r = await fetch(ruta, { cache: "no-store" });
    if (!r.ok) throw new Error(`No pude leer ${ruta} (${r.status})`);
    return r.json();
  }

  async function cargar(ente, ejercicio, archivo) {
    const base = `${RAIZ}/datos/entes/${ente}`;
    const datos = {};
    datos.ente = await json(`${base}/ente.json`);
    datos.mapeo = await json(`${base}/mapeo-cuentas.json`);
    datos.saldos = await json(`${base}/${ejercicio}/${archivo || "saldos-generado.json"}`);
    datos.plan = await json(`${RAIZ}/esquema/plan-exposicion-${datos.ente.plan}.json`);
    datos.textos = await json(`${RAIZ}/esquema/textos-estudio.json`);
    return new Motor(datos);
  }

  /* Los estados armados **del diario**, sin archivo de saldos de por medio.
     `diario.js` ya tiene los asientos y los saldos: acá se los pasa al motor tal
     como están, así los libros y los estados no pueden decir cosas distintas.
     `opciones.historico` arma el diario sin el ajuste por inflación. */
  async function desdeDiario(ente, ejercicio, opciones) {
    const base = `${RAIZ}/datos/entes/${ente}`;
    const d = await window.LibroDiario.cargar(ente, ejercicio, opciones);
    const datos = {
      ente: d.ente,
      mapeo: d.d.mapeo,
      saldos: d.paraMotor(),
      plan: d.d.plan,
      textos: await json(`${RAIZ}/esquema/textos-estudio.json`),
    };
    const m = new Motor(datos);
    m.diario = d;
    return m;
  }

  /* ---------- motor ---------- */

  function Motor(d) {
    this.d = d;
    this.ente = d.ente;
    this.plan = d.plan;
    this.textos = d.textos;
    this.ejercicio = d.saldos.ejercicio;
    this.indice = d.saldos.indice;
    this.coef = this.indice.coeficiente;
    this.importes = {};
    this.notas = {};
    this.gastos = {};
    this.anexoBU = {};
    this.avisos = [];
    this.armar();
  }

  /* El signo con el que una cuenta entra a su renglón. Los pasivos y el
     patrimonio se exponen en positivo, y **todos los renglones del estado de
     resultados** se dan vuelta: así el estado se lee sumando de arriba abajo,
     un ingreso suma y un gasto resta, sin excepciones por renglón. Los gastos
     por naturaleza son la única excepción, porque el anexo los muestra en
     positivo y el estado los toma ya restados. */
  Motor.prototype.signo = function (linea) {
    if (/^(esp\.pc\.|esp\.pnc\.|eepn\.)/.test(linea)) return -1;
    if (linea.indexOf("er.") === 0) return -1;
    return 1;
  };

  Motor.prototype.v = function (linea, col) {
    const x = this.importes[linea];
    return x ? x[col] : 0;
  };

  Motor.prototype.suma = function (prefijo, col) {
    let t = 0;
    for (const k in this.importes) if (k.startsWith(prefijo)) t += this.importes[k][col];
    return t;
  };

  Motor.prototype.armar = function () {
    this.imputar();
    this.armarBienesUso();
    this.armarEstados();
    this.armarEEPN();
    this.armarEFE();
    this.controlar();
  };

  Motor.prototype.imputar = function () {
    const cierre = this.d.saldos.cierre;
    const apertura = Object.assign({}, this.d.saldos.apertura);
    delete apertura.nota;
    const cuentas = this.d.mapeo.cuentas;
    const todas = new Set(Object.keys(cierre).concat(Object.keys(apertura)));

    Array.from(todas).sort().forEach((cuenta) => {
      const m = cuentas[cuenta];
      if (!m) {
        if (Math.abs(cierre[cuenta] || 0) > TOL)
          this.avisos.push(`A05 · cuenta con saldo y sin mapear: ${cuenta}`);
        return;
      }
      const s = this.signo(m.linea);
      const actual = (cierre[cuenta] || 0) * s;
      const anterior = (apertura[cuenta] || 0) * this.coef * s;

      if (m.linea === "anexo.gastos_naturaleza") {
        const col = this.gastos[m.columna] || (this.gastos[m.columna] = {});
        col[m.concepto] = (col[m.concepto] || 0) + actual;
        return;
      }
      const acc = this.importes[m.linea] || (this.importes[m.linea] = { actual: 0, anterior: 0 });
      acc.actual += actual;
      acc.anterior += anterior;

      /* Las subcuentas van al diario y al mayor una por una, pero a la nota van
         sumadas en su cuenta: el concepto es el que agrupa. */
      if (m.concepto && m.linea.startsWith("esp.")) {
        const lista = this.notas[m.linea] || (this.notas[m.linea] = []);
        const ya = lista.find((x) => x.concepto === m.concepto);
        if (ya) { ya.actual += actual; ya.anterior += anterior; }
        else lista.push({ concepto: m.concepto, actual: actual, anterior: anterior });
      }
    });
  };

  Motor.prototype.armarBienesUso = function () {
    const apertura = this.d.saldos.apertura;
    const datos = Object.assign({}, this.d.saldos.anexo_bienes_uso);
    delete datos.nota;
    const porRubro = {};
    const cuentas = this.d.mapeo.cuentas;
    for (const cuenta in cuentas) {
      const m = cuentas[cuenta];
      if (!m.anexo_rubro) continue;
      (porRubro[m.anexo_rubro] || (porRubro[m.anexo_rubro] = {}))[m.anexo_campo] = cuenta;
    }
    for (const rubro in datos) {
      const d = datos[rubro];
      const c = porRubro[rubro];
      if (!c) throw new Error("El anexo de bienes de uso trae el rubro «" + rubro +
        "» pero ninguna cuenta del mapeo lo declara en anexo_rubro.");
      const valorInicio = (apertura[c.valor] || 0) * this.coef;
      const amortInicio = -(apertura[c.amortizacion] || 0) * this.coef;
      const valorCierre = valorInicio + d.altas - d.bajas;
      const amortEjercicio = d.tasa * valorCierre;
      const amortCierre = amortInicio - d.amort_bajas + amortEjercicio;
      this.anexoBU[rubro] = {
        rubro: rubro,
        valor_inicio: valorInicio, altas: d.altas, bajas: d.bajas,
        valor_cierre: valorCierre,
        amort_acum_inicio: amortInicio, amort_bajas: d.amort_bajas, tasa: d.tasa,
        amort_ejercicio: amortEjercicio, amort_acum_cierre: amortCierre,
        vnr_actual: valorCierre - amortCierre,
        vnr_anterior: valorInicio - amortInicio,
      };
    }
  };

  Motor.prototype.totalBU = function (campo) {
    let t = 0;
    for (const r in this.anexoBU) t += this.anexoBU[r][campo];
    return t;
  };

  Motor.prototype.armarEstados = function () {
    const comp = Object.assign({}, this.d.saldos.comparativo_resultados);
    delete comp.nota;

    for (const col in this.gastos) {
      let total = 0;
      for (const c in this.gastos[col]) total += this.gastos[col][c];
      const linea = `er.gastos.${col}`;
      this.importes[linea] = { actual: -total, anterior: comp[linea] || 0 };
    }
    /* Un renglón que sólo existe en la comparativa también es un renglón. Antes
       las columnas de gasto se saltaban acá, así que una columna sin gasto en el
       ejercicio actual perdía su comparativa entera: el estado mostraba cero
       donde el año pasado había un importe. */
    for (const linea in comp) {
      const acc = this.importes[linea] || (this.importes[linea] = { actual: 0, anterior: 0 });
      acc.anterior = comp[linea];
    }
    /* El anexo **no pisa** el renglón del balance. Pisarlo hacía que el control
       C08 —valor residual del anexo contra la línea del estado— fuera cierto por
       construcción, y con eso se tapaba cualquier diferencia: sin tasas de
       amortización declaradas el anexo da cero y el activo perdía los bienes de
       uso enteros sin que nada avisara. El renglón sale de las cuentas, el anexo
       de las tasas, y el control los compara de verdad. */

    this.calc = {};
    ["actual", "anterior"].forEach((col) => {
      const ac = this.suma("esp.ac.", col), anc = this.suma("esp.anc.", col);
      const pc = this.suma("esp.pc.", col), pnc = this.suma("esp.pnc.", col);
      const ingresos = this.suma("er.ingresos", col);
      const gastos = this.suma("er.gastos.", col);
      const resOper = ingresos + gastos;
      const antes = resOper + this.v("er.rfyt", col) + this.v("er.otros_ingresos", col);
      const resultado = antes + this.v("er.impuesto_ganancias", col);
      /* Los aportes son todo lo que va al patrimonio menos los resultados
         acumulados: capital, su ajuste, los aportes irrevocables, las primas.
         Sumar sólo capital y ajuste dejaba los aportes irrevocables afuera del
         patrimonio, y el balance no cerraba. */
      const aportes = this.suma("eepn.", col) - this.v("eepn.resultados_no_asignados", col);
      /* El saldo al inicio es el del cierre anterior. Si la cuenta se movió
         durante el ejercicio y no fue por el resultado, eso es una modificación
         de saldos de ejercicios anteriores y va en su propio renglón. */
      const acumInicio = this.v("eepn.resultados_no_asignados", "anterior");
      const modificacion = col === "actual"
        ? this.v("eepn.resultados_no_asignados", "actual") - acumInicio : 0;
      const acumulados = col === "actual"
        ? acumInicio + modificacion + resultado
        : this.v("eepn.resultados_no_asignados", col);
      this.calc[col] = {
        "esp.ac.total": ac, "esp.anc.total": anc, "esp.activo.total": ac + anc,
        "esp.pc.total": pc, "esp.pnc.total": pnc, "esp.pasivo.total": pc + pnc,
        "esp.pn": aportes + acumulados,
        "esp.pasivo_pn.total": pc + pnc + aportes + acumulados,
        "er.ingresos.total": ingresos,
        "er.resultado_operaciones": resOper,
        "er.antes_impuesto": antes,
        "er.resultado_ejercicio": resultado,
        "eepn.aportes_total": aportes,
        "eepn.acumulados_inicio": acumInicio,
        "eepn.modificacion": modificacion,
        "eepn.acumulados_cierre": acumulados,
      };
    });
  };

  /* El estado de evolución del patrimonio neto, armado con el plan: las columnas
     y los renglones los declara el plan de exposición, no el motor.

     Los resultados no asignados pueden moverse durante el ejercicio sin que sea
     el resultado del año: un ajuste de resultados de ejercicios anteriores. Eso
     no se puede esconder dentro del saldo inicial —el plan tiene el renglón
     «Modificación de saldos al inicio» para eso, y una nota que lo explica—, así
     que el saldo al inicio es el del cierre anterior y la diferencia sale a la
     luz en su propio renglón. */
  Motor.prototype.armarEEPN = function () {
    const c = this.calc;
    const def = this.plan.estados.eepn;
    const pnAnteriorCierre = c.anterior["esp.pn"];
    const resultadoAnterior = c.anterior["er.resultado_ejercicio"];
    const saldo = (id) => this.v("eepn." + id, "actual");

    const vivas = {};
    def.columnas.forEach((x) => {
      if (x.rol) return;
      if (x.siempre || Math.abs(saldo(x.id)) > TOL) vivas[x.id] = true;
    });
    const columnas = def.columnas.filter((x) => {
      if (x.rol === "total") return true;
      if (x.rol === "subtotal") return (x.suma || []).some((k) => vivas[k]);
      return vivas[x.id];
    });

    const aportes = c.actual["eepn.aportes_total"];
    const inicio = c.actual["eepn.acumulados_inicio"];
    const modificacion = c.actual["eepn.modificacion"];
    const resultado = c.actual["er.resultado_ejercicio"];

    /* Los aportes se leen en cada punta: el saldo al inicio es el del cierre
       anterior reexpresado, y el del cierre el de hoy. Si hubo suscripciones o
       devoluciones, la diferencia sale sola en «Movimientos del ejercicio»; si
       no hubo, ese renglón da cero y se muestra igual. */
    /* Cada subtotal suma **lo que su columna declara**, no todo lo que tiene a
       la izquierda. Mientras las reservas y el saldo por revaluación sólo se
       mostraban cuando tenían saldo, las dos cuentas daban lo mismo; desde que
       se muestran siempre, «Total» de los aportes tiene que seguir siendo el de
       los aportes. */
    const subtotales = (o) => {
      columnas.forEach((x) => {
        if (x.rol !== "subtotal") return;
        o[x.id] = (x.suma || []).reduce((t, k) => t + (o[k] || 0), 0);
      });
      return o;
    };
    const aportesEn = (col) => {
      const o = {};
      columnas.forEach((x) => {
        if (x.rol || x.id === "resultados_no_asignados") return;
        o[x.id] = this.v("eepn." + x.id, col);
      });
      return subtotales(o);
    };
    const aportesCierre = aportesEn("actual");
    /* El total de la fila: todas las columnas propias, sin los subtotales, que
       repetirían lo mismo. Los resultados no asignados se suman aparte. */
    const totalColumnas = (o) => columnas.reduce((t, x) =>
      (x.rol || x.id === "resultados_no_asignados" ? t : t + (o[x.id] || 0)), 0);
    /* El movimiento no es la diferencia entre los dos saldos: el capital nominal
       no se mueve y su reexpresión va al ajuste del capital, así que restar las
       puntas mostraría un movimiento que no existió. Lo que se movió lo dice el
       diario, y son sólo los asientos del ejercicio. */
    const mov = this.d.saldos.eepn_movimientos || {};
    const enColumnas = (fuente) => {
      const o = {};
      columnas.forEach((x) => {
        if (x.rol || x.id === "resultados_no_asignados") return;
        o[x.id] = -(fuente["eepn." + x.id] || 0);
      });
      return subtotales(o);
    };
    const movimientos = enColumnas(mov);

    /* La distribución de resultados que la planilla declaró, un renglón por
       clase. El concepto lo pone el plan; el orden, también. Lo que no se
       declara no se inventa: sigue cayendo en el ajuste de ejercicios
       anteriores, que es donde estaba antes de que esto existiera. */
    const dist = this.d.saldos.eepn_distribucion || {};
    const orden = (def.filas || []).map((f) => f.id)
      .filter((id) => id.indexOf("eepn.distribucion.") === 0);
    const clases = Object.keys(dist).sort((a, b) =>
      orden.indexOf("eepn.distribucion." + a) - orden.indexOf("eepn.distribucion." + b));
    const distribuciones = clases.map((k) => {
      const f = (def.filas || []).find((x) => x.id === "eepn.distribucion." + k);
      const o = enColumnas(dist[k]);
      o.id = "distribucion." + k;
      o.concepto = f ? f.concepto : "Distribución de utilidades";
      o.resultados_no_asignados = -(dist[k]["eepn.resultados_no_asignados"] || 0);
      o.total_actual = totalColumnas(o) + o.resultados_no_asignados;
      o.total_anterior = 0;
      return o;
    });
    /* El renglón del ajuste de ejercicios anteriores es lo que queda: todo lo
       que los resultados no asignados se movieron sin ser el resultado del
       ejercicio, menos lo que se declaró como distribución. */
    const area = modificacion - distribuciones.reduce(
      (t, o) => t + o.resultados_no_asignados, 0);

    const aportesInicio = {};
    columnas.forEach((x) => {
      if (x.rol || x.id === "resultados_no_asignados") return;
      aportesInicio[x.id] = aportesCierre[x.id] - movimientos[x.id] -
        distribuciones.reduce((t, o) => t + (o[x.id] || 0), 0);
    });
    subtotales(aportesInicio);

    /* Los renglones del estado están siempre, aunque den cero. Que un ejercicio
       no tenga ajuste de resultados anteriores no quiere decir que el renglón no
       exista: la ausencia también se informa, y quien lee el estado necesita ver
       que se miró. */
    const filas = [
      Object.assign({
        concepto: "Saldos al inicio del ejercicio",
        resultados_no_asignados: inicio,
        total_actual: totalColumnas(aportesInicio) + inicio,
        total_anterior: pnAnteriorCierre - resultadoAnterior,
      }, aportesInicio),
      {
        id: "area", concepto: "AREA",
        ref: Math.abs(area) > TOL ? "modificacion_ejercicios_anteriores" : null,
        resultados_no_asignados: area,
        total_actual: area,
        total_anterior: 0,
      },
      Object.assign({
        concepto: "Saldos al inicio modificados", rol: "subtotal",
        resultados_no_asignados: inicio + area,
        total_actual: totalColumnas(aportesInicio) + inicio + area,
        total_anterior: pnAnteriorCierre - resultadoAnterior,
      }, aportesInicio),
      Object.assign({
        concepto: "Movimientos del ejercicio",
        resultados_no_asignados: 0,
        total_actual: totalColumnas(aportesCierre) - totalColumnas(aportesInicio),
        total_anterior: 0,
      }, movimientos),
      ...(distribuciones.length ? distribuciones : [{
        concepto: "Distribución de utilidades",
        resultados_no_asignados: 0, total_actual: 0, total_anterior: 0,
      }]),
      {
        id: "resultado_ejercicio", concepto: "Resultado del ejercicio",
        resultados_no_asignados: resultado,
        total_actual: resultado,
        total_anterior: resultadoAnterior,
      },
      Object.assign({
        concepto: "Saldos al cierre del ejercicio", rol: "total",
        resultados_no_asignados: c.actual["eepn.acumulados_cierre"],
        total_actual: c.actual["esp.pn"],
        total_anterior: pnAnteriorCierre,
      }, aportesCierre),
    ];

    this.eepn = { columnas: columnas, filas: filas };
  };

  Motor.prototype.armarEFE = function () {
    const c = this.calc;
    const comp = Object.assign({}, this.d.saldos.comparativo_efe);
    delete comp.nota;
    const dif = (lineas) => lineas.reduce(
      (t, l) => t - ((this.v(l, "actual") - this.v(l, "anterior")) * (l.startsWith("esp.a") ? 1 : -1)), 0);

    /* La columna comparativa necesita los saldos de **dos** cierres atrás: la
       variación del ejercicio anterior es su cierre contra el anterior a él. Si
       el ejercicio no los declara, la columna queda en cero y se avisa. */
    const previo = this.d.saldos.comparativo_esp_anterior;
    const difAnterior = !previo ? null : (lineas) => lineas.reduce(
      (t, l) => t - ((this.v(l, "anterior") - (previo[l] || 0)) *
                     (l.startsWith("esp.a") ? 1 : -1)), 0);
    if (!previo) {
      this.avisos.push("A09 · el estado de flujo de efectivo sale sin columna comparativa: " +
        "faltan los saldos al cierre del ejercicio anterior al comparativo. Se declaran en " +
        "`comparativo.esp_anterior` del ejercicio.");
    }

    const efectivoActual = this.suma("esp.ac.caja_bancos", "actual");
    const efectivoAnterior = this.suma("esp.ac.caja_bancos", "anterior");
    const efectivoPrevio = previo ? (previo["esp.ac.caja_bancos"] || 0) : 0;
    /* La amortización del ejercicio anterior sale del anexo de gastos
       comparativo, que es donde está expuesta. */
    const gastosAnt = this.d.saldos.comparativo_gastos || {};
    const depreciacionAnterior = gastosAnt["Amortizaciones"] || 0;

    const CLIENTES = ["esp.ac.ctas_cobrar_clientes_moneda"];
    const OTROS_CRED = ["esp.ac.creditos_impositivos", "esp.ac.creditos_partes_relacionadas",
                        "esp.ac.otras_ctas_cobrar_moneda"];
    const FISCALES = ["esp.pc.deudas_fiscales"];
    const PROVEEDORES = ["esp.pc.proveedores"];
    const OTRAS_DEUDAS = ["esp.pc.deudas_partes_relacionadas", "esp.pc.otras_deudas"];
    const INVERSIONES = ["esp.ac.inversiones_financieras"];

    /* Cada renglón declara cómo se calcula en las dos columnas. La del ejercicio
       anterior sale de los mismos renglones, corridos un ejercicio. */
    const op = [
      ["efe.op.resultado", "Resultado del ejercicio antes del impuesto a las ganancias",
       c.actual["er.antes_impuesto"], c.anterior["er.antes_impuesto"]],
      ["efe.op.impuesto", "Impuesto a las ganancias devengado en el ejercicio",
       this.v("er.impuesto_ganancias", "actual"), this.v("er.impuesto_ganancias", "anterior")],
      ["efe.op.modificacion", "Modificación de saldos de ejercicios anteriores",
       c.actual["eepn.modificacion"], 0],
      ["efe.op.ajustes.depreciaciones", "Depreciación de bienes de uso",
       this.totalBU("amort_ejercicio"), depreciacionAnterior],
      ["efe.op.var.clientes", "(Aumento) disminución en cuentas por cobrar a clientes",
       dif(CLIENTES), difAnterior && difAnterior(CLIENTES)],
      ["efe.op.var.otros_creditos", "(Aumento) disminución en otros créditos",
       dif(OTROS_CRED), difAnterior && difAnterior(OTROS_CRED)],
      ["efe.op.var.deudas_fiscales", "Aumento (disminución) en deudas fiscales",
       dif(FISCALES), difAnterior && difAnterior(FISCALES)],
      ["efe.op.var.proveedores", "Aumento (disminución) en cuentas por pagar comerciales",
       dif(PROVEEDORES), difAnterior && difAnterior(PROVEEDORES)],
      ["efe.op.var.otras_deudas", "Aumento (disminución) en otras deudas",
       dif(OTRAS_DEUDAS), difAnterior && difAnterior(OTRAS_DEUDAS)],
    ];
    const inv = [
      ["efe.inv.bienes_uso_altas", "Pagos por compra de bienes de uso",
       -this.totalBU("altas"), 0],
      ["efe.inv.var.inversiones", "(Aumento) disminución en inversiones",
       dif(INVERSIONES), difAnterior && difAnterior(INVERSIONES)],
    ];
    /* Si el ejercicio declara un importe para un renglón del comparativo, manda
       ese: es el que salió publicado. */
    const arm = (filas) => filas.map((f) => ({
      id: f[0], concepto: f[1], actual: f[2],
      anterior: comp[f[0]] !== undefined ? comp[f[0]]
        : (previo ? (f[3] || 0) : 0),
    }));

    const operativas = arm(op), inversion = arm(inv);
    const tot = (filas, col) => filas.reduce((t, f) => t + f[col], 0);

    this.efe = {
      efectivo: { inicio_actual: efectivoAnterior, inicio_anterior: efectivoPrevio,
                  cierre_actual: efectivoActual, cierre_anterior: efectivoAnterior },
      secciones: [
        { titulo: "ACTIVIDADES OPERATIVAS", filas: operativas,
          total: "Flujo neto de efectivo generado por (aplicado en) actividades operativas",
          total_actual: tot(operativas, "actual"), total_anterior: tot(operativas, "anterior") },
        { titulo: "ACTIVIDADES DE INVERSIÓN", filas: inversion,
          total: "Flujo neto de efectivo generado por (aplicado en) actividades de inversión",
          total_actual: tot(inversion, "actual"), total_anterior: tot(inversion, "anterior") },
      ],
    };
    this.efe.total_actual = tot(operativas, "actual") + tot(inversion, "actual");
    this.efe.total_anterior = tot(operativas, "anterior") + tot(inversion, "anterior");
  };

  /* ---------- controles ---------- */

  Motor.prototype.controlar = function () {
    const c = this.calc, r = [];
    const add = (id, desc, esperado, obtenido, bloqueante) =>
      r.push({ id, descripcion: desc, esperado, obtenido,
               diferencia: obtenido - esperado, bloqueante: bloqueante !== false });

    ["actual", "anterior"].forEach((col) => {
      add("C01", `Activo = Pasivo + Patrimonio neto (${col})`,
          c[col]["esp.activo.total"], c[col]["esp.pasivo_pn.total"]);
    });
    /* Los renglones del EEPN se buscan por lo que son, no por su posición: un
       ente con modificación de saldos al inicio tiene dos renglones más. */
    /* Los renglones del estado se buscan por su `id`, nunca por lo que dicen: un
       control que depende de un rótulo se rompe en silencio el día que el rótulo
       cambia, y cambiar un rótulo es lo más inocente que hay. */
    const delEEPN = (rol, id) => {
      const f = this.eepn.filas.find((x) => (rol ? x.rol === rol : x.id === id));
      return f ? f.total_actual : 0;
    };
    add("C02", "Patrimonio neto del ESP = cierre del EEPN",
        c.actual["esp.pn"], delEEPN("total"));
    add("C03", "Resultado del ER = línea del EEPN",
        c.actual["er.resultado_ejercicio"], delEEPN(null, "resultado_ejercicio"));
    add("C05", "Suma de saldos del ejercicio = 0",
        0, Object.values(this.d.saldos.cierre).reduce((a, b) => a + b, 0));
    add("C06", "Efectivo al cierre del EFE = caja y bancos del ESP",
        this.suma("esp.ac.caja_bancos", "actual"), this.efe.efectivo.cierre_actual);
    add("C07", "Variación neta del EFE = cierre menos inicio (actual)",
        this.efe.efectivo.cierre_actual - this.efe.efectivo.inicio_actual, this.efe.total_actual);
    /* La columna comparativa también tiene que cerrar: si no, el flujo del
       ejercicio anterior está diciendo cualquier cosa. Sólo se controla cuando
       el ejercicio declara los saldos de dos cierres atrás. */
    if (this.d.saldos.comparativo_esp_anterior) {
      add("C07b", "Variación neta del EFE = cierre menos inicio (anterior)",
          this.efe.efectivo.cierre_anterior - this.efe.efectivo.inicio_anterior,
          this.efe.total_anterior);
    }
    add("C08", "Valor residual del Anexo III = línea del ESP",
        this.v("esp.anc.bienes_uso", "actual"), this.totalBU("vnr_actual"));
    add("C09", "Depreciación del Anexo III = línea del Anexo VIII",
        this.totalBU("amort_ejercicio"),
        (this.gastos.comercializacion && this.gastos.comercializacion["Amortizaciones"]) || 0);

    ["comercializacion", "administracion", "fiscales", "financieros"].forEach((col) => {
      if (!this.gastos[col]) return;
      let t = 0;
      for (const k in this.gastos[col]) t += this.gastos[col][k];
      add("C10", `Columna ${col} del Anexo VIII = línea del ER`,
          -this.v(`er.gastos.${col}`, "actual"), t);
    });

    const compG = Object.assign({}, this.d.saldos.comparativo_gastos);
    delete compG.nota;
    if (Object.keys(compG).length) {
      let t = 0;
      for (const k in compG) t += compG[k];
      add("C10", "Anexo VIII comparativo = gastos del ER del ejercicio anterior",
          -this.suma("er.gastos.", "anterior"), t);
    }

    for (const linea in this.notas) {
      let a = 0;
      this.notas[linea].forEach((x) => { a += x.actual; });
      add("C11", `Total de la nota = rubro ${linea}`, this.v(linea, "actual"), a);
    }

    this.controles = r;
    this.fallan = r.filter((x) => Math.abs(x.diferencia) > TOL);
  };

  /* ---------- variables de texto ---------- */

  /* El informe sobre otros requerimientos legales y reglamentarios.

     El apartado a) es el único que cambia de un ente a otro: declara la deuda
     con el Sistema Integrado Previsional Argentino al cierre. Una empresa sin
     empleados no la tiene y el párrafo lo dice; una con empleados la tiene y hay
     que decir cuánto. **La cuenta la marca el plan** —columna «Previsional»— y
     no se adivina: en el renglón de deudas laborales también está el sueldo a
     pagar, que no es deuda con el SIPA.

     El apartado b) no depende de nada: al firmar el informe los libros todavía
     no están transcriptos, y eso no cambia entre entes. */
  Motor.prototype.otrosRequerimientos = function () {
    if (this._otrosReq) return this._otrosReq;
    const cuentas = this.d.mapeo.cuentas || {};
    const cierre = (this.d.saldos.cierre) || {};
    let previsional = 0, marcadas = 0;
    const laborales = [];
    Object.keys(cuentas).forEach((c) => {
      const saldo = cierre[c];
      const esLaboral = /^esp\.(pc|pnc)\.deudas_laborales/.test(cuentas[c].linea || "");
      if (cuentas[c].previsional) {
        marcadas++;
        previsional += Math.abs(saldo || 0);
      } else if (esLaboral && Math.abs(saldo || 0) > TOL) {
        laborales.push(c);
      }
    });
    /* Hay deudas laborales con saldo y ninguna dice ser previsional: puede estar
       bien —sueldos a pagar, vacaciones— pero también puede ser una marca que
       falta, y el párrafo saldría diciendo que no hay deuda. Se avisa. */
    if (!marcadas && laborales.length) {
      this.avisos.push("El informe sobre otros requerimientos va a decir que no hay deuda " +
        "previsional al cierre, pero estas cuentas de deudas laborales tienen saldo: " +
        laborales.join(", ") + ". Si alguna es aporte o contribución al SIPA, hay que " +
        "marcarla en la columna «Previsional» del plan de cuentas.");
    }
    return (this._otrosReq = {
      deuda_previsional: previsional,
      parrafos: [previsional > TOL ? "sipa_con_deuda" : "sipa_sin_deuda",
                 "libros_no_transcriptos"],
    });
  };

  Motor.prototype.variables = function () {
    const e = this.ejercicio;
    const datos = this.ente.datos[this.ente.datos.length - 1];
    return {
      denominacion: this.ente.denominacion,
      cuit: this.ente.cuit,
      consejo: "Chubut",
      /* Las tres categorías de la FACPCE. La tercera no tiene nombre propio en la
         norma: es la que queda cuando el ente no es pequeño ni mediano. */
      clasificacion: this.ente.clasificacion === "pequena" ? "entidad pequeña"
                   : this.ente.clasificacion === "mediana" ? "entidad mediana"
                   : "entidad no pequeña ni mediana",
      domicilio_legal: datos.domicilio_legal,
      tratamiento_firmante: (datos.firmantes[0] || {}).tratamiento || "Señores",
      cierre_corto: fechaCorta(e.cierre),
      cierre_largo: fechaLarga(e.cierre),
      cierre_anterior_corto: fechaCorta(e.cierre_anterior),
      cierre_anterior_largo: fechaLarga(e.cierre_anterior),
      variacion_actual: porciento(this.indice.variacion_actual),
      variacion_anterior: porciento(this.indice.variacion_anterior),
      deuda_previsional: "$ " + pesos(this.otrosRequerimientos().deuda_previsional, 2),
    };
  };

  Motor.prototype.completar = function (texto, extra) {
    const v = Object.assign(this.variables(), extra || {});
    return texto.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  };

  global.Motor = { cargar, desdeDiario, pesos, porciento, fechaCorta, fechaLarga, TOL };
})(window);
