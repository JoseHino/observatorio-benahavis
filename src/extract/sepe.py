# -*- coding: utf-8 -*-
"""Extracción del SEPE: paro registrado y contratos por municipio.

Los CSV anuales de datos abiertos del SEPE son nacionales, vienen en ``latin-1``
con separador ``;`` y se refunden con aproximadamente un mes de retraso. El
observatorio lee esos CSV y, además, agrega en la misma pasada los totales de
España, Andalucía y Málaga, de modo que la comparativa territorial se calcula con
idéntica metodología y es plenamente comparable.

Mapeo de columnas verificado (índices base 0):

============  ==================================================================
Índice        Contenido
============  ==================================================================
0             Código de mes ``AAAAMM``
2             Código de comunidad autónoma
4             Código de provincia
6             Código de municipio
8             Total
9–14 (paro)   Hombres <25 / 25-44 / ≥45, Mujeres <25 / 25-44 / ≥45
9–14 (contr.) H indef. inicial / H temporal / H convertido, ídem mujeres
15–19         Agricultura, industria, construcción, servicios, sin empleo anterior
============  ==================================================================
"""
from __future__ import annotations

import csv
import datetime as dt
import io
from typing import Any

from ..contexto import COD_CCAA, COD_INE, COD_PROVINCIA, DATA_RAW
from ..utils.http import descargar_texto
from ..utils.log import get_logger

log = get_logger("extract.sepe")

BASE = "https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/datos_abiertos/datos"


def _entero(celda: str | None) -> int:
    if not celda:
        return 0
    texto = str(celda).strip().replace(".", "").replace(",", ".")
    try:
        return int(round(float(texto)))
    except ValueError:
        return 0


def _filas(url: str) -> list[list[str]]:
    texto = descargar_texto(url, codificacion="latin-1", dir_raw=DATA_RAW, timeout=240)
    return list(csv.reader(io.StringIO(texto), delimiter=";"))


def _ordenar_unico(filas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ordena por periodo y elimina duplicados conservando la primera aparición."""
    filas.sort(key=lambda x: x["t"])
    vistos, salida = set(), []
    for f in filas:
        if f["t"] in vistos:
            continue
        vistos.add(f["t"])
        salida.append(f)
    return salida


def paro(anyos: list[int]) -> dict[str, Any]:
    """Paro registrado mensual en Benahavís, con comparativa territorial."""
    log.info("SEPE · paro registrado, años %s", anyos)
    municipio: list[dict[str, Any]] = []
    territorial: dict[str, dict[str, int]] = {}

    for anyo in anyos:
        try:
            filas = _filas(f"{BASE}/Paro_por_municipios_{anyo}_csv.csv")
        except Exception as exc:  # noqa: BLE001
            log.warning("   %d no disponible: %s", anyo, exc)
            continue
        n = 0
        for r in filas:
            if len(r) < 19:
                continue
            crudo = (r[0] or "").strip()
            if not crudo[:4].isdigit():
                continue
            t = f"{crudo[:4]}-{crudo[4:6]}"
            total = _entero(r[8])
            agg = territorial.setdefault(t, {"espana": 0, "andalucia": 0, "malaga": 0})
            agg["espana"] += total
            if (r[2] or "").strip() == COD_CCAA:
                agg["andalucia"] += total
            if (r[4] or "").strip() == COD_PROVINCIA:
                agg["malaga"] += total
            if (r[6] or "").strip() == COD_INE:
                municipio.append({
                    "t": t,
                    "total": total,
                    "hombres": _entero(r[9]) + _entero(r[10]) + _entero(r[11]),
                    "mujeres": _entero(r[12]) + _entero(r[13]) + _entero(r[14]),
                    "edad": {
                        "menor25": _entero(r[9]) + _entero(r[12]),
                        "de25a44": _entero(r[10]) + _entero(r[13]),
                        "mayor45": _entero(r[11]) + _entero(r[14]),
                    },
                    "sectores": {
                        "agricultura": _entero(r[15]),
                        "industria": _entero(r[16]),
                        "construccion": _entero(r[17]),
                        "servicios": _entero(r[18]),
                        "sin_empleo_anterior": _entero(r[19]) if len(r) > 19 else 0,
                    },
                })
                n += 1
        log.info("   %d: %d meses de %s", anyo, n, COD_INE)

    municipio = _ordenar_unico(municipio)
    comparativa = [
        {"t": t, **territorial[t]} for t in sorted(territorial)
    ]
    return {"serie": municipio, "comparativa": comparativa}


def contratos(anyos: list[int]) -> dict[str, Any]:
    """Contratos registrados mensualmente en Benahavís, por tipo y sector."""
    log.info("SEPE · contratos registrados, años %s", anyos)
    municipio: list[dict[str, Any]] = []

    for anyo in anyos:
        try:
            filas = _filas(f"{BASE}/Contratos_por_municipios_{anyo}_csv.csv")
        except Exception as exc:  # noqa: BLE001
            log.warning("   %d no disponible: %s", anyo, exc)
            continue
        n = 0
        for r in filas:
            if len(r) < 19 or (r[6] or "").strip() != COD_INE:
                continue
            crudo = (r[0] or "").strip()
            if not crudo[:4].isdigit():
                continue
            indefinidos = _entero(r[9]) + _entero(r[11]) + _entero(r[12]) + _entero(r[14])
            temporales = _entero(r[10]) + _entero(r[13])
            municipio.append({
                "t": f"{crudo[:4]}-{crudo[4:6]}",
                "total": _entero(r[8]),
                "indefinidos": indefinidos,
                "temporales": temporales,
                "sectores": {
                    "agricultura": _entero(r[15]),
                    "industria": _entero(r[16]),
                    "construccion": _entero(r[17]),
                    "servicios": _entero(r[18]),
                },
            })
            n += 1
        log.info("   %d: %d meses de %s", anyo, n, COD_INE)

    return {"serie": _ordenar_unico(municipio)}


def anyos_recientes(n: int = 4) -> list[int]:
    """Los ``n`` últimos años naturales, para acotar la descarga."""
    actual = dt.date.today().year
    return list(range(actual - n + 1, actual + 1))
