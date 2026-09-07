/* Los libros: diario, mayor y sumas y saldos.
   El armado lo hace diario.js; acá solo se dibuja. Ninguna cifra se escribe. */

(function () {
  "use strict";

  const pesos = window.Motor.pesos;
  const F = window.Motor.fechaCorta;
  const $ = (s) => document.querySelector(s);

  let d;
  /* Moneda homogénea (lo normal) o valores históricos, sin ajuste por
     inflación. Lo decide `?moneda=historica` y cambia el diario entero. */
  let historico = false;

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* importe con signo pesos: el $ se ancla a la izquierda de la celda */
  function imp(x) {
    if (x === undefined || x === null || x === "" || x === 0) return "";
    return `<span class="pe">$</span>${pesos(x, 2)}`;
  }

  /* El saldo de una cuenta del mayor: sin signo, con la letra D o A. El saldo
     cero se imprime igual: que una cuenta cierre en cero es un dato. */
  function saldo(x) {
    if (x === undefined || x === null || x === "") return "";
    if (Math.round(x * 100) === 0) return `<span class="pe">$</span>${pesos(0, 2)}`;
    return `<span class="da">${x > 0 ? "D" : "A"}</span>` +
           `<span class="pe">$</span>${pesos(Math.abs(x), 2)}`;
  }

  /* ---------- armazón de cada libro ---------- */

  function encabezado(titulo, subtitulo) {
    return `<div class="entidad"><span>Denominación de la entidad:
        <strong>${esc(d.ente.denominacion)}</strong></span><span>CUIT ${esc(d.ente.cuit)}</span></div>
      <h1 class="titulo-estado">${esc(titulo)}</h1>
      <p class="subtitulo-estado">${esc(subtitulo)}</p>`;
  }

  function libro(clase, titulo, subtitulo, contenido) {
    return `<section class="hoja continua ${clase}">
      <div class="contenido">${encabezado(titulo, subtitulo)}${contenido}</div>
    </section>`;
  }

  /* La moneda va escrita en cada hoja, siempre. Un balance de sumas y saldos a
     valores históricos y otro en moneda homogénea son dos papeles distintos con
     el mismo título: si no lo dice, se confunden. */
  const periodo = () => `Ejercicio N° ${d.ej.numero}, iniciado el ${F(d.ej.inicio)} ` +
    `y finalizado el ${F(d.ej.cierre)}. ` + (historico
      ? "Importes a valores históricos, sin ajuste por inflación."
      : "Importes en moneda homogénea del cierre.");

  /* ---------- libro diario ---------- */

  function diario() {
    const cuerpos = d.asientos.map((a) => {
      const debe = a.lineas.filter((l) => l.debe);
      const haber = a.lineas.filter((l) => l.haber);
      const fila = (l, sangra) => `<tr>
        <td class="fecha"></td>
        <td class="concepto${sangra ? " sangra" : ""}">${esc(l.cuenta)}</td>
        <td class="num">${imp(l.debe)}</td>
        <td class="num">${imp(l.haber)}</td></tr>`;
      return `<tbody>
        <tr class="asiento">
          <td class="fecha">${F(a.fecha)}</td>
          <td colspan="3"><span class="n">Asiento N° ${a.numero}</span> · ${esc(a.nombre)}</td>
        </tr>
        ${debe.map((l) => fila(l, false)).join("")}
        ${haber.map((l) => fila(l, true)).join("")}
        <tr class="glosa"><td></td><td colspan="3">${esc(a.glosa)}</td></tr>
        <tr class="suma">
          <td></td><td>Suma del asiento</td>
          <td class="num">${imp(a.debe)}</td><td class="num">${imp(a.haber)}</td></tr>
      </tbody>`;
    }).join("");

    const t = d.totales();
    const hayAxi = d.asientos.some((a) => a.rol === "axi");
    return libro("diario", "LIBRO DIARIO",
      periodo() + (hayAxi
        ? " El asiento de ajuste por inflación lleva las partidas no monetarias a moneda del " +
          F(d.ej.cierre) + "."
        : ""),
      `<div class="cuadro">
        <table class="libro">
          <thead><tr>
            <th class="izq">Fecha</th><th class="izq">Cuenta</th>
            <th class="num">Debe</th><th class="num">Haber</th>
          </tr></thead>
          ${cuerpos}
          <tbody><tr class="total">
            <td></td><td>Totales del ejercicio</td>
            <td class="num">${imp(t.debe)}</td><td class="num">${imp(t.haber)}</td>
          </tr></tbody>
        </table>
      </div>`);
  }

  /* ---------- libro mayor ---------- */

  const sinAcentos = (x) => String(x === null || x === undefined ? "" : x)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  function mayor() {
    const cuentas = d.mayor().map((c) => {
      const filas = c.movimientos.map((mv) => `<tr>
        <td class="fecha">${F(mv.fecha)}</td>
        <td class="num asiento-n">${mv.numero}</td>
        <td class="concepto">${esc(mv.nombre)}</td>
        <td class="num">${imp(mv.debe)}</td>
        <td class="num">${imp(mv.haber)}</td>
        <td class="num saldo">${saldo(mv.saldo)}</td></tr>`).join("");
      return `<div class="cuenta-mayor" data-cuenta="${esc(sinAcentos(c.cuenta))}">
        <h3><span>${esc(c.cuenta)}</span>
          <span class="rubro">${c.concepto ? esc(c.concepto) : "<em>sin mapear</em>"}</span></h3>
        <div class="cuadro">
          <table class="libro">
            <thead><tr>
              <th class="izq">Fecha</th><th class="num">As.</th><th class="izq">Detalle</th>
              <th class="num">Debe</th><th class="num">Haber</th><th class="num">Saldo</th>
            </tr></thead>
            <tbody>${filas}
              <tr class="suma">
                <td></td><td></td><td>Saldo al cierre</td>
                <td class="num">${imp(c.debe)}</td>
                <td class="num">${imp(c.haber)}</td>
                <td class="num saldo">${saldo(c.saldo)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
    }).join("");

    const hayAxi = d.asientos.some((a) => a.rol === "axi");
    return libro("mayor", "LIBRO MAYOR",
      periodo() + ` Saldos al ${F(d.ej.cierre)}` +
      (hayAxi ? ", en moneda homogénea de esa fecha." : ", a valores nominales."),
      cuentas);
  }

  /* ---------- sumas y saldos ---------- */

  /* Las cuentas se agrupan por su naturaleza —activo corriente, no corriente,
     pasivo, patrimonio, resultados positivos y negativos— en el orden que
     declara el plan de exposición. El orden no es decorativo: es el que deja ver
     de un vistazo si una cuenta quedó clasificada donde no va. */
  function porJerarquia(cuentas) {
    const j = (d.d.plan.jerarquia_cuentas || {}).grupos || [];
    const meta = (c) => d.d.mapeo.cuentas[c] || {};
    const grupos = j.map((g) => Object.assign({}, g, { cuentas: [] }));
    const sueltas = [];
    cuentas.forEach((c) => {
      const m = meta(c.cuenta);
      /* Manda la naturaleza que declara el plan de la empresa. El renglón de
         exposición es el respaldo, para los entes cuyo plan todavía no la trae:
         alcanza para casi todo, pero no distingue `RECPAM +` de `RECPAM −`,
         que van al mismo renglón y son de signo opuesto. */
      const g = (m.naturaleza && grupos.find((x) => x.sigla === m.naturaleza)) ||
        grupos.find((x) => x.prefijos.some((p) => (m.linea || "").indexOf(p) === 0));
      (g ? g.cuentas : sueltas).push(c);
    });
    if (sueltas.length) {
      grupos.push({ sigla: "?", rotulo: "Sin renglón de exposición", cuentas: sueltas });
    }
    return grupos.filter((g) => g.cuentas.length);
  }

  /* Las subcuentas y su sumarizadora, juntas y con su subtotal.

     La columna «Suma en» del plan dice de qué cuenta forma parte una subcuenta:
     los cinco socios suman en «Anticipo Dividendos Socios», los planes de pago
     en «MF a pagar». Al diario y al mayor van sueltas, y así tiene que ser; en
     las planillas de saldos, leer cinco renglones y sumarlos a ojo no ayuda.

     Devuelve la lista del grupo con las familias armadas: la sumarizadora
     primero —si tiene saldo propio—, sus subcuentas atrás, y un renglón de
     subtotal. El subtotal es exactamente la suma de los renglones que están
     arriba de él, ni uno más: un papel que muestra una suma que no es la de sus
     renglones es peor que no mostrarla.

     Una familia de un solo renglón no lleva subtotal: sería repetir la cifra. */
  function enFamilias(cuentas) {
    const padreDe = (c) => (d.d.mapeo.cuentas[c.cuenta] || {}).suma_en || null;
    const hijasDe = {};
    cuentas.forEach((c) => {
      const p = padreDe(c);
      if (p) (hijasDe[p] = hijasDe[p] || []).push(c);
    });
    if (!Object.keys(hijasDe).length) {
      return cuentas.map((c) => ({ tipo: "cuenta", c }));
    }

    const salida = [];
    const puestas = new Set();
    cuentas.forEach((c) => {
      if (puestas.has(c)) return;
      /* La familia se emite entera la primera vez que aparece cualquiera de sus
         integrantes, esté donde esté en el orden del mayor. */
      const rotulo = hijasDe[c.cuenta] ? c.cuenta : padreDe(c);
      if (!rotulo || !hijasDe[rotulo]) {
        salida.push({ tipo: "cuenta", c });
        puestas.add(c);
        return;
      }
      const familia = [];
      const padre = cuentas.find((x) => x.cuenta === rotulo);
      if (padre) familia.push(padre);
      hijasDe[rotulo].forEach((h) => familia.push(h));
      familia.forEach((x) => {
        puestas.add(x);
        salida.push({ tipo: "cuenta", c: x, hija: x !== padre });
      });
      if (familia.length > 1) {
        salida.push({ tipo: "subtotal", rotulo, cuentas: familia });
      }
    });
    return salida;
  }

  function sumasYSaldos() {
    const tot = { debe: 0, haber: 0, deudor: 0, acreedor: 0 };
    const fila = (c, hija) => {
      const deudor = c.saldo > 0 ? c.saldo : 0;
      const acreedor = c.saldo < 0 ? -c.saldo : 0;
      tot.debe += c.debe; tot.haber += c.haber;
      tot.deudor += deudor; tot.acreedor += acreedor;
      return `<tr class="${hija ? "hija" : ""}">
        <td class="concepto">${esc(c.cuenta)}</td>
        <td class="num">${imp(c.debe)}</td>
        <td class="num">${imp(c.haber)}</td>
        <td class="num separa">${imp(deudor)}</td>
        <td class="num">${imp(acreedor)}</td></tr>`;
    };

    const subtotal = (x) => {
      const s = (f) => x.cuentas.reduce((t, c) => t + f(c), 0);
      return `<tr class="subtotal">
        <td class="concepto">Total ${esc(x.rotulo)}</td>
        <td class="num">${imp(s((c) => c.debe))}</td>
        <td class="num">${imp(s((c) => c.haber))}</td>
        <td class="num separa">${imp(s((c) => (c.saldo > 0 ? c.saldo : 0)))}</td>
        <td class="num">${imp(s((c) => (c.saldo < 0 ? -c.saldo : 0)))}</td></tr>`;
    };
    const suma = (g, campo) => g.cuentas.reduce((t, c) => t + campo(c), 0);
    const filas = porJerarquia(d.mayor()).map((g) => {
      const cuerpo = enFamilias(g.cuentas).map((x) =>
        x.tipo === "subtotal" ? subtotal(x) : fila(x.c, x.hija)).join("");
      const deudor = suma(g, (c) => (c.saldo > 0 ? c.saldo : 0));
      const acreedor = suma(g, (c) => (c.saldo < 0 ? -c.saldo : 0));
      return `<tr class="grupo-jerarquia"><td colspan="5">
          <span class="sigla">${esc(g.sigla)}</span> ${esc(g.rotulo)}</td></tr>` +
        cuerpo +
        `<tr class="suma"><td>Total ${esc(g.rotulo.toLowerCase())}</td>
          <td class="num">${imp(suma(g, (c) => c.debe))}</td>
          <td class="num">${imp(suma(g, (c) => c.haber))}</td>
          <td class="num separa">${imp(deudor)}</td>
          <td class="num">${imp(acreedor)}</td></tr>`;
    }).join("");

    return libro("sumas", "BALANCE DE SUMAS Y SALDOS",
      periodo() + ` Cierra el mayor y abre el balance al ${F(d.ej.cierre)}.`,
      `<div class="cuadro">
        <table class="libro sumas">
          <thead>
            <tr><th class="izq" rowspan="2">Cuenta</th>
              <th class="grupo" colspan="2">Sumas</th>
              <th class="grupo separa" colspan="2">Saldos</th></tr>
            <tr><th class="num">Debe</th><th class="num">Haber</th>
              <th class="num separa">Deudor</th><th class="num">Acreedor</th></tr>
          </thead>
          <tbody>${filas}</tbody>
          <tbody><tr class="total">
            <td>Totales</td>
            <td class="num">${imp(tot.debe)}</td><td class="num">${imp(tot.haber)}</td>
            <td class="num separa">${imp(tot.deudor)}</td><td class="num">${imp(tot.acreedor)}</td>
          </tr></tbody>
        </table>
      </div>`);
  }

  /* ---------- estado de saldos ---------- */

  /* El mismo balance de sumas y saldos sin las sumas: sólo el saldo de cada
     cuenta al cierre, en una columna. Es lo que se mira cuando lo que interesa
     es la posición y no el movimiento, y entra en muchas menos hojas.

     Se arma del mismo mayor y con la misma jerarquía, así que las dos planillas
     no se pueden contradecir: si una cuenta cambia de grupo, cambia en las dos. */
  function estadoDeSaldos() {
    let total = 0;
    const fila = (c, hija) => {
      total += c.saldo;
      return `<tr class="${hija ? "hija" : ""}">
        <td class="concepto">${esc(c.cuenta)}</td>
        <td class="num">${imp(c.saldo)}</td></tr>`;
    };
    const subtotal = (x) => `<tr class="subtotal">
      <td class="concepto">Total ${esc(x.rotulo)}</td>
      <td class="num">${imp(x.cuentas.reduce((t, c) => t + c.saldo, 0))}</td></tr>`;
    const filas = porJerarquia(d.mayor()).map((g) => {
      const suma = g.cuentas.reduce((t, c) => t + c.saldo, 0);
      return `<tr class="grupo-jerarquia"><td colspan="2">
          <span class="sigla">${esc(g.sigla)}</span> ${esc(g.rotulo)}</td></tr>` +
        enFamilias(g.cuentas).map((x) =>
          x.tipo === "subtotal" ? subtotal(x) : fila(x.c, x.hija)).join("") +
        `<tr class="suma"><td>Total ${esc(g.rotulo.toLowerCase())}</td>
          <td class="num">${imp(suma)}</td></tr>`;
    }).join("");

    return libro("saldos", "ESTADO DE SALDOS",
      periodo() + ` Saldo de cada cuenta al ${F(d.ej.cierre)}.` +
      " Deudor en positivo y acreedor en negativo: la suma de todos da cero.",
      `<div class="cuadro">
        <table class="libro saldos">
          <thead><tr><th class="izq">Cuenta</th><th class="num">Saldo</th></tr></thead>
          <tbody>${filas}</tbody>
          <tbody><tr class="total">
            <td>Total</td><td class="num">${imp(total)}</td>
          </tr></tbody>
        </table>
      </div>`);
  }

  /* ---------- papel de trabajo del ajuste por inflación ---------- */

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                 "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  /* «2025-07» se lee como «julio de 2025»; «apertura» y el recálculo de la
     amortización se leen tal cual. */
  function origen(k) {
    const m = /^(\d{4})-(\d{2})$/.exec(k);
    return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : k;
  }

  const coeficiente = (x) => x.toLocaleString("es-AR",
    { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  /* El ajuste cero se imprime: en un papel de control, una celda vacía no
     distingue «no ajusta» de «me olvidé de mirarlo». */
  const ajuste = (x) => (Math.round(x * 100) === 0
    ? `<span class="pe">$</span>${pesos(0, 2)}` : imp(x));

  /* Cada partida no monetaria con el detalle de su reexpresión: de dónde viene
     el importe, con qué coeficiente se lleva a moneda de cierre y cuánto es el
     ajuste. Es el papel que se controla antes de aceptar el asiento. */
  function papelDeAjuste() {
    const partidas = d.papelAjuste;
    if (!partidas || !partidas.length) return "";

    const bloques = partidas.map((x) => {
      const filas = x.tramos.map((t) => `<tr>
        <td class="concepto">${esc(origen(t.origen))}</td>
        <td class="num">${imp(t.base)}</td>
        <td class="coef">${t.coef === null ? "" : coeficiente(t.coef)}</td>
        <td class="num">${imp(t.base + t.ajuste)}</td>
        <td class="num separa">${ajuste(t.ajuste)}</td></tr>`).join("");
      const total = x.tramos.length > 1 ? `<tr class="suma">
        <td>Total de la cuenta</td>
        <td class="num">${imp(x.base)}</td><td class="coef"></td>
        <td class="num">${imp(x.base + x.ajuste)}</td>
        <td class="num separa">${ajuste(x.ajuste)}</td></tr>` : "";
      return `<div class="partida-axi">
        <h3><span>${esc(x.cuenta)}</span>${x.destino !== x.cuenta
          ? `<span class="destino">el ajuste va a ${esc(x.destino)}</span>` : ""}</h3>
        <table class="libro">
          <thead><tr>
            <th class="izq">Origen del importe</th>
            <th class="num">Importe histórico</th>
            <th class="coef">Coeficiente</th>
            <th class="num">Reexpresado</th>
            <th class="num separa">Ajuste</th></tr></thead>
          <tbody>${filas}${total}</tbody>
        </table></div>`;
    }).join("");

    const suma = partidas.reduce((t, x) => t + x.ajuste, 0);
    const cierre = `<div class="partida-axi"><table class="libro"><tbody>
      <tr class="total"><td>Suma de los ajustes de las partidas no monetarias</td>
        <td class="num">${imp(suma)}</td></tr>
      <tr class="total"><td>Resultado por exposición a los cambios en el poder
        adquisitivo de la moneda</td><td class="num">${imp(-suma)}</td></tr>
    </tbody></table></div>`;

    return libro("axi", "AJUSTE POR INFLACIÓN — PAPEL DE TRABAJO",
      periodo() + ` Coeficiente punta a punta ${coeficiente(d.pap)}. ` +
      "Cada partida se reexpresa desde la fecha de su origen hasta el cierre.",
      bloques + cierre);
  }

  /* ---------- conciliación bancaria: papel de trabajo ---------- */

  /* El extracto contra el diario, rubro por rubro. Lo que hay que ver de un
     vistazo es de dónde sale cada peso que pasó por el banco: lo que asienta el
     propio extracto y lo que ya venía de otra fuente —los volantes de ARCA, las
     cuotas de los planes, la declaración de ingresos brutos—. La suma de los dos
     más la apertura tiene que ser el saldo de la cuenta. */
  function conciliacionBancaria() {
    const c = d.conciliacionBancaria();
    if (!c) return "";
    const cfg = (d.ej.asientos || []).find((x) => x.template === "extractos") || {};
    const rubros = cfg.rubros || {};

    const clave = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
    const destino = (nombre) => {
      const k = Object.keys(rubros).find((x) => clave(x) === clave(nombre));
      if (k === undefined) return { texto: "sin rubro en el ejercicio", ya: false };
      const v = rubros[k];
      if (v === null) return { texto: "ya asentado por otra fuente", ya: true };
      if (typeof v === "string") return { texto: v, ya: false };
      const partes = (v.si_dice || [])
        .map((x) => `${x.cuenta} si dice «${x.contiene}»`);
      return { texto: [v.cuenta].concat(partes).filter(Boolean).join("; "), ya: false };
    };

    const nombres = Object.keys(c.porRubro)
      .sort((a, b) => Math.abs(c.porRubro[b].importe) - Math.abs(c.porRubro[a].importe));
    const filas = nombres.map((n) => {
      const r = c.porRubro[n], q = destino(n);
      return `<tr class="${q.ya ? "ya" : ""}">
        <td class="concepto">${esc(n)}</td>
        <td class="num asiento-n">${r.n}</td>
        <td class="concepto">${esc(q.texto)}</td>
        <td class="num">${imp(r.importe > 0 ? r.importe : 0)}</td>
        <td class="num">${imp(r.importe < 0 ? -r.importe : 0)}</td></tr>`;
    }).join("");

    const entra = nombres.reduce((t, n) => t + Math.max(c.porRubro[n].importe, 0), 0);
    const sale = nombres.reduce((t, n) => t + Math.max(-c.porRubro[n].importe, 0), 0);

    const cierra = Math.abs(c.diferencia) <= window.LibroDiario.TOL;
    const resumen = `<table class="libro"><tbody>
      <tr><td>Saldo al inicio del ejercicio</td><td class="num">${imp(c.apertura)}</td></tr>
      <tr><td>Movimientos asentados desde el extracto</td>
        <td class="num">${imp(c.asentado)}</td></tr>
      <tr><td>Movimientos que ya asienta otra fuente</td>
        <td class="num">${imp(c.yaAsentado)}</td></tr>
      <tr class="suma"><td>Saldo al cierre según el extracto</td>
        <td class="num">${imp(c.extracto)}</td></tr>
      <tr class="suma"><td>Saldo de «${esc(c.cuenta)}» en el mayor</td>
        <td class="num">${imp(c.diario)}</td></tr>
      <tr class="total"><td>${cierra ? "Diferencia" : "DIFERENCIA A EXPLICAR"}</td>
        <td class="num">${ajuste(c.diferencia)}</td></tr>
    </tbody></table>`;

    return libro("conciliacion", "CONCILIACIÓN BANCARIA — PAPEL DE TRABAJO",
      periodo() + ` El extracto de «${esc(c.cuenta)}» trae ${c.movimientos} movimientos. ` +
      "Los rubros marcados en gris ya entran al diario por otra fuente y el banco no los " +
      "vuelve a asentar: se listan igual, porque son parte del saldo.",
      `<div class="cuadro"><table class="libro">
        <thead><tr>
          <th class="izq">Rubro del extracto</th><th class="num">Mov.</th>
          <th class="izq">Contra qué cuenta va</th>
          <th class="num">Entró</th><th class="num">Salió</th></tr></thead>
        <tbody>${filas}
          <tr class="total"><td>Totales del ejercicio</td><td></td><td></td>
            <td class="num">${imp(entra)}</td><td class="num">${imp(sale)}</td></tr>
        </tbody></table></div>
      <div class="cuadro resumen-conciliacion">${resumen}</div>` +
      (c.sinRubro.length
        ? `<p class="ayuda-papel">${c.sinRubro.length} movimiento(s) del extracto no tienen
           rubro y quedaron sin asentar.</p>` : ""));
  }

  /* ---------- estado de resultados y anexo de gastos: papeles de trabajo ---------- */

  /* En un papel de control el cero se imprime: una celda vacía no distingue
     «cerró en cero» de «me lo salté». Es el mismo criterio del papel del
     ajuste por inflación. */
  const conCero = (x) => (Math.round(x * 100) === 0
    ? `<span class="pe">$</span>${pesos(0, 2)}` : imp(x));

  /* Una sola columna, y debajo de cada renglón las cuentas que lo forman. No es
     el estado que se publica —ese va en dos columnas, con las notas, y lo arma
     el informe—: es el papel con el que se controla el resultado antes de
     determinar el impuesto a las ganancias. */
  function estadoDeResultados() {
    const r = d.resultado();
    if (!r.lineas.length) return "";

    const filas = r.lineas.map((x) => {
      if (x.titulo) return `<tr class="titulo"><td colspan="2">${esc(x.titulo)}</td></tr>`;
      const clase = x.rol === "total" ? "total" : x.rol === "subtotal" ? "subtotal" : "";
      const renglon = `<tr class="${clase}">
        <td class="concepto">${esc(x.concepto)}</td>
        <td class="num">${imp(x.importe)}</td></tr>`;
      /* Las cuentas que forman el renglón: es lo que se controla. Un renglón de
         una sola cuenta no se abre, porque no agrega nada. */
      const cuentas = (x.cuentas || []).length > 1
        ? x.cuentas.map((c) => `<tr class="sangria detalle">
            <td class="concepto">${esc(c.cuenta)}</td>
            <td class="num">${conCero(c.importe)}</td></tr>`).join("")
        : "";
      return renglon + cuentas;
    }).join("");

    return libro("resultado", "ESTADO DE RESULTADOS — PAPEL DE TRABAJO",
      periodo() + ` Saldos al ${F(d.ej.cierre)}, en moneda de esa fecha. Debajo de cada ` +
      "renglón, las cuentas que lo forman. El resultado antes del impuesto es el punto " +
      "de partida de la determinación del impuesto a las ganancias.",
      `<div class="cuadro"><table class="estado">
        <thead><tr><th class="concepto">Concepto</th><th class="num">Importe</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>`);
  }

  /* El gasto clasificado por su naturaleza, en las columnas del estado. Es la
     información del artículo 64, inciso I b), de la Ley General de Sociedades:
     el mismo cuadro que después sale como anexo de los estados contables. */
  function anexoDeGastos() {
    const gastos = d.resultado().gastos;
    const anexo = d.d.plan.anexos.find((x) => x.id === "gastos_naturaleza");
    if (!anexo) return "";
    const cols = anexo.columnas.filter((c) => c.vinculo && gastos[c.id]);
    if (!cols.length) return "";

    const conceptos = [];
    cols.forEach((c) => Object.keys(gastos[c.id]).forEach((n) => {
      if (conceptos.indexOf(n) < 0) conceptos.push(n);
    }));
    conceptos.sort((a, b) => a.localeCompare(b, "es"));

    const celda = (c, n) => gastos[c.id][n] || 0;
    const porFila = (n) => cols.reduce((t, c) => t + celda(c, n), 0);
    const porColumna = (c) => conceptos.reduce((t, n) => t + celda(c, n), 0);
    const total = cols.reduce((t, c) => t + porColumna(c), 0);

    const cabeza = `<thead><tr>
      <th>Naturaleza del gasto</th>
      ${cols.map((c) => `<th class="num">${esc(c.titulo)}</th>`).join("")}
      <th class="num separa">Total</th></tr></thead>`;
    const filas = conceptos.map((n) => `<tr>
      <td>${esc(n)}</td>
      ${cols.map((c) => `<td class="num">${imp(celda(c, n))}</td>`).join("")}
      <td class="num separa">${imp(porFila(n))}</td></tr>`).join("");
    const suma = `<tr class="total">
      <td>Totales</td>
      ${cols.map((c) => `<td class="num">${imp(porColumna(c))}</td>`).join("")}
      <td class="num separa">${imp(total)}</td></tr>`;

    return libro("gastos apaisada",
      "GASTOS CLASIFICADOS POR SU NATURALEZA — PAPEL DE TRABAJO",
      periodo() + (anexo.leyenda ? ` ${anexo.leyenda.replace(/\.?$/, ".")}` : "") +
      ` Importes al ${F(d.ej.cierre)}, en moneda de esa fecha.`,
      `<div class="cuadro"><table class="anexo">${cabeza}<tbody>${filas}${suma}</tbody></table></div>`);
  }

  /* ---------- controles: en pantalla, no se imprimen ---------- */

  function controles() {
    const t = d.totales();
    const noCierran = d.asientos.filter((a) => Math.abs(a.diferencia) > window.LibroDiario.TOL);
    const malos = d.comprobantesInconsistentes();
    const partes = [];

    partes.push(noCierran.length
      ? `<strong>${noCierran.length} asiento(s) no cierran:</strong> ` +
        noCierran.map((a) => `N° ${a.numero} ${esc(a.nombre)} por ${pesos(a.diferencia, 2)}` +
          (a.sinCuenta ? ` (${pesos(a.sinCuenta, 2)} de una ranura sin cuenta: ` +
            "el ejercicio no le dice contra qué va)" : "")).join("; ")
      : `Los ${d.asientos.length} asientos cierran. Debe y haber suman ` +
        `${pesos(t.debe, 2)}, y la suma de saldos da ${pesos(t.suma, 2)}.`);

    const cb = d.conciliacionBancaria();
    if (cb) {
      const ok = Math.abs(cb.diferencia) <= window.LibroDiario.TOL;
      partes.push((ok ? "" : "<strong>C11 · </strong>") +
        `Banco: el extracto trae ${cb.movimientos} movimientos. Apertura ` +
        `${pesos(cb.apertura, 2)}, ${pesos(cb.asentado, 2)} asentados desde el extracto y ` +
        `${pesos(cb.yaAsentado, 2)} que ya venían de otra fuente: saldo ` +
        `${pesos(cb.extracto, 2)}. La cuenta «${esc(cb.cuenta)}» del diario cierra en ` +
        `${pesos(cb.diario, 2)}` +
        (ok ? ", que es el mismo." : `. <strong>Difiere en ${pesos(cb.diferencia, 2)}</strong>: ` +
          "algo se asentó dos veces o no se asentó.") +
        (cb.sinRubro.length ? ` ${cb.sinRubro.length} movimiento(s) sin rubro quedaron afuera.` : ""));
    }

    const l = d.ley25413;
    if (l) {
      const r = l.regla;
      const cuanto = (100 * r.porcentaje).toLocaleString("es-AR",
        { maximumFractionDigits: 2 }) + " %";
      partes.push(`Ley 25.413: se pagaron ${pesos(l.pagado, 2)} y se computan ` +
        `<strong>${cuanto}</strong> (${esc(r.regimen)}` +
        (r.categoria ? `, categoría ${esc(r.categoria)}` : "") +
        (r.certificado ? ", con certificado MiPyME vigente" : ", <strong>sin certificado " +
          "MiPyME vigente</strong>") + `): ${pesos(l.computable, 2)} a cuenta de ganancias` +
        (Math.abs(l.no_computable) > window.LibroDiario.TOL
          ? ` y ${pesos(l.no_computable, 2)} de gasto deducible.` : ".") +
        (r.motivo ? ` ${esc(r.motivo)}` : "") +
        (d.impuesto === undefined
          ? " <strong>Falta determinar el impuesto a las ganancias</strong>: recién ahí se " +
            "sabe si el cómputo entra entero. Lo que sobre del impuesto determinado no es " +
            "saldo a favor —no se compensa ni se traslada— y va a gasto."
          : (l.computable > d.impuesto
            ? ` <strong>C12 · el cómputo supera el impuesto determinado ` +
              `(${pesos(d.impuesto, 2)}) en ${pesos(l.computable - d.impuesto, 2)}</strong>: ` +
              "ese excedente no es saldo a favor y va a gasto."
            : " El cómputo entra entero en el impuesto determinado.")));
    }

    /* La categoría MiPyME, al lado del tope que le corresponde. Es una
       referencia: el parámetro legal es el promedio de tres ejercicios, y la
       tabla que vale es la que regía cuando se tramitó el certificado. */
    const tm = d.topeMiPyme();
    if (tm && !tm.sinSector) {
      partes.push(`MiPyME: categoría ${esc(tm.categoria)} del sector ${esc(tm.sector)}` +
        (tm.tope ? `, con un tope de ventas de ${pesos(tm.tope, 2)}` : "") +
        `. Las ventas netas del ejercicio fueron ${pesos(tm.ventas_del_ejercicio, 2)}, ` +
        "que es sólo una magnitud de referencia: el parámetro es el promedio de los " +
        "últimos tres ejercicios con las deducciones de la norma. " +
        (tm.desde
          ? `Tabla ${esc(tm.elegida_por)}.`
          : "<strong>La tabla de topes cargada no dice desde cuándo rige</strong>, y la que " +
            "corresponde es la que estaba vigente cuando se tramitó el certificado: hasta " +
            "que se cargue la resolución de la SEPyME, esta comparación no confirma nada.") +
        (tm.certificado_desde ? "" : " Tampoco está la fecha del certificado."));
    } else if (tm && tm.sinSector) {
      partes.push(`MiPyME: el sector «${esc(tm.sector)}» no está en la tabla de topes de ` +
        "venta, así que no hay con qué comparar la categoría.");
    }

    const rs = d.retirosDeSocios();
    if (rs) {
      const dif = rs.filas.filter((f) => Math.abs(f.pagado - f.declarado) > window.LibroDiario.TOL);
      partes.push(`Socios: el banco pagó ${pesos(rs.total, 2)} de retiros y la hoja «Socios» ` +
        `declara ${pesos(rs.totalDeclarado, 2)}.` +
        (dif.length ? " <strong>No coinciden</strong> en: " + dif.map((f) =>
          `${esc(f.socio)} (banco ${pesos(f.pagado, 2)}, planilla ${pesos(f.declarado, 2)})`)
          .join("; ") + ". Manda el extracto." : " Coinciden socio por socio."));
    }

    if (malos.length) {
      partes.push(`<strong>A06 · ${malos.length} comprobante(s) cuyo detalle no reconstruye el total:</strong> ` +
        malos.map((x) => `${F(x.comprobante.fecha)} ${esc(x.comprobante.emisor)} ` +
          `(sobra ${pesos(x.sobra, 2)})`).join("; "));
    }
    return `<div class="control-libros no-imprimir">${partes.join("<br>")}</div>`;
  }

  /* ---------- determinación del impuesto a las ganancias ----------

     El papel de trabajo, renglón por renglón: de dónde sale cada cifra y con qué
     artículo. Nada se escribe a mano: la clasificación la declara el ejercicio y
     los importes salen del diario. */

  function determinacionGanancias() {
    const g = d.ganancias;
    if (!g) return "";
    /* Acá el cero es un resultado, no ruido: si el excedente de honorarios da
       cero hay que verlo, porque significa que se calculó y dio cero. */
    const impc = (x) => `<span class="pe">$</span>${pesos(x || 0, 2)}`;
    const pct = (x) => (x * 100).toLocaleString("es-AR",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
    const coef = (x) => x.toLocaleString("es-AR",
      { minimumFractionDigits: 6, maximumFractionDigits: 6 });

    const fi = g.fase_i;
    const listar = (lista) => lista
      .slice().sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))
      .map((x) => `<tr><td class="concepto">${esc(x.cuenta)}</td>
        <td class="concepto nota-art">${esc(x.motivo || "")}</td>
        <td class="num">${impc(x.saldo)}</td></tr>`).join("");

    const estatica = `
      <table class="libro determinacion">
        <thead><tr><th>Cuenta</th><th>Por qué</th><th class="num">Saldo al inicio</th></tr></thead>
        <tbody>
          <tr class="grupo"><td colspan="3">Activo computable</td></tr>
          ${listar(fi.computable)}
          <tr class="subtotal"><td colspan="2">Total del activo computable</td>
            <td class="num">${impc(fi.activo_computable)}</td></tr>
          <tr class="grupo"><td colspan="3">Activo no computable — art. 106 inciso a)</td></tr>
          ${listar(fi.no_computable)}
          <tr class="subtotal"><td colspan="2">Total del activo no computable</td>
            <td class="num">${impc(fi.activo_no_computable)}</td></tr>
          <tr class="grupo"><td colspan="3">Pasivo computable — art. 106 inciso b)</td></tr>
          ${listar(fi.pasivo)}
          <tr class="subtotal"><td colspan="2">Total del pasivo computable</td>
            <td class="num">${impc(fi.pasivo_computable)}</td></tr>
          ${(fi.pasivo_excluido || []).length ? `
          <tr class="grupo"><td colspan="3">Pasivo dejado fuera por el plan de cuentas</td></tr>
          ${listar(fi.pasivo_excluido)}
          <tr class="subtotal"><td colspan="2">Total del pasivo no computable</td>
            <td class="num">${impc(fi.pasivo_no_computable)}</td></tr>` : ""}
        </tbody>
        <tfoot>
          <tr><td colspan="2">Capital expuesto al inicio (activo computable − pasivo)</td>
            <td class="num">${impc(fi.expuesto)}</td></tr>
          <tr><td colspan="2">Coeficiente: índice de cierre sobre índice del cierre anterior,
            menos uno</td><td class="num">${coef(fi.coeficiente)}</td></tr>
          <tr class="total"><td colspan="2">Ajuste de la fase estática
            (${fi.ajuste >= 0 ? "ganancia" : "pérdida"})</td>
            <td class="num">${impc(fi.ajuste)}</td></tr>
        </tfoot>
      </table>`;

    const grupos = (bloque, rotulo) => bloque.grupos
      .filter((x) => x.movimientos.length)
      .map((x) => `
        <tr class="grupo"><td colspan="4">${esc(x.concepto)}${
          x.norma ? ` <span class="nota-art">${esc(x.norma)}</span>` : ""}</td></tr>
        ${x.movimientos.map((mv) => `<tr>
          <td class="concepto">${esc(mv.mes)}</td>
          <td class="num">${impc(mv.importe)}</td>
          <td class="num">${coef(mv.coeficiente)}</td>
          <td class="num">${impc(mv.ajuste)}</td></tr>`).join("")}
        <tr class="subtotal"><td colspan="3">${esc(x.concepto)}</td>
          <td class="num">${impc(x.total)}</td></tr>`).join("") ||
      `<tr><td colspan="4" class="concepto vacio">Sin ${rotulo} en el ejercicio.</td></tr>`;

    const dinamica = `
      <table class="libro determinacion">
        <thead><tr><th>Mes</th><th class="num">Importe</th>
          <th class="num">Coeficiente</th><th class="num">Ajuste</th></tr></thead>
        <tbody>
          ${grupos(g.fase_ii.positivos, "ajustes positivos")}
          <tr class="subtotal fuerte"><td colspan="3">Total de los ajustes positivos</td>
            <td class="num">${impc(g.fase_ii.positivos.total)}</td></tr>
          ${grupos(g.fase_ii.negativos, "ajustes negativos")}
          <tr class="subtotal fuerte"><td colspan="3">Total de los ajustes negativos</td>
            <td class="num">${impc(g.fase_ii.negativos.total)}</td></tr>
        </tbody>
        <tfoot><tr class="total"><td colspan="3">Ajuste de la fase dinámica</td>
          <td class="num">${impc(g.fase_ii.total)}</td></tr></tfoot>
      </table>
      ${!(g.fase_ii.sin_fondos || []).length ? "" : `
        <p class="pie-papel">Estos movimientos no entraron en la fase dinámica, o
          entraron por menos: el asiento no cambió la posición computable —activo
          computable menos pasivo computable—, así que no hubo fondos que entraran
          ni salieran. ${g.fase_ii.sin_fondos.map((x) =>
            `${esc(x.cuenta)}, ${esc(x.fecha)}, ${impc(x.importe)}${
              Math.abs(x.computado) > 0.005 ? `, computado ${impc(x.computado)}` : ""}`
            ).join("; ")}.</p>`}`;

    const h = g.honorarios;
    const honorarios = `
      <table class="libro determinacion">
        <tbody>
          <tr><td class="concepto">Resultado antes del impuesto y antes de los honorarios</td>
            <td class="num">${impc(h.base)}</td></tr>
          <tr><td class="concepto">Tope deducible — art. 91 inciso i)</td>
            <td class="num">${impc(h.tope)}</td></tr>
          <tr><td class="concepto">Honorarios computados en el ejercicio</td>
            <td class="num">${impc(h.devengado)}</td></tr>
        </tbody>
        <tfoot><tr class="total"><td>Excedente no deducible</td>
          <td class="num">${impc(h.exceso)}</td></tr></tfoot>
      </table>
      <p class="pie-papel">${esc(h.condicion)}</p>`;

    const amortizacion = !g.amortizacion ? "" : `
      <h2 class="titulo-bloque">Amortizaciones sobre el valor actualizado</h2>
      <p class="pie-papel">${esc(g.amortizacion.regla || "")}</p>
      <table class="libro determinacion">
        <thead><tr><th>Rubro</th><th class="num">Valor de origen</th>
          <th class="num">Valor actualizado al cierre</th><th class="num">Tasa</th>
          <th class="num">Amortización histórica</th>
          <th class="num">Amortización deducible</th></tr></thead>
        <tbody>${g.amortizacion.filas.map((x) => `<tr>
          <td class="concepto">${esc(x.cuenta)}</td>
          <td class="num">${impc(x.valor_origen)}</td>
          <td class="num">${impc(x.valor_actualizado)}</td>
          <td class="num">${pct(x.tasa)}</td>
          <td class="num">${impc(x.historica)}</td>
          <td class="num">${impc(x.actualizada)}</td></tr>`).join("")}</tbody>
        <tfoot>
          <tr class="subtotal fuerte"><td colspan="4">Totales</td>
            <td class="num">${impc(g.amortizacion.historica)}</td>
            <td class="num">${impc(g.amortizacion.actualizada)}</td></tr>
          <tr class="total"><td colspan="5">Mayor amortización deducible</td>
            <td class="num">${impc(g.amortizacion.mayor)}</td></tr>
        </tfoot>
      </table>`;

    const tramo = g.escala.tramo;
    const liquidacion = `
      <table class="libro determinacion">
        <tbody>
          <tr><td class="concepto">Resultado del ejercicio antes del impuesto, a valores
            históricos</td><td class="num">${impc(g.resultado_historico)}</td></tr>
          <tr><td class="concepto">Ajuste por inflación impositivo — Título VI</td>
            <td class="num">${impc(g.ajuste_inflacion)}</td></tr>
          <tr class="sangra"><td class="concepto">Fase estática</td>
            <td class="num">${impc(g.fase_i.ajuste)}</td></tr>
          <tr class="sangra"><td class="concepto">Fase dinámica</td>
            <td class="num">${impc(g.fase_ii.total)}</td></tr>
          ${g.amortizacion ? `<tr><td class="concepto">Mayor amortización por
            actualización del valor de origen <span class="nota-art">${
            esc(g.amortizacion.norma)}</span></td>
            <td class="num">${impc(-g.amortizacion.mayor)}</td></tr>` : ""}
          <tr><td class="concepto">Honorarios del directorio en exceso del tope</td>
            <td class="num">${impc(g.honorarios.exceso)}</td></tr>
          ${g.otros.map((x) => `<tr><td class="concepto">${esc(x.concepto)}${
            x.norma ? ` <span class="nota-art">${esc(x.norma)}</span>` : ""}</td>
            <td class="num">${impc(x.importe)}</td></tr>`).join("")}
          <tr class="subtotal fuerte"><td>Ganancia neta imponible</td>
            <td class="num">${impc(g.imponible)}</td></tr>
          <tr><td class="concepto">Impuesto según la escala del art. 73${
            tramo ? `: ${impc(tramo.fijo)} más el ${pct(tramo.alicuota)} sobre el excedente
            de ${impc(tramo.desde)}` : ""}${
            g.escala.origen ? ` <span class="nota-art">escala del período ${
              esc(g.escala.periodo || "")}, de ${esc(g.escala.origen)}</span>` : ""}</td>
            <td class="num">${impc(g.impuesto_determinado)}</td></tr>
          <tr class="sangra"><td class="concepto">Tasa efectiva</td>
            <td class="num">${g.tasa_efectiva === null ? "" : pct(g.tasa_efectiva)}</td></tr>
          ${g.creditos.map((x) => `<tr><td class="concepto">Menos: ${esc(x.concepto)}${
            x.cuenta ? ` <span class="nota-art">${esc(x.cuenta)}</span>` : ""}</td>
            <td class="num">${impc(-x.importe)}</td></tr>${
            x.despues_del_cierre ? `<tr class="sangra"><td class="concepto">de los que
              ${x.despues_del_cierre} se pagaron después del cierre, así que la
              contabilidad todavía no los tiene</td>
              <td class="num">${impc(x.importe_despues)}</td></tr>` : ""}`).join("")}
        </tbody>
        <tfoot><tr class="total"><td>Saldo a pagar</td>
          <td class="num">${impc(g.saldo)}</td></tr></tfoot>
      </table>`;

    const avisos = g.avisos.length
      ? `<div class="avisos-papel"><strong>Para mirar:</strong><ul>${
          g.avisos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
      : "";

    return libro("ganancias", "DETERMINACIÓN DEL IMPUESTO A LAS GANANCIAS",
      `${periodo()} Papel de trabajo: no integra los estados contables.`,
      `<p class="pie-papel">${esc(g.norma)}. Arranca del resultado a valores
        históricos: el ajuste por inflación contable no entra, porque la ley trae el
        suyo.</p>
       ${avisos}
       <h2 class="titulo-bloque">La liquidación</h2>${liquidacion}
       <h2 class="titulo-bloque">Ajuste por inflación · fase estática</h2>${estatica}
       <h2 class="titulo-bloque">Ajuste por inflación · fase dinámica</h2>${dinamica}
       ${amortizacion}
       <h2 class="titulo-bloque">Honorarios del directorio</h2>${honorarios}`);
  }


  /* ---------- arranque ---------- */

  async function arrancar() {
    const q = new URLSearchParams(location.search);
    const ente = q.get("ente"), ejercicio = q.get("ejercicio");
    historico = q.get("moneda") === "historica";
    if (!ente || !ejercicio) {
      $("#paquete").innerHTML = `<section class="hoja"><p>Faltan los parámetros
        <code>ente</code> y <code>ejercicio</code>. Se entra desde el tablero.</p></section>`;
      return;
    }
    try {
      d = await window.LibroDiario.cargar(ente, ejercicio, { historico });
    } catch (e) {
      $("#paquete").innerHTML = `<section class="hoja"><p>${esc(e.message)}</p></section>`;
      return;
    }
    $("#titulo-barra").textContent =
      `Libros — ${d.ente.denominacion} · ejercicio N° ${d.ej.numero}` +
      (historico ? " · valores históricos" : "");
    document.title = `Libros ${d.ente.denominacion} ${d.ej.cierre.slice(0, 4)}` +
      (historico ? " históricos" : "");

    /* A valores históricos sólo tienen sentido estos dos: son fotos de saldos.
       El diario y el mayor a históricos serían el mismo libro con los asientos
       del ajuste sacados, que no es un libro de nada; y los papeles del ajuste
       por inflación, a valores históricos, no existen. */
    $("#paquete").innerHTML = historico
      ? sumasYSaldos() + estadoDeSaldos()
      : controles() + diario() + mayor() + sumasYSaldos() +
        estadoDeSaldos() + conciliacionBancaria() + papelDeAjuste() +
        estadoDeResultados() + anexoDeGastos() + determinacionGanancias();

    /* Buscar una cuenta en el mayor. Filtra sólo el mayor y no las planillas de
       saldos: ahí esconder renglones dejaría totales que no cierran con lo que
       se ve, y un papel que muestra una suma que no es la de sus renglones es
       peor que no tener filtro. */
    const busca = $("#busca");
    if (busca && historico) busca.closest("label").hidden = true;
    if (busca && !historico) {
      const cuentas = () =>
        Array.prototype.slice.call(document.querySelectorAll(".cuenta-mayor"));
      busca.value = q.get("cuenta") || "";
      busca.oninput = () => {
        const t = sinAcentos(busca.value);
        let vistas = 0;
        cuentas().forEach((el) => {
          const cabe = !t || el.dataset.cuenta.indexOf(t) >= 0;
          el.hidden = !cabe;
          if (cabe) vistas++;
        });
        const total = cuentas().length;
        $("#cuantas").textContent = t
          ? `${vistas} de ${total}` + (vistas ? "" : " · no hay ninguna así")
          : "";
      };
      busca.oninput();
    }

    /* Cambiar de moneda es rearmar el diario entero, así que se recarga la
       página con el parámetro puesto y se conserva lo demás. */
    const moneda = $("#moneda");
    if (moneda) {
      moneda.value = historico ? "historica" : "";
      moneda.onchange = () => {
        const p = new URLSearchParams(location.search);
        if (moneda.value) p.set("moneda", moneda.value); else p.delete("moneda");
        p.delete("cuenta");
        if (historico !== !!moneda.value && ["diario", "mayor"].indexOf(p.get("libro")) >= 0) {
          p.delete("libro");
        }
        location.search = p.toString();
      };
    }

    const cual = $("#cual");
    /* En históricos el selector no puede ofrecer libros que no se dibujaron. */
    if (historico) {
      Array.prototype.slice.call(cual.options).forEach((o) => {
        if (["todos", "sumas", "saldos"].indexOf(o.value) < 0) o.remove();
      });
      cual.options[0].textContent = "los dos";
    }
    cual.value = q.get("libro") || "todos";
    /* Al imprimir un solo libro, el corte de página que separa un libro del
       siguiente se aplicaba igual: el anterior está oculto pero sigue siendo
       hermano, y el corte dejaba una hoja en blanco adelante. Se marca cuál es
       la primera hoja visible y esa no lleva corte. */
    cual.onchange = () => {
      document.body.dataset.libro = cual.value;
      const hojas = Array.prototype.slice.call(document.querySelectorAll("section.hoja"));
      hojas.forEach((h) => h.classList.remove("primera"));
      const visible = hojas.find((h) => getComputedStyle(h).display !== "none");
      if (visible) visible.classList.add("primera");
    };
    cual.onchange();
  }

  arrancar();
})();
