# CLAUDE.md

Landing page estática del estudio contable de Agustín Pochelú
(https://www.estudiopochelu.com). HTML + CSS + JS puro, sin build ni dependencias.

## Antes de tocar nada

**Leé [AgenteMP.md](AgenteMP.md).** Es el documento maestro de mantenimiento:
alcance, reglas rojas, zonas protegidas, tono de escritura, checklist de cierre y
trampas conocidas del proyecto. `README.md` tiene el detalle operativo de cada
archivo.

Para delegar un trabajo completo de mantenimiento está el subagente
`@agente-mp` (`.claude/agents/agente-mp.md`), que ya trae esas reglas cargadas.

Leé también `Memoria.md` (privado, fuera de git): son las correcciones y el
contexto que se fue acumulando sesión a sesión.

## Memoria

**Cuando Agustín te corrija, o aparezca contexto nuevo del negocio o del
proyecto, escribilo en `Memoria.md` en el momento** — sin esperar a que te lo
pida. Entrada arriba de todo, con fecha, etiqueta (`corrección` / `decisión` /
`negocio` / `técnico`) y las líneas **Por qué** y **Cómo lo aplico**. El formato
completo está explicado adentro del archivo.

Si ya hay una entrada del mismo tema, actualizala en vez de duplicar. Si una nota
se vuelve una regla permanente del sitio, mudala a `AgenteMP.md`.

## Lo mínimo indispensable

- **No pushees.** Editá y commiteá; el push lo hace Agustín después de revisar.
  Cambios chicos van directo en `main`; los grandes o riesgosos, en rama aparte.
- **Si tocás `styles.css`, `script.js` o `clientes.js`, subí el `?v=`** en
  `index.html` **y** en `clientes.html`. Si no, los visitantes siguen viendo la
  versión vieja.
- **Nunca:** inventar contenido (testimonios, cifras, clientes), poner
  credenciales en el front, publicar honorarios.
- **Pedí aprobación para:** colores de marca e identidad visual, datos
  profesionales (nombre, matrículas, teléfono, email, dirección) y la estructura
  de secciones.
- **Escribí en rioplatense con voseo**, sobrio, sin marketing inflado.

## Correr el sitio

```bash
python -m http.server 5173
```
