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

1. **Foto real** — la foto de la sección "Quién te atiende" es de stock (Unsplash),
   igual que la del hero. Lo ideal es una foto tuya y una de tu oficina: guardalas
   en una carpeta `img/` y cambiá el `src`.
2. **Testimonios** — la sección está **comentada** en `index.html` (buscá
   "TESTIMONIOS"). Descomentala cuando tengas testimonios reales de clientes.
   No la publiques con textos inventados.
3. **Barra de confianza** — dice "Sin cargo / 24 h / 100% digital / Matriculado".
   Son promesas, no estadísticas: asegurate de poder cumplirlas o cambialas.
4. **Honorarios y FAQ** — repasá las respuestas de la sección de preguntas
   frecuentes: describen una forma de trabajo (abono mensual, primera consulta
   sin cargo). Ajustalas a la tuya.
5. **DNS del correo** — `mail.estudiopochelu.com` es un alias del dominio raíz, que
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
