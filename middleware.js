/* ═══════════════════════════════════════════════════════════════
   Puerta de entrada al Área del Estudio

   Corre en el servidor de Vercel ANTES de entregar `/estudio`. Pide
   usuario y contraseña con el diálogo del navegador (autenticación
   básica) y solo entonces sirve la página.

   ⚠️ Este es el único archivo del sitio que se ejecuta del lado del
   servidor. El resto sigue siendo HTML, CSS y JS estáticos.

   Las credenciales NO están acá ni en ningún archivo del repositorio:
   se leen de la variable de entorno `ACCESO_ESTUDIO`, que se carga en
   Vercel → Settings → Environment Variables. Formato:

       usuario:contraseña

   Para varias personas, separadas por coma:

       agustin:unaClaveLarga,maria:otraClaveLarga

   Ojo: la contraseña viaja cifrada porque el sitio es HTTPS, pero no
   hay bloqueo por intentos fallidos (el middleware no guarda estado
   entre pedidos). Lo único que frena la fuerza bruta es que la
   contraseña sea larga. Usá 16 caracteres o más.

   Después de publicar esto, VERIFICALO: abrí estudiopochelu.com/estudio
   en una ventana de incógnito y confirmá que pide usuario y contraseña.
   Si entra derecho, el middleware no se está ejecutando y la página
   quedó abierta.
   ═══════════════════════════════════════════════════════════════ */

export const config = {
  matcher: ['/estudio', '/estudio.html'],
};

/* Compara sin cortar al primer carácter distinto, para que el tiempo de
   respuesta no delate cuánto de la contraseña era correcto. */
function coincide(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

function pedirCredenciales() {
  return new Response('Acceso restringido.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Área del Estudio", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default function middleware(request) {
  const credenciales = process.env.ACCESO_ESTUDIO;

  /* Sin la variable configurada no se abre igual: es preferible que la
     página no funcione a que quede accesible para cualquiera. */
  if (!credenciales) {
    return new Response(
      'El acceso al Área del Estudio no está configurado. ' +
      'Falta cargar la variable ACCESO_ESTUDIO en Vercel.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const cabecera = request.headers.get('authorization') || '';
  if (!cabecera.startsWith('Basic ')) return pedirCredenciales();

  let usuario, clave;
  try {
    const plano = atob(cabecera.slice(6));
    const corte = plano.indexOf(':');
    if (corte < 1) return pedirCredenciales();
    usuario = plano.slice(0, corte);
    clave = plano.slice(corte + 1);
  } catch {
    return pedirCredenciales();
  }

  const autorizado = credenciales.split(',').some((par) => {
    const corte = par.indexOf(':');
    if (corte < 1) return false;
    return coincide(par.slice(0, corte).trim(), usuario) && coincide(par.slice(corte + 1), clave);
  });

  if (!autorizado) return pedirCredenciales();

  /* Sin devolver nada, el pedido sigue su curso y Vercel entrega la página. */
}
