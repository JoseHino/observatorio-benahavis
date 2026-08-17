# -*- coding: utf-8 -*-
"""Validación automática de las series antes de publicarlas.

Comprueba rangos plausibles, continuidad temporal y saltos anómalos. Las
incidencias **no detienen el pipeline**: se registran, se acumulan en un informe
y se publican en ``docs/data/validacion.json``, de modo que la página de
metodología pueda mostrar el estado real de cada serie en lugar de ocultarlo.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..utils.log import get_logger

log = get_logger("transform.validar")


@dataclass
class Incidencia:
    """Anomalía detectada en una serie."""

    serie: str
    tipo: str
    detalle: str
    gravedad: str = "aviso"  # aviso | error

    def a_dict(self) -> dict[str, str]:
        return {"serie": self.serie, "tipo": self.tipo,
                "detalle": self.detalle, "gravedad": self.gravedad}


@dataclass
class Informe:
    """Resultado acumulado de la validación."""

    incidencias: list[Incidencia] = field(default_factory=list)
    series: set[str] = field(default_factory=set)

    @property
    def series_revisadas(self) -> int:
        return len(self.series)

    def añadir(self, inc: Incidencia) -> None:
        self.incidencias.append(inc)
        registrar = log.error if inc.gravedad == "error" else log.warning
        registrar("validación · %s · %s: %s", inc.serie, inc.tipo, inc.detalle)

    def heredar(self, anterior: dict[str, Any]) -> None:
        """Incorpora el resultado de una ejecución previa para las series no revisadas ahora.

        Permite que una ejecución parcial (``--bloques``) publique el estado completo del
        observatorio, en lugar de dejar como no validadas las series que no ha tocado. Las
        series revisadas en esta ejecución mandan siempre: su resultado anterior se descarta.
        """
        revisadas_ahora = set(self.series)
        for nombre in anterior.get("series", []):
            self.series.add(nombre)
        for i in anterior.get("incidencias", []):
            if i.get("serie") in revisadas_ahora:
                continue
            self.incidencias.append(Incidencia(
                serie=i.get("serie", ""), tipo=i.get("tipo", ""),
                detalle=i.get("detalle", ""), gravedad=i.get("gravedad", "aviso")))

    def a_dict(self) -> dict[str, Any]:
        return {
            "series_revisadas": self.series_revisadas,
            "series": sorted(self.series),
            "incidencias": [i.a_dict() for i in self.incidencias],
            "errores": sum(1 for i in self.incidencias if i.gravedad == "error"),
            "avisos": sum(1 for i in self.incidencias if i.gravedad == "aviso"),
        }


def _siguiente_mes(t: str) -> str:
    anyo, mes = int(t[:4]), int(t[5:7])
    mes += 1
    if mes > 12:
        mes, anyo = 1, anyo + 1
    return f"{anyo}-{mes:02d}"


def serie_temporal(
    informe: Informe,
    nombre: str,
    puntos: list[dict[str, Any]],
    *,
    minimo: float | None = None,
    maximo: float | None = None,
    salto_relativo: float = 3.0,
    mensual: bool = False,
) -> None:
    """Valida una serie de puntos ``{t, v}``.

    Args:
        informe: acumulador de incidencias.
        nombre: identificador de la serie en el informe.
        puntos: la serie a validar.
        minimo: valor mínimo plausible; por debajo se registra error.
        maximo: valor máximo plausible; por encima se registra error.
        salto_relativo: factor a partir del cual un cambio entre dos puntos
            consecutivos se considera anómalo (3.0 = triplicarse o caer a un tercio).
        mensual: si es ``True``, comprueba que no falten meses intermedios.
    """
    informe.series.add(nombre)

    if not puntos:
        informe.añadir(Incidencia(nombre, "serie_vacia",
                                  "la fuente no devolvió ningún punto", "error"))
        return

    etiquetas = [p.get("t") for p in puntos]
    if len(set(etiquetas)) != len(etiquetas):
        informe.añadir(Incidencia(nombre, "periodos_duplicados",
                                  f"{len(etiquetas) - len(set(etiquetas))} periodos repetidos"))

    if etiquetas != sorted(etiquetas):
        informe.añadir(Incidencia(nombre, "orden", "la serie no está ordenada por periodo"))

    valores = [p.get("v") for p in puntos if isinstance(p.get("v"), (int, float))]
    if len(valores) < len(puntos):
        informe.añadir(Incidencia(nombre, "valores_no_numericos",
                                  f"{len(puntos) - len(valores)} puntos sin valor numérico"))

    for p in puntos:
        v = p.get("v")
        if not isinstance(v, (int, float)):
            continue
        if minimo is not None and v < minimo:
            informe.añadir(Incidencia(nombre, "fuera_de_rango",
                                      f"{p['t']} = {v} < mínimo plausible {minimo}", "error"))
        if maximo is not None and v > maximo:
            informe.añadir(Incidencia(nombre, "fuera_de_rango",
                                      f"{p['t']} = {v} > máximo plausible {maximo}", "error"))

    for anterior, actual in zip(puntos, puntos[1:]):
        va, vb = anterior.get("v"), actual.get("v")
        if not isinstance(va, (int, float)) or not isinstance(vb, (int, float)) or va == 0:
            continue
        razon = vb / va
        if razon > salto_relativo or razon < 1 / salto_relativo:
            informe.añadir(Incidencia(
                nombre, "salto_anomalo",
                f"{anterior['t']} = {va} → {actual['t']} = {vb} (×{razon:.1f})"))

    if mensual:
        faltan = []
        for anterior, actual in zip(etiquetas, etiquetas[1:]):
            if not (isinstance(anterior, str) and len(anterior) == 7):
                continue
            esperado = _siguiente_mes(anterior)
            while esperado < actual:
                faltan.append(esperado)
                esperado = _siguiente_mes(esperado)
        if faltan:
            muestra = ", ".join(faltan[:6]) + ("…" if len(faltan) > 6 else "")
            informe.añadir(Incidencia(nombre, "meses_ausentes",
                                      f"{len(faltan)} meses sin dato: {muestra}"))
