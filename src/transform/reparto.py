# -*- coding: utf-8 -*-
"""Reparte las viviendas de una parcela sobre las huellas de sus edificios.

El problema
-----------
El RTA da **una coordenada por parcela**, no por vivienda. Las 131 viviendas
turísticas de El Paraíso comparten un punto porque su parcela mide 4,5 ha y
contiene 29 cuerpos de edificación. Pintadas ahí, el mapa de calor dice que la
densidad está en un pincel de treinta píxeles, cuando lo que hay es una
urbanización entera.

Qué hace este módulo
--------------------
Coloca las N viviendas de una parcela **dentro de los edificios que el Catastro
dibuja en ella**, repartidas en proporción a la superficie de cada cuerpo, y
dentro de cada cuerpo sobre una rejilla regular recortada por su contorno.

Qué NO hace, y conviene tenerlo claro
-------------------------------------
Esto **no averigua en qué piso está cada vivienda**: esa información no la
publica nadie. Lo que afirma es más débil y es cierto: *la vivienda está en
alguno de los edificios de su parcela*. Frente a la alternativa —amontonarlas
todas en el centroide— es una aproximación mucho más fiel, pero sigue siendo una
aproximación y el panel lo dice.

El reparto es **determinista**: la misma parcela con las mismas viviendas da
siempre las mismas posiciones, sin azar de por medio, de modo que dos
ejecuciones del pipeline producen el mismo mapa.
"""
from __future__ import annotations

import math
from typing import Any

#: Tope de puntos de rejilla que se prueban por cuerpo. Con parcelas de 13 ha y
#: cuerpos de cientos de metros, una rejilla sin tope puede irse a millones de
#: candidatos y no aporta nada: pasado cierto punto la rejilla ya es más fina
#: que la precisión de la propia hipótesis.
MAX_CANDIDATOS = 20000


def _dentro(lat: float, lon: float, anillo: list[tuple[float, float]]) -> bool:
    """Punto en polígono por el algoritmo del rayo."""
    dentro = False
    n = len(anillo)
    j = n - 1
    for i in range(n):
        yi, xi = anillo[i]
        yj, xj = anillo[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


def _rejilla(anillo: list[tuple[float, float]], cuantos: int) -> list[tuple[float, float]]:
    """Devuelve ``cuantos`` posiciones repartidas dentro del anillo.

    Se tiende una rejilla sobre el rectángulo que envuelve al cuerpo y se
    conservan los nudos que caen dentro. Si no salen suficientes —un cuerpo
    estrecho o en forma de L deja fuera media rejilla—, se afina el paso y se
    repite. Si aun así no se llega, se completa con el centroide, que siempre es
    una posición admisible.
    """
    if cuantos <= 0:
        return []
    lats = [p[0] for p in anillo]
    lons = [p[1] for p in anillo]
    centro = (sum(lats) / len(lats), sum(lons) / len(lons))
    if cuantos == 1:
        return [centro] if _dentro(centro[0], centro[1], anillo) else [centro]

    alto, ancho = max(lats) - min(lats), max(lons) - min(lons)
    if alto <= 0 or ancho <= 0:
        return [centro] * cuantos

    # Se empieza por una rejilla que daría justo `cuantos` nudos si el cuerpo
    # llenara su rectángulo, y se va afinando mientras no basten.
    lado = max(2, int(math.ceil(math.sqrt(cuantos))))
    for _ in range(6):
        if lado * lado > MAX_CANDIDATOS:
            break
        puntos = []
        for f in range(lado):
            for c in range(lado):
                la = min(lats) + alto * (f + 0.5) / lado
                lo = min(lons) + ancho * (c + 0.5) / lado
                if _dentro(la, lo, anillo):
                    puntos.append((la, lo))
        if len(puntos) >= cuantos:
            # Se toman repartidos por toda la lista, no los primeros: los
            # primeros serían todos de la banda superior del cuerpo.
            paso = len(puntos) / cuantos
            return [puntos[min(len(puntos) - 1, int(i * paso))] for i in range(cuantos)]
        lado *= 2

    puntos = puntos if puntos else [centro]
    return [puntos[i % len(puntos)] for i in range(cuantos)]


def _cupos(pesos: list[float], total: int) -> list[int]:
    """Reparte ``total`` unidades entre los cuerpos, en proporción a su superficie.

    Por el método del resto mayor, para que la suma de los cupos sea exactamente
    el total y no un redondeo que pierda o invente viviendas.
    """
    suma = sum(pesos)
    if suma <= 0:
        base = [total // len(pesos)] * len(pesos)
        for i in range(total - sum(base)):
            base[i % len(base)] += 1
        return base
    exacto = [p / suma * total for p in pesos]
    cupos = [int(math.floor(v)) for v in exacto]
    resto = total - sum(cupos)
    orden = sorted(range(len(pesos)), key=lambda i: -(exacto[i] - cupos[i]))
    for i in range(resto):
        cupos[orden[i % len(orden)]] += 1
    return cupos


def sobre_edificios(n: int, edificio: dict[str, Any]) -> list[tuple[float, float]]:
    """Posiciones para ``n`` viviendas dentro de los cuerpos de una parcela.

    Args:
        n: viviendas a colocar.
        edificio: entrada de :func:`src.extract.catastro.edificios`.
    """
    cuerpos = edificio.get("cuerpos") or []
    areas = edificio.get("areas") or []
    if not cuerpos:
        return []
    if len(areas) != len(cuerpos):
        areas = [1.0] * len(cuerpos)

    salida: list[tuple[float, float]] = []
    for cuerpo, cupo in zip(cuerpos, _cupos(areas, n)):
        salida.extend(_rejilla(cuerpo, cupo))
    return salida[:n]
