# -*- coding: utf-8 -*-
"""Huellas de edificio del Catastro, vía los servicios INSPIRE de descarga.

Por qué hace falta
------------------
El Registro de Turismo de Andalucía publica **una coordenada por parcela
catastral, no por vivienda**. En Benahavís eso significa que 2.205 viviendas
inscritas comparten solo **604 coordenadas distintas**: el 81 % de ellas está
apilada sobre otra. El caso extremo es la urbanización El Paraíso, donde **131
viviendas** —repartidas de verdad entre bloques, portales y calles distintas—
caen todas en el mismo punto, porque su parcela catastral mide **4,5 hectáreas**
y el registro devuelve un único punto para ella.

Dibujado así, un mapa de calor miente en las dos direcciones: donde hay una
urbanización entera pinta un lunar del tamaño de un pincel, y no puede
distinguir una parcela de 18 viviendas de otra de 131, porque las dos saturan la
escala. La densidad que enseña no es la que hay.

Este módulo trae del Catastro la geometría con la que se arregla:

* **Parcelas** (`CadastralParcels`): superficie de cada parcela, que es lo que
  demuestra el tamaño del problema.
* **Edificios** (`Buildings`): la **huella de cada cuerpo de edificación** y el
  número de viviendas que el Catastro cuenta en él. Con eso, las viviendas de
  una parcela se pueden repartir sobre los edificios que de verdad hay, en vez
  de amontonarlas en el centroide.

Trampas verificadas
-------------------
* Los dos ficheros son **ZIP con GML dentro** y **no comparten codificación**:
  las parcelas vienen en UTF-8 y los edificios en **ISO-8859-1**, declarado en el
  prólogo XML. Leer los edificios como UTF-8 rompe en los topónimos con tilde.
* Las coordenadas van en **EPSG:25830**, igual que las del RTA.
* Un `Building` **no es un cuerpo de edificación**: es la agrupación de todos los
  de una parcela, y trae tantos `posList` como cuerpos tenga. La parcela
  9119104UF1481N de Benahavís tiene **139**.
* `numberOfDwellings` es el recuento del Catastro para la parcela entera, no por
  cuerpo. Sirve para saber qué parte del edificio está inscrita como turística,
  no para repartir.
"""
from __future__ import annotations

import io
import re
import zipfile
from typing import Any

from ..contexto import COD_INE, DATA_RAW
from ..transform.geo import utm30n_a_wgs84
from ..utils.http import descargar
from ..utils.log import get_logger

log = get_logger("extract.catastro")

BASE = "https://www.catastro.hacienda.gob.es/INSPIRE"
#: El nombre del municipio forma parte de la ruta y va en mayúsculas sin tilde.
MUNICIPIO_URL = "29023-BENAHAVIS"
PROVINCIA = "29"

URL_PARCELAS = f"{BASE}/CadastralParcels/{PROVINCIA}/{MUNICIPIO_URL}/A.ES.SDGC.CP.{COD_INE}.zip"
URL_EDIFICIOS = f"{BASE}/buildings/{PROVINCIA}/{MUNICIPIO_URL}/A.ES.SDGC.BU.{COD_INE}.zip"


def _gml(url: str, sufijo: str, codificacion: str) -> str:
    """Descarga el ZIP del servicio INSPIRE y devuelve el GML que lleva dentro."""
    crudo = descargar(url, dir_raw=DATA_RAW, sufijo=".zip", timeout=420, guardar=False)
    with zipfile.ZipFile(io.BytesIO(crudo)) as z:
        nombre = next(n for n in z.namelist() if n.endswith(sufijo))
        return z.read(nombre).decode(codificacion, "replace")


def _anillo(pos_list: str) -> list[tuple[float, float]]:
    """Convierte un ``gml:posList`` de pares X Y en una lista de coordenadas."""
    n = [float(v) for v in pos_list.split()]
    return list(zip(n[0::2], n[1::2]))


def _area(anillo: list[tuple[float, float]]) -> float:
    """Superficie del polígono por la fórmula del área de Gauss, en m²."""
    s = 0.0
    for i in range(len(anillo)):
        x1, y1 = anillo[i]
        x2, y2 = anillo[(i + 1) % len(anillo)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def parcelas() -> dict[str, float]:
    """Superficie en m² de cada parcela catastral, por su referencia de 14."""
    log.info("Catastro · parcelas catastrales de %s", COD_INE)
    texto = _gml(URL_PARCELAS, "cadastralparcel.gml", "utf-8")
    salida: dict[str, float] = {}
    for m in re.finditer(
            r'gml:id="ES\.SDGC\.CP\.([0-9A-Z]+)".*?<cp:areaValue uom="m2">(\d+)</cp:areaValue>',
            texto, re.S):
        salida.setdefault(m.group(1), float(m.group(2)))
    log.info("   %d parcelas", len(salida))
    return salida


def edificios() -> dict[str, dict[str, Any]]:
    """Huellas de edificación por parcela catastral.

    Returns:
        ``{referencia14: {"cuerpos": [[(lat, lon), …], …], "areas": [m², …],
        "viviendas_catastro": n, "uso": "1_residential"}}``. Los cuerpos van ya
        en grados, listos para el mapa; las superficies se calculan **antes** de
        proyectar, sobre las coordenadas métricas, porque en grados el área no es
        una magnitud comparable.
    """
    log.info("Catastro · huellas de edificación de %s", COD_INE)
    # ISO-8859-1: lo declara el prólogo del propio fichero y leerlo como UTF-8
    # rompe en cuanto aparece un topónimo con tilde.
    texto = _gml(URL_EDIFICIOS, "building.gml", "ISO-8859-1")

    salida: dict[str, dict[str, Any]] = {}
    for trozo in texto.split("<bu-ext2d:Building ")[1:]:
        ident = re.search(r'gml:id="ES\.SDGC\.BU\.([0-9A-Z]+)"', trozo)
        if not ident:
            continue
        cuerpos, areas = [], []
        for pos in re.findall(r"<gml:posList[^>]*>([^<]+)</gml:posList>", trozo):
            anillo = _anillo(pos)
            if len(anillo) < 4:
                continue
            areas.append(_area(anillo))
            cuerpos.append([utm30n_a_wgs84(x, y) for x, y in anillo])
        if not cuerpos:
            continue
        viv = re.search(r"numberOfDwellings>(\d+)<", trozo)
        uso = re.search(r"currentUse>([^<]+)<", trozo)
        salida[ident.group(1)] = {
            "cuerpos": cuerpos,
            "areas": areas,
            "viviendas_catastro": int(viv.group(1)) if viv else None,
            "uso": uso.group(1) if uso else None,
        }
    log.info("   %d parcelas con edificación · %d cuerpos en total",
             len(salida), sum(len(e["cuerpos"]) for e in salida.values()))
    return salida
