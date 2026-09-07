# Estados contables RT 54 — copia publicada

**Esto es una copia.** El proyecto vive en
`F:\OneDrive\ESTUDIO\desarrollos\Balances`, y ahí está el `CLAUDE.md` con las
reglas y `docs/` con el contrato de salida, el caso testigo y cómo está armada
la aplicación.

Se publica en <https://www.estudiopochelu.com/estudio/balances/app/index>,
detrás de la clave del Área del Estudio.

## Por qué la dirección termina en `/app/index`

El sitio se publica con `trailingSlash: false`. La aplicación vive en `app/` y
busca el esquema en `../esquema/`, así que la carpeta base tiene que ser la de
`app/`. En `/estudio/balances` —sin barra final— las rutas relativas resolverían
contra `/estudio/` y no encontraría ni el plan de exposición.

En `vercel.json` hay una redirección de `/estudio/balances` a esta dirección,
para que escribirla corta también funcione. El link de `estudio.html` apunta
igual a la larga: si la redirección se rompe, el acceso sigue andando.

**No pongas un `index.html` en esta carpeta**, ni siquiera uno que redirija: su
propia ruta relativa cae en la misma trampa.

## Qué se publica y qué no

La lista está en `herramientas/publicar.py`, en el proyecto. Es una lista
explícita, no una carpeta entera: lo que no está en la lista no se publica.

**Nunca se publican:**

| Qué | Por qué |
| --- | --- |
| `datos/` | Son los datos contables de los clientes |
| `plantilla/importacion-*.xlsx` | Son ejercicios reales de clientes |
| `herramientas/` | El servidor local y la clave de las firmas |
| `firmas.html`, `firmas.js` | Las firmas las entrega el servidor local contra la clave; en línea no hay servidor |

## Cómo funciona sin la carpeta de datos

En línea no hay `datos/entes/`. Se entra, se sube el Excel del ejercicio en
«Importar datos», se aprieta **Ver el balance**, y el paquete queda **en el
navegador** —`app/bolsa.js`—. De ahí salen el tablero, los libros y el informe.
Nada se sube a ningún servidor.

Los botones que necesitan el servidor local —guardar en la carpeta del ente,
aplicar las firmas, los ejemplos de planilla— no aparecen: la aplicación pregunta
primero si el servidor contesta.

## Para actualizar

Desde la carpeta del proyecto:

```bash
python herramientas/publicar.py
```

Copia lo que cambió, avisa si sobra algo en el destino, y no commitea ni sube
nada: eso se mira con `git status` y se publica a mano.

Los `?v=` de los HTML son propios de esta aplicación y se suben en el proyecto de
origen, no acá.
