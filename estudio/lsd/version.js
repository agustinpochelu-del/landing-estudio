/**
 * El sello de versión.
 *
 * Muestra en pantalla qué versión de los archivos cargó el navegador de verdad,
 * no la que dice el HTML en el disco.
 *
 * Existe porque dos veces seguidas un arreglo "no funcionó" y lo que pasaba era
 * que el navegador seguía sirviendo archivos viejos de su caché: la página
 * pedía `app.js?v=22` cuando el archivo ya iba por `v=45`. Desde afuera es
 * indistinguible de un bug, y se pierde media hora buscando en el lugar
 * equivocado.
 *
 * Con el sello a la vista, la pregunta "¿por qué sigue pasando lo mismo?" se
 * contesta mirando un número.
 */

/** La versión que este archivo declara. Sube junto con los `?v=` del HTML. */
const VERSION_ESPERADA = '76';

(function sellarVersion() {
  const caja = document.getElementById('sello-version');
  if (!caja) return;

  /*
   * La versión REAL es la del `src` con que el navegador pidió este archivo.
   * Si sirvió una copia vieja de caché, acá aparece la vieja, que es
   * exactamente lo que hay que ver.
   */
  const script = document.querySelector('script[src*="version.js"]');
  const src = script ? script.getAttribute('src') || '' : '';
  const enLaPagina = (src.split('v=')[1] || '').trim();

  if (!enLaPagina) {
    caja.textContent = `Versión ${VERSION_ESPERADA}.`;
    return;
  }

  if (enLaPagina === VERSION_ESPERADA) {
    caja.innerHTML = `Versión <code>${enLaPagina}</code>.`;
    return;
  }

  /*
   * El HTML pide una versión y el JS que llegó dice otra: el navegador mezcló
   * archivos de distintas épocas. Es el caso peligroso, porque la página
   * funciona a medias.
   */
  caja.classList.add('vieja');
  caja.innerHTML =
    `El navegador cargó archivos viejos: la página pide la versión ` +
    `<code>${enLaPagina}</code> y el código que llegó es la <code>${VERSION_ESPERADA}</code>. ` +
    `Recargá con <strong>Ctrl + F5</strong>, o abrí la dirección agregándole ` +
    `<code>?nuevo=1</code> al final.`;
})();

/*
 * Y ahora la comprobación que no se puede engañar: qué versión hay en el
 * disco, preguntada al servidor con una dirección que ninguna caché vio antes.
 *
 * La de arriba compara el HTML contra el JS, y las dos cosas pueden venir de
 * la misma caché vieja: coinciden entre sí y el sello muestra un número
 * tranquilizador mientras la pantalla corre el motor de la semana pasada.
 *
 * Eso fue exactamente lo que pasó con el envío de Nautical: el arreglo estaba
 * escrito en el disco, el sello no se quejaba, y el archivo salió con los
 * conceptos que había que dejar afuera todavía adentro. Desde afuera es
 * idéntico a que el arreglo no funcione.
 *
 * Preguntarle al servidor no cuesta nada y cierra el agujero.
 */
(async function compararConElDisco() {
  const caja = document.getElementById('sello-version');
  if (!caja || typeof fetch !== 'function') return;

  try {
    const resp = await fetch(`version.js?d=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) return;
    const enElDisco = (/VERSION_ESPERADA\s*=\s*'([^']+)'/.exec(await resp.text()) || [])[1];
    if (!enElDisco || enElDisco === VERSION_ESPERADA) return;

    caja.classList.add('vieja');
    caja.innerHTML =
      `<strong>La pantalla está corriendo código viejo.</strong> En el disco está la versión ` +
      `<code>${enElDisco}</code> y acá se está ejecutando la <code>${VERSION_ESPERADA}</code>. ` +
      `No armes el archivo así: recargá con <strong>Ctrl + F5</strong>.`;
  } catch (error) {
    /* Sin servidor —abierto con doble clic desde el disco— no hay nada que
       comparar, y eso no es un problema que haya que anunciar. */
  }
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VERSION_ESPERADA };
}
