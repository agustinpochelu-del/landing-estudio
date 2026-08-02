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

## Datos ya cargados

Nombre, teléfono (`+54 280 456-2145` → WhatsApp `5492804562145`),
email `agustinpochelu@gmail.com` y dirección `Thomas 3042`.

## ⚠️ Qué falta / qué revisar antes de publicar

1. **Ciudad y provincia** — la dirección figura solo como "Thomas 3042".
   Buscá los `TODO` en `index.html` (sección `#agenda` y el JSON-LD del `<head>`).
   Sin ciudad, Google no te ubica en las búsquedas locales.
2. **Foto real** — la foto de la sección "Quién te atiende" es de stock (Unsplash),
   igual que la del hero. Lo ideal es una foto tuya y una de tu oficina: guardalas
   en una carpeta `img/` y cambiá el `src`.
3. **Testimonios** — la sección está **comentada** en `index.html` (buscá
   "TESTIMONIOS"). Descomentala cuando tengas testimonios reales de clientes.
   No la publiques con textos inventados.
4. **Barra de confianza** — dice "Sin cargo / 24 h / 100% digital / Matriculado".
   Son promesas, no estadísticas: asegurate de poder cumplirlas o cambialas.
5. **Matrícula** — si querés, agregá tu número de matrícula y el Consejo
   Profesional donde estás inscripto (footer y barra de confianza).
6. **Honorarios y FAQ** — repasá las respuestas de la sección de preguntas
   frecuentes: describen una forma de trabajo (abono mensual, primera consulta
   sin cargo). Ajustalas a la tuya.

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
