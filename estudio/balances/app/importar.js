/* La importación: de un Excel a los cuatro archivos del ente.

   Lee el modelo de importación con `xlsx.js`, arma `ente.json`,
   `mapeo-cuentas.json`, `ejercicio.json` y `fuentes.json`, corre los controles y
   —si pasan— arma el diario en memoria para que se vean los asientos antes de
   guardar nada.

   Acá no se decide nada de contabilidad: la clasificación sale de la hoja
   `Plan de cuentas` y los importes de las hojas de comprobantes. */

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const pesos = window.Motor.pesos;
  const TOL = 0.05;

  let resultado = null;

  const esc = (s) => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* ---------- lectura tolerante ---------- */

  /* Los nombres de hoja y de columna se comparan sin acentos, sin mayúsculas y
     sin espacios de más: que sobre un espacio no puede romper una importación. */
  const clave = (s) => String(s === null || s === undefined ? "" : s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

  function buscarHoja(libro, nombre) {
    const k = clave(nombre);
    return libro.hojas.find((h) => clave(h.nombre) === k) || null;
  }

  /* Devuelve las filas de una hoja como objetos, con las claves normalizadas. */
  function registros(hoja) {
    if (!hoja || !hoja.filas.length) return [];
    const cab = hoja.filas[0].map(clave);
    const salida = [];
    for (let i = 1; i < hoja.filas.length; i++) {
      const fila = hoja.filas[i];
      if (!fila || fila.every((c) => c === null || c === "")) continue;
      const o = { _fila: i + 1 };
      cab.forEach((c, j) => { if (c) o[c] = fila[j]; });
      salida.push(o);
    }
    return salida;
  }

  /* Las hojas Ente y Ejercicio son campo/valor. */
  function campos(hoja) {
    const o = {};
    if (!hoja) return o;
    hoja.filas.slice(1).forEach((f) => {
      if (f && f[0]) o[clave(f[0])] = f[1];
    });
    return o;
  }

  const texto = (v) => (v === null || v === undefined || v === "" ? null : String(v).trim());

  function numero(v) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return v;
    // "1.234,56", "1234.56" y "$ 1.234,56" tienen que dar lo mismo
    const s = String(v).trim().replace(/\s/g, "").replace(/[^0-9.,+-]/g, "");
    const conComa = /,\d{1,2}$/.test(s);
    const limpio = conComa ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    const n = Number(limpio);
    return Number.isNaN(n) ? 0 : n;
  }

  function fecha(v) {
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
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }

  const periodo = (v) => {
    const f = fecha(v);
    if (f) return f.slice(0, 7);
    const s = String(v || "").trim();
    const m = s.match(/^(\d{4})[-\/](\d{1,2})$/);
    return m ? `${m[1]}-${m[2].padStart(2, "0")}` : null;
  };

  const sino = (v) => /^(s[ií]|si|true|x|1)$/i.test(String(v || "").trim());

  /* La serie de índices sirve para el ajuste por inflación si no le falta
     ningún mes entre el cierre anterior —de donde vienen los saldos de
     apertura— y el cierre. Con un mes faltante, ese mes no se puede reexpresar. */
  function serieCompleta(indices, cierreAnterior, cierre) {
    if (!cierreAnterior || !cierre) return false;
    const hay = {};
    indices.forEach((i) => { hay[i.periodo] = true; });
    let [a, m] = cierreAnterior.slice(0, 7).split("-").map(Number);
    const fin = cierre.slice(0, 7);
    for (let n = 0; n < 200; n++) {
      const clave = `${a}-${String(m).padStart(2, "0")}`;
      if (!hay[clave]) return false;
      if (clave === fin) return true;
      if (++m > 12) { m = 1; a++; }
    }
    return false;
  }

  /* "LIMA SUR S.A.S." -> "lima-sur-sas": los puntos de una sigla se borran, no
     se convierten en guiones. */
  function slugificar(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\./g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /* ---------- armado de los cuatro archivos ---------- */

  function armar(libro) {
    const avisos = [], errores = [];
    const falta = (hoja) => errores.push(`Falta la hoja «${hoja}».`);
    /* Un corte temprano devuelve la misma forma que un armado completo: la
       pantalla no tiene por qué saber hasta dónde se llegó. */
    const cortar = () => ({ errores, avisos, controles: [], archivos: {}, resumen: null });

    const hEnte = buscarHoja(libro, "Ente");
    const hEj = buscarHoja(libro, "Ejercicio");
    const hPlan = buscarHoja(libro, "Plan de cuentas");
    if (!hEnte) falta("Ente");
    if (!hEj) falta("Ejercicio");
    if (!hPlan) falta("Plan de cuentas");
    if (!hEnte && !hEj && !hPlan) {
      errores.push("Este archivo no tiene ninguna de las hojas del modelo: no es un " +
                   "archivo de importación. Las hojas que trae son " +
                   libro.hojas.map((h) => `«${h.nombre}»`).join(", ") + ". Bajate el " +
                   "modelo del paso 1 y pasá los datos ahí.");
    }
    if (errores.length) return cortar();

    const e = campos(hEnte), j = campos(hEj);
    const denominacion = texto(e["denominacion"]);
    if (!denominacion) errores.push("La hoja «Ente» no tiene denominación.");
    const cierre = fecha(j["cierre"]);
    const inicio = fecha(j["inicio"]);
    if (!cierre) errores.push("La hoja «Ejercicio» no tiene una fecha de cierre válida.");
    if (!inicio) errores.push("La hoja «Ejercicio» no tiene una fecha de inicio válida.");
    if (errores.length) return cortar();

    const slug = slugificar(denominacion);
    const anio = cierre.slice(0, 4);

    /* -- plan de cuentas: el mapeo y los roles -- */
    const cuentas = {}, roles = {}, amortizacion = {};
    const ajusteImpositivo = { cuentas_activo: [], cuentas_pasivo: [] };
    const repetidas = [], noSeAsientan = [];

    /* Una subcuenta dice en «Suma en» de qué cuenta forma parte, y hereda de
       ella la exposición: al diario y al mayor va sola, al balance y a las notas
       va sumada en la cuenta que la contiene. Lo que traiga propio pisa lo
       heredado. */
    const procesar = (r) => {
      const cuenta = texto(r["cuenta"]);
      if (!cuenta) return;
      if (cuentas[cuenta]) repetidas.push(cuenta);
      const sumaEn = texto(r["suma en"]);
      const padre = sumaEn ? cuentas[sumaEn] : null;
      const linea = texto(r["linea de exposicion"]) || (padre ? padre.linea : null);
      if (!linea) {
        avisos.push(`A-I01 · la cuenta «${cuenta}» no tiene línea de exposición: ` +
                    "no va a poder exponerse en el balance.");
        return;
      }
      const m = { linea: linea };
      if (sumaEn) m.suma_en = sumaEn;
      const heredar = (campo, propio) => {
        const v = propio !== null && propio !== undefined ? propio
          : (padre ? padre[campo] : null);
        if (v) m[campo] = v;
      };
      /* La naturaleza —AC, AnC, PC, PnC, PN, R+, R−— la declara el plan de la
         empresa, no se deduce del renglón de exposición: dos cuentas de signo
         opuesto pueden ir al mismo renglón del estado. */
      heredar("naturaleza", texto(r["naturaleza"]));
      heredar("concepto", texto(r["concepto en la nota"]));
      heredar("columna", texto(r["columna de gasto"]) ? clave(r["columna de gasto"]) : null);
      heredar("anexo_rubro", texto(r["rubro de anexo"]));
      heredar("anexo_campo", texto(r["campo de anexo"]) ? clave(r["campo de anexo"]) : null);
      cuentas[cuenta] = m;

      const rol = texto(r["rol"]);
      if (rol) {
        const k = clave(rol).replace(/ /g, "_");
        if (roles[k]) {
          errores.push(`El rol «${k}» está marcado en dos cuentas: ` +
                       `«${roles[k]}» y «${cuenta}».`);
        }
        roles[k] = cuenta;
      }
      /* Si es no monetaria y a qué cuenta va su ajuste son propiedades de la
         cuenta: quedan en el mapeo, que es donde se ven y se editan, y de ahí
         las lee el asiento de ajuste. No hay una lista aparte. */
      const nm = texto(r["no monetaria"]);
      if (nm) {
        m.no_monetaria = true;
        if (!/^s[ií]$/i.test(nm)) m.ajuste_a = nm;
      }
      /* «Se asienta: no» marca una cuenta que existe en el plan pero no recibe
         movimientos: una sumarizadora, o una que quedó sin uso. Si igual le
         llega un asiento, es un error y hay que verlo. */
      if (/^(no|falso|false|0)$/i.test(String(r["se asienta"] || "").trim())) {
        m.se_asienta = false;
        noSeAsientan.push(cuenta);
      }
      const ai = clave(r["ajuste impositivo"]);
      /* «activo» y «pasivo» son del criterio viejo, el del prototipo. El nuevo
         sólo pregunta si la cuenta entra o no en el activo computable del
         Título VI: lo que la ley deja al criterio del profesional. */
      if (ai === "activo") ajusteImpositivo.cuentas_activo.push(cuenta);
      if (ai === "pasivo") ajusteImpositivo.cuentas_pasivo.push(cuenta);
      if (/^(no computable|no|nc)$/.test(ai)) m.ajuste_impositivo = "no computable";
      if (/^(computable|si|sí)$/.test(ai)) m.ajuste_impositivo = "computable";

      const tasa = numero(r["tasa de amortizacion"]);
      if (tasa) m.tasa = tasa;

      /* Deuda con el Sistema Integrado Previsional Argentino. La marca es de la
         cuenta y sirve para un solo lugar: el apartado a) del informe sobre
         otros requerimientos legales, que declara los aportes y contribuciones
         previsionales —no el sueldo a pagar, que vive en el mismo renglón. */
      if (/^(s[ií]|si|true|x|1)$/i.test(String(r["previsional"] || "").trim())) {
        m.previsional = true;
      }
    };

    /* Primero las cuentas que no dependen de nadie, después las subcuentas, en
       el orden en que se puedan resolver. Si al final queda alguna colgada, es
       porque apunta a una cuenta que no existe. */
    let pendientes = registros(hPlan);
    for (;;) {
      const listas = pendientes.filter((r) => {
        const s = texto(r["suma en"]);
        return !s || cuentas[s];
      });
      if (!listas.length) break;
      listas.forEach(procesar);
      pendientes = pendientes.filter((r) => listas.indexOf(r) < 0);
    }
    pendientes.forEach((r) => {
      errores.push(`«${texto(r["cuenta"])}» suma en «${texto(r["suma en"])}», que no está ` +
                   "en el plan de cuentas.");
    });

    /* La tasa la declara la cuenta del valor de origen; cuál es su cuenta de
       amortización acumulada no hace falta escribirlo: ya está en el plan, en el
       par `Rubro de anexo` / `Campo de anexo`. */
    Object.keys(cuentas).forEach((c) => {
      const m = cuentas[c];
      if (!m.tasa) return;
      const acumulada = Object.keys(cuentas).find((x) => cuentas[x].anexo_rubro &&
        cuentas[x].anexo_rubro === m.anexo_rubro && cuentas[x].anexo_campo === "amortizacion");
      if (!acumulada) {
        errores.push(`«${c}» tiene tasa de amortización pero no se encuentra su cuenta de ` +
          "amortización acumulada: ninguna cuenta del plan comparte su rubro de anexo " +
          "con el campo «amortizacion».");
        return;
      }
      amortizacion[c] = { acumulada: acumulada, tasa: m.tasa };
    });


    /* Una cuenta que se abre en subcuentas no recibe asientos: los reciben ellas.
       No hace falta marcarlo, se ve solo. */
    Object.keys(cuentas).forEach((c) => {
      const padre = cuentas[c].suma_en;
      if (padre && cuentas[padre] && cuentas[padre].se_asienta !== false) {
        cuentas[padre].se_asienta = false;
        if (noSeAsientan.indexOf(padre) < 0) noSeAsientan.push(padre);
      }
    });

    if (repetidas.length) {
      errores.push("Hay cuentas repetidas en el plan: " +
                   Array.from(new Set(repetidas)).join(", ") + ".");
    }
    if (!Object.keys(cuentas).length) errores.push("La hoja «Plan de cuentas» está vacía.");

    /* -- apertura: se cierran los resultados -- */
    const esResultado = (c) => {
      const m = cuentas[c];
      if (!m) return false;
      return m.linea.indexOf("er.") === 0 || m.linea === "anexo.gastos_naturaleza";
    };
    const cuentaAcumulados = roles["resultados_acumulados"];
    const apertura = {};
    /* El balance anterior trae el resultado del ejercicio pasado cuenta por
       cuenta, y esas cuentas se cierran contra los resultados no asignados. Pero
       antes de cerrarlas hay que guardarlas: son la **columna comparativa** del
       estado de resultados y del anexo de gastos, que de otra forma habría que
       transcribir a mano del balance publicado. Se guardan clasificadas con el
       plan de este ejercicio, que es lo que las hace comparables. */
    const compResultados = {}, compGastos = {};
    let resultadoAnterior = 0, sinMapear = [];
    registros(buscarHoja(libro, "Apertura")).forEach((r) => {
      const cuenta = texto(r["cuenta"]);
      if (!cuenta) return;
      const saldo = numero(r["saldo"]);
      if (!cuentas[cuenta]) sinMapear.push(cuenta);
      if (esResultado(cuenta)) {
        resultadoAnterior += saldo;
        const m = cuentas[cuenta];
        if (m.linea === "anexo.gastos_naturaleza") {
          const n = m.concepto || cuenta;
          compGastos[n] = (compGastos[n] || 0) + saldo;
          const linea = `er.gastos.${m.columna}`;
          compResultados[linea] = (compResultados[linea] || 0) - saldo;
        } else {
          /* Los ingresos, el ajuste y el impuesto tienen saldo acreedor: se dan
             vuelta, como en el estado. */
          const signo = -1;   // todos los renglones del estado se dan vuelta
          compResultados[m.linea] = (compResultados[m.linea] || 0) + saldo * signo;
        }
        return;
      }
      apertura[cuenta] = (apertura[cuenta] || 0) + saldo;
    });
    if (sinMapear.length) {
      errores.push("Estas cuentas de la apertura no están en el plan de cuentas: " +
                   Array.from(new Set(sinMapear)).join(", ") + ".");
    }
    if (Math.abs(resultadoAnterior) > TOL) {
      if (!cuentaAcumulados) {
        errores.push("La apertura trae cuentas de resultado para cerrar, pero ninguna " +
                     "cuenta tiene el rol «resultados_acumulados».");
      } else {
        apertura[cuentaAcumulados] = (apertura[cuentaAcumulados] || 0) + resultadoAnterior;
      }
    }
    Object.keys(apertura).forEach((c) => {
      if (Math.abs(apertura[c]) <= 0.005) delete apertura[c];
    });

    /* -- comprobantes -- */
    const cambio = (r) => numero(r["tipo de cambio"]) || 1;
    const totalDeclarado = (r) => numero(r["total"]);
    const detalle = (r) => numero(r["neto gravado"]) + numero(r["iva"]) +
      numero(r["no gravado"]) + numero(r["exento"]) + numero(r["otros tributos"]);

    const descuadrados = [];
    const fueraDelEjercicio = [];
    const revisar = (r, f, quien) => {
      if (!f) return;
      if (f < inicio || f > cierre) fueraDelEjercicio.push(`${quien} del ${f}`);
      const d = detalle(r), t = totalDeclarado(r);
      if (d && t && Math.abs(d - t) > TOL) {
        descuadrados.push(`${quien} del ${f}: el detalle da ${pesos(d, 2)} y el total ` +
                          `dice ${pesos(t, 2)}`);
      }
    };

    const ventas = registros(buscarHoja(libro, "Ventas")).map((r) => {
      const f = fecha(r["fecha"]), tc = cambio(r);
      revisar(r, f, `Venta ${texto(r["punto de venta"]) || ""}-${texto(r["numero"]) || ""}`);
      return {
        fecha: f, tipo: texto(r["tipo"]), punto_venta: r["punto de venta"],
        numero: r["numero"], cuit: r["cuit receptor"], receptor: texto(r["receptor"]),
        moneda: texto(r["moneda"]) || "$", tipo_cambio: tc,
        neto_origen: numero(r["neto gravado"]), iva_origen: numero(r["iva"]),
        no_gravado_origen: numero(r["no gravado"]), exento_origen: numero(r["exento"]),
        neto: numero(r["neto gravado"]) * tc, iva: numero(r["iva"]) * tc,
      };
    }).filter((v) => v.fecha);

    const conceptosSinCuenta = [];
    const compras = registros(buscarHoja(libro, "Compras")).map((r) => {
      const f = fecha(r["fecha"]), tc = cambio(r);
      revisar(r, f, `Compra ${texto(r["punto de venta"]) || ""}-${texto(r["numero"]) || ""}`);
      const concepto = texto(r["concepto"]);
      if (concepto && !cuentas[concepto]) conceptosSinCuenta.push(concepto);
      return {
        fecha: f, tipo: texto(r["tipo"]), punto_venta: r["punto de venta"],
        numero: r["numero"], cuit: r["cuit emisor"], emisor: texto(r["emisor"]),
        concepto: concepto,
        moneda: texto(r["moneda"]) || "$", tipo_cambio: tc,
        neto_gravado: numero(r["neto gravado"]) * tc,
        neto_no_gravado: numero(r["no gravado"]) * tc,
        exento: numero(r["exento"]) * tc,
        otros_tributos: numero(r["otros tributos"]) * tc,
        iva: numero(r["iva"]) * tc,
        total: totalDeclarado(r) * tc,
      };
    }).filter((c) => c.fecha);

    const sinConcepto = compras.filter((c) => !c.concepto).length;
    if (sinConcepto) {
      errores.push(`${sinConcepto} comprobante(s) de compra no tienen concepto: ` +
                   "sin concepto no hay cuenta a la que imputarlos.");
    }
    if (conceptosSinCuenta.length) {
      errores.push("Estos conceptos de compra no están en el plan de cuentas: " +
                   Array.from(new Set(conceptosSinCuenta)).join(", ") + ".");
    }

    const retenciones = registros(buscarHoja(libro, "Retenciones")).map((r) => ({
      fecha: fecha(r["fecha"]), certificado: texto(r["certificado"]),
      importe: numero(r["importe"]),
    })).filter((r) => r.fecha);

    /* Los nombres de columna de los tres exportadores de ARCA no coinciden entre
       sí; se acepta el que venga. */
    const alguno = (r, nombres) => {
      for (let i = 0; i < nombres.length; i++) {
        const v = r[nombres[i]];
        if (v !== null && v !== undefined && v !== "") return v;
      }
      return null;
    };

    const pagos = registros(buscarHoja(libro, "Pagos ARCA")).map((r) => ({
      fecha: fecha(alguno(r, ["fecha", "fecha de pago"])),
      vep: texto(alguno(r, ["vep", "nro. vep"])),
      cuenta: texto(alguno(r, ["cuenta", "imputacion contable"])),
      detalle: texto(alguno(r, ["detalle", "descripcion"])),
      importe: numero(r["importe"]),
    })).filter((p) => p.fecha);

    /* Ingresos brutos: una fila por período, con la fecha en que se canceló. El
       importe es el que se pagó, que es el que se devenga. */
    const iibb = registros(buscarHoja(libro, "IIBB")).map((r) => ({
      periodo: periodo(alguno(r, ["periodo", "registro"])),
      vencimiento: fecha(alguno(r, ["vencimiento", "vencimientodescendente"])),
      importe: numero(alguno(r, ["importe", "pagado"])),
      cancelado: fecha(r["cancelado"]),
      estado: texto(r["estado"]),
    })).filter((r) => r.periodo);

    const ddjjIva = registros(buscarHoja(libro, "DDJJ IVA")).map((r) => ({
      periodo: periodo(r["periodo"]),
      debito_fiscal: numero(alguno(r, ["debito fiscal"])),
      credito_fiscal: numero(alguno(r, ["credito fiscal"])),
      retenciones: numero(alguno(r, ["retenciones y percepciones", "retenc. y percep."])),
      saldo_impuesto: numero(alguno(r, ["saldo del impuesto"])),
      libre_disponibilidad: numero(alguno(r,
        ["libre disponibilidad", "libre disp. del periodo"])),
    })).filter((r) => r.periodo);

    const ddjjGanancias = registros(buscarHoja(libro, "DDJJ Ganancias")).map((r) => ({
      fecha: fecha(alguno(r, ["fecha", "fecha asiento"])),
      ejercicio: texto(r["ejercicio"]),
      impuesto_determinado: numero(r["impuesto determinado"]),
      credito_ley_25413: numero(alguno(r, ["credito ley 25.413", "credeb"])),
      retenciones: numero(r["retenciones"]),
      anticipos: numero(r["anticipos"]),
      total_a_pagar: numero(alguno(r, ["total a pagar"])),
    })).filter((r) => r.fecha);

    /* Los asientos escritos a mano. Un renglón por línea; las que comparten el
       número de asiento van juntas. Si no hay número, agrupa la fecha. */
    /* Los asientos escritos a mano llegan de dos hojas con la misma forma:
       «Ajustes», que se escribe a mano, y «MF Asientos», que la arma la
       aplicación de Mis Facilidades. La segunda trae además la decisión tomada:
       la columna «Se pega» dice cuáles son asientos y cuáles son el registro de
       algo que no hay que asentar —una cuota fuera del ejercicio, un pago a
       cuenta que ya entró por el volante—. Ahí «no» es no: un renglón sin marca
       en una hoja que tiene la columna no se pega. */
    const cuentasDeAjuste = [], descartados = [];
    const aMano = (nombreHoja) => {
      const hoja = buscarHoja(libro, nombreHoja);
      const filas = registros(hoja);
      const decide = filas.length && "se pega" in filas[0];
      return filas.map((r) => {
        const pega = !decide || /^s[ií]$/i.test(String(r["se pega"] || "").trim());
        const cuenta = texto(alguno(r, ["cuenta", "cuentas"]));
        if (pega && cuenta && !cuentas[cuenta]) cuentasDeAjuste.push(cuenta);
        return {
          /* El número agrupa los renglones de un mismo asiento. Es de la
             planilla, no del libro: al diario el asiento entra por su fecha y
             se numera ahí. */
          asiento: texto(alguno(r, ["asiento", "numero de ajuste", "numero", "n°"])),
          fecha: fecha(r["fecha"]), nombre: texto(alguno(r, ["nombre", "titulo"])),
          glosa: texto(alguno(r, ["glosa", "descripcion asiento", "descripcion",
                                  "detalle", "concepto"])),
          cuenta: cuenta, debe: numero(r["debe"]), haber: numero(r["haber"]),
          pega: pega, porque: texto(alguno(r, ["por que no", "porque no"])),
          observacion: texto(r["observacion"]),
        };
      }).filter((x) => x.fecha && x.cuenta);
    };

    const todosAMano = aMano("Ajustes").concat(aMano("MF Asientos"));
    todosAMano.forEach((x) => { if (!x.pega) descartados.push(x); });
    const manuales = todosAMano.filter((x) => x.pega).map((x) => ({
      asiento: x.asiento, fecha: x.fecha, nombre: x.nombre, glosa: x.glosa,
      cuenta: x.cuenta, debe: x.debe, haber: x.haber,
    }));

    /* Las observaciones que la aplicación de Mis Facilidades dejó escritas sobre
       asientos que sí se pegan: son cosas que vio y no pudo resolver sola. */
    const observados = todosAMano.filter((x) => x.pega && x.observacion);
    if (observados.length) {
      const textos = Array.from(new Set(observados.map(
        (x) => `${x.asiento || x.fecha}: ${x.observacion}`)));
      avisos.push("A-I07 · observaciones sobre asientos que se pegan: " +
                  textos.join("; ").replace(/\.+$/, "") + ".");
    }
    if (cuentasDeAjuste.length) {
      errores.push("Estas cuentas de «Ajustes» no están en el plan de cuentas: " +
                   Array.from(new Set(cuentasDeAjuste)).join(", ") + ".");
    }

    const compensaciones = registros(buscarHoja(libro, "Compensaciones")).map((r) => ({
      fecha: fecha(alguno(r, ["fecha", "fecha operacion"])),
      cuenta: texto(r["cuenta"]),
      detalle: texto(alguno(r, ["detalle", "concepto dest"])),
      importe: numero(r["importe"]),
    })).filter((r) => r.fecha);

    const deOtrasHojas = pagos.map((p) => ({ cuenta: p.cuenta, hoja: "Pagos ARCA" }))
      .concat(compensaciones.map((x) => ({ cuenta: x.cuenta, hoja: "Compensaciones" })))
      .filter((x) => x.cuenta && !cuentas[x.cuenta]);
    if (deOtrasHojas.length) {
      const por = {};
      deOtrasHojas.forEach((x) => { (por[x.hoja] || (por[x.hoja] = [])).push(x.cuenta); });
      Object.keys(por).forEach((h) => {
        errores.push(`Estas cuentas de «${h}» no están en el plan de cuentas: ` +
                     Array.from(new Set(por[h])).join(", ") + ".");
      });
    }
    if (compensaciones.some((x) => !x.cuenta)) {
      errores.push("Hay compensaciones sin cuenta: falta decir a qué cuenta se aplica " +
                   "el saldo que se compensa.");
    }

    /* El extracto del banco. `rubro` dice la naturaleza del movimiento y con eso
       el asiento decide contra qué cuenta va; `detalle` puede nombrar una
       subcuenta —el socio que retiró, por ejemplo—. */
    const extractos = registros(buscarHoja(libro, "Extractos")).map((r) => ({
      fecha: fecha(r["fecha"]),
      descripcion: texto(alguno(r, ["descripcion", "descripción"])),
      debito: numero(alguno(r, ["debito", "debitos"])),
      credito: numero(alguno(r, ["credito", "creditos"])),
      saldo: numero(r["saldo"]),
      rubro: texto(r["rubro"]),
      detalle: texto(r["detalle"]),
    })).filter((m) => m.fecha && (m.debito || m.credito));

    const sinRubro = extractos.filter((m) => !m.rubro).length;
    if (sinRubro) {
      avisos.push(`A-I08 · ${sinRubro} movimiento(s) del extracto no tienen rubro: sin ` +
                  "rubro no hay cuenta contra la que asentarlos y quedan afuera.");
    }

    /* Los socios: la participación de cada uno y lo que retiró hasta el cierre
       anterior. Los retiros del ejercicio no salen de acá sino del extracto, que
       es el que dice cuándo salió la plata; esta tabla queda para controlarlos. */
    const socios = registros(buscarHoja(libro, "Socios")).map((r) => ({
      socio: texto(r["socio"]),
      participacion: numero(r["participacion"]),
      retiros_anteriores: numero(alguno(r, ["retiros anteriores", "retiros a 2025"])),
    })).filter((x) => x.socio);

    /* Rubro del extracto -> cuenta contra la que va. Un rubro con «ya asentado
       en» no se asienta desde el banco: entra por otra fuente. */
    const rubrosBancarios = {};
    const rubrosSinCuenta = [];
    registros(buscarHoja(libro, "Rubros bancarios")).forEach((r) => {
      const rubro = texto(r["rubro"]);
      if (!rubro) return;
      const cuenta = texto(alguno(r, ["cuenta o rol", "cuenta", "rol"]));
      const ya = texto(alguno(r, ["ya asentado en", "ya asentado"]));
      const dice = texto(alguno(r, ["si la descripcion dice", "si dice"]));
      /* Un renglón con «si la descripción dice» no reemplaza al rubro: lo afina.
         El mismo rubro puede traer un crédito fiscal y una percepción, y lo que
         los distingue es el texto del banco. */
      if (dice) {
        if (!cuenta) return;
        const previo = rubrosBancarios[rubro];
        const base = (previo && typeof previo === "object") ? previo
          : { cuenta: typeof previo === "string" ? previo : null, si_dice: [] };
        base.si_dice = base.si_dice || [];
        base.si_dice.push({ contiene: dice, cuenta: cuenta });
        rubrosBancarios[rubro] = base;
        return;
      }
      if (cuenta) {
        const previo = rubrosBancarios[rubro];
        if (previo && typeof previo === "object") previo.cuenta = cuenta;
        else rubrosBancarios[rubro] = cuenta;
      } else if (ya) rubrosBancarios[rubro] = null;
      else rubrosSinCuenta.push(rubro);
    });
    if (rubrosSinCuenta.length) {
      avisos.push("A-I09 · estos rubros del extracto no dicen contra qué cuenta van, así " +
                  "que sus movimientos no se asientan: " + rubrosSinCuenta.join(", ") + ".");
    }

    /* Los honorarios del director devengados mes a mes. Mientras la asamblea no
       los trate, lo que se le paga es un anticipo y esto es el gasto. */
    const honorariosDirector = registros(buscarHoja(libro, "Honorarios del director")).map((r) => ({
      periodo: periodo(r["periodo"]), importe: numero(r["importe"]),
    })).filter((x) => x.periodo && x.importe);

    const retirosDeclarados = registros(buscarHoja(libro, "Retiros de socios")).map((r) => ({
      fecha: fecha(r["fecha"]), socio: texto(r["socio"]),
      participacion: numero(r["participacion"]), importe: numero(r["importe"]),
      concepto: texto(r["concepto"]),
    })).filter((x) => x.fecha && x.socio);

    /* Los anticipos del período fiscal, tal como los declara la planilla. No es
       el saldo de la cuenta: incluye los que se pagaron después del cierre, que
       la contabilidad todavía no tiene y la declaración jurada sí computa. */
    const anticiposGanancias = registros(buscarHoja(libro, "Anticipos ganancias")).map((r) => ({
      fecha: fecha(r["fecha"]), concepto: texto(r["concepto"]), importe: numero(r["importe"]),
    })).filter((x) => x.fecha && x.importe);

    /* Los saldos del cierre anterior al comparativo, por cuenta. Se agrupan por
       renglón de exposición, que es como los usa el estado de flujo de efectivo:
       la variación del ejercicio anterior es su cierre contra ese. */
    const cierrePrevio = registros(buscarHoja(libro, "Cierre previo")).map((r) => ({
      cuenta: texto(r["cuenta"]), saldo: numero(r["saldo"]),
    })).filter((x) => x.cuenta);
    let comparativoEspAnterior = null;
    if (cierrePrevio.length) {
      const lineas = {};
      const sinCuenta = [];
      cierrePrevio.forEach((x) => {
        const m = cuentas[x.cuenta];
        if (!m) { sinCuenta.push(x.cuenta); return; }
        if (m.linea.indexOf("esp.") !== 0) return;
        /* El estado se lee con el activo en positivo y el pasivo también: el
           signo se lo pone el motor, igual que con los saldos del ejercicio. */
        const s = m.linea.indexOf("esp.a") === 0 ? 1 : -1;
        lineas[m.linea] = (lineas[m.linea] || 0) + x.saldo * s;
      });
      if (sinCuenta.length) {
        avisos.push("A-I12 · la segunda columna del balance anterior trae cuentas que no " +
          "están en el plan: " + Array.from(new Set(sinCuenta)).join(", ") + ".");
      }
      if (Object.keys(lineas).length) comparativoEspAnterior = lineas;
    }

    /* Las valuaciones al cierre: cuánto vale un saldo según un tercero. */
    const valuaciones = registros(buscarHoja(libro, "Valuaciones")).map((r) => ({
      cuenta: texto(r["cuenta"]), valor: numero(r["valor"]),
      resultado: texto(r["resultado"]), fuente: texto(r["fuente"]),
    })).filter((x) => x.cuenta);

    const indices = registros(buscarHoja(libro, "Índices")).map((r) => ({
      periodo: periodo(r["periodo"]), indice: numero(r["indice"]),
    })).filter((i) => i.periodo && i.indice);

    /* ---- las bases del impuesto a las ganancias ----

       La escala del artículo 73 y los topes de venta de la SEPyME cambian solos
       con el tiempo, así que entran desde la planilla y quedan guardados con el
       ejercicio: la liquidación de un ejercicio se hace con la escala de su
       período fiscal, no con la que esté cargada el día que se reimprime. */
    const escalaPlanilla = registros(buscarHoja(libro, "Escala de ganancias")).map((r) => ({
      desde: numero(r["desde"]) || 0,
      /* El último tramo no trae importe sino «En adelante», que no es un
         número: queda en nada, y nada quiere decir sin techo. */
      hasta: numero(r["hasta"]) || null,
      fijo: numero(r["fijo"]) || 0,
      alicuota: numero(r["alicuota"]),
    })).filter((t) => t.alicuota).sort((a, b) => a.desde - b.desde);
    escalaPlanilla.forEach((t, i) => {
      /* El último tramo no tiene techo: la planilla dice «En adelante» y eso no
         es un número. Los demás cierran donde empieza el que sigue. */
      if (t.hasta === null) {
        t.hasta = i + 1 < escalaPlanilla.length ? escalaPlanilla[i + 1].desde : null;
      }
    });

    /* Los topes de venta de la FACPCE, con los que se define si un ente es
       pequeño, mediano o ninguno de los dos. Los actualiza una vez al año. */
    const topesFacpce = registros(buscarHoja(libro, "Topes FACPCE")).map((r) => ({
      categoria: texto(r["categoria"]), desde: numero(r["desde"]) || 0,
      hasta: numero(r["hasta"]),
    })).filter((x) => x.categoria).sort((a, b) => a.desde - b.desde);

    const topesPlanilla = registros(buscarHoja(libro, "Topes MiPyME"));
    let topesMiPyme = null;
    if (topesPlanilla.length) {
      const limites = {};
      const hoja = buscarHoja(libro, "Topes MiPyME");
      const cab = ((hoja.filas || [])[0] || []).slice(1)
        .map((x) => String(x === null || x === undefined ? "" : x).trim()).filter(Boolean);
      (hoja.filas || []).slice(1).forEach((f) => {
        const sector = texto(f[0]);
        if (!sector) return;
        const fila = {};
        cab.forEach((c, i) => { const v = numero(f[i + 1]); if (v) fila[c] = v; });
        if (Object.keys(fila).length) limites[sector] = fila;
      });
      if (Object.keys(limites).length) topesMiPyme = limites;
    }

    /* El porcentaje que cada categoría computa a cuenta sale de la ley y vive en
       `esquema/impuesto-ley-25413.json`. La planilla lo tiene también, de puro
       práctico: se lee para controlar que los dos digan lo mismo, no para
       decidir. Si alguna vez difieren, gana el esquema y la importación avisa. */
    const computoPlanilla = registros(buscarHoja(libro, "Cómputo ley 25.413")).map((r) => ({
      categoria: texto(r["categoria"]), sector: texto(r["sector"]),
      porcentaje: numero(r["porcentaje"]),
    })).filter((x) => x.categoria && x.porcentaje !== null);
    /* La comparación la hace el diario, que es quien tiene el esquema a mano. */

    if (descuadrados.length) {
      avisos.push("A-I02 · comprobantes cuyo detalle no reconstruye el total: " +
                  descuadrados.slice(0, 6).join("; ") +
                  (descuadrados.length > 6 ? ` y ${descuadrados.length - 6} más` : "") + ".");
    }
    if (fueraDelEjercicio.length) {
      avisos.push("A-I03 · comprobantes con fecha fuera del ejercicio: " +
                  fueraDelEjercicio.slice(0, 6).join("; ") +
                  (fueraDelEjercicio.length > 6 ? ` y ${fueraDelEjercicio.length - 6} más` : "") +
                  ". Se asientan igual, en el mes de su fecha.");
    }

    /* -- qué asientos se pueden armar -- */
    const declarados = texto(j["asientos a armar"]);
    const puedeAjustar = Object.keys(cuentas).some((c) => cuentas[c].no_monetaria) &&
      serieCompleta(indices, fecha(j["cierre anterior"]), cierre);
    const hay = {
      apertura: Object.keys(apertura).length > 0,
      ventas: ventas.length > 0,
      compras: compras.length > 0,
      retenciones: retenciones.length > 0,
      iibb_ddjj: iibb.length > 0,
      iibb_pago: iibb.some((r) => r.cancelado),
      ddjj_iva_arca: ddjjIva.length > 0,
      ddjj_ganancias_arca: ddjjGanancias.length > 0,
      pagos: pagos.length > 0,
      compensaciones: compensaciones.length > 0,
      manuales: manuales.length > 0,
      extractos: extractos.length > 0 && !!roles["banco"],
      /* Si el plan trae tasas de amortización, el asiento del ejercicio se arma:
         no hace falta declararlo aparte. */
      amortizaciones: Object.keys(amortizacion).length > 0 && !!roles["amortizaciones_gasto"],
      /* La valuación al cierre se arma si la planilla declara alguna. */
      valuacion: valuaciones.length > 0,
      /* Y el impuesto, si el ente lleva la cuenta del gasto y la de la provisión:
         la determinación entera sale del plan y del diario. */
      impuesto: !!roles["impuesto_gasto"] && !!roles["provision_ganancias"],
      honorarios_director: honorariosDirector.length > 0 &&
        !!roles["honorarios_gasto"] && !!roles["honorarios_a_pagar"],
      /* El pago a cuenta del impuesto sobre los débitos y créditos: se arma si
         el ente lleva las dos cuentas, aunque no esté categorizado —sin
         certificado igual computa el porcentaje del régimen general—. */
      credito_ley_25413: !!roles["ley_25413_gasto"] && !!roles["credito_ley_25413"],
      /* El ajuste por inflación se arma si hay con qué: partidas no monetarias
         marcadas en el plan y la serie de índices completa desde el cierre
         anterior hasta el cierre. */
      axi: puedeAjustar,
      /* Y si el ente lleva dos cuentas de ajuste, el asiento que las netea. */
      neteo_axi: puedeAjustar && !!roles["axi_positivo"] && !!roles["axi_negativo"],
    };
    const pedidos = declarados
      ? declarados.split(/[,;]/).map((x) => clave(x).replace(/ /g, "_")).filter(Boolean)
      : Object.keys(hay).filter((k) => hay[k]);

    /* Los ajustes escritos a mano entran siempre que haya renglones cargados,
       aunque el ejercicio traiga la lista de asientos escrita. Alguien los
       escribió a propósito: no pueden quedar afuera sin que se note. Para
       sacarlos, se borran los renglones. */
    if (hay.manuales && pedidos.indexOf("manuales") < 0) pedidos.push("manuales");

    /* Los asientos de cierre van al final y en este orden: el ajuste por
       inflación reexpresa lo que ya está asentado —los ajustes de mano
       incluidos—, el neteo va detrás del ajuste, y el impuesto se determina sobre
       el resultado ya ajustado. */
    ["valuacion", "credito_ley_25413", "amortizaciones", "axi", "neteo_axi",
     "impuesto"].forEach((t) => {
      const i = pedidos.indexOf(t);
      if (i >= 0) pedidos.push(pedidos.splice(i, 1)[0]);
    });

    /* Cada ranura del asiento admite más de un rol: se toma el primero que el
       ente tenga marcado. Un ente con deudores y proveedores asienta las ventas
       contra clientes; uno que no lleva cuenta corriente, contra la
       contrapartida. */
    const CUENTAS_POR_ASIENTO = {
      apertura: {},
      ventas: { contra: ["clientes", "contrapartida"], ventas: ["ventas"],
                debito_fiscal: ["debito_fiscal"] },
      retenciones: { retenciones: ["retenciones_ganancias"],
                     contra: ["clientes", "contrapartida"] },
      compras: { contra: ["proveedores", "contrapartida"],
                 credito_fiscal: ["credito_fiscal"] },
      iibb: { gasto: ["iibb_gasto"], contra: ["proveedores", "contrapartida"] },
      iibb_ddjj: { gasto: ["iibb_gasto"], a_pagar: ["iibb_a_pagar"] },
      iibb_pago: { a_pagar: ["iibb_a_pagar"], contra: ["banco", "contrapartida"] },
      ddjj_iva: { debito_fiscal: ["debito_fiscal"], credito_fiscal: ["credito_fiscal"],
                  a_pagar: ["iva_a_pagar"] },
      ddjj_iva_arca: { debito_fiscal: ["debito_fiscal"], credito_fiscal: ["credito_fiscal"],
                       retenciones: ["retenciones_iva"], a_pagar: ["iva_a_pagar"],
                       libre_disponibilidad: ["iva_libre_disponibilidad"] },
      ddjj_ganancias: { provision: ["provision_ganancias"], a_pagar: ["ganancias_a_pagar"],
                        saldo_favor: ["ganancias_saldo_favor"], contra: ["contrapartida"] },
      ddjj_ganancias_arca: { provision: ["provision_ganancias"],
                             credito_ley_25413: ["credito_ley_25413"],
                             retenciones: ["retenciones_ganancias"],
                             anticipos: ["anticipos_ganancias"],
                             a_pagar: ["ganancias_a_pagar"] },
      compensaciones: { origen: ["iva_libre_disponibilidad"] },
      manuales: {},
      pagos: { contra: ["banco", "contrapartida"] },
      extractos: { banco: ["banco"] },
      honorarios_director: { gasto: ["honorarios_gasto"], a_pagar: ["honorarios_a_pagar"] },
      credito_ley_25413: { gasto: ["ley_25413_gasto"], credito: ["credito_ley_25413"] },
      valuacion: {},
      honorarios: { anticipo: ["anticipo_honorarios"], a_pagar: ["honorarios_a_pagar"],
                    gasto: ["honorarios_gasto"], contra: ["contrapartida"] },
      amortizaciones: { gasto: ["amortizaciones_gasto"] },
      /* `null` al final de la lista marca una ranura opcional: si el ente no
         tiene el rol, el asiento se arma igual sin ella. */
      axi: { recpam: ["axi_positivo", "recpam"],
             amortizaciones: ["amortizaciones_gasto", null] },
      neteo_axi: { positivo: ["axi_positivo"], negativo: ["axi_negativo"] },
      impuesto: { gasto: ["impuesto_gasto"], provision: ["provision_ganancias"] },
    };

    /* La hoja «Asientos» es solo para excepciones: un renglón por ranura que no
       se resuelve sola. Lima Sur, por ejemplo, no paga ingresos brutos por el
       banco sino contra deudores por venta. */
    const excepciones = {}, agrupacion = {};
    registros(buscarHoja(libro, "Asientos")).forEach((r) => {
      const t = clave(r["asiento"]).replace(/ /g, "_");
      if (!t) return;
      const ag = clave(r["agrupar"]);
      if (ag) agrupacion[t] = ag;
      const ranura = clave(r["ranura"]).replace(/ /g, "_");
      const valor = texto(alguno(r, ["cuenta o rol", "cuenta", "rol"]));
      if (!ranura || !valor) return;
      const en = excepciones[t] || (excepciones[t] = {});
      /* «desde» y «hasta» permiten que una misma ranura cambie de cuenta dentro
         del ejercicio. Sin fechas, la excepción vale para todo. */
      const desde = fecha(r["desde"]), hasta = fecha(r["hasta"]);
      if (!desde && !hasta) { en[ranura] = valor; return; }
      const tramo = { cuenta: valor };
      if (desde) tramo.desde = desde;
      if (hasta) tramo.hasta = hasta;
      const previo = en[ranura];
      const lista = previo && previo.tramos ? previo.tramos
        : (typeof previo === "string" ? [{ cuenta: previo }] : []);
      lista.push(tramo);
      en[ranura] = { tramos: lista };
    });

    /* Un tramo que cubre el ejercicio entero es lo mismo que no tener tramos:
       se simplifica, así el archivo del ente queda legible. */
    Object.keys(excepciones).forEach((t) => {
      const en = excepciones[t];
      Object.keys(en).forEach((ranura) => {
        const v = en[ranura];
        if (!v || !v.tramos || v.tramos.length !== 1) return;
        const u = v.tramos[0];
        if ((!u.desde || u.desde <= inicio) && (!u.hasta || u.hasta >= cierre)) {
          en[ranura] = u.cuenta;
        }
      });
    });

    const asientos = [], sinRol = [];
    pedidos.forEach((t) => {
      const plantilla = CUENTAS_POR_ASIENTO[t];
      if (!plantilla) {
        errores.push(`«${t}» no es un asiento que la aplicación sepa armar. Los que ` +
                     "conoce son: " + Object.keys(CUENTAS_POR_ASIENTO).join(", ") + ".");
        return;
      }
      const puesto = excepciones[t] || {};
      const elegidas = {}, faltan = [];
      Object.keys(plantilla).forEach((ranura) => {
        if (puesto[ranura]) { elegidas[ranura] = puesto[ranura]; return; }
        const lista = plantilla[ranura];
        const opcional = lista[lista.length - 1] === null;
        const posibles = opcional ? lista.slice(0, -1) : lista;
        const rol = posibles.find((x) => roles[x]);
        if (rol) elegidas[ranura] = rol;
        else if (!opcional) faltan.push(posibles.join(" o "));
      });
      if (faltan.length) {
        sinRol.push(`${t} (falta marcar: ${faltan.join(", ")})`);
        return;
      }
      /* El ajuste por inflación puede llevar una cuenta de resultado o dos, una
         por signo. Con dos, la ranura `recpam` sobra. */
      if (t === "axi" && roles["axi_positivo"] && roles["axi_negativo"]) {
        delete elegidas.recpam;
        elegidas.positivo = "axi_positivo";
        elegidas.negativo = "axi_negativo";
      }
      const cfg = { template: t };
      if (Object.keys(elegidas).length) cfg.cuentas = elegidas;
      if (agrupacion[t]) cfg.agrupar = agrupacion[t];
      if (t === "extractos") cfg.rubros = rubrosBancarios;
      asientos.push(cfg);
    });
    if (sinRol.length) {
      avisos.push("A-I04 · estos asientos no se arman porque falta marcar un rol en la " +
                  "hoja «Plan de cuentas»: " + sinRol.join("; ") + ".");
    }

    /* -- los cuatro archivos -- */
    const archivos = {};

    archivos["ente.json"] = {
      slug: slug,
      plan: texto(e["plan de exposicion"]) || "estudio-cfl",
      denominacion: denominacion,
      cuit: texto(e["cuit"]),
      tipo_ente: "con_fines_lucro",
      clasificacion: clave(e["clasificacion"]) || "pequena",
      cierre_mes_dia: cierre.slice(5),
      datos: [{
        vigente_desde: fecha(e["fecha de inscripcion"]) || inicio,
        actividad_principal: texto(e["actividad principal"]),
        domicilio_legal: texto(e["domicilio legal"]),
        domicilio_fiscal: texto(e["domicilio fiscal"]),
        inscripcion: {
          organismo: texto(e["organismo de inscripcion"]),
          numero: texto(e["numero de inscripcion"]),
          folio: texto(e["folio"]),
          libro: texto(e["libro"]),
          tomo: texto(e["tomo"]),
          fecha: fecha(e["fecha de inscripcion"]),
          origen: texto(e["origen de la inscripcion"]),
        },
        capital: {
          participaciones: numero(e["participaciones"]),
          valor_nominal: numero(e["valor nominal"]),
          suscripto: numero(e["capital suscripto"]),
          inscripto: numero(e["capital suscripto"]),
          integrado: numero(e["capital integrado"]) || numero(e["capital suscripto"]),
        },
        /* De la categorización MiPyME depende cuánto del impuesto sobre los
           débitos y créditos se computa a cuenta de ganancias. Va en el bloque
           fechado del ente porque cambia de un ejercicio a otro. */
        mipyme: {
          certificado_vigente: sino(e["certificado mipyme vigente"]),
          categoria: texto(e["categoria mipyme"]),
          sector: texto(e["sector mipyme"]),
          /* Con qué tabla de topes se categorizó: la vigente el día del trámite
             o de la renovación, no la del cierre del ejercicio. */
          certificado_desde: fecha(e["fecha del certificado mipyme"]),
        },
        firmantes: [{
          nombre: texto(e["firmante"]),
          cargo: texto(e["cargo del firmante"]) || "",
          tratamiento: /directora/i.test(String(e["cargo del firmante"] || ""))
            ? "Señora Directora"
            : /director/i.test(String(e["cargo del firmante"] || ""))
              ? "Señor Director" : "Señores",
        }],
      }],
      criterios: {},
    };

    archivos["mapeo-cuentas.json"] = {
      ente: slug,
      plan: archivos["ente.json"].plan,
      version: new Date().toISOString().slice(0, 10),
      nota: "Importado desde el archivo de importación. La clasificación del gasto vive " +
            "acá y en ningún otro lado.",
      cuentas: cuentas,
      sin_uso: [],
    };

    const parametros = {};
    if (numero(j["alicuota de ingresos brutos"])) {
      parametros.iibb = {
        alicuota: numero(j["alicuota de ingresos brutos"]),
        base: "neto_gravado_ventas",
        reexpresa: sino(j["reexpresa ingresos brutos"]),
      };
    }
    if (numero(j["alicuota del impuesto a las ganancias"])) {
      parametros.ganancias = {
        alicuota: numero(j["alicuota del impuesto a las ganancias"]),
        tope_honorarios_directorio: numero(j["tope de honorarios del directorio"]),
        honorarios_devengados: numero(j["honorarios devengados"]),
        ajuste_impositivo: ajusteImpositivo,
      };
    }
    /* El capital nominal no se mueve: su reexpresión va a la cuenta de ajuste del
       capital. Se deduce de los roles, así no hay que escribirlo en cada ente. */
    if (roles["capital"] && roles["ajuste_capital"]) {
      const cap = cuentas[roles["capital"]];
      if (cap && cap.no_monetaria && !cap.ajuste_a) cap.ajuste_a = roles["ajuste_capital"];
    }
    if (noSeAsientan.length) parametros.no_se_asientan = noSeAsientan.slice().sort();

    if (Object.keys(amortizacion).length) {
      parametros.amortizacion = { criterio: "ejercicio_completo", rubros: amortizacion };
    }

    if (valuaciones.length) {
      const decl = {};
      valuaciones.forEach((v) => {
        const resultado = v.resultado || roles["resultado_inversiones"] || null;
        if (!resultado) {
          errores.push(`la valuación al cierre de «${v.cuenta}» no dice contra qué cuenta ` +
            "de resultado va la diferencia, y el ente no tiene rol «resultado_inversiones».");
          return;
        }
        decl[v.cuenta] = { valor: v.valor, resultado: resultado,
                           fuente: v.fuente || null };
      });
      if (Object.keys(decl).length) parametros.valuacion_cierre = decl;
    }

    /* ---- la determinación del impuesto a las ganancias ----

       No se declara ningún importe: se declara la **clasificación**, que es lo
       único que la ley deja al criterio del profesional. Qué cuenta no entra en
       el activo computable del Título VI lo dice el plan de cuentas de la
       empresa, en la columna «Ajuste impositivo»; los bienes de uso y los
       intangibles salen solos, por el artículo 106 a) puntos 3 y 5. */
    if (roles["impuesto_gasto"] && roles["provision_ganancias"]) {
      /* Sólo las cuentas patrimoniales: el ajuste del Título VI compara activo
         contra pasivo, y una cuenta de resultado no está de ningún lado. */
      const noComputables = Object.keys(cuentas)
        .filter((c) => (cuentas[c].linea || "").indexOf("esp.") === 0 &&
                       cuentas[c].ajuste_impositivo === "no computable").sort();
      const motivos = {
        "esp.anc.": "Bienes muebles amortizables y bienes inmateriales (art. 106 a) 3 y 5)",
      };
      noComputables.forEach((c) => {
        motivos[c] = "Marcada «no computable» en el plan de cuentas de la empresa.";
      });
      const creditos = [];
      if (anticiposGanancias.length) {
        creditos.push({ concepto: "Anticipos del período fiscal",
                        origen: "anticipos_ganancias" });
      } else if (roles["anticipos_ganancias"]) {
        creditos.push({ concepto: "Anticipos ingresados",
                        cuenta: roles["anticipos_ganancias"] });
      }
      if (roles["retenciones_ganancias"]) {
        creditos.push({ concepto: "Retenciones sufridas",
                        cuenta: roles["retenciones_ganancias"] });
      }
      if (roles["credito_ley_25413"]) {
        creditos.push({
          concepto: "Crédito por impuesto sobre débitos y créditos (ley 25.413)",
          cuenta: roles["credito_ley_25413"], plantilla: "credito_ley_25413",
        });
      }
      parametros.ganancias = {
        version: 2,
        /* La escala del artículo 73 que corresponde es la del período fiscal, y
           el período fiscal es el año del cierre. */
        escala: cierre.slice(0, 4),
        amortizacion_impositiva: { actualizar_al_cierre: true, norma: "art. 93" },
        honorarios_directorio: roles["honorarios_gasto"] ? {
          cuenta_gasto: roles["honorarios_gasto"],
          criterio_tope: "utilidad_antes_de_honorarios_neta_de_impuesto",
          asignados_por_asamblea: sino(j["honorarios asignados por asamblea"]),
        } : null,
        ajuste_inflacion: {
          no_computable: { por_linea: ["esp.anc."], cuentas: noComputables,
                           motivos: motivos },
          /* La fase dinámica no se declara aparte: es la misma decisión. Los
             movimientos de un activo no computable son ajuste positivo cuando la
             cuenta sube —una compra, un retiro de socio— y negativo cuando baja
             —una venta, un rescate—. Lo deduce el diario. */
          fase_ii: { derivada: true },
        },
        creditos: creditos,
      };
      if (!noComputables.length) {
        avisos.push("A-I11 · ninguna cuenta quedó fuera del ajuste por inflación " +
          "impositivo. La columna «AXI Impositivo» de la tabla `Cuentas` es la que lo " +
          "dice: destildada quiere decir que la cuenta no computa. Los bienes de uso y " +
          "los intangibles salen solos, pero las cuotas partes de fondos comunes " +
          "(art. 106 a) 7) y los saldos deudores de socios (art. 106 a) 13) hay que " +
          "destildarlos, y cambian el ajuste.");
      }
    }

    /* Una cuenta patrimonial sin marca en la columna «AXI Impositivo» entra al
       activo computable por omisión, y eso no es una decisión: es un olvido. */
    (() => {
      const sinMarca = Object.keys(cuentas).filter((c) => {
        const l = cuentas[c].linea || "";
        if (l.indexOf("esp.") !== 0) return false;
        return !cuentas[c].ajuste_impositivo;
      }).sort();
      if (sinMarca.length) {
        avisos.push("A-I14 · estas cuentas patrimoniales no dicen si entran en el ajuste " +
          "por inflación impositivo, así que entran: " + sinMarca.join(", ") +
          ". La columna es «AXI Impositivo», en la tabla `Cuentas` de la hoja `auxiliar`.");
      }
    })();

    /* La variación del ejercicio anterior: índice del cierre anterior sobre el
       del cierre de dos años atrás. Si la serie no llega, queda en nada y la
       nota lo dice. */
    let variacionAnterior = null;
    (() => {
      const ca = fecha(j["cierre anterior"]);
      if (!ca) return;
      const antes = new Date(ca + "T00:00:00Z");
      antes.setUTCFullYear(antes.getUTCFullYear() - 1);
      const k = (f) => String(f).slice(0, 7);
      const tengo = {};
      indices.forEach((i) => { tengo[i.periodo] = i.indice; });
      const a = tengo[k(ca)], b = tengo[k(antes.toISOString())];
      if (a && b) variacionAnterior = a / b - 1;
    })();

    /* La categoría de la FACPCE la declara la carátula; los topes de venta dicen
       cuál le tocaría. La aplicación **no reclasifica a nadie** —el parámetro de
       la norma tiene sus propias definiciones y su propio período— pero si lo
       declarado y las ventas del ejercicio se contradicen, lo dice. */
    (() => {
      if (!topesFacpce.length) return;
      const declarada = archivos["ente.json"].clasificacion;
      const netas = ventas.reduce((t, v) => t + (v.neto || 0), 0);
      const banda = topesFacpce.find((x) =>
        netas > x.desde && (x.hasta === null || netas <= x.hasta));
      if (!banda) return;
      const equivale = { pequena: "pequena", mediana: "mediana", resto: "resto",
                         grande: "resto" };
      const segunVentas = equivale[clave(banda.categoria)] || clave(banda.categoria);
      if (segunVentas === declarada) return;
      avisos.push(`A-I15 · la carátula declara al ente como «${declarada}» y las ventas ` +
        `netas del ejercicio —${pesos(netas, 2)}— caen en la banda «${banda.categoria}» ` +
        "de la tabla `Par_FACPCE`. Puede estar bien: el parámetro de la norma no son " +
        "las ventas de un ejercicio a secas. Pero conviene mirarlo.");
    })();

    /* Un balance sin amortizar, sin valuar al cierre o sin impuesto no es un
       balance a medio hacer: es un balance mal. Si el dato no está, se dice acá
       y queda escrito en el archivo del ente, para que no se emita sin verlo. */
    const faltan = [];
    if (!parametros.amortizacion) {
      faltan.push("Las tasas de amortización. Van en la columna «Amortizacion» de la " +
        "tabla `Cuentas` de la hoja `auxiliar`, en la cuenta del valor de origen. Sin eso " +
        "el ejercicio no amortiza.");
    }
    if (!escalaPlanilla.length) {
      faltan.push("La escala del artículo 73 del período fiscal. Va en la tabla " +
        "`Esc_Impuesto` de la hoja `Bases Ganancias`. Sin eso se usa la que trae la " +
        "aplicación, que puede ser de otro año.");
    }
    if (!parametros.ganancias) {
      faltan.push("El impuesto a las ganancias: falta el rol «impuesto_gasto» o " +
        "«provision_ganancias» en el plan de cuentas. Sin eso el ejercicio cierra sin " +
        "impuesto determinado.");
    } else if (parametros.ganancias.honorarios_directorio &&
               !parametros.ganancias.honorarios_directorio.asignados_por_asamblea) {
      faltan.push("Decir si la asamblea asignó individualmente los honorarios del " +
        "directorio antes del vencimiento de la declaración jurada. Va en `Datos " +
        "Caratulas`, en la fila «Asignacion de honorarios en el ejercicio».");
    }
    if (!comparativoEspAnterior) {
      faltan.push("Los saldos del cierre anterior al comparativo. Van en una segunda " +
        "columna de la hoja del balance anterior. Sin eso el estado de flujo de efectivo " +
        "sale sin columna comparativa.");
    }
    if (variacionAnterior === null) {
      faltan.push("La serie de índices llega hasta el cierre anterior, pero no un año " +
        "más atrás. Con esos doce índices más, la nota de unidad de medida dice sola la " +
        "inflación del ejercicio comparativo, que hoy sale en cero.");
    }

    archivos["ejercicio.json"] = {
      ente: slug,
      numero: numero(j["numero de ejercicio"]) || null,
      inicio: inicio,
      cierre: cierre,
      inicio_anterior: fecha(j["inicio anterior"]),
      cierre_anterior: fecha(j["cierre anterior"]),
      origen: "importado desde el archivo de importación",
      cuentas: roles,
      asientos: asientos,
      parametros: parametros,
      /* Dónde y cuándo se firma el informe del auditor. Si el papel no lo dice,
         el informe sale con la fecha de cierre y sin lugar, que es lo que había
         antes de que la carátula los trajera. */
      informe_auditoria: (texto(j["lugar de firma del informe"]) ||
                          fecha(j["fecha del informe"]))
        ? { lugar: texto(j["lugar de firma del informe"]) || null,
            fecha: fecha(j["fecha del informe"]) || null }
        : null,
      /* Lo que la planilla todavía no dice y hace falta para cerrar el ejercicio.
         Se conserva entre importaciones: es una lista de trabajo, no un dato. */
      faltan: faltan.length ? faltan : null,
      /* Los anticipos del período fiscal, para la determinación del impuesto.
         Van acá y no en `parametros` porque son un dato de la planilla, no un
         criterio del profesional. */
      anticipos_ganancias: anticiposGanancias.length ? anticiposGanancias : null,
      /* La cotización del dólar al cierre, tal como la declara la carátula. */
      cotizacion_dolar_cierre: numero(j["cotizacion del dolar al cierre"]) || null,
      /* Los parámetros que cambian solos con el tiempo, tal como los trae la
         planilla del ejercicio. Se guardan **con el ejercicio** y no en el
         esquema de la aplicación: la escala del artículo 73 se actualiza todos
         los años y los topes de la SEPyME una vez al año, y un ejercicio se
         reimprime dentro de dos años con los parámetros que tenía. */
      bases: (escalaPlanilla.length || topesMiPyme || computoPlanilla.length) ? {
        origen: "hoja `Bases Ganancias` del papel de trabajo",
        escala: escalaPlanilla.length ? {
          periodo_fiscal: cierre.slice(0, 4),
          base_legal: "Art. 73 inc. a) de la Ley de Impuesto a las Ganancias (t.o. 2019), " +
                      "alícuotas según ley 27.630",
          actualizacion: "Los montos se actualizan anualmente por la variación del IPC " +
                         "del INDEC.",
          tramos: escalaPlanilla,
        } : null,
        topes_mipyme: topesMiPyme,
        topes_facpce: topesFacpce.length ? topesFacpce : null,
        /* Sólo para controlar: el porcentaje de cómputo sale de la ley y vive en
           `esquema/impuesto-ley-25413.json`. */
        computo_ley_25413: computoPlanilla.length ? computoPlanilla : null,
      } : null,
      /* La comparativa del estado de resultados y del anexo de gastos, en moneda
         del cierre anterior: quien la use la reexpresa. */
      comparativo: {
        moneda: "cierre anterior",
        /* La inflación del ejercicio comparativo, para la nota de unidad de
           medida. No se declara: sale sola si la serie de índices llega un año
           más atrás del cierre anterior. */
        variacion: variacionAnterior,
        esp_anterior: comparativoEspAnterior ? {
          nota: "Saldos al cierre anterior al comparativo, por renglón de exposición, en " +
                "moneda del cierre anterior. Salen de la segunda columna de la hoja del " +
                "balance anterior.",
          moneda: "cierre anterior",
          lineas: comparativoEspAnterior,
        } : null,
        nota: "Sale del balance del ejercicio anterior, clasificado con el plan de " +
              "cuentas de este ejercicio. Si alguna cuenta cambió de columna, la " +
              "comparativa no es la que se publicó y el cambio se expone en notas.",
        resultados: Object.keys(compResultados).sort()
          .reduce((o, k) => (o[k] = compResultados[k], o), {}),
        gastos: Object.keys(compGastos).sort()
          .reduce((o, k) => (o[k] = compGastos[k], o), {}),
      },
      apertura: Object.assign(
        { nota: "Saldos del cierre anterior con los resultados ya cerrados: el resultado " +
                `del ejercicio anterior (${pesos(resultadoAnterior, 2)}) está sumado a ` +
                `${cuentaAcumulados || "resultados no asignados"}.` },
        Object.keys(apertura).sort().reduce((o, k) => (o[k] = apertura[k], o), {})),
    };

    archivos["fuentes.json"] = {
      ente: slug,
      ejercicio: anio,
      origen: "archivo de importación",
      extraido: new Date().toISOString().slice(0, 10),
      indices: indices,
      ventas: ventas,
      compras: compras,
      pagos_afip: pagos,
      retenciones_ganancias: retenciones,
      iibb: iibb,
      ddjj_iva: ddjjIva,
      ddjj_ganancias: ddjjGanancias,
      compensaciones: compensaciones,
      asientos_manuales: manuales,
      extractos: extractos,
      socios: socios,
      retiros_declarados: retirosDeclarados,
      honorarios_director: honorariosDirector,
    };

    /* -- controles -- */
    const controles = [];
    const control = (id, desc, esperado, obtenido) => controles.push({
      id, descripcion: desc, esperado, obtenido, diferencia: obtenido - esperado,
    });

    let sumaApertura = 0;
    for (const c in apertura) sumaApertura += apertura[c];
    control("C-I01", "El asiento de apertura cierra", 0, sumaApertura);

    const cierreAnterior = archivos["ejercicio.json"].cierre_anterior;
    const mesesNecesarios = [cierre.slice(0, 7)];
    if (cierreAnterior) mesesNecesarios.push(cierreAnterior.slice(0, 7));
    ventas.concat(compras).forEach((x) => {
      const p = x.fecha.slice(0, 7);
      if (mesesNecesarios.indexOf(p) < 0) mesesNecesarios.push(p);
    });
    const tengo = {};
    indices.forEach((i) => { tengo[i.periodo] = true; });
    const faltanIndices = mesesNecesarios.filter((p) => !tengo[p]).sort();
    control("C-I02", "Hay índice para todos los meses que se necesitan",
            0, faltanIndices.length);
    if (faltanIndices.length) {
      avisos.push("A-I05 · faltan índices de estos períodos: " + faltanIndices.join(", ") +
                  ". Sin ellos no se puede armar el ajuste por inflación.");
    }

    control("C-I03", "Todas las cuentas de la apertura están en el plan",
            0, Array.from(new Set(sinMapear)).length);
    control("C-I04", "Todos los conceptos de compra tienen cuenta",
            0, Array.from(new Set(conceptosSinCuenta)).length + sinConcepto);

    /* Cada declaración jurada de IVA tiene que cerrar sola: el débito fiscal es
       el crédito, más las retenciones, más el saldo a ingresar, más lo que se
       usó del saldo de libre disponibilidad del período anterior. */
    if (ddjjIva.length) {
      const orden = ddjjIva.slice().sort((x, y) => (x.periodo < y.periodo ? -1 : 1));
      let previo = 0, difIva = 0;
      orden.forEach((r) => {
        difIva += r.debito_fiscal + r.libre_disponibilidad
          - r.credito_fiscal - r.retenciones - r.saldo_impuesto - previo;
        previo = r.libre_disponibilidad;
      });
      control("C-I05", "Las declaraciones juradas de IVA cierran entre sí", 0, difIva);
    }
    if (ddjjGanancias.length) {
      const difGan = ddjjGanancias.reduce((t, r) => t + r.impuesto_determinado -
        r.credito_ley_25413 - r.retenciones - r.anticipos - r.total_a_pagar, 0);
      control("C-I06", "El impuesto determinado es igual a los pagos a cuenta más el " +
              "saldo a pagar", 0, difGan);
    }
    if (iibb.length) {
      const sinCancelar = iibb.filter((r) => !r.cancelado).length;
      control("C-I07", "Todas las declaraciones de ingresos brutos tienen fecha de " +
              "cancelación", 0, sinCancelar);
    }

    /* Cada asiento de ajuste tiene que cerrar por su cuenta: nadie lo calcula,
       lo escribió una persona. */
    if (manuales.length) {
      const por = {};
      manuales.forEach((l) => {
        const k = l.asiento || l.fecha;
        por[k] = (por[k] || 0) + l.debe - l.haber;
      });
      const noCierran = Object.keys(por).filter((k) => Math.abs(por[k]) > TOL);
      control("C-I08", "Los asientos de ajuste cierran", 0, noCierran.length);
      if (noCierran.length) {
        errores.push("Estos asientos de «Ajustes» no cierran: " + noCierran.join(", ") +
                     ". El debe y el haber de cada asiento tienen que dar lo mismo.");
      }
    }

    /* Una cuenta marcada «no se asienta» que igual recibe movimientos es un
       error: o está mal la marca, o está mal imputado el asiento. */
    if (noSeAsientan.length) {
      const usadas = {};
      const mirar = (lista, campo) => (lista || []).forEach((x) => {
        if (x[campo]) usadas[x[campo]] = true;
      });
      mirar(compras, "concepto");
      mirar(pagos, "cuenta");
      mirar(compensaciones, "cuenta");
      mirar(manuales, "cuenta");
      Object.keys(apertura).forEach((c) => { usadas[c] = true; });
      Object.keys(roles).forEach((k) => { usadas[roles[k]] = true; });
      const chocan = noSeAsientan.filter((c) => usadas[c]);
      control("C-I10", "Ninguna cuenta marcada «no se asienta» recibe movimientos",
              0, chocan.length);
      if (chocan.length) {
        avisos.push("A-I06 · estas cuentas están marcadas como que no se asientan, pero " +
                    "reciben movimientos: " + chocan.join(", ") +
                    ". O sobra la marca, o el movimiento está mal imputado.");
      }
    }

    /* La serie de índices tiene que dar la inflación que declara el propio papel
       de trabajo. Si no da, la serie no es la del ejercicio. */
    if (libro.variacionDeclarada && indices.length) {
      const iC = (indices.find((i) => i.periodo === cierre.slice(0, 7)) || {}).indice;
      const iA = cierreAnterior
        ? (indices.find((i) => i.periodo === cierreAnterior.slice(0, 7)) || {}).indice
        : null;
      if (iC && iA) {
        control("C-I09", "La serie de índices da la inflación declarada del ejercicio",
                libro.variacionDeclarada, iC / iA);
      }
    }

    return {
      slug, anio, denominacion, archivos, controles, avisos, errores,
      resumen: {
        cuentas: Object.keys(cuentas).length,
        roles: Object.keys(roles).length,
        apertura: Object.keys(apertura).length,
        resultadoAnterior, ventas: ventas.length, compras: compras.length,
        retenciones: retenciones.length, pagos: pagos.length, indices: indices.length,
        iibb: iibb.length, ddjjIva: ddjjIva.length, ddjjGanancias: ddjjGanancias.length,
        compensaciones: compensaciones.length, manuales: manuales.length,
        /* Lo que la aplicación de Mis Facilidades decidió no asentar, con su
           motivo: no es un problema, es la mitad del trabajo que ya hizo. */
        descartados: descartados.length,
        porQueNo: Array.from(new Set(descartados.map((x) => x.porque).filter(Boolean))),
        asientos: asientos.map((a) => a.template),
      },
    };
  }

  /* ---------- pantalla ---------- */

  function ficha(titulo, valor, detalle) {
    return `<div class="ficha-dato"><span class="et">${esc(titulo)}</span>
      <strong>${esc(valor)}</strong>
      ${detalle ? `<span class="de">${esc(detalle)}</span>` : ""}</div>`;
  }

  function pintar(r) {
    /* Si la lectura no llegó ni a saber de qué ente es, lo único que hay para
       mostrar son los errores. */
    if (!r.resumen) {
      $("#resultado").innerHTML = `<div class="error"><strong>No pude leer este archivo ` +
        `como archivo de importación:</strong><br>· ${r.errores.map(esc).join("<br>· ")}</div>`;
      $("#paso-guardar").hidden = true;
      $("#prueba").innerHTML = "";
      return;
    }

    const s = r.resumen;
    const mal = r.errores.length;
    const falla = r.controles.filter((c) => Math.abs(c.diferencia) > TOL);
    const faltan = ((r.archivos || {})["ejercicio.json"] || {}).faltan || [];
    const nAvisos = r.avisos.length;

    /* El semáforo.

       Lo que la importación encontró es mucho, y casi todo se mira una vez y no
       se vuelve a mirar. Lo único que importa siempre es si esto se puede
       guardar. Así que arriba va una barra que se queda pegada al borde de
       arriba, con el botón adentro, y el detalle se despliega abajo:

         roja      hay algo que arreglar: errores del archivo, o controles que
                   no cierran
         amarilla  se puede guardar, pero falta cargar algo o hay avisos
         verde     no hay nada para mirar

       En rojo el detalle se abre solo: si hay algo que arreglar, no se lo hace
       buscar. Las chapas de la barra son botones: llevan al bloque del detalle
       que les corresponde. */
    const critico = mal + falla.length;
    const luz = critico ? "roja" : (faltan.length || nAvisos) ? "amarilla" : "verde";
    const titulo = mal
      ? (mal === 1 ? "Hay un problema para arreglar en el Excel"
                   : `Hay ${mal} problemas para arreglar en el Excel`)
      : falla.length
        ? (falla.length === 1 ? "Un control no cierra"
                              : `${falla.length} controles no cierran`)
        : faltan.length ? "Se puede guardar, pero falta cargar datos"
        : nAvisos ? "Se puede guardar, con avisos"
        : "Listo para guardar";

    const senal = (n, uno, varios, ancla, clase) => n
      ? `<button type="button" class="senal ${clase}" data-ir="${ancla}">${n} ` +
        `${esc(n === 1 ? uno : varios)}</button>`
      : "";

    let html = `<div class="tablero-cierre" data-luz="${luz}">
      <span class="foco" aria-hidden="true"></span>
      <div class="dice">
        <strong>${esc(titulo)}</strong>
        <span class="de">${esc(r.denominacion)} · ejercicio ${esc(r.anio)} ·
          carpeta <code>datos/entes/${esc(r.slug)}/</code></span>
        <span class="senales">
          ${senal(mal, "problema", "problemas", "d-errores", "roja")}
          ${senal(falla.length, "control con diferencia", "controles con diferencia",
                  "d-controles", "roja")}
          ${senal(faltan.length, "dato sin cargar", "datos sin cargar", "d-faltan", "amarilla")}
          ${senal(nAvisos, "aviso", "avisos", "d-avisos", "amarilla")}
          ${critico || faltan.length || nAvisos ? ""
            : `<span class="senal verde">nada para mirar</span>`}
        </span>
      </div>
      <span class="hace">
        <button type="button" class="btn" id="ver-balance" hidden>Ver el balance</button>
        <button type="button" class="btn tenue" id="guardar" hidden>Guardar en la carpeta del ente</button>
        <button type="button" class="btn tenue" id="ver-detalle" aria-expanded="false"
          aria-controls="detalle">Ver el detalle</button>
      </span>
    </div>
    <p class="conservar-opcion"><label>
      <input type="checkbox" id="conservar-check" checked>
      Conservar lo que la planilla no dice
    </label><span class="ayuda" id="lista-conservar"></span></p>
    <p class="ayuda" id="guardado"></p>`;

    /* ---- el detalle, que arranca plegado ---- */

    let det = "";

    if (mal) {
      det += `<div class="error" id="d-errores"><strong>Esto hay que arreglarlo en el ` +
        `Excel:</strong><br>· ` + r.errores.map(esc).join("<br>· ") + "</div>";
    }

    det += `<div class="fichas-dato">
      ${ficha("Plan de cuentas", s.cuentas + " cuentas", s.roles + " con rol asignado")}
      ${ficha("Apertura", s.apertura + " cuentas",
              "resultado anterior cerrado: " + pesos(s.resultadoAnterior, 2))}
      ${ficha("Ventas", s.ventas + " comprobantes")}
      ${ficha("Compras", s.compras + " comprobantes")}
      ${ficha("Retenciones", s.retenciones + " certificados")}
      ${ficha("Pagos a ARCA", s.pagos + " volantes")}
      ${ficha("Ingresos brutos", s.iibb + " períodos")}
      ${ficha("DDJJ de IVA", s.ddjjIva + " períodos")}
      ${ficha("DDJJ de ganancias", s.ddjjGanancias + " declaraciones")}
      ${ficha("Compensaciones", s.compensaciones + " solicitudes")}
      ${ficha("Ajustes a mano", s.manuales + " renglones",
              s.descartados ? `${s.descartados} sin pegar: ${s.porQueNo.join("; ")}` : "")}
      ${ficha("Índices", s.indices + " períodos")}
      ${ficha("Asientos que se arman", s.asientos.length,
              s.asientos.join(", ") || "ninguno")}
    </div>`;

    det += `<div class="envuelve" id="d-controles"><table class="planilla">
      <thead><tr><th>Id</th><th>Control</th><th class="num">Esperado</th>
        <th class="num">Obtenido</th><th class="num">Diferencia</th></tr></thead>
      <tbody>${r.controles.map((c) => `<tr class="${Math.abs(c.diferencia) > TOL ? "falla" : ""}">
        <td class="id">${esc(c.id)}</td><td>${esc(c.descripcion)}</td>
        <td class="num">${pesos(c.esperado, 2)}</td>
        <td class="num">${pesos(c.obtenido, 2)}</td>
        <td class="num">${pesos(c.diferencia, 2)}</td></tr>`).join("")}</tbody>
    </table></div>`;

    /* Lo que la planilla no dice y hace falta para cerrar el ejercicio va
       arriba de los avisos y con su nombre: no es un aviso más, es lo que
       impide que el balance esté completo. */
    if (faltan.length) {
      det += `<div class="aviso falta" id="d-faltan"><strong>Falta cargar en la planilla</strong>
        <ul>${faltan.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
    }

    if (r.conservado && r.conservado.length) {
      det += `<div class="aviso" id="d-conservado"><strong>Se conservó del archivo anterior</strong>, porque
        la planilla no lo dice:<br>` +
        r.conservado.map((x) => `<code>${esc(x)}</code>`).join(" · ") + "</div>";
    }

    if (nAvisos) {
      det += `<div class="aviso" id="d-avisos"><strong>Avisos</strong><br>` +
        r.avisos.map(esc).join("<br>") + "</div>";
    }

    html += `<div id="detalle" hidden>${det}</div>`;

    $("#resultado").innerHTML = html;

    const detalle = $("#detalle"), verDetalle = $("#ver-detalle");
    const abrir = (ancla) => {
      detalle.hidden = false;
      verDetalle.setAttribute("aria-expanded", "true");
      verDetalle.textContent = "Ocultar el detalle";
      const el = ancla && document.getElementById(ancla);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    verDetalle.onclick = () => {
      if (detalle.hidden) { abrir(null); return; }
      detalle.hidden = true;
      verDetalle.setAttribute("aria-expanded", "false");
      verDetalle.textContent = "Ver el detalle";
    };
    $("#paso-guardar").hidden = false;
    $("#descargas").innerHTML = Object.keys(r.archivos).map((n) => {
      const donde = n === "ente.json" || n === "mapeo-cuentas.json"
        ? `datos/entes/${r.slug}/` : `datos/entes/${r.slug}/${r.anio}/`;
      return `<a class="btn tenue" download="${esc(n)}"
        href="${url(r.archivos[n])}">${esc(n)}<small>${esc(donde)}</small></a>`;
    }).join("");
    $("#probar").hidden = mal > 0;

    /* Ver el balance no guarda nada en ningún lado: deja el paquete en este
       navegador y abre el tablero con el ejercicio puesto. Es el camino que
       funciona cuando la aplicación corre en línea, donde no hay carpeta. */
    const ver = $("#ver-balance");
    ver.hidden = mal > 0;
    ver.onclick = () => {
      try {
        window.Bolsa.guardar(r.slug, r.anio, r.denominacion, archivosElegidos(r));
      } catch (e) {
        $("#guardado").innerHTML = `<span class="mal">${esc(e.message)}.</span>`;
        return;
      }
      window.open(`tablero.html?ente=${encodeURIComponent(r.slug)}` +
        `&ejercicio=${encodeURIComponent(r.anio)}`, "_blank", "noopener");
    };

    /* Guardar en la carpeta es cosa del servidor local. En línea no está, y
       ofrecer un botón que sólo puede fallar es peor que no ofrecerlo. */
    $("#guardar").hidden = true;
    $("#guardar").onclick = () => guardar(r);
    window.Bolsa.hayServidor().then((hay) => {
      $("#guardar").hidden = mal > 0 || !hay;
      const p = $("#conservar-check");
      if (p) p.closest("p").hidden = !hay;
    });
    const lista = $("#lista-conservar"), check = $("#conservar-check");
    if (lista) {
      const hay = (r.conservado || []).length;
      lista.innerHTML = hay
        ? `El archivo anterior trae ${hay} cosa${hay === 1 ? "" : "s"} que la planilla no ` +
          `dice; sin tildar, se pierde${hay === 1 ? "" : "n"}. ` +
          `<button type="button" class="senal amarilla" data-ir="d-conservado">ver cuáles</button>`
        : "La planilla trae todo: no hay nada que conservar.";
      if (check) check.disabled = !hay;
    }

    Array.prototype.forEach.call($("#resultado").querySelectorAll(".senal[data-ir]"),
      (b) => { b.onclick = () => abrir(b.getAttribute("data-ir")); });
    if (critico) abrir(null);

    /* Y la página se acomoda sola: leído el archivo, la barra queda arriba de
       todo. El botón no tiene que buscarse. */
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#guardado").textContent = "";
  }

  /* Guardar es escribir los cuatro archivos en la carpeta del ente. Lo hace el
     servidor local: es lo único que escribe, y guarda una copia de lo que
     reemplaza en `datos/_reemplazados/`.

     Bajarlos a mano sigue estando, para cuando la aplicación no corre contra
     este servidor. */
  /* Sin la casilla se toma lo que dice la planilla y nada más: lo que el
     archivo anterior tenía de más se pierde, y por eso hay que poder verlo
     antes de decidir. Vale igual para guardar y para mirar. */
  function archivosElegidos(r) {
    const conserva = $("#conservar-check");
    return (conserva && !conserva.checked && r.crudos)
      ? r.crudos : (r.mezclados || r.archivos);
  }

  async function guardar(r) {
    const boton = $("#guardar"), aviso = $("#guardado");
    const archivos = archivosElegidos(r);
    boton.disabled = true;
    aviso.textContent = "Guardando…";
    try {
      const res = await fetch("/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: r.slug, anio: r.anio, archivos: archivos }),
      });
      const cuerpo = await res.json();
      if (!res.ok) throw new Error(cuerpo.error || res.statusText);
      /* Guardado en la carpeta, la copia del navegador sobra: si quedara,
         seguiría tapando al archivo recién escrito. */
      window.Bolsa.olvidar(r.slug, r.anio);
      aviso.innerHTML = `<strong>Guardado.</strong> ` +
        cuerpo.escritos.map((x) => `<code>${esc(x)}</code>`).join(" · ") +
        ((cuerpo.reemplazados || []).length
          ? "<br>La versión anterior quedó en " +
            cuerpo.reemplazados.map((x) => `<code>${esc(x)}</code>`).join(" · ")
          : "") +
        `<br><a href="libros.html?ente=${esc(r.slug)}&ejercicio=${esc(r.anio)}">` +
        "Ver los libros con esto</a>";
    } catch (e) {
      aviso.innerHTML = `<span class="mal">No pude guardar: ${esc(e.message)}.</span> ` +
        "Si la aplicación no está corriendo con <code>herramientas/servidor.py</code>, " +
        "bajá los cuatro archivos y dejalos en su carpeta.";
    }
    boton.disabled = false;
  }

  function url(objeto) {
    return URL.createObjectURL(new Blob([JSON.stringify(objeto, null, 1)],
      { type: "application/json" }));
  }

  /* Arma el diario con lo importado, sin guardar nada. */
  async function probar() {
    const r = resultado;
    $("#prueba").innerHTML = "<p class='ayuda'>Armando…</p>";
    try {
      const plan = await (await fetch(
        `../esquema/plan-exposicion-${r.archivos["ente.json"].plan}.json`,
        { cache: "no-store" })).json();
      const ley25413 = await (await fetch("../esquema/impuesto-ley-25413.json",
                                          { cache: "no-store" })).json();
      const d = window.LibroDiario.desde({
        slug: r.slug, ente: r.archivos["ente.json"], mapeo: r.archivos["mapeo-cuentas.json"],
        ej: r.archivos["ejercicio.json"], f: r.archivos["fuentes.json"], plan: plan,
        ley25413: ley25413,
      });
      const t = d.totales();
      const noCierran = d.asientos.filter((a) => Math.abs(a.diferencia) > TOL);
      $("#prueba").innerHTML = `
        <div class="resumen-control">
          ${noCierran.length ? `<span class="chapa mal">${noCierran.length} no cierran</span>`
                             : `<span class="chapa bien">Los ${d.asientos.length} asientos cierran</span>`}
          <span>Debe y haber suman ${pesos(t.debe, 2)}; la suma de saldos da
            ${pesos(t.suma, 2)}.</span>
        </div>
        <div class="envuelve"><table class="planilla">
          <thead><tr><th>N°</th><th>Fecha</th><th>Asiento</th>
            <th class="num">Debe</th><th class="num">Haber</th></tr></thead>
          <tbody>${d.asientos.map((a) => `<tr class="${Math.abs(a.diferencia) > TOL ? "falla" : ""}">
            <td class="id">${a.numero}</td>
            <td>${window.Motor.fechaCorta(a.fecha)}</td>
            <td>${esc(a.nombre)}</td>
            <td class="num">${pesos(a.debe, 2)}</td>
            <td class="num">${pesos(a.haber, 2)}</td></tr>`).join("")}</tbody>
        </table></div>`;
    } catch (err) {
      $("#prueba").innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  }

  /* ---------- arranque ---------- */

  /* El catálogo de cuentas del estudio: sólo hace falta para el papel de
     trabajo, así que se busca recién cuando aparece uno. */
  let catalogo = null;
  async function elCatalogo() {
    if (!catalogo) {
      catalogo = await (await fetch("../esquema/catalogo-cuentas.json",
                                    { cache: "no-store" })).json();
    }
    return catalogo;
  }

  /* El plan de cuentas de una empresa es suyo y no se cruza con el de otra: si
     el ente ya tiene mapeo, ese manda sobre el catálogo del estudio. */
  /* Lo que el papel de trabajo no dice, el archivo del ente lo sigue diciendo.

     Una importación reconstruye el ejercicio desde la planilla, y lo que la
     planilla no sabe —una tasa confirmada a mano, una nota— se perdería en
     silencio. Eso ya pasó: una tasa confirmada a mano
     desapareció en una reimportación. Así que lo que el archivo tenía y la
     importación no trae, se conserva, y se dice cuál. */
  const esObjeto = (x) => x && typeof x === "object" && !Array.isArray(x);

  /* La apertura no entra en la mezcla: se reconstruye entera desde el balance
     anterior, y conservar lo que «falta» ahí sería resucitar una cuenta que
     cerró en cero o que ahora se abre en subcuentas.

     `faltan` tampoco. No es un dato que la planilla pueda traer o no: es lo que
     la importación **acaba de mirar** y no encontró. Conservarla hacía que un
     renglón resuelto siguiera en rojo para siempre, que es peor que no tener la
     lista: una alarma que no se apaga deja de mirarse. */
  const NO_SE_CONSERVAN = ["apertura", "faltan"];

  function conservar(previo, nuevo, camino, guardados) {
    if (!esObjeto(previo) || !esObjeto(nuevo)) return;
    Object.keys(previo).forEach((k) => {
      const donde = camino ? `${camino}.${k}` : k;
      if (NO_SE_CONSERVAN.indexOf(donde) >= 0) return;
      if (nuevo[k] === undefined || nuevo[k] === null) {
        nuevo[k] = previo[k];
        guardados.push(donde);
      } else {
        conservar(previo[k], nuevo[k], donde, guardados);
      }
    });
  }

  async function archivoDelEnte(slug, ruta) {
    try {
      const r = await fetch(`../datos/entes/${slug}/${ruta}`, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (err) {
      return null;
    }
  }

  /* Hay asientos que la planilla no puede deducir porque dependen de un dato que
     no está en ella: la valuación de una inversión al cierre sale del resumen
     que manda el fondo, y las tasas de amortización las confirma el contador. Si
     el ejercicio anterior los declaraba, se conservan; si no, una reimportación
     los borraría. */
  const ASIENTOS_QUE_NO_SE_DEDUCEN = ["valuacion", "amortizaciones", "impuesto"];

  /* El orden de los asientos de cierre no es indistinto: la valuación va antes de
     que se reexprese, el ajuste por inflación necesita el resultado ya asentado, y
     el impuesto va al final de todo, sobre el resultado ya ajustado. */
  const ORDEN_DE_CIERRE = ["valuacion", "credito_ley_25413", "amortizaciones",
                           "axi", "neteo_axi", "impuesto"];

  async function conservarLoQueNoViene(r) {
    const guardados = [];
    const pares = [["ente.json", "ente.json"],
                   ["ejercicio.json", `${r.anio}/ejercicio.json`]];
    for (const [nombre, ruta] of pares) {
      const previo = await archivoDelEnte(r.slug, ruta);
      if (previo && r.archivos[nombre]) {
        conservar(previo, r.archivos[nombre], "", guardados);
      }
      if (nombre !== "ejercicio.json" || !previo || !r.archivos[nombre]) continue;
      const nuevos = r.archivos[nombre].asientos || [];
      (previo.asientos || []).forEach((a) => {
        if (ASIENTOS_QUE_NO_SE_DEDUCEN.indexOf(a.template) < 0) return;
        if (nuevos.some((x) => x.template === a.template)) return;
        /* Cada uno entra delante del primer asiento de cierre que va después
           que él, según `ORDEN_DE_CIERRE`. Así el impuesto queda último. */
        const pos = ORDEN_DE_CIERRE.indexOf(a.template);
        const i = nuevos.findIndex((x) => {
          const p = ORDEN_DE_CIERRE.indexOf(x.template);
          return p >= 0 && p > pos;
        });
        nuevos.splice(i < 0 ? nuevos.length : i, 0, a);
        guardados.push(`asientos.${a.template}`);
      });
    }
    return guardados;
  }

  async function mapeoDelEnte(libro) {
    try {
      const slug = window.PapelDeTrabajo.slugDe(libro);
      if (!slug) return null;
      const r = await fetch(`../datos/entes/${slug}/mapeo-cuentas.json`, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (err) {
      return null;
    }
  }

  async function leer(archivo) {
    $("#resultado").innerHTML = "<p class='ayuda'>Leyendo la planilla…</p>";
    $("#paso-guardar").hidden = true;
    $("#prueba").innerHTML = "";
    try {
      let libro = await window.Planilla.leerPlanilla(archivo);
      const hojas = libro.hojas.map((h) => h.nombre).join(", ");

      /* Si es el papel de trabajo del estudio, se traduce a la forma del modelo
         antes de armar nada. De acá para abajo los dos formatos son uno solo. */
      let deTraducir = [], formato = "archivo de importación";
      if (window.PapelDeTrabajo && window.PapelDeTrabajo.es(libro)) {
        formato = "papel de trabajo del estudio";
        const t = window.PapelDeTrabajo.traducir(libro, await elCatalogo(),
                                                 await mapeoDelEnte(libro));
        libro = t.libro;
        libro.variacionDeclarada = t.variacionDeclarada;
        deTraducir = t.avisos;
      }
      $("#hojas").textContent = `${archivo.name} · ${formato} · ` +
        `${hojas.split(", ").length} hojas: ${hojas}`;

      resultado = armar(libro);
      resultado.avisos = deTraducir.concat(resultado.avisos || []);
      resultado.formato = formato;
      if (resultado.slug && resultado.archivos) {
        /* Se guarda cómo salió de la planilla, antes de mezclar: así se puede
           elegir guardar limpio y no hay que volver a leer el archivo. */
        resultado.crudos = JSON.parse(JSON.stringify(resultado.archivos));
        resultado.conservado = await conservarLoQueNoViene(resultado);
        resultado.mezclados = resultado.archivos;
      }
      pintar(resultado);
    } catch (err) {
      $("#resultado").innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  }

  /* El semáforo se pega justo abajo de la cabecera, y la cabecera cambia de
     alto cuando la ventana es angosta y se parte en dos líneas. Así que el alto
     se mide, no se supone. */
  function medirCabecera() {
    const c = document.querySelector(".site-header");
    if (c) document.documentElement.style.setProperty("--alto-cabecera",
      c.getBoundingClientRect().height + "px");
  }

  function arrancar() {
    /* Los dos ejemplos son ejercicios reales de clientes: existen en la carpeta
       del proyecto y no se publican. Se ofrecen sólo cuando la aplicación corre
       contra el servidor local, que es donde están. */
    window.Bolsa.hayServidor().then((hay) => {
      const e = $("#ejemplos");
      if (e) e.hidden = !hay;
    });
    medirCabecera();
    window.addEventListener("resize", medirCabecera);
    const zona = $("#zona"), entrada = $("#archivo");
    zona.onclick = () => entrada.click();
    entrada.onchange = () => { if (entrada.files[0]) leer(entrada.files[0]); };
    ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => {
      e.preventDefault(); zona.classList.add("encima");
    }));
    ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => {
      e.preventDefault(); zona.classList.remove("encima");
    }));
    zona.addEventListener("drop", (e) => {
      if (e.dataTransfer.files[0]) leer(e.dataTransfer.files[0]);
    });
    $("#probar").onclick = probar;
  }

  arrancar();
})();
