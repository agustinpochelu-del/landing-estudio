# Landing — Estudio contable

Landing page estática (HTML + CSS + JS, sin dependencias ni build). Objetivo: que un
cliente o potencial cliente pueda contactarse y agendar una cita.

## Archivos

| Archivo      | Qué contiene                                              |
|--------------|-----------------------------------------------------------|
| `index.html` | Todo el contenido y los textos                            |
| `styles.css` | Diseño (colores de marca en `:root`, arriba del todo)     |
| `script.js`  | Menú, animaciones, validación y armado del link WhatsApp  |

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

Para cambiar el teléfono o el nombre más adelante: bloque `CONFIG` arriba de
`script.js`, y buscar/reemplazar en `index.html`.

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
