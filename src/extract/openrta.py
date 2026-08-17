# -*- coding: utf-8 -*-
"""Extracción del Registro de Turismo de Andalucía (OpenRTA).

Fuente central de la oferta turística del observatorio: registro administrativo
**nominal**, con establecimiento, titular, tipología, categoría, plazas,
unidades de alojamiento, fecha de alta y coordenadas en EPSG:25830.

.. warning::
   Trampas verificadas de esta API:

   1. ``/search`` **exige todos los parámetros**; si falta alguno devuelve ``422``.
      El valor neutro es ``-``.
   2. La provincia va **con tilde** (``MÁLAGA``) y el municipio **sin tilde y en
      mayúsculas** (``BENAHAVIS``).
   3. ``/count`` **ignora los filtros** y devuelve siempre el total de Andalucía.
      El recuento municipal correcto es ``total_hits`` de ``/search``.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any
from urllib.parse import urlencode

from ..contexto import DATA_RAW, RTA_MUNICIPIO, RTA_PROVINCIA
from ..transform.geo import numero_es, utm30n_a_wgs84
from ..utils.http import descargar_json
from ..utils.log import get_logger

log = get_logger("extract.openrta")

BASE = "https://datos.juntadeandalucia.es/api/v0/openrta"

#: Envolvente generosa del término municipal de Benahavís y su entorno inmediato.
#: Algunos registros del RTA traen coordenadas erróneas (ceros, o puntos situados
#: en otras provincias). Se descartan del mapa y se contabilizan aparte: no se
#: corrigen ni se reubican, porque el dato de origen es el que es.
CAJA_MUNICIPIO = {"lat_min": 36.40, "lat_max": 36.70, "lon_min": -5.30, "lon_max": -4.80}

# Tipologías que constituyen oferta de alojamiento (frente a servicios y actividades).
TIPOS_ALOJAMIENTO = {
    "Establecimiento Hotelero",
    "Apartamento turístico",
    "Vivienda de uso turístico",
    "Vivienda turística de alojamiento rural",
    "Casa rural",
    "Campamento de turismo",
}


def _url_busqueda(tamano: int) -> str:
    """Construye la consulta con los nueve parámetros obligatorios."""
    params = {
        "id": "-",
        "object_type": "-",
        "category": "-",
        "group": "-",
        "modality": "-",
        "province": RTA_PROVINCIA,
        "municipality": RTA_MUNICIPIO,
        "order_by": "id",
        "mode": "ASC",
        "format": "json",
        "size": tamano,
    }
    return f"{BASE}/search?{urlencode(params)}"


def registros(tamano: int = 5000) -> list[dict[str, Any]]:
    """Descarga el censo completo de inscripciones del RTA en Benahavís."""
    log.info("OpenRTA · registro de turismo de %s", RTA_MUNICIPIO)
    resp = descargar_json(_url_busqueda(tamano), dir_raw=DATA_RAW, timeout=180)
    total = resp.get("total_hits", 0)
    filas = resp.get("results", [])
    log.info("   %d inscripciones (total_hits declarado: %d)", len(filas), total)
    if total and len(filas) < total:
        log.warning("   la respuesta viene truncada: subir el parámetro size")
    return filas


def _entero(valor: Any) -> int:
    try:
        return int(valor)
    except (TypeError, ValueError):
        return 0


def resumir(filas: list[dict[str, Any]]) -> dict[str, Any]:
    """Agrega el censo del RTA en los indicadores publicables del observatorio.

    Returns:
        Diccionario con el recuento y las plazas por tipología, la serie acumulada
        de altas por año, el desglose de categorías hoteleras y los puntos
        georreferenciados de los alojamientos.
    """
    por_tipo: dict[str, dict[str, int]] = defaultdict(lambda: {"establecimientos": 0, "plazas": 0, "unidades": 0})
    altas_por_anyo: dict[str, int] = defaultdict(int)
    categorias_hotel: dict[str, dict[str, int]] = defaultdict(lambda: {"establecimientos": 0, "plazas": 0})
    puntos: list[dict[str, Any]] = []
    sin_coordenadas = 0
    fuera_de_caja = 0

    for f in filas:
        tipo = (f.get("objects_type_id") or "Sin clasificar").strip()
        plazas = _entero(f.get("tot_gen_places"))
        unidades = _entero(f.get("tot_gen_ua"))

        por_tipo[tipo]["establecimientos"] += 1
        por_tipo[tipo]["plazas"] += plazas
        por_tipo[tipo]["unidades"] += unidades

        alta = (f.get("registration_date") or "")[:4]
        if alta.isdigit():
            altas_por_anyo[alta] += 1

        if tipo == "Establecimiento Hotelero":
            cat = (f.get("categories") or "Sin categoría").strip()
            categorias_hotel[cat]["establecimientos"] += 1
            categorias_hotel[cat]["plazas"] += plazas

        if tipo in TIPOS_ALOJAMIENTO:
            # El RTA mezcla formatos numéricos en el mismo campo: los hoteles traen
            # el separador decimal en punto y las viviendas de uso turístico en coma.
            este = numero_es(f.get("coord_x"))
            norte = numero_es(f.get("coord_y"))
            if este is None or norte is None:
                sin_coordenadas += 1
            else:
                lat, lon = utm30n_a_wgs84(este, norte)
                if not (CAJA_MUNICIPIO["lat_min"] <= lat <= CAJA_MUNICIPIO["lat_max"]
                        and CAJA_MUNICIPIO["lon_min"] <= lon <= CAJA_MUNICIPIO["lon_max"]):
                    fuera_de_caja += 1
                    continue
                puntos.append({
                    "nombre": f.get("name") or "",
                    "tipo": tipo,
                    "categoria": (f.get("categories") or "").strip(),
                    "plazas": plazas,
                    "lat": lat,
                    "lon": lon,
                })

    # Serie acumulada de inscripciones vivas por año de alta.
    anyos = sorted(altas_por_anyo)
    acumulado, total_acum = [], 0
    for a in anyos:
        total_acum += altas_por_anyo[a]
        acumulado.append({"t": a, "v": total_acum})

    plazas_totales = sum(v["plazas"] for v in por_tipo.values())
    plazas_alojamiento = sum(v["plazas"] for k, v in por_tipo.items() if k in TIPOS_ALOJAMIENTO)

    log.info("   %d inscripciones · %d plazas de alojamiento · %d puntos con coordenadas",
             len(filas), plazas_alojamiento, len(puntos))
    if sin_coordenadas:
        log.warning("   %d alojamientos sin coordenadas utilizables", sin_coordenadas)
    if fuera_de_caja:
        log.warning("   %d alojamientos con coordenadas fuera del entorno del municipio "
                    "(error en el registro de origen); se excluyen del mapa", fuera_de_caja)

    return {
        "total_inscripciones": len(filas),
        "plazas_totales": plazas_totales,
        "plazas_alojamiento": plazas_alojamiento,
        "por_tipo": {k: dict(v) for k, v in sorted(por_tipo.items(), key=lambda x: -x[1]["establecimientos"])},
        "categorias_hotel": {k: dict(v) for k, v in sorted(categorias_hotel.items())},
        "altas_por_anyo": [{"t": a, "v": altas_por_anyo[a]} for a in anyos],
        "acumulado_altas": acumulado,
        "puntos": puntos,
        "alojamientos_sin_coordenadas": sin_coordenadas,
        "alojamientos_coordenada_erronea": fuera_de_caja,
        "crs_origen": "EPSG:25830",
        "crs_puntos": "EPSG:4326",
    }
