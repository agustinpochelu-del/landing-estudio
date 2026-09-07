/* Informe de situación: los mismos números del balance, leídos en gráficos.

   **No es parte de los estados contables** y así se dice arriba de la primera
   hoja. Sirve para mirar el ejercicio contra el anterior y para ir armando la
   estadística del ente. Todo sale de `motor.js`, que a su vez sale del diario:
   acá no se calcula ni un importe que el balance no tenga. */

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const pesos = window.Motor.pesos;
  const F = window.Motor.fechaCorta;

  const esc = (s) => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* Los millones se leen mejor que los pesos cuando lo que importa es la
     proporción. El detalle exacto está en los estados. */
  function corto(x) {
    const a = Math.abs(x);
    if (a >= 1e9) return (x / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + " MM";
    if (a >= 1e6) return (x / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + " M";
    if (a >= 1e3) return (x / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + " mil";
    return pesos(x, 0);
  }

  const pct = (x, d) => ((x === null || !isFinite(x)) ? "—"
    : (x * 100).toLocaleString("es-AR", { minimumFractionDigits: d === undefined ? 1 : d,
                                          maximumFractionDigits: d === undefined ? 1 : d }) + " %");

  const VERDE = "#145046", ORO = "#C9A227", VERDE_CLARO = "#4E8C7E",
        ARENA = "#D9BC6A", GRIS = "#9BA8A4", TEJA = "#9A3B2F", PIZARRA = "#2E6B5E";

  let m, serie = null;

  /* ---------- gráficos ---------- */

  /* Barras verticales agrupadas: una serie por ejercicio. El eje no lleva
     números: cada barra lleva su importe encima, que es lo que se lee. */
  function barras(series, categorias, colores, alto) {
    /* Con importes negativos el rótulo de la barra cae debajo del eje, justo
       donde va el año: se le da más aire abajo y el año se manda al pie. */
    const hayNeg = series.some(function (s) {
      return s.valores.some(function (x) { return x < 0; });
    });
    const W = 520, H = alto || 200, izq = 4, der = 4, arriba = 16;
    const abajo = hayNeg ? 36 : 26;
    const grupo = (W - izq - der) / categorias.length;
    const ancho = Math.min(38, (grupo - 10) / series.length);
    const max = Math.max.apply(null,
      series.reduce((t, s) => t.concat(s.valores.map(Math.abs)), [1]));
    const escala = (H - abajo - arriba) / max;

    let svg = '<svg class="grafico" viewBox="0 0 ' + W + " " + H + '" role="img">';
    svg += '<line x1="' + izq + '" y1="' + (H - abajo) + '" x2="' + (W - der) +
           '" y2="' + (H - abajo) + '" stroke="#cdd6d2" stroke-width="1"/>';
    categorias.forEach(function (cat, i) {
      const centro = izq + grupo * i + grupo / 2;
      const total = series.length * ancho + (series.length - 1) * 5;
      series.forEach(function (s, j) {
        const v = s.valores[i] || 0;
        const h = Math.abs(v) * escala;
        const x = centro - total / 2 + j * (ancho + 5);
        const y = v >= 0 ? H - abajo - h : H - abajo;
        svg += '<rect x="' + x + '" y="' + y + '" width="' + ancho +
               '" height="' + Math.max(h, 1) + '" fill="' + colores[j] + '" rx="2"/>';
        svg += '<text x="' + (x + ancho / 2) + '" y="' + (v >= 0 ? y - 4 : y + h + 11) +
               '" text-anchor="middle" font-size="9.5" fill="#445350">' +
               esc(corto(v)) + "</text>";
      });
      svg += '<text x="' + centro + '" y="' + (hayNeg ? H - 5 : H - abajo + 15) +
             '" text-anchor="middle" font-size="10" fill="#0C1A17" font-weight="500">' +
             esc(cat) + "</text>";
    });
    return svg + "</svg>";
  }

  /* Barras horizontales apiladas: la composición de un total, un renglón por
     ejercicio. Sirve para ver de qué está hecho el activo sin leer cifras. */
  function apiladas(filas, partes, colores) {
    const W = 520, altoFila = 34, H = filas.length * altoFila + 8;
    let svg = '<svg class="grafico" viewBox="0 0 ' + W + " " + H + '" role="img">';
    filas.forEach(function (f, i) {
      const total = partes.reduce(function (t, p) {
        return t + Math.abs(f.valores[p.id] || 0);
      }, 0) || 1;
      const y = i * altoFila + 4;
      let x = 58;
      const util = W - 62;
      svg += '<text x="0" y="' + (y + 15) + '" font-size="10" fill="#0C1A17" ' +
             'font-weight="500">' + esc(f.rotulo) + "</text>";
      partes.forEach(function (p, j) {
        const v = Math.abs(f.valores[p.id] || 0);
        if (!v) return;
        const w = (v / total) * util;
        svg += '<rect x="' + x + '" y="' + y + '" width="' + w +
               '" height="20" fill="' + colores[j % colores.length] + '"/>';
        if (w > 42) {
          svg += '<text x="' + (x + w / 2) + '" y="' + (y + 14) +
                 '" text-anchor="middle" font-size="8.5" fill="#fff">' +
                 esc(pct(v / total, 0)) + "</text>";
        }
        x += w;
      });
      svg += '<text x="' + W + '" y="' + (y + 30) + '" text-anchor="end" font-size="8.5" ' +
             'fill="#6B7B77">total ' + esc(corto(total)) + "</text>";
    });
    return svg + "</svg>";
  }

  /* Barras horizontales comparadas: el mismo concepto en dos ejercicios. */
  function comparadas(items, colores) {
    const W = 520, altoFila = 30, H = items.length * altoFila + 6;
    const max = Math.max.apply(null, items.reduce(function (t, x) {
      return t.concat([Math.abs(x.actual), Math.abs(x.anterior)]);
    }, [1]));
    const izq = 176, util = W - izq - 66;
    let svg = '<svg class="grafico" viewBox="0 0 ' + W + " " + H + '" role="img">';
    items.forEach(function (x, i) {
      const y = i * altoFila + 4;
      svg += '<text x="0" y="' + (y + 13) + '" font-size="9.5" fill="#0C1A17">' +
             esc(x.concepto) + "</text>";
      [["actual", 0], ["anterior", 10]].forEach(function (par, j) {
        const v = Math.abs(x[par[0]]);
        const w = (v / max) * util;
        svg += '<rect x="' + izq + '" y="' + (y + par[1]) + '" width="' + Math.max(w, 1) +
               '" height="9" fill="' + colores[j] + '" rx="1.5"/>';
      });
      svg += '<text x="' + W + '" y="' + (y + 8) + '" text-anchor="end" font-size="8.5" ' +
             'fill="#445350">' + esc(corto(x.actual)) + "</text>";
      svg += '<text x="' + W + '" y="' + (y + 19) + '" text-anchor="end" font-size="8.5" ' +
             'fill="#9BA8A4">' + esc(corto(x.anterior)) + "</text>";
    });
    return svg + "</svg>";
  }

  function leyenda(nombres, colores) {
    return '<div class="leyenda">' + nombres.map(function (n, i) {
      return '<span><i style="background:' + colores[i % colores.length] + '"></i>' +
             esc(n) + "</span>";
    }).join("") + "</div>";
  }

  /* ---------- el informe ---------- */

  function tarjeta(rotulo, valor, antes) {
    const v = antes ? (valor - antes) / Math.abs(antes) : null;
    const clase = v === null ? "" : (v >= 0 ? "sube" : "baja");
    const flecha = v === null ? "" : (v >= 0 ? "▲" : "▼");
    return '<div class="tarjeta">' +
      '<span class="rot">' + esc(rotulo) + "</span>" +
      '<span class="val">$ ' + esc(pesos(valor, 0)) + "</span>" +
      '<span class="var ' + clase + '">' + (v === null ? "sin comparativo"
        : flecha + " " + esc(pct(Math.abs(v))) + " contra el ejercicio anterior") +
      "</span></div>";
  }

  /* ---------- la serie de los ejercicios ----------

     `serie.json` guarda los ejercicios anteriores tal como fueron emitidos, cada
     uno en su moneda de cierre. Para ponerlos uno al lado del otro hay que
     reexpresarlos, y el coeficiente no sale de ninguna tabla: sale de los
     propios balances. Cada balance trae la columna comparativa del año anterior
     ya reexpresada, así que el cociente contra el balance de ese año es el
     coeficiente que usó el que lo emitió.

     Los importes se reexpresan; los indicadores no hacen falta reexpresarlos,
     porque son cocientes entre cifras de la misma moneda. */

  const RUBROS_SERIE = [
    { id: "caja_e_inversiones", n: "Caja, bancos e inversiones" },
    { id: "creditos_comerciales", n: "Deudores por ventas" },
    { id: "creditos_partes", n: "Créditos con socios y director" },
    { id: "creditos_fiscales", n: "Créditos fiscales" },
    { id: "otros_ac", n: "Otros créditos" },
    { id: "bienes_uso", n: "Bienes de uso" },
    { id: "intangibles", n: "Intangibles" },
  ];

  /* Cadena de coeficientes hasta la moneda de cierre del ejercicio en curso.
     Se camina de atrás para adelante: el más nuevo vale 1. */
  function cadena(serie, cierreActual) {
    const monedas = [];
    const k = {};
    serie.ejercicios.forEach(function (e) {
      if (monedas.indexOf(e.moneda) < 0) monedas.push(e.moneda);
      if (e.k_al_siguiente) k[e.moneda] = e.k_al_siguiente;
    });
    monedas.sort();
    const coef = {};
    coef[cierreActual] = 1;
    let acum = 1;
    for (let i = monedas.length - 1; i >= 0; i--) {
      const m = monedas[i];
      if (!k[m]) { coef[m] = acum; continue; }
      acum = acum * k[m];
      coef[m] = acum;
    }
    return { coef: coef, k: k, monedas: monedas };
  }

  /* Una fila de la serie: el ejercicio ya reexpresado, más lo que se calcula. */
  function fila(e, coef) {
    const c = coef;
    const r = { numero: e.numero, cierre: e.cierre, anio: e.cierre.slice(0, 4),
                moneda: e.moneda, coeficiente: c, nota: e.nota || null,
                irregular: !!e.irregular, esp: {}, er: {} };
    const esp = Object.assign({}, e.esp);
    esp.otros_ac = esp.ac_total - (esp.caja_e_inversiones + esp.creditos_comerciales +
                                   esp.creditos_partes + esp.creditos_fiscales);
    if (Math.abs(esp.otros_ac) < 1) esp.otros_ac = 0;
    Object.keys(esp).forEach(function (id) { r.esp[id] = esp[id] * c; });
    Object.keys(e.er).forEach(function (id) { r.er[id] = e.er[id] * c; });
    /* Los cocientes salen de las cifras originales: reexpresar arriba y abajo
       por el mismo número no los cambia, y así no arrastran redondeo. */
    const q = function (a, b) { return b ? a / b : null; };
    r.ind = {
      liquidez: q(e.esp.ac_total, e.esp.pasivo_total),
      endeudamiento: q(e.esp.pasivo_total, e.esp.pn),
      margen: q(e.er.resultado_operaciones, e.er.ingresos),
      rentabilidad: q(e.er.resultado_ejercicio, e.esp.pn),
      socios: q(e.esp.creditos_partes, e.esp.activo_total),
    };
    return r;
  }

  /* El ejercicio en curso no vive en el archivo: sale del motor, en su propia
     moneda de cierre, que es la moneda a la que se lleva toda la serie. */
  function filaActual() {
    const a = m.calc.actual;
    const v = function (id) { return m.v(id, "actual"); };
    const esp = {
      caja_e_inversiones: v("esp.ac.caja_bancos") + v("esp.ac.inversiones_financieras"),
      creditos_comerciales: v("esp.ac.ctas_cobrar_clientes_moneda"),
      creditos_partes: v("esp.ac.creditos_partes_relacionadas"),
      creditos_fiscales: v("esp.ac.creditos_impositivos"),
      ac_total: a["esp.ac.total"],
      bienes_uso: v("esp.anc.bienes_uso"),
      intangibles: v("esp.anc.intangibles"),
      anc_total: a["esp.anc.total"],
      activo_total: a["esp.activo.total"],
      pasivo_total: a["esp.pasivo.total"],
      pn: a["esp.pn"],
    };
    const er = {
      ingresos: a["er.ingresos.total"],
      g_comercializacion: v("er.gastos.comercializacion"),
      g_administracion: v("er.gastos.administracion"),
      g_fiscales: v("er.gastos.fiscales"),
      g_financieros: v("er.gastos.financieros"),
      resultado_operaciones: a["er.resultado_operaciones"],
      otros_ingresos: v("er.otros_ingresos"),
      rfyt: v("er.rfyt"),
      antes_impuesto: a["er.antes_impuesto"],
      impuesto: v("er.impuesto_ganancias"),
      resultado_ejercicio: a["er.resultado_ejercicio"],
    };
    return fila({ numero: m.ejercicio.numero, cierre: m.ejercicio.cierre,
                  moneda: m.ejercicio.cierre, esp: esp, er: er }, 1);
  }

  function hojaSerie() {
    const cad = cadena(serie, m.ejercicio.cierre);
    const filas = serie.ejercicios
      .map(function (e) { return fila(e, cad.coef[e.moneda]); })
      .concat([filaActual()])
      .sort(function (x, y) { return x.cierre < y.cierre ? -1 : 1; });

    const anios = filas.map(function (f) { return f.anio; });
    const S = function (get) { return { valores: filas.map(get) }; };
    const rubros = RUBROS_SERIE.filter(function (x) {
      return filas.some(function (f) { return Math.abs(f.esp[x.id] || 0) > 1; });
    });
    const coloresActivo = [VERDE, ORO, TEJA, ARENA, GRIS, PIZARRA, VERDE_CLARO];

    const sinImpuesto = Math.abs(filas[filas.length - 1].er.impuesto) < 1;
    const irregular = filas.filter(function (f) { return f.irregular; })
                           .map(function (f) { return f.anio; });

    const fmt = function (x, f) {
      if (x === null || !isFinite(x)) return "—";
      return f === "pct" ? pct(x)
        : x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const indicadores = [
      ["Liquidez corriente", "activo corriente / pasivo", "liquidez", "veces"],
      ["Endeudamiento", "pasivo / patrimonio neto", "endeudamiento", "veces"],
      ["Margen operativo", "resultado de las operaciones / ingresos", "margen", "pct"],
      ["Rentabilidad del patrimonio", "resultado / patrimonio neto", "rentabilidad", "pct"],
      ["Fondos en manos de socios y director", "créditos con partes relacionadas / activo",
       "socios", "pct"],
    ];

    /* La inflación de un ejercicio es la que va de su apertura a su cierre: el
       coeficiente que guarda la moneda ANTERIOR, no la propia. La del primer
       ejercicio no se puede saber, no hay balance antes. */
    const orden = cad.monedas.concat([m.ejercicio.cierre]);
    const filaCoef = filas.map(function (f) {
      const i = orden.indexOf(f.moneda);
      const infl = i > 0 ? cad.k[orden[i - 1]] : null;
      return "<tr><td>" + esc(f.anio) + "</td><td>" + F(f.moneda) + "</td>" +
        "<td>" + esc(f.coeficiente.toLocaleString("es-AR",
          { minimumFractionDigits: 6, maximumFractionDigits: 6 })) + "</td>" +
        "<td>" + esc(infl ? pct(infl - 1) : "—") + "</td></tr>";
    }).join("");

    return '<section class="hoja situacion"><div class="contenido">' +
      '<div class="entidad"><span>Denominación de la entidad: <strong>' +
      esc(m.ente.denominacion) + "</strong></span><span>CUIT " + esc(m.ente.cuit) +
      "</span></div>" +
      '<p class="rotulo-informe">Uso interno</p>' +
      '<h1 class="titulo-estado">LA SERIE DE LOS EJERCICIOS</h1>' +
      '<p class="subtitulo-estado">Ejercicios N° ' + esc(filas[0].numero) + " a N° " +
      esc(filas[filas.length - 1].numero) + ", en moneda del " +
      F(m.ejercicio.cierre) + ".</p>" +

      '<p class="aclaracion">Cada ejercicio se tomó de sus propios estados contables y ' +
      "está en la moneda en que fue emitido. Para ponerlos uno al lado del otro se los " +
      "reexpresó con la cadena de coeficientes del cuadro de abajo, que <strong>no sale de " +
      "ninguna tabla de índices</strong>: sale de los balances. Cada balance trae la columna " +
      "comparativa del año anterior ya reexpresada, así que el cociente contra el balance de " +
      "ese año es el coeficiente que se usó. Da igual en cada renglón hasta el sexto decimal." +
      (irregular.length ? " El ejercicio " + esc(irregular.join(", ")) +
        " es irregular: dura menos de doce meses y no es comparable con los demás." : "") +
      (sinImpuesto ? " <strong>El ejercicio en curso todavía no tiene registrado el impuesto " +
        "a las ganancias</strong>: su resultado y su patrimonio van a bajar cuando se " +
        "registre." : "") + "</p>" +

      '<div class="bloque"><h2>Ingresos y resultado</h2>' +
      barras([S(function (f) { return f.er.ingresos; }),
              S(function (f) { return f.er.resultado_operaciones; }),
              S(function (f) { return f.er.resultado_ejercicio; })],
             anios, [VERDE, VERDE_CLARO, ORO], 220) +
      leyenda(["Ingresos", "Resultado de las operaciones", "Resultado del ejercicio"],
              [VERDE, VERDE_CLARO, ORO]) + "</div>" +

      '<div class="bloque"><h2>Activo y patrimonio neto</h2>' +
      barras([S(function (f) { return f.esp.activo_total; }),
              S(function (f) { return f.esp.pn; }),
              S(function (f) { return f.esp.pasivo_total; })],
             anios, [PIZARRA, ORO, TEJA], 220) +
      leyenda(["Activo total", "Patrimonio neto", "Pasivo"], [PIZARRA, ORO, TEJA]) + "</div>" +

      '<div class="bloque"><h2>De qué está hecho el activo, año por año</h2>' +
      apiladas(filas.map(function (f) { return { rotulo: f.anio, valores: f.esp }; }),
               rubros, coloresActivo) +
      leyenda(rubros.map(function (x) { return x.n; }), coloresActivo) + "</div>" +

      '<div class="bloque"><h2>Indicadores</h2>' +
      '<table class="indicadores serie"><thead><tr><th>Indicador</th>' +
      '<th>Cómo se calcula</th>' +
      anios.map(function (a) { return "<th>" + esc(a) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      indicadores.map(function (x) {
        return "<tr><td>" + esc(x[0]) + '</td><td class="formula">' + esc(x[1]) + "</td>" +
          filas.map(function (f) {
            return "<td>" + esc(fmt(f.ind[x[2]], x[3])) + "</td>";
          }).join("") + "</tr>";
      }).join("") +
      "</tbody></table>" +
      '<p class="pie-cuadro">Los indicadores son cocientes entre cifras de la misma ' +
      "moneda: no dependen de la reexpresión.</p></div>" +

      '<div class="bloque"><h2>La cadena de coeficientes</h2>' +
      '<table class="indicadores"><thead><tr><th>Ejercicio</th>' +
      "<th>Moneda en que fue emitido</th><th>Coeficiente a " + F(m.ejercicio.cierre) +
      "</th><th>Inflación del ejercicio</th></tr></thead><tbody>" +
      filaCoef + "</tbody></table>" +
      '<p class="pie-cuadro">' + esc(serie.como_se_armo[serie.como_se_armo.length - 1]) +
      "</p></div>" +
      "</div></section>";
  }


  function armar() {
    const a = m.calc.actual, b = m.calc.anterior;
    const e = m.ejercicio;
    const v = function (id, col) { return m.v(id, col); };

    const rubrosActivo = [
      { id: "esp.ac.caja_bancos", n: "Caja y bancos" },
      { id: "esp.ac.inversiones_financieras", n: "Inversiones" },
      { id: "esp.ac.ctas_cobrar_clientes_moneda", n: "Deudores por ventas" },
      { id: "esp.ac.creditos_impositivos", n: "Créditos fiscales" },
      { id: "esp.ac.creditos_partes_relacionadas", n: "Créditos con socios y director" },
      { id: "esp.anc.bienes_uso", n: "Bienes de uso" },
      { id: "esp.anc.intangibles", n: "Intangibles" },
    ].filter(function (x) {
      return Math.abs(v(x.id, "actual")) + Math.abs(v(x.id, "anterior")) > 1;
    });
    const coloresActivo = [VERDE, VERDE_CLARO, ORO, ARENA, TEJA, PIZARRA, GRIS];

    const gastos = {};
    Object.keys(m.gastos).forEach(function (col) {
      Object.keys(m.gastos[col]).forEach(function (n) {
        gastos[n] = (gastos[n] || 0) + m.gastos[col][n];
      });
    });
    const compG = Object.assign({}, m.d.saldos.comparativo_gastos);
    delete compG.nota;
    const itemsGasto = Array.from(new Set(Object.keys(gastos).concat(Object.keys(compG))))
      .map(function (n) {
        return { concepto: n, actual: gastos[n] || 0, anterior: compG[n] || 0 };
      })
      .filter(function (x) { return Math.abs(x.actual) + Math.abs(x.anterior) > 1; })
      .sort(function (x, y) { return Math.abs(y.actual) - Math.abs(x.actual); });

    const razon = function (arriba, abajo) {
      return function (col) {
        const den = typeof abajo === "string" ? m.calc[col][abajo] : abajo(col);
        const num = typeof arriba === "string" ? m.calc[col][arriba] : arriba(col);
        return den ? num / den : null;
      };
    };
    const socios = function (col) { return v("esp.ac.creditos_partes_relacionadas", col); };

    const indicadores = [
      ["Liquidez corriente", "activo corriente / pasivo corriente",
       razon("esp.ac.total", "esp.pc.total"), "veces"],
      ["Endeudamiento", "pasivo total / patrimonio neto",
       razon("esp.pasivo.total", "esp.pn"), "veces"],
      ["Margen operativo", "resultado de las operaciones / ingresos",
       razon("er.resultado_operaciones", "er.ingresos.total"), "pct"],
      ["Rentabilidad del patrimonio", "resultado del ejercicio / patrimonio neto",
       razon("er.resultado_ejercicio", "esp.pn"), "pct"],
      ["Inmovilización del activo", "activo no corriente / activo total",
       razon("esp.anc.total", "esp.activo.total"), "pct"],
      ["Fondos en manos de socios y director", "créditos con partes relacionadas / activo total",
       razon(socios, "esp.activo.total"), "pct"],
    ];
    const fmt = function (x, f) {
      if (x === null || !isFinite(x)) return "—";
      return f === "pct" ? pct(x)
        : x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const anioAnterior = e.cierre_anterior.slice(0, 4), anio = e.cierre.slice(0, 4);
    const cats = ["Ejercicio " + anioAnterior, "Ejercicio " + anio];
    const serie = function (id) { return { valores: [b[id], a[id]] }; };

    const valoresDe = function (col) {
      const o = {};
      rubrosActivo.forEach(function (x) { o[x.id] = v(x.id, col); });
      return o;
    };

    return '<section class="hoja situacion"><div class="contenido">' +
      '<div class="entidad"><span>Denominación de la entidad: <strong>' +
      esc(m.ente.denominacion) + "</strong></span><span>CUIT " + esc(m.ente.cuit) +
      "</span></div>" +
      '<p class="rotulo-informe">Uso interno</p>' +
      '<h1 class="titulo-estado">INFORME DE SITUACIÓN</h1>' +
      '<p class="subtitulo-estado">Ejercicio N° ' + esc(e.numero) + ", finalizado el " +
      F(e.cierre) + ", comparativo con el anterior. " +
      (m.d.saldos.historico ? "A valores históricos, sin ajuste por inflación."
        : "En moneda homogénea de cierre.") + "</p>" +
      '<p class="aclaracion">Este informe <strong>no forma parte de los estados ' +
      "contables</strong> ni los reemplaza. Es una lectura de los mismos números, para " +
      "mirar el ejercicio contra el anterior. Los importes salen del balance: los " +
      "gráficos no agregan ninguna cifra que los estados no tengan.</p>" +

      '<div class="tarjetas">' +
      tarjeta("Ingresos", a["er.ingresos.total"], b["er.ingresos.total"]) +
      tarjeta("Resultado del ejercicio", a["er.resultado_ejercicio"], b["er.resultado_ejercicio"]) +
      tarjeta("Activo total", a["esp.activo.total"], b["esp.activo.total"]) +
      tarjeta("Patrimonio neto", a["esp.pn"], b["esp.pn"]) +
      "</div>" +

      '<div class="bloque"><h2>Cómo se formó el resultado</h2>' +
      barras([serie("er.ingresos.total"), serie("er.resultado_operaciones"),
              serie("er.resultado_ejercicio")], cats, [VERDE, VERDE_CLARO, ORO], 210) +
      leyenda(["Ingresos", "Resultado de las operaciones", "Resultado del ejercicio"],
              [VERDE, VERDE_CLARO, ORO]) + "</div>" +

      '<div class="bloque"><h2>De qué está hecho el activo</h2>' +
      apiladas([{ rotulo: anioAnterior, valores: valoresDe("anterior") },
                { rotulo: anio, valores: valoresDe("actual") }],
               rubrosActivo, coloresActivo) +
      leyenda(rubrosActivo.map(function (x) { return x.n; }), coloresActivo) + "</div>" +

      '<div class="bloque"><h2>El gasto, por su naturaleza</h2>' +
      comparadas(itemsGasto, [VERDE, GRIS]) +
      leyenda(["Ejercicio " + anio, "Ejercicio " + anioAnterior], [VERDE, GRIS]) + "</div>" +

      '<div class="bloque"><h2>Indicadores</h2>' +
      '<table class="indicadores"><thead><tr><th>Indicador</th><th>Cómo se calcula</th>' +
      "<th>" + esc(anio) + "</th><th>" + esc(anioAnterior) + "</th></tr></thead><tbody>" +
      indicadores.map(function (x) {
        return "<tr><td>" + esc(x[0]) + '</td><td class="formula">' + esc(x[1]) + "</td>" +
               "<td>" + esc(fmt(x[2]("actual"), x[3])) + "</td>" +
               "<td>" + esc(fmt(x[2]("anterior"), x[3])) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      "</div></section>";
  }

  async function arrancar() {
    const q = new URLSearchParams(location.search);
    const ente = q.get("ente"), ejercicio = q.get("ejercicio");
    if (!ente || !ejercicio) {
      $("#paquete").innerHTML = '<section class="hoja"><p>Faltan los parámetros ' +
        "<code>ente</code> y <code>ejercicio</code>. Se entra desde el tablero.</p></section>";
      return;
    }
    try {
      m = await window.Motor.desdeDiario(ente, ejercicio,
        { historico: q.get("historico") === "1" });
    } catch (err) {
      $("#paquete").innerHTML = '<section class="hoja"><p>' + esc(err.message) +
        "</p></section>";
      return;
    }
    /* La serie es opcional: si el ente todavía no tiene `serie.json`, el informe
       sale igual con el ejercicio y su comparativo, y nada más. */
    try {
      const r = await fetch("../datos/entes/" + ente + "/serie.json", { cache: "no-store" });
      if (r.ok) serie = await r.json();
    } catch (err) { serie = null; }
    /* A valores históricos la serie no se muestra: comparar ejercicios exige
       moneda homogénea, y mezclarlas diría cualquier cosa. */
    if (serie && m.d.saldos.historico) serie = null;
    $("#paquete").innerHTML = armar() + (serie ? hojaSerie() : "");
    document.title = "Informe de situación — " + m.ente.denominacion + " " + ejercicio;
    $("#titulo-barra").textContent =
      "Situación — " + m.ente.denominacion + " · ejercicio N° " + m.ejercicio.numero;
  }

  arrancar();
})();
