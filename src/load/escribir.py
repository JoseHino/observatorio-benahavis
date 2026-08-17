# -*- coding: utf-8 -*-
"""Escritura de resultados a ``data/processed`` y a ``docs/data``.

Se escriben dos copias de cada bloque:

* **``data/processed/*.json``** — resultado del pipeline, con su diccionario de
  variables asociado en ``*.diccionario.md``.
* **``docs/data/*.json``** — lo que consume el frontend. Es el mismo contenido:
  se duplica a propósito para que la web no dependa de rutas fuera de ``docs/``,
  que es la raíz que sirve GitHub Pages.

Si una fuente falla, el bloque **no se sobrescribe**: se conserva el JSON anterior
y se marca el indicador como desactualizado en ``meta.json``. Nunca se publica un
fichero vacío encima de uno con datos.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..contexto import DATA_PROC, DOCS_DATA
from ..utils.log import get_logger

log = get_logger("load")


def escribir(nombre: str, contenido: Any, *, diccionario: str | None = None) -> None:
    """Escribe un bloque de datos en las dos rutas de publicación.

    Args:
        nombre: nombre del fichero sin extensión (p. ej. ``"demografia"``).
        contenido: estructura serializable a JSON.
        diccionario: texto Markdown con el diccionario de variables del bloque.
    """
    texto = json.dumps(contenido, ensure_ascii=False, indent=1, sort_keys=False)
    for destino in (DATA_PROC, DOCS_DATA):
        destino.mkdir(parents=True, exist_ok=True)
        (destino / f"{nombre}.json").write_text(texto, encoding="utf-8")
    if diccionario:
        DATA_PROC.mkdir(parents=True, exist_ok=True)
        (DATA_PROC / f"{nombre}.diccionario.md").write_text(diccionario, encoding="utf-8")
    log.info("escrito %s.json (%d KB)", nombre, len(texto.encode("utf-8")) // 1024)


def conservar(nombre: str) -> bool:
    """Comprueba si ya existe una versión previa publicada de un bloque.

    Se usa cuando una fuente falla: si hay dato anterior, se conserva y el bloque
    se marca como desactualizado; si no lo hay, el bloque queda explícitamente vacío.
    """
    return (DOCS_DATA / f"{nombre}.json").exists()


def leer_previo(nombre: str) -> Any | None:
    """Devuelve el contenido publicado anteriormente para un bloque, si existe."""
    ruta: Path = DOCS_DATA / f"{nombre}.json"
    if not ruta.exists():
        return None
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        log.warning("%s existe pero no es JSON válido; se ignora", ruta.name)
        return None
