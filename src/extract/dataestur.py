# -*- coding: utf-8 -*-
"""Extracción de Dataestur (SEGITTUR): demanda turística con resolución municipal.

Dataestur redistribuye la estadística experimental del INE de **medición del
turismo a partir de la posición de los teléfonos móviles**, que —a diferencia de
la Encuesta de Ocupación Hotelera— sí desagrega por municipio de destino.

.. important::
   Esta operación **no mide pernoctaciones en alojamiento reglado**. Estima
   turistas a partir del posicionamiento de terminales móviles, con su propia
   definición de turista y sus propios márgenes de error. Es estadística
   experimental y así debe etiquetarse en todos los gráficos. Nunca se combina en
   un mismo gráfico con datos de la EOH ni del Registro de Turismo de Andalucía.

Los CSV llegan en ``latin-1`` con separador ``;`` y no lo declaran en la cabecera.
"""
from __future__ import annotations

import csv
import io
from collections import defaultdict
from typing import Any
from urllib.parse import quote

from ..contexto import DATA_RAW, MUNICIPIO, NOMBRE_PROVINCIA
from ..utils.http import descargar_texto
from ..utils.log import get_logger

log = get_logger("extract.dataestur")

BASE = "https://www.dataestur.es/API-SEGITTUR-v2"

# Agregados que el propio fichero incluye como filas; se separan del detalle por país.
TOTALES = {
    "Total", "Total Europa", "Total Unión Europea", "Total Asia", "Total América",
    "Total América del Norte", "Total América del Sur", "Total África", "Total Oceanía",
    "Total Resto de Europa", "Total América Central y Caribe",
}

#: El fichero de turismo interno intercala filas de agregado —«Total Nacional» y
#: análogas— entre los municipios. Tratarlas como un municipio más las colocaría en
#: cabeza de cualquier ranking de procedencia, que es justo el error que hay que evitar.
AGREGADOS_TERRITORIALES = {"Total Nacional", "Total", "Total nacional", "TOTAL"}


def _es_agregado(nombre: str) -> bool:
    """``True`` si la etiqueta es una fila de total y no un municipio real."""
    limpio = nombre.strip()
    return limpio in AGREGADOS_TERRITORIALES or limpio.lower().startswith("total ")


def _leer_csv(texto: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(texto), delimiter=";"))


def turismo_receptor(desde: tuple[int, int], hasta: tuple[int, int]) -> dict[str, Any]:
    """Turistas extranjeros con destino Benahavís, por mes y país de origen.

    Args:
        desde: ``(año, mes)`` inicial. El dato arranca en julio de 2019.
        hasta: ``(año, mes)`` final.

    Returns:
        ``{"serie": [{t, v}], "por_pais": {...}, "ultimo_mes": {...}}``.
    """
    log.info("Dataestur · turismo receptor municipal %s-%02d → %s-%02d",
             desde[0], desde[1], hasta[0], hasta[1])
    params = (
        f"{quote('desde (año)')}={desde[0]}&{quote('desde (mes)')}={desde[1]}"
        f"&{quote('hasta (año)')}={hasta[0]}&{quote('hasta (mes)')}={hasta[1]}"
        f"&Provincia={quote(NOMBRE_PROVINCIA)}"
    )
    texto = descargar_texto(f"{BASE}/TURISMO_RECEPTOR_MUN_PAIS_DL?{params}",
                            codificacion="latin-1", dir_raw=DATA_RAW, timeout=300)
    filas = [f for f in _leer_csv(texto) if (f.get("MUNICIPIO_DESTINO") or "").strip() == MUNICIPIO]
    if not filas:
        raise ValueError(f"Dataestur no devolvió filas para {MUNICIPIO}")

    serie: dict[str, int] = {}
    por_pais_mes: dict[str, dict[str, int]] = defaultdict(dict)
    for f in filas:
        try:
            anyo, mes = int(f["AÑO"]), int(f["MES"])
            turistas = int(float(f["TURISTAS"]))
        except (KeyError, TypeError, ValueError):
            continue
        t = f"{anyo}-{mes:02d}"
        pais = (f.get("PAIS_ORIGEN") or "").strip()
        if pais == "Total":
            serie[t] = turistas
        elif pais not in TOTALES:
            por_pais_mes[pais][t] = turistas

    meses = sorted(serie)
    ultimo = meses[-1] if meses else None
    ranking_ultimo = sorted(
        ((p, m.get(ultimo, 0)) for p, m in por_pais_mes.items()),
        key=lambda x: -x[1],
    )[:15] if ultimo else []

    # Acumulado de los últimos 12 meses disponibles, por país.
    ventana = meses[-12:]
    acumulado = sorted(
        ((p, sum(m.get(t, 0) for t in ventana)) for p, m in por_pais_mes.items()),
        key=lambda x: -x[1],
    )[:15]

    log.info("   %d meses (%s → %s) · último mes: %s turistas",
             len(meses), meses[0] if meses else "-", ultimo, serie.get(ultimo, 0))

    return {
        "serie": [{"t": t, "v": serie[t]} for t in meses],
        "ultimo_mes": ultimo,
        "top_paises_ultimo_mes": [{"pais": p, "v": v} for p, v in ranking_ultimo if v > 0],
        "top_paises_12m": [{"pais": p, "v": v} for p, v in acumulado if v > 0],
        "ventana_12m": ventana,
        "por_pais": {p: [{"t": t, "v": m[t]} for t in sorted(m)] for p, m in por_pais_mes.items()},
    }


def turismo_interno(anyos: list[int]) -> dict[str, Any]:
    """Turistas residentes en España con destino Benahavís, por municipio de origen.

    El fichero de Dataestur es nacional y pesa unos 30 MB por año, de modo que no
    se archiva la descarga cruda: se filtra en memoria.
    """
    log.info("Dataestur · turismo interno municipal, años %s", anyos)
    serie: dict[str, int] = defaultdict(int)
    origenes: dict[str, int] = defaultdict(int)
    salidas: dict[str, int] = defaultdict(int)
    total_nacional: dict[str, int] = defaultdict(int)

    for anyo in anyos:
        try:
            texto = descargar_texto(f"{BASE}/TURISMO_INTERNO_MUN_MUN_DL?a%C3%B1o={anyo}",
                                    codificacion="latin-1", dir_raw=DATA_RAW,
                                    timeout=420, guardar=False)
        except Exception as exc:  # noqa: BLE001 — un año que falle no debe tumbar el resto
            log.warning("   año %d no disponible: %s", anyo, exc)
            continue
        n = 0
        for f in _leer_csv(texto):
            destino = (f.get("MUNICIPIO_DESTINO") or "").strip()
            origen = (f.get("MUNICIPIO_ORIGEN") or "").strip()
            if destino != MUNICIPIO and origen != MUNICIPIO:
                continue
            try:
                mes = int(f["MES"])
                turistas = int(float(f["TURISTAS"]))
            except (KeyError, TypeError, ValueError):
                continue
            t = f"{anyo}-{mes:02d}"
            if destino == MUNICIPIO:
                if _es_agregado(origen):
                    # Es la fila de total del propio fichero: da la serie mensual, pero
                    # no puede figurar como municipio de procedencia.
                    total_nacional[t] += turistas
                else:
                    origenes[origen] += turistas
                    serie[t] += turistas
                n += 1
            if origen == MUNICIPIO and not _es_agregado(destino):
                salidas[destino] += turistas
        log.info("   %d: %d registros con destino %s", anyo, n, MUNICIPIO)

    # La serie mensual se toma de la fila de total que publica el propio fichero, que es
    # más completa que la suma de los municipios listados; si no existe, se reconstruye
    # sumando los orígenes. Nunca se mezclan ambas.
    if total_nacional:
        serie = total_nacional
        origen_serie = "fila de total del fichero de origen"
    else:
        origen_serie = "suma de los municipios de origen"

    meses = sorted(serie)
    log.info("   serie mensual: %d meses (%s) · %d municipios de origen distintos",
             len(meses), origen_serie, len(origenes))

    return {
        "serie": [{"t": t, "v": serie[t]} for t in meses],
        "origen_serie": origen_serie,
        "top_origenes": [{"municipio": m, "v": v}
                         for m, v in sorted(origenes.items(), key=lambda x: -x[1])[:15]],
        "top_destinos_emisor": [{"municipio": m, "v": v}
                                for m, v in sorted(salidas.items(), key=lambda x: -x[1])[:15]],
        "anyos": anyos,
    }
