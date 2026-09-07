/* El imprimible. Recorre el plan de exposición y arma las hojas.
   Ninguna cifra, ningún número de nota y ninguna fecha se escriben acá. */

(function () {
  "use strict";

  const TOL = window.Motor.TOL;
  const pesos = window.Motor.pesos;
  const $ = (s) => document.querySelector(s);

  const PROFESIONAL = {
    nombre: "POCHELU, Agustin Antonio",
    titulo: "Contador Público",
    matricula: "C.P.C.E.Ch  T° 1  F° 940",
  };

  let m, hojas = [], numeroNota = {}, notasEmitidas = [], anexosEmitidos = [];

  /* Las firmas escaneadas, cuando el balance está firmado: `{estudio: {...},
     "<slug>": {...}}`. Vacío es lo normal —el informe se arma sin firmas— y no
     se puede llenar desde acá: las imágenes las manda el servidor contra la
     clave, y viven sólo mientras la página esté abierta. Recargar devuelve el
     balance sin firmar, que es lo que corresponde: el balance firmado se hace
     en el momento de imprimirlo. */
  let rubricas = {};

  /* ---------- utilidades ---------- */

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const vivo = (a, b) => Math.abs(a || 0) > TOL || Math.abs(b || 0) > TOL;

  /* importe con signo pesos: el $ se ancla a la izquierda de la celda */
  function imp(x, decimales) {
    if (x === undefined || x === null || x === "") return "";
    return `<span class="pe">$</span>${pesos(x, decimales)}`;
  }

  function valor(linea, col) {
    if (m.importes[linea]) return m.importes[linea][col];
    if (m.calc[col] && linea in m.calc[col]) return m.calc[col][linea];
    return 0;
  }

  function refs(lista) {
    if (!lista) return "";
    const partes = lista.map((r) => {
      const [tipo, id] = r.split(":");
      if (tipo === "nota" && numeroNota[id]) return `Nota ${numeroNota[id]}`;
      if (tipo === "anexo") {
        const a = m.plan.anexos.find((x) => x.id === id);
        return a && anexosEmitidos.indexOf(id) >= 0 ? `Anexo ${a.numero}` : null;
      }
      return null;
    }).filter(Boolean);
    return partes.length ? ` <span class="ref">(${partes.join(" · ")})</span>` : "";
  }

  /* ---------- numeración: se resuelve antes de dibujar ---------- */

  function rubroDeNota(id) {
    return Object.keys(m.notas).find((l) =>
      m.plan.estados.esp.bloques.some((b) => b.lineas.some((x) =>
        x.id === l && (x.refs || []).indexOf("nota:" + id) >= 0)));
  }

  function numerar() {
    m.plan.notas.forEach((n) => {
      if (n.siempre) { notasEmitidas.push(n); return; }
      const l = rubroDeNota(n.id);
      if (l && vivo(valor(l, "actual"), valor(l, "anterior"))) notasEmitidas.push(n);
    });
    notasEmitidas.forEach((n, i) => { numeroNota[n.id] = i + 1; });

    if (Math.abs(m.totalBU("valor_cierre")) > TOL) anexosEmitidos.push("bienes_uso");
    if (Object.keys(m.gastos).length) anexosEmitidos.push("gastos_naturaleza");
  }

  /* ---------- la hoja y su cierre ---------- */

  const LEYENDA = `<p class="dictamen">Dictamen profesional por separado</p>`;

  /* o.dictamen: "cuadro" lo pega abajo a la izquierda del cuadro,
     "pie" lo lleva al pie de la hoja sobre las firmas, ausente no lo pone. */
  function hoja(clase, contenido, opciones) {
    const o = opciones || {};
    /* El papel a valores históricos no lleva la leyenda del dictamen: no es un
       estado que se emita ni sobre el que se dictamine. */
    const cuerpo = (o.dictamen === "cuadro" && !m.d.saldos.historico)
      ? contenido + LEYENDA : contenido;
    hojas.push(`<section class="hoja ${clase || ""}">
      <div class="contenido">${cuerpo}</div>
      ${cierreHoja(o)}
    </section>`);
  }

  function sello(nombre, l1, l2, rubrica) {
    /* La firma va arriba del nombre, con el alto que se le dio al cargarla. Sin
       firma el sello sale como salió siempre. */
    const alto = rubrica ? (Number(rubrica.alto_mm) || 12) : 0;
    return `<div class="sello ${rubrica ? "firmado" : ""}">
      <span class="hueco-firma">${rubrica
        ? `<img class="rubrica" src="${rubrica.imagen}" alt="" style="height:${alto}mm">`
        : ""}</span>
      <span class="nombre">${esc(nombre)}</span>
      <span class="detalle">${esc(l1)}</span>
      ${l2 ? `<span class="detalle">${esc(l2)}</span>` : ""}
    </div>`;
  }

  function cierreHoja(o) {
    const f = m.ente.datos[m.ente.datos.length - 1].firmantes[0];
    const solo = o && o.soloProfesional;
    return `<footer class="cierre-hoja">
      ${o && o.dictamen === "pie" ? LEYENDA : ""}
      <div class="sellos ${solo ? "uno" : ""}">
        ${sello(PROFESIONAL.nombre, PROFESIONAL.titulo, PROFESIONAL.matricula,
                rubricas.estudio)}
        ${solo ? "" : sello(f.nombre, m.ente.denominacion, f.cargo,
                            rubricas[m.ente.slug])}
      </div>
      <p class="folio">— ${hojas.length + 1} —</p>
    </footer>`;
  }

  /* ---------- el corte en A4 ----------

     Una hoja de la pantalla es una hoja de papel. Hasta acá no lo era: las notas
     y el informe del auditor se dibujaban como una hoja larguísima —760 mm las
     notas— que la impresora partía en tres, y la vista previa no lo mostraba. El
     folio, que se escribe una sola vez al pie, salía además equivocado: contaba
     hojas de pantalla, no páginas de papel.

     Así que el corte se hace acá, moviendo los elementos de a uno hasta que no
     entran más. Se corta entre elementos, nunca dentro: un cuadro que por sí
     solo no entra en una página se deja pasar y lo parte la impresora, como
     antes. El pie con las firmas va sólo en la última página del grupo; las
     anteriores llevan el folio y nada más. */
  const MM = 96 / 25.4;

  const avisosDeHoja = [];

  function paginar() {
    avisosDeHoja.length = 0;
    [...$("#paquete").querySelectorAll(".hoja")].forEach(cortar);
    /* Recién ahora se sabe cuántas páginas hay. */
    [...$("#paquete").querySelectorAll(".folio")].forEach((f, i) => {
      f.textContent = `— ${i + 1} —`;
    });
    /* Una hoja que se pasa de A4 por poco no se corta, pero la impresora la va a
       partir igual. Se dice en pantalla, donde se puede hacer algo. */
    if (avisosDeHoja.length) {
      const d = document.createElement("div");
      d.className = "aviso-hojas no-imprimir";
      d.innerHTML = "<strong>Hojas que no entran en A4</strong><ul>" +
        avisosDeHoja.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>";
      $("#paquete").insertBefore(d, $("#paquete").firstChild);
    }
  }

  /* Si la hoja entra en A4 se pregunta a la hoja, no a una cuenta de alturas y
     márgenes: la hoja tiene `min-height` de A4 y **crece cuando el contenido no
     entra**. Medir los hijos y sumar sus márgenes daba dos milímetros de más y
     dos milímetros bastan para que la impresora suelte una página. */
  const altoA4 = (hoja) => (hoja.classList.contains("apaisada") ? 210 : 297) * MM;
  const sobraDe = (hoja) => hoja.getBoundingClientRect().height - altoA4(hoja);

  /* Menos que esto no se corta: una hoja que se pasa por un milímetro no gana
     nada partida en dos, y la página que sale es basura. Si eso pasa, lo que
     hay que arreglar es la hoja, y la aplicación lo dice. */
  const MINIMO_CORTE = 10 * MM;

  /* Lo que no se parte nunca: un cuadro es una imagen y va entero en una hoja.
     Todo lo demás —una nota, el informe del auditor— es texto y se reparte. */
  const ATOMICO = ".cuadro, table, .balanza, .sellos, .entidad";
  const divisible = (el) => el.children.length > 1 && !el.matches(ATOMICO) &&
                            !el.classList.contains("contenido");

  /* El contenedor más adentro de la página que se está llenando. */
  const fin = (ctx) => ctx.cadena[ctx.cadena.length - 1];

  /* Abre una página y vuelve a levantar en ella los envases que estaban
     abiertos: si el corte cae en la mitad de una nota, la nota sigue del otro
     lado con su mismo envoltorio. */
  function nuevaPagina(ctx) {
    const nueva = document.createElement("section");
    nueva.className = ctx.hoja.className;
    const cuerpo = document.createElement("div");
    cuerpo.className = "contenido";
    nueva.appendChild(cuerpo);
    /* Cada página lleva su pie con las firmas. Ésa era la intención desde el
       principio —el pie se arma por hoja—; lo que la rompía era que una hoja de
       pantalla saliera impresa como tres, y las primeras salían sin firma. */
    if (ctx.pie) nueva.appendChild(ctx.pie.cloneNode(true));
    ctx.hoja.parentNode.insertBefore(nueva, ctx.hoja.nextSibling);
    ctx.hoja = nueva;
    ctx.cadena = [cuerpo];
    ctx.plantillas.forEach((t) => {
      const c = t.cloneNode(false);
      fin(ctx).appendChild(c);
      ctx.cadena.push(c);
    });
    ctx.colocadas = 0;
  }

  const cabe = (ctx) => sobraDe(ctx.hoja) <= 0.5;

  function colocar(pieza, ctx) {
    fin(ctx).appendChild(pieza);
    if (cabe(ctx)) { ctx.colocadas++; return; }
    fin(ctx).removeChild(pieza);

    /* Si la pieza se puede partir, se parte: se abre su envase acá y sus hijos
       entran de a uno, cambiando de página cuando toque. */
    if (divisible(pieza)) {
      const envase = pieza.cloneNode(false);
      const hijos = [...pieza.children];
      fin(ctx).appendChild(envase);
      ctx.cadena.push(envase);
      ctx.plantillas.push(pieza);
      hijos.forEach((h) => colocar(h, ctx));
      ctx.plantillas.pop();
      ctx.cadena.pop();
      return;
    }

    /* No se parte: va entera a la página siguiente. Y si arriba quedó un título
       solo, se va con ella. */
    let colgado = null;
    const cola = fin(ctx).lastElementChild;
    if (cola && /^H[1-6]$/.test(cola.tagName) && ctx.colocadas > 1) {
      colgado = cola;
      fin(ctx).removeChild(cola);
    }
    /* Una página en la que todavía no entró nada no se puede pasar de largo: la
       pieza es más alta que una hoja y la parte la impresora, como antes. */
    if (ctx.colocadas > 0 || colgado) nuevaPagina(ctx);
    if (colgado) { fin(ctx).appendChild(colgado); ctx.colocadas++; }
    fin(ctx).appendChild(pieza);
    ctx.colocadas++;
  }

  function cortar(hoja) {
    const cont = hoja.querySelector(".contenido");
    const pie = hoja.querySelector(".cierre-hoja");
    if (!cont || !cont.children.length) return;

    const sobra = sobraDe(hoja);
    if (sobra <= 0.5) return;
    if (sobra < MINIMO_CORTE) {
      avisosDeHoja.push(`La hoja «${tituloDeHoja(hoja)}» se pasa de A4 por ` +
        `${(sobra / MM).toFixed(1)} mm. No se corta —la segunda página saldría casi ` +
        "vacía— pero al imprimir se va a partir igual: hay que achicarla.");
      return;
    }

    const piezas = [...cont.children];
    cont.innerHTML = "";
    const ctx = { hoja: hoja, pie: pie,
                  cadena: [cont], plantillas: [], colocadas: 0 };
    piezas.forEach((pieza) => colocar(pieza, ctx));
  }

  const tituloDeHoja = (hoja) => {
    const t = hoja.querySelector(".titulo-estado, .auditor h2, .titulo-caratula");
    return t ? t.textContent.trim() : "sin título";
  };

  function encabezado(titulo, subtitulo) {
    const e = m.ejercicio;
    /* La versión a valores históricos es un papel de trabajo: la RT 54 exige
       moneda homogénea, así que no puede confundirse con los estados a emitir.
       Se dice en cada hoja, no sólo en la carátula. */
    const moneda = m.d.saldos.historico
      ? "A valores históricos, sin ajuste por inflación: papel de trabajo, no son los " +
        "estados contables a emitir"
      : `En moneda homogénea (Nota ${numeroNota.unidad_medida})`;
    const sub = subtitulo || `Por el ejercicio finalizado el ${window.Motor.fechaCorta(e.cierre)}, ` +
      `comparativo con el ejercicio anterior. ${moneda}`;
    return `<div class="entidad"><span>Denominación de la entidad:
        <strong>${esc(m.ente.denominacion)}</strong></span><span>CUIT ${esc(m.ente.cuit)}</span></div>
      <h1 class="titulo-estado">${esc(titulo)}</h1>
      <p class="subtitulo-estado">${esc(sub)}</p>`;
  }

  /* ---------- carátula ---------- */

  function caratula() {
    const d = m.ente.datos[m.ente.datos.length - 1];
    const e = m.ejercicio;
    const i = d.inscripcion, c = d.capital;
    const ficha = (t, v, ancha) =>
      `<dl class="ficha ${ancha ? "ancha" : ""}"><dt>${esc(t)}</dt><dd>${v}</dd></dl>`;

    hoja("", `
      <div class="caratula">
        <p class="rotulo">${m.d.saldos.historico
          ? "Estados contables a valores históricos"
          : "Estados contables"}</p>
        <hr class="filete">
        <p class="denominacion">${esc(m.ente.denominacion)}</p>
        <p class="cuit">CUIT ${esc(m.ente.cuit)}</p>
        <p class="actividad">${esc(d.actividad_principal)}</p>

        <div class="ejercicio">
          <span class="n">Ejercicio económico N° ${e.numero}</span>
          <span class="fechas">Iniciado el ${window.Motor.fechaLarga(e.inicio)}
            y finalizado el ${window.Motor.fechaLarga(e.cierre)}</span>
          <span class="moneda">${m.d.saldos.historico
            ? "A valores históricos — papel de trabajo"
            : "Expresados en moneda homogénea"}</span>
        </div>

        <div class="fichas">
          ${ficha("Domicilio legal", esc(d.domicilio_legal))}
          ${ficha("Domicilio fiscal", esc(d.domicilio_fiscal))}
          ${ficha("Inscripción en " + esc(i.organismo),
            `Número ${esc(i.numero)} &nbsp;·&nbsp; Folio ${esc(i.folio)} &nbsp;·&nbsp;
             Libro ${esc(i.libro)} &nbsp;·&nbsp; Tomo ${esc(i.tomo)}<br>
             ${window.Motor.fechaLarga(i.fecha)}`, true)}
          ${ficha("Capital social",
            `<span class="destacado">$ ${pesos(c.integrado)}</span><br>
             Integrado en su totalidad`)}
          ${ficha("Composición del capital",
            `${pesos(c.participaciones)} participaciones suscriptas<br>
             de $ ${pesos(c.valor_nominal, 2)} de valor nominal cada una`)}
        </div>
      </div>`);
  }

  /* ---------- filas de un estado, según el plan ---------- */

  /* Regla 5: lo que no tiene importe en ninguno de los dos ejercicios no se
     imprime, y si un bloque entero queda vacío tampoco salen su título ni su
     subtotal. */
  function filasDePlan(lineas) {
    const visibles = {};
    lineas.forEach((l) => {
      if (l.rol) return;
      if (l.siempre || vivo(valor(l.id, "actual"), valor(l.id, "anterior"))) visibles[l.id] = true;
    });
    const bloqueVivo = (prefijo) => Object.keys(visibles).some((id) => id.startsWith(prefijo));

    const salida = [];
    lineas.forEach((l) => {
      if (l.rol === "titulo") {
        if (bloqueVivo(l.id + ".")) salida.push({ titulo: l.concepto, id: l.id });
        return;
      }
      const a = valor(l.id, "actual"), b = valor(l.id, "anterior");
      if (l.rol === "subtotal" || l.rol === "total") {
        const comodin = (l.suma || []).find((s) => s.endsWith(".*"));
        const sale = comodin ? bloqueVivo(comodin.slice(0, -1)) : (l.siempre || vivo(a, b));
        if (!sale) return;
        /* Un subtotal que repite al total de al lado no aporta nada: si el
           bloque hermano está vacío, el subtotal y el total dicen lo mismo. */
        if (l.redundante_sin && !bloqueVivo(l.redundante_sin)) return;
      } else if (!visibles[l.id]) return;
      salida.push({ linea: l, actual: a, anterior: b });
    });
    return salida;
  }

  function fila(x) {
    if (x.titulo) return `<tr class="titulo"><td colspan="3">${esc(x.titulo)}</td></tr>`;
    const l = x.linea;
    /* `estilo` deja pesar un renglón distinto de lo que es: el patrimonio neto
       es un total, pero tres renglones oscuros seguidos hacen un bloque negro. */
    const peso = l.estilo || l.rol;
    const clase = peso === "total" ? "total" : peso === "subtotal" ? "subtotal" : "";
    return `<tr class="${clase}">
      <td class="concepto">${esc(l.concepto)}${refs(l.refs)}</td>
      <td class="num">${imp(x.actual)}</td>
      <td class="num">${imp(x.anterior)}</td></tr>`;
  }

  function cabezaEstado(primera) {
    return `<thead><tr>
      <th class="concepto">${esc(primera || "")}</th>
      <th class="num">Actual</th><th class="num">Anterior</th></tr></thead>`;
  }

  /* ---------- situación patrimonial: la caja de dos mitades ---------- */

  function esp() {
    const b = m.plan.estados.esp.bloques;
    const rotulos = ["Activo", "Pasivo y Patrimonio Neto"];
    const finales = ["esp.activo.total", "esp.pasivo_pn.total"];

    const mitad = (bloque, k) => {
      const items = filasDePlan(bloque.lineas)
        .filter((x) => !(x.titulo && x.id.indexOf(".") < 0));   // el rótulo va arriba
      const cierre = items.find((x) => x.linea && x.linea.id === finales[k]);
      const cuerpo = items.filter((x) => x !== cierre);
      return `<div class="mitad">
        <div class="rotulo-lado">${esc(rotulos[k])}</div>
        <table class="estado">
          ${cabezaEstado()}
          <tbody>
            ${cuerpo.map(fila).join("")}
            <tr class="hueco"><td></td><td></td><td></td></tr>
            <tr class="cierre">
              <td class="concepto">${esc(cierre.linea.concepto)}</td>
              <td class="num">${imp(cierre.actual)}</td>
              <td class="num">${imp(cierre.anterior)}</td></tr>
          </tbody>
        </table>
      </div>`;
    };

    hoja("apaisada", encabezado("Estado de Situación Patrimonial") +
      `<div class="cuadro balanza">${mitad(b[0], 0)}${mitad(b[1], 1)}</div>`,
      { dictamen: "cuadro" });
  }

  function er() {
    hoja("", encabezado("Estado de Resultados") +
      `<div class="cuadro"><table class="estado">${cabezaEstado()}
        <tbody>${filasDePlan(m.plan.estados.er.lineas).map(fila).join("")}</tbody>
      </table></div>`, { dictamen: "cuadro" });
  }

  /* ---------- evolución del patrimonio neto ---------- */

  function eepn() {
    const cols = m.eepn.columnas;
    const grupos = [];
    cols.forEach((c) => {
      const g = grupos[grupos.length - 1];
      if (g && g.titulo === c.grupo) g.n++;
      else grupos.push({ titulo: c.grupo, n: 1, desde: cols.indexOf(c) });
    });
    const separa = (i) => grupos.some((g) => g.desde === i) ? " separa" : "";
    const cabeza = `<thead>
        <tr><th></th>${grupos.map((g) =>
          `<th class="grupo${g.desde ? " separa" : ""}" colspan="${g.n}">${esc(g.titulo)}</th>`).join("")}</tr>
        <tr><th>Detalle</th>${cols.map((c, i) =>
          `<th class="num${separa(i)}">${esc(c.titulo)}</th>`).join("")}</tr>
      </thead>`;
    const filas = m.eepn.filas.map((f) => `
      <tr class="${f.rol === "total" ? "total" : ""}">
        <td>${esc(f.concepto)}</td>
        ${cols.map((c, i) => `<td class="num${separa(i)}">${imp(f[c.id])}</td>`).join("")}
      </tr>`).join("");
    hoja("apaisada", encabezado("Estado de Evolución del Patrimonio Neto") +
      `<div class="cuadro"><table class="anexo">${cabeza}<tbody>${filas}</tbody></table></div>`,
      { dictamen: "cuadro" });
  }

  /* ---------- flujo de efectivo ---------- */

  function efe() {
    const e = m.efe;
    const f3 = (concepto, a, b, clase) => `<tr class="${clase || ""}">
      <td class="concepto">${esc(concepto)}</td>
      <td class="num">${imp(a)}</td><td class="num">${imp(b)}</td></tr>`;

    let filas =
      `<tr class="titulo"><td colspan="3">Variación neta del efectivo</td></tr>` +
      f3("Efectivo al inicio del ejercicio", e.efectivo.inicio_actual, e.efectivo.inicio_anterior) +
      f3("Efectivo al cierre del ejercicio", e.efectivo.cierre_actual, e.efectivo.cierre_anterior) +
      f3("Aumento (disminución) neto del efectivo",
         e.efectivo.cierre_actual - e.efectivo.inicio_actual,
         e.efectivo.cierre_anterior - e.efectivo.inicio_anterior, "total") +
      `<tr class="titulo"><td colspan="3">Causas de las variaciones del efectivo</td></tr>`;

    e.secciones.forEach((s) => {
      const vivas = s.filas.filter((f) => vivo(f.actual, f.anterior));
      if (!vivas.length) return;   // un bloque sin datos no se imprime
      filas += `<tr class="titulo"><td colspan="3">${esc(s.titulo)}</td></tr>`;
      filas += vivas.map((f) => f3(f.concepto, f.actual, f.anterior, "sangria")).join("");
      filas += f3(s.total, s.total_actual, s.total_anterior, "subtotal");
    });
    filas += f3("Aumento (disminución) neto del efectivo", e.total_actual, e.total_anterior, "total");

    hoja("", encabezado("Estado de Flujo de Efectivo") +
      `<div class="cuadro"><table class="estado">${cabezaEstado("Método indirecto")}
        <tbody>${filas}</tbody></table></div>`, { dictamen: "cuadro" });
  }

  /* ---------- anexos ---------- */

  function anexoBienesUso() {
    if (anexosEmitidos.indexOf("bienes_uso") < 0) return;
    const a = m.plan.anexos.find((x) => x.id === "bienes_uso");
    const campos = ["valor_inicio", "altas", "bajas", "valor_cierre",
                    "amort_acum_inicio", "amort_bajas", "tasa", "amort_ejercicio",
                    "amort_acum_cierre", "vnr_actual", "vnr_anterior"];
    const titulos = ["Al inicio", "Altas", "Bajas", "Al cierre",
                     "Acum. al inicio", "Bajas", "%", "Del ejercicio",
                     "Acum. al cierre", "Actual", "Anterior"];
    const grupos = [["Valores de incorporación", 4, 0], ["Amortizaciones", 5, 4], ["Valor neto", 2, 9]];
    const separa = (i) => grupos.some((g) => g[2] === i) ? " separa" : "";
    const celda = (f, c) => c === "tasa"
      ? window.Motor.porciento(f[c]).replace(",00", "") : imp(f[c]);

    const filas = Object.keys(m.anexoBU).map((r) => {
      const f = m.anexoBU[r];
      return `<tr><td>${esc(r)}</td>${campos.map((c, i) =>
        `<td class="num${separa(i)}">${celda(f, c)}</td>`).join("")}</tr>`;
    }).join("");
    const totales = campos.map((c, i) =>
      `<td class="num${separa(i)}">${c === "tasa" ? "" : imp(m.totalBU(c))}</td>`).join("");

    hoja("apaisada", encabezado(tituloAnexo(a)) + `
      <div class="cuadro"><table class="anexo holgado">
        <thead>
          <tr><th></th>${grupos.map((g) =>
            `<th class="grupo separa" colspan="${g[1]}">${esc(g[0])}</th>`).join("")}</tr>
          <tr><th>Rubro</th>${titulos.map((t, i) =>
            `<th class="num${separa(i)}">${esc(t)}</th>`).join("")}</tr>
        </thead>
        <tbody>${filas}
          <tr class="total"><td>Totales</td>${totales}</tr></tbody>
      </table></div>`, { dictamen: "cuadro" });
  }

  /* Los títulos de los anexos vienen del plan en mayúsculas de imprenta, y en la
     hoja se escriben como una frase: sólo la inicial va en mayúscula. */
  const comoFrase = (s) => {
    const t = String(s || "").toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  /* El título de un anexo se escribe como frase a partir del de imprenta, salvo
     que el plan traiga uno escrito: hay títulos que no salen bien de una regla
     —«Bienes de Uso» lleva las dos en mayúscula— y no vale la pena adivinar. */
  const tituloAnexo = (a) => `Anexo ${a.numero} — ${a.titulo_impreso || comoFrase(a.titulo)}`;

  function anexoGastos() {
    if (anexosEmitidos.indexOf("gastos_naturaleza") < 0) return;
    const a = m.plan.anexos.find((x) => x.id === "gastos_naturaleza");
    const comp = Object.assign({}, m.d.saldos.comparativo_gastos);
    delete comp.nota;
    const hayComp = Object.keys(comp).length > 0;

    const cols = a.columnas.filter((c) => c.vinculo && m.gastos[c.id]);
    const naturalezas = [];
    cols.forEach((c) => Object.keys(m.gastos[c.id]).forEach((n) => {
      if (naturalezas.indexOf(n) < 0) naturalezas.push(n);
    }));
    Object.keys(comp).forEach((n) => { if (naturalezas.indexOf(n) < 0) naturalezas.push(n); });
    naturalezas.sort((x, y) => x.localeCompare(y, "es"));

    const totalFila = (n) => cols.reduce((t, c) => t + (m.gastos[c.id][n] || 0), 0);
    const totalCol = (c) => Object.keys(m.gastos[c.id]).reduce((t, n) => t + m.gastos[c.id][n], 0);
    const totalActual = cols.reduce((t, c) => t + totalCol(c), 0);
    const totalAnterior = Object.keys(comp).reduce((t, n) => t + comp[n], 0);
    /* El ejercicio anterior también se totaliza por columna. No hace falta
       repartir la comparativa concepto por concepto: el renglón `er.gastos.<col>`
       del estado de resultados ya la trae abierta así. */
    const totalColAnterior = (c) => -m.v(`er.gastos.${c.id}`, "anterior");

    /* Un concepto que no tiene saldo en ninguno de los dos ejercicios no dice
       nada: se cae del cuadro. Los totales igual se suman sobre todo, así que
       sacar el renglón no cambia ninguna cifra ni ningún control. */
    const conSaldo = naturalezas.filter((n) =>
      Math.abs(totalFila(n)) > 0.005 || Math.abs(comp[n] || 0) > 0.005);

    const filas = conSaldo.map((n) => `<tr>
        <td>${esc(n)}</td>
        ${cols.map((c) => `<td class="num">${m.gastos[c.id][n] ? imp(m.gastos[c.id][n]) : ""}</td>`).join("")}
        <td class="num separa">${imp(totalFila(n))}</td>
        ${hayComp ? `<td class="num">${imp(comp[n] || 0)}</td>` : ""}</tr>`).join("");

    const cierre = m.ejercicio.cierre.slice(0, 4);
    const cierreAnt = m.ejercicio.cierre_anterior.slice(0, 4);

    hoja("apaisada", encabezado(tituloAnexo(a), a.leyenda + ". " +
      `Por el ejercicio finalizado el ${window.Motor.fechaCorta(m.ejercicio.cierre)}, ` +
      `comparativo con el ejercicio anterior. En moneda homogénea (Nota ${numeroNota.unidad_medida})`) + `
      <div class="cuadro"><table class="anexo">
        <thead>
          <tr><th></th>
            <th class="grupo separa" colspan="${cols.length}">Ejercicio ${esc(cierre)}</th>
            <th class="grupo separa" colspan="${hayComp ? 2 : 1}">Totales</th></tr>
          <tr><th>Detalle</th>
            ${cols.map((c) => `<th class="num">${esc(c.titulo)}</th>`).join("")}
            <th class="num separa">${esc(cierre)}</th>
            ${hayComp ? `<th class="num">${esc(cierreAnt)}</th>` : ""}</tr>
        </thead>
        <tbody>${filas}
          <tr class="total"><td>Totales ${esc(cierre)}</td>
            ${cols.map((c) => `<td class="num">${imp(totalCol(c))}</td>`).join("")}
            <td class="num separa">${imp(totalActual)}</td>
            ${hayComp ? `<td class="num">${imp(totalAnterior)}</td>` : ""}</tr>
          ${hayComp ? `<tr class="total"><td>Totales ${esc(cierreAnt)}</td>
            ${cols.map((c) => `<td class="num">${imp(totalColAnterior(c))}</td>`).join("")}
            <td class="num separa"></td>
            <td class="num">${imp(totalAnterior)}</td></tr>` : ""}
        </tbody>
      </table></div>`, { dictamen: "cuadro" });
  }

  /* ---------- notas ---------- */

  function notas() {
    const e = m.ejercicio;
    let html = `<div class="entidad"><span>Denominación de la entidad:
        <strong>${esc(m.ente.denominacion)}</strong></span><span>CUIT ${esc(m.ente.cuit)}</span></div>
      <h1 class="titulo-estado">Notas a los estados contables</h1>
      <p class="subtitulo-estado">Ejercicio iniciado el ${window.Motor.fechaLarga(e.inicio)}
        y finalizado el ${window.Motor.fechaLarga(e.cierre)}</p>`;

    notasEmitidas.forEach((n) => {
      const remite = n.remite ? refs([n.remite]).replace(/<[^>]+>|[()]/g, "").trim() : "";
      html += `<div class="nota"><h3>Nota ${numeroNota[n.id]} — ${esc(n.titulo)}</h3>`;
      (m.textos.notas[n.modelo] || []).forEach((p) => {
        const t = m.completar(p, { remite: remite });
        html += t.charAt(0) === "@"
          ? `<h4>${esc(t.slice(1))}</h4>`
          : `<p class="${t.charAt(0) === "·" ? "vineta" : ""}">${esc(t)}</p>`;
      });
      html += tablaComposicion(n);
      html += `</div>`;
    });
    hoja("", html, { dictamen: "pie" });
  }

  function tablaComposicion(n) {
    if (n.remite) return "";   // la composición la muestra el anexo
    const linea = rubroDeNota(n.id);
    if (!linea) return "";
    const items = m.notas[linea].filter((x) => vivo(x.actual, x.anterior));
    if (!items.length) return "";
    const a = window.Motor.fechaCorta(m.ejercicio.cierre);
    const b = window.Motor.fechaCorta(m.ejercicio.cierre_anterior);
    return `<div class="cuadro"><table class="composicion">
      <thead><tr><th>Concepto</th><th class="num">${a}</th><th class="num">${b}</th></tr></thead>
      <tbody>
        ${items.map((x) => `<tr><td>${esc(x.concepto)}</td>
          <td class="num">${imp(x.actual)}</td><td class="num">${imp(x.anterior)}</td></tr>`).join("")}
        <tr class="total"><td>Total</td>
          <td class="num">${imp(valor(linea, "actual"))}</td>
          <td class="num">${imp(valor(linea, "anterior"))}</td></tr>
      </tbody></table></div>`;
  }

  /* ---------- informe del auditor ---------- */

  function auditor() {
    const modelo = m.textos.informe_auditoria["rt37/favorable-sin-salvedades"];
    const numeros = notasEmitidas.map((n) => numeroNota[n.id]);
    const extra = {
      notas_rango: `${numeros[0]} a ${numeros[numeros.length - 1]}`,
      anexos_lista: anexosEmitidos
        .map((id) => m.plan.anexos.find((a) => a.id === id).numero).join(" y "),
    };
    const c = (t) => esc(m.completar(t, extra));
    let html = `<div class="auditor"><h2>${esc(modelo.titulo)}</h2>
      <div class="destinatario">${modelo.destinatario.map((l) => `<p>${c(l)}</p>`).join("")}</div>`;
    modelo.secciones.forEach((s) => {
      html += `<h3>${esc(s.titulo)}</h3>` + s.parrafos.map((p) => `<p>${c(p)}</p>`).join("");
    });
    const otros = m.textos.otros_requerimientos;
    const inf = m.d.saldos.informe_auditoria || {};
    /* Qué apartados van lo decide el motor, mirando los saldos. El ejercicio los
       puede fijar a mano si alguna vez hace falta apartarse. */
    const req = inf.otros_requerimientos || m.otrosRequerimientos().parrafos;
    if (req.length) {
      html += `<h3>${esc(otros.titulo)}</h3>` +
        req.map((k) => `<p>${c(otros.parrafos[k])}</p>`).join("");
    }
    html += `<p class="lugar">${esc(inf.lugar || "")}, ${window.Motor.fechaLarga(
      inf.fecha || m.ejercicio.cierre)}.</p></div>`;
    hoja("", html, { soloProfesional: true });
  }

  /* ---------- arranque ---------- */

  /* Vista previa de la carátula sola, para un ejercicio que todavía no tiene
     saldos. No pasa por el motor: le alcanza con ente.json y ejercicio.json. */
  async function soloCaratula(ente, ejercicio) {
    const leer = (r) => window.Bolsa.json(r);
    const base = `../datos/entes/${ente}`;
    m = { ente: await leer(`${base}/ente.json`),
          ejercicio: await leer(`${base}/${ejercicio}/ejercicio.json`), d: {} };
    caratula();
    $("#paquete").innerHTML = hojas.join("");
    paginar();
    document.title = `Carátula — ${m.ente.denominacion} — ${ejercicio}`;
    $("#titulo-barra").textContent =
      `${m.ente.denominacion} · ejercicio N° ${m.ejercicio.numero} · solo la carátula`;
  }

  async function arrancar() {
    const q = new URLSearchParams(location.search);
    const ente = q.get("ente");
    const ejercicio = q.get("ejercicio");
    const archivo = q.get("saldos") || "diario";
    if (!ente || !ejercicio) {
      $("#paquete").innerHTML = `<section class="hoja"><p>Faltan los parámetros
        <code>ente</code> y <code>ejercicio</code>. Se entra desde el tablero.</p></section>`;
      return;
    }
    if (q.get("solo") === "caratula") {
      try {
        return await soloCaratula(ente, ejercicio);
      } catch (err) {
        $("#paquete").innerHTML = `<section class="hoja"><p>${esc(err.message)}</p></section>`;
        return;
      }
    }
    try {
      /* Los estados salen del diario salvo que se pida un archivo de saldos a
         mano. `historico=1` los arma sin el ajuste por inflación, que es de
         donde arranca la determinación del impuesto a las ganancias. */
      m = archivo && archivo !== "diario"
        ? await window.Motor.cargar(ente, ejercicio, archivo)
        : await window.Motor.desdeDiario(ente, ejercicio,
            { historico: q.get("historico") === "1" });
    } catch (err) {
      $("#paquete").innerHTML = `<section class="hoja"><p>${esc(err.message)}</p></section>`;
      return;
    }
    dibujar();
    document.title = `Estados contables — ${m.ente.denominacion} — ${ejercicio}`;
    $("#titulo-barra").textContent =
      `${m.ente.denominacion} · ejercicio N° ${m.ejercicio.numero} · ${hojas.length} hojas`;
  }

  /* Dibujar es aparte de arrancar porque se hace dos veces: al abrir, y otra
     vez cuando se aplican las firmas. Todo lo que se acumula al dibujar se
     vacía primero. */
  function dibujar() {
    hojas = []; numeroNota = {}; notasEmitidas = []; anexosEmitidos = [];
    numerar();
    caratula(); esp(); er(); eepn(); efe();
    anexoBienesUso(); anexoGastos(); notas(); auditor();
    $("#paquete").innerHTML = hojas.join("");
    paginar();
  }

  /* ---------- las firmas ----------

     El botón de la barra manda la clave y el servidor contesta con las
     imágenes, o no contesta nada. La clave no se guarda; las imágenes tampoco
     llegan hasta que la clave está bien. */
  async function firmar(clave) {
    if (!m || !m.ente) throw new Error("todavía no hay un balance abierto");
    const res = await fetch("/firmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, de: ["estudio", m.ente.slug] }),
    });
    const crudo = await res.text();
    let d;
    try {
      d = JSON.parse(crudo);
    } catch (e) {
      throw new Error(res.status === 404
        ? "el servidor que está corriendo no conoce las firmas: reinicialo con «python herramientas/servidor.py»"
        : `el servidor contestó algo que no entiendo (${res.status})`);
    }
    if (!res.ok) throw new Error(d.error || res.statusText);
    rubricas = d.firmas || {};
    dibujar();
    return { firmadas: Object.keys(rubricas), faltan: d.faltan || [] };
  }

  function desfirmar() {
    rubricas = {};
    dibujar();
  }

  window.Informe = { firmar, desfirmar, firmado: () => Object.keys(rubricas).length > 0 };

  arrancar();
})();
