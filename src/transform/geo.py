# -*- coding: utf-8 -*-
"""Conversión de coordenadas UTM (ETRS89 / EPSG:25830) a geográficas WGS84.

El Registro de Turismo de Andalucía publica las coordenadas en EPSG:25830. El
mapa del observatorio se dibuja sobre teselas web, que necesitan latitud y
longitud. Se implementa la inversa de la proyección transversa de Mercator con
las fórmulas de Krüger, suficiente para uso cartográfico a escala municipal y sin
introducir dependencias pesadas: la diferencia entre ETRS89 y WGS84 en la
península es del orden de centímetros, irrelevante a esta escala.
"""
from __future__ import annotations

import math

# Elipsoide GRS80 (ETRS89).
_A = 6378137.0
_F = 1 / 298.257222101
_E2 = _F * (2 - _F)
_E1 = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))
_K0 = 0.9996
_FALSO_ESTE = 500000.0
_HUSO = 30
_MERIDIANO_CENTRAL = math.radians(6 * _HUSO - 183)  # −3° para el huso 30


def numero_es(texto: object) -> float | None:
    """Convierte a float un número que puede venir con coma o con punto decimal.

    El RTA mezcla ambos formatos en el mismo campo: los establecimientos
    hoteleros traen ``'316781.406'`` y las viviendas de uso turístico
    ``'321448,42'``. Interpretar solo uno de los dos descarta silenciosamente
    miles de registros.
    """
    if texto is None:
        return None
    limpio = str(texto).strip()
    if not limpio:
        return None
    if "," in limpio and "." in limpio:
        # Formato con separador de millar: el último símbolo es el decimal.
        if limpio.rfind(",") > limpio.rfind("."):
            limpio = limpio.replace(".", "").replace(",", ".")
        else:
            limpio = limpio.replace(",", "")
    else:
        limpio = limpio.replace(",", ".")
    try:
        return float(limpio)
    except ValueError:
        return None


def utm30n_a_wgs84(este: float, norte: float) -> tuple[float, float]:
    """Convierte coordenadas UTM del huso 30 norte a ``(latitud, longitud)`` en grados."""
    x = este - _FALSO_ESTE
    m = norte / _K0

    mu = m / (_A * (1 - _E2 / 4 - 3 * _E2**2 / 64 - 5 * _E2**3 / 256))
    phi1 = (mu
            + (3 * _E1 / 2 - 27 * _E1**3 / 32) * math.sin(2 * mu)
            + (21 * _E1**2 / 16 - 55 * _E1**4 / 32) * math.sin(4 * mu)
            + (151 * _E1**3 / 96) * math.sin(6 * mu)
            + (1097 * _E1**4 / 512) * math.sin(8 * mu))

    sin_phi1, cos_phi1, tan_phi1 = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    e2_prima = _E2 / (1 - _E2)
    c1 = e2_prima * cos_phi1**2
    t1 = tan_phi1**2
    n1 = _A / math.sqrt(1 - _E2 * sin_phi1**2)
    r1 = _A * (1 - _E2) / (1 - _E2 * sin_phi1**2) ** 1.5
    d = x / (n1 * _K0)

    lat = phi1 - (n1 * tan_phi1 / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * e2_prima) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * e2_prima - 3 * c1**2) * d**6 / 720
    )
    lon = _MERIDIANO_CENTRAL + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * e2_prima + 24 * t1**2) * d**5 / 120
    ) / cos_phi1

    return round(math.degrees(lat), 6), round(math.degrees(lon), 6)
