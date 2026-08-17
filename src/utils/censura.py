# -*- coding: utf-8 -*-
"""Tratamiento de valores censurados por secreto estadístico.

SEPE y Seguridad Social sustituyen por ``<5`` cualquier valor comprendido entre 1 y 4.
Es un caso de **censura por intervalo**, no un dato ausente ni un cero.

Reglas del observatorio, de obligado cumplimiento:

* un ``<5`` **nunca** se convierte en 0 (subestimaría) ni en 2,5 (inventaría un dato);
* se propaga como :data:`CENSURADO` hasta el JSON, y la interfaz lo muestra como ``<5``;
* al agregar, se acumulan por separado la parte observada y el **número de celdas
  censuradas**, de modo que el total se publica como intervalo
  ``[suma_visible, suma_visible + 4 · n_censuradas]``.

Así, un total afectado por censura se comunica siempre como rango, nunca como
cifra puntual con apariencia de exactitud.
"""
from __future__ import annotations

from dataclasses import dataclass, field

CENSURADO = "<5"
"""Marca literal que el pipeline propaga hasta el frontend."""

TOPE_CENSURA = 4
"""Valor máximo que puede esconder una celda marcada como ``<5``."""


def parsear(valor: object) -> int | str | None:
    """Normaliza una celda que puede venir como número, como ``<5`` o vacía.

    Returns:
        ``int`` si el valor es observable, :data:`CENSURADO` si está enmascarado,
        o ``None`` si la celda está vacía.
    """
    if valor is None:
        return None
    texto = str(valor).strip()
    if not texto or texto in {"-", "..", "."}:
        return None
    if texto.replace(" ", "").startswith("<"):
        return CENSURADO
    try:
        return int(round(float(texto.replace(".", "").replace(",", "."))))
    except ValueError:
        return None


@dataclass
class Agregado:
    """Suma de valores parcialmente censurados.

    Attributes:
        visible: suma de las celdas con valor observable.
        censuradas: número de celdas enmascaradas como ``<5``.
        vacias: número de celdas sin dato.
    """

    visible: int = 0
    censuradas: int = 0
    vacias: int = 0
    _detalle: list[str] = field(default_factory=list, repr=False)

    def añadir(self, valor: object, etiqueta: str = "") -> None:
        """Incorpora una celda al agregado."""
        parsed = parsear(valor)
        if parsed is None:
            self.vacias += 1
        elif parsed == CENSURADO:
            self.censuradas += 1
            if etiqueta:
                self._detalle.append(etiqueta)
        else:
            self.visible += int(parsed)

    @property
    def maximo(self) -> int:
        """Cota superior del total real."""
        return self.visible + self.censuradas * TOPE_CENSURA

    @property
    def exacto(self) -> bool:
        """``True`` si ninguna celda estaba censurada y el total es una cifra cierta."""
        return self.censuradas == 0

    def a_dict(self) -> dict[str, object]:
        """Representación serializable para el JSON del frontend."""
        return {
            "min": self.visible,
            "max": self.maximo,
            "exacto": self.exacto,
            "celdas_censuradas": self.censuradas,
            "celdas_vacias": self.vacias,
        }
