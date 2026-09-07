/* La imagen de una firma, dejada lista para la hoja.

   Un escaneo entra con media hoja de papel alrededor, el fondo blanco y más
   resolución de la que hace falta. Sobre el sello eso se ve mal de tres formas:
   el rectángulo blanco tapa el renglón, el papel cuenta como alto —«20 mm»
   terminan siendo 20 mm de hoja con la firma chiquita adentro— y la firma queda
   corrida hacia donde estaba el trazo en el escaneo.

   Así que se hace siempre lo mismo, la cargue quien la cargue: se achica, se
   busca el rectángulo de la tinta y se recorta ahí, y se le saca el fondo.

   Lo usan el cargador de firmas —que las guarda en `datos/firmas/`— y el
   informe, cuando la firma se sube en el momento y no se guarda en ningún lado. */

(function () {
  "use strict";

  const ANCHO_MAX = 900;
  const CASI_BLANCO = 232;

  /* Dónde está la tinta: el rectángulo más chico que contiene todo lo que no es
     papel, con un poco de aire alrededor. */
  function cajaDeTinta(ctx, an, al) {
    const p = ctx.getImageData(0, 0, an, al).data;
    let x0 = an, y0 = al, x1 = -1, y1 = -1;
    for (let y = 0; y < al; y++) {
      for (let x = 0; x < an; x++) {
        const i = (y * an + x) * 4;
        if (p[i + 3] < 8) continue;
        if ((p[i] + p[i + 1] + p[i + 2]) / 3 >= CASI_BLANCO) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;                       // la hoja está toda en blanco
    const aire = Math.round(Math.max(an, al) * 0.01);
    x0 = Math.max(0, x0 - aire);
    y0 = Math.max(0, y0 - aire);
    x1 = Math.min(an - 1, x1 + aire);
    y1 = Math.min(al - 1, y1 + aire);
    return { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
  }

  function procesar(fuente, sacarFondo) {
    return new Promise((listo, mal) => {
      const img = new Image();
      img.onerror = () => mal(new Error("no pude abrir esa imagen"));
      img.onload = () => {
        const escala = Math.min(1, ANCHO_MAX / img.width);
        let lienzo = document.createElement("canvas");
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        let ctx = lienzo.getContext("2d");
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);

        const caja = cajaDeTinta(ctx, lienzo.width, lienzo.height);
        if (caja && (caja.ancho < lienzo.width || caja.alto < lienzo.height)) {
          const recorte = document.createElement("canvas");
          recorte.width = caja.ancho;
          recorte.height = caja.alto;
          recorte.getContext("2d").drawImage(lienzo, caja.x, caja.y, caja.ancho,
            caja.alto, 0, 0, caja.ancho, caja.alto);
          lienzo = recorte;
          ctx = lienzo.getContext("2d");
        }

        if (sacarFondo) {
          const d = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
          const p = d.data;
          for (let i = 0; i < p.length; i += 4) {
            const claro = (p[i] + p[i + 1] + p[i + 2]) / 3;
            if (claro >= CASI_BLANCO) {
              p[i + 3] = 0;
            } else if (claro > CASI_BLANCO - 40) {
              /* el borde del trazo se desvanece en vez de cortarse en escalera */
              p[i + 3] = Math.round(p[i + 3] * (CASI_BLANCO - claro) / 40);
            }
          }
          ctx.putImageData(d, 0, 0);
        }
        listo(lienzo.toDataURL("image/png"));
      };
      img.src = fuente;
    });
  }

  /* De un archivo elegido en pantalla a la imagen lista. */
  async function deArchivo(file, sacarFondo) {
    if (!file) throw new Error("no elegiste ninguna imagen");
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      throw new Error("eso no es un PNG ni un JPG");
    }
    const crudo = await new Promise((listo) => {
      const lector = new FileReader();
      lector.onload = () => listo(lector.result);
      lector.readAsDataURL(file);
    });
    return procesar(crudo, sacarFondo !== false);
  }

  window.Rubrica = { procesar, deArchivo, ANCHO_MAX, CASI_BLANCO };
})();
