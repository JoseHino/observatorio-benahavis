# -*- coding: utf-8 -*-
"""Reanálisis climático ERA5 sobre el punto de la estación de Benahavís.

La estación de AEMET dentro del término municipal (``6069X``) arranca en octubre
de 2004: veintidós años, que sirven para describir el clima actual pero **no para
ver una tendencia**. Para eso hace falta medio siglo largo, y ninguna estación del
municipio lo tiene.

La alternativa es el **reanálisis**: un modelo que reconstruye el estado de la
atmósfera hora a hora combinando el modelo de predicción con todas las
observaciones disponibles (estaciones, radiosondeos, satélites, barcos). Aquí se
usa **ERA5** del ECMWF —temperatura de la malla ERA5-Land de 9 km y precipitación
de ERA5— servido por el archivo abierto de Open-Meteo, que no exige clave y
resuelve la serie diaria completa desde 1950 en una sola petición.

.. warning::
   **El reanálisis no es la estación y no la sustituye.** Da el valor medio de una
   celda de malla de 9 km, no el de un punto a 392 m de altitud: en Benahavís sale
   sistemáticamente unos **2 °C por debajo** de lo que mide la estación. Ese sesgo
   es muy estable (la desviación mes a mes es de medio grado), de modo que la
   **forma y la tendencia** de la serie son utilizables y las **cifras absolutas**
   no deben citarse como temperatura observada del municipio. El pipeline mide ese
   desfase contra la estación cada vez que se ejecuta y lo publica junto a la
   serie, para que la advertencia lleve siempre el número actual detrás.

   Por lo mismo, de aquí **no salen recuentos de días de calor ni de noches
   tropicales**. Comprobado: sobre los años que comparten estación y reanálisis, la
   estación registra 60 días al año por encima de 30 °C y el reanálisis 10. Ni
   corrigiendo el sesgo medio mes a mes se arregla —sube a 33, la mitad de lo
   observado—, porque promediar una celda de 9 km no solo baja la media: **recorta
   los extremos diarios**, y son los extremos los que cuentan un día de calor.
   Ajustar eso exigiría un reescalado de cuantiles, que ya sería una serie
   inventada. Los recuentos de días se publican solo desde la estación.
"""
from __future__ import annotations

import datetime as dt
import statistics as est
from typing import Any

from ..contexto import DATA_RAW
from ..utils.http import descargar_json
from ..utils.log import get_logger

log = get_logger("extract.reanalisis")

URL = "https://archive-api.open-meteo.com/v1/archive"

#: Coordenadas de la estación 6069X (36º32'37"N, 5º01'29"W, 392 m). Se pide el
#: reanálisis en el mismo punto que la estación —y no en el centro del término—
#: para que las dos series describan el mismo sitio y el contraste tenga sentido.
LAT, LON = 36.5436, -5.0247

MODELO = "era5_seamless"
"""Temperatura de ERA5-Land (malla de 9 km) y precipitación de ERA5. Pedir
``era5_land`` a secas devuelve la precipitación **entera a nulo**, sin error."""

INICIO = "1950-01-01"

#: Periodo de referencia climática. Se usa 1961–1990 —la referencia clásica de la
#: OMM para medir el cambio— y no la normal vigente 1991–2020, que ya incorpora
#: buena parte del calentamiento y por tanto lo esconde.
REFERENCIA = (1961, 1990)
NORMAL_VIGENTE = (1991, 2020)
ULTIMA_DECADA = 10


def _diario() -> dict[str, list]:
    """Serie diaria completa desde 1950. Una sola petición, sin clave.

    Se piden solo temperatura media y precipitación: el archivo abierto pondera
    el cupo por volumen de datos y no por número de peticiones, de modo que cada
    variable de más sobre setenta y seis años acerca el ``429``.
    """
    hasta = dt.date.today() - dt.timedelta(days=6)   # el archivo va unos días por detrás
    parametros = (
        f"latitude={LAT}&longitude={LON}&start_date={INICIO}&end_date={hasta.isoformat()}"
        f"&daily=temperature_2m_mean,precipitation_sum"
        f"&timezone=Europe%2FMadrid&models={MODELO}"
    )
    respuesta = descargar_json(f"{URL}?{parametros}", dir_raw=DATA_RAW, timeout=300, guardar=False)
    diario = respuesta.get("daily") or {}
    if not diario.get("time"):
        raise ValueError("el archivo de reanálisis no devolvió serie diaria")
    log.info("   %d días, de %s a %s · celda %.2f, %.2f a %s m",
             len(diario["time"]), diario["time"][0], diario["time"][-1],
             respuesta.get("latitude"), respuesta.get("longitude"), respuesta.get("elevation"))
    return {"diario": diario, "punto": {
        "latitud": respuesta.get("latitude"), "longitud": respuesta.get("longitude"),
        "elevacion_m": respuesta.get("elevation"), "modelo": MODELO}}


def _media(xs: list[float]) -> float | None:
    return round(est.mean(xs), 2) if xs else None


def serie() -> dict[str, Any]:
    """Serie larga de temperatura y precipitación, con sus índices anuales.

    Returns:
        Series mensuales y anuales, anomalía respecto a 1961–1990, normales
        mensuales de tres periodos e índices anuales de calor y lluvia.
    """
    log.info("Reanálisis ERA5 · serie larga de Benahavís (%s → hoy)", INICIO)
    crudo = _diario()
    d = crudo["diario"]

    mensual: dict[str, dict[str, Any]] = {}
    anual: dict[str, dict[str, Any]] = {}
    for i, fecha in enumerate(d["time"]):
        tmed, prec = d["temperature_2m_mean"][i], d["precipitation_sum"][i]
        if tmed is None:
            continue
        m = mensual.setdefault(fecha[:7], {"t": [], "p": 0.0, "dias": 0})
        m["t"].append(tmed)
        m["p"] += prec or 0.0
        m["dias"] += 1
        a = anual.setdefault(fecha[:4], {"t": [], "p": 0.0, "dias": 0})
        a["t"].append(tmed)
        a["p"] += prec or 0.0
        a["dias"] += 1

    # Solo se publican años completos: un año a medias hunde la media anual y
    # deja el recuento de días de calor en la mitad sin que se note.
    completos = sorted(k for k, v in anual.items() if v["dias"] >= 360)

    temperatura_anual = [{"t": a, "v": _media(anual[a]["t"])} for a in completos]
    precipitacion_anual = [{"t": a, "v": round(anual[a]["p"], 1)} for a in completos]

    def tramo(desde: int, hasta: int) -> list[str]:
        return [a for a in completos if desde <= int(a) <= hasta]

    ref = tramo(*REFERENCIA)
    base = _media([x for a in ref for x in anual[a]["t"]])
    anomalia = [{"t": a, "v": round(_media(anual[a]["t"]) - base, 2)} for a in completos] if base else []

    def normales(anyos: list[str]) -> list[dict[str, Any]]:
        por_mes: dict[int, dict[str, list]] = {m: {"t": [], "p": []} for m in range(1, 13)}
        for clave, valores in mensual.items():
            if clave[:4] not in anyos or not valores["t"]:
                continue
            mes = int(clave[5:7])
            por_mes[mes]["t"].append(est.mean(valores["t"]))
            por_mes[mes]["p"].append(valores["p"])
        return [{"mes": m,
                 "temperatura_media": _media(por_mes[m]["t"]),
                 "precipitacion_media": round(est.mean(por_mes[m]["p"]), 1) if por_mes[m]["p"] else None}
                for m in range(1, 13)]

    ultimos = completos[-ULTIMA_DECADA:]
    etiqueta_ref = f"{REFERENCIA[0]}–{REFERENCIA[1]}"
    etiqueta_normal = f"{NORMAL_VIGENTE[0]}–{NORMAL_VIGENTE[1]}"
    etiqueta_ultima = f"{ultimos[0]}–{ultimos[-1]}" if ultimos else ""

    resumen = {
        "referencia": etiqueta_ref,
        "temperatura_referencia": base,
        "temperatura_ultima_decada": _media([x for a in ultimos for x in anual[a]["t"]]),
        "precipitacion_referencia": round(est.mean([anual[a]["p"] for a in ref]), 0) if ref else None,
        "precipitacion_ultima_decada": round(est.mean([anual[a]["p"] for a in ultimos]), 0) if ultimos else None,
        "anyos": len(completos),
    }
    if resumen["temperatura_referencia"] and resumen["temperatura_ultima_decada"]:
        resumen["calentamiento"] = round(
            resumen["temperatura_ultima_decada"] - resumen["temperatura_referencia"], 2)

    log.info("   %s-%s · %s años completos · calentamiento %s °C sobre %s",
             completos[0], completos[-1], len(completos),
             resumen.get("calentamiento"), etiqueta_ref)

    return {
        "punto": crudo["punto"],
        "desde": completos[0] if completos else None,
        "hasta": completos[-1] if completos else None,
        "temperatura_mensual": [{"t": k, "v": _media(v["t"])} for k, v in sorted(mensual.items()) if v["t"]],
        "precipitacion_mensual": [{"t": k, "v": round(v["p"], 1)} for k, v in sorted(mensual.items())],
        "temperatura_anual": temperatura_anual,
        "precipitacion_anual": precipitacion_anual,
        "anomalia_anual": anomalia,
        "normales_por_periodo": [
            {"etiqueta": etiqueta_ref, "valores": normales(ref)},
            {"etiqueta": etiqueta_normal, "valores": normales(tramo(*NORMAL_VIGENTE))},
            {"etiqueta": etiqueta_ultima, "valores": normales(ultimos)},
        ],
        "resumen": resumen,
        "advertencia": ("Reanálisis: describe una celda de malla de 9 km, no el punto de la "
                        "estación. Sirve para la tendencia y la forma de la serie, no como "
                        "temperatura observada del municipio ni para contar días de calor."),
        "fuente": "ECMWF · reanálisis ERA5 (ERA5-Land para temperatura), vía el archivo abierto de Open-Meteo",
    }


def contraste(reanalisis: dict[str, Any], estacion: dict[str, Any]) -> dict[str, Any]:
    """Mide el desfase entre el reanálisis y la estación en los meses que comparten.

    Publicar la serie larga sin esta cifra sería dar por buena una temperatura que
    no es la que mide la estación del municipio. Se calcula en cada ejecución para
    que la advertencia del panel lleve siempre el número vigente.
    """
    def indexar(puntos: list[dict[str, Any]]) -> dict[str, float]:
        salida = {}
        for p in puntos or []:
            partes = str(p["t"]).split("-")
            if len(partes) == 2 and p["v"] is not None:
                salida[f"{partes[0]}-{int(partes[1]):02d}"] = p["v"]
        return salida

    rt, ot = indexar(reanalisis.get("temperatura_mensual")), indexar(estacion.get("temperatura_mensual"))
    rp, op = indexar(reanalisis.get("precipitacion_mensual")), indexar(estacion.get("precipitacion_mensual"))
    comunes_t = sorted(set(rt) & set(ot))
    comunes_p = sorted(set(rp) & set(op))
    if not comunes_t:
        return {}

    difs = [rt[k] - ot[k] for k in comunes_t]
    salida = {
        "meses_comparados": len(comunes_t),
        "desde": comunes_t[0], "hasta": comunes_t[-1],
        "sesgo_temperatura": round(est.mean(difs), 2),
        "desviacion_temperatura": round(est.pstdev(difs), 2) if len(difs) > 1 else None,
    }
    if comunes_p:
        salida["sesgo_precipitacion_mm_mes"] = round(
            est.mean([rp[k] - op[k] for k in comunes_p]), 1)
    log.info("   contraste con la estación: %s meses, sesgo %s °C (desv. %s)",
             salida["meses_comparados"], salida["sesgo_temperatura"], salida["desviacion_temperatura"])
    return salida
