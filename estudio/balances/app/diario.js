/* El diario y el mayor.

   Los asientos no están escritos acá: acá están las **plantillas**. Cada ente
   declara en su `ejercicio.json` qué asientos arma, en qué orden y con qué
   cuentas. Así Mordor arma once y Lima Sur, mientras falten los extractos, arma
   tres, con el mismo motor.

   `herramientas/armar_diario.py` es el prototipo que probó el caso Mordor y
   quedó congelado en esa forma: sigue reproduciendo Mordor, pero la lógica
   general vive acá.

   El mayor no es un dato aparte: es el diario ordenado por cuenta. */

(function (global) {
  "use strict";

  const RAIZ = "..";
  const TOL = 0.05;

  /* ---------- carga ---------- */

  /* Antes que el disco, la bolsa: ver `app/bolsa.js`. */
  async function json(ruta) {
    if (window.Bolsa) return window.Bolsa.json(ruta);
    const r = await fetch(ruta, { cache: "no-store" });
    if (!r.ok) throw new Error(`No pude leer ${ruta} (${r.status})`);
    return r.json();
  }

  async function cargar(ente, ejercicio, opciones) {
    const base = `${RAIZ}/datos/entes/${ente}`;
    const d = { slug: ente };
    d.ente = await json(`${base}/ente.json`);
    d.mapeo = await json(`${base}/mapeo-cuentas.json`);
    d.ej = await json(`${base}/${ejercicio}/ejercicio.json`);
    d.f = await json(`${base}/${ejercicio}/fuentes.json`);
    d.plan = await json(`${RAIZ}/esquema/plan-exposicion-${d.ente.plan}.json`);
    d.ley25413 = await json(`${RAIZ}/esquema/impuesto-ley-25413.json`);
    d.ganancias = await json(`${RAIZ}/esquema/impuesto-ganancias.json`);
    return new Diario(d, opciones);
  }

  const esNotaCredito = (tipo) => String(tipo).toLowerCase().indexOf("nota de cr") >= 0;

  /* ---------- el diario ---------- */

  /* `opciones.historico` arma el diario **sin el ajuste por inflación**: los
     mismos asientos, menos los de reexpresión. Es el diario a valores de origen,
     que es de donde arranca la determinación del impuesto a las ganancias. */
  function Diario(d, opciones) {
    this.d = d;
    this.historico = !!(opciones || {}).historico;
    this.ente = d.ente;
    this.ej = d.ej;
    this.f = d.f;
    this.p = d.ej.parametros || {};

    this.apertura = {};
    for (const k in d.ej.apertura) if (k !== "nota") this.apertura[k] = d.ej.apertura[k];

    this.indice = {};
    d.f.indices.forEach((i) => { this.indice[i.periodo] = i.indice; });
    this.iCierre = this.indice[d.ej.cierre.slice(0, 7)];
    this.pap = this.iCierre / this.indice[d.ej.cierre_anterior.slice(0, 7)];

    this.asientos = [];
    this.altas = {};
    this.amortHistorica = {};
    this.amortAjustada = {};
    this.armar();
  }

  /* ---------- utilidades ---------- */

  Diario.prototype.coef = function (fecha) {
    return this.iCierre / this.indice[fecha.slice(0, 7)];
  };

  Diario.prototype.enEjercicio = function (fecha) {
    return this.ej.inicio <= fecha && fecha <= this.ej.cierre;
  };

  /* Un asiento del libro: una fecha, una glosa y una línea por cuenta.
     movimientos llega como [cuenta, importe]; positivo al debe, negativo al haber. */
  /* Una ranura puede cambiar de cuenta dentro del ejercicio: en vez de un nombre
     trae los tramos, y el que manda es el de la fecha del asiento. */
  function enFecha(cuenta, fecha) {
    if (!cuenta || typeof cuenta === "string") return cuenta;
    const t = (cuenta.tramos || []).find((x) =>
      (!x.desde || x.desde <= fecha) && (!x.hasta || fecha <= x.hasta));
    return t ? t.cuenta : null;
  }

  Diario.prototype.asentar = function (a, movimientos) {
    const orden = [], por = {};
    /* Un movimiento cuya ranura quedó sin cuenta no se puede asentar. Antes se
       descartaba en silencio y el asiento salía descuadrado sin que se supiera
       por qué: ahora se acumula y se dice. */
    let sinCuenta = 0;
    movimientos.forEach((mv) => {
      const cuenta = enFecha(mv[0], a.fecha), importe = mv[1];
      if (Math.abs(importe) <= 1e-9) return;
      if (!cuenta) { sinCuenta += importe; return; }
      if (!(cuenta in por)) { por[cuenta] = 0; orden.push(cuenta); }
      por[cuenta] += importe;
    });
    if (Math.abs(sinCuenta) > 1e-9) a.sinCuenta = sinCuenta;
    const lineas = orden
      .filter((c) => Math.abs(por[c]) > 1e-9)
      .map((c) => ({ cuenta: c, debe: por[c] > 0 ? por[c] : 0, haber: por[c] < 0 ? -por[c] : 0 }));
    a.numero = this.asientos.length + 1;
    a.lineas = lineas;
    a.debe = lineas.reduce((t, l) => t + l.debe, 0);
    a.haber = lineas.reduce((t, l) => t + l.haber, 0);
    a.diferencia = a.debe - a.haber;
    this.asientos.push(a);
    return a;
  };

  Diario.prototype.comprasDel = function (concepto) {
    return this.f.compras
      .filter((c) => c.concepto === concepto)
      .reduce((t, c) => t + importeCompra(c), 0);
  };

  Diario.prototype.conceptosDeCompras = function () {
    return Array.from(new Set(this.f.compras.map((c) => c.concepto)))
      .filter(Boolean).sort();
  };

  /* El total del comprobante y el IVA son los datos duros; el neto es el resto.
     Así se ignora el neto no gravado espurio que a veces trae la exportación de
     ARCA duplicando el IVA. */
  function importeCompra(c) {
    const base = (c.total || 0) - (c.iva || 0);
    return esNotaCredito(c.tipo) ? -base : base;
  }

  function ivaCompra(c) {
    const iva = c.iva || 0;
    return esNotaCredito(c.tipo) ? -iva : iva;
  }

  /* ---------- el armado: lo que declara el ejercicio ---------- */

  /* Cada entrada de `asientos` nombra una plantilla y le pasa sus cuentas. Los
     nombres de cuenta se buscan primero en el diccionario `cuentas` del
     ejercicio; si no están, se toman literales. */
  Diario.prototype.resolver = function (cfg) {
    const dic = this.ej.cuentas || {};
    const c = {};
    for (const rol in (cfg.cuentas || {})) {
      const v = cfg.cuentas[rol];
      c[rol] = (v in dic) ? dic[v] : v;
    }
    return c;
  };

  Diario.prototype.armar = function () {
    const lista = this.ej.asientos;
    if (!lista || !lista.length) {
      throw new Error(`${this.ej.ente} ${this.ej.cierre.slice(0, 4)}: el ejercicio no ` +
                      "declara ningún asiento. Se declaran en ejercicio.json, en `asientos`.");
    }
    lista.forEach((cfg) => {
      const plantilla = PLANTILLAS[cfg.template];
      if (!plantilla) {
        throw new Error(`No conozco el asiento "${cfg.template}". Las plantillas son: ` +
                        Object.keys(PLANTILLAS).join(", "));
      }
      if (this.historico && plantilla.rol === "axi") return;
      const a = {
        nombre: (cfg.nombre || plantilla.rotulo)
          .replace("{anio}", this.ej.cierre.slice(0, 4)),
        fecha: cfg.fecha || (plantilla.rol === "apertura" ? this.ej.inicio : this.ej.cierre),
        rol: plantilla.rol || "normal",
        template: cfg.template,
        agrupar: plantilla.agrupar,
        glosa: cfg.glosa || "",
      };
      plantilla.call(this, a, this.resolver(cfg), cfg);
    });
    this.ordenar();
  };

  /* El diario es cronológico: se arma por plantilla y se ordena por fecha antes
     de numerar. Dentro de una misma fecha manda el orden en que se declararon. */
  Diario.prototype.ordenar = function () {
    this.asientos.forEach((a, i) => { a.orden = i; });
    this.asientos.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0)
      || (x.orden - y.orden));
    this.asientos.forEach((a, i) => { a.numero = i + 1; delete a.orden; });
  };

  /* ---------- asientos resumen mensuales ---------- */

  /* El artículo 327 del Código Civil y Comercial admite asientos globales, pero
     por períodos que no excedan el mes. Todo lo que sale de comprobantes con
     fecha se resume por mes; lo que es de cierre —amortizaciones, ajuste por
     inflación, impuesto— sigue siendo un asiento al cierre.

     Hay un tercer caso: los pagos. Un volante de pago o la cancelación de una
     declaración jurada tienen una fecha propia que no conviene correr al fin
     del mes, así que se agrupan por día. */

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                 "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function nombreMes(periodo) {
    const [a, m] = periodo.split("-");
    return `${MESES[Number(m) - 1]} de ${a}`;
  }

  function agrupado(registros, corte) {
    const g = {};
    registros.forEach((r) => {
      const k = String(r.fecha).slice(0, corte);
      (g[k] || (g[k] = [])).push(r);
    });
    return Object.keys(g).sort().map((k) => ({ clave: k, items: g[k] }));
  }

  /* El último día del mes de un período `aaaa-mm`, sin mirar el ejercicio. */
  function finDeMesDe(periodo) {
    const [a, m] = String(periodo).split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return `${String(periodo).slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
  }

  /* El asiento resumen de un mes va con fecha del último día del mes, sin salirse
     nunca del ejercicio. */
  Diario.prototype.finDeMes = function (periodo) {
    const f = finDeMesDe(periodo);
    if (f > this.ej.cierre) return this.ej.cierre;
    if (f < this.ej.inicio) return this.ej.inicio;
    return f;
  };

  /* Emite un asiento por grupo. El corte lo fija la plantilla y lo puede pisar
     el ejercicio con `agrupar`: "mes", "dia" o "ejercicio". `arma(items)`
     devuelve los movimientos del grupo y `glosa(items, clave)` el texto, donde
     `clave` es "aaaa-mm", "aaaa-mm-dd" o null. */
  Diario.prototype.emitir = function (a, cfg, registros, arma, glosa) {
    let modo = cfg.agrupar || a.agrupar || "ejercicio";
    if (cfg.mensual !== undefined) modo = cfg.mensual ? "mes" : "ejercicio";
    if (!registros.length) return;
    if (modo === "ejercicio") {
      a.glosa = a.glosa || glosa(registros, null);
      return this.asentar(a, arma(registros));
    }
    const dia = modo === "dia";
    agrupado(registros, dia ? 10 : 7).forEach((g) => {
      const b = Object.assign({}, a, {
        fecha: dia ? g.clave : this.finDeMes(g.clave),
        periodo: dia ? g.clave.slice(0, 7) : g.clave,
        glosa: a.glosa || glosa(g.items, g.clave),
      });
      this.asentar(b, arma(g.items));
    });
  };

  const cuando = (clave) => (!clave ? "del ejercicio"
    : clave.length === 7 ? "de " + nombreMes(clave)
      : "del " + window.Motor.fechaCorta(clave));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  /* ---------- las plantillas de asiento ---------- */

  const PLANTILLAS = {};

  /* `agrupar`: false = un asiento al cierre, true = uno por mes, "dia" = uno por
     fecha. Es el corte de base; el ejercicio lo puede pisar desde la hoja
     `Asientos`, con la columna «Agrupar».

     Las ventas y las compras van por día: la fecha del asiento es la del
     comprobante, que es la que corresponde. Estuvieron agrupadas por mes
     mientras las fechas del libro de IVA no eran fechas de verdad. */
  function plantilla(clave, rotulo, rol, agrupar, fn) {
    fn.rotulo = rotulo;
    fn.rol = rol;
    fn.agrupar = agrupar === true ? "mes" : agrupar === false ? "ejercicio" : agrupar;
    PLANTILLAS[clave] = fn;
  }

  plantilla("apertura", "Apertura", "apertura", false, function (a) {
    a.glosa = a.glosa || "Saldos iniciales del ejercicio, según el cierre al " +
      `${window.Motor.fechaCorta(this.ej.cierre_anterior)}.`;
    this.asentar(a, Object.keys(this.apertura).map((x) => [x, this.apertura[x]]));
  });

  /* Ventas del mes. `contra` es la cuenta que recibe el total: los deudores por
     venta, o la contrapartida cuando el ente no lleva cuenta corriente. */
  plantilla("ventas", "Ventas", "normal", "dia", function (a, c, cfg) {
    this.emitir(a, cfg, this.f.ventas,
      (items) => {
        const neto = items.reduce((t, v) => t + v.neto, 0);
        const iva = items.reduce((t, v) => t + v.iva, 0);
        return [[c.contra, neto + iva], [c.ventas, -neto], [c.debito_fiscal, -iva]];
      },
      (items, periodo) => {
        const monedas = Array.from(new Set(items.map((v) => v.moneda).filter(Boolean)));
        const enMoneda = monedas.length === 1 && monedas[0] !== "$"
          ? `, en ${monedas[0]}, al tipo de cambio de cada comprobante` : "";
        return `Ventas ${cuando(periodo)} según el libro de IVA ventas ` +
          `(${plural(items.length, "comprobante", "comprobantes")}${enMoneda}).`;
      });
  });

  /* Compras del mes, una línea por concepto de gasto. `contra` es proveedores, o
     la contrapartida si el ente no lleva cuenta corriente. */
  plantilla("compras", "compras", "normal", "dia", function (a, c, cfg) {
    this.emitir(a, cfg, this.f.compras,
      (items) => {
        const conceptos = Array.from(new Set(items.map((x) => x.concepto)))
          .filter(Boolean).sort();
        const iva = items.reduce((t, x) => t + ivaCompra(x), 0);
        const total = items.reduce((t, x) => t + importeCompra(x) + ivaCompra(x), 0);
        return conceptos.map((k) => [k, items.filter((x) => x.concepto === k)
          .reduce((t, x) => t + importeCompra(x), 0)])
          .concat([[c.credito_fiscal, iva], [c.contra, -total]]);
      },
      (items, periodo) => `Compras y gastos ${cuando(periodo)} según el libro de IVA ` +
        `compras (${plural(items.length, "comprobante", "comprobantes")}).`);
  });

  /* Retenciones del impuesto a las ganancias sufridas. Las del ejercicio van por
     mes; las de ejercicios anteriores que recién ahora se incorporan van en un
     asiento aparte al cierre. */
  plantilla("retenciones", "Retenciones", "normal", true, function (a, c, cfg) {
    const rets = (this.f.retenciones_ganancias || []).filter((r) => r.fecha);
    this.emitir(a, cfg, rets.filter((r) => this.enEjercicio(r.fecha)),
      (items) => {
        const t = items.reduce((s, r) => s + r.importe, 0);
        return [[c.retenciones, t], [c.contra, -t]];
      },
      (items, periodo) => `Retenciones del impuesto a las ganancias sufridas ` +
        `${cuando(periodo)}: ${plural(items.length, "certificado", "certificados")}.`);

    const anteriores = rets.filter((r) => !this.enEjercicio(r.fecha));
    if (!anteriores.length) return;
    const t = anteriores.reduce((s, r) => s + r.importe, 0);
    const anios = Array.from(new Set(anteriores.map((r) => r.fecha.slice(0, 4)))).sort();
    this.asentar({
      nombre: a.nombre + " anteriores", fecha: this.ej.cierre, rol: "normal",
      glosa: `Incorporación de ${plural(anteriores.length, "certificado", "certificados")} ` +
        `de retención del impuesto a las ganancias de ${anios[0]} a ${anios[anios.length - 1]}.`,
    }, [[c.retenciones, t], [c.contra, -t]]);
  });

  plantilla("iibb", "IIBB", "normal", true, function (a, c, cfg) {
    const p = this.p.iibb;
    this.emitir(a, cfg, this.f.ventas,
      (items) => {
        const base = p.reexpresa
          ? items.reduce((t, v) => t + v.neto * this.coef(v.fecha), 0)
          : items.reduce((t, v) => t + v.neto, 0);
        return [[c.gasto, p.alicuota * base], [c.contra, -p.alicuota * base]];
      },
      (items, periodo) => `Impuesto sobre los ingresos brutos ${cuando(periodo)}, ` +
        `${window.Motor.porciento(p.alicuota)} sobre el neto gravado de ventas.`);
  });

  /* Ingresos brutos, cuando en vez de calcularse hay planilla: la declaración
     jurada de cada período, con fecha del último día del período declarado. La
     de un período anterior al inicio del ejercicio queda afuera, aunque se haya
     pagado adentro: ese pasivo viene en la apertura. */
  plantilla("iibb_ddjj", "IIBB ddjj", "normal", true, function (a, c, cfg) {
    const regs = (this.f.iibb || []).filter((r) => r.periodo)
      .map((r) => Object.assign({}, r, { fecha: finDeMesDe(r.periodo) }))
      .filter((r) => this.enEjercicio(r.fecha));
    this.emitir(a, cfg, regs,
      (items) => {
        const t = items.reduce((s, r) => s + (r.importe || 0), 0);
        return [[c.gasto, t], [c.a_pagar, -t]];
      },
      (items, k) => `Declaración jurada del impuesto sobre los ingresos brutos ${cuando(k)}.`);
  });

  /* El pago de esa declaración jurada, con la fecha en que se canceló. Contra
     qué se paga lo dice el ejercicio: no siempre es el banco. */
  plantilla("iibb_pago", "IIBB pago", "normal", "dia", function (a, c, cfg) {
    const regs = (this.f.iibb || []).filter((r) => r.cancelado)
      .map((r) => Object.assign({}, r, { fecha: r.cancelado }))
      .filter((r) => this.enEjercicio(r.fecha));
    this.emitir(a, cfg, regs,
      (items) => {
        const t = items.reduce((s, r) => s + (r.importe || 0), 0);
        return [[c.a_pagar, t], [c.contra, -t]];
      },
      (items) => "Cancelación del impuesto sobre los ingresos brutos del período " +
        items.map((r) => r.periodo).join(", ") + ".");
  });

  /* La declaración jurada del mes: débito fiscal de las ventas del mes contra
     crédito fiscal de las compras del mes. */
  plantilla("ddjj_iva", "ddjj IVA", "normal", true, function (a, c, cfg) {
    const movs = this.f.ventas.map((v) => ({ fecha: v.fecha, debito: v.iva, credito: 0 }))
      .concat(this.f.compras.map((x) => ({ fecha: x.fecha, debito: 0, credito: ivaCompra(x) })));
    this.emitir(a, cfg, movs,
      (items) => {
        const d = items.reduce((t, x) => t + x.debito, 0);
        const cr = items.reduce((t, x) => t + x.credito, 0);
        return [[c.debito_fiscal, d], [c.credito_fiscal, -cr], [c.a_pagar, -(d - cr)]];
      },
      (items, periodo) => `Declaración jurada de IVA ${cuando(periodo)}: ` +
        "débito fiscal menos crédito fiscal.");
  });

  /* La declaración jurada de IVA tal como se presentó, no reconstruida de los
     libros: se asienta el devengamiento, con fecha del último día del período.

     El saldo de libre disponibilidad se mueve dos veces: se da de alta el que
     genera el período y se da de baja el del período anterior, que es el que se
     usó para pagar éste. Ese es el renglón que hace cerrar el asiento. */
  plantilla("ddjj_iva_arca", "ddjj IVA", "normal", true, function (a, c) {
    const filas = (this.f.ddjj_iva || []).filter((r) => r.periodo)
      .slice().sort((x, y) => (x.periodo < y.periodo ? -1 : x.periodo > y.periodo ? 1 : 0));
    let previo = 0;
    filas.forEach((r) => {
      const fecha = finDeMesDe(r.periodo);
      const libre = r.libre_disponibilidad || 0;
      const anterior = previo;
      previo = libre;
      if (!this.enEjercicio(fecha)) return;
      const movs = [
        [c.debito_fiscal, r.debito_fiscal || 0],
        [c.libre_disponibilidad, libre - anterior],
        [c.credito_fiscal, -(r.credito_fiscal || 0)],
        [c.retenciones, -(r.retenciones || 0)],
        [c.a_pagar, -(r.saldo_impuesto || 0)],
      ];
      if (movs.every((m) => Math.abs(m[1]) <= 1e-9)) return;
      this.asentar(Object.assign({}, a, {
        fecha: fecha, periodo: r.periodo,
        glosa: a.glosa || `Declaración jurada de IVA de ${nombreMes(r.periodo)}, ` +
          "según el formulario presentado.",
      }), movs);
    });
  });

  /* La declaración jurada del impuesto a las ganancias del ejercicio anterior,
     que se presenta dentro de éste: cancela la provisión que venía de la
     apertura contra los pagos a cuenta y el saldo que queda por ingresar. */
  plantilla("ddjj_ganancias_arca", "ddjj ganancias", "normal", "dia", function (a, c) {
    (this.f.ddjj_ganancias || []).filter((r) => r.fecha).forEach((r) => {
      this.asentar(Object.assign({}, a, {
        fecha: r.fecha,
        glosa: a.glosa || "Declaración jurada del impuesto a las ganancias del ejercicio " +
          `${r.ejercicio || "anterior"}: cancela la provisión contra los pagos a cuenta y ` +
          "el saldo a ingresar.",
      }), [
        [c.provision, r.impuesto_determinado || 0],
        [c.credito_ley_25413, -(r.credito_ley_25413 || 0)],
        [c.retenciones, -(r.retenciones || 0)],
        [c.anticipos, -(r.anticipos || 0)],
        [c.a_pagar, -(r.total_a_pagar || 0)],
      ]);
    });
  });

  /* Compensación de saldos: se saca de libre disponibilidad de un impuesto y se
     aplica a otro. La cuenta que recibe viene en cada renglón. */
  plantilla("compensaciones", "Compensaciones", "normal", "dia", function (a, c, cfg) {
    this.emitir(a, cfg, (this.f.compensaciones || []).filter((x) => x.fecha),
      (items) => {
        const cuentas = Array.from(new Set(items.map((x) => x.cuenta))).filter(Boolean).sort();
        const total = items.reduce((t, x) => t + (x.importe || 0), 0);
        return cuentas.map((k) => [k, items.filter((x) => x.cuenta === k)
          .reduce((t, x) => t + (x.importe || 0), 0)]).concat([[c.origen, -total]]);
      },
      (items) => "Compensación de saldos de libre disponibilidad: " +
        plural(items.length, "solicitud", "solicitudes") + ".");
  });

  plantilla("ddjj_ganancias", "ddjj ganancias", "normal", false, function (a, c) {
    const provision = -(this.apertura[c.provision] || 0);
    const saldoFavor = this.apertura[c.saldo_favor] || 0;
    a.glosa = a.glosa ||
      "Declaración jurada del impuesto a las ganancias del ejercicio anterior: cancela la " +
      "provisión y el saldo a favor que venían de la apertura.";
    this.asentar(a, [
      [c.provision, provision],
      [c.a_pagar, -provision],
      [c.saldo_favor, -saldoFavor],
      [c.contra, saldoFavor],
    ]);
  });

  /* Los volantes electrónicos de pago: un asiento por fecha de pago, con una
     línea por cuenta imputada y el banco al haber. */
  plantilla("pagos", "Pagos AFIP", "normal", "dia", function (a, c, cfg) {
    this.emitir(a, cfg, (this.f.pagos_afip || []).filter((x) => x.fecha),
      (items) => {
        const cuentas = Array.from(new Set(items.map((x) => x.cuenta))).sort();
        const total = items.reduce((t, x) => t + x.importe, 0);
        return cuentas.map((k) => [k, items.filter((x) => x.cuenta === k)
          .reduce((t, x) => t + x.importe, 0)]).concat([[c.contra, -total]]);
      },
      (items, periodo) => `Pagos a ARCA ${cuando(periodo)} según ` +
        `${plural(items.length, "volante electrónico de pago", "volantes electrónicos de pago")}.`);
  });

  /* Los asientos que se escriben a mano: ajustes, reclasificaciones, todo lo que
     no sale de un comprobante. Cada uno lleva su fecha, su glosa y sus líneas,
     tal como se cargaron: acá no se calcula nada. */
  plantilla("manuales", "Ajuste", "normal", "dia", function (a) {
    const grupos = {}, orden = [];
    (this.f.asientos_manuales || []).forEach((l) => {
      if (!l.fecha || !l.cuenta) return;
      const k = l.asiento || l.fecha;
      if (!grupos[k]) { grupos[k] = []; orden.push(k); }
      grupos[k].push(l);
    });
    orden.sort((x, y) => {
      const fx = grupos[x][0].fecha, fy = grupos[y][0].fecha;
      return fx < fy ? -1 : fx > fy ? 1 : 0;
    });
    orden.forEach((k) => {
      const l = grupos[k];
      const glosa = l.map((x) => x.glosa).filter(Boolean)[0];
      this.asentar(Object.assign({}, a, {
        nombre: l.map((x) => x.nombre).filter(Boolean)[0] || a.nombre,
        fecha: l[0].fecha,
        glosa: glosa || "Ajuste registrado a mano.",
      }), l.map((x) => [x.cuenta, (x.debe || 0) - (x.haber || 0)]));
    });
  });

  plantilla("honorarios", "Honorarios", "normal", false, function (a, c) {
    const hon = this.p.ganancias.honorarios_devengados;
    const anterior = -(this.apertura[c.a_pagar] || 0);
    a.glosa = a.glosa ||
      "Honorarios del directorio: devengamiento de los del ejercicio, cancelación del anticipo " +
      "y del saldo que venía del ejercicio anterior.";
    this.asentar(a, [
      [c.anticipo, hon], [c.contra, -hon],
      [c.a_pagar, anterior],
      [c.anticipo, -anterior],
      [c.a_pagar, -hon],
      [c.gasto, hon],
    ]);
  });

  /* ---------- el extracto bancario ---------- */

  /* Los nombres de rubro y de socio vienen escritos a mano: se comparan sin
     acentos, sin mayúsculas y sin espacios de más. */
  const sinAcentos = (s) => String(s === null || s === undefined ? "" : s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

  /* Cada movimiento del banco trae un rubro, y el rubro dice contra qué cuenta
     va. Hay rubros que **ya están asentados desde otra fuente**: los pagos a
     ARCA salen de los volantes electrónicos y de las cuotas de los planes, y
     los de ingresos brutos de la declaración jurada. Esos se declaran en `null`:
     no se vuelven a asentar —el banco no puede salir dos veces— pero se suman
     aparte para controlar que lo que el banco pagó sea lo que el diario ya dice.

     El detalle puede nombrar una subcuenta de la cuenta del rubro: así el retiro
     de cada socio va a la subcuenta de ese socio. */
  plantilla("extractos", "Banco", "normal", true, function (a, c, cfg) {
    const movimientos = (this.f.extractos || []).filter((m) => this.enEjercicio(m.fecha));
    if (!movimientos.length) return;

    const dic = this.ej.cuentas || {};
    const nombreDe = (v) => ((v in dic) ? dic[v] : v);
    const rubros = {};
    for (const k in (cfg.rubros || {})) {
      const v = cfg.rubros[k];
      if (v === null || v === "") { rubros[sinAcentos(k)] = null; continue; }
      if (typeof v === "string") { rubros[sinAcentos(k)] = nombreDe(v); continue; }
      /* Un rubro afinado por la descripción: la primera regla que coincide con
         lo que dice el banco manda; si no coincide ninguna, va la cuenta base. */
      rubros[sinAcentos(k)] = {
        cuenta: v.cuenta ? nombreDe(v.cuenta) : null,
        si_dice: (v.si_dice || []).map((x) => ({ contiene: sinAcentos(x.contiene),
                                                 cuenta: nombreDe(x.cuenta) })),
      };
    }
    const cuentaDelRubro = (r, descripcion) => {
      if (r === null || typeof r === "string") return r;
      const d = sinAcentos(descripcion);
      const x = r.si_dice.find((y) => y.contiene && d.indexOf(y.contiene) >= 0);
      return x ? x.cuenta : r.cuenta;
    };

    const cuentas = this.d.mapeo.cuentas;
    const subcuentaDe = (cuenta, detalle) => {
      if (!detalle) return cuenta;
      const k = sinAcentos(detalle);
      for (const x in cuentas) {
        if (cuentas[x].suma_en === cuenta && sinAcentos(x) === k) return x;
      }
      return cuenta;
    };

    /* El control del banco: qué se asentó desde el extracto, qué ya venía de
       otra fuente y qué quedó sin rubro. La suma de las tres cosas más la
       apertura tiene que ser el saldo del banco al cierre. */
    const b = this.banco = {
      movimientos: movimientos.length, asentado: 0, yaAsentado: 0,
      sinRubro: [], porRubro: {},
    };

    this.emitir(a, cfg, movimientos,
      (items) => {
        const movs = [];
        items.forEach((m) => {
          const importe = (m.credito || 0) - (m.debito || 0);
          const k = sinAcentos(m.rubro);
          const r = b.porRubro[m.rubro] || (b.porRubro[m.rubro] = { n: 0, importe: 0 });
          r.n += 1; r.importe += importe;
          if (!m.rubro || !(k in rubros)) {
            b.sinRubro.push(m);
            return;
          }
          const cuenta = cuentaDelRubro(rubros[k], m.descripcion);
          if (!cuenta) { b.yaAsentado += importe; return; }
          b.asentado += importe;
          movs.push([c.banco, importe]);
          movs.push([subcuentaDe(cuenta, m.detalle), -importe]);
        });
        return movs;
      },
      (items, periodo) => `Movimientos del banco ${cuando(periodo)} según el extracto ` +
        `(${plural(items.length, "movimiento", "movimientos")}). Los pagos que ya asienta ` +
        "otra fuente —volantes de ARCA, cuotas de los planes, ingresos brutos— no se " +
        "repiten acá.");
  });

  /* Los honorarios del director, devengados mes a mes.

     Mientras la asamblea no los trate, lo que se le paga al director es un
     anticipo —un crédito, no un gasto—: eso entra por el extracto. El gasto se
     devenga acá, contra la cuenta a pagar. Las dos cuentas quedan abiertas hasta
     que la asamblea apruebe y se compensen. */
  plantilla("honorarios_director", "Honorarios del director", "normal", true,
    function (a, c, cfg) {
      const filas = (this.f.honorarios_director || []).filter((x) => x.importe);
      if (!filas.length) return;
      this.emitir(a, cfg, filas.map((x) => Object.assign(
        { fecha: this.finDeMes(x.periodo) }, x)),
        (items) => {
          const total = items.reduce((t, x) => t + x.importe, 0);
          return [[c.gasto, total], [c.a_pagar, -total]];
        },
        (items, periodo) => `Honorarios del director devengados ${cuando(periodo)}. La ` +
          "asamblea todavía no los trató: lo que se le pagó en el ejercicio está registrado " +
          "como anticipo.");
    });

  /* La valuación de una cuenta al cierre.

     Hay saldos que no salen de sumar movimientos sino de un dato de afuera: lo
     que vale un fondo común de inversión al cierre lo dice el resumen del fondo,
     no el extracto bancario. Se declara el valor y la diferencia contra el saldo
     contable es el resultado —el rendimiento, en el caso del fondo—.

     No se inventa ningún importe: el valor se declara en `parametros.valuacion_cierre`
     y ahí queda escrito de dónde salió. */
  plantilla("valuacion", "Valuación al cierre", "normal", false, function (a) {
    const decl = this.p.valuacion_cierre || {};
    const s = this.saldos();
    const movs = [];
    this.valuaciones = [];
    Object.keys(decl).forEach((cuenta) => {
      const d = decl[cuenta];
      const contable = s[cuenta] || 0;
      const diferencia = (d.valor || 0) - contable;
      this.valuaciones.push({ cuenta: cuenta, contable: contable, valor: d.valor || 0,
                              diferencia: diferencia, resultado: d.resultado,
                              fuente: d.fuente || null });
      if (Math.abs(diferencia) <= 1e-9) return;
      movs.push([cuenta, diferencia]);
      movs.push([d.resultado, -diferencia]);
    });
    if (!movs.length) return;
    a.glosa = a.glosa || "Valuación al cierre: la diferencia entre el saldo contable y el " +
      "valor declarado va al resultado que corresponde a cada cuenta.";
    this.asentar(a, movs);
  });

  /* ---------- el pago a cuenta del impuesto sobre los débitos y créditos ---------- */

  /* Qué porcentaje del impuesto de la ley 25.413 se computa a cuenta del
     impuesto a las ganancias. No lo decide el banco ni el contador: lo decide la
     categorización MiPyME de la empresa, y la condición es **excluyente** —sin
     certificado vigente no hay 100 % ni 60 %, se aplica el régimen general—.

     La tabla vive en `esquema/impuesto-ley-25413.json`: los porcentajes salen de
     la ley y son fijos; los límites de venta que definen la categoría se
     actualizan periódicamente y por eso van con su vigencia. */
  Diario.prototype.reglaLey25413 = function () {
    const t = this.d.ley25413;
    if (!t) return null;
    const datos = (this.ente.datos || [])[(this.ente.datos || []).length - 1] || {};
    const m = datos.mipyme || {};
    const general = t.regimen_general || {};
    const base = { categoria: m.categoria || null, sector: m.sector || null,
                   certificado: !!m.certificado_vigente };

    if (!m.certificado_vigente) {
      return Object.assign(base, {
        porcentaje: general.porcentaje || 0, regimen: "Régimen General",
        motivo: m.categoria
          ? "Hay categoría declarada pero no hay certificado MiPyME vigente, y el " +
            "certificado es condición excluyente para computar el 100 % o el 60 %."
          : "La empresa no está categorizada como MiPyME.",
      });
    }

    const cat = sinAcentos(m.categoria), sec = sinAcentos(m.sector);
    const fila = (t.computo || []).find((f) => {
      const cats = [f.categoria].concat(f.alias || []).map(sinAcentos);
      if (cats.indexOf(cat) < 0) return false;
      if (f.sector === "*") return true;
      return [f.sector].concat(f.alias_sector || []).map(sinAcentos).indexOf(sec) >= 0;
    });
    if (!fila) {
      return Object.assign(base, {
        porcentaje: general.porcentaje || 0, regimen: "Régimen General",
        motivo: `La categoría «${m.categoria || "(sin declarar)"}»` +
          (m.sector ? ` del sector «${m.sector}»` : " sin sector declarado") +
          " no está en la tabla de la ley, así que se aplica el límite general.",
      });
    }
    return Object.assign(base, {
      porcentaje: fila.porcentaje, regimen: fila.regimen,
      categoria: fila.categoria, sector: fila.sector === "*" ? null : fila.sector,
      nota: fila.nota || null,
    });
  };

  /* La planilla también trae la tabla de cómputo de la ley 25.413, de práctico.
     Esa no se lee: sale de la ley y vive en el esquema. Se compara, nada más, y
     si no coinciden hay que mirar cuál de las dos quedó vieja. */
  Diario.prototype.controlComputo25413 = function () {
    const dela = ((this.ej.bases || {}).computo_ley_25413) || [];
    const t = this.d.ley25413;
    if (!dela.length || !t) return [];
    const dif = [];
    dela.forEach((x) => {
      const cat = sinAcentos(x.categoria), sec = sinAcentos(x.sector);
      const f = (t.computo || []).find((y) => {
        const cats = [y.categoria].concat(y.alias || []).map(sinAcentos);
        if (cats.indexOf(cat) < 0) return false;
        if (y.sector === "*") return true;
        return [y.sector].concat(y.alias_sector || []).map(sinAcentos).indexOf(sec) >= 0;
      });
      const como = `${x.categoria} / ${x.sector || "todos los sectores"}`;
      if (!f) dif.push(`${como}: la planilla lo tiene y el esquema no`);
      else if (Math.abs(f.porcentaje - x.porcentaje) > 0.0001) {
        dif.push(`${como}: la planilla dice ${(x.porcentaje * 100).toFixed(0)} % y el ` +
                 `esquema ${(f.porcentaje * 100).toFixed(0)} %`);
      }
    });
    return dif;
  };

  /* El tope de venta de la categoría declarada, para poder mirarlo al lado de lo
     que la empresa facturó. Es una referencia y nada más: el parámetro legal es
     el promedio de los últimos tres ejercicios con las deducciones de la norma,
     no las ventas de un año. La aplicación no recategoriza a nadie. */
  Diario.prototype.topeMiPyme = function () {
    const datos = (this.ente.datos || [])[(this.ente.datos || []).length - 1] || {};
    const m = datos.mipyme || {};
    if (!m.sector || !m.categoria) return null;
    const tabla = this.tablaMiPyme(m.certificado_desde);
    if (!tabla) return null;

    const porSector = tabla.limites || {};
    const claveSector = Object.keys(porSector)
      .find((k) => sinAcentos(k) === sinAcentos(m.sector));
    if (!claveSector) {
      return { sector: m.sector, sinSector: true, elegida_por: tabla.elegida_por,
               desde: tabla.desde || null };
    }
    const fila = porSector[claveSector];
    const claveCat = Object.keys(fila)
      .find((k) => sinAcentos(k) === sinAcentos(m.categoria) ||
                   sinAcentos(m.categoria).indexOf(sinAcentos(k)) === 0);
    return {
      sector: claveSector, categoria: claveCat || m.categoria,
      tope: claveCat ? fila[claveCat] : null,
      desde: tabla.desde || null, elegida_por: tabla.elegida_por,
      certificado_desde: m.certificado_desde || null,
      /* Ventas netas del ejercicio, nominales. No es el parámetro legal: se
         muestra sólo para tener una magnitud al lado del tope. */
      ventas_del_ejercicio: (this.f.ventas || [])
        .reduce((t, v) => t + (v.neto || 0), 0),
    };
  };

  /* La tabla de topes de venta que corresponde a una fecha.

     La SEPyME los actualiza una vez al año, por lo general entre marzo y abril,
     y cada tabla rige doce meses desde su publicación, sin importar la inflación
     del período. La que vale **no es la del cierre del ejercicio**: es la que
     estaba vigente el día en que la empresa tramitó o renovó su certificado, que
     es cuando quedó categorizada. */
  Diario.prototype.tablaMiPyme = function (fecha) {
    /* Los topes que trae la planilla del ejercicio ganan: la SEPyME los cambia
       una vez al año y el que vale es el que estaba vigente cuando la empresa
       tramitó el certificado, que es lo que se cargó en la planilla. */
    const propios = (this.ej.bases || {}).topes_mipyme;
    if (propios) {
      return { limites: propios, desde: null,
               elegida_por: "la trae la planilla del ejercicio, en la tabla " +
                            "`Det_MiPyme` de la hoja `Bases Ganancias`" };
    }
    const t = this.d.ley25413;
    const tablas = ((t || {}).parametros_categoria || {}).tablas || [];
    if (!tablas.length) return null;
    const con = tablas.filter((x) => x.desde).sort((a, b) => (a.desde < b.desde ? -1 : 1));
    if (!fecha || !con.length) {
      /* Sin fecha de certificado, o con tablas sin fecha de publicación, no hay
         cómo elegir: se usa la única que hay y se dice por qué. */
      return Object.assign({}, tablas[tablas.length - 1], {
        elegida_por: con.length
          ? "no se sabe cuándo se tramitó el certificado, así que se toma la última tabla"
          : "la tabla cargada no dice desde cuándo rige",
      });
    }
    const vale = con.filter((x) => x.desde <= fecha);
    if (!vale.length) {
      return Object.assign({}, con[0], {
        elegida_por: `el certificado es del ${window.Motor.fechaCorta(fecha)}, anterior a ` +
          "la tabla más vieja que hay cargada",
      });
    }
    return Object.assign({}, vale[vale.length - 1], {
      elegida_por: `vigente cuando se tramitó el certificado, el ` +
        window.Motor.fechaCorta(fecha),
    });
  };

  /* El impuesto entra al diario como gasto, que es lo que es cuando sale del
     banco. Este asiento reclasifica la parte computable como pago a cuenta.

     Se reclasifica **en el mes en que se pagó**, no al cierre. El crédito es una
     cuenta monetaria y el gasto no: si la reclasificación se hiciera al cierre,
     la reexpresión del gasto de todo el año quedaría varada en la cuenta de
     impuestos, y ahí parecería una porción no computada que no existe. Mes a
     mes, el gasto se cancela contra sí mismo y la pérdida de poder adquisitivo
     del crédito queda donde tiene que quedar, en el RECPAM.

     Va **antes** de determinar el impuesto a las ganancias: la parte computable
     no es gasto deducible, así que no puede achicar la base. Lo que queda en la
     cuenta de gasto es la porción no computada, que sí se deduce. */
  plantilla("credito_ley_25413", "Pago a cuenta ley 25.413", "normal", true,
    function (a, c, cfg) {
      const regla = this.reglaLey25413();
      if (!regla) return;

      /* Lo que se cargó a la cuenta de gasto, mes por mes, venga de donde venga:
         del extracto, de un volante o de un asiento escrito a mano. */
      const por = {};
      this.asientos.forEach((as) => {
        if (as.rol !== "normal") return;
        as.lineas.forEach((l) => {
          if (l.cuenta !== c.gasto) return;
          const k = as.fecha.slice(0, 7);
          por[k] = (por[k] || 0) + l.debe - l.haber;
        });
      });

      const pagado = Object.keys(por).reduce((t, k) => t + por[k], 0);
      const computable = pagado * regla.porcentaje;
      this.ley25413 = { pagado: pagado, computable: computable,
                        no_computable: pagado - computable, regla: regla,
                        porMes: por };
      if (Math.abs(computable) <= 1e-9) return;

      const meses = Object.keys(por).sort()
        .filter((k) => Math.abs(por[k]) > 1e-9)
        .map((k) => ({ fecha: this.finDeMes(k), importe: por[k] * regla.porcentaje }));

      const cuanto = window.Motor.porciento(regla.porcentaje);
      const quien = `${regla.regimen}` +
        (regla.categoria ? `, categoría ${regla.categoria}` : "") +
        (regla.sector ? `, sector ${regla.sector}` : "");
      this.emitir(a, cfg, meses,
        (items) => {
          const total = items.reduce((t, x) => t + x.importe, 0);
          return [[c.credito, total], [c.gasto, -total]];
        },
        (items, periodo) => `Pago a cuenta del impuesto a las ganancias por el impuesto ` +
          `sobre los débitos y créditos bancarios ${cuando(periodo)}: ${cuanto} de lo ` +
          `pagado, por ${quien}. Lo que no se computa queda como gasto, deducible en el ` +
          "balance impositivo.");
    });

  /* Amortizaciones del ejercicio, sobre valores históricos: tasa por el valor de
     origen al cierre, que es la apertura más las altas. */
  plantilla("amortizaciones", "Amortizaciones", "normal", false, function (a, c) {
    const rubros = this.p.amortizacion.rubros;
    const movs = [];
    let total = 0;
    for (const rubro in rubros) {
      const d = rubros[rubro];
      this.altas[rubro] = this.comprasDel(rubro);
      const cuota = d.tasa * ((this.apertura[rubro] || 0) + this.altas[rubro]);
      this.amortHistorica[rubro] = cuota;
      total += cuota;
      movs.push([d.acumulada, -cuota]);
    }
    a.glosa = a.glosa ||
      "Amortizaciones del ejercicio, a valores históricos, sobre el valor de origen al cierre " +
      "(apertura más altas del ejercicio).";
    /* Este asiento no se reexpresa por su fecha: la cuota se vuelve a calcular
       sobre el valor de origen ya ajustado. Lo hace el asiento de ajuste. */
    a.ajustaAparte = true;
    this.asentar(a, [[c.gasto, total]].concat(movs));
  });

  /* ---------- el papel de trabajo del ajuste por inflación ---------- */

  /* Una partida no monetaria y su reexpresión, abierta por origen: los saldos de
     apertura por un lado y los movimientos de cada mes por otro. Es el papel que
     se controla renglón por renglón antes de aceptar el asiento. */
  function anotar(hoja, cuenta, destino, origen, coef, base, ajuste) {
    let p = hoja.por[cuenta];
    if (!p) {
      p = hoja.por[cuenta] = { cuenta: cuenta, destino: destino || cuenta,
                               base: 0, ajuste: 0, tramos: [] };
      hoja.lista.push(p);
    }
    if (ajuste === undefined) ajuste = base * (coef - 1);
    let t = p.tramos.find((x) => x.origen === origen);
    if (!t) p.tramos.push(t = { origen: origen, coef: coef, base: 0, ajuste: 0 });
    /* Dos coeficientes distintos en el mismo renglón no se pueden mostrar como
       uno: el renglón queda sin coeficiente y con los importes sumados. */
    else if (t.coef !== coef) t.coef = null;
    t.base += base;
    t.ajuste += ajuste;
    p.base += base;
    p.ajuste += ajuste;
    return p;
  }

  /* Las partidas no monetarias se reexpresan desde su fecha de origen hasta el
     cierre. La fecha de origen no hay que declararla en ningún lado: es la del
     asiento que movió la partida, y cuando se arma el ajuste el diario ya está
     completo. Los saldos de apertura son la excepción: vienen del cierre
     anterior, no del primer día del ejercicio, así que llevan el coeficiente
     punta a punta.

     Cuál cuenta es no monetaria lo dice el plan de cuentas del ente —la casilla
     «Monetaria» en falso—, y `ajuste_a` dice a qué cuenta va el ajuste cuando no
     va a la propia: el del capital nominal va al ajuste de capital. */
  Diario.prototype.hojaDeAjuste = function () {
    const cuentas = this.d.mapeo.cuentas;
    const hoja = { por: {}, lista: [] };
    this.asientos.forEach((as) => {
      if (as.ajustaAparte) return;
      /* Un asiento de reexpresión no se reexpresa a sí mismo. Cuando la hoja se
         arma desde la plantilla `axi` todavía no existe y no molesta; pero se
         vuelve a pedir después, para la amortización impositiva, y ahí el
         coeficiente se aplicaba dos veces. */
      if (as.rol === "axi") return;
      const apertura = as.rol === "apertura";
      const coef = apertura ? this.pap : this.coef(as.fecha);
      as.lineas.forEach((l) => {
        const m = cuentas[l.cuenta];
        if (!m || !m.no_monetaria) return;
        anotar(hoja, l.cuenta, m.ajuste_a, apertura ? "apertura" : as.fecha.slice(0, 7),
               coef, l.debe - l.haber);
      });
    });
    return hoja;
  };

  /* Ajuste por inflación de las partidas no monetarias. El RECPAM no se estima:
     es lo que falta para que el asiento cierre. */
  plantilla("axi", "AXI", "axi", false, function (a, c) {
    const hoja = this.hojaDeAjuste();

    /* La amortización del ejercicio no se reexpresa por su fecha —está calculada
       al cierre, sobre valores históricos—: se vuelve a calcular sobre el valor
       de origen ya ajustado, y lo que se asienta es la diferencia. */
    const rubros = (this.p.amortizacion || {}).rubros || {};
    for (const rubro in rubros) {
      /* Si el ejercicio todavía no arma el asiento de amortizaciones no hay
         cuota que recalcular: el rubro se reexpresa y nada más. */
      if (!(rubro in this.amortHistorica)) continue;
      const d = rubros[rubro];
      const bien = hoja.por[rubro];
      const valor = bien ? bien.base + bien.ajuste
        : (this.apertura[rubro] || 0) + (this.altas[rubro] || 0);
      const cuota = d.tasa * valor;
      this.amortAjustada[rubro] = cuota;
      const historica = this.amortHistorica[rubro] || 0;
      const dif = cuota - historica;
      if (Math.abs(dif) <= 1e-9) continue;
      const coef = historica ? cuota / historica : 0;
      const origen = "amortización de " + rubro;
      anotar(hoja, d.acumulada, null, origen, coef, -historica, -dif);
      anotar(hoja, c.amortizaciones, null, origen, coef, historica, dif);
    }

    this.papelAjuste = hoja.lista;
    const movs = hoja.lista.map((p) => [p.destino, p.ajuste]);
    this.recpam = -movs.reduce((t, mv) => t + mv[1], 0);

    /* La contrapartida de cada partida ajustada va a la cuenta de resultado que
       le corresponde por su signo: la que suma, a la positiva; la que resta, a
       la negativa. El neto entre las dos es el RECPAM, y las dos van al mismo
       renglón del estado de resultados, así que se expone con su signo.

       Un ente que lleva una sola cuenta de ajuste declara `recpam` y sigue
       teniendo un renglón solo. */
    if (c.positivo && c.negativo) {
      movs.slice().forEach((mv) => {
        movs.push([mv[1] > 0 ? c.positivo : c.negativo, -mv[1]]);
      });
    } else {
      movs.push([c.recpam, this.recpam]);
    }
    a.glosa = a.glosa ||
      "Ajuste por inflación de las partidas no monetarias, en moneda de cierre. El resultado " +
      "por exposición a los cambios en el poder adquisitivo de la moneda es el saldo del asiento.";
    this.asentar(a, movs);
  });

  /* Después del ajuste, las dos cuentas de AXI quedan una contra otra: una con
     saldo deudor y la otra acreedor. Este asiento las netea —la de menor saldo
     queda en cero y se aplica contra la otra— para que el resultado por
     exposición a la inflación quede en una sola cuenta, ganancia o pérdida.

     El ente que lleva una sola cuenta de RECPAM no arma este asiento: no tiene
     nada que netear. */
  plantilla("neteo_axi", "Neteo AXI", "axi", false, function (a, c) {
    const s = this.saldos();
    const menor = Math.abs(s[c.positivo] || 0) <= Math.abs(s[c.negativo] || 0)
      ? c.positivo : c.negativo;
    const mayor = menor === c.positivo ? c.negativo : c.positivo;
    const importe = s[menor] || 0;
    if (Math.abs(importe) <= 1e-9) return;
    this.axiNeto = { cuenta: mayor, importe: (s[mayor] || 0) + importe };
    a.glosa = a.glosa ||
      `Neteo de las dos cuentas del ajuste por inflación: «${menor}» queda en cero y su ` +
      `saldo se aplica a «${mayor}», que queda con el resultado por exposición a los ` +
      "cambios en el poder adquisitivo de la moneda.";
    this.asentar(a, [[menor, -importe], [mayor, importe]]);
  });

  plantilla("impuesto", "ganancias {anio}", "impuesto", false, function (a, c) {
    this.ganancias = this.determinarGanancias();
    this.impuesto = this.ganancias ? this.ganancias.impuesto_determinado
                                   : this.determinarImpuesto();
    a.glosa = a.glosa || "Provisión del impuesto a las ganancias determinado del ejercicio.";
    this.asentar(a, [[c.gasto, this.impuesto], [c.provision, -this.impuesto]]);
  });

  /* ---------- determinación del impuesto a las ganancias ----------

     Arranca del **resultado histórico**: el ajuste por inflación contable no
     entra, porque la ley trae el suyo. El del Título VI se calcula acá, en dos
     fases, y sale del propio diario: los saldos de apertura para la estática, y
     los movimientos con su fecha para la dinámica. Ningún importe se escribe a
     mano.

     Lo que el ente declara en `parametros.ganancias` no son importes: es la
     **clasificación** —qué cuenta es computable y cuál no, qué movimiento entra
     en la fase dinámica— que es lo único que la ley deja al criterio del
     profesional. */

  Diario.prototype.determinarGanancias = function () {
    const g = this.p.ganancias;
    const esq = this.d.ganancias;
    if (!g || g.version !== 2 || !esq) return null;

    const cuentas = this.d.mapeo.cuentas;
    const linea = (c) => (cuentas[c] || {}).linea || "";
    const esActivo = (c) => linea(c).indexOf("esp.a") === 0;
    const esPasivo = (c) => linea(c).indexOf("esp.p") === 0 &&
                            linea(c).indexOf("esp.pn") !== 0;

    const r = { norma: esq.norma, avisos: [] };

    /* ----- el punto de partida ----- */
    r.resultado_historico = this.resultadoHistorico();

    /* ----- fase I: la posición al inicio ----- */
    const ai = g.ajuste_inflacion || {};
    const nc = ai.no_computable || {};
    const porLinea = nc.por_linea || [];
    const porCuenta = nc.cuentas || [];
    const noComputable = (c) =>
      porCuenta.indexOf(c) >= 0 || porLinea.some((l) => linea(c).indexOf(l) === 0);
    /* El motivo se declara por cuenta o por prefijo de renglón: el papel de
       trabajo tiene que decir por qué cada saldo quedó de un lado o del otro. */
    const motivos = nc.motivos || {};
    const aProposito = nc.computable_a_proposito || {};
    const motivo = (c) => {
      if (motivos[c]) return motivos[c];
      const l = Object.keys(motivos).find((k) => k.indexOf("esp.") === 0 &&
                                                 linea(c).indexOf(k) === 0);
      return l ? motivos[l] : (aProposito[c] || null);
    };

    const fi = { computable: [], no_computable: [], pasivo: [], pasivo_excluido: [] };
    Object.keys(this.apertura).forEach((c) => {
      const saldo = this.apertura[c];
      if (!saldo) return;
      if (esActivo(c)) {
        (noComputable(c) ? fi.no_computable : fi.computable)
          .push({ cuenta: c, saldo: saldo, motivo: motivo(c) });
      } else if (esPasivo(c)) {
        /* La marca del plan vale para las dos columnas. Una deuda que el papel
           dejó fuera del ajuste no se puede ignorar en silencio: se saca del
           pasivo computable, se muestra aparte y la determinación lo avisa,
           porque el artículo 106 b) no excluye ninguna deuda. */
        (noComputable(c) ? fi.pasivo_excluido : fi.pasivo)
          .push({ cuenta: c, saldo: -saldo, motivo: motivo(c) });
      }
    });
    const suma = (lista) => lista.reduce((t, x) => t + x.saldo, 0);
    fi.activo_computable = suma(fi.computable);
    fi.activo_no_computable = suma(fi.no_computable);
    fi.pasivo_computable = suma(fi.pasivo);
    fi.pasivo_no_computable = suma(fi.pasivo_excluido);
    if (fi.pasivo_excluido.length) {
      r.avisos.push("Estas deudas quedaron fuera del pasivo computable porque el plan de " +
        "cuentas las marca «no computable» en la columna «AXI Impositivo»: " +
        fi.pasivo_excluido.map((x) => x.cuenta).join(", ") + ", por " +
        fi.pasivo_no_computable.toFixed(2) + ". El artículo 106 b) no excluye deudas: " +
        "si la marca no era la que se quería, se destilda en la planilla.");
    }
    fi.expuesto = fi.activo_computable - fi.pasivo_computable;
    fi.coeficiente = this.pap - 1;
    /* Con activo computable mayor que el pasivo la sociedad estuvo expuesta y el
       ajuste es una pérdida; al revés, es ganancia. */
    fi.ajuste = -fi.expuesto * fi.coeficiente;
    r.fase_i = fi;

    /* ----- fase II: los movimientos del ejercicio ----- */
    const bloque = (defs, signo) => {
      const grupos = (defs || []).map((def) => {
        const porMes = {};
        this.asientos.forEach((a) => {
          if (a.rol === "apertura") return;
          if ((def.excluir_plantillas || []).indexOf(a.template) >= 0) return;
          a.lineas.forEach((l) => {
            if ((def.cuentas || []).indexOf(l.cuenta) < 0) return;
            const mov = l.debe - l.haber;
            /* «debe» toma sólo lo que aumentó la cuenta y «haber» sólo lo que la
               bajó; dentro de un mismo mes se netean, que es exacto porque
               llevan el mismo coeficiente. */
            const mes = a.fecha.slice(0, 7);
            porMes[mes] = (porMes[mes] || 0) + mov;
          });
        });
        const movs = Object.keys(porMes).sort().map((mes) => {
          const bruto = porMes[mes];
          const importe = def.signo === "haber" ? -bruto : bruto;
          const coef = this.coef(mes + "-01") - 1;
          return { mes: mes, importe: importe, coeficiente: coef, ajuste: importe * coef };
        }).filter((x) => x.importe > 0.005);
        return { concepto: def.concepto, norma: def.norma || null, movimientos: movs,
                 total: movs.reduce((t, x) => t + x.ajuste, 0) };
      });
      return { grupos: grupos, total: signo * grupos.reduce((t, x) => t + x.total, 0) };
    };
    let f2 = g.ajuste_inflacion.fase_ii || {};
    /* La fase dinámica se deduce de la misma clasificación de la fase estática:
       cada activo no computable que se mueve cambia la exposición. No hay que
       declarar dos veces la misma decisión. */
    if (f2.derivada) {
      const reglas = ((esq.ajuste_por_inflacion || {}).fase_ii || {}).como_se_deduce || {};
      const fuera = reglas.no_son_movimiento || [];
      const activos = fi.no_computable
        .map((x) => x.cuenta)
        .filter((c) => esActivo(c))
        .sort();
      const def = (concepto, cuenta, signo) => ({
        concepto: concepto, cuentas: [cuenta], signo: signo,
        excluir_plantillas: fuera,
        norma: signo === "debe" ? "art. 106 d) I" : "art. 106 d) II",
      });
      f2 = {
        positivos: activos.map((c) => def(c, c, "debe")),
        negativos: activos.map((c) => def(c, c, "haber")),
        derivada: true,
        nota: reglas.regla || null,
      };
    }
    r.fase_ii = {
      derivada: !!f2.derivada,
      nota: f2.nota || null,
      positivos: bloque(f2.positivos, 1),
      negativos: bloque(f2.negativos, -1),
    };
    r.fase_ii.total = r.fase_ii.positivos.total + r.fase_ii.negativos.total;

    r.ajuste_inflacion = fi.ajuste + r.fase_ii.total;

    /* ----- honorarios del directorio ----- */
    const h = g.honorarios_directorio || {};
    /* A valores históricos: el asiento de impuesto va después del ajuste por
       inflación, así que el saldo de la cuenta ya vendría reexpresado. */
    const devengado = Math.abs(this.saldoHistorico(h.cuenta_gasto));
    const crit = (esq.honorarios_directorio.criterios || {})[h.criterio_tope];
    const U = r.resultado_historico + devengado;
    const tope = crit ? U * 0.1625 / 0.9125 : null;
    const exceso = tope === null ? 0 : Math.max(0, devengado - tope);
    r.honorarios = { devengado: devengado, base: U, tope: tope, exceso: exceso,
                     criterio: h.criterio_tope, condicion: esq.honorarios_directorio.condicion };
    if (!h.asignados_por_asamblea) {
      r.avisos.push("Los honorarios del directorio se deducen en el ejercicio sólo si la " +
        "asamblea los asignó individualmente antes del vencimiento de la declaración " +
        "jurada. Falta declarar `asignados_por_asamblea`.");
    }

    /* ----- amortización sobre el valor actualizado al cierre -----

       Art. 93: los bienes adquiridos en ejercicios iniciados desde 2018 actualizan
       su costo por IPC hasta el cierre, y la amortización se calcula sobre ese
       valor. La contabilidad histórica amortizó sobre el valor de origen sin
       actualizar, así que la diferencia es una deducción más.

       No se pisa con el Título VI: los bienes de uso están fuera del activo
       computable justamente porque se actualizan por acá. */
    const am = g.amortizacion_impositiva || {};
    r.amortizacion = null;
    if (am.actualizar_al_cierre) {
      const rubros = (this.p.amortizacion || {}).rubros || {};
      const hoja = this.hojaDeAjuste();
      const filas = Object.keys(rubros).map((cuenta) => {
        const historica = this.amortHistorica[cuenta] || 0;
        const bien = hoja.por[cuenta];
        const valor = bien ? bien.base + bien.ajuste
          : (this.apertura[cuenta] || 0) + (this.altas[cuenta] || 0);
        const actualizada = rubros[cuenta].tasa * valor;
        return { cuenta: cuenta, tasa: rubros[cuenta].tasa,
                 valor_origen: (this.apertura[cuenta] || 0) + (this.altas[cuenta] || 0),
                 valor_actualizado: valor, historica: historica,
                 actualizada: actualizada, mayor: actualizada - historica };
      }).filter((x) => x.historica || x.actualizada);
      r.amortizacion = {
        norma: am.norma || (esq.amortizaciones || {}).norma,
        regla: (esq.amortizaciones || {}).regla,
        filas: filas,
        historica: filas.reduce((t, x) => t + x.historica, 0),
        actualizada: filas.reduce((t, x) => t + x.actualizada, 0),
        mayor: filas.reduce((t, x) => t + x.mayor, 0),
      };
    }

    /* ----- otros ajustes que el ente declare, uno por uno ----- */
    r.otros = (g.otros_ajustes || []).map((x) => ({
      concepto: x.concepto, norma: x.norma || null, importe: x.importe,
    }));

    /* ----- la ganancia neta imponible ----- */
    r.imponible = r.resultado_historico + r.ajuste_inflacion + exceso -
      (r.amortizacion ? r.amortizacion.mayor : 0) +
      r.otros.reduce((t, x) => t + x.importe, 0);

    /* ----- la escala -----

       La del ejercicio manda. Los montos del artículo 73 se actualizan todos los
       años por IPC, así que la escala es un dato del período fiscal y entra con
       la planilla; la que trae el esquema de la aplicación es el respaldo, para
       cuando la planilla no la traiga. */
    const esc = ((this.ej.bases || {}).escala) || (esq.escalas || {})[g.escala];
    if (!esc) throw new Error("No está cargada la escala del artículo 73 para " + g.escala);
    r.escala = { periodo: esc.periodo_fiscal, resolucion: esc.resolucion,
                 base_legal: esc.base_legal || null,
                 origen: (this.ej.bases || {}).escala
                   ? ((this.ej.bases || {}).origen || "la planilla del ejercicio")
                   : "el esquema de la aplicación",
                 tramos: [] };
    let impuesto = 0;
    if (r.imponible > 0) {
      const t = esc.tramos.find((x) =>
        r.imponible > x.desde && (x.hasta === null || r.imponible <= x.hasta));
      impuesto = t.fijo + t.alicuota * (r.imponible - t.desde);
      r.escala.tramo = t;
    }
    r.impuesto_determinado = impuesto;
    r.tasa_efectiva = r.imponible > 0 ? impuesto / r.imponible : null;

    /* ----- lo que se computa contra el impuesto ----- */
    const dif25413 = this.controlComputo25413();
    if (dif25413.length) {
      r.avisos.push("La tabla de cómputo de la ley 25.413 de la planilla no coincide con " +
        "la de la aplicación: " + dif25413.join("; ") + ". Manda la de la aplicación, que " +
        "sale de la ley; si la que cambió es la ley, se cambia " +
        "`esquema/impuesto-ley-25413.json`.");
    }
    const saldos = this.saldos();
    r.creditos = (g.creditos || []).map((x) => {
      /* Con `plantilla` se computa sólo lo que generó **este** ejercicio, no el
         saldo de la cuenta: el remanente del impuesto sobre débitos y créditos
         que un ejercicio anterior no llegó a computar no se traslada. */
      let importe;
      if (x.origen === "anticipos_ganancias") {
        /* La lista de anticipos del período fiscal, de la planilla. Incluye los
           que se pagaron después del cierre: la contabilidad no los tiene —no
           estaban pagados al 30/06— y la declaración jurada sí los computa. */
        const lista = this.ej.anticipos_ganancias || [];
        importe = lista.reduce((t, a) => t + (a.importe || 0), 0);
        const despues = lista.filter((a) => a.fecha > this.ej.cierre);
        return { concepto: x.concepto, importe: importe, cuenta: null,
                 detalle: lista, despues_del_cierre: despues.length,
                 importe_despues: despues.reduce((t, a) => t + (a.importe || 0), 0) };
      }
      if (x.plantilla) {
        importe = 0;
        this.asientos.forEach((a) => {
          if (a.template !== x.plantilla) return;
          a.lineas.forEach((l) => {
            if (l.cuenta === x.cuenta) importe += l.debe - l.haber;
          });
        });
        const enCuenta = Math.abs(saldos[x.cuenta] || 0);
        const sobra = enCuenta - importe;
        if (Math.abs(sobra) > 0.05) {
          r.avisos.push("La cuenta «" + x.cuenta + "» cierra en " +
            enCuenta.toFixed(2) + " pero el ejercicio generó " + importe.toFixed(2) +
            ": los " + sobra.toFixed(2) + " de diferencia vienen de ejercicios " +
            "anteriores y no se computan. Hay que darlos de baja.");
        }
      } else if (x.cuenta) {
        importe = Math.abs(saldos[x.cuenta] || 0);
      } else {
        importe = x.importe || 0;
      }
      return { concepto: x.concepto, importe: importe, cuenta: x.cuenta || null,
               solo_del_ejercicio: !!x.plantilla };
    });
    r.creditos_total = r.creditos.reduce((t, x) => t + x.importe, 0);
    r.saldo = impuesto - r.creditos_total;
    if (r.creditos_total > impuesto) {
      r.avisos.push("Los créditos superan al impuesto determinado. El excedente del " +
        "impuesto sobre débitos y créditos no es saldo a favor de libre disponibilidad: " +
        "no se compensa ni se traslada, y la porción no computada se deduce como gasto " +
        "en el balance impositivo.");
    }
    return r;
  };


  /* ---------- el criterio congelado del prototipo de Mordor ----------

     Determinación simplificada: alícuota plana, sólo la fase estática y el
     tope de honorarios restado entero. **No es la determinación de la ley**;
     es lo que congeló el prototipo, y se conserva para que Mordor siga
     reproduciéndose. Los entes que declaran `ganancias.version: 2` van por
     `determinarGanancias`. */

  Diario.prototype.determinarImpuesto = function () {
    const g = this.p.ganancias;
    const historico = this.resultadoHistorico();
    const rcah = historico + g.honorarios_devengados;

    const act = g.ajuste_impositivo.cuentas_activo
      .reduce((t, c) => t + (this.apertura[c] || 0), 0);
    const pas = -g.ajuste_impositivo.cuentas_pasivo
      .reduce((t, c) => t + (this.apertura[c] || 0), 0);
    this.ajusteImpositivo = (pas - act) * (this.pap - 1);

    this.topeHonorarios = rcah * g.tope_honorarios_directorio;
    this.resultadoImpositivo = rcah + this.ajusteImpositivo - this.topeHonorarios;
    this.resultadoHistoricoValor = historico;
    this.rcah = rcah;
    return this.resultadoImpositivo * g.alicuota;
  };

  /* Resultado del ejercicio a valores históricos: todo menos la apertura, el
     ajuste por inflación y el impuesto. */
  Diario.prototype.resultadoHistorico = function () {
    const resultado = this.cuentasDeResultado();
    let total = 0;
    this.asientos.forEach((a) => {
      if (a.rol !== "normal") return;
      a.lineas.forEach((l) => {
        if (resultado[l.cuenta]) total -= l.debe - l.haber;
      });
    });
    return total;
  };

  /* El saldo de una cuenta contando sólo los asientos del ejercicio, sin la
     apertura ni la reexpresión: los valores de origen. */
  Diario.prototype.saldoHistorico = function (cuenta) {
    let total = 0;
    this.asientos.forEach((a) => {
      if (a.rol !== "normal") return;
      a.lineas.forEach((l) => { if (l.cuenta === cuenta) total += l.debe - l.haber; });
    });
    return total;
  };

  Diario.prototype.cuentasDeResultado = function () {
    const r = {};
    const cuentas = this.d.mapeo.cuentas;
    for (const c in cuentas) {
      const linea = cuentas[c].linea;
      if (linea.indexOf("er.") === 0 || linea === "anexo.gastos_naturaleza") r[c] = true;
    }
    return r;
  };

  /* ---------- el resultado del ejercicio ---------- */

  /* El signo con el que una cuenta entra al estado: las de ingreso, el ajuste
     por inflación y el impuesto tienen saldo acreedor, así que se dan vuelta
     para que la ganancia salga positiva y la pérdida negativa. */
  function signoDeLinea(linea) {
    /* Todos los renglones del estado de resultados se dan vuelta, para que el
       estado se lea sumando: un ingreso suma y un gasto resta. Los gastos por
       naturaleza quedan afuera porque el anexo los muestra en positivo. */
    return linea.indexOf("er.") === 0 ? -1 : 1;
  }

  /* El estado de resultados y el anexo de gastos, armados del diario.

     No es el estado que se publica: ese lo arma `motor.js`, en dos columnas y
     con las notas. Éste es el papel de trabajo —una sola columna, y debajo de
     cada renglón las cuentas que lo forman— que es lo que hace falta para
     controlar el resultado antes de determinar el impuesto a las ganancias.
     Sale del diario, así que no puede diferir de los libros. */
  Diario.prototype.resultado = function () {
    const cuentas = this.d.mapeo.cuentas;
    const s = this.saldos();
    const importes = {}, detalle = {}, gastos = {};

    Object.keys(s).sort((a, b) => a.localeCompare(b, "es")).forEach((cuenta) => {
      const m = cuentas[cuenta];
      if (!m || !m.linea) return;
      const esGasto = m.linea === "anexo.gastos_naturaleza";
      if (!esGasto && m.linea.indexOf("er.") !== 0) return;

      const importe = s[cuenta] * signoDeLinea(m.linea);
      /* El gasto se acumula positivo en el anexo, por naturaleza y por columna,
         y entra al estado restando. */
      if (esGasto) {
        const col = gastos[m.columna] || (gastos[m.columna] = {});
        const concepto = m.concepto || cuenta;
        col[concepto] = (col[concepto] || 0) + importe;
      }
      const linea = esGasto ? "er.gastos." + m.columna : m.linea;
      const aporte = esGasto ? -importe : importe;
      importes[linea] = (importes[linea] || 0) + aporte;
      (detalle[linea] || (detalle[linea] = []))
        .push({ cuenta: cuenta, importe: aporte });
    });

    const calc = {};
    const valor = (id) => (id in calc ? calc[id] : (importes[id] || 0));
    const suma = (patrones) => (patrones || []).reduce((t, p) => {
      if (p.slice(-2) !== ".*") return t + valor(p);
      const prefijo = p.slice(0, -1);
      return t + Object.keys(importes)
        .filter((k) => k.indexOf(prefijo) === 0)
        .reduce((u, k) => u + importes[k], 0);
    }, 0);

    /* Lo que no tiene importe no se imprime, y un bloque entero vacío se lleva
       su título y su subtotal. Un renglón con `condicion` sale sólo si la línea
       que condiciona tiene importe: sin costo de ventas no hay ganancia bruta
       que mostrar. */
    const vivo = (x) => Math.abs(x) > TOL;
    const lineas = this.d.plan.estados.er.lineas;
    const presentes = {};
    lineas.forEach((l) => {
      if (l.rol) return;
      if (l.siempre || vivo(importes[l.id] || 0)) presentes[l.id] = true;
    });
    const bloqueVivo = (prefijo) =>
      Object.keys(presentes).some((k) => k.indexOf(prefijo) === 0);

    const salida = [];
    lineas.forEach((l) => {
      if (l.rol === "titulo") {
        if (bloqueVivo(l.id + ".")) salida.push({ titulo: l.concepto });
        return;
      }
      if (l.rol === "subtotal" || l.rol === "total") {
        calc[l.id] = suma(l.suma);
        if (l.condicion && !vivo(valor(l.condicion))) return;
        const comodin = (l.suma || []).find((p) => p.slice(-2) === ".*");
        const sale = comodin ? bloqueVivo(comodin.slice(0, -1))
          : (l.siempre || vivo(calc[l.id]));
        if (sale) {
          salida.push({ id: l.id, concepto: l.concepto, rol: l.rol,
                        importe: calc[l.id] });
        }
        return;
      }
      if (!presentes[l.id]) return;
      salida.push({ id: l.id, concepto: l.concepto, rol: null,
                    importe: importes[l.id] || 0,
                    cuentas: (detalle[l.id] || []).slice()
                      .sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe)) });
    });

    return {
      lineas: salida,
      gastos: gastos,
      antes_impuesto: calc["er.antes_impuesto"] || 0,
      del_ejercicio: calc["er.resultado_ejercicio"] || 0,
    };
  };

  /* ---------- saldos y mayor ---------- */

  Diario.prototype.saldos = function () {
    const s = {};
    this.asientos.forEach((a) => a.lineas.forEach((l) => {
      s[l.cuenta] = (s[l.cuenta] || 0) + l.debe - l.haber;
    }));
    return s;
  };

  /* El orden en que se abren las cuentas del mayor es el del plan de exposición:
     el mismo en que después se leen en el balance. De paso queda el nombre del
     rubro al que va cada cuenta. */
  Diario.prototype.lineasDelPlan = function () {
    const orden = [], concepto = {};
    const push = (id, texto) => {
      if (!id) return;
      if (orden.indexOf(id) < 0) orden.push(id);
      if (texto && !concepto[id]) concepto[id] = texto;
    };
    const e = this.d.plan.estados;
    e.esp.bloques.forEach((b) => b.lineas.forEach((l) => push(l.id, l.concepto)));
    (e.eepn.columnas || []).forEach((c) => push("eepn." + c.id, c.titulo));
    e.er.lineas.forEach((l) => {
      push(l.id, l.concepto);
      if (l.columna_anexo) push("anexo.gastos_naturaleza:" + l.columna_anexo, l.concepto);
    });
    return { orden, concepto };
  };

  Diario.prototype.mayor = function () {
    const cuentas = this.d.mapeo.cuentas;
    const plan = this.lineasDelPlan();
    const idDe = (m) => (m.linea === "anexo.gastos_naturaleza"
      ? "anexo.gastos_naturaleza:" + m.columna : m.linea);
    const clave = (c) => {
      const m = cuentas[c];
      if (!m) return plan.orden.length + 1;
      const i = plan.orden.indexOf(idDe(m));
      return i < 0 ? plan.orden.length : i;
    };

    const por = {};
    this.asientos.forEach((a) => a.lineas.forEach((l) => {
      const c = por[l.cuenta]
        || (por[l.cuenta] = { cuenta: l.cuenta, movimientos: [], debe: 0, haber: 0 });
      c.debe += l.debe;
      c.haber += l.haber;
      c.movimientos.push({
        numero: a.numero, fecha: a.fecha, nombre: a.nombre, glosa: a.glosa,
        debe: l.debe, haber: l.haber, saldo: c.debe - c.haber,
      });
    }));

    return Object.keys(por).map((c) => {
      const m = cuentas[c] || {};
      const x = por[c];
      x.linea = m.linea || null;
      // el detalle de la nota si lo tiene; si no, el rubro del plan
      x.concepto = m.concepto || (m.linea ? plan.concepto[idDe(m)] : null) || null;
      x.orden = clave(c);
      x.saldo = x.debe - x.haber;
      return x;
    }).sort((a, b) => (a.orden - b.orden) || a.cuenta.localeCompare(b.cuenta, "es"));
  };

  /* ---------- avisos ---------- */

  /* A06: comprobantes cuyo detalle no reconstruye el total. Es el síntoma de un
     dato mal informado en la exportación de ARCA. */
  Diario.prototype.comprobantesInconsistentes = function () {
    const malos = [];
    this.f.compras.forEach((c) => {
      const detalle = (c.neto_gravado || 0) + (c.neto_no_gravado || 0)
        + (c.exento || 0) + (c.otros_tributos || 0) + (c.iva || 0);
      if (detalle === 0) return;   // factura C o exenta: ARCA solo informa el total
      const dif = detalle - (c.total || 0);
      if (Math.abs(dif) > TOL) malos.push({ comprobante: c, sobra: dif });
    });
    return malos;
  };

  /* A07: comprobantes de compra sin concepto de gasto. Entran al diario como
     cuenta en blanco, así que no pueden pasar sin que se vean. */
  Diario.prototype.comprasSinConcepto = function () {
    return this.f.compras.filter((c) => !c.concepto);
  };

  /* La conciliación bancaria: lo que el extracto dice que pasó contra lo que el
     diario dice que pasó.

     Es el control que cierra el círculo. El extracto mueve el banco por dos
     caminos: los movimientos que asienta él mismo y los que ya venían de otra
     fuente —volantes, cuotas de planes, ingresos brutos—. Si la cuenta del banco
     en el diario no termina en el mismo saldo que el extracto, algo se asentó
     dos veces o no se asentó: no hay tercera explicación. */
  Diario.prototype.conciliacionBancaria = function () {
    const b = this.banco;
    if (!b) return null;
    const cuenta = (this.ej.cuentas || {}).banco;
    if (!cuenta) return null;

    const apertura = this.apertura[cuenta] || 0;
    const extracto = apertura + b.asentado + b.yaAsentado;
    const diario = this.saldos()[cuenta] || 0;
    return {
      cuenta: cuenta,
      apertura: apertura,
      movimientos: b.movimientos,
      asentado: b.asentado,
      yaAsentado: b.yaAsentado,
      sinRubro: b.sinRubro,
      extracto: extracto,
      diario: diario,
      diferencia: diario - extracto,
      porRubro: b.porRubro,
    };
  };

  /* Los retiros de los socios: lo que el banco pagó contra lo que la planilla
     declara, y contra la participación de cada uno.

     Sirve para dos cosas. Una, encontrar retiros que la planilla no anotó: el
     banco no se olvida. La otra, ver si el reparto siguió la participación
     social, que es lo que uno espera de un anticipo de dividendos; cuando no da,
     casi siempre es una cuota que se pagó unos días después del cierre. */
  Diario.prototype.retirosDeSocios = function () {
    const socios = this.f.socios || [];
    if (!socios.length) return null;
    const cfg = (this.ej.asientos || []).find((x) => x.template === "extractos");
    if (!cfg) return null;
    const rubro = Object.keys(cfg.rubros || {})
      .find((k) => sinAcentos(cfg.rubros[k]) === sinAcentos(
        (this.ej.cuentas || {})["anticipo_socios"] || "Anticipo Dividendos Socios"));
    if (!rubro) return null;

    const pagado = {}, declarado = {};
    (this.f.extractos || []).forEach((m) => {
      if (sinAcentos(m.rubro) !== sinAcentos(rubro) || !this.enEjercicio(m.fecha)) return;
      pagado[m.detalle] = (pagado[m.detalle] || 0) + (m.debito || 0) - (m.credito || 0);
    });
    (this.f.retiros_declarados || []).forEach((r) => {
      declarado[r.socio] = (declarado[r.socio] || 0) + (r.importe || 0);
    });

    const total = socios.reduce((t, s) => t + (pagado[s.socio] || 0), 0);
    return {
      total: total,
      totalDeclarado: socios.reduce((t, s) => t + (declarado[s.socio] || 0), 0),
      filas: socios.map((s) => ({
        socio: s.socio,
        participacion: s.participacion,
        pagado: pagado[s.socio] || 0,
        declarado: declarado[s.socio] || 0,
        /* Lo que le habría tocado si el reparto siguiera la participación. */
        segunParticipacion: total * (s.participacion || 0),
      })),
    };
  };

  /* ---------- el puente a los estados ---------- */

  /* Los estados contables los arma `motor.js`, que hasta acá leía un archivo de
     saldos producido aparte. Esto se lo da **del diario**, en memoria: una sola
     fuente para los libros y para los estados, sin archivo intermedio que se
     pueda quedar viejo ni segundo motor que se pueda separar.

     En modo histórico el coeficiente es 1: la comparativa no se reexpresa y el
     anexo de bienes de uso trabaja sobre los valores de origen. Es lo que hace
     falta para arrancar la determinación del impuesto a las ganancias. */
  Diario.prototype.paraMotor = function () {
    const comp = this.ej.comparativo || {};
    const k = this.historico ? 1 : this.pap;
    const reexpresado = (o) => {
      const r = {};
      Object.keys(o || {}).forEach((x) => {
        if (typeof o[x] === "number") r[x] = o[x] * k;
      });
      return r;
    };

    /* Las tasas de amortización vienen indexadas por la cuenta del valor de
       origen, pero el anexo se arma por rubro, y el nombre del rubro lo declara
       el mapeo en `anexo_rubro`. En Lima Sur los dos nombres coinciden; en
       Mordor no («Muebles y Utiles» contra «Muebles y útiles»), y el anexo salía
       con una clave que el motor después no encontraba. Manda el mapeo. */
    /* El anexo va en moneda de cierre, y las altas también: cada una se
       reexpresa desde el mes en que se compró, no con el coeficiente de punta a
       punta. Ese importe ya está calculado en el papel del ajuste —valor de
       origen al cierre—, así que las altas salen de restarle la apertura
       reexpresada. A valores históricos no hay papel de ajuste y las altas son
       la suma de las compras, tal cual. */
    const alCierre = {};
    (this.papelAjuste || []).forEach((x) => { alCierre[x.cuenta] = x.base + x.ajuste; });

    const bu = {};
    const rubros = (this.p.amortizacion || {}).rubros || {};
    Object.keys(rubros).forEach((cuenta) => {
      const m = this.d.mapeo.cuentas[cuenta] || {};
      const rubro = m.anexo_rubro || cuenta;
      const cierre = alCierre[cuenta];
      bu[rubro] = {
        altas: cierre === undefined ? (this.altas[cuenta] || 0)
          : cierre - (this.apertura[cuenta] || 0) * k,
        bajas: 0,
        amort_bajas: 0,
        tasa: rubros[cuenta].tasa,
      };
    });

    const anterior = this.indice[this.ej.cierre_anterior.slice(0, 7)];
    return {
      ente: this.ej.ente,
      ejercicio: {
        numero: this.ej.numero, inicio: this.ej.inicio, cierre: this.ej.cierre,
        inicio_anterior: this.ej.inicio_anterior,
        cierre_anterior: this.ej.cierre_anterior,
      },
      indice: {
        serie: (this.f.indices_serie || "FACPCE Res. JG 539/2018"),
        cierre_anterior: anterior,
        cierre_actual: this.iCierre,
        coeficiente: k,
        variacion_actual: this.pap - 1,
        variacion_anterior: typeof comp.variacion === "number" ? comp.variacion : null,
      },
      origen: this.historico
        ? "generado por app/diario.js, a valores históricos: sin el ajuste por inflación"
        : "generado por app/diario.js, en moneda homogénea de cierre",
      historico: !!this.historico,
      cierre: this.saldos(),
      apertura: Object.assign({ nota: (this.ej.apertura || {}).nota }, this.apertura),
      anexo_bienes_uso: bu,
      comparativo_resultados: reexpresado(comp.resultados),
      comparativo_gastos: reexpresado(comp.gastos),
      /* Los saldos del cierre anterior al comparativo: sin ellos el estado de
         flujo de efectivo no tiene de dónde sacar las variaciones del ejercicio
         anterior, y la columna comparativa sale en cero. */
      comparativo_esp_anterior: comp.esp_anterior
        ? reexpresado(comp.esp_anterior.lineas) : null,
      comparativo_variacion: typeof comp.variacion === "number" ? comp.variacion : null,
      informe_auditoria: this.ej.informe_auditoria || null,
      /* Los movimientos del patrimonio durante el ejercicio: **sólo los asientos
         normales**. La apertura no es un movimiento, y la reexpresión del
         capital nominal tampoco —esa va a la cuenta de ajuste del capital—. Cada
         uno se reexpresa desde su mes. */
      eepn_movimientos: (() => {
        const mov = {};
        this.asientos.forEach((a) => {
          if (a.rol !== "normal") return;
          const coef = this.historico ? 1 : this.coef(a.fecha);
          a.lineas.forEach((l) => {
            const mm = this.d.mapeo.cuentas[l.cuenta];
            if (!mm || mm.linea.indexOf("eepn.") !== 0) return;
            mov[mm.linea] = (mov[mm.linea] || 0) + (l.debe - l.haber) * coef;
          });
        });
        return mov;
      })(),
    };
  };

  /* A08: cuentas con movimiento que no están en el mapeo de exposición. */
  Diario.prototype.cuentasSinMapear = function () {
    const cuentas = this.d.mapeo.cuentas;
    const s = this.saldos();
    return Object.keys(s).filter((c) => !cuentas[c]).sort();
  };

  Diario.prototype.totales = function () {
    const s = this.saldos();
    let suma = 0;
    for (const c in s) suma += s[c];
    return {
      debe: this.asientos.reduce((t, a) => t + a.debe, 0),
      haber: this.asientos.reduce((t, a) => t + a.haber, 0),
      suma: suma,
    };
  };

  /* Arma el diario con datos ya cargados en memoria, sin leer archivos. Es lo
     que usa la importación para mostrar los asientos antes de guardar nada.
     `d` = { ente, mapeo, ej, f, plan }. */
  function desde(d, opciones) {
    return new Diario(d, opciones);
  }

  global.LibroDiario = { cargar, desde, TOL, PLANTILLAS };
})(window);
