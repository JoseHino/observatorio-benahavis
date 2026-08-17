# -*- coding: utf-8 -*-
"""Extracción del IECA mediante la API REST de BADEA.

BADEA es el banco de datos estadísticos de Andalucía. Se accede por
``consulta/{id}`` filtrando con el alias de la dimensión territorial. El nodo de
Benahavís en la jerarquía territorial es el **2934** (padre 3023, Málaga).

Consultas utilizadas, verificadas contra el endpoint real:

* **37016** — Paro registrado por edad y sexo (SIMA, media anual municipal).
* **876** — Afiliaciones a la Seguridad Social por municipio de residencia y
  régimen (mensual desde julio de 2021).
"""
from __future__ import annotations

from typing import Any

from ..contexto import BADEA_NODO, DATA_RAW
from ..utils.http import descargar_json
from ..utils.log import get_logger

log = get_logger("extract.badea")

BASE = ("https://www.juntadeandalucia.es/institutodeestadisticaycartografia"
        "/intranet/admin/rest/v1.0")

CONSULTA_PARO = "37016"


def _celdas(fila: list[dict[str, Any]]) -> tuple[list[str], float | None]:
    """Separa las etiquetas descriptivas del valor numérico de una fila de BADEA."""
    etiquetas, valor = [], None
    for celda in fila:
        if not isinstance(celda, dict):
            continue
        if celda.get("val") is not None:
            valor = celda["val"]
        elif celda.get("des") is not None:
            etiquetas.append(str(celda["des"]))
    return etiquetas, valor


def paro_anual() -> dict[str, Any]:
    """Media anual del paro registrado en Benahavís, por sexo y grupo de edad.

    Returns:
        ``{"anyo": "2025", "total": …, "hombres": …, "mujeres": …, "por_edad": {...}}``
    """
    log.info("IECA/BADEA · paro registrado medio anual (consulta %s, nodo %s)",
             CONSULTA_PARO, BADEA_NODO)
    resp = descargar_json(f"{BASE}/consulta/{CONSULTA_PARO}?D_TERRITORIO_0={BADEA_NODO}",
                          dir_raw=DATA_RAW, timeout=180)

    salida: dict[str, Any] = {"por_edad": {}, "por_sexo": {}}
    anyo = None
    for fila in resp.get("data", []):
        etiquetas, valor = _celdas(fila)
        if valor is None:
            continue
        sexo = next((e for e in etiquetas if e in ("Ambos sexos", "Hombres", "Mujeres")), None)
        edad = next((e for e in etiquetas if e.startswith("De ") or e == "TOTAL"), None)
        anyo = next((e for e in etiquetas if e.isdigit() and len(e) == 4), anyo)
        if sexo is None or edad is None:
            continue
        redondeado = round(float(valor), 1)
        if edad == "TOTAL":
            salida["por_sexo"][sexo] = redondeado
        elif sexo == "Ambos sexos":
            salida["por_edad"][edad] = redondeado

    salida["anyo"] = anyo
    salida["total"] = salida["por_sexo"].get("Ambos sexos")
    log.info("   %s: %s parados de media (H %s / M %s)", anyo, salida["total"],
             salida["por_sexo"].get("Hombres"), salida["por_sexo"].get("Mujeres"))
    return salida
