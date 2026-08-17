# -*- coding: utf-8 -*-
"""Ingesta del conteo municipal de visitantes (Decreto 72/2017).

La Ley 13/2011 del Turismo de Andalucía define la **población turística asistida**
como quienes, sin ser vecinos, permanecen temporalmente en el municipio por visita
turística o pernoctación en alojamiento turístico. El Decreto 72/2017 admite
acreditarla por la vía de **pernoctaciones** o por la vía de **visitas**.

Dado que Benahavís queda bajo el umbral de 5 establecimientos y no dispone de
serie de pernoctaciones, **la vía de visitas es la operativamente viable**: se
acredita mediante certificado del titular o gestor del recurso turístico más
visitado, con un sistema de conteo que deje constancia fehaciente.

Este módulo deja preparada la ingesta aunque todavía no haya datos. El
Ayuntamiento deposita un CSV en ``data/visitantes/`` con el esquema descrito en
``docs/plantilla-conteo-visitantes.csv`` y el pipeline lo incorpora sin más
intervención.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from ..contexto import RAIZ
from ..utils.log import get_logger

log = get_logger("extract.visitantes")

DIRECTORIO = RAIZ / "data" / "visitantes"

CAMPOS = ("fecha", "recurso", "metodo_conteo", "visitantes", "responsable", "observaciones")
"""Esquema obligatorio del CSV de conteo. Orden indiferente; nombres exactos."""

METODOS_VALIDOS = {
    "torno", "contador_automatico", "registro_manual", "venta_entradas",
    "reserva_previa", "aforo_estimado",
}


def _valida(fila: dict[str, str], num: int, fichero: str) -> dict[str, Any] | None:
    """Valida una fila del CSV; devuelve ``None`` y registra el motivo si no es válida."""
    fecha = (fila.get("fecha") or "").strip()
    if len(fecha) != 10 or fecha[4] != "-" or fecha[7] != "-":
        log.warning("   %s:%d fecha no válida (%r); se espera AAAA-MM-DD", fichero, num, fecha)
        return None
    try:
        visitantes = int(float((fila.get("visitantes") or "").strip()))
    except ValueError:
        log.warning("   %s:%d visitantes no numérico (%r)", fichero, num, fila.get("visitantes"))
        return None
    if visitantes < 0:
        log.warning("   %s:%d visitantes negativo", fichero, num)
        return None
    metodo = (fila.get("metodo_conteo") or "").strip()
    if metodo and metodo not in METODOS_VALIDOS:
        log.warning("   %s:%d método de conteo desconocido (%r)", fichero, num, metodo)
    return {
        "fecha": fecha,
        "recurso": (fila.get("recurso") or "").strip(),
        "metodo_conteo": metodo,
        "visitantes": visitantes,
        "responsable": (fila.get("responsable") or "").strip(),
        "observaciones": (fila.get("observaciones") or "").strip(),
    }


def cargar(directorio: Path | None = None) -> dict[str, Any]:
    """Lee todos los CSV de conteo depositados por el Ayuntamiento.

    Returns:
        Estructura con la serie mensual agregada, el desglose por recurso y el
        estado del módulo. Si no hay ficheros, devuelve ``estado = "sin_datos"``
        —nunca datos inventados.
    """
    directorio = directorio or DIRECTORIO
    if not directorio.exists():
        log.info("Conteo de visitantes · sin directorio %s (módulo preparado, sin datos)",
                 directorio.name)
        return {"estado": "sin_datos", "serie_mensual": [], "por_recurso": {}, "registros": 0}

    ficheros = sorted(directorio.glob("*.csv"))
    if not ficheros:
        log.info("Conteo de visitantes · sin ficheros en %s (módulo preparado, sin datos)",
                 directorio.name)
        return {"estado": "sin_datos", "serie_mensual": [], "por_recurso": {}, "registros": 0}

    log.info("Conteo de visitantes · %d fichero(s) en %s", len(ficheros), directorio.name)
    mensual: dict[str, int] = {}
    por_recurso: dict[str, dict[str, int]] = {}
    validos = 0

    for f in ficheros:
        with f.open(encoding="utf-8-sig", newline="") as fh:
            for num, cruda in enumerate(csv.DictReader(fh), start=2):
                fila = _valida(cruda, num, f.name)
                if fila is None:
                    continue
                validos += 1
                mes = fila["fecha"][:7]
                mensual[mes] = mensual.get(mes, 0) + fila["visitantes"]
                recurso = fila["recurso"] or "Sin especificar"
                por_recurso.setdefault(recurso, {})
                por_recurso[recurso][mes] = por_recurso[recurso].get(mes, 0) + fila["visitantes"]

    log.info("   %d registros válidos · %d recursos · %d meses", validos, len(por_recurso), len(mensual))
    return {
        "estado": "con_datos" if validos else "sin_datos",
        "registros": validos,
        "serie_mensual": [{"t": m, "v": mensual[m]} for m in sorted(mensual)],
        "por_recurso": {
            r: [{"t": m, "v": s[m]} for m in sorted(s)] for r, s in por_recurso.items()
        },
        "recursos": sorted(por_recurso),
    }
