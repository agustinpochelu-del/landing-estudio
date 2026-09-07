/* Pantalla de inicio: elegir el ejercicio, ver en qué estado está el camino y
   correr los controles. El armado lo hace motor.js. */

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const pesos = window.Motor.pesos;

  let indice = null;
  let motor = null;

  async function arrancar() {
    /* Cargar y aplicar firmas lo resuelve `herramientas/servidor.py`. Si no
       está corriendo —la aplicación publicada— no se ofrecen. */
    window.Bolsa.hayServidor().then((hay) => {
      ["#ver-firmado", "#ir-firmas"].forEach((s) => { if ($(s)) $(s).hidden = !hay; });
    });
    try {
      indice = await window.Bolsa.indice();
    } catch (e) {
      return fallar("No pude leer <code>datos/indice.json</code>. La aplicación necesita " +
                    "estar servida: desde la carpeta del proyecto, <code>python -m http.server 5173</code> " +
                    "y después abrir <code>http://localhost:5173/app/</code>.");
    }
    /* Sin ningún ente no hay nada que elegir. Pasa en la aplicación publicada
       la primera vez: no hay carpeta `datos/` y todavía no se importó nada. No
       es un error, es el principio. */
    if (!indice.entes.length) return sinEntes();

    indice.entes.forEach((e, i) => {
      $("#ente").add(new Option(
        e.cuit ? `${e.denominacion} — CUIT ${e.cuit}` : e.denominacion, i));
    });
    $("#ente").onchange = cargarEjercicios;
    $("#ejercicio").onchange = recargar;
    $("#archivo").onchange = recargar;

    /* Se puede llegar con el ente y el ejercicio puestos: así abre la
       importación cuando se pide ver el balance recién leído. */
    const q = new URLSearchParams(location.search);
    const cual = indice.entes.findIndex((e) => e.slug === q.get("ente"));
    if (cual >= 0) $("#ente").value = cual;
    cargarEjercicios();
    const anio = q.get("ejercicio");
    if (anio && Array.from($("#ejercicio").options).some((o) => o.value === anio)) {
      $("#ejercicio").value = anio;
      recargar();
    }
  }

  function sinEntes() {
    $("#paso-ente").hidden = true;
    $("#paso-camino").hidden = true;
    $("#paso-controles").hidden = true;
    $("#paso-informe").hidden = true;
    $("#paso-importar").querySelector(".cuerpo").insertAdjacentHTML("afterbegin",
      `<div class="aviso"><strong>Todavía no hay ningún ejercicio.</strong><br>
       Importá la planilla del ejercicio y apretá «Ver el balance»: queda en este
       navegador y desde acá se arma todo.</div>`);
  }

  function cargarEjercicios() {
    const e = indice.entes[$("#ente").value];
    $("#ejercicio").innerHTML = "";
    e.ejercicios.forEach((x) => {
      const nombre = x.numero && x.cierre
        ? `N° ${x.numero} — cierre ${window.Motor.fechaCorta(x.cierre)}`
        : `Ejercicio ${x.anio}`;
      $("#ejercicio").add(new Option(
        nombre + (x.deLaBolsa ? " · de la planilla" : ""), x.anio));
    });
    recargar();
  }

  async function recargar() {
    const ente = indice.entes[$("#ente").value];
    const anio = $("#ejercicio").value;
    const archivo = $("#archivo").value;

    // los libros y la carátula salen del diario y de los datos del ente: no
    // dependen de los saldos ni de los controles, así que se enlazan siempre
    $("#ver-libros").href = `libros.html?ente=${ente.slug}&ejercicio=${anio}`;
    $("#ver-caratula").href =
      `informe.html?ente=${ente.slug}&ejercicio=${anio}&solo=caratula`;
    /* Los estados a valores históricos y el informe de situación se arman del
       diario, igual que los libros: no dependen del origen de saldos. */
    $("#ver-historicos").href =
      `informe.html?ente=${ente.slug}&ejercicio=${anio}&historico=1`;
    $("#ver-situacion").href =
      `situacion.html?ente=${ente.slug}&ejercicio=${anio}`;
    $("#ver-ganancias").href =
      `libros.html?ente=${ente.slug}&ejercicio=${anio}&libro=ganancias`;

    /* Los estados salen **del diario**, igual que los libros. Los archivos de
       saldos quedaron para un solo uso: seguir reproduciendo a Mordor contra su
       prototipo congelado. Por eso el diario es lo normal y va primero. */
    try {
      motor = archivo === "diario"
        ? await window.Motor.desdeDiario(ente.slug, anio, {})
        : await window.Motor.cargar(ente.slug, anio, archivo);
    } catch (err) {
      return sinSaldos(ente, anio, archivo, err);
    }
    $("#resumen-ente").innerHTML = resumenEnte(ente, anio);
    decirDeDondeSale(ente, anio);
    pintarCamino(archivo);
    pintarControles();
    const link = $("#ver-informe");
    link.href = `informe.html?ente=${ente.slug}&ejercicio=${anio}` +
      (archivo === "diario" ? "" : `&saldos=${archivo}`);
    link.setAttribute("aria-disabled", motor.fallan.length ? "true" : "false");
    link.textContent = motor.fallan.length
      ? "El informe no se emite: hay controles con diferencia"
      : "Ver el informe imprimible";

    /* El mismo informe, entrando por la puerta de las firmas: abre con el cuadro
       de la clave esperando. Un balance con controles que no cierran no se firma. */
    const firmado = $("#ver-firmado");
    firmado.href = link.href + "&firmar=1";
    firmado.setAttribute("aria-disabled", motor.fallan.length ? "true" : "false");
    window.Bolsa.hayServidor().then((hay) => { firmado.hidden = !hay; });
  }

  /* Un ejercicio en armado todavía no tiene sumas y saldos. No es un error: el
     diario ya se puede leer y la carátula también. */
  async function sinSaldos(ente, anio, archivo, err) {
    motor = null;
    $("#resumen-ente").textContent =
      "Ejercicio en armado: todavía no hay sumas y saldos para cerrar el balance.";
    let faltan = [];
    try {
      const ej = await window.Bolsa.json(
        `../datos/entes/${ente.slug}/${anio}/ejercicio.json`);
      faltan = ej.faltan || [];
    } catch (e) { /* sin ejercicio.json no hay nada que contar */ }

    $("#camino").innerHTML = "";
    /* Un archivo de saldos que no existe no es un ejercicio a medio hacer: es un
       origen que este ente no usa. Se dice cuál es el que sí. */
    const esArchivo = archivo !== "diario";
    $("#tablero").innerHTML = `<div class="aviso">
      <strong>Todavía no se puede armar el balance de este ejercicio.</strong><br>
      ${esc(err.message)}
      ${esArchivo ? "<br><br>Este ente no tiene ese archivo de saldos. Los estados salen " +
        "del diario: elegí <em>Diario generado por el sistema</em> en «Origen de los " +
        "saldos»." : ""}
      ${faltan.length ? "<br><br>Falta cargar:<br>· " +
        faltan.map(esc).join("<br>· ") : ""}
      <br><br>El diario, el mayor y la carátula sí se pueden ver.</div>`;
    $("#avisos").innerHTML = "";
    const link = $("#ver-informe");
    link.href = "#";
    link.setAttribute("aria-disabled", "true");
    link.textContent = "El informe todavía no se puede emitir";
    const firmado = $("#ver-firmado");
    firmado.href = "#";
    firmado.setAttribute("aria-disabled", "true");
  }

  /* Un ejercicio puede venir de la carpeta o de la planilla que se importó y
     quedó en este navegador. No es lo mismo y hay que decirlo: lo del navegador
     no está respaldado en ningún lado y se puede tirar de acá. */
  function decirDeDondeSale(ente, anio) {
    const dice = $("#dice-bolsa");
    if (!dice) return;
    if (!window.Bolsa.tiene(ente.slug, anio)) {
      dice.hidden = true;
      return;
    }
    dice.hidden = false;
    dice.innerHTML = "Este ejercicio sale de la planilla que importaste y vive " +
      "<strong>en este navegador</strong>, no en la carpeta del ente ni en ningún " +
      "servidor. " +
      `<button type="button" class="btn tenue" id="olvidar">Olvidarlo</button>`;
    $("#olvidar").onclick = () => {
      window.Bolsa.olvidar(ente.slug, anio);
      location.reload();
    };
  }

  const esc = (x) => String(x).replace(/[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function resumenEnte(ente, anio) {
    const e = motor.ejercicio;
    return `Ejercicio N° ${e.numero}, iniciado el ${window.Motor.fechaLarga(e.inicio)} y ` +
      `finalizado el ${window.Motor.fechaLarga(e.cierre)}. Moneda de cierre, con un índice ` +
      `que varió ${window.Motor.porciento(motor.indice.variacion_actual)} en el ejercicio.`;
  }

  function pintarCamino(archivo) {
    const s = motor.d.saldos;
    const cuentas = Object.keys(s.cierre).length;
    const notas = Object.keys(motor.notas).length;
    const generado = archivo !== "saldos.json";
    const pasos = [
      ["Fuentes del ejercicio",
       "Libros de ventas y compras, pagos a ARCA, retenciones e índices",
       /* El diario lee `fuentes.json`, aunque su leyenda de origen no lo diga. */
       generado || (s.origen || "").indexOf("fuentes") >= 0
         ? "leídas de fuentes.json" : "cargadas del papel de trabajo", true],
      ["Diario",
       generado ? "Los asientos del ejercicio, generados desde las fuentes"
                : "Sumas y saldos tomado del papel de trabajo",
       `${cuentas} cuentas con movimiento`, true],
      ["Mapeo a la exposición",
       "Cada cuenta imputada a una línea del plan RT 54",
       `${notas} notas de composición armadas`, true],
      ["Estados y anexos",
       "ESP, ER, EEPN, EFE, Anexo III y Anexo VIII",
       `resultado del ejercicio ${pesos(motor.calc.actual["er.resultado_ejercicio"])}`, true],
      ["Informe",
       "Carátula, estados, notas e informe del auditor",
       motor.fallan.length ? "trabado por los controles" : "listo para imprimir",
       motor.fallan.length === 0],
    ];
    $("#camino").innerHTML = pasos.map(([que, detalle, dato, ok]) => `
      <li>
        <span class="marca ${ok ? "" : "pendiente"}">${ok ? "✓" : "·"}</span>
        <span class="que">${que}<span class="detalle">${detalle}</span></span>
        <span class="dato">${dato}</span>
      </li>`).join("");
  }

  function pintarControles() {
    const c = motor.controles;
    const mal = motor.fallan.length;
    const chapa = mal
      ? `<span class="chapa mal">${mal} con diferencia</span>`
      : `<span class="chapa bien">Todos en cero</span>`;
    const filas = c.map((x) => `
      <tr class="${Math.abs(x.diferencia) > window.Motor.TOL ? "falla" : ""}">
        <td class="id">${x.id}</td>
        <td>${x.descripcion}</td>
        <td class="num">${pesos(x.esperado, 2)}</td>
        <td class="num">${pesos(x.obtenido, 2)}</td>
        <td class="num">${pesos(x.diferencia, 2)}</td>
      </tr>`).join("");
    $("#tablero").innerHTML = `
      <div class="resumen-control">${chapa}
        <span>${c.length} controles corridos sobre el ejercicio.</span></div>
      <div class="envuelve">
        <table class="planilla">
          <thead><tr>
            <th>Id</th><th>Control</th>
            <th class="num">Esperado</th><th class="num">Obtenido</th><th class="num">Diferencia</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
    $("#avisos").innerHTML = motor.avisos.length
      ? `<div class="aviso"><strong>Avisos</strong><br>${motor.avisos.join("<br>")}</div>` : "";
  }

  function fallar(html) {
    $("#tablero").innerHTML = `<div class="error">${html}</div>`;
  }

  arrancar();
})();
