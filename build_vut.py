# -*- coding: utf-8 -*-
"""Construye ``docs/data/vut.json``: la pestaña de viviendas de uso turístico.

Cruza las dos únicas fuentes que bajan a la vivienda concreta:

* **RTA (OpenRTA)** — registro administrativo nominal. Da la ficha oficial de
  cada inscripción con su fecha de alta, que es lo que permite la línea del
  tiempo, y las que no se pueden situar en el mapa.
* **Big Data de Turismo Costa del Sol** — panel mensual de viviendas anunciadas
  en plataformas, con precio, ocupación y valoración por alojamiento.

Las dos miden cosas distintas y **no se fusionan en una sola capa**: una vivienda
inscrita puede no estar anunciada y al revés. Se cruzan por número de inscripción
sólo para enriquecer la ficha, dejando constancia de si el cruce existe.

    python build_vut.py
"""
from __future__ import annotations

import datetime as dt
import sys

from src.extract import costadelsol, openrta
from src.load import escribir
from src.utils.log import get_logger

log = get_logger("build_vut")


def _normalizar_ref(ref: str | None) -> str | None:
    """``VFT/MA/20614``, ``VFT/MA20614`` y ``vft-ma-20614`` son la misma.

    El RTA y el rastreo del Big Data escriben el número de inscripción con
    separadores distintos; sin normalizar, el cruce no encuentra casi nada.
    """
    if not ref:
        return None
    return "".join(c for c in str(ref).upper() if c.isalnum()) or None


def construir() -> dict:
    """Devuelve el bloque de VUT. Lo usan tanto este script como run_pipeline."""
    censo = openrta.censo(openrta.registros())

    try:
        mercado = costadelsol.mapa_viviendas()
    except Exception as exc:  # noqa: BLE001 — el registro solo ya sostiene la pestaña
        log.warning("Big Data no disponible: %s", exc)
        mercado = {}

    # Cruce por número de inscripción: enriquece la ficha del RTA con lo que el
    # mercado sabe de ella (precio, ocupación, valoración).
    por_ref = {}
    for v in mercado.get("ultimo", []):
        r = _normalizar_ref(v.get("ref"))
        if r:
            por_ref[r] = v

    cruzadas = 0
    for ficha in censo["fichas"]:
        m = por_ref.get(_normalizar_ref(ficha.get("ref")))
        if not m:
            continue
        cruzadas += 1
        ficha["mercado"] = {
            "precio_plaza": m.get("precio_plaza"),
            "ocupacion": m.get("ocupacion"),
            "rating": m.get("rating"),
            "habitaciones": m.get("habitaciones"),
        }

    anunciadas_sin_registro = [
        v for v in mercado.get("ultimo", [])
        if not _normalizar_ref(v.get("ref"))
        or _normalizar_ref(v.get("ref")) not in {
            _normalizar_ref(f.get("ref")) for f in censo["fichas"]}
    ]

    log.info("   %d fichas del RTA cruzadas con el mercado; "
             "%d anunciadas sin inscripción localizada en el censo",
             cruzadas, len(anunciadas_sin_registro))

    datos = {
        "registro": censo,
        "mercado": mercado,
        "cruce": {
            "fichas_con_mercado": cruzadas,
            "anunciadas_sin_registro": len(anunciadas_sin_registro),
            "nota": ("El cruce se hace por número de inscripción normalizado. "
                     "Una vivienda anunciada sin inscripción localizada puede estar "
                     "inscrita con el número mal transcrito en el portal, inscrita en "
                     "otro municipio, o no estar inscrita."),
        },
        "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuentes": [
            "Junta de Andalucía · Registro de Turismo de Andalucía (OpenRTA)",
            "Turismo Costa del Sol · Big Data, informe de viviendas turísticas",
        ],
    }
    log.info("Censo: %d fichas ubicadas, %d sin ubicar, %d viviendas anunciadas",
             censo["ubicadas"], len(censo["sin_ubicar"]),
             len(mercado.get("ultimo", [])))
    return datos


def main() -> int:
    log.info("== Pestaña de viviendas de uso turístico ==")
    escribir("vut", construir())
    return 0


if __name__ == "__main__":
    sys.exit(main())
