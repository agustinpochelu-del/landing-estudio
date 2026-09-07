/* El papel de trabajo del estudio, leído como si fuera el modelo.

   El archivo de importación no es el único formato que entra. El papel de
   trabajo con el que se arma un balance en el estudio —la carátula, el balance
   del ejercicio anterior, los libros de IVA, las planillas del fisco— tiene sus
   propias hojas y sus propios nombres de columna, y no hay ninguna razón para
   pedirle a nadie que lo copie a otro lado.

   Así que acá no se importa nada: se **traduce**. Este módulo recibe el libro
   tal como lo leyó `xlsx.js` y devuelve otro libro con la forma exacta del
   modelo. `importar.js` no se entera de la diferencia.

   Lo que el papel de trabajo no dice —a qué línea de la RT 54 va cada cuenta—
   sale del catálogo de cuentas del estudio. Ver `esquema/catalogo-cuentas.json`. */

(function (global) {
  "use strict";

  const clave = (s) => String(s === null || s === undefined ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

  const texto = (v) => (v === null || v === undefined || v === "" ? null : String(v).trim());

  /* ---------- reconocer el formato ---------- */

  /* El papel de trabajo se reconoce por sus hojas propias. No alcanza con que
     tenga `Ventas` y `Compras`: eso también lo tiene el modelo. */
  function esPapelDeTrabajo(libro) {
    const hay = {};
    libro.hojas.forEach((h) => { hay[clave(h.nombre)] = true; });
    return !!(hay["auxiliar"] && hay["datos caratulas"]) && !hay["plan de cuentas"];
  }

  function hoja(libro, nombre) {
    const k = clave(nombre);
    return libro.hojas.find((h) => clave(h.nombre) === k) || null;
  }

  const filas = (h) => (h ? h.filas : []);

  /* ---------- utilidades de lectura ---------- */

  /* Las exportaciones de ARCA traen dos o tres renglones de título antes del
     encabezado: se busca la fila donde aparece una columna conocida. */
  function conEncabezado(h, columna) {
    const f = filas(h);
    const k = clave(columna);
    for (let i = 0; i < f.length; i++) {
      if ((f[i] || []).some((c) => clave(c) === k)) {
        return { cab: f[i].map((c) => clave(c)), cuerpo: f.slice(i + 1) };
      }
    }
    return null;
  }

  /* Devuelve las filas como objetos, con las claves normalizadas. */
  function registros(h, columnaAncla) {
    const t = columnaAncla ? conEncabezado(h, columnaAncla) : null;
    const f = filas(h);
    const cab = t ? t.cab : (f[0] || []).map((c) => clave(c));
    const cuerpo = t ? t.cuerpo : f.slice(1);
    return cuerpo.filter((fila) => fila && fila.some((c) => c !== null && c !== ""))
      .map((fila) => {
        const o = {};
        /* Si dos tablas comparten la fila de encabezados —pasa cuando una se
           pone al lado de la otra— el mismo nombre aparece dos veces. Manda la
           primera, que es la tabla que la traducción está leyendo; la de la
           derecha se lee aparte, por posición. */
        cab.forEach((c, j) => { if (c && !(c in o)) o[c] = fila[j]; });
        return o;
      });
  }

  const dato = (r, nombres) => {
    for (let i = 0; i < nombres.length; i++) {
      const v = r[clave(nombres[i])];
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                 "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function iso(v) {
    if (v === null || v === undefined || v === "") return null;
    /* xlsx.js arma las fechas en UTC: hay que leerlas en UTC. Con los getters
       locales, en una zona al oeste de Greenwich toda fecha se corre un día. */
    if (v instanceof Date) {
      return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-` +
             `${String(v.getUTCDate()).padStart(2, "0")}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    // "22 de diciembre de 2020"
    const p = s.toLowerCase().replace(/ del /g, " de ").split(" de ");
    if (p.length === 3) {
      const mes = MESES.indexOf(p[1].trim());
      if (mes >= 0) {
        return `${p[2].trim()}-${String(mes + 1).padStart(2, "0")}-` +
               `${String(Number(p[0])).padStart(2, "0")}`;
      }
    }
    return null;
  }

  /* De vuelta a dd/mm/aaaa, que es como el modelo espera las fechas. */
  const corta = (f) => (f ? `${f.slice(8)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");

  function menosUnAnio(f) {
    if (!f) return "";
    return corta(`${Number(f.slice(0, 4)) - 1}${f.slice(4)}`);
  }

  function diaAnterior(f) {
    if (!f) return "";
    const d = new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8)));
    d.setUTCDate(d.getUTCDate() - 1);
    return `${String(d.getUTCDate()).padStart(2, "0")}/` +
           `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }

  /* ---------- la carátula: hojas Ente y Ejercicio ---------- */

  /* Las etiquetas de la carátula se buscan normalizadas —sin acentos ni
     mayúsculas—, pero algunas también son un dato que se imprime: el organismo
     de inscripción sale de la etiqueta, no del valor. Por eso se guarda además
     el texto tal como está escrito. */
  function caratula(libro) {
    const d = {}, etiquetas = {};
    filas(hoja(libro, "Datos Caratulas")).forEach((f) => {
      const etiqueta = texto(f[1]);
      if (!etiqueta) return;
      const k = clave(etiqueta).replace(/:$/, "").trim();
      d[k] = f[2];
      etiquetas[k] = String(etiqueta).replace(/:$/, "").trim();
    });
    d._etiquetas = etiquetas;
    return d;
  }

  /* «INSPECCIÓN GENERAL DE JUSTICIA» -> «Inspección General de Justicia». Las
     preposiciones y los artículos van en minúscula: es un nombre propio, no un
     título de columna. */
  const MENORES = ["de", "del", "la", "las", "el", "los", "y", "e", "en", "a"];

  function comoNombre(s) {
    return String(s || "").toLowerCase().split(/\s+/).filter(Boolean)
      .map((x, i) => (i > 0 && MENORES.indexOf(x) >= 0
        ? x : x.charAt(0).toUpperCase() + x.slice(1)))
      .join(" ");
  }

  /* La carátula del papel trae la inscripción como una sola frase, con los
     números en cifras entre paréntesis. Se sacan de ahí y la frase entera queda
     en el campo de origen. */
  function inscripcion(frase) {
    const s = String(frase || "");
    const cifras = (s.match(/\(([\d.]+)\)/g) || []).map((x) => x.replace(/[()]/g, ""));
    const libro = s.match(/Libro\s+([IVXL]+)/i);
    const tomo = s.match(/Tomo\s+(.+?)\s*$/i);
    return {
      numero: cifras[0] || "",
      folio: cifras[1] || "",
      libro: libro ? libro[1] : "",
      tomo: tomo ? tomo[1].trim() : "",
    };
  }

  /* De qué tamaño es el ente para la RT 54. Tiene su propia celda en la carátula
     y su propio parámetro de ventas, el de la FACPCE: **no es la categoría
     MiPyME**, que la fija la SEPyME con otra escala y sirve para otra cosa —el
     cómputo del impuesto sobre débitos y créditos—. Que en una empresa las dos
     coincidan no las hace la misma. */
  const CLASIFICACION_FACPCE = {
    "pequena": "pequena",
    "pequena empresa": "pequena",
    "ente pequeno": "pequena",
    "mediana": "mediana",
    "mediana empresa": "mediana",
    "ente mediano": "mediana",
    "resto": "resto",
    "grande": "resto",
    "no pequena ni mediana": "resto",
  };

  const categoriaFACPCE = (c) =>
    clave(dato(c, ["categoria tamano empresa facpce", "categoria facpce",
                   "tamano de la empresa", "clasificacion facpce"]) || "");

  function hojaEnte(c) {
    const claveInscripcion = Object.keys(c).find((k) => k.indexOf("inscripcion en") === 0);
    const i = inscripcion(claveInscripcion ? c[claveInscripcion] : "");
    // el organismo sale de la etiqueta, y de la escrita: la normalizada no tiene acentos
    const organismo = claveInscripcion
      ? String((c._etiquetas || {})[claveInscripcion] || claveInscripcion)
        .replace(/^inscripci[oó]n en\s*/i, "").trim()
      : "";
    const firmante = String(c["firmante por la empresa"] || "").split("/").map((x) => x.trim());
    const capital = dato(c, ["capital social"]);
    return [
      ["Campo", "Valor"],
      ["Denominación", texto(c["denominacion"])],
      ["CUIT", (texto(c["cuit"]) || "").replace(/\s/g, "")],
      ["Plan de exposición", "estudio-cfl"],
      /* Sale de la celda de la carátula. Si no está o no se reconoce queda vacía,
         y el importador avisa antes de darla por pequeña. */
      ["Clasificación", CLASIFICACION_FACPCE[categoriaFACPCE(c)] || ""],
      ["Actividad principal", texto(c["actividad principal"])],
      ["Domicilio legal", texto(c["domicilio legal"])],
      ["Domicilio fiscal", texto(c["domicilio fiscal"])],
      // el organismo viene en la propia etiqueta de la carátula
      ["Organismo de inscripción", comoNombre(organismo)],
      ["Número de inscripción", i.numero],
      ["Folio", i.folio],
      ["Libro", i.libro],
      ["Tomo", i.tomo],
      // la frase entera, tal como está escrita: de ahí salieron los cuatro datos
      ["Origen de la inscripción", claveInscripcion ? texto(c[claveInscripcion]) : ""],
      ["Fecha de inscripción", corta(iso(c["fecha inscripcion"]))],
      ["Participaciones", dato(c, ["cantidad de acciones"])],
      ["Valor nominal", dato(c, ["valor de la accion"])],
      ["Capital suscripto", capital],
      ["Capital integrado", capital],
      ["Firmante", firmante[0] || ""],
      ["Cargo del firmante", firmante[1] || ""],
      /* La categorización MiPyME decide cuánto del impuesto sobre los débitos y
         créditos se computa a cuenta de ganancias. Sin certificado vigente no
         hay categoría que valga: se aplica el régimen general. */
      ["Certificado MiPyME vigente",
       dato(c, ["categorizacion mypyme", "categorizacion mipyme",
                "certificado mipyme vigente"])],
      ["Categoría MiPyME",
       texto(dato(c, ["catagoria mipyme", "categoria mipyme"]))],
      ["Sector MiPyME", texto(dato(c, ["sector mipyme", "sector"]))],
      /* La fecha del trámite o de la renovación del certificado decide qué tabla
         de topes de venta corresponde: la SEPyME los actualiza una vez al año. */
      ["Fecha del certificado MiPyME",
       corta(iso(dato(c, ["fecha certificado mipyme", "fecha del certificado mipyme",
                          "vigencia certificado mipyme"])))],
    ];
  }

  function hojaEjercicio(c) {
    const inicio = iso(c["inicio de ejercicio"]);
    const cierre = iso(c["cierre ejercicio"]);
    return [
      ["Campo", "Valor"],
      ["Número de ejercicio", dato(c, ["ejercicio"])],
      ["Inicio", corta(inicio)],
      ["Cierre", corta(cierre)],
      // el papel no los trae: el ejercicio anterior termina el día antes
      ["Inicio anterior", menosUnAnio(inicio)],
      ["Cierre anterior", diaAnterior(inicio)],
      /* Dónde y cuándo se firma el informe del auditor. No es la fecha de
         cierre: el informe se firma después, y esa fecha es la que corta el
         período de los hechos posteriores. */
      ["Lugar de firma del informe",
       texto(dato(c, ["lugar de firma de auditoria", "lugar de firma del informe",
                      "lugar de firma", "lugar de la firma"]))],
      ["Fecha del informe",
       corta(iso(dato(c, ["fecha de informe de auditoria", "fecha del informe de auditoria",
                          "fecha del informe", "fecha de firma"])))],
      /* Los honorarios del directorio se deducen en el ejercicio sólo si la
         asamblea los asignó individualmente antes del vencimiento. */
      ["Honorarios asignados por asamblea",
       dato(c, ["asignacion de honorarios en el ejercicio",
                "honorarios asignados por asamblea", "honorarios asignados",
                "asamblea de honorarios"])],
      /* El tipo de cambio al cierre. No entra en ningún estado —las operaciones
         ya están convertidas cuando se registran— pero es el dato con el que se
         expresa en moneda extranjera lo que la nota tenga que expresar, y queda
         asentado de dónde salió. */
      ["Cotización del dólar al cierre",
       dato(c, ["cotizacion dolar al cierre", "cotizacion del dolar al cierre",
                "tipo de cambio al cierre", "dolar al cierre"])],
    ];
  }

  /* ---------- el plan de cuentas ---------- */

  /* La tabla `Cuentas` de la hoja auxiliar dice el rubro, el subrubro y la
     clasificación del papel de trabajo, más las subcuentas. La línea de la
     RT 54 no está ahí: sale del catálogo por nombre de cuenta, y si no está,
     de la equivalencia por rubro. */
  /* El slug del ente, para poder ir a buscar su propio plan de cuentas antes de
     recurrir al catálogo del estudio. */
  function slugDe(libro) {
    const c = caratula(libro);
    const d = texto(c["denominacion"]);
    if (!d) return null;
    return d.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /* El papel del estudio ya clasifica cada cuenta por su naturaleza: la columna
     `Rubro` dice activo, pasivo, patrimonio o resultado, y `SubR` si es corriente
     o no, positivo o negativo. Esa es la jerarquía del plan y **no se deduce del
     renglón de exposición**: `RECPAM +` y `RECPAM −` van al mismo renglón del
     estado de resultados y son de naturaleza opuesta. */
  const sinNumero = (x) => clave(x).replace(/^\d+\s*-\s*/, "").trim();

  function naturaleza(rubro, subrubro) {
    const r = sinNumero(rubro), sr = sinNumero(subrubro);
    if (r === "activo") return sr === "no corriente" ? "AnC" : "AC";
    if (r === "pasivo") return sr === "no corriente" ? "PnC" : "PC";
    if (r === "pn" || r === "patrimonio neto" || r === "patrimonio") return "PN";
    if (r === "resultado" || r === "resultados") return sr === "negativos" ? "R−" : "R+";
    return "";
  }

  function planDeCuentas(libro, catalogo, gastos, propio) {
    /* El plan de la propia empresa manda; el catálogo del estudio sólo completa
       lo que el ente no define. Nunca al revés: una clasificación que ya se tomó
       para esta empresa no la pisa el catálogo ni el plan de otra.

       Hace falta combinar y no elegir uno: el mapeo del ente no guarda los roles
       —esos viven en el ejercicio— así que si se reemplazara entero se perderían. */
    const míos = (propio && propio.cuentas) || {};
    const delEstudio = catalogo.cuentas || {};
    const deDonde = (nombre) => {
      const a = delEstudio[nombre], b = míos[nombre];
      if (!a && !b) return null;
      return Object.assign({}, a || {}, b || {});
    };

    const eq = (r) => (catalogo.equivalencias || []).find((x) =>
      clave(x.rubro) === clave(r.rubro) && clave(x.subrubro) === clave(r.subrubro) &&
      clave(x.clasificacion) === clave(r.clasificacion));

    const cab = ["Cuenta", "Suma en", "Rol", "Línea de exposición", "Concepto en la nota",
                 "Columna de gasto", "Rubro de anexo", "Campo de anexo",
                 "Tasa de amortización", "Amortización acumulada",
                 "No monetaria", "Ajuste impositivo", "Se asienta", "Naturaleza",
                 "Previsional"];
    const filasPlan = [cab];
    const sinClasificar = [], desdeRubro = [], sinMarcar = [];
    const vistas = {};

    /* Las casillas de verificación vienen como booleanos, pero también pueden
       llegar escritas a mano. Vacío es vacío: no se toma por «falso». */
    function casilla(v) {
      if (v === true || v === false) return v;
      if (v === null || v === undefined || v === "") return null;
      const t = clave(v);
      if (["verdadero", "true", "si", "sí", "x", "1", "v"].indexOf(t) >= 0) return true;
      if (["falso", "false", "no", "0", "f"].indexOf(t) >= 0) return false;
      return null;
    }

    /* Las columnas fijas de la tabla `Cuentas` están donde están, pero las que
       se fueron agregando después se buscan por su nombre: así se pueden poner
       al final, en cualquier orden, sin correr las de siempre. */
    const filasAux = filas(hoja(libro, "auxiliar"));
    const cabAux = (filasAux[0] || []).map((x) => clave(x));
    const col = (...nombres) => {
      for (const n of nombres) {
        const i = cabAux.indexOf(clave(n));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iTasa = col("tasa", "tasa de amortizacion", "amortizacion", "amortiza al");
    const iAjuste = col("axi impositivo", "ajuste impositivo", "computable",
                        "computable impositivo");
    /* Cuál de las deudas laborales es deuda con el SIPA. Hace falta para el
       apartado a) del informe sobre otros requerimientos legales, que declara
       los aportes y contribuciones previsionales y no el sueldo a pagar. */
    const iPrevisional = col("previsional", "deuda previsional", "sipa",
                             "aportes y contribuciones");
    const dame = (f, i) => (i >= 0 ? f[i] : null);

    filasAux.slice(1).forEach((f) => {
      const r = { rubro: texto(f[4]), subrubro: texto(f[5]), clasificacion: texto(f[6]) };
      const cuenta = texto(f[7]);
      const subcuenta = texto(f[8]);
      if (!cuenta) return;

      /* El papel marca la cuenta como monetaria; el modelo pregunta al revés,
         porque lo que importa es qué se ajusta. Una casilla vacía no es lo mismo
         que un «falso»: sin marca, no se sabe, y se avisa. */
      const monetaria = casilla(f[9]);
      const noMonetaria = monetaria === null ? "" : (monetaria ? "" : "sí");
      const tasaCruda = dame(f, iTasa);
      const tasa = (tasaCruda === null || tasaCruda === undefined || tasaCruda === "")
        ? "" : tasaCruda;
      /* La columna `AXI Impositivo` del papel es una casilla, y pregunta al
         revés: tildada quiere decir que la cuenta **entra** en el ajuste del
         Título VI. El modelo guarda la clasificación escrita, y guarda las dos
         —«computable» y «no computable»—, porque una cuenta sin marcar no es lo
         mismo que una cuenta que el profesional decidió dejar adentro. */
      const marcaAjuste = casilla(dame(f, iAjuste));
      const ajusteImpositivo = marcaAjuste === null
        ? (texto(dame(f, iAjuste)) || "")
        : (marcaAjuste ? "computable" : "no computable");
      const previsional = casilla(dame(f, iPrevisional)) === true ? "sí" : "";
      const seAsienta = casilla(f[10]);
      if (monetaria === null) sinMarcar.push(subcuenta || cuenta);

      const poner = (nombre, sumaEn) => {
        if (vistas[nombre]) return;
        vistas[nombre] = true;
        if (sumaEn) {
          filasPlan.push([nombre, sumaEn, "", "", "", "", "", "", tasa, "",
                          noMonetaria, ajusteImpositivo,
                          seAsienta === false ? "no" : "",
                          naturaleza(r.rubro, r.subrubro), previsional]);
          return;
        }
        /* La tasa de amortización y la clasificación impositiva son de la
           cuenta, no del rubro: las declara el plan de la empresa. Sin tasa no
           hay asiento de amortizaciones, y eso el importador lo tiene que decir
           en vez de emitir un balance sin amortizar. */
        const marcas = [tasa, "", noMonetaria, ajusteImpositivo,
                        seAsienta === false ? "no" : "",
                        naturaleza(r.rubro, r.subrubro), previsional];
        const c = deDonde(nombre);
        if (c) {
          /* La marca de deuda previsional también la puede traer el catálogo del
             estudio: es una propiedad de la cuenta, no del ejercicio, y así una
             empresa con empleados no tiene que marcarla de nuevo cada año. */
          const suyas = marcas.slice();
          if (c.previsional) suyas[6] = "sí";
          filasPlan.push([nombre, "", c.rol || "", c.linea, c.concepto || "",
                          c.columna || "", c.anexo_rubro || "", c.anexo_campo || ""]
                         .concat(suyas));
          return;
        }
        const e = eq(r);
        if (e) {
          desdeRubro.push(nombre);
          filasPlan.push([nombre, "", "", e.linea, nombre, e.columna || "", "", ""]
                         .concat(marcas));
          return;
        }
        sinClasificar.push({ cuenta: nombre, rubro: r });
        filasPlan.push([nombre, "", "", "", nombre, "", "", ""].concat(marcas));
      };

      poner(cuenta, null);
      /* La columna de subcuenta está llena en todos los renglónes para poder armar
         con ella la lista de validación de la hoja de ajustes, así que en la gran
         mayoría repite el nombre de la cuenta. Eso no es una subcuenta: una cuenta
         que sumariza en sí misma se marcaría sola como «no se asienta» y se
         quedaría sin movimientos. */
      if (subcuenta && clave(subcuenta) !== clave(cuenta)) poner(subcuenta, cuenta);
    });

    /* La tabla `Gasto` vincula proveedor con concepto, y con ese concepto entran
       las compras al diario. Cuando el concepto no es una cuenta del plan hay
       que darle una igual, o los comprobantes quedan sin cuenta. */
    const conceptos = [];
    Object.keys(gastos).forEach((k) => {
      const nombre = gastos[k];
      if (vistas[nombre]) return;
      conceptos.push(nombre);
      const c = deDonde(nombre);
      vistas[nombre] = true;
      /* Un concepto de gasto que no está en la tabla `Cuentas` no trae la casilla
         de monetaria: sin marca no se reexpresa, y un gasto sin reexpresar pasa
         desapercibido. Va al mismo aviso que las otras. */
      sinMarcar.push(nombre);
      if (c) {
        filasPlan.push([nombre, "", c.rol || "", c.linea, c.concepto || "",
                        c.columna || "", c.anexo_rubro || "", c.anexo_campo || ""]);
      } else {
        sinClasificar.push({ cuenta: nombre,
                             rubro: { rubro: "concepto de gasto", subrubro: "", clasificacion: "" } });
        filasPlan.push([nombre, "", "", "", nombre]);
      }
    });

    /* Una cuenta que tiene subcuentas es una sumarizadora: al diario y al mayor
       van las subcuentas, una por una, y ella no recibe ningún movimiento. No
       hace falta que la planilla lo diga —se sabe mirando quién suma en quién—
       y si no se marcara, la cuenta quedaría abierta para recibir asientos que
       después aparecen dos veces en el balance. */
    const conSubcuentas = {};
    filasPlan.slice(1).forEach((f) => { if (f[1]) conSubcuentas[f[1]] = true; });
    filasPlan.slice(1).forEach((f) => { if (conSubcuentas[f[0]]) f[12] = "no"; });

    return { filas: filasPlan, sinClasificar: sinClasificar, desdeRubro: desdeRubro,
             conceptos: conceptos, cuentas: vistas, sinMarcar: sinMarcar };
  }

  /* La tabla `Imp_Gasto` de la hoja auxiliar: concepto de gasto -> cuenta
     contable. Se busca por el encabezado «Imputacion Contable», y el concepto es
     la columna de al lado: el encabezado «gasto» se repite en la tabla `Gasto` y
     buscarlo por nombre daría la columna equivocada. */
  function tablaDeImputacion(libro) {
    const f = filas(hoja(libro, "auxiliar"));
    const cab = f[0] || [];
    const col = cab.findIndex((x) => clave(x).indexOf("imputacion contable") >= 0);
    const imp = {};
    if (col < 1) return imp;
    f.slice(1).forEach((r) => {
      const gasto = texto(r[col - 1]), cuenta = texto(r[col]);
      if (gasto && cuenta) imp[clave(gasto)] = cuenta;
    });
    return imp;
  }

  /* La tabla `Gasto` de la hoja auxiliar: proveedor -> concepto de gasto. Es lo
     que le pone cuenta a cada comprobante de compra. Encadenada con `Imp_Gasto`,
     el proveedor termina en una cuenta del plan. Si el concepto no está en
     `Imp_Gasto`, el concepto mismo hace de cuenta, que es como venía antes. */
  function tablaDeGastos(libro) {
    const g = {};
    const imp = tablaDeImputacion(libro);
    filas(hoja(libro, "auxiliar")).slice(1).forEach((f) => {
      const prov = texto(f[0]), gasto = texto(f[1]);
      if (prov && gasto) g[clave(prov)] = imp[clave(gasto)] || gasto;
    });
    return g;
  }

  /* ---------- la apertura ---------- */

  /* El balance del ejercicio anterior viene como tabla dinámica, con un renglón
     de subtotal por rubro y por subrubro. No se puede distinguir un subtotal de
     una cuenta por la forma del renglón: los dos traen importe. Así que se
     resuelve por nombre, contra las cuentas de la hoja auxiliar, que es la que
     manda. Lo que no es una cuenta conocida se avisa y no se importa. */
  function apertura(libro, nombreHoja, conocidas) {
    const salida = [["Cuenta", "Saldo"]];
    /* Si la hoja trae una segunda columna de saldos, es el cierre anterior a
       ése: sin él, el estado de flujo de efectivo no tiene con qué armar la
       columna comparativa —una variación necesita dos cierres—. */
    const previa = [["Cuenta", "Saldo"]];
    const ajenas = [];
    filas(hoja(libro, nombreHoja)).forEach((f) => {
      const e = texto(f[0]);
      const v = f[1];
      if (!e || v === null || v === undefined || v === "") return;
      if (/^total/i.test(e) || /^etiquetas de fila$/i.test(e)) return;
      if (!conocidas[clave(e)]) { ajenas.push(e); return; }
      salida.push([conocidas[clave(e)], v]);
      if (typeof f[2] === "number") previa.push([conocidas[clave(e)], f[2]]);
    });
    return { filas: salida, ajenas: ajenas,
             previa: previa.length > 1 ? previa : null };
  }

  /* La hoja del balance anterior se llama con el año: `Balance 2025`. */
  /* La hoja del balance anterior. «Balance anterior» es el nombre bueno: no
     envejece, así que la planilla del año que viene se copia y sigue andando.
     «Balance 2025» se sigue aceptando por los papeles ya armados. */
  function hojaDeApertura(libro) {
    const h = libro.hojas.find((x) => /^balance\s+anterior$/i.test(String(x.nombre).trim()))
           || libro.hojas.find((x) => /^balance\s+\d{4}$/i.test(String(x.nombre).trim()));
    return h ? h.nombre : null;
  }

  /* ---------- los socios ---------- */

  /* La hoja `Socios` trae dos tablas, una al lado de la otra: a la izquierda los
     retiros del ejercicio y a la derecha la participación de cada socio con lo
     que retiró hasta el cierre anterior. Se leen por posición y no por
     encabezado, porque las dos tablas tienen columnas que se llaman igual y una
     pisaría a la otra. */
  function socios(libro) {
    const f = filas(hoja(libro, "Socios"));
    if (!f.length) return null;
    const cab = (f[0] || []).map((x) => clave(x));
    const iFecha = cab.indexOf("fecha");
    const iSocio = cab.lastIndexOf("socio");
    /* La tabla de la derecha empieza en la última columna «Socio»; la de la
       izquierda tiene el socio en la suya, antes de la fecha o después. */
    const derecha = iSocio > iFecha ? iSocio : -1;

    /* Y una tercera tabla: los honorarios del director devengados mes a mes.
       Se encuentra por la última columna «Periodo», que en esta hoja no se
       repite. */
    const iPeriodo = cab.lastIndexOf("periodo");

    const retiros = [["Fecha", "Socio", "Participación", "Importe", "Concepto"]];
    const partes = [["Socio", "Participación", "Retiros anteriores"]];
    const honorarios = [["Período", "Importe"]];
    f.slice(1).forEach((fila) => {
      if (iPeriodo >= 0) {
        const pe = iso(fila[iPeriodo]);
        const importe = fila[iPeriodo + 1];
        if (pe && typeof importe === "number") honorarios.push([pe.slice(0, 7), importe]);
      }
      if (iFecha >= 0) {
        const fe = iso(fila[iFecha]);
        const socio = texto(fila[cab.indexOf("socio")]);
        if (fe && socio) {
          retiros.push([corta(fe), socio, fila[iFecha + 1], fila[iFecha + 2],
                        texto(fila[iFecha + 3]) || ""]);
        }
      }
      if (derecha >= 0) {
        const socio = texto(fila[derecha]);
        if (socio) partes.push([socio, fila[derecha + 1], fila[derecha + 2]]);
      }
    });
    return { retiros: retiros, participaciones: partes, honorarios: honorarios };
  }

  /* La cuenta de anticipos a los socios se lleva por subcuenta, una por socio,
     pero el balance anterior trae un solo importe. La tabla de la derecha de la
     hoja `Socios` dice cuánto de ese saldo es de cada uno: con eso la apertura
     se reparte, y cada socio abre su propia cuenta en el mayor.

     Si la suma de la tabla no da el saldo del balance, no se reparte nada: un
     reparto que no cierra es peor que no repartir. */
  function repartirApertura(ap, soc, plan) {
    const padreDe = {};
    plan.filas.slice(1).forEach((f) => { if (f[1]) padreDe[clave(f[0])] = f[1]; });

    const filasSocios = soc.participaciones.slice(1)
      .filter((s) => padreDe[clave(s[0])]);
    if (!filasSocios.length) return null;
    const padres = Array.from(new Set(filasSocios.map((s) => padreDe[clave(s[0])])));
    if (padres.length !== 1) return null;
    const padre = padres[0];

    const i = ap.findIndex((f, k) => k > 0 && clave(f[0]) === clave(padre));
    if (i < 0) return null;
    const saldo = Number(ap[i][1]) || 0;
    const suma = filasSocios.reduce((t, s) => t + (Number(s[2]) || 0), 0);
    /* La apertura de un crédito es deudora y la tabla trae los retiros en
       positivo: se comparan por valor absoluto y se reparte con el signo del
       saldo. */
    if (Math.abs(Math.abs(saldo) - suma) > 0.05) {
      return { padre: padre, saldo: saldo, suma: suma, repartido: false };
    }
    const signo = saldo < 0 ? -1 : 1;
    ap.splice(i, 1, ...filasSocios.map((s) => [s[0], signo * (Number(s[2]) || 0)]));
    return { padre: padre, saldo: saldo, suma: suma, repartido: true };
  }

  /* ---------- las hojas que sólo cambian de nombre de columna ---------- */

  /* Cada entrada dice de qué hoja del papel sale una hoja del modelo, qué
     columna sirve para encontrar el encabezado y cómo se llama cada columna
     allá. Lo que no está declarado se deja vacío. */
  const TRADUCCIONES = [
    {
      modelo: "Ventas", papel: "Ventas", ancla: "Fecha",
      columnas: [
        ["Fecha", ["Fecha"], "fecha"],
        ["Tipo", ["Tipo"]],
        ["Punto de venta", ["Punto de Venta"]],
        ["Número", ["Número Desde", "Numero Desde"]],
        ["CUIT receptor", ["Nro. Doc. Receptor"]],
        ["Receptor", ["Denominación Receptor", "Denominacion Receptor"]],
        ["Moneda", ["Moneda"]],
        ["Tipo de cambio", ["Tipo Cambio"]],
        ["Neto gravado", ["Neto Gravado Total"]],
        ["IVA", ["Total IVA"]],
        ["No gravado", ["Neto No Gravado"]],
        ["Exento", ["Op. Exentas"]],
        ["Otros tributos", ["Otros Tributos"]],
        ["Total", ["Imp. Total"]],
      ],
    },
    {
      modelo: "Compras", papel: "Compras", ancla: "Fecha", gasto: true,
      columnas: [
        ["Fecha", ["Fecha"], "fecha"],
        ["Tipo", ["Tipo"]],
        ["Punto de venta", ["Punto de Venta"]],
        ["Número", ["Número Desde", "Numero Desde"]],
        ["CUIT emisor", ["Nro. Doc. Emisor"]],
        ["Emisor", ["Denominación Emisor", "Denominacion Emisor"]],
        ["Concepto", []],
        ["Moneda", ["Moneda"]],
        ["Tipo de cambio", ["Tipo Cambio"]],
        ["Neto gravado", ["Neto Gravado Total"]],
        ["IVA", ["Total IVA"]],
        ["No gravado", ["Neto No Gravado"]],
        ["Exento", ["Op. Exentas"]],
        ["Otros tributos", ["Otros Tributos"]],
        ["Total", ["Imp. Total"]],
      ],
    },
    {
      modelo: "IIBB", papel: "Datos IIBB", ancla: "Registro", ordenarPor: "Período",
      columnas: [
        ["Período", ["Registro"], "periodo"],
        ["Vencimiento", ["VencimientoDescendente", "Vencimiento"], "fecha"],
        ["Importe", ["Pagado", "Importe"]],
        ["Cancelado", ["Cancelado"], "fecha"],
        ["Estado", ["Estado"]],
      ],
    },
    {
      modelo: "DDJJ IVA", papel: "IVA", ancla: "Periodo",
      columnas: [
        ["Período", ["Periodo"], "periodo"],
        ["Débito fiscal", ["Debito fiscal"]],
        ["Crédito fiscal", ["Credito fiscal"]],
        ["Retenciones y percepciones", ["Retenc. y percep."]],
        ["Saldo del impuesto", ["Saldo del impuesto"]],
        ["Libre disponibilidad", ["Libre disp. del periodo"]],
      ],
    },
    {
      modelo: "DDJJ Ganancias", papel: "Ganancias", ancla: "Fecha asiento",
      columnas: [
        ["Fecha", ["Fecha asiento"], "fecha"],
        ["Ejercicio", ["Ejercicio"]],
        ["Impuesto determinado", ["Impuesto determinado"]],
        ["Crédito ley 25.413", ["Credeb"]],
        ["Retenciones", ["Retenciones"]],
        ["Anticipos", ["Anticipos"]],
        ["Total a pagar", ["Total a pagar"]],
      ],
    },
    {
      modelo: "Pagos ARCA", papel: "Pagos VEPS", ancla: "Fecha de Pago",
      columnas: [
        ["Fecha", ["Fecha de Pago"], "fecha"],
        ["VEP", ["Nro. VEP"]],
        ["Cuenta", ["Imputacion contable", "Imputación contable"]],
        ["Detalle", ["Descripcion", "Descripción"]],
        ["Importe", ["Importe"]],
      ],
    },
    {
      /* El extracto del banco, con la naturaleza de cada movimiento ya puesta a
         mano en las columnas `RUBRO` y `Detalle`: eso es lo que después decide
         contra qué cuenta va cada uno. */
      modelo: "Extractos", papel: "Extractos Bancarios", ancla: "Fecha",
      soloSi: (fila) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(fila[0])),
      columnas: [
        ["Fecha", ["Fecha"], "fecha"],
        ["Descripción", ["Descripción", "Descripcion"]],
        ["Débito", ["Débitos", "Debitos", "Débito", "Debito"]],
        ["Crédito", ["Créditos", "Creditos", "Crédito", "Credito"]],
        ["Saldo", ["Saldo"]],
        ["Rubro", ["Rubro"]],
        ["Detalle", ["Detalle"]],
      ],
    },
    {
      modelo: "Índices", papel: "IPC", ancla: "periodo",
      // el renglón de «Punta a Punta» no es un índice: es la variación del
      // ejercicio, y se usa aparte para controlar la serie
      soloSi: (fila) => /^\d{4}-\d{2}$/.test(String(fila[0])),
      columnas: [
        ["Período", ["periodo"], "periodo"],
        ["Índice", ["indice"]],
      ],
    },
  ];

  /* La hoja de índices trae al pie la inflación del ejercicio, punta a punta.
     No entra al cálculo —el coeficiente sale de la propia serie— pero sirve
     para controlar que la serie sea la que corresponde. */
  function variacionDeclarada(libro) {
    const f = filas(hoja(libro, "IPC"));
    for (let i = f.length - 1; i >= 0; i--) {
      const e = texto((f[i] || [])[0]);
      if (e && /punta a punta/i.test(e) && typeof f[i][1] === "number") return f[i][1];
    }
    return null;
  }

  /* El importe de ARCA viene con guion cuando no hay nada, y a veces con signo
     pesos: se deja el texto y lo normaliza el importador, que ya sabe. */
  function traducir(libro, t, gastos) {
    const h = hoja(libro, t.papel);
    if (!h) return null;
    const salida = [t.columnas.map((c) => c[0])];
    registros(h, t.ancla).forEach((r) => {
      const fila = t.columnas.map((c) => {
        const v = dato(r, c[1]);
        if (v === null) return "";
        if (c[2] === "fecha") return corta(iso(v));
        if (c[2] === "periodo") {
          const f = iso(v);
          return f ? f.slice(0, 7) : String(v).trim();
        }
        return v;
      });
      // el concepto de una compra sale del proveedor, por la tabla `Gasto`
      if (t.gasto) {
        const i = t.columnas.findIndex((c) => c[0] === "Concepto");
        const emisor = dato(r, ["Denominación Emisor", "Denominacion Emisor"]);
        fila[i] = gastos[clave(emisor)] || "";
      }
      if (t.soloSi && !t.soloSi(fila)) return;
      if (fila.some((x) => x !== "")) salida.push(fila);
    });
    /* La planilla de ingresos brutos viene del más nuevo al más viejo. El orden
       no cambia ningún asiento, pero sí hace comparables los archivos. */
    if (t.ordenarPor) {
      const i = t.columnas.findIndex((c) => c[0] === t.ordenarPor);
      salida.splice(1, salida.length, ...salida.slice(1).sort((a, b) =>
        String(a[i]) < String(b[i]) ? -1 : String(a[i]) > String(b[i]) ? 1 : 0));
    }
    return salida;
  }

  /* ---------- las valuaciones al cierre ----------

     Hay saldos que al cierre valen lo que dice un tercero: el resumen del fondo
     común, una cotización. Ese valor no está en ningún movimiento y no se puede
     deducir, así que se declara, con la cuenta de resultado que recibe la
     diferencia y de dónde salió el dato. */
  function valuaciones(libro) {
    const h = hoja(libro, "Cierre") || hoja(libro, "Valuaciones");
    if (!h) return null;
    const salida = [["Cuenta", "Valor", "Resultado", "Fuente"]];
    registros(h, "Cuenta").forEach((r) => {
      const cuenta = texto(dato(r, ["cuenta"]));
      const valor = dato(r, ["valor", "valor al cierre", "importe"]);
      if (!cuenta || valor === null) return;
      salida.push([cuenta, valor,
                   texto(dato(r, ["resultado", "cuenta de resultado", "contra"])) || "",
                   texto(dato(r, ["fuente", "de donde sale", "origen"])) || ""]);
    });
    return salida.length > 1 ? salida : null;
  }

  /* ---------- los anticipos del impuesto a las ganancias ----------

     Van al costado de los pagos de VEP, en la misma hoja y compartiendo la fila
     de encabezados. No se leen por nombre de columna —«Importe» está repetido—
     sino por posición, desde la columna «Fecha Operación».

     La tabla es la lista completa de anticipos **del período fiscal**, así que
     incluye los que se pagaron después del cierre: la contabilidad no los tiene
     y la declaración jurada sí los computa. */
  function anticiposGanancias(libro) {
    const f = filas(hoja(libro, "Pagos VEPS"));
    if (!f.length) return null;
    const cab = (f[0] || []).map((x) => clave(x));
    const i = cab.indexOf("fecha operacion");
    if (i < 0) return null;
    const salida = [["Fecha", "Concepto", "Importe"]];
    f.slice(1).forEach((fila) => {
      const fe = iso(fila[i]);
      const importe = fila[i + 2];
      /* El importe puede venir como texto y con separadores de miles: se pasa
         crudo y lo normaliza el importador, que ya sabe distinguir «1.234,56»
         de «1,234.56». */
      if (fe && importe !== null && importe !== undefined && importe !== "") {
        salida.push([corta(fe), texto(fila[i + 1]) || "", importe]);
      }
    });
    return salida.length > 1 ? salida : null;
  }

  /* ---------- compensaciones ---------- */

  /* La exportación de compensaciones dice de qué impuesto sale el saldo y a qué
     concepto se aplica, pero no la cuenta contable: eso lo dice el catálogo. */
  function compensaciones(libro, catalogo) {
    const h = hoja(libro, "Compensaciones");
    if (!h) return null;
    const mapa = catalogo.compensaciones || {};
    const salida = [["Fecha", "Cuenta", "Detalle", "Importe"]];
    const sinCuenta = [];
    registros(h, "Importe").forEach((r) => {
      const f = corta(iso(dato(r, ["Fecha Operación", "Fecha Operacion"])));
      if (!f) return;
      const sub = String(dato(r, ["Subconcepto Dest"]) || "");
      const k = clave(sub.split("-").slice(1).join("-") || sub);
      const cuenta = mapa[k] || "";
      if (!cuenta) sinCuenta.push(sub);
      salida.push([f, cuenta, `${dato(r, ["Impuesto Orig"]) || ""} → ${sub}`,
                   dato(r, ["Importe"])]);
    });
    return { filas: salida, sinCuenta: sinCuenta };
  }

  /* ---------- los rubros del extracto ---------- */

  /* El rubro que el extracto trae escrito a mano dice la naturaleza del
     movimiento; contra qué cuenta va lo dice el catálogo del estudio. Un rubro
     marcado como ya asentado no se vuelve a asentar desde el banco: entra por
     otra fuente, y el banco no puede salir dos veces. */
  function rubrosBancarios(libro, catalogo) {
    const h = hoja(libro, "Extractos Bancarios");
    if (!h) return null;
    const mapa = catalogo.rubros_bancarios || {};
    const salida = [["Rubro", "Cuenta o rol", "Ya asentado en", "Si la descripción dice"]];
    const vistos = {}, sinCuenta = [];
    registros(h, "Fecha").forEach((r) => {
      const rubro = texto(dato(r, ["Rubro"]));
      if (!rubro || vistos[clave(rubro)]) return;
      vistos[clave(rubro)] = true;
      const m = mapa[clave(rubro)];
      if (!m) { sinCuenta.push(rubro); salida.push([rubro, "", "", ""]); return; }
      salida.push([rubro, m.cuenta || "", m.ya_asentado || "", ""]);
      /* Un rubro se puede afinar por lo que dice el banco: el mismo «BANCO -
         IVA» trae el crédito fiscal y la percepción. Cada refinamiento va en su
         propio renglón, debajo del rubro. */
      (m.si_dice || []).forEach((x) => {
        salida.push([rubro, x.cuenta || "", "", x.contiene || ""]);
      });
    });
    return { filas: salida, sinCuenta: sinCuenta };
  }

  /* ---------- las bases del impuesto a las ganancias ---------- */

  /* La hoja `Bases Ganancias` del papel tiene tres tablas puestas una al lado de
     la otra. Dos son parámetros que cambian solos con el tiempo —la escala del
     artículo 73 se actualiza todos los años por IPC, y los topes de venta de la
     SEPyME una vez al año— y por eso entran desde la planilla: cuando cambian se
     cambia el Excel, no la aplicación.

     La tercera, el porcentaje de la ley 25.413 que cada categoría computa, sale
     de la ley y no se mueve: vive en `esquema/impuesto-ley-25413.json`. Se lee
     igual, pero sólo para controlar que la planilla y la aplicación digan lo
     mismo.

     Las tres se buscan por el texto de su encabezado, no por su posición: quien
     mueva una tabla de lugar no rompe nada. */

  const HOJA_BASES = "Bases Ganancias";

  /* Ubica un encabezado en cualquier parte de la hoja y devuelve el bloque que
     cuelga de él: la fila del encabezado y las de abajo, hasta la primera vacía. */
  /* `corta` son los encabezados de las otras tablas. Hace falta porque el lector
     de Excel descarta las filas vacías: dos tablas separadas por cinco renglones
     en blanco quedan pegadas, y sin esto la de arriba se come a la de abajo. */
  function bloqueDesde(f, etiqueta, ancho, corta) {
    const k = clave(etiqueta);
    const fin = (corta || []).map(clave);
    for (let i = 0; i < f.length; i++) {
      const fila = f[i] || [];
      for (let j = 0; j < fila.length; j++) {
        if (clave(fila[j]) !== k) continue;
        const cuerpo = [];
        for (let r = i + 1; r < f.length; r++) {
          const c = (f[r] || []).slice(j, j + ancho);
          if (!c.length || c[0] === null || c[0] === undefined || c[0] === "") break;
          if (fin.indexOf(clave(c[0])) >= 0) break;
          cuerpo.push(c);
        }
        return { cab: fila.slice(j, j + ancho), cuerpo: cuerpo };
      }
    }
    return null;
  }

  /* Los porcentajes llegan de las dos maneras: 25 en la columna «Más el %» de la
     escala y «100%» en la del cómputo. Los dos quieren decir una proporción. */
  function porcentaje(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v > 1 ? v / 100 : v;
    const n = Number(String(v).replace(/\s|%/g, "").replace(",", "."));
    if (!isFinite(n)) return null;
    return String(v).indexOf("%") >= 0 || n > 1 ? n / 100 : n;
  }

  const num = (v) => {
    if (typeof v === "number") return v;
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/\./g, "").replace(",", "."));
    return isFinite(n) ? n : null;
  };

  /* La tabla `Par_FACPCE` de la hoja `auxiliar`: los topes de venta con los que
     la FACPCE define si un ente es pequeño, mediano o ninguno de los dos. Los
     actualiza una vez al año, así que entran por la planilla y no por el código.

     No categorizan solos a nadie: la categoría la declara la carátula. Esto
     sirve para poder decir si lo declarado y las ventas se contradicen. */
  function topesFACPCE(libro) {
    const f = filas(hoja(libro, "auxiliar"));
    const b = bloqueDesde(f, "categoria (rt 54)", 3);
    if (!b || !b.cuerpo.length) return null;
    const salida = [["Categoría", "Desde", "Hasta"]];
    b.cuerpo.forEach((c) => {
      const cat = texto(c[0]);
      if (cat) salida.push([cat, num(c[1]), num(c[2])]);
    });
    return salida.length > 1 ? salida : null;
  }

  function basesGanancias(libro) {
    const h = hoja(libro, HOJA_BASES);
    if (!h) return null;
    const f = filas(h);
    const salida = {};

    /* La escala del artículo 73. El último tramo dice «En adelante» en vez de un
       importe: eso es el tramo sin techo. */
    const esc = bloqueDesde(f, "más de $", 5);
    if (esc && esc.cuerpo.length) {
      salida.escala = [["Desde", "Hasta", "Fijo", "Alícuota", "Sobre el excedente de"]];
      esc.cuerpo.forEach((c) => {
        salida.escala.push([num(c[0]), num(c[1]), num(c[2]), porcentaje(c[3]), num(c[4])]);
      });
    }

    /* Los topes de venta por sector y categoría, que la SEPyME actualiza. No
       categorizan a nadie: sirven para mirar al lado de lo que la empresa
       facturó y ver si la categoría declarada sigue en pie. */
    const top = bloqueDesde(f, "sector", 5);
    if (top && top.cuerpo.length) {
      salida.topes = [top.cab.map((x) => texto(x) || "")];
      top.cuerpo.forEach((c) => salida.topes.push([texto(c[0])].concat(c.slice(1).map(num))));
    }

    /* El porcentaje de cómputo de la ley 25.413. Es de la ley y vive en el
       esquema: esto se lee sólo para poder decir si los dos coinciden. */
    const com = bloqueDesde(f, "categoria mipyme", 5, ["sector"]);
    if (com && com.cuerpo.length) {
      salida.computo = [["Categoría", "Sector", "Porcentaje", "Régimen", "Nota"]];
      com.cuerpo.forEach((c) => {
        salida.computo.push([texto(c[0]), texto(c[1]), porcentaje(c[2]),
                             texto(c[3]), texto(c[4])]);
      });
    }
    return salida;
  }

  /* ---------- la traducción entera ---------- */

  function traducirLibro(libro, catalogo, propio) {
    const avisos = [];
    const hojas = [];
    const agregar = (nombre, f) => { if (f && f.length > 1) hojas.push({ nombre, filas: f }); };

    const c = caratula(libro);
    hojas.push({ nombre: "Ente", filas: hojaEnte(c) });
    hojas.push({ nombre: "Ejercicio", filas: hojaEjercicio(c) });

    const gastos = tablaDeGastos(libro);
    const plan = planDeCuentas(libro, catalogo, gastos, propio);
    hojas.push({ nombre: "Plan de cuentas", filas: plan.filas });

    /* El nombre de la cuenta en el balance anterior tiene que ser el mismo que
       en el plan: se compara sin acentos ni mayúsculas y se guarda el del plan. */
    const conocidas = {};
    Object.keys(plan.cuentas).forEach((c) => { conocidas[clave(c)] = c; });

    /* Los socios se leen antes que la apertura: la tabla de participaciones es
       la que reparte el saldo de anticipos entre las subcuentas de cada socio. */
    const soc = socios(libro);
    if (soc) {
      agregar("Socios", soc.participaciones);
      agregar("Retiros de socios", soc.retiros);
      agregar("Honorarios del director", soc.honorarios);
    }

    const nombreBalance = hojaDeApertura(libro);
    if (nombreBalance) {
      const ap = apertura(libro, nombreBalance, conocidas);
      if (soc) {
        const r = repartirApertura(ap.filas, soc, plan);
        if (r && !r.repartido) {
          avisos.push(`A-P06 · la apertura de «${r.padre}» no se repartió entre los socios: ` +
            `el balance anterior dice ${r.saldo.toFixed(2)} y la tabla de la hoja «Socios» ` +
            `suma ${r.suma.toFixed(2)}. Queda en una sola cuenta.`);
        }
      }
      agregar("Apertura", ap.filas);
      agregar("Cierre previo", ap.previa);
      if (ap.ajenas.length) {
        avisos.push(`A-P04 · renglones de «${nombreBalance}» que no son cuentas del plan ` +
                    "y no se importaron: " + Array.from(new Set(ap.ajenas)).join(", ") +
                    ". Si alguno es una cuenta, hay que agregarlo a la hoja auxiliar.");
      }
    } else {
      avisos.push("No encontré la hoja del balance anterior (se busca «Balance anterior»).");
    }

    TRADUCCIONES.forEach((t) => agregar(t.modelo, traducir(libro, t, gastos)));

    /* Lo único que el papel de trabajo no puede deducir es una excepción: qué
       cuenta va en una ranura cuando no es la que elegiría el rol. Si el archivo
       trae la hoja `Asientos` del modelo, se pasa tal cual. */
    const excepciones = hoja(libro, "Asientos");
    if (excepciones && filas(excepciones).length > 1) {
      hojas.push({ nombre: "Asientos", filas: filas(excepciones) });
    }

    /* Los asientos escritos a mano y los que arma la aplicación de Mis
       Facilidades tienen la misma forma, así que las dos hojas pasan tal cual.
       La de Mis Facilidades trae además la decisión de si el asiento se pega. */
    ["Ajustes", "MF Asientos"].forEach((n) => {
      const h = hoja(libro, n);
      if (h && filas(h).length > 1) hojas.push({ nombre: n, filas: filas(h) });
    });

    agregar("Anticipos ganancias", anticiposGanancias(libro));
    agregar("Valuaciones", valuaciones(libro));

    const bases = basesGanancias(libro);
    if (bases) {
      agregar("Escala de ganancias", bases.escala);
      agregar("Topes MiPyME", bases.topes);
      agregar("Cómputo ley 25.413", bases.computo);
    }
    agregar("Topes FACPCE", topesFACPCE(libro));
    if (!bases || !bases.escala) {
      avisos.push("A-P08 · no encontré la escala del artículo 73 en la hoja `" +
                  HOJA_BASES + "`. Se usa la que trae el esquema de la aplicación, que " +
                  "puede no ser la del período fiscal que se está liquidando.");
    }

    const rub = rubrosBancarios(libro, catalogo);
    if (rub) {
      agregar("Rubros bancarios", rub.filas);
      if (rub.sinCuenta.length) {
        avisos.push("A-P07 · estos rubros del extracto no están en el catálogo del " +
                    "estudio, así que sus movimientos quedan sin cuenta: " +
                    rub.sinCuenta.join(", ") +
                    ". Se agregan al catálogo, en `rubros_bancarios`.");
      }
    }

    const comp = compensaciones(libro, catalogo);
    if (comp) {
      agregar("Compensaciones", comp.filas);
      if (comp.sinCuenta.length) {
        avisos.push("A-P03 · compensaciones sin cuenta de destino conocida: " +
                    Array.from(new Set(comp.sinCuenta)).join(", ") +
                    ". Se agrega al catálogo del estudio, en `compensaciones`.");
      }
    }

    const cat = categoriaFACPCE(c);
    if (!CLASIFICACION_FACPCE[cat]) {
      avisos.push("A-P09 · la clasificación del ente para la nota sale de la fila " +
        "«Categoria Tamaño empresa FACPCE» de `Datos Caratulas`, y ahí dice " +
        (cat ? `«${texto(dato(c, ["categoria tamano empresa facpce"]))}», que no es ` +
               "ninguna de las categorías conocidas (Pequeña, Mediana o Resto)" : "nada") +
        ". La nota va a decir «entidad pequeña» por omisión: si el ente no es pequeño, " +
        "hay que corregir la carátula.");
    }

    if (plan.desdeRubro.length) {
      avisos.push("A-P01 · estas cuentas no estaban en el catálogo del estudio y se " +
                  "clasificaron por su rubro del papel de trabajo: " +
                  plan.desdeRubro.join(", ") + ". Conviene revisarlas.");
    }
    if (plan.sinMarcar.length) {
      avisos.push("A-P05 · estas cuentas no dicen si son monetarias, así que no se sabe si " +
                  "entran al ajuste por inflación: " + plan.sinMarcar.join(", ") + ".");
    }
    if (plan.sinClasificar.length) {
      avisos.push("A-P02 · estas cuentas no están en el catálogo y su rubro no alcanza " +
                  "para deducir la línea: " +
                  plan.sinClasificar.map((x) => `${x.cuenta} (${x.rubro.rubro} / ` +
                    `${x.rubro.subrubro} / ${x.rubro.clasificacion})`).join("; ") +
                  ". Hay que agregarlas al catálogo del estudio.");
    }

    return { libro: { hojas: hojas }, avisos: avisos, plan: plan,
             variacionDeclarada: variacionDeclarada(libro) };
  }

  global.PapelDeTrabajo = { es: esPapelDeTrabajo, traducir: traducirLibro, slugDe };
})(window);
