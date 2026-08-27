# -*- coding: utf-8 -*-
"""Extracción del SIMA del IECA: ficha municipal de «Andalucía pueblo a pueblo».

El INE dejó de publicar la nacionalidad a escala municipal después de 2022 —la
Estadística Continua de Población solo la baja a los 83 municipios mayores—, de
modo que la única cifra reciente de población extranjera de Benahavís es la que
el IECA publica en su ficha municipal a partir de su propia explotación del
Padrón.

.. warning::
   La ficha del SIMA **no es la cifra oficial del INE**: es una explotación
   distinta del padrón y su población total no coincide con la del Real Decreto
   de cifras oficiales. Por eso el porcentaje de extranjeros se calcula siempre
   contra la población de la propia ficha, y el dato se publica etiquetado como
   IECA, nunca fundido con la serie del INE.

El fichero es un ``.xls`` binario (Excel 97) con **una fila por municipio
andaluz** y una columna por variable, con el año pegado al nombre de la columna
(«Número de extranjeros. 2025»): el año hay que leerlo de la cabecera, no darlo
por supuesto.
"""
from __future__ import annotations

import io
import re
from typing import Any

import xlrd

from ..contexto import COD_INE, DATA_RAW
from ..utils.http import descargar
from ..utils.log import get_logger

log = get_logger("extract.sima")

URL = ("https://www.juntadeandalucia.es/institutodeestadisticaycartografia"
       "/sima/datos/smex99.xls")

FILA_CABECERA = 10
COL_COD_MUNICIPIO = 1

#: Columnas que interesan, por el texto que precede al año en la cabecera.
VARIABLES = {
    "Población total": "poblacion",
    "Número de extranjeros": "extranjeros",
    "Principal procedencia de los extranjeros residentes": "principal_procedencia",
    "Porcentaje que representa respecto total de extranjeros": "peso_principal_procedencia",
}


def _anyo(cabecera: str) -> str | None:
    encontrado = re.search(r"(\d{4})\s*$", cabecera.strip())
    return encontrado.group(1) if encontrado else None


def poblacion_extranjera() -> dict[str, Any]:
    """Población extranjera del municipio según la ficha municipal del IECA.

    Returns:
        ``{"anyo", "poblacion", "extranjeros", "porcentaje", "principal_procedencia",
        "peso_principal_procedencia"}``. El porcentaje se calcula con la población
        de la propia ficha para que numerador y denominador sean de la misma fuente.
    """
    log.info("IECA/SIMA · ficha municipal (%s)", URL.rsplit("/", 1)[-1])
    contenido = descargar(URL, dir_raw=DATA_RAW, sufijo=".xls", timeout=300, guardar=False)
    libro = xlrd.open_workbook(file_contents=contenido)
    hoja = libro.sheet_by_index(0)

    cabeceras = [str(hoja.cell_value(FILA_CABECERA, c)) for c in range(hoja.ncols)]
    columnas: dict[str, int] = {}
    anyos: list[str] = []
    for indice, cabecera in enumerate(cabeceras):
        for etiqueta, clave in VARIABLES.items():
            if cabecera.startswith(etiqueta) and clave not in columnas:
                columnas[clave] = indice
                if (a := _anyo(cabecera)):
                    anyos.append(a)

    fila = None
    for r in range(FILA_CABECERA + 1, hoja.nrows):
        if str(hoja.cell_value(r, COL_COD_MUNICIPIO)).strip() == COD_INE:
            fila = r
            break
    if fila is None:
        raise ValueError(f"la ficha del SIMA no contiene el municipio {COD_INE}")

    def valor(clave: str) -> Any:
        indice = columnas.get(clave)
        if indice is None:
            return None
        v = hoja.cell_value(fila, indice)
        return v if v != "" else None

    poblacion = valor("poblacion")
    extranjeros = valor("extranjeros")
    salida = {
        "anyo": max(anyos) if anyos else None,
        "poblacion": int(poblacion) if poblacion else None,
        "extranjeros": int(extranjeros) if extranjeros else None,
        "porcentaje": round(extranjeros / poblacion * 100, 1) if poblacion and extranjeros else None,
        "principal_procedencia": valor("principal_procedencia"),
        "peso_principal_procedencia": valor("peso_principal_procedencia"),
        "fuente": "IECA · SIMA, ficha municipal (explotación propia del Padrón)",
        "advertencia": ("Explotación del IECA, distinta de las cifras oficiales del INE: "
                        "su población total no coincide con la del padrón oficial y las dos "
                        "cifras no deben mezclarse en una misma serie."),
    }
    log.info("   %s: %s extranjeros de %s habitantes (%s %%), principal origen %s",
             salida["anyo"], salida["extranjeros"], salida["poblacion"],
             salida["porcentaje"], salida["principal_procedencia"])
    return salida
