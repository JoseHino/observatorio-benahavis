# -*- coding: utf-8 -*-
"""Extracción del **Big Data de Turismo y Planificación Costa del Sol**.

El observatorio de la Diputación de Málaga publica para cada municipio de la
provincia —Benahavís incluido— un conjunto de informes con resolución municipal
que las fuentes estadísticas generales no bajan a este tamaño de municipio:

* **Oferta de alojamiento** (Registro de Turismo de Andalucía), con *serie
  histórica mensual desde 1998* por tipología. El RTA propio solo da la foto fija
  de hoy; aquí está la evolución.
* **Vivienda turística**: grado de ocupación, viviendas y plazas anunciadas y
  precio medio por plaza, mensual desde marzo de 2018. **Es la única medición de
  ocupación de alojamiento con ámbito estrictamente municipal** disponible para
  Benahavís.
* **Precios y valoración hotelera** (Lurmetrika sobre Booking), mensual desde
  2015, por tipología y categoría.
* **Empleo turístico** (afiliación a la Seguridad Social por subsector turístico
  y régimen), trimestral. A diferencia del fichero MUNCNAE, **no viene censurado
  con «<5»**, porque se publica agregado por subsector.
* **Viajeros y pernoctaciones** (microdato de la Encuesta de Ocupación Hotelera
  del INE). Para Benahavís la EOH solo libera unos pocos meses de apartamentos
  turísticos; se publica lo que hay, con su cobertura declarada.

Cómo se consulta
----------------
No hay API pública. Cada informe es un **Power BI embebido**: el visor genera un
token efímero en cada carga y con él se consulta el endpoint semántico del
servicio. Tres detalles que hacen falta para que funcione:

1. El token vive en el HTML del visor (``accessToken: '…'``) y caduca; se pide uno
   nuevo por cada informe y ejecución.
2. El endpoint bueno es ``/explore/querydata``; ``/public/reports/querydata``
   devuelve 403. Exige además cabecera ``Origin: https://app.powerbi.com``, que es
   la razón por la que esto **no puede hacerse desde el navegador** (CORS) y sí
   desde el pipeline.
3. La respuesta viene en formato DM0 comprimido: un descriptor de columnas con
   diccionarios de valores, una máscara ``R`` que significa «repite el valor de la
   fila anterior» y otra ``Ø`` de nulos. Sin deshacer las tres cosas, las
   etiquetas salen como números y las series se desalinean.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import uuid
from typing import Any

from ..contexto import DATA_RAW, MUNICIPIO
from ..utils.http import descargar
from ..utils.log import get_logger

log = get_logger("extract.costadelsol")

VISOR = "https://visor.bigdata.costadelsolmalaga.org/informe"
CLUSTER = "https://wabi-europe-north-b-redirect.analysis.windows.net"
CONSULTA = f"{CLUSTER}/explore/querydata?synchronous=true"
COD_MUNICIPIO = "29023"

PORTAL = "https://www.costadelsolmalaga.org/bigdata/"

#: Informes que resuelven para Benahavís, con el identificador de su modelo y
#: conjunto de datos. Se fijan aquí porque el visor no los publica: se obtienen de
#: ``/explore/reports/{id}/modelsAndExploration``. El identificador de informe sí
#: se lee del visor en cada ejecución, por si la Diputación republica el panel.
INFORMES: dict[str, dict[str, Any]] = {
    "oferta-alojamiento": {"modelo": 12913927, "datos": "1cdffb73-60a6-46de-aff8-c8477a0c343d"},
    "viviendas-turisticas": {"modelo": 12913765, "datos": "13f3c3cb-d020-4371-bec8-bba57afb71ec"},
    "precios-hoteles": {"modelo": 12913903, "datos": "ef5b7300-d4ba-4f51-bee9-01ea42c8a551"},
    "empleo-turismo": {"modelo": 12913932, "datos": "2608c6c0-d148-4ec8-84c1-f3ec000d577f"},
    "viajeros-pernoctaciones": {"modelo": 12913946, "datos": "52f1245b-8ea2-447f-9347-fa42240bbd8f"},
}

#: Filas de agregado que el propio informe intercala entre los países emisores.
#: Tratarlas como un país más las colocaría en cabeza de cualquier ranking.
AGREGADOS = {
    "Total", "Extranjero", "España", "Resto del mundo", "Resto de Europa",
    "Resto de la UE", "Resto de América", "Resto de Asia", "Países africanos",
    "Resto América Central y Sur", "Unión Europea (sin España)",
    "UE27_2020 sin España", "América (sin EEUU)", "Otros países europeos",
}

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11,
    "diciembre": 12,
}


# ────────────────────────────────────────────────────────────── acceso al visor
def _sesion(informe: str) -> tuple[str, str]:
    """Devuelve ``(token, id_informe)`` leyéndolos del visor.

    El token es efímero: se regenera en cada carga de la página, de modo que no
    puede cachearse entre ejecuciones.
    """
    url = f"{VISOR}?id={informe}&mun={COD_MUNICIPIO}"
    html = descargar(url, dir_raw=DATA_RAW, sufijo=".html", timeout=120,
                     guardar=False).decode("utf-8", "replace")
    token = re.search(r"accessToken:\s*'([^']+)'", html)
    ident = re.search(r"reportId=([0-9a-f\-]+)", html)
    if not token or not ident:
        raise ValueError(f"el visor de «{informe}» no expone token o identificador de informe")
    return token.group(1), ident.group(1)


def _columna(origen: str, propiedad: str) -> dict:
    return {"Column": {"Expression": {"SourceRef": {"Source": origen}}, "Property": propiedad}}


def _medida(origen: str, propiedad: str) -> dict:
    return {"Measure": {"Expression": {"SourceRef": {"Source": origen}}, "Property": propiedad}}


def _suma(origen: str, propiedad: str) -> dict:
    return {"Aggregation": {"Expression": _columna(origen, propiedad), "Function": 0}}


def _igual(origen: str, propiedad: str, valor: str) -> dict:
    return {"Condition": {"In": {"Expressions": [_columna(origen, propiedad)],
                                 "Values": [[{"Literal": {"Value": f"'{valor}'"}}]]}}}


def _consultar(informe: str, sesion: tuple[str, str], tablas: list[tuple[str, str]],
               columnas: list[dict], filtro: list[dict] | None = None,
               tope: int = 20000) -> list[list[Any]]:
    """Lanza una consulta semántica y devuelve sus filas ya decodificadas."""
    token, ident = sesion
    cfg = INFORMES[informe]
    seleccion = [dict(c, Name=f"c{i}") for i, c in enumerate(columnas)]
    consulta = {
        "Version": 2,
        "From": [{"Name": a, "Entity": e, "Type": 0} for a, e in tablas],
        "Select": seleccion,
    }
    if filtro:
        consulta["Where"] = filtro
    cuerpo = {
        "version": "1.0.0",
        "queries": [{
            "Query": {"Commands": [{"SemanticQueryDataShapeCommand": {
                "Query": consulta,
                "Binding": {
                    "Primary": {"Groupings": [{"Projections": list(range(len(seleccion)))}]},
                    "DataReduction": {"DataVolume": 4, "Primary": {"Window": {"Count": tope}}},
                    "Version": 1,
                },
            }}]},
            "QueryId": "",
            "ApplicationContext": {"DatasetId": cfg["datos"], "Sources": [{"ReportId": ident}]},
        }],
        "cancelQueries": [],
        "modelId": cfg["modelo"],
    }
    crudo = descargar(
        CONSULTA, dir_raw=DATA_RAW, sufijo=".json", timeout=180, guardar=False,
        cuerpo=json.dumps(cuerpo).encode("utf-8"),
        cabeceras={
            "Authorization": f"EmbedToken {token}",
            "Content-Type": "application/json;charset=UTF-8",
            # El servicio rechaza cualquier origen que no sea el del visor de Power BI.
            "Origin": "https://app.powerbi.com",
            "Referer": "https://app.powerbi.com/",
            "ActivityId": str(uuid.uuid4()),
            "RequestId": str(uuid.uuid4()),
        })
    # La respuesta llega con marca de orden de bytes; decodificarla como UTF-8 a
    # secas deja el BOM delante y el JSON no parsea.
    respuesta = json.loads(crudo.decode("utf-8-sig"))
    return _descomprimir(respuesta["results"][0]["result"]["data"]["dsr"])


def _descomprimir(dsr: dict) -> list[list[Any]]:
    """Decodifica el formato DM0 de Power BI.

    Cada fila trae solo las celdas que cambian respecto de la anterior: la máscara
    ``R`` marca las que se repiten y la máscara ``Ø`` las nulas. Las columnas de
    texto viajan como índice contra el diccionario ``ValueDicts`` que nombra el
    descriptor ``S``. Sin deshacer las tres cosas las etiquetas salen numéricas y
    las filas quedan corridas.
    """
    hoja = dsr["DS"][0]
    diccionarios = hoja.get("ValueDicts", {})
    filas = hoja["PH"][0].get("DM0") or []
    if not filas:
        return []
    descriptor = filas[0]["S"]
    ancho = len(descriptor)
    salida: list[list[Any]] = []
    previa: list[Any] = [None] * ancho
    for fila in filas:
        actual: list[Any] = [None] * ancho
        celda = 0
        repetidas, nulas = fila.get("R", 0), fila.get("Ø", 0)
        for i in range(ancho):
            if nulas >> i & 1:
                actual[i] = None
            elif repetidas >> i & 1:
                actual[i] = previa[i]
            else:
                valores = fila.get("C") or []
                valor = valores[celda] if celda < len(valores) else None
                celda += 1
                nombre = descriptor[i].get("DN")
                tabla = diccionarios.get(nombre, []) if nombre else []
                if nombre and isinstance(valor, int) and valor < len(tabla):
                    valor = tabla[valor]
                actual[i] = valor
        salida.append(actual)
        previa = actual
    return salida


def _mes(epoch_ms: Any) -> str | None:
    """Convierte la marca temporal de Power BI (milisegundos UTC) en ``AAAA-MM``."""
    if not isinstance(epoch_ms, (int, float)):
        return None
    fecha = dt.datetime.fromtimestamp(epoch_ms / 1000, dt.timezone.utc)
    return f"{fecha.year}-{fecha.month:02d}"


def _numero(valor: Any) -> float | None:
    """El servicio devuelve los decimales como texto; los enteros, como número."""
    if valor is None or valor == "":
        return None
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


# ─────────────────────────────────────────────────────────────────── informes
def oferta_alojamiento(sesion: tuple[str, str] | None = None) -> dict[str, Any]:
    """Serie histórica mensual de la oferta inscrita en el RTA, por tipología."""
    log.info("Costa del Sol · oferta de alojamiento (RTA, serie histórica)")
    ses = sesion or _sesion("oferta-alojamiento")
    filas = _consultar("oferta-alojamiento", ses,
                       [("r", "RTA"), ("m", "Municipios"), ("t", "Tipologías")],
                       [_columna("r", "fecha"), _columna("t", "tipologia"),
                        _suma("r", "num_establecimientos"), _suma("r", "num_plazas")],
                       [_igual("m", "etiqueta_municipio", MUNICIPIO)])

    por_tipo: dict[str, dict[str, dict[str, float]]] = {}
    for fecha, tipo, establecimientos, plazas in filas:
        t = _mes(fecha)
        if not t or not tipo:
            continue
        por_tipo.setdefault(tipo, {})[t] = {
            "establecimientos": _numero(establecimientos) or 0,
            "plazas": _numero(plazas) or 0,
        }

    meses = sorted({t for serie in por_tipo.values() for t in serie})
    total = [{"t": t,
              "establecimientos": sum(s.get(t, {}).get("establecimientos", 0) for s in por_tipo.values()),
              "plazas": sum(s.get(t, {}).get("plazas", 0) for s in por_tipo.values())}
             for t in meses]
    log.info("   %d tipologías · %d meses (%s → %s)",
             len(por_tipo), len(meses), meses[0] if meses else "-", meses[-1] if meses else "-")
    return {
        "meses": meses,
        "por_tipologia": {tipo: [{"t": t, **serie[t]} for t in sorted(serie)]
                          for tipo, serie in por_tipo.items()},
        "total": total,
    }


def vivienda_turistica(sesion: tuple[str, str] | None = None) -> dict[str, Any]:
    """Ocupación, oferta anunciada y precio medio de la vivienda turística.

    Es el único indicador de **ocupación de alojamiento con ámbito municipal** que
    existe para Benahavís: la Encuesta de Ocupación Hotelera no baja a este
    municipio y la ficha del IECA aplica secreto estadístico.
    """
    log.info("Costa del Sol · vivienda turística (ocupación, plazas y precio)")
    ses = sesion or _sesion("viviendas-turisticas")
    filas = _consultar("viviendas-turisticas", ses,
                       [("c", "Calendario"), ("m", "Municipios"), ("k", "_Cálculos")],
                       [_columna("c", "Fecha"),
                        _medida("k", "0.4 Grado de Ocupación"),
                        _medida("k", "0.1 Nº Viviendas mapa"),
                        _medida("k", "0.2 Nº Plazas mapa"),
                        _medida("k", "0.3 Precio medio por plaza mapa")],
                       [_igual("m", "Municipios_Etiqueta", MUNICIPIO)])

    serie = []
    for fecha, ocupacion, viviendas, plazas, precio in filas:
        t = _mes(fecha)
        if not t:
            continue
        serie.append({
            "t": t,
            "ocupacion": round(_numero(ocupacion), 2) if _numero(ocupacion) is not None else None,
            "viviendas": _numero(viviendas),
            "plazas": _numero(plazas),
            "precio_plaza": round(_numero(precio), 2) if _numero(precio) is not None else None,
        })
    serie.sort(key=lambda p: p["t"])
    if serie:
        log.info("   %d meses (%s → %s) · última ocupación %.1f %%",
                 len(serie), serie[0]["t"], serie[-1]["t"], serie[-1]["ocupacion"] or 0)
    return {"serie": serie}


def precios_hoteles(sesion: tuple[str, str] | None = None) -> dict[str, Any]:
    """Precio medio y valoración de los alojamientos, por tipología y categoría."""
    log.info("Costa del Sol · precios y valoración (Booking vía Lurmetrika)")
    ses = sesion or _sesion("precios-hoteles")
    filas = _consultar("precios-hoteles", ses, [("l", "Lurmetrika_Booking")],
                       [_columna("l", "02. Año"), _columna("l", "03. Mes Número"),
                        _columna("l", "10. Tipo de Alojamientos"), _columna("l", "12. Categoría"),
                        _suma("l", "14. Precio"), _suma("l", "18. Valoración_Media")],
                       [_igual("l", "08. Territorio", MUNICIPIO)])

    series: dict[str, dict[str, dict[str, Any]]] = {}
    for anyo, mes, tipo, categoria, precio, valoracion in filas:
        if anyo is None or mes is None:
            continue
        t = f"{int(anyo)}-{int(mes):02d}"
        clave = f"{tipo} · {categoria}" if categoria and categoria not in ("Total",) else str(tipo)
        series.setdefault(clave, {})[t] = {
            "precio": _numero(precio),
            "valoracion": _numero(valoracion),
        }

    salida = {clave: [{"t": t, **valores[t]} for t in sorted(valores)]
              for clave, valores in series.items()}
    meses = sorted({p["t"] for serie in salida.values() for p in serie})
    log.info("   %d series de precio · %d meses (%s → %s)",
             len(salida), len(meses), meses[0] if meses else "-", meses[-1] if meses else "-")
    return {"series": salida, "meses": meses}


def empleo_turistico(sesion: tuple[str, str] | None = None) -> dict[str, Any]:
    """Empresas y trabajadores afiliados por subsector turístico, sin censura.

    El fichero MUNCNAE de la Seguridad Social enmascara como «<5» casi la mitad de
    las celdas de Benahavís. Esta explotación publica el mismo universo **agregado
    por subsector turístico**, con lo que las cifras salen completas.
    """
    log.info("Costa del Sol · empleo turístico (Seguridad Social por subsector)")
    ses = sesion or _sesion("empleo-turismo")
    filas = _consultar("empleo-turismo", ses,
                       [("s", "Seguridad Social Municipal"), ("m", "Municipios")],
                       [_columna("s", "fecha"), _columna("s", "subsectores_dashboard"),
                        _columna("s", "regimen"),
                        _suma("s", "empresas"), _suma("s", "trabajadores")],
                       [_igual("m", "etiqueta_municipio", MUNICIPIO)])

    por_subsector: dict[str, dict[str, dict[str, float]]] = {}
    for fecha, subsector, regimen, empresas, trabajadores in filas:
        # Solo la fila «Total» de régimen agrega los tres regímenes; las demás son
        # sus componentes y sumarlas duplicaría el dato.
        if regimen != "Total" or not subsector:
            continue
        t = _mes(fecha)
        if not t:
            continue
        por_subsector.setdefault(subsector, {})[t] = {
            "empresas": _numero(empresas) or 0,
            "trabajadores": _numero(trabajadores) or 0,
        }

    periodos = sorted({t for serie in por_subsector.values() for t in serie})
    total = [{"t": t,
              "empresas": sum(s.get(t, {}).get("empresas", 0) for s in por_subsector.values()),
              "trabajadores": sum(s.get(t, {}).get("trabajadores", 0) for s in por_subsector.values())}
             for t in periodos]
    log.info("   %d subsectores · %d periodos (%s → %s)",
             len(por_subsector), len(periodos),
             periodos[0] if periodos else "-", periodos[-1] if periodos else "-")
    return {
        "periodos": periodos,
        "por_subsector": {s: [{"t": t, **serie[t]} for t in sorted(serie)]
                          for s, serie in por_subsector.items()},
        "total": total,
    }


def viajeros_pernoctaciones(sesion: tuple[str, str] | None = None) -> dict[str, Any]:
    """Viajeros y pernoctaciones del microdato de la EOH, lo que libere para el municipio.

    Para Benahavís la EOH solo publica algunos meses de apartamentos turísticos:
    el umbral de cinco establecimientos censura el resto. Se devuelve la cobertura
    real junto con los datos, para que el gráfico pueda declararla.
    """
    log.info("Costa del Sol · viajeros y pernoctaciones (microdato EOH)")
    ses = sesion or _sesion("viajeros-pernoctaciones")
    filas = _consultar("viajeros-pernoctaciones", ses, [("v", "Viajeros y Pernoctaciones")],
                       [_columna("v", "02. Año"), _columna("v", "03. Mes Número"),
                        _columna("v", "09. Tipo de Alojamientos"), _columna("v", "12. Indicador"),
                        _suma("v", "13. Valor")],
                       [_igual("v", "06. Territorio", MUNICIPIO)])

    serie: dict[str, dict[str, Any]] = {}
    tipos: set[str] = set()
    for anyo, mes, tipo, indicador, valor in filas:
        if anyo is None or mes is None or indicador is None:
            continue
        t = f"{int(anyo)}-{int(mes):02d}"
        tipos.add(tipo or "—")
        registro = serie.setdefault(t, {"t": t, "tipo": tipo})
        registro["viajeros" if indicador == "Viajeros" else "pernoctaciones"] = _numero(valor)

    mercados = _consultar("viajeros-pernoctaciones", ses, [("v", "Viajeros y Pernoctaciones")],
                          [_columna("v", "11. Mercado Emisor"), _columna("v", "12. Indicador"),
                           _suma("v", "13. Valor")],
                          [_igual("v", "06. Territorio", MUNICIPIO)])
    por_pais = [{"pais": p, "v": _numero(valor) or 0}
                for p, indicador, valor in mercados
                if p and p not in AGREGADOS and indicador == "Pernoctaciones"
                and (_numero(valor) or 0) > 0]
    por_pais.sort(key=lambda x: -x["v"])

    meses = sorted(serie)
    log.info("   %d meses con dato liberado (%s) · tipologías: %s",
             len(meses), ", ".join(meses) or "ninguno", ", ".join(sorted(tipos)) or "—")
    return {
        "serie": [serie[t] for t in meses],
        "por_pais": por_pais,
        "tipologias": sorted(tipos),
        "cobertura": (
            f"La Encuesta de Ocupación Hotelera solo libera para Benahavís "
            f"{len(meses)} mes(es) de {', '.join(sorted(tipos)).lower() or 'alojamiento'}: "
            f"el umbral de cinco establecimientos censura el resto de la serie."
        ) if meses else "La EOH no libera ningún mes para el municipio.",
    }


def todo() -> dict[str, Any]:
    """Descarga los cinco informes. Un informe caído no arrastra a los demás."""
    salida: dict[str, Any] = {}
    for clave, funcion in (("oferta", oferta_alojamiento),
                           ("vivienda_turistica", vivienda_turistica),
                           ("precios", precios_hoteles),
                           ("empleo", empleo_turistico),
                           ("eoh", viajeros_pernoctaciones)):
        try:
            salida[clave] = funcion()
        except Exception as exc:  # noqa: BLE001 — cada informe es independiente
            log.warning("   informe «%s» no disponible: %s", clave, exc)
    if not salida:
        raise ValueError("ningún informe del Big Data de Turismo Costa del Sol respondió")
    return salida
