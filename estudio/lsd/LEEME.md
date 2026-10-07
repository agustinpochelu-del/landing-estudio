# Libro de Sueldos Digital — copia publicada

**Esto es una copia.** El proyecto vive en `F:\OneDrive\ESTUDIO\desarrollos\LSD`,
y ahí está el `README.md` completo con el formato de los registros de ARCA, los
criterios de cálculo y las trampas conocidas.

Se publica en <https://www.estudiopochelu.com/estudio/lsd/armador>, detrás de la
clave del Área del Estudio.

## La regla que manda acá

**El repositorio de la landing es público.** La clave del Área del Estudio
protege la dirección web, no el repositorio: lo que se commitea acá lo puede
leer cualquiera en GitHub. Y aunque el repositorio fuera privado, lo que se
publica se sirve en una dirección de internet donde la única puerta es esa
clave, que —como dice el propio `middleware.js`— no tiene freno a la fuerza
bruta.

De ahí sale todo lo demás.

## El padrón va cifrado

`Empleados <CUIT>.csv` lleva **CUIL, nombre y CBU** de los empleados de cada
cliente. No se publica en claro: se publica como `Empleados <CUIT>.csv.enc`.

- Se cifra con AES-GCM de 256 bits, con la clave derivada de una frase por
  PBKDF2-SHA256 y 250.000 vueltas.
- En el servidor, en el repositorio y en cualquier copia, el archivo es ruido.
- Se descifra **en el navegador**, con una frase que no viaja a ningún lado y
  que no está escrita en ninguna parte del proyecto.
- La frase se escribe una vez por navegador: después queda guardado el padrón ya
  descifrado y no se vuelve a preguntar.

Una puerta protege el acceso; el cifrado protege el contenido. Si la clave del
Área se filtra, del padrón no hay nada que leer.

**Para preparar el archivo** está `/estudio/lsd/cifrar`: se suelta el CSV, se
escribe la frase y baja el `.enc`. El paso 2 de esa misma pantalla lo abre de
nuevo para confirmar que quedó bien antes de publicarlo.

**Si la frase se pierde, el archivo no se recupera.** El CSV sin cifrar en la
carpeta de la empresa sigue siendo el respaldo.

## Qué se publica y qué no

| Qué | Va | Por qué |
|---|---|---|
| Los `.js`, `.html` y `.css` | **Sí** | Es la aplicación. |
| `reservorios/indice.json` | **Sí** | Nombres de empresa, conceptos que no se pasan, alícuotas y las dos correcciones. Sin datos personales. |
| `reservorios/Conceptos <CUIT>.csv` | **Sí** | Código, descripción y las quince marcas de subsistema. Ni un CUIL, ni un CBU. |
| `reservorios/Empleados <CUIT>.csv.enc` | **Sí** | Cifrado. Ver arriba. |
| `reservorios/Empleados <CUIT>.csv` | **NO** | En claro, nunca. |
| `pruebas.html` y `pruebas.js` | **NO** | Los casos de prueba usan CUIL reales. Además es herramienta de desarrollo. |
| `referencia/` | **NO** | Los PDF y planillas de ARCA. No hacen falta para correr. |
| `herramientas/servidor.py` | **NO** | Sirve para trabajar en la máquina. |

Para esta carpeta el `.gitignore` de la landing **da vuelta la regla**: bloquea
todo y destapa nada más que `indice.json`, `Conceptos *.csv` y `*.csv.enc`. Lo
que no esté nombrado ahí no sube, se llame como se llame.

Es la única carpeta del repositorio donde conviven archivos que pueden subir con
archivos que no pueden subir nunca, y con el mismo nombre de base. La regla
anterior —bloquear `*.csv` y destapar los de conceptos uno por uno— dejaba pasar
un `Empleados <CUIT>.csv.bak`, que es el padrón entero en claro. Se descubrió
probándola al revés, no leyéndola.

## El mismo índice sirve en los dos lados

`indice.json` nombra siempre el CSV: `"empleados": "Empleados 30644965593.csv"`.

La aplicación pide ese archivo y, si no está, prueba `<nombre>.enc`. Así en la
computadora del estudio —donde está el CSV en claro— abre sin preguntar nada, y
en el sitio publicado —donde está solo el cifrado— pide la frase. **Un índice
solo**, sin dos versiones que puedan dejar de coincidir.

## Antes de commitear, contá

```bash
grep -rhoE "\b(20|23|24|27|30|33)[0-9]{9}\b" estudio/lsd/ | sort | uniq -c | sort -rn
```

Lo esperable son cuatro números, y nada más: `30123456789`, el ejemplo del
campo CUIT, y los **CUIT de los tres empleadores** —Nautical `30644965593`,
Martín Prado `20227823357`, Viviana Barbano `27134231780`—, que viven en
`indice.json` porque es el índice el que nombra las empresas. El CUIT es un
dato público y Agustín lo dio por bueno; el **CUIL** de un trabajador no, y por
eso el padrón sube cifrado. Cualquier otro número de once dígitos hay que
mirarlo antes de subir —empezando por si es un CUIL—.

## Por qué la dirección termina en `/armador`

El sitio se publica con `trailingSlash: false`, así que Vercel sirve
`/estudio/lsd` **sin barra final**, y ahí una ruta relativa como `estilos.css`
resuelve contra `/estudio/`: no carga ni el CSS ni los JS y la página aparece en
crudo.

Por eso la aplicación se llama **`armador.html`** y no `index.html`. Vale igual
para `/estudio/lsd/recibos`, `/estudio/lsd/credito` y `/estudio/lsd/cifrar`.

**No pongas un `index.html` acá**, ni siquiera uno que redirija: su propia ruta
relativa cae en la misma trampa.

## La caché

`vercel.json` sirve esta carpeta con `no-store`. No es manía: en el proyecto de
origen la caché del navegador hizo que se generaran **cuatro archivos con código
viejo** mientras el arreglo ya estaba escrito, y a uno lo rechazó ARCA. El sello
de versión, arriba de cada pantalla, le pregunta al servidor qué versión hay y
avisa en rojo si no coincide con la que se está ejecutando.

## Para actualizar

Desde la raíz de la landing:

```bash
for f in armador.html recibos.html credito.html cifrar.html estilos.css registros.js version.js tablas.js perfiles.js topes.js xlsx.js sueldos.js reservorios.js convenios.js empresa.js liquidador.js recibos.js recibo-origen.js credito.js credito-pagina.js cifrado.js cifrar-pagina.js app.js; do cp "F:/OneDrive/ESTUDIO/desarrollos/LSD/$f" "estudio/lsd/$f"; done
cp "F:/OneDrive/ESTUDIO/desarrollos/LSD/reservorios/indice.json" estudio/lsd/reservorios/indice.json
```

Después hay que **sacar el link a los controles**, que en el proyecto de origen
apunta a `pruebas.html` y acá no existe. El link y su `·` separador están en
líneas distintas, así que `sed` —que trabaja línea por línea— deja el `·`
colgando y el link adentro:

```bash
python "F:/OneDrive/ESTUDIO/desarrollos/LSD/herramientas/sacar-link-de-controles.py" estudio/lsd
```

Y se comprueba que no quedó ninguno, que es el control que importa:

```bash
grep -rn "pruebas.html" estudio/lsd/*.html
```

No tiene que devolver nada.

Va como script y no como una línea suelta por dos veces que ya salió mal el
07/10/2026. El `sed -i -E 's/\s*·\s*<a href="pruebas\.html">Controles<\/a>//'`
que había acá funcionó mientras los tres links iban en un renglón, y cuando el
`·` quedó en la línea de arriba dejó el link publicado en las tres pantallas sin
que nada se quejara. El `python -c` que lo reemplazó abría cada archivo con `'w'`
**antes** de leerlo: lo truncaba y escribía el vacío que acababa de leer. Las
cuatro pantallas quedaron en cero bytes y no avisó nadie.

El `indice.json` va en la misma tanda y es fácil de olvidar porque no es código:
lleva los conceptos que no se pasan al libro, las alícuotas de aportes y los que
todavía no están dados de alta en ARCA. Si queda viejo, la copia publicada arma
el archivo con otros criterios que la de acá.

Y correr el conteo de identificadores de más arriba antes de commitear.

Los `?v=` de los HTML son propios de esta aplicación y no tienen nada que ver
con los de la landing: se suben en el proyecto de origen.
