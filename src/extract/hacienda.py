# -*- coding: utf-8 -*-
"""Extracción del Ministerio de Hacienda: deuda viva de las entidades locales.

Fichero anual con patrón de URL estable, verificado para los ejercicios 2022,
2023 y 2024::

    https://www.hacienda.gob.es/cdi/sist financiacion y deuda/informacioneells/
    {AAAA}/deuda-viva-ayuntamientos-{AAAA}12.xlsx

El resto de indicadores de finanzas municipales (periodo medio de pago,
presupuestos y liquidaciones) residen en aplicaciones web con formulario, sin
descarga directa: quedan documentados como pendientes en el inventario de fuentes
y **no se integran en el pipeline**.
"""
from __future__ import annotations

import datetime as dt
import io
from typing import Any
from urllib.parse import quote

import openpyxl

from ..contexto import COD_INE, DATA_RAW, MUNICIPIO
from ..utils.http import FuenteNoDisponible, descargar
from ..utils.log import get_logger

log = get_logger("extract.hacienda")

BASE = "https://www.hacienda.gob.es/cdi"
RUTA = "sist financiacion y deuda/informacioneells"


def _url(anyo: int) -> str:
    return f"{BASE}/{quote(RUTA)}/{anyo}/deuda-viva-ayuntamientos-{anyo}12.xlsx"


#: Columnas de la hoja «Datos»: año, código de CCAA, CCAA, código de provincia,
#: provincia, código de municipio (tres dígitos), nombre e importe de deuda viva.
COL_PROVINCIA = 3
COL_MUNICIPIO = 5
COL_NOMBRE = 6
COL_DEUDA = 7


def _buscar_municipio(contenido: bytes) -> dict[str, Any] | None:
    """Localiza la fila de Benahavís en el libro de deuda viva.

    Todos los campos vienen como texto, incluido el importe, de modo que la
    identificación se hace por los códigos de provincia y municipio —no por el
    nombre, que aparece con espacios de relleno y podría repetirse en otra
    provincia—.
    """
    prov, muni = COD_INE[:2], COD_INE[2:]
    libro = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    try:
        for hoja in libro.worksheets:
            for fila in hoja.iter_rows(values_only=True):
                if len(fila) <= COL_DEUDA:
                    continue
                if (str(fila[COL_PROVINCIA] or "").strip().zfill(2) != prov
                        or str(fila[COL_MUNICIPIO] or "").strip().zfill(3) != muni):
                    continue
                celda = fila[COL_DEUDA]
                if celda is None:
                    continue
                # Ojo: la deuda puede ser exactamente 0 —es el caso de Benahavís—, así
                # que no se puede usar `celda or ""` para normalizar: cero es falsy.
                if isinstance(celda, (int, float)):
                    importe: float | None = float(celda)
                else:
                    bruto = str(celda).strip().replace(".", "").replace(",", ".")
                    try:
                        importe = float(bruto)
                    except ValueError:
                        log.debug("importe no numérico en la fila de %s: %r", MUNICIPIO, bruto)
                        importe = None
                if importe is not None:
                    return {"deuda_miles_eur": importe,
                            "nombre_en_fichero": str(fila[COL_NOMBRE] or "").strip()}
    finally:
        libro.close()
    return None


def deuda_viva(anyos: list[int] | None = None) -> dict[str, Any]:
    """Serie anual de deuda viva del Ayuntamiento de Benahavís, en miles de euros."""
    if anyos is None:
        # La ruta actual del ministerio solo aloja ficheros desde el ejercicio 2022;
        # los anteriores devuelven 404 y no se solicitan.
        actual = dt.date.today().year
        anyos = list(range(2022, actual))
    log.info("Hacienda · deuda viva de entidades locales, años %s", anyos)

    serie: list[dict[str, Any]] = []
    for anyo in anyos:
        try:
            contenido = descargar(_url(anyo), dir_raw=DATA_RAW, sufijo=".xlsx",
                                  timeout=180, reintentos=2, guardar=False)
        except FuenteNoDisponible as exc:
            log.debug("   %d no disponible: %s", anyo, exc.causa)
            continue
        fila = _buscar_municipio(contenido)
        if fila is None:
            log.warning("   %d: no se localizó a %s en el fichero", anyo, MUNICIPIO)
            continue
        serie.append({"t": str(anyo), "v": fila["deuda_miles_eur"]})
        log.info("   %d: %.0f miles de euros", anyo, fila["deuda_miles_eur"])

    return {
        "serie": serie,
        "unidad": "miles de euros",
        "referencia": "a 31 de diciembre de cada ejercicio",
    }
