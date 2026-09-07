/* La bolsa: el ejercicio importado, sin pasar por el disco.

   La aplicación siempre leyó los datos del ente de `datos/entes/<slug>/`, que es
   una carpeta de esta máquina. Eso funciona acá y no funciona en línea: en el
   hosting no hay carpeta donde escribir, y —sobre todo— los datos contables de
   un cliente no van a un disco ajeno.

   Así que hay un segundo lugar de donde leer. Se importa la planilla, el
   paquete del ejercicio queda en **este navegador**, y el tablero, los libros y
   el informe lo usan como si estuviera en la carpeta. No sale de la máquina: no
   se sube a ningún lado, no lo ve ningún servidor.

   Quién gana cuando el ejercicio está en los dos lados: la bolsa. Es lo recién
   importado, que todavía no se guardó. Cuando se guarda en la carpeta, la
   entrada de la bolsa se borra sola y vuelve a mandar el disco.

   Vive en `localStorage`, que es del navegador y de esta computadora: sobrevive
   a cerrar la pestaña, y se vacía desde el tablero. */

(function () {
  "use strict";

  const LLAVE = "balances.bolsa";
  const RAIZ = "..";

  /* Los cuatro archivos que arma la importación, y dónde los busca cada uno de
     los módulos que leen datos del ente. */
  const DEL_ENTE = ["ente.json", "mapeo-cuentas.json"];
  const DEL_EJERCICIO = ["ejercicio.json", "fuentes.json"];

  function todo() {
    try {
      return JSON.parse(localStorage.getItem(LLAVE) || "{}");
    } catch (e) {
      return {};
    }
  }

  function escribir(bolsa) {
    try {
      localStorage.setItem(LLAVE, JSON.stringify(bolsa));
      return true;
    } catch (e) {
      /* El navegador tiene un tope —unos pocos megas— y un ejercicio grande
         podría no entrar. Se dice, no se pierde en silencio. */
      throw new Error("no entra en el navegador: " + e.message);
    }
  }

  const clave = (slug, anio) => `${slug}/${anio}`;

  function guardar(slug, anio, denominacion, archivos) {
    const bolsa = todo();
    bolsa[clave(slug, anio)] = {
      slug, anio, denominacion,
      cuando: new Date().toISOString().slice(0, 19),
      archivos,
    };
    escribir(bolsa);
    return true;
  }

  function lista() {
    const bolsa = todo();
    return Object.keys(bolsa).sort().map((k) => ({
      slug: bolsa[k].slug, anio: bolsa[k].anio,
      denominacion: bolsa[k].denominacion, cuando: bolsa[k].cuando,
    }));
  }

  const tiene = (slug, anio) => clave(slug, anio) in todo();

  function olvidar(slug, anio) {
    const bolsa = todo();
    delete bolsa[clave(slug, anio)];
    escribir(bolsa);
  }

  function vaciar() {
    try { localStorage.removeItem(LLAVE); } catch (e) { /* nada que vaciar */ }
  }

  /* De una ruta como `../datos/entes/lima-sur-sas/2026/fuentes.json` a lo que
     hay en la bolsa, si está. Devuelve `undefined` cuando no le toca. */
  function deLaBolsa(ruta) {
    const m = /\/datos\/entes\/([^/]+)\/(?:(\d{4})\/)?([^/]+)$/.exec(ruta);
    if (!m) return undefined;
    const [, slug, anio, archivo] = m;
    const bolsa = todo();

    if (!anio && DEL_ENTE.indexOf(archivo) >= 0) {
      /* `ente.json` y el mapeo no cuelgan de un ejercicio: sirve cualquier
         entrada de ese ente que haya en la bolsa. */
      const k = Object.keys(bolsa).find((x) => bolsa[x].slug === slug);
      if (k && bolsa[k].archivos[archivo]) return bolsa[k].archivos[archivo];
      return undefined;
    }
    if (anio && DEL_EJERCICIO.indexOf(archivo) >= 0) {
      const e = bolsa[clave(slug, anio)];
      if (e && e.archivos[archivo]) return e.archivos[archivo];
    }
    return undefined;
  }

  /* El reemplazo de `fetch(...).json()` para todo lo que cuelga de `datos/`.
     Primero la bolsa; si no está, el disco, como siempre. */
  async function json(ruta) {
    const guardado = deLaBolsa(ruta);
    if (guardado !== undefined) return JSON.parse(JSON.stringify(guardado));
    const r = await fetch(ruta, { cache: "no-store" });
    if (!r.ok) throw new Error(`No pude leer ${ruta} (${r.status})`);
    return r.json();
  }

  /* El índice de entes: el del disco, si hay, más lo que trajo la bolsa. Un
     ejercicio importado y no guardado tiene que aparecer en el tablero igual. */
  async function indice() {
    let base = { entes: [] };
    try {
      const r = await fetch(`${RAIZ}/datos/indice.json`, { cache: "no-store" });
      if (r.ok) base = await r.json();
    } catch (e) { /* en línea no hay índice en el disco, y está bien */ }

    /* Lo de la bolsa entra al índice con los mismos datos que trae el del
       disco —CUIT, número de ejercicio, cierre—, porque los tiene adentro: son
       los archivos del ente. Si no, el tablero muestra renglones a medias. */
    const bolsa = todo();
    const entes = base.entes || [];
    for (const x of lista()) {
      const guardado = bolsa[clave(x.slug, x.anio)];
      const enteJson = guardado.archivos["ente.json"] || {};
      const ejJson = guardado.archivos["ejercicio.json"] || {};
      let ente = entes.find((e) => e.slug === x.slug);
      if (!ente) {
        ente = {
          slug: x.slug,
          denominacion: enteJson.denominacion || x.denominacion || x.slug,
          cuit: enteJson.cuit || "",
          ejercicios: [],
        };
        entes.push(ente);
      }
      ente.ejercicios = ente.ejercicios || [];
      let ej = ente.ejercicios.find((e) => String(e.anio) === String(x.anio));
      if (!ej) {
        ej = { anio: String(x.anio) };
        ente.ejercicios.push(ej);
      }
      if (ejJson.numero) ej.numero = ejJson.numero;
      if (ejJson.cierre) ej.cierre = ejJson.cierre;
      ej.deLaBolsa = true;
      ej.cuando = x.cuando;
    }
    return { entes };
  }

  /* ¿Está corriendo `herramientas/servidor.py`? Lo que decide es si se puede
     guardar en la carpeta y si se pueden aplicar firmas. En línea, no. */
  let respuesta = null;
  function hayServidor() {
    if (respuesta) return respuesta;
    respuesta = fetch("/firmas", { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false);
    return respuesta;
  }

  window.Bolsa = { json, indice, guardar, lista, tiene, olvidar, vaciar, hayServidor };
})();
