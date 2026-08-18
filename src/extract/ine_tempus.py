# -*- coding: utf-8 -*-
"""Extracción del INE mediante la API Tempus3.

Cubre tres operaciones, todas verificadas contra el endpoint real para Benahavís:

* ``DPOP`` tabla **2882** — Padrón municipal por sexo (Málaga).
* ``ADRH`` tabla **30824** — Atlas de Distribución de Renta de los Hogares.
* ``ADRH`` tabla **37677** — Índice de Gini y distribución de la renta P80/P20.
* ``VTE`` tablas **39363** y **39366** — Viviendas turísticas y su peso sobre el
  parque residencial.

.. warning::
   El campo ``Fecha`` que devuelve Tempus3 viene expresado en hora de Madrid. Al
   convertirlo a UTC cae en el mes anterior y toda la serie mensual sale corrida.
   Este módulo **ignora ``Fecha``** y construye el periodo a partir de ``Anyo`` y
   ``FK_Periodo``, que son los campos fiables.
"""
from __future__ import annotations

from typing import Any

from ..contexto import DATA_RAW, INE_TV_MUNICIPIO
from ..utils.http import descargar_json
from ..utils.log import get_logger

log = get_logger("extract.ine")

BASE = "https://servicios.ine.es/wstempus/js/ES"

TABLA_PADRON = "2882"
TABLA_RENTA = "30824"
#: El Atlas publica 54 tablas homónimas de Gini, una por demarcación. Solo la 37677
#: contiene los municipios de Málaga: las contiguas devuelven una respuesta vacía
#: para ``tv=19:2923``, de modo que el identificador no es intercambiable.
TABLA_GINI = "37677"
TABLA_VUT = "39363"
TABLA_VUT_PORCENTAJE = "39366"


def _periodo(dato: dict[str, Any], *, mensual: bool) -> str:
    """Construye la etiqueta de periodo a partir de ``Anyo`` y ``FK_Periodo``.

    No se usa el campo ``Fecha``: viene en hora de Madrid y al pasarlo a UTC
    desplaza la serie un mes hacia atrás, con lo que toda la serie sale corrida.

    ``FK_Periodo`` no significa lo mismo en todas las operaciones: en las series
    anuales del Padrón vale 28 y en las del Atlas de Renta vale 1, mientras que en
    las viviendas turísticas identifica el mes de referencia. Por eso el formato
    se decide con el argumento explícito ``mensual`` y no infiriéndolo del código.
    """
    anyo = dato.get("Anyo")
    if not mensual:
        return str(anyo)
    fk = dato.get("FK_Periodo")
    if not isinstance(fk, int) or not 1 <= fk <= 12:
        return str(anyo)
    return f"{anyo}-{fk:02d}"


def _serie(dato_serie: dict[str, Any], *, mensual: bool = False) -> list[dict[str, Any]]:
    """Convierte el array ``Data`` de una serie Tempus3 en puntos ``{t, v}`` ordenados."""
    puntos = []
    for d in dato_serie.get("Data", []):
        valor = d.get("Valor")
        if valor is None:
            continue
        puntos.append({"t": _periodo(d, mensual=mensual), "v": valor})
    return sorted(puntos, key=lambda p: p["t"])


def _datos_tabla(tabla: str, *, nult: int | None = None, tv: str | None = None) -> list[dict]:
    """Descarga ``DATOS_TABLA`` con filtros opcionales."""
    partes = []
    if nult is not None:
        partes.append(f"nult={nult}")
    if tv is not None:
        partes.append(f"tv={tv}")
    url = f"{BASE}/DATOS_TABLA/{tabla}"
    if partes:
        url += "?" + "&".join(partes)
    return descargar_json(url, dir_raw=DATA_RAW)


def padron(nult: int = 30) -> dict[str, Any]:
    """Población empadronada de Benahavís por sexo, serie anual.

    La tabla 2882 contiene los 103 municipios de Málaga; se filtra por nombre de
    serie porque el identificador de serie (``DPOP13531`` y siguientes) no está
    documentado como estable entre revisiones.

    Returns:
        ``{"total": [...], "hombres": [...], "mujeres": [...]}`` con puntos ``{t, v}``.
    """
    log.info("INE · Padrón municipal (tabla %s)", TABLA_PADRON)
    crudo = _datos_tabla(TABLA_PADRON, nult=nult)
    salida: dict[str, list] = {"total": [], "hombres": [], "mujeres": []}
    for s in crudo:
        nombre = s.get("Nombre", "")
        if "Benahavís" not in nombre:
            continue
        if ". Total." in nombre:
            salida["total"] = _serie(s)
        elif ". Hombres." in nombre:
            salida["hombres"] = _serie(s)
        elif ". Mujeres." in nombre:
            salida["mujeres"] = _serie(s)
    if not salida["total"]:
        raise ValueError("la tabla 2882 no devolvió la serie total de Benahavís")
    log.info("   %d años de padrón (último: %s = %s hab.)",
             len(salida["total"]), salida["total"][-1]["t"], salida["total"][-1]["v"])
    return salida


def atlas_renta(nult: int = 12) -> dict[str, list]:
    """Indicadores de renta media y mediana del Atlas del INE para Benahavís.

    Se usa el filtro ``tv`` sobre la variable territorial: la tabla 30824 cubre
    todos los municipios de España, de modo que sin filtro la respuesta sería
    inmanejable.
    """
    log.info("INE · Atlas de Renta (tabla %s, tv=%s)", TABLA_RENTA, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_RENTA, nult=nult, tv=INE_TV_MUNICIPIO)
    claves = {
        "Renta neta media por persona": "renta_neta_persona",
        "Renta neta media por hogar": "renta_neta_hogar",
        "Media de la renta por unidad de consumo": "renta_uc_media",
        "Mediana de la renta por unidad de consumo": "renta_uc_mediana",
        "Renta bruta media por persona": "renta_bruta_persona",
        "Renta bruta media por hogar": "renta_bruta_hogar",
    }
    salida: dict[str, list] = {}
    for s in crudo:
        nombre = s.get("Nombre", "")
        for etiqueta, clave in claves.items():
            if etiqueta in nombre:
                salida[clave] = _serie(s)
    log.info("   %d indicadores de renta", len(salida))
    return salida


def desigualdad(nult: int = 12) -> dict[str, list]:
    """Índice de Gini y distribución P80/P20 de Benahavís, serie anual.

    Ambos indicadores describen el **reparto** de la renta, que las medias del
    Atlas no revelan: un municipio con renta media alta puede tener una
    distribución muy desigual. El Gini se publica en escala 0–100 —no 0–1— y el
    P80/P20 es la razón entre la renta del quintil superior y la del inferior.

    Los años sin dato publicado se descartan en :func:`_serie`, de modo que la
    serie devuelta no contiene huecos rellenados.
    """
    log.info("INE · Gini y P80/P20 (tabla %s, tv=%s)", TABLA_GINI, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_GINI, nult=nult, tv=INE_TV_MUNICIPIO)
    salida: dict[str, list] = {}
    for s in crudo:
        nombre = s.get("Nombre", "")
        if "Gini" in nombre:
            salida["gini"] = _serie(s)
        elif "P80/P20" in nombre:
            salida["p80_p20"] = _serie(s)
    if salida.get("gini"):
        ult = salida["gini"][-1]
        log.info("   %d años (último: %s = %s)", len(salida["gini"]), ult["t"], ult["v"])
    else:
        log.warning("   la tabla %s no devolvió el índice de Gini del municipio", TABLA_GINI)
    return salida


def viviendas_turisticas(nult: int = 24) -> dict[str, Any]:
    """Viviendas turísticas anunciadas en plataformas, estadística experimental del INE.

    .. important::
       Esta fuente mide **oferta anunciada en plataformas de intermediación**. NO es
       comparable con el Registro de Turismo de Andalucía, que mide **oferta inscrita
       administrativamente**. Los dos indicadores van en gráficos separados.
    """
    log.info("INE · Viviendas turísticas (tablas %s y %s)", TABLA_VUT, TABLA_VUT_PORCENTAJE)
    salida: dict[str, Any] = {}

    # Sin el filtro `tv` estas tablas devuelven las 24.621 series de toda España y
    # la petición tarda más de dos minutos; con él, tres series y dos segundos.
    crudo = _datos_tabla(TABLA_VUT, nult=nult, tv=INE_TV_MUNICIPIO)
    for s in crudo:
        nombre = s.get("Nombre", "")
        if not nombre.startswith("Benahavís."):
            continue
        if "Viviendas turísticas" in nombre:
            salida["viviendas"] = _serie(s, mensual=True)
        elif "Plazas por vivienda" in nombre:
            salida["plazas_por_vivienda"] = _serie(s, mensual=True)
        elif "Plazas" in nombre:
            salida["plazas"] = _serie(s, mensual=True)

    try:
        crudo_pct = _datos_tabla(TABLA_VUT_PORCENTAJE, nult=nult, tv=INE_TV_MUNICIPIO)
        for s in crudo_pct:
            if s.get("Nombre", "").startswith("Benahavís."):
                salida["porcentaje_sobre_censadas"] = _serie(s, mensual=True)
                break
    except Exception as exc:  # noqa: BLE001 — tabla secundaria; no debe tumbar el bloque
        log.warning("   tabla %s no disponible: %s", TABLA_VUT_PORCENTAJE, exc)

    if "viviendas" in salida and salida["viviendas"]:
        ult = salida["viviendas"][-1]
        log.info("   último periodo %s: %s viviendas", ult["t"], ult["v"])
    return salida
