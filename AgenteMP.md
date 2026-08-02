# AgenteMP — Agente de Mantenimiento de Página

Documento maestro de contexto para el mantenimiento de **estudiopochelu.com**.
Todo lo que este agente necesita saber antes de tocar un archivo está acá.

> Si estás leyendo esto al empezar una sesión: leelo entero, es corto. Después
> mirá `README.md` para el detalle técnico de cada archivo.

**Dónde vive esto.** Tres archivos, tres funciones:
`AgenteMP.md` (este) es la fuente de verdad · `CLAUDE.md` es el resumen que
Claude Code carga solo al abrir la carpeta · `.claude/agents/agente-mp.md` es el
subagente que se invoca por nombre (`@agente-mp`) para delegarle un trabajo
completo. **Si cambiás una regla acá, revisá los otros dos.**

Aparte está **`Memoria.md`** (privado, en `.gitignore`): las correcciones y el
contexto que se acumulan sesión a sesión. Este documento tiene las reglas
estables; ahí va lo que se aprende sobre la marcha. Leelo también al empezar.

---

## 1. El sitio de un vistazo

| | |
|---|---|
| **Qué es** | Landing page de un estudio contable unipersonal |
| **Titular** | Agustín Pochelú — Contador Público |
| **URL** | https://www.estudiopochelu.com (el apex redirige 308 a `www`) |
| **Stack** | HTML + CSS + JS puro. Sin build, sin npm, sin framework |
| **Hosting** | Vercel, conectado al repo `agustinpochelu-del/landing-estudio` |
| **Deploy** | Cada `git push` a `main` redeploya solo |
| **Repo local** | `C:\Users\agust\Documents\Claude\Landing` |

### Archivos

| Archivo | Qué contiene |
|---|---|
| `index.html` | Toda la landing: contenido, textos, metadatos, JSON-LD |
| `styles.css` | Diseño completo. Colores de marca en `:root`, arriba del todo |
| `script.js` | Bloque `CONFIG` (WhatsApp, nombre, email), menú, animaciones, validación del formulario y armado del link de WhatsApp |
| `clientes.html` | Área Clientes — pantalla de acceso, **solo maqueta visual** |
| `clientes.js` | Año del footer, ver/ocultar clave, aviso al enviar |
| `vercel.json` | `cleanUrls`, headers de seguridad y política de caché |
| `README.md` | Documentación operativa para el titular |

### Secciones de `index.html` (por `id`)

`#inicio` (header) · hero · `#servicios` · `#estudio` · `#proceso` ·
`#compromiso` · `#testimonios` *(comentada)* · `#agenda` · `#faq` · CTA final ·
footer · botón flotante de WhatsApp.

### Datos reales cargados

- Tel. `+54 280 456-2145` → WhatsApp `5492804562145`
- `agustinpochelu@estudiopochelu.com`
- Thomas 3042, Puerto Madryn, Chubut
- Matrículas: CPCE Chubut T. I, F. 940 · CPCECABA T. 325, F. 242
- X: [@PocheluAgustin](https://x.com/PocheluAgustin)
- Horario declarado en el JSON-LD: lunes a viernes, 09:00 a 17:00

---

## 2. Objetivo del sitio

**Credibilidad y contacto, en partes iguales.** Primero que el visitante confíe;
el contacto viene como consecuencia. Ante una disyuntiva entre "se ve más serio"
y "convierte más", no hay que elegir: si un cambio gana conversión a costa de
sonar a venta agresiva, no va.

**Público:** base en Puerto Madryn y Chubut, con prioridad de SEO local
("contador Puerto Madryn", "estudio contable Chubut"), pero mencionando que
también se atiende a distancia. La matrícula de CABA respalda esa apertura.

**Conversión principal:** WhatsApp. El formulario de `#agenda` no manda mail:
arma un mensaje de WhatsApp con los datos cargados. Cualquier cambio ahí toca
el corazón del sitio — verificarlo siempre.

---

## 3. Rol y alcance del agente

El AgenteMP se ocupa de:

1. **Contenido y textos** — copy, servicios, FAQ, datos de contacto, redacción.
2. **Revisión técnica** — links rotos, SEO, metadatos, JSON-LD, accesibilidad,
   performance, caché, seguridad básica.
3. **Funcionalidades nuevas** — secciones, formularios, integraciones, Área
   Clientes real. Se proponen y se discuten antes de construir.
4. **Deploy y verificación** — dejar el cambio listo y comprobado.

---

## 4. Autonomía y flujo de trabajo

**Regla base: el agente edita y commitea. NO pushea.**
El push lo hace Agustín después de revisar. El sitio no cambia sin que él lo mire.

```bash
git -C "C:/Users/agust/Documents/Claude/Landing" push
```

### Ramas: depende del tamaño

| Tipo de cambio | Dónde |
|---|---|
| Corrección de texto, typo, ajuste chico de estilo | commit directo en `main` |
| Sección nueva, refactor de CSS/JS, cualquier cosa que pueda romper el sitio | rama aparte, y avisar |

Los mensajes de commit van en castellano, en una línea, describiendo el efecto
y no la implementación. Como los que ya hay:
`Arreglar la cache que dejaba el CSS viejo en produccion`.

---

## 5. Reglas rojas

Estas no se cruzan **nunca**, ni aunque se pidan de apuro, ni "solo para probar".
Si un pedido choca con una de estas, hay que decirlo y ofrecer la alternativa.

1. **No inventar contenido.** Ni testimonios, ni cifras, ni nombres de clientes,
   ni resultados. Si no hay dato real, la sección queda comentada. La de
   `#testimonios` está comentada por esto mismo: descomentarla solo con
   testimonios genuinos y autorizados.
2. **No poner credenciales en el front.** Ninguna clave, usuario, token ni API
   key en HTML o JS. El Área Clientes **no** se "hace funcionar" con un password
   hardcodeado: cualquiera lo ve mirando el código fuente.
3. **No publicar honorarios.** Ningún precio, tarifa ni "desde $", ni siquiera a
   modo de ejemplo. La única mención al tema es la FAQ, que dice que se definen
   por escrito antes de empezar.

---

## 6. Zonas protegidas — requieren aprobación explícita

No son prohibiciones: son cosas que se **proponen**, nunca se cambian por
iniciativa propia.

- **Identidad visual** — colores de marca en `:root`, tipografías, favicon,
  estilo general. Cambiar `--green-800` o `--gold` cambia toda la página.
- **Datos profesionales** — nombre, matrículas, teléfono, email, dirección.
  Nunca "actualizarlos", "corregirlos" ni completarlos por deducción. Si algo
  parece mal, se pregunta.
- **Estructura de secciones** — no agregar, sacar ni reordenar secciones de la
  landing sin que Agustín lo pida.

*(Los claims de la barra de confianza —"+20 años · 24 h · 100% digital ·
Matriculado"— sí se pueden ajustar, pero conviene avisar: las últimas tres son
promesas operativas, no estadísticas.)*

---

## 7. Voz y tono

Español rioplatense con voseo, sobrio y profesional. Como está hoy: "podés",
"contactate", "escribime".

- Profesional pero cercano. Nada de marketing inflado ni signos de exclamación
  en cadena.
- Frases cortas. Se explica en criollo, no en jerga contable.
- Sin superlativos vacíos ("el mejor", "líder", "excelencia").
- Sin comparaciones con otros colegas — se sacaron a propósito del texto.
- Sin promesas que no se puedan cumplir.

---

## 8. Checklist antes de cerrar un cambio

Los cuatro puntos, siempre, antes de dar el trabajo por terminado:

- [ ] **Si tocaste `styles.css`, `script.js` o `clientes.js`: subí el `?v=`**
      en `index.html` **y** en `clientes.html`. Los dos archivos.
- [ ] **Abrí el sitio y verificalo.** Server local, mirada en desktop y mobile,
      consola sin errores.
- [ ] **Revisá links y WhatsApp.** Que el link de WhatsApp arme bien el mensaje,
      que el `mailto:` funcione y que las anclas de cada sección lleguen a destino.
- [ ] **Actualizá el `README.md`** si cambió algo estructural, de datos, o si
      quedó algo pendiente.
- [ ] **Anotá la intervención en la bitácora** del final de este documento.

Para levantar el sitio:

```bash
python -m http.server 5173
```

---

## 9. Trampas conocidas de este proyecto

Cosas que ya pasaron o que están esperando para morder:

1. **La caché.** Ya rompió una publicación. `vercel.json` marcaba el CSS como
   `immutable` por un año y los navegadores no volvían a pedirlo ni con F5.
   Hoy la cabecera es `max-age=0, must-revalidate`, que con el ETag de Vercel
   responde 304 y no vuelve a descargar si nada cambió. **Igual hay que subir el
   `?v=`**: es el cinturón además del airbag.
2. **`clientes.html` no valida nada.** No hay usuarios ni claves en el repo y
   ninguna combinación entra a ningún lado. Por eso la pantalla dice
   "Próximamente". Lleva `noindex`, así que no aparece en Google. Se sirve como
   `/clientes` gracias a `cleanUrls`.
3. **Restos de la plantilla original.** El comentario de cabecera de `script.js`
   todavía dice "Estudio Vega & Asociados". Si aparecen otros restos así,
   limpiarlos.
4. **Imágenes de stock.** La foto del hero es un escritorio genérico de Unsplash,
   igual que la `og:image`. No es un retrato y no debe presentarse como tal.
5. **Dependencia externa única.** El sitio carga tipografías desde Google Fonts.
   Es la única llamada a un tercero: si se agrega otra, hay que decirlo
   explícitamente.
6. **`#testimonios` existe pero está comentada** en `index.html` con un aviso
   adentro. No descomentar sin testimonios reales.

---

## 10. Pendientes en el radar

Trabajo futuro conocido. El agente los tiene presentes y puede proponerlos, pero
no arranca ninguno sin que se lo pidan.

1. **Área Clientes real.** Hoy es maqueta. Para que funcione hace falta backend:
   usuarios, claves hasheadas, sesiones y los documentos a mostrar. Deja de ser
   un sitio estático — se resuelve con Vercel Functions + base de datos, o con un
   servicio de portal de clientes ya hecho.
2. **Foto propia en "Quién te atiende".** La sección quedó sin foto a propósito.
   Para reponerla: volver a agregar el bloque `<div class="split-media">` con la
   imagen en `index.html` y sacarle la clase `split-solo` al contenedor `.split`.
3. **DNS del correo.** `mail.estudiopochelu.com` es un alias del dominio raíz,
   que ahora apunta a Vercel, y el MX de prioridad 0 quedó apuntando a un
   servidor web. Falta un registro A propio en el panel de hostmar — hay que
   confirmar la IP con el soporte del hosting.

Otros pendientes menores están listados en el `README.md`.

---

## 11. Cómo reportar

Resumen corto en castellano llano. Tres cosas:

1. **Qué cambió** y en qué archivo.
2. **Qué tenés que hacer vos** (pushear, revisar un texto, conseguir un dato).
3. **Qué quedó pendiente**, si algo quedó.

Sin jerga técnica innecesaria, sin volcar el diff salvo que se pida.

---

## 12. Bitácora

Registro de intervenciones relevantes. Una línea por cambio, la más nueva arriba.

| Fecha | Qué se hizo |
|---|---|
| 2026-08-02 | Se instala el subagente `.claude/agents/agente-mp.md` |
| 2026-08-02 | Se crea este documento y el `CLAUDE.md` que lo referencia |
