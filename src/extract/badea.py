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

.. warning::
   La dimensión temporal de la consulta 876 va en posición de *página*: el
   endpoint solo devuelve **un periodo por petición** y una lista separada por
   comas devuelve cero filas sin error. La serie se construye mes a mes.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from ..contexto import BADEA_NODO, DATA_RAW
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
