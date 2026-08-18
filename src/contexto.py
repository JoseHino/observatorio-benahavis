# -*- coding: utf-8 -*-
"""Constantes del municipio y rutas del proyecto.

Punto único donde se declara la identidad territorial de Benahavís en cada
plataforma. Ningún módulo de extracción debe codificar estos valores a mano.
"""
from __future__ import annotations

from pathlib import Path

# --- Rutas -------------------------------------------------------------------
RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / "config"
DATA_RAW = RAIZ / "data" / "raw"
DATA_PROC = RAIZ / "data" / "processed"
DOCS_DATA = RAIZ / "docs" / "data"
LOG = RAIZ / "data" / "pipeline.log"

# --- Identidad territorial ---------------------------------------------------
MUNICIPIO = "Benahavís"
COD_INE = "29023"
"""Código INE del municipio."""

COD_PROVINCIA = "29"
NOMBRE_PROVINCIA = "Málaga"
COD_CCAA = "1"
NOMBRE_CCAA = "Andalucía"
COMARCA = "Costa del Sol Occidental"

INE_TV_MUNICIPIO = "19:2923"
"""Filtro ``tv`` de Tempus3: variable 19 (unidades territoriales), valor 2923 (Benahavís)."""

INE_ID_MUNICIPIO = 2923
INE_SECCIONES = ("2902301001", "2902301002")
"""Secciones censales del municipio (un único distrito, el 01)."""

BADEA_NODO = "2934"
"""Nodo de Benahavís en la jerarquía territorial del IECA/BADEA (padre 3023 = Málaga)."""

BADEA_NODO_PROVINCIA = "3023"
BADEA_NODO_ANDALUCIA = "3143"

RTA_MUNICIPIO = "BENAHAVIS"
"""Valor del enum de municipio en OpenRTA: mayúsculas y SIN tilde."""

RTA_PROVINCIA = "MÁLAGA"
"""Valor del enum de provincia en OpenRTA: mayúsculas y CON tilde."""

AEMET_ESTACION = "6069X"
"""Estación de AEMET situada dentro del término municipal de Benahavís (392 m)."""

AEMET_ESTACIONES_CONTRASTE = {
    "6155A": "Málaga Aeropuerto",
    "6058I": "Estepona",
    "6083X": "Marbella",
}
"""Estaciones de contraste, de ámbito NO municipal. Siempre etiquetadas como tales."""

# --- Ramas de actividad turística (CNAE 2 dígitos) ---------------------------
CNAE_TURISTICOS = {
    "55": "Servicios de alojamiento",
    "56": "Servicios de comidas y bebidas",
    "79": "Agencias de viajes y operadores turísticos",
    "93": "Actividades deportivas, recreativas y de entretenimiento",
}

RUPTURA_CNAE = "2026-01"
"""Mes en el que la Seguridad Social pasa de CNAE-2009 a CNAE-2025. Las series se cortan aquí."""

VERSION = "1.1.0"
"""1.1.0 añade el índice de Gini y P80/P20 (INE 37677) y la ocupación hotelera de la
zona turística Costa del Sol (EOH vía Dataestur), sustituto declarado del hueco de
pernoctaciones."""
