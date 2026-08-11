# Importador de Libro de IVA Digital — copia publicada

**Esto es una copia.** El proyecto vive en
`F:\OneDrive\ESTUDIO\desarrollos\LIVA D`, y ahí está el `README.md` completo con
las decisiones contables, los diseños de registro de ARCA y las trampas conocidas.

Los archivos de esta carpeta se publican en
<https://www.estudiopochelu.com/estudio/libro-iva/importador>, detrás de la clave
del Área del Estudio.

## Por qué la dirección termina en `/importador`

El sitio se publica con `trailingSlash: false`, así que Vercel sirve
`/estudio/libro-iva` **sin barra final**. En esa dirección, una ruta relativa
como `estilos.css` resuelve contra `/estudio/`, no contra `/estudio/libro-iva/`:
no carga ni el CSS ni los JS y la página aparece en crudo.

Por eso la aplicación se llama **`importador.html`** y no `index.html`. Su
dirección es `/estudio/libro-iva/importador`, que sí tiene a la carpeta de la
aplicación como directorio base.

**No pongas un `index.html` acá**, ni siquiera uno que redirija: su propia ruta
relativa cae en la misma trampa. Y si cambiás el link de `estudio.html`, tiene
que seguir apuntando a `/estudio/libro-iva/importador`.

## Para actualizar

Copiá los ocho archivos desde la carpeta del proyecto:

```bash
cd "C:/Users/agust/Documents/Claude/Landing"
```

```bash
for f in importador.html estilos.css tablas.js xlsx.js libro.js app.js pruebas.html pruebas.js; do cp "F:/OneDrive/ESTUDIO/desarrollos/LIVA D/$f" "estudio/libro-iva/$f"; done
```

Los `?v=` de `importador.html` y `pruebas.html` son propios de esta aplicación y
no tienen nada que ver con los de la landing: se suben en el proyecto de origen.

Para probar el sitio **como se publica** —con `cleanUrls` y sin barra final—, no
alcanza con `python -m http.server`: ese redirige los directorios agregando la
barra, que es justo lo contrario de lo que hace Vercel, y esconde este tipo de
error. Hay que abrir la dirección exacta `/estudio/libro-iva/importador`.

## Lo que no se copia

- **`Facturas de compras.xlsx`** y cualquier otra planilla. Tienen CUIT, razones
  sociales e importes de clientes. El `.gitignore` del repo bloquea `.xlsx`,
  `.xls` y `.csv` para que no se cuelen por descuido.
- Los PDF de los anexos de ARCA, que son documentación de trabajo.

Por eso `pruebas.html`, acá, corre solo las verificaciones de cálculo y avisa que
la corrida sobre la planilla real no se ejecutó. Para correr todo hay que abrir
la página desde la carpeta del proyecto.

## Cuidado con el acceso

Esta carpeta queda protegida por `middleware.js`, cuyo `matcher` incluye
`/estudio/:path*`. Si alguien lo acota de vuelta a `/estudio`, **la aplicación
queda abierta a cualquiera sin avisar nada**. Después de cada deploy que toque el
middleware, abrí <https://www.estudiopochelu.com/estudio/libro-iva> en una
ventana de incógnito y confirmá que pide usuario y contraseña.
