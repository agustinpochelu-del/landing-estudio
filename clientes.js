/* ═══════════════════════════════════════════════════════════════
   Área Clientes — pantalla de acceso

   ⚠️ Esto es SOLO la maqueta visual. No valida credenciales ni las
   compara contra nada: un sitio estático no puede autenticar a nadie.
   Cuando el área pase a ser funcional hay que reemplazar el submit
   por una llamada real a un backend.
   ═══════════════════════════════════════════════════════════════ */

const $ = (sel, ctx = document) => ctx.querySelector(sel);

/* ── Año del footer ─────────────────────────────────────────── */
$('#anio').textContent = new Date().getFullYear();

/* ── Ver / ocultar la clave ─────────────────────────────────── */
const clave = $('#clave');
const verClave = $('#ver-clave');

verClave.addEventListener('click', () => {
  const visible = clave.type === 'text';
  clave.type = visible ? 'password' : 'text';
  verClave.setAttribute('aria-pressed', String(!visible));
  verClave.setAttribute('aria-label', visible ? 'Mostrar la clave' : 'Ocultar la clave');
  clave.focus();
});

/* ── Formulario de acceso ───────────────────────────────────── */
const form = $('#form-acceso');
const status = $('#acceso-status');

const setError = (campo, mensaje) => {
  const slot = $(`[data-error-for="${campo.id}"]`);
  if (slot) {
    slot.textContent = mensaje || '';
    slot.id = `err-${campo.id}`;
  }
  campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  if (mensaje) campo.setAttribute('aria-describedby', `err-${campo.id}`);
};

// Limpia el error al corregir
[clave, $('#usuario')].forEach((campo) => {
  campo.addEventListener('input', () => {
    if (campo.getAttribute('aria-invalid') === 'true') setError(campo, '');
  });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  status.textContent = '';
  status.className = 'form-status';

  const req = {
    usuario: 'Ingresá tu usuario o CUIT.',
    clave:   'Ingresá tu clave.',
  };

  const errores = [];
  Object.entries(req).forEach(([id, msg]) => {
    const campo = $(`#${id}`);
    const error = campo.value.trim() ? '' : msg;
    setError(campo, error);
    if (error) errores.push(campo);
  });

  if (errores.length) {
    errores[0].focus();
    return;
  }

  // No se verifica nada ni se envía nada: el acceso todavía no existe.
  status.textContent = 'El acceso al área de clientes todavía no está habilitado. Escribime por WhatsApp o por email y lo vemos.';
  status.classList.add('err');
});
