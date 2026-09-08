/* El plan de cuentas de una empresa: verlo, editarlo y bajarlo.

   El plan de cada ente vive en `datos/entes/<slug>/mapeo-cuentas.json` y es
   suyo: acá no se mezcla con el de nadie. El catálogo del estudio
   (`esquema/catalogo-cuentas.json`) sirve para otra cosa —proponer una
   clasificación cuando una cuenta aparece por primera vez— y se muestra sólo
   como referencia, marcado como tal.

   Se edita en la tabla y se baja el archivo: la aplicación todavía no puede
   escribir sola en el disco. */

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const RAIZ = "..";

  const esc = (s) => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let estado = { slug: null, mapeo: null, plan: null, catalogo: null, tocado: false };

  async function json(ruta) {
    if (window.Bolsa) return window.Bolsa.json(ruta);
    const r = await fetch(ruta, { cache: "no-store" });
    if (!r.ok) throw new Error(`No pude leer ${ruta} (${r.status})`);
    return r.json();
  }

  /* ---------- las líneas válidas, del plan de exposición ---------- */

  function lineasDelPlan(plan) {
    const r = [];
    const e = plan.estados;
    e.esp.bloques.forEach((b) => b.lineas.forEach((l) => {
      if (!l.rol) r.push({ id: l.id, concepto: l.concepto });
    }));
    (e.eepn.columnas || []).forEach((c) => {
      if (["aportes_total", "reservadas_total", "total_actual", "total_anterior"]
          .indexOf(c.id) < 0) r.push({ id: "eepn." + c.id, concepto: c.titulo });
    });
    e.er.lineas.forEach((l) => { if (!l.rol) r.push({ id: l.id, concepto: l.concepto }); });
    r.push({ id: "anexo.gastos_naturaleza", concepto: "Gasto del Anexo VIII" });
    return r;
  }

  const COLUMNAS = ["comercializacion", "administracion", "fiscales", "financieros"];

  /* ---------- la tabla ---------- */

  function opciones(lista, elegido, vacio) {
    return `<option value=""${elegido ? "" : " selected"}>${esc(vacio || "—")}</option>` +
      lista.map((x) => {
        const v = typeof x === "string" ? x : x.id;
        const t = typeof x === "string" ? x : `${x.id} · ${x.concepto}`;
        return `<option value="${esc(v)}"${v === elegido ? " selected" : ""}>${esc(t)}</option>`;
      }).join("");
  }

  const marca = (cuenta, campo, valor) =>
    `<input type="checkbox" data-campo="${campo}"${valor ? " checked" : ""}
       aria-label="${esc(campo)} de ${esc(cuenta)}">`;

  function pintar() {
    const cuentas = estado.mapeo.cuentas;
    const lineas = lineasDelPlan(estado.plan);
    const filtro = $("#filtro").value.trim().toLowerCase();
    const nombres = Object.keys(cuentas).sort((a, b) => a.localeCompare(b, "es"));

    const visibles = nombres.filter((c) => {
      if (!filtro) return true;
      const m = cuentas[c];
      return [c, m.linea, m.concepto, m.columna, m.suma_en, m.rol]
        .some((x) => String(x || "").toLowerCase().indexOf(filtro) >= 0);
    });

    const enCatalogo = (c) => (estado.catalogo.cuentas || {})[c];
    const difiere = (c) => {
      const k = enCatalogo(c);
      if (!k) return false;
      return k.linea !== cuentas[c].linea ||
        (k.columna || "") !== (cuentas[c].columna || "");
    };

    /* El plan se lee agrupado por naturaleza —activo corriente, no corriente,
       pasivo, patrimonio, resultados positivos y negativos—, que es como está
       pensado. La naturaleza la declara cada cuenta; las que todavía no la
       tienen se ubican por su renglón de exposición. */
    const grupos = (estado.plan.jerarquia_cuentas || {}).grupos || [];
    const grupoDe = (c) => {
      const m = cuentas[c];
      const g = (m.naturaleza && grupos.find((x) => x.sigla === m.naturaleza)) ||
        grupos.find((x) => x.prefijos.some((p) => (m.linea || "").indexOf(p) === 0));
      return g || { sigla: "?", rotulo: "Sin clasificar" };
    };

    const fila = (c) => {
      const m = cuentas[c];
      const sub = m.suma_en ? " sub" : "";
      return `<tr data-cuenta="${esc(c)}" class="${sub.trim()}">
        <td class="cuenta">${esc(c)}${m.suma_en
          ? `<small>suma en ${esc(m.suma_en)}</small>` : ""}${difiere(c)
          ? '<small class="ojo">difiere del catálogo del estudio</small>' : ""}</td>
        <td><select data-campo="linea">${opciones(lineas, m.linea)}</select></td>
        <td><input data-campo="concepto" value="${esc(m.concepto || "")}"></td>
        <td><select data-campo="columna">${opciones(COLUMNAS, m.columna || "")}</select></td>
        <td class="marca">${marca(c, "no_monetaria", m.no_monetaria)}</td>
        <td class="marca">${marca(c, "se_asienta", m.se_asienta !== false)}</td>
      </tr>`;
    };

    const orden = grupos.map((g) => g.sigla).concat(["?"]);
    const porGrupo = {};
    visibles.forEach((c) => {
      const g = grupoDe(c);
      (porGrupo[g.sigla] || (porGrupo[g.sigla] = { grupo: g, cuentas: [] })).cuentas.push(c);
    });
    const filas = orden.filter((k) => porGrupo[k]).map((k) => {
      const g = porGrupo[k];
      return `<tr class="grupo-plan"><td colspan="6">
          <span class="sigla">${esc(g.grupo.sigla)}</span> ${esc(g.grupo.rotulo)}
          <small>${g.cuentas.length} cuenta${g.cuentas.length === 1 ? "" : "s"}</small>
        </td></tr>` + g.cuentas.map(fila).join("");
    }).join("");

    $("#tabla").innerHTML = `<div class="envuelve"><table class="planilla cuentas">
      <thead><tr><th>Cuenta</th><th>Línea de exposición</th>
        <th>Concepto en la nota</th><th>Columna de gasto</th>
        <th class="marca">Se ajusta</th><th class="marca">Se asienta</th></tr></thead>
      <tbody>${filas}</tbody></table></div>` +
      (visibles.length ? "" : "<p class='ayuda'>Ninguna cuenta coincide con el filtro.</p>");

    $("#resumen").textContent = `${nombres.length} cuentas` +
      (filtro ? ` · ${visibles.length} coinciden con «${filtro}»` : "") +
      ` · ${nombres.filter((c) => cuentas[c].suma_en).length} subcuentas` +
      ` · ${nombres.filter((c) => cuentas[c].no_monetaria).length} se ajustan por inflación` +
      ` · el archivo es datos/entes/${estado.slug}/mapeo-cuentas.json`;

    $("#tabla").querySelectorAll("select, input, input[type=checkbox]").forEach((el) => {
      el.onchange = () => {
        const c = el.closest("tr").dataset.cuenta;
        const campo = el.dataset.campo;
        if (el.type === "checkbox") {
          /* «Se ajusta» se guarda cuando es verdadero y «se asienta» cuando es
             falso: en los dos casos se guarda lo que se aparta de lo normal. */
          if (campo === "no_monetaria") {
            if (el.checked) cuentas[c].no_monetaria = true;
            else delete cuentas[c].no_monetaria;
          } else {
            if (el.checked) delete cuentas[c].se_asienta;
            else cuentas[c].se_asienta = false;
          }
          estado.tocado = true;
          $("#cambios").textContent = "Hay cambios sin guardar. Bajá el archivo y dejalo en " +
            `datos/entes/${estado.slug}/`;
          pintarDescargas();
          return;
        }
        const v = el.value.trim();
        if (v) cuentas[c][campo] = v; else delete cuentas[c][campo];

        /* Una subcuenta se expone dentro de su cuenta: si se cambia la línea o
           el concepto de la sumarizadora y no se arrastra, la nota queda partida
           en dos renglones sin que nadie se dé cuenta. */
        if (!cuentas[c].suma_en && (campo === "linea" || campo === "concepto")) {
          Object.keys(cuentas).forEach((x) => {
            if (cuentas[x].suma_en !== c) return;
            if (v) cuentas[x][campo] = v; else delete cuentas[x][campo];
          });
        }
        estado.tocado = true;
        $("#cambios").textContent = "Hay cambios sin guardar. Bajá el archivo y dejalo en " +
          `datos/entes/${estado.slug}/`;
        pintarDescargas();
      };
    });
    pintarDescargas();
  }

  /* ---------- bajar ---------- */

  function url(texto, tipo) {
    return URL.createObjectURL(new Blob([texto], { type: tipo }));
  }

  /* El CSV se abre en Excel: sirve para revisar el plan en papel o para
     pasárselo a alguien. El que vuelve a la aplicación es el JSON. */
  function csv() {
    const cuentas = estado.mapeo.cuentas;
    const cab = ["Cuenta", "Suma en", "Rol", "Línea de exposición", "Concepto en la nota",
                 "Columna de gasto", "Rubro de anexo", "Campo de anexo",
                 "No monetaria", "Se asienta"];
    const q = (x) => `"${String(x === undefined || x === null ? "" : x).replace(/"/g, '""')}"`;
    const roles = estado.roles || {};
    const filas = Object.keys(cuentas).sort((a, b) => a.localeCompare(b, "es")).map((c) => {
      const m = cuentas[c];
      return [c, m.suma_en, roles[c], m.linea, m.concepto, m.columna,
              m.anexo_rubro, m.anexo_campo,
              m.no_monetaria ? "sí" : "", m.se_asienta === false ? "no" : "sí"]
        .map(q).join(";");
    });
    // el BOM es lo que hace que Excel abra el archivo en UTF-8
    return "﻿" + [cab.map(q).join(";")].concat(filas).join("\r\n");
  }

  function pintarDescargas() {
    $("#descargas").innerHTML = `
      <a class="btn" download="mapeo-cuentas.json"
         href="${url(JSON.stringify(estado.mapeo, null, 1), "application/json")}">
        mapeo-cuentas.json<small>datos/entes/${esc(estado.slug)}/</small></a>
      <a class="btn tenue" download="plan-de-cuentas-${esc(estado.slug)}.csv"
         href="${url(csv(), "text/csv;charset=utf-8")}">
        Bajar como planilla<small>para abrir en Excel</small></a>`;
  }

  /* ---------- arranque ---------- */

  async function cargar(slug) {
    $("#tabla").innerHTML = "<p class='ayuda'>Cargando…</p>";
    try {
      const ente = await json(`${RAIZ}/datos/entes/${slug}/ente.json`);
      estado.slug = slug;
      estado.mapeo = await json(`${RAIZ}/datos/entes/${slug}/mapeo-cuentas.json`);
      estado.plan = await json(`${RAIZ}/esquema/plan-exposicion-${ente.plan}.json`);
      estado.catalogo = await json(`${RAIZ}/esquema/catalogo-cuentas.json`);
      estado.tocado = false;

      /* Los roles no viven en el mapeo sino en el ejercicio: se leen del último
         para poder mostrarlos en la planilla que se baja. */
      estado.roles = {};
      const ficha = (await window.Bolsa.indice()).entes.find((e) => e.slug === slug);
      const anio = ficha && (ficha.ejercicios || []).length
        ? ficha.ejercicios[ficha.ejercicios.length - 1].anio : null;
      if (anio) {
        const ej = await json(`${RAIZ}/datos/entes/${slug}/${anio}/ejercicio.json`);
        Object.keys(ej.cuentas || {}).forEach((rol) => { estado.roles[ej.cuentas[rol]] = rol; });
      }

      $("#cambios").textContent = "Todavía no cambiaste nada.";
      pintar();
    } catch (err) {
      $("#tabla").innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  }

  async function arrancar() {
    /* El índice sale de la bolsa, no del disco: en la aplicación publicada no
       hay carpeta `datos/`, y leer el archivo directo dejaba la página en
       blanco —sin empresas en el selector y sin tabla— en vez de mostrar los
       ejercicios que se importaron desde el navegador. */
    let indice;
    try {
      indice = await window.Bolsa.indice();
    } catch (e) {
      $("#tabla").innerHTML = `<div class="error">No pude leer el índice de
        empresas: ${esc(e.message)}</div>`;
      return;
    }
    const sel = $("#ente");
    const fichas = indice.entes.map((e) => ({ slug: e.slug, nombre: e.denominacion }));
    /* Sin ninguna empresa no hay plan que mostrar. Pasa la primera vez en la
       aplicación publicada: todavía no se importó nada. No es un error. */
    if (!fichas.length) {
      $("#tabla").innerHTML = `<p class="ayuda">Todavía no hay ninguna empresa.
        Importá un ejercicio desde <a href="importar.html">Importar datos</a> y
        el plan de cuentas aparece acá.</p>`;
      return;
    }
    fichas.forEach((f) => {
      const o = document.createElement("option");
      o.value = f.slug;
      o.textContent = f.nombre;
      sel.appendChild(o);
    });
    const pedido = new URLSearchParams(location.search).get("ente");
    if (pedido && fichas.some((f) => f.slug === pedido)) sel.value = pedido;

    sel.onchange = () => {
      if (estado.tocado &&
          !confirm("Hay cambios sin guardar en este plan. ¿Cambiar de empresa igual?")) {
        sel.value = estado.slug;
        return;
      }
      cargar(sel.value);
    };
    $("#filtro").oninput = () => { if (estado.mapeo) pintar(); };
    if (sel.value) cargar(sel.value);
  }

  arrancar();
})();
