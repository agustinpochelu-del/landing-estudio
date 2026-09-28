/**
 * Cifrado de los reservorios que llevan datos personales.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 *
 * El reservorio de empleados tiene CUIL, nombre y CBU de la gente de cada
 * cliente. Puesto en línea sin más, ese archivo queda a un descuido de
 * distancia: una contraseña filtrada, un repositorio que alguien hace público,
 * una copia de seguridad del proveedor.
 *
 * Una puerta —clave, doble factor— protege el ACCESO. No protege el
 * CONTENIDO: del otro lado el archivo sigue estando en texto plano, y quien
 * llegue se lo lleva entero.
 *
 * Acá el archivo se sube cifrado. En el servidor, en el repositorio y en
 * cualquier copia es ruido. Se descifra en el navegador, con una frase que no
 * viaja a ningún lado y que nadie más tiene. Si la puerta falla, no hay nada
 * que leer.
 *
 * Es el mismo criterio que ya usa el servidor de Balances con las firmas
 * escaneadas: no se sirven como archivo, se entregan contra una clave.
 *
 * ── Cómo está armado ──────────────────────────────────────────────────────
 *
 *   clave      PBKDF2-SHA256, 250.000 vueltas, sal de 16 bytes al azar
 *   cifrado    AES-GCM de 256 bits, con vector de 12 bytes al azar
 *
 * AES-GCM porque además de cifrar **autentica**: si alguien cambia un byte del
 * archivo, el descifrado falla en vez de devolver basura que parezca un CSV.
 *
 * La sal y el vector van en claro adentro del sobre, que es lo normal: no son
 * secretos, sirven para que el mismo archivo cifrado dos veces con la misma
 * frase no dé el mismo resultado.
 *
 * ── Lo que esto NO protege ────────────────────────────────────────────────
 *
 * Una vez descifrado, el padrón queda en la memoria del navegador de esa
 * computadora, igual que antes. Lo que se protege es el archivo en tránsito y
 * en el servidor, que es donde está expuesto a gente que no conocemos.
 *
 * Y la frase es todo: si se pierde, el archivo no se recupera. El CSV sin
 * cifrar en la carpeta de la empresa sigue siendo el respaldo.
 */

const CIFRADO_VUELTAS = 250000;
const CIFRADO_MARCA = 'lsd-reservorio-cifrado';
const CIFRADO_VERSION = 1;

/** Bytes a base64 y vuelta, sin depender de nada. */
function aBase64(bytes) {
  let texto = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) texto += String.fromCharCode(b[i]);
  return btoa(texto);
}

function desdeBase64(texto) {
  const plano = atob(String(texto || ''));
  const bytes = new Uint8Array(plano.length);
  for (let i = 0; i < plano.length; i++) bytes[i] = plano.charCodeAt(i);
  return bytes;
}

/** La clave de cifrado, derivada de la frase. Lenta a propósito. */
async function claveDeLaFrase(frase, sal, vueltas) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(frase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: vueltas, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra unos bytes y devuelve el sobre, listo para guardar como JSON.
 *
 * `nombre` viaja adentro para que al descifrar se pueda rearmar el archivo con
 * su nombre original: el lector elige cómo leerlo por la extensión.
 */
async function cifrarBytes(bytes, frase, nombre) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await claveDeLaFrase(frase, sal, CIFRADO_VUELTAS);
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, bytes);

  return {
    marca: CIFRADO_MARCA,
    version: CIFRADO_VERSION,
    algoritmo: 'AES-GCM-256',
    derivacion: 'PBKDF2-SHA256',
    vueltas: CIFRADO_VUELTAS,
    nombre: String(nombre || ''),
    sal: aBase64(sal),
    iv: aBase64(iv),
    datos: aBase64(cifrado),
  };
}

/**
 * Descifra un sobre. Devuelve { bytes, nombre }.
 *
 * Con la frase equivocada, AES-GCM no devuelve basura: falla. Por eso el error
 * puede decir con confianza que la frase no es la que corresponde.
 */
async function descifrarSobre(sobre, frase) {
  if (!sobre || sobre.marca !== CIFRADO_MARCA) {
    throw new Error('El archivo no es un reservorio cifrado de este armador.');
  }
  if (Number(sobre.version) !== CIFRADO_VERSION) {
    throw new Error(
      `El archivo está cifrado con la versión ${sobre.version} y este armador entiende la ${CIFRADO_VERSION}.`
    );
  }

  const clave = await claveDeLaFrase(frase, desdeBase64(sobre.sal), Number(sobre.vueltas) || CIFRADO_VUELTAS);
  let bytes;
  try {
    bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: desdeBase64(sobre.iv) },
      clave,
      desdeBase64(sobre.datos)
    );
  } catch (error) {
    /* AES-GCM falla igual con la frase equivocada que con el archivo tocado.
       Se nombran las dos posibilidades en vez de adivinar una. */
    throw new Error('No se pudo descifrar: la frase no es la que corresponde, o el archivo está dañado.');
  }
  return { bytes: new Uint8Array(bytes), nombre: sobre.nombre || '' };
}

/* ---------- Pedir la frase ---------- */

/*
 * La frase se pide una vez y queda en memoria mientras la pestaña esté
 * abierta. No se guarda en el navegador a propósito: lo que sí queda guardado
 * es el padrón ya descifrado, así que en la práctica se escribe una vez por
 * navegador y no vuelve a aparecer.
 */
let fraseEnMemoria = null;

function olvidarFrase() {
  fraseEnMemoria = null;
}

/**
 * Pide la frase con un diálogo de la página, no con el del navegador.
 *
 * Devuelve la frase, o null si se cancela. Cancelar no es un error: la
 * aplicación sigue andando sin ese reservorio, soltando el archivo a mano.
 */
async function pedirFrase(motivo) {
  if (fraseEnMemoria) return fraseEnMemoria;

  /*
   * Los botones son `type="button"` y cierran a mano, en vez del
   * `<form method="dialog">` que sería lo natural.
   *
   * No es preferencia: en el navegador donde corre esto, cerrar el diálogo con
   * `method="dialog"` **deja `returnValue` puesto y no dispara el evento
   * `close`**. Escuchando `close` —que es lo que dice el manual— la promesa
   * queda esperando para siempre: el diálogo desaparece de la pantalla y la
   * carga no sigue nunca. Se descubre recién cuando alguien lo usa.
   */
  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-frase';
  dialogo.innerHTML = `
    <form>
      <h3>El reservorio está cifrado</h3>
      <p class="nota">${motivo ? motivo : 'Hace falta la frase para leerlo.'}</p>
      <label for="frase-cifrado">Frase</label>
      <input type="password" id="frase-cifrado" autocomplete="current-password" autofocus>
      <menu>
        <button type="button" class="suave" data-accion="cancelar">Cancelar</button>
        <button type="button" data-accion="ok">Abrir</button>
      </menu>
    </form>`;
  document.body.appendChild(dialogo);
  dialogo.showModal();

  const campo = dialogo.querySelector('#frase-cifrado');
  const frase = await new Promise((resolver) => {
    let resuelto = false;
    const terminar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      resolver(valor);
    };

    dialogo.querySelectorAll('button[data-accion]').forEach((boton) =>
      boton.addEventListener('click', () => {
        terminar(boton.dataset.accion === 'ok' && campo.value ? campo.value : null);
      })
    );
    /* Enter acepta y Escape cancela, que es lo que espera cualquiera. */
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); terminar(campo.value || null); }
    });
    dialogo.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); });
  });

  dialogo.close();
  dialogo.remove();
  if (frase) fraseEnMemoria = frase;
  return frase;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CIFRADO_VUELTAS, CIFRADO_MARCA, CIFRADO_VERSION,
    aBase64, desdeBase64, cifrarBytes, descifrarSobre, olvidarFrase,
  };
}
