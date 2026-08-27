# -*- coding: utf-8 -*-
"""Extracción de AEMET OpenData: serie climática de la estación de Benahavís.

Existe estación meteorológica **dentro del término municipal**: la ``6069X
BENAHAVÍS``, a 392 m de altitud. El bloque de clima es, por tanto, dato municipal
observado y no un indicador sustitutivo de ámbito comarcal.

Se emplea el endpoint de **valores climatológicos mensuales y anuales**, que
devuelve los agregados calculados por la propia AEMET —preferibles a recalcularlos
a partir del dato diario— y admite rangos de tres años por petición, frente al
máximo de seis meses del endpoint diario.

.. warning::
   Particularidades verificadas de esta API:

   1. Sin ``api_key`` responde ``HTTP 200`` con **cuerpo vacío**, no un error.
   2. Patrón de **doble llamada**: la primera respuesta es un sobre
      ``{estado, descripcion, datos}`` y el dato real está en la URL de ``datos``.
   3. El fichero de datos viene en **latin-1** sin declararlo.
   4. Rango máximo de **36 meses** por petición en el endpoint mensual
      (6 meses en el diario).
   5. Los valores llegan como **texto con coma decimal**, y a veces con sufijos
      como ``(12)`` que indican el día en que se registró el extremo.
   6. El mes ``13`` de cada año no es un mes: es el **resumen anual**.
"""
from __future__ import annotations

import datetime as dt
import os
import re
import time
from typing import Any

from ..contexto import AEMET_ESTACION, DATA_RAW
from ..utils.http import FuenteNoDisponible, descargar_json
from ..utils.log import get_logger

log = get_logger("extract.aemet")

BASE = "https://opendata.aemet.es/opendata/api"
PAUSA = 3.0
"""Segundos entre peticiones. AEMET limita la cadencia por clave y responde 429."""

TRAMO_ANYOS = 3
"""Años por petición: el endpoint mensual admite un máximo de 36 meses."""

RESUMEN_ANUAL = "13"
"""El «mes» 13 de cada año contiene el resumen anual, no un mes natural."""

_SUFIJO = re.compile(r"\(.*?\)")


class SinClaveAemet(RuntimeError):
    """No hay ``AEMET_API_KEY`` en el entorno."""


def _clave() -> str:
    clave = os.environ.get("AEMET_API_KEY", "").strip()
    if not clave:
        raise SinClaveAemet("falta AEMET_API_KEY en el entorno o en .env")
    return clave


def numero(texto: Any) -> float | None:
    """Convierte el texto de AEMET a float: coma decimal y sufijos entre paréntesis."""
    if texto is None:
        return None
    limpio = _SUFIJO.sub("", str(texto)).strip().replace(",", ".")
    if limpio in ("", "Ip"):
        return 0.0 if limpio == "Ip" else None
    try:
        return float(limpio)
    except ValueError:
        return None


def _peticion(ruta: str) -> Any:
    """Resuelve el patrón de doble llamada de AEMET."""
    sobre = descargar_json(f"{BASE}/{ruta}?api_key={_clave()}", dir_raw=DATA_RAW, timeout=120)
    if not isinstance(sobre, dict) or sobre.get("estado") != 200:
        estado = sobre.get("estado") if isinstance(sobre, dict) else "?"
        desc = sobre.get("descripcion") if isinstance(sobre, dict) else "respuesta inesperada"
        raise FuenteNoDisponible(ruta, f"estado {estado}: {desc}")
    return descargar_json(sobre["datos"], dir_raw=DATA_RAW, timeout=180)


def serie_mensual(estacion: str = AEMET_ESTACION, *, desde: int = 1998,
                  hasta: int | None = None) -> list[dict[str, Any]]:
    """Descarga los valores climatológicos mensuales y anuales de una estación.

    Los tramos sin dato (``404 · No hay datos que satisfagan esos criterios``)
    se omiten: marcan el arranque real de la serie de la estación.

    Returns:
        Lista de registros tal como los publica AEMET, con ``fecha`` en formato
        ``AAAA-MM`` y el mes ``13`` como resumen anual.
    """
    hasta = hasta or dt.date.today().year
    log.info("AEMET · valores mensuales de la estación %s (%d–%d)", estacion, desde, hasta)

    registros: list[dict[str, Any]] = []
    for ini in range(desde, hasta + 1, TRAMO_ANYOS):
        fin = min(ini + TRAMO_ANYOS - 1, hasta)
        ruta = (f"valores/climatologicos/mensualesanuales/datos/"
                f"anioini/{ini}/aniofin/{fin}/estacion/{estacion}")
        try:
            bloque = _peticion(ruta)
        except FuenteNoDisponible as exc:
            log.info("   %d–%d sin datos (%s)", ini, fin, exc.causa)
            time.sleep(PAUSA)
            continue
        registros.extend(bloque)
        log.info("   %d–%d: %d registros", ini, fin, len(bloque))
        time.sleep(PAUSA)

    registros.sort(key=lambda r: str(r.get("fecha") or ""))
    log.info("   total: %d registros", len(registros))
    return registros


#: Recuentos de días que la propia AEMET publica en el resumen mensual. Son
#: observación, no un umbral aplicado por este pipeline sobre una media.
DIAS = {
    "nt_30": "dias_calor",        # días con temperatura máxima >= 30 °C
    "nt_00": "dias_helada",       # días con temperatura mínima <= 0 °C
    "np_010": "dias_lluvia",      # días con precipitación >= 1 mm
    "np_100": "dias_lluvia_fuerte",   # días con precipitación >= 10 mm
    "np_300": "dias_lluvia_torrencial",   # días con precipitación >= 30 mm
    "nw_55": "dias_viento_fuerte",    # días con racha >= 55 km/h
}

#: Series mensuales que la estación publica además de temperatura y lluvia. Son
#: medida directa igual que las otras y estaban sin explotar.
MENSUALES = {
    "hr": "humedad_mensual",          # humedad relativa media del mes, %
    "w_med": "viento_medio_mensual",  # velocidad media del viento, km/h
}

MS_A_KMH = 3.6


def racha(texto: Any) -> float | None:
    """Velocidad de la racha máxima del mes, en km/h.

    El campo ``w_racha`` no es un número: viene como ``08/24.2(11)``, es decir
    **dirección / velocidad (día)**, y además la velocidad va en **m/s** mientras
    que la velocidad media del mes (``w_med``) va en km/h. Pasarlo por el
    conversor normal devuelve ``None`` —el texto no es un float— y mezclarlo con
    ``w_med`` sin convertir daría una racha más lenta que el viento medio.
    """
    if texto is None:
        return None
    partes = str(texto).split("/")
    v = numero(partes[-1])
    return None if v is None else round(v * MS_A_KMH, 1)

MESES_ANYO_COMPLETO = 12


def _periodo(fecha: str) -> str:
    """Normaliza ``2004-2`` a ``2004-02``.

    AEMET publica el mes **sin cero a la izquierda**. Sin normalizarlo, la serie
    se ordena alfabéticamente —octubre antes que febrero— y las etiquetas de
    periodo del panel, que esperan dos cifras, se quedan sin traducir.
    """
    anyo, mes = fecha.split("-", 1)
    return f"{anyo}-{int(mes):02d}"


def resumir(registros: list[dict[str, Any]]) -> dict[str, Any]:
    """Organiza los registros de AEMET en las series publicables del observatorio.

    Returns:
        Series mensuales de temperatura y precipitación, series anuales tomadas
        del resumen que la propia AEMET calcula (mes 13), valores medios por mes
        calendario sobre todo el periodo disponible e índices anuales de días de
        calor, lluvia y helada.
    """
    mensual_t: list[dict[str, Any]] = []
    mensual_p: list[dict[str, Any]] = []
    anual_t: list[dict[str, Any]] = []
    anual_p: list[dict[str, Any]] = []
    acum_t: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    acum_p: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    acum_tmax: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    acum_tmin: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    acum_hr: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    otras: dict[str, list[dict[str, Any]]] = {n: [] for n in MENSUALES.values()}
    dias_anyo: dict[str, dict[str, Any]] = {}
    extremos = {"ta_max": None, "ta_min": None, "p_max": None, "w_racha": None}

    for r in registros:
        fecha = str(r.get("fecha") or "")
        if "-" not in fecha:
            continue
        anyo, periodo = fecha.split("-", 1)
        tm = numero(r.get("tm_mes"))
        pm = numero(r.get("p_mes"))

        if periodo == RESUMEN_ANUAL:
            if tm is not None:
                anual_t.append({"t": anyo, "v": round(tm, 1)})
            if pm is not None:
                anual_p.append({"t": anyo, "v": round(pm, 1)})
            continue

        mes = int(periodo)
        clave_mes = _periodo(fecha)
        if tm is not None:
            mensual_t.append({"t": clave_mes, "v": round(tm, 1)})
            acum_t[mes].append(tm)
        if pm is not None:
            mensual_p.append({"t": clave_mes, "v": round(pm, 1)})
            acum_p[mes].append(pm)
        for campo, acumulador in (("tm_max", acum_tmax), ("tm_min", acum_tmin), ("hr", acum_hr)):
            v = numero(r.get(campo))
            if v is not None:
                acumulador[mes].append(v)
        for campo, nombre in MENSUALES.items():
            v = numero(r.get(campo))
            if v is not None:
                otras[nombre].append({"t": clave_mes, "v": round(v, 1)})

        # Recuentos de días: se suman por año y se publica cada índice solo si
        # tiene los doce meses. La comprobación va campo a campo porque AEMET
        # devuelve el registro del mes aunque falte un contador —y los meses
        # futuros del año en curso vienen ya creados y vacíos—, de modo que
        # contar registros daría por completo un año que no lo está.
        cuenta = dias_anyo.setdefault(anyo, {n: {"suma": 0, "meses": 0} for n in DIAS.values()})
        for campo, nombre in DIAS.items():
            v = numero(r.get(campo))
            if v is not None:
                cuenta[nombre]["suma"] += int(v)
                cuenta[nombre]["meses"] += 1

        for clave, comparar in (("ta_max", max), ("ta_min", min), ("p_max", max), ("w_racha", max)):
            v = racha(r.get(clave)) if clave == "w_racha" else numero(r.get(clave))
            if v is None:
                continue
            actual = extremos[clave]
            if actual is None or comparar(v, actual["valor"]) == v:
                extremos[clave] = {"valor": round(v, 1), "fecha": clave_mes}

    mensual_t.sort(key=lambda p: p["t"])
    mensual_p.sort(key=lambda p: p["t"])
    for puntos in otras.values():
        puntos.sort(key=lambda p: p["t"])

    def media(xs: list[float]) -> float | None:
        return round(sum(xs) / len(xs), 1) if xs else None

    normales = [
        {"mes": m,
         "temperatura_media": media(acum_t[m]),
         "temperatura_maxima_media": media(acum_tmax[m]),
         "temperatura_minima_media": media(acum_tmin[m]),
         "precipitacion_media": media(acum_p[m]),
         "humedad_media": media(acum_hr[m]),
         "anyos_promediados": len(acum_t[m])}
        for m in range(1, 13) if acum_t[m] or acum_p[m]
    ]

    indices = []
    for anyo, cuenta in sorted(dias_anyo.items()):
        fila = {nombre: datos["suma"] for nombre, datos in cuenta.items()
                if datos["meses"] >= MESES_ANYO_COMPLETO}
        if fila:
            indices.append({"t": anyo, **fila})

    return {
        "temperatura_mensual": mensual_t,
        "precipitacion_mensual": mensual_p,
        **otras,
        "temperatura_anual": anual_t,
        "precipitacion_anual": anual_p,
        "normales": normales,
        "indices_anuales": indices,
        "extremos": extremos,
        "meses_observados": len(mensual_t),
        "primer_mes": mensual_t[0]["t"] if mensual_t else None,
        "ultimo_mes": mensual_t[-1]["t"] if mensual_t else None,
        "anyos_con_resumen": [p["t"] for p in anual_t],
    }
