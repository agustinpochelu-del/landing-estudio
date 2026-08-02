/* ═══════════════════════════════════════════════════════════════
   Estudio Vega & Asociados — comportamiento de la landing

   👉 EDITÁ SOLO ESTE BLOQUE para poner tus datos reales.
   ═══════════════════════════════════════════════════════════════ */
const CONFIG = {
  // Número de WhatsApp en formato internacional, SOLO dígitos.
  // Argentina: 54 + 9 + código de área sin 0 + número sin 15.
  // 280 456-2145  →  '5492804562145'
  whatsapp: '5492804562145',

  // Nombre que aparece en el mensaje de WhatsApp
  estudio: 'Agustín Pochelú',

  // Email de contacto
  email: 'agustinpochelu@estudiopochelu.com',
};

/* ─────────────────────────────────────────────────────────────── */

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ── Año del footer ─────────────────────────────────────────── */
$('#anio').textContent = new Date().getFullYear();

/* ── Menú mobile ────────────────────────────────────────────── */
const nav = $('#nav-principal');
const navToggle = $('#nav-toggle');

const setNav = (open) => {
  nav.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
};

navToggle.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
$$('#nav-principal a').forEach((a) => a.addEventListener('click', () => setNav(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });

/* ── Sombra del header al hacer scroll + botón flotante ─────── */
const header = $('.site-header');
const waFloat = $('#wa-float');

const onScroll = () => {
  header.classList.toggle('is-stuck', window.scrollY > 8);
  waFloat.classList.toggle('is-visible', window.scrollY > 500);
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* ── Links de WhatsApp directo ──────────────────────────────── */
const waLink = (texto) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(texto)}`;

const saludoDirecto = `Hola ${CONFIG.estudio}, quisiera hacerte una consulta.`;
$$('#wa-float, #wa-directo').forEach((el) => { el.href = waLink(saludoDirecto); });

/* ── Animaciones de entrada ─────────────────────────────────── */
const reveals = $$('.reveal');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-in'));
}

/* ── FAQ: solo una abierta a la vez ─────────────────────────── */
const faqs = $$('.faq details');
faqs.forEach((d) => {
  d.addEventListener('toggle', () => {
    if (d.open) faqs.forEach((otro) => { if (otro !== d) otro.open = false; });
  });
});

/* ── Formulario de cita ─────────────────────────────────────── */
const form   = $('#form-cita');
const status = $('#form-status');
const fecha  = $('#fecha');

// La fecha mínima seleccionable es mañana; máxima, 90 días
const hoy = new Date();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
const tope   = new Date(hoy); tope.setDate(hoy.getDate() + 90);
fecha.min = iso(manana);
fecha.max = iso(tope);

const setError = (campo, mensaje) => {
  const slot = $(`[data-error-for="${campo.id}"]`);
  if (slot) slot.textContent = mensaje || '';
  campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  if (mensaje) campo.setAttribute('aria-describedby', `err-${campo.id}`);
  if (slot) slot.id = `err-${campo.id}`;
};

const validar = () => {
  const errores = [];
  const req = {
    nombre:   'Necesitamos tu nombre para saber con quién hablamos.',
    email:    'Ingresá un email válido.',
    telefono: 'Ingresá un teléfono de contacto.',
    servicio: 'Elegí el tema de la consulta.',
    fecha:    'Elegí un día para la reunión.',
    horario:  'Elegí una franja horaria.',
  };

  Object.entries(req).forEach(([id, msg]) => {
    const campo = $(`#${id}`);
    const valor = campo.value.trim();
    let error = '';

    if (!valor) {
      error = msg;
    } else if (id === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)) {
      error = 'El email no parece válido. Revisalo, por favor.';
    } else if (id === 'telefono' && valor.replace(/\D/g, '').length < 8) {
      error = 'El teléfono parece incompleto (mínimo 8 dígitos).';
    } else if (id === 'nombre' && valor.length < 3) {
      error = 'Escribí tu nombre completo.';
    }

    setError(campo, error);
    if (error) errores.push(campo);
  });

  return errores;
};

// Limpia el error al corregir
$$('#form-cita input, #form-cita select, #form-cita textarea').forEach((campo) => {
  campo.addEventListener('input', () => {
    if (campo.getAttribute('aria-invalid') === 'true') setError(campo, '');
  });
});

const formatearFecha = (valor) => {
  const [a, m, d] = valor.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

form.addEventListener('submit', (e) => {
  e.preventDefault();
  status.textContent = '';
  status.className = 'form-status';

  const errores = validar();
  if (errores.length) {
    status.textContent = 'Revisá los campos marcados para poder enviar la solicitud.';
    status.classList.add('err');
    errores[0].focus();
    return;
  }

  const datos = Object.fromEntries(new FormData(form).entries());

  const mensaje = [
    `Hola ${CONFIG.estudio}, quiero agendar una consulta.`,
    '',
    `• Nombre: ${datos.nombre}`,
    datos.empresa ? `• Empresa: ${datos.empresa}` : null,
    `• Email: ${datos.email}`,
    `• Teléfono: ${datos.telefono}`,
    `• Tema: ${datos.servicio}`,
    `• Día preferido: ${formatearFecha(datos.fecha)}`,
    `• Horario: ${datos.horario}`,
    `• Modalidad: ${datos.modalidad}`,
    datos.mensaje ? `• Consulta: ${datos.mensaje}` : null,
  ].filter(Boolean).join('\n');

  window.open(waLink(mensaje), '_blank', 'noopener');

  status.textContent = '¡Listo! Se abrió WhatsApp con tu solicitud. Enviala para que confirmemos el turno.';
  status.classList.add('ok');
});
