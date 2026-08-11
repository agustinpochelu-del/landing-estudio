# Importador de Libro de IVA Digital — copia publicada

**Esto es una copia.** El proyecto vive en
`F:\OneDrive\ESTUDIO\desarrollos\LIVA D`, y ahí está el `README.md` completo con
las decisiones contables, los diseños de registro de ARCA y las trampas conocidas.

Los archivos de esta carpeta se publican en
<https://www.estudiopochelu.com/estudio/libro-iva>, detrás de la clave del Área
del Estudio.

## Para actualizar

Copiá los ocho archivos desde la carpeta del proyecto:

```bash
cd "C:/Users/agust/Documents/Claude/Landing"
```

```bash
for f in index.html estilos.css tablas.js xlsx.js libro.js app.js pruebas.html pruebas.js; do cp "F:/OneDrive/ESTUDIO/desarrollos/LIVA D/$f" "estudio/libro-iva/$f"; done
```

Los `?v=` de `index.html` y `pruebas.html` son propios de esta aplicación y no
tienen nada que ver con los de la landing: se suben en el proyecto de origen.

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
