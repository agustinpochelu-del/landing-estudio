# Landing — Estudio contable

Landing page estática (HTML + CSS + JS, sin dependencias ni build). Objetivo: que un
cliente o potencial cliente pueda contactarse y agendar una cita.

## Archivos

| Archivo         | Qué contiene                                                 |
|-----------------|--------------------------------------------------------------|
| `index.html`    | Todo el contenido y los textos de la landing                 |
| `styles.css`    | Diseño (colores de marca en `:root`, arriba del todo)        |
| `script.js`     | Menú, animaciones, validación y armado del link WhatsApp     |
| `clientes.html` | Área Clientes — pantalla de acceso (**solo visual**, ver más abajo) |
| `clientes.js`   | Año, ver/ocultar clave y aviso al enviar el formulario       |
| `estudio.html`  | Área del Estudio — escritorio de herramientas internas       |
| `AgenteMP.md`   | Reglas de mantenimiento del sitio (leerlo antes de editar)   |
| `CLAUDE.md`     | Resumen de esas reglas, se carga solo en cada sesión de Claude |
| `.claude/agents/agente-mp.md` | El agente de mantenimiento, se invoca con `@agente-mp` |

`clientes.html` se sirve como `https://www.estudiopochelu.com/clientes` y
`estudio.html` como `https://www.estudiopochelu.com/estudio` (Vercel tiene `cleanUrls`
activado). Las dos llevan `noindex`, así que no aparecen en Google.

## Cómo verla

```bash
python -m http.server 5173
```

Y abrir http://localhost:5173. También podés abrir `index.html` con doble clic.

## Datos cargados

- Agustín Pochelú — Contador Público
- Tel. `+54 280 456-2145` → WhatsApp `5492804562145`
- `agustinpochelu@estudiopochelu.com`
- Thomas 3042, Puerto Madryn, Chubut
- Matrículas: CPCE Chubut T. I, F. 940 · CPCECABA T. 325, F. 242
- X: [@PocheluAgustin](https://x.com/PocheluAgustin)

## ⚠️ Qué falta

1. **Foto propia** — la sección "Quién te atiende" quedó **sin foto** a propósito.
   Para reponerla: en `index.html` volvé a agregar el bloque `<div class="split-media">`
   con la imagen y sacale la clase `split-solo` al contenedor `.split`.
   La del hero es una foto de stock genérica de un escritorio, no un retrato.
2. **Texto de "Organización administrativa"** — lo redacté a partir de una
   descripción breve (circuitos administrativos, incorporación y formación de
   personal). Revisá la tarjeta en `#servicios` y ajustá la redacción.
3. **Testimonios** — la sección está **comentada** en `index.html` (buscá
   "TESTIMONIOS"). Descomentala cuando tengas testimonios reales de clientes.
   No la publiques con textos inventados.
4. **Barra de confianza** — dice "+20 años / 24 h / 100% digital / Matriculado".
   Las últimas tres son promesas, no estadísticas: asegurate de poder cumplirlas.
5. **FAQ de honorarios** — la única mención al tema. No dice ningún precio, solo
   que se definen por escrito antes de empezar. Si preferís sacarla del todo,
   está en la sección `#faq`.
6. **DNS del correo** — `mail.estudiopochelu.com` es un alias del dominio raíz, que
   ahora apunta a Vercel. El MX de prioridad 0 quedó apuntando a un servidor web.
   Hay que darle un registro A propio en el panel de hostmar (confirmar la IP con
   el soporte del hosting).
7. **Área Clientes** — `clientes.html` es **solo la maqueta visual**. El formulario no
   valida nada: no hay usuarios ni claves en el repositorio y ninguna combinación
   deja entrar a ningún lado. Por eso la pantalla avisa "Próximamente". Para que
   funcione de verdad hace falta un backend (usuarios, claves hasheadas, sesiones,
   los documentos a mostrar), lo que ya no es un sitio estático: se resuelve con
   Vercel Functions + una base de datos, o con un servicio de portal de clientes.
   **No pongas una clave en el JavaScript**: cualquiera la ve mirando el código.

8. **Área del Estudio** — falta pegar la dirección del Liquidador. En `estudio.html`
   el botón "Abrir el liquidador" tiene `href="#"` con un comentario `TODO` al lado:
   ahí va la URL de la app en Streamlit. Hasta que se complete, el botón no lleva a
   ningún lado.

   Esa página es **pública**, como todo el sitio: cualquiera que sepa la dirección ve
   la lista de herramientas. Lo que está protegido es cada herramienta, que pide su
   propio acceso. No está linkeada desde el menú, así que se entra escribiendo la
   dirección. Eso es discreción, no seguridad.

   Para sumar una herramienta nueva: copiar el bloque `<article class="tool">` entero
   dentro de `estudio.html` y cambiarle el título, la descripción, las etiquetas y el
   link. No hace falta tocar el CSS.

Para cambiar el teléfono o el nombre más adelante: bloque `CONFIG` arriba de
`script.js`, y buscar/reemplazar en `index.html` y `clientes.html` (el WhatsApp y el
email también están escritos ahí).

## ⚠️ Al cambiar el CSS o el JS

Los links en el HTML llevan `?v=2` (`styles.css?v=2`, `script.js?v=2`). **Subí ese
número cada vez que edites `styles.css`, `script.js` o `clientes.js`**, en los dos
archivos HTML. Si no lo hacés, los visitantes que ya entraron al sitio siguen viendo
la versión vieja aunque el deploy haya salido bien.

Pasó exactamente eso al publicar el Área Clientes: `vercel.json` marcaba el CSS como
`immutable` por un año, así que los navegadores no volvían a pedirlo ni con F5. Ahora
la cabecera es `max-age=0, must-revalidate`, que con el ETag de Vercel responde 304 y
no vuelve a descargar nada si el archivo no cambió.

## Colores de marca

Todos definidos en `styles.css` → `:root`. Cambiando `--green-800` y `--gold`
cambia la identidad de toda la página.

## Publicar

Ya está publicada en **https://www.estudiopochelu.com** vía Vercel, conectada al
repo `agustinpochelu-del/landing-estudio`. Cada `git push` a `main` redeploya solo:

```bash
git -C "C:/Users/agust/Documents/Claude/Landing" push
```

El apex `estudiopochelu.com` redirige (308) a `www`. Si preferís al revés,
se cambia en Vercel → Settings → Domains marcando el dominio primario.
