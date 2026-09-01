# -*- coding: utf-8 -*-
"""Extracción del IECA mediante la API REST de BADEA.

BADEA es el banco de datos estadísticos de Andalucía. Se accede por
``consulta/{id}`` filtrando con el alias de la dimensión territorial. El nodo de
Benahavís en la jerarquía territorial es el **2934** (padre 3023, Málaga).

Consultas utilizadas, verificadas contra el endpoint real:

* **37016** — Paro registrado por edad y sexo (SIMA, media anual municipal).
* **876** — Afiliaciones a la Seguridad Social por municipio de residencia y
  régimen, desde marzo de 2012. Da el número de **autónomos** sin el enmascarado
  ``<5`` del fichero de la Seguridad Social por CNAE.
* Las **series anuales del SIMA** (:func:`serie_anual`), que es lo que convierte
  la ficha municipal del IECA de una foto fija en histórico: consumo eléctrico,
  transacciones de vivienda, movimiento natural, presupuesto liquidado, parque de
  vehículos, IBI, renta declarada y plazas de alojamiento turístico.

.. warning::
   **BADEA devuelve un solo periodo por petición.** La dimensión temporal va en
   posición de *página*, una lista separada por comas responde ``NO_DATA`` y dos
   identificadores sueltos, ``SYSTEM_DATA``. Tampoco hay descarga masiva: el
   parámetro ``format`` existe pero contesta «Formato no disponible» a csv, xls,
   px, tsv y xml. La única vía es **pedir año a año**, y por eso todas las series
   de este módulo se construyen con caché: en cada ejecución solo se descargan
   los periodos que aún no están publicados.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from ..contexto import BADEA_NODO, DATA_RAW, MUNICIPIO
from ..utils.http import descargar_json
from ..utils.log import get_logger

log = get_logger("extract.badea")

BASE = ("https://www.juntadeandalucia.es/institutodeestadisticaycartografia"
        "/intranet/admin/rest/v1.0")

CONSULTA_PARO = "37016"


def _celdas(fila: list[dict[str, Any]]) -> tuple[list[str], float | None]:
    """Separa las etiquetas descriptivas del valor numérico de una fila de BADEA."""
    etiquetas, valor = [], None
    for celda in fila:
        if not isinstance(celda, dict):
            continue
        if celda.get("val") is not None:
            valor = celda["val"]
        elif celda.get("des") is not None:
            etiquetas.append(str(celda["des"]))
    return etiquetas, valor


def paro_anual() -> dict[str, Any]:
    """Media anual del paro registrado en Benahavís, por sexo y grupo de edad.

    Returns:
        ``{"anyo": "2025", "total": …, "hombres": …, "mujeres": …, "por_edad": {...}}``
    """
    log.info("IECA/BADEA · paro registrado medio anual (consulta %s, nodo %s)",
             CONSULTA_PARO, BADEA_NODO)
    resp = descargar_json(f"{BASE}/consulta/{CONSULTA_PARO}?D_TERRITORIO_0={BADEA_NODO}",
                          dir_raw=DATA_RAW, timeout=180)

    salida: dict[str, Any] = {"por_edad": {}, "por_sexo": {}}
    anyo = None
    for fila in resp.get("data", []):
        etiquetas, valor = _celdas(fila)
        if valor is None:
            continue
        sexo = next((e for e in etiquetas if e in ("Ambos sexos", "Hombres", "Mujeres")), None)
        edad = next((e for e in etiquetas if e.startswith("De ") or e == "TOTAL"), None)
        anyo = next((e for e in etiquetas if e.isdigit() and len(e) == 4), anyo)
        if sexo is None or edad is None:
            continue
        redondeado = round(float(valor), 1)
        if edad == "TOTAL":
            salida["por_sexo"][sexo] = redondeado
        elif sexo == "Ambos sexos":
            salida["por_edad"][edad] = redondeado

    salida["anyo"] = anyo
    salida["total"] = salida["por_sexo"].get("Ambos sexos")
    log.info("   %s: %s parados de media (H %s / M %s)", anyo, salida["total"],
             salida["por_sexo"].get("Hombres"), salida["por_sexo"].get("Mujeres"))
    return salida


CONSULTA_REGIMEN = "876"
#: Jerarquía temporal de la consulta 876. BADEA solo admite **un periodo por
#: petición** —la dimensión va en posición de página—, así que la serie se
#: construye pidiendo mes a mes y reutilizando lo ya publicado.
JERARQUIA_TEMPORAL = "3153"

REGIMENES = {
    "Régimen General* y Carbón": "general",
    "Régimen Especial Trabajadores Autónomos": "autonomos",
    "Sistema Especial Agrario": "agrario",
    "Régimen Especial del Mar": "mar",
    "Régimen Especial Empleados del Hogar y R.G. Sistema Especial de Empleados del Hogar": "hogar",
    "TOTAL": "total",
}


def _periodos_regimen() -> list[tuple[str, int]]:
    """Periodos publicados en la consulta 876, como ``[("2012-03", id), …]``.

    El código del nodo es ``AAAAMM``; el identificador numérico es lo único que
    acepta el filtro ``D_TEMPORAL_0``, de modo que hay que traerse la jerarquía
    entera aunque solo se usen los meses nuevos.
    """
    url = f"{BASE}/jerarquia/{JERARQUIA_TEMPORAL}?consultaId={CONSULTA_REGIMEN}&alias=D_TEMPORAL_0"
    arbol = descargar_json(url, dir_raw=DATA_RAW, timeout=180, guardar=False)
    salida = []
    for nodo in arbol.get("data", {}).get("children", []):
        cod = str(nodo.get("cod", ""))
        if len(cod) == 6 and cod.isdigit():
            salida.append((f"{cod[:4]}-{cod[4:]}", int(nodo["id"])))
    salida.sort()
    return salida


def _mes_regimen(id_periodo: int) -> dict[str, float | None]:
    """Afiliaciones de un mes en Benahavís, desglosadas por régimen."""
    url = (f"{BASE}/consulta/{CONSULTA_REGIMEN}?D_TERRITORIO_0={BADEA_NODO}"
           f"&D_TEMPORAL_0={id_periodo}")
    resp = descargar_json(url, dir_raw=DATA_RAW, timeout=180, guardar=False)
    fila_valores: dict[str, float | None] = {}
    for fila in resp.get("data", []):
        etiquetas, valor = _celdas(fila)
        regimen = next((REGIMENES[e] for e in etiquetas if e in REGIMENES), None)
        if regimen is None:
            continue
        # El asterisco de BADEA marca «menos de 5», no un cero: se publica como
        # hueco y jamás como 0, que es lo que haría bajar una media sin avisar.
        fila_valores[regimen] = None if valor in (None, "") else round(float(valor))
    return fila_valores


def afiliacion_por_regimen(previo: dict[str, Any] | None = None,
                           hilos: int = 4) -> dict[str, Any]:
    """Serie de afiliaciones a la Seguridad Social por régimen, mensual.

    Es la única fuente que da el número de **trabajadores autónomos** del
    municipio sin el enmascarado ``<5`` del fichero de la Seguridad Social por
    CNAE: BADEA publica el dato agregado por régimen, que no cae bajo el umbral.

    La descarga es **incremental**: los meses ya publicados se reutilizan y solo
    se piden los nuevos, porque BADEA obliga a una petición por mes.

    Args:
        previo: publicación anterior de este bloque, para reutilizar sus meses.
        hilos: peticiones simultáneas contra BADEA.
    """
    log.info("IECA/BADEA · afiliación por régimen (consulta %s, nodo %s)",
             CONSULTA_REGIMEN, BADEA_NODO)
    periodos = _periodos_regimen()
    cache = {p["t"]: p for p in (previo or {}).get("serie", [])}
    pendientes = [(t, i) for t, i in periodos if t not in cache]
    log.info("   %d periodos publicados, %d por descargar", len(periodos), len(pendientes))

    nuevos: dict[str, dict[str, Any]] = {}
    if pendientes:
        with ThreadPoolExecutor(max_workers=hilos) as pool:
            tareas = {pool.submit(_mes_regimen, id_): t for t, id_ in pendientes}
            for tarea in as_completed(tareas):
                t = tareas[tarea]
                try:
                    valores = tarea.result()
                except Exception as exc:  # noqa: BLE001 — un mes caído no tumba la serie
                    log.warning("   mes %s no disponible: %s", t, exc)
                    continue
                if valores:
                    nuevos[t] = {"t": t, **valores}

    serie = sorted({**cache, **nuevos}.values(), key=lambda p: p["t"])
    if not serie:
        raise ValueError("BADEA no devolvió ningún mes de afiliación por régimen")
    ult = serie[-1]
    log.info("   %s: %s autónomos y %s en el régimen general",
             ult["t"], ult.get("autonomos"), ult.get("general"))
    return {
        "serie": serie,
        "consulta": CONSULTA_REGIMEN,
        "nota": ("Afiliaciones por municipio de RESIDENCIA del trabajador, no por centro "
                 "de trabajo. El asterisco de origen («menos de 5») se publica como hueco."),
    }


# ─────────────────────────────────────────── series anuales del SIMA en BADEA

#: Jerarquía del calendario anual. Es **la misma para todas** las consultas del
#: SIMA —comprobado en las doce que usa el observatorio—, así que se descarga una
#: vez y se reutiliza. Cubre de 1900 a 2070; la inmensa mayoría de esos años no
#: tiene dato para ningún indicador, de ahí que las llamadas se acoten.
JERARQUIA_ANUAL = "2"

_calendario: dict[str, int] | None = None


def _alias_territorio(consulta: str) -> str:
    """Alias con el que **esta** consulta filtra por territorio.

    .. danger::
       No siempre es ``D_TERRITORIO_0``. La consulta 101690 (saldo migratorio) usa
       ``D_TERRITORIO_2``, y si se le pasa el alias equivocado **BADEA no protesta:
       ignora el filtro y devuelve los 794 municipios de Andalucía**. Un parser que
       no lo compruebe se queda con la última fila y publica, con toda naturalidad,
       la serie de otro municipio. Por eso el alias se lee de la propia respuesta y
       además se comprueba fila a fila que el territorio es el que se pidió.
    """
    resp = descargar_json(f"{BASE}/consulta/{consulta}", dir_raw=DATA_RAW,
                          timeout=180, guardar=False)
    for h in resp.get("hierarchies", []):
        if str(h.get("alias", "")).startswith("D_TERRITORIO"):
            return h["alias"]
    return "D_TERRITORIO_0"


def _periodos_anuales(consulta: str) -> dict[str, int]:
    """Año → identificador de periodo que acepta ``D_TEMPORAL_0``."""
    global _calendario
    if _calendario is not None:
        return _calendario
    url = (f"{BASE}/jerarquia/{JERARQUIA_ANUAL}"
           f"?consultaId={consulta}&alias=D_TEMPORAL_0")
    arbol = descargar_json(url, dir_raw=DATA_RAW, timeout=180, guardar=False)
    salida: dict[str, int] = {}
    for nodo in arbol.get("data", {}).get("children", []):
        cod = str(nodo.get("cod", ""))
        if cod.isdigit() and len(cod) == 4 and nodo.get("id") is not None:
            salida[cod] = int(nodo["id"])
    _calendario = salida
    return salida


def _fila_anual(fila: list[dict[str, Any]],
                medidas: int) -> tuple[str | None, str, list[float | None], str | None]:
    """Separa una fila de BADEA en ``(año, categoría, valores)``.

    La forma habitual es ``[territorio, …dimensiones…, año, valor₁, valor₂…]``,
    pero **el año no siempre va en el mismo sitio**: cuando la consulta trae la
    dimensión temporal en posición de fila —la 22587, por ejemplo— aparece el
    primero, delante del territorio. Por eso se localiza y se retira el año esté
    donde esté, en vez de partir la lista por él.

    De lo que queda, la primera etiqueta es el territorio y la categoría que
    interesa es **la última**, que es la dimensión puesta en columna. Las de en
    medio son marcas como «Provisional», que describen el estado del dato y no el
    dato.
    """
    etiquetas: list[str] = []
    valores: list[float | None] = []
    for celda in fila:
        if not isinstance(celda, dict):
            continue
        if celda.get("des") is not None:
            etiquetas.append(str(celda["des"]).strip())
        else:
            v = celda.get("val")
            try:
                valores.append(float(v) if v not in (None, "") else None)
            except (TypeError, ValueError):
                valores.append(None)

    anyo = next((e for e in etiquetas if e.isdigit() and len(e) == 4), None)
    restantes = [e for e in etiquetas if e != anyo]
    # restantes[0] es el territorio; si no queda nada más, la consulta no tiene
    # dimensión en columna y todo el dato es un único total.
    territorio = restantes[0] if restantes else None
    categoria = restantes[-1] if len(restantes) > 1 else "Total"
    return anyo, categoria, (valores + [None] * medidas)[:medidas], territorio


def serie_anual(consulta: str | int, desde: int, hasta: int,
                previo: dict[str, Any] | None = None,
                hilos: int = 5) -> dict[str, Any]:
    """Serie anual de una consulta del SIMA para Benahavís.

    Args:
        consulta: identificador de la consulta en BADEA.
        desde, hasta: ventana de años que se pide. No hay forma de preguntarle a
            BADEA desde cuándo publica un indicador, así que se acota a mano y los
            años sin dato simplemente vuelven vacíos.
        previo: salida de una ejecución anterior. Los años que ya estén ahí no se
            vuelven a pedir, que es lo que hace sostenible descargar año a año.

    Returns:
        ``{"titulo", "medidas": [...], "categorias": [...], "anyos": [...],
        "serie": {categoría: [{"t": año, medida: valor, …}]}}``
    """
    consulta = str(consulta)
    alias = _alias_territorio(consulta)
    calendario = _periodos_anuales(consulta)
    cache = (previo or {}).get("serie") or {}
    anyos_cache = {p["t"] for filas in cache.values() for p in filas}

    quiere = [str(a) for a in range(desde, hasta + 1) if str(a) in calendario]
    # El último año publicado puede completarse más tarde, así que se vuelve a
    # pedir siempre; los anteriores, solo si faltan.
    ultimo = max(anyos_cache) if anyos_cache else None
    pendientes = [a for a in quiere if a not in anyos_cache or a == ultimo]

    log.info("IECA/BADEA · consulta %s, %d años en ventana, %d por descargar",
             consulta, len(quiere), len(pendientes))

    titulo, medidas = (previo or {}).get("titulo"), (previo or {}).get("medidas") or []
    recogido: dict[str, dict[str, list]] = {}
    descartadas = 0

    def _anyo(a: str):
        url = (f"{BASE}/consulta/{consulta}?{alias}={BADEA_NODO}"
               f"&D_TEMPORAL_0={calendario[a]}")
        try:
            return a, descargar_json(url, dir_raw=DATA_RAW, timeout=180, guardar=False)
        except Exception as exc:  # noqa: BLE001 — un año caído no tumba la serie
            log.warning("   año %s no disponible: %s", a, exc)
            return a, None

    if pendientes:
        with ThreadPoolExecutor(max_workers=hilos) as pool:
            for a, resp in pool.map(_anyo, pendientes):
                if not resp or resp.get("messages"):
                    continue
                titulo = titulo or (resp.get("metainfo") or {}).get("title")
                nombres = [m.get("des") for m in (resp.get("measures") or [])]
                if nombres:
                    medidas = nombres
                for fila in resp.get("data", []):
                    anyo, categoria, valores, territorio = _fila_anual(fila, len(medidas) or 1)
                    # Cinturón y tirantes: si el filtro no ha surtido efecto, la
                    # respuesta trae toda Andalucía y hay que quedarse solo con lo
                    # nuestro en vez de publicar la serie de otro municipio.
                    if territorio and territorio != MUNICIPIO:
                        descartadas += 1
                        continue
                    if anyo != a or all(v is None for v in valores):
                        continue
                    punto = {"t": anyo}
                    for nombre, v in zip(medidas, valores):
                        punto[nombre] = v
                    recogido.setdefault(categoria, {})[anyo] = punto

    # Se funde lo nuevo con lo ya publicado, sin perder años que la fuente haya
    # dejado de servir: un hueco sobrevenido no debe borrar histórico.
    fundido: dict[str, dict[str, dict]] = {}
    for categoria, filas in cache.items():
        fundido[categoria] = {p["t"]: p for p in filas}
    for categoria, porAnyo in recogido.items():
        fundido.setdefault(categoria, {}).update(porAnyo)

    if descartadas:
        log.warning("   consulta %s: %d filas de otros municipios descartadas "
                    "(el filtro %s no acotó la respuesta)", consulta, descartadas, alias)

    serie = {c: [porAnyo[t] for t in sorted(porAnyo)] for c, porAnyo in fundido.items() if porAnyo}
    anyos = sorted({p["t"] for filas in serie.values() for p in filas})
    if serie:
        log.info("   %d categorías · %d años (%s–%s)", len(serie), len(anyos),
                 anyos[0] if anyos else "-", anyos[-1] if anyos else "-")
    return {"consulta": consulta, "titulo": titulo, "medidas": medidas,
            "categorias": sorted(serie), "anyos": anyos, "serie": serie}
