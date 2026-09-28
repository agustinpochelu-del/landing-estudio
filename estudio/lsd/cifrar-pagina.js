/**
 * La pantalla para cifrar un reservorio.
 *
 * Usa las mismas funciones que usa la aplicación para descifrar —`cifrado.js`—
 * y no una implementación paralela. Dos implementaciones del mismo formato son
 * dos oportunidades de que no coincidan, y la que se descubre tarde es siempre
 * la de descifrar.
 *
 * Nada sale de esta computadora: el archivo se lee, se cifra y se baja, todo
 * en el navegador.
 */

const $$ = (id) => document.getElementById(id);
const esc = (t) =>
  String(t === null || t === undefined ? '' : t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );

let archivoEnClaro = null;

function conectar(idZona, idInput, alElegir) {
  const zona = $$(idZona);
  const input = $$(idInput);
  input.addEventListener('change', () => {
    if (input.files && input.files[0]) alElegir(input.files[0]);
  });
  ['dragenter', 'dragover'].forEach((e) =>
    zona.addEventListener(e, (ev) => { ev.preventDefault(); zona.classList.add('encima'); })
  );
  ['dragleave', 'drop'].forEach((e) =>
    zona.addEventListener(e, (ev) => { ev.preventDefault(); zona.classList.remove('encima'); })
  );
  zona.addEventListener('drop', (ev) => {
    const a = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (a) alElegir(a);
  });
}

/* ---------- Cifrar ---------- */

function revisar() {
  const f1 = $$('frase').value;
  const f2 = $$('frase2').value;
  const listo = Boolean(archivoEnClaro) && f1.length > 0 && f1 === f2;
  $$('btn-cifrar').disabled = !listo;

  const caja = $$('estado-cifrar');
  if (f1 && f2 && f1 !== f2) {
    caja.innerHTML = '<div class="aviso mal">Las dos frases no coinciden.</div>';
  } else if (f1 && f1.length < 12) {
    caja.innerHTML =
      '<div class="aviso ojo">La frase tiene ' + f1.length + ' caracteres. ' +
      'Es lo único que protege el archivo: conviene que sea larga, mejor una ' +
      'frase entera que una contraseña corta.</div>';
  } else {
    caja.innerHTML = '';
  }
}

['frase', 'frase2'].forEach((id) => $$(id).addEventListener('input', revisar));

conectar('soltar-claro', 'archivo-claro', (archivo) => {
  archivoEnClaro = archivo;
  $$('resumen-cifrar').textContent = `${archivo.name} · ${Math.round(archivo.size / 1024)} kB`;
  revisar();
});

$$('btn-cifrar').addEventListener('click', async () => {
  const caja = $$('estado-cifrar');
  try {
    const bytes = new Uint8Array(await archivoEnClaro.arrayBuffer());
    const sobre = await cifrarBytes(bytes, $$('frase').value, archivoEnClaro.name);
    const texto = JSON.stringify(sobre, null, 2);

    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${archivoEnClaro.name}.enc`;
    a.click();
    URL.revokeObjectURL(url);

    caja.innerHTML =
      `<div class="aviso bien">Listo: <strong>${esc(archivoEnClaro.name)}.enc</strong>. ` +
      `Probalo en el paso 2 antes de publicarlo.</div>`;
  } catch (error) {
    caja.innerHTML = `<div class="aviso mal">No se pudo cifrar: ${esc(error.message)}</div>`;
  }
});

/* ---------- Probar ---------- */

conectar('soltar-cifrado', 'archivo-cifrado', async (archivo) => {
  const caja = $$('estado-probar');
  try {
    const sobre = JSON.parse(await archivo.text());
    const frase = await pedirFrase(`Probando «${esc(archivo.name)}».`);
    if (!frase) {
      caja.innerHTML = '<div class="aviso">Cancelado.</div>';
      return;
    }

    const { bytes, nombre } = await descifrarSobre(sobre, frase);
    const texto = new TextDecoder().decode(bytes);
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim());

    $$('resumen-probar').textContent = `${lineas.length} líneas`;
    caja.innerHTML =
      `<div class="aviso bien">Abre bien. Adentro está <strong>${esc(nombre)}</strong>, ` +
      `con <strong>${lineas.length}</strong> líneas contando el encabezado.</div>` +
      `<p class="nota">La primera línea, para confirmar que es el archivo que esperabas:</p>` +
      `<pre class="codigo">${esc(lineas[0] || '')}</pre>`;
  } catch (error) {
    /* Una frase equivocada no queda guardada: el próximo intento la vuelve a pedir. */
    olvidarFrase();
    caja.innerHTML = `<div class="aviso mal">${esc(error.message)}</div>`;
  }
});
