# -*- coding: utf-8 -*-
"""Logging estructurado del pipeline.

Un único logger raíz (``observatorio``) con salida a consola y a
``data/pipeline.log``. Los módulos de extracción obtienen su logger hijo con
:func:`get_logger`, de modo que cada línea identifica la fuente que la emite.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

_RAIZ = "observatorio"
_FORMATO = "%(asctime)s  %(levelname)-8s  %(name)-28s  %(message)s"
_FECHA = "%Y-%m-%d %H:%M:%S"
_configurado = False


def configurar(fichero_log: Path | None = None, nivel: int = logging.INFO) -> logging.Logger:
    """Configura el logger raíz del pipeline. Idempotente.

    Args:
        fichero_log: ruta del fichero de log. Si es ``None`` solo se escribe en consola.
        nivel: nivel mínimo de registro.

    Returns:
        El logger raíz ya configurado.
    """
    global _configurado
    logger = logging.getLogger(_RAIZ)
    if _configurado:
        return logger

    logger.setLevel(nivel)
    logger.propagate = False
    formato = logging.Formatter(_FORMATO, datefmt=_FECHA)

    consola = logging.StreamHandler(sys.stdout)
    consola.setFormatter(formato)
    logger.addHandler(consola)

    if fichero_log is not None:
        fichero_log.parent.mkdir(parents=True, exist_ok=True)
        disco = logging.FileHandler(fichero_log, encoding="utf-8")
        disco.setFormatter(formato)
        logger.addHandler(disco)

    _configurado = True
    return logger


def get_logger(nombre: str) -> logging.Logger:
    """Devuelve el logger hijo correspondiente a un módulo de la aplicación."""
    return logging.getLogger(f"{_RAIZ}.{nombre}")
