# -*- coding: utf-8 -*-
"""Extracción de la renta municipal de Datosmacro (Expansión).

Datosmacro republica la **Estadística de los declarantes del IRPF por municipios**
de la Agencia Tributaria en una tabla anual por municipio::

    https://datosmacro.expansion.com/mercado-laboral/renta/espana/municipios/
    {ccaa}/{provincia}/{municipio}

De cada fila salen seis columnas: año, renta bruta media, renta disponible media,
puesto en el ranking nacional, puesto en el ranking de la comunidad y población.
La serie arranca en 2013 y llega al último ejercicio publicado por la AEAT.

.. warning::
   Las cifras **no son las del Atlas de Distribución de Renta del INE** que usaba
   antes el observatorio. Aquí la renta es *media por declarante de IRPF*, no por
   persona ni por hogar, y la bruta es anterior a impuestos y cotizaciones: para
   Benahavís sale más del triple que la renta neta por persona del Atlas. Las dos
   series no son comparables y no deben dibujarse juntas.

.. note::
   Datosmacro **solo publica serie histórica de ámbito municipal**. Sus páginas de
   provincia, comunidad y España contienen rankings de municipios, no una serie
   agregada, y no admiten parámetro de año. Lo único agregado que ofrecen es la
   renta bruta media nacional del último ejercicio, que este módulo extrae aparte
   en :func:`referencia_espana`. Por eso el contexto territorial de la renta se
   arma con **otros municipios**, no con Andalucía ni España.
"""
from __future__ import annotations

import re
from typing import Any

from ..contexto import DATA_RAW, DATOSMACRO_MUNICIPIO, DATOSMACRO_CONTRASTE
from ..utils.http import FuenteNoDisponible, descargar_texto
from ..utils.log import get_logger

log = get_logger("extract.datosmacro")

BASE = "https://datosmacro.expansion.com/mercado-laboral/renta/espana/municipios"

#: Columnas numéricas de la tabla, en el orden en que aparecen las celdas
#: ``td.numero`` de cada fila. La cabecera declara ``colspan=2`` en «Renta Bruta»
#: porque intercala una celda con la barra del gráfico: esa celda no es
#: ``td.numero``, de modo que filtrar por clase ya la descarta.
#:
#: .. warning::
#:    La segunda columna la rotula Datosmacro como «Renta Disponible», pero **no lo
#:    es**: contrastada fila a fila contra la publicación original de la AEAT
#:    —«Posicionamiento de los municipios mayores de 1.000 habitantes por Renta bruta
#:    media», ejercicio 2023— corresponde a la **mediana de la renta bruta**. Para
#:    Benahavís la AEAT publica 43.159 € de renta bruta media, 25.311 € de renta bruta
#:    mediana, 33.539 € de renta disponible media y 21.367 € de renta disponible
#:    mediana; Datosmacro muestra 43.159 y 25.311, es decir media y mediana de la
#:    renta bruta. Lo mismo ocurre en Marbella (32.306 / 22.281 frente a 25.912 de
#:    renta disponible media). Aquí se publica con su nombre correcto.
COLUMNAS = ("renta_bruta_media", "renta_bruta_mediana",
            "puesto_nacional", "puesto_ccaa", "poblacion")

_FILA = re.compile(r"<tr>(.*?)</tr>", re.S)
_ANYO = re.compile(r'<td[^>]*class="fecha"[^>]*data-value="(\d{4})', re.S)
_NUMERO = re.compile(r'<td[^>]*class="numero"[^>]*data-value="(-?[\d.]+)"', re.S)
#: Frase con la única cifra agregada que publica el portal, en la página de rankings.
_REFERENCIA = re.compile(
    r"Renta Bruta Media en España[^.]*?fue de\s*([\d.]+)\s*euros", re.S)
_ANYO_TITULO = re.compile(r"<title>[^<]*?(\d{4})\s*\|", re.S)


def _pagina(ruta: str) -> str:
    """Descarga una página de renta municipal y devuelve su HTML."""
    url = f"{BASE}/{ruta}".rstrip("/")
    return descargar_texto(url, dir_raw=DATA_RAW, sufijo=".html")


def _numero(texto: str) -> float:
    """Convierte el ``data-value`` de una celda a número.

    Datosmacro escribe el separador de miles en el texto visible pero no siempre
    lo quita del atributo, así que se limpia el punto cuando no es decimal.
    """
    limpio = texto.replace(".", "") if texto.count(".") != 1 or len(texto.split(".")[-1]) == 3 else texto
    return float(limpio)


def _tabla(html: str, municipio: str) -> dict[str, list[dict[str, Any]]]:
    """Convierte la tabla «Evolución Renta» en series de puntos ``{t, v}``."""
    salida: dict[str, list[dict[str, Any]]] = {c: [] for c in COLUMNAS}
    for fila in _FILA.findall(html):
        anyo = _ANYO.search(fila)
        if not anyo:
            continue
        valores = _NUMERO.findall(fila)
        if len(valores) < len(COLUMNAS):
            # Las tablas de ranking del pie de página también tienen td.fecha en
            # algunas ediciones; una fila corta no es la serie histórica.
            continue
        for clave, bruto in zip(COLUMNAS, valores):
            salida[clave].append({"t": anyo.group(1), "v": _numero(bruto)})
    if not salida["renta_bruta_media"]:
        raise FuenteNoDisponible(f"{BASE}/…", f"sin tabla de evolución de renta para {municipio}")
    for clave in salida:
        salida[clave].sort(key=lambda p: p["t"])
    return salida


def renta_municipio(ruta: str, *, nombre: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Serie anual de renta declarada de un municipio.

    Args:
        ruta: ruta del municipio dentro de la sección, ``"andalucia/malaga/benahavis"``.
        nombre: nombre legible para el log; por defecto, el último tramo de la ruta.

    Returns:
        ``{"renta_bruta_media": [...], "renta_bruta_mediana": [...],
        "puesto_nacional": [...], "puesto_ccaa": [...], "poblacion": [...]}`` con
        puntos ``{t, v}`` ordenados.
    """
    etiqueta = nombre or ruta.rsplit("/", 1)[-1]
    log.info("Datosmacro · renta declarada de %s", etiqueta)
    serie = _tabla(_pagina(ruta), etiqueta)
    ultimo = serie["renta_bruta_media"][-1]
    log.info("   %d años (último: %s = %s € de renta bruta media)",
             len(serie["renta_bruta_media"]), ultimo["t"], ultimo["v"])
    return serie


def renta() -> dict[str, list[dict[str, Any]]]:
    """Renta declarada de Benahavís."""
    return renta_municipio(DATOSMACRO_MUNICIPIO, nombre="Benahavís")


def renta_contexto() -> dict[str, dict[str, Any]]:
    """Renta declarada de los municipios de contraste.

    Datosmacro no publica serie de provincia, comunidad ni España, así que el
    contexto de la renta de Benahavís son otros municipios de la misma fuente y
    con la misma definición: la capital provincial y sus vecinos de la Costa del
    Sol Occidental.
    """
    salida: dict[str, dict[str, Any]] = {}
    for clave, (ruta, nombre) in DATOSMACRO_CONTRASTE.items():
        try:
            salida[clave] = {"nombre": nombre, **renta_municipio(ruta, nombre=nombre)}
        except Exception as exc:  # noqa: BLE001 — un municipio de contraste no tumba el bloque
            log.warning("   sin renta de %s: %s", nombre, exc)
    if not salida:
        raise FuenteNoDisponible(f"{BASE}/…", "ningún municipio de contraste devolvió serie")
    return salida


def referencia_espana() -> dict[str, Any]:
    """Renta bruta media de España del último ejercicio publicado.

    Es el único agregado nacional del portal y **no es una serie**: aparece como
    una frase en la página de rankings y solo para el año que esa página analiza.
    Excluye País Vasco y Navarra, que tienen haciendas forales y no entran en la
    estadística de la AEAT; la nota debe viajar con el dato allá donde se pinte.
    """
    html = _pagina("")
    valor = _REFERENCIA.search(html)
    anyo = _ANYO_TITULO.search(html)
    if not valor or not anyo:
        raise FuenteNoDisponible(BASE, "no se encontró la renta bruta media nacional")
    dato = {"t": anyo.group(1), "v": _numero(valor.group(1)),
            "nota": "Renta bruta media en España, excepto País Vasco y Navarra"}
    log.info("Datosmacro · referencia España %s = %s €", dato["t"], dato["v"])
    return dato
