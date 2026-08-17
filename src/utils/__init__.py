# -*- coding: utf-8 -*-
"""Utilidades transversales del pipeline: logging, HTTP con caché y control de censura."""
from .censura import CENSURADO, Agregado, parsear
from .http import FuenteNoDisponible, descargar, descargar_json, descargar_texto
from .log import configurar, get_logger

__all__ = [
    "CENSURADO",
    "Agregado",
    "parsear",
    "FuenteNoDisponible",
    "descargar",
    "descargar_json",
    "descargar_texto",
    "configurar",
    "get_logger",
]
