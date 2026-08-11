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
| `estudio/libro-iva/` | Importador de Libro de IVA Digital (copia del proyecto, ver `LEEME.md`) |
| `middleware.js` | Pide usuario y clave antes de servir `/estudio` y todo lo que cuelga de ahí (corre en Vercel) |
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

8. **Área del Estudio** — el botón "Abrir el liquidador" apunta a
   `https://liquidador-pochelu.streamlit.app`. Si alguna vez
   renombrás ese subdominio (en Streamlit: Settings → App URL), acordate de actualizar
   el link en `estudio.html`: la dirección vieja deja de funcionar.

   Esa página **pide usuario y contraseña** (ver más abajo). Se entra desde el pie
   de la página principal, en la columna "Estudio" — no está en el menú de arriba, para
   no mostrarle al cliente una puerta que no es para él.

   Hay dos clases de herramienta, y conviene no mezclarlas:

   - **Alojadas afuera**, como el liquidador. Viven en otro servidor y piden su propia
     clave. El Área del Estudio solo las enlaza.
   - **Alojadas acá adentro**, como el importador de Libro de IVA, que está en
     `estudio/libro-iva/` y se publica en `/estudio/libro-iva`. Usan la clave del Área
     del Estudio, porque el `matcher` de `middleware.js` incluye `/estudio/:path*`.
     **Si alguien acorta ese matcher a `/estudio`, esas páginas quedan abiertas para
     cualquiera sin ningún aviso.**

   Para sumar una herramienta nueva: copiar el bloque `<article class="tool">` entero
   dentro de `estudio.html` y cambiarle el título, la descripción, las etiquetas y el
   link. No hace falta tocar el CSS.

9. **Importador de Libro de IVA Digital** — los archivos de `estudio/libro-iva/` son
   una **copia**. El proyecto vive en `F:\OneDrive\ESTUDIO\desarrollos\LIVA D`, con su
   propio `README.md` y sus pruebas. Para actualizarlo hay que volver a copiar los ocho
   archivos; el instructivo está en `estudio/libro-iva/LEEME.md`.

   Se abre en `/estudio/libro-iva/importador`, **con `/importador` al final**. No es un
   capricho: el sitio se publica sin barra final, así que en `/estudio/libro-iva` las
   rutas relativas de la aplicación resolverían contra `/estudio/` y la página saldría
   sin estilos. Por eso tampoco hay que poner un `index.html` en esa carpeta.

   Sus `?v=` son propios y no tienen nada que ver con los de la landing.

   Las planillas de comprobantes **no se suben**: tienen CUIT, razones sociales e
   importes de clientes. El `.gitignore` bloquea `.xlsx`, `.xls` y `.csv` en todo el
   repositorio para que no se cuelen por descuido. Por eso, la página de pruebas
   publicada corre solo las verificaciones de cálculo y avisa que la corrida sobre la
   planilla real no se ejecutó.

## La clave del Área del Estudio

`estudiopochelu.com/estudio` pide usuario y contraseña. La clave **no está en el
repositorio**: se carga en Vercel, en el proyecto → **Settings → Environment
Variables**, con este nombre y este formato:

| Nombre | Valor |
|---|---|
| `ACCESO_ESTUDIO` | `agustin:unaClaveLarga` |

Para varias personas, separadas por coma y sin espacios:
`agustin:unaClaveLarga,maria:otraClaveLarga`

⚠️ **Marcala para los tres entornos.** Abajo del formulario hay un desplegable
llamado *Environments*: por defecto viene en **Development**, que es solo para pruebas
locales. Si la dejás así, el sitio publicado no la ve y `/estudio` responde error 503.
Tienen que quedar marcados **Production**, **Preview** y **Development**.

Después de guardarla hay que **redeployar** para que tome efecto: Vercel no aplica
variables nuevas a un deploy que ya está hecho.

Usá una contraseña **de 16 caracteres o más**. No hay bloqueo por intentos fallidos —
el middleware no guarda estado entre pedidos—, así que lo único que frena a alguien
probando claves es que sea larga.

**Verificalo siempre después de publicar:** abrí `estudiopochelu.com/estudio` en una
ventana de incógnito. Tiene que pedirte usuario y contraseña. Si entra derecho, el
middleware no se está ejecutando y la página quedó abierta.

Para cerrar la sesión hay que cerrar el navegador: el diálogo del navegador no tiene
botón de salir. Si compartís la máquina, usá una ventana de incógnito.

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
