# -*- coding: utf-8 -*-
"""Cliente HTTP del pipeline: reintentos con backoff y caché de descarga cruda.

Toda descarga pasa por aquí, de modo que:

* cada respuesta se guarda íntegra en ``data/raw/`` con marca temporal, lo que
  hace trazable cualquier dato publicado hasta su origen y su fecha de obtención;
* los fallos de red transitorios se reintentan con espera creciente;
* un fallo definitivo lanza :class:`FuenteNoDisponible`, nunca devuelve datos
  de relleno ni falla en silencio.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from .log import get_logger

log = get_logger("http")

AGENTE = "ObservatorioBenahavis/1.0 (AMMA; pipeline de datos abiertos)"
TIMEOUT_POR_DEFECTO = 120

_SECRETOS = re.compile(r"(?i)([?&](?:api_?key|key|token|secret|password)=)[^&\s]+")


def ocultar(texto: str) -> str:
    """Sustituye por asteriscos cualquier credencial que viaje en la URL.

    AEMET pasa la clave como parámetro de consulta, de modo que sin esta función
    la clave acabaría escrita en el log y, con él, potencialmente en cualquier
    volcado de la ejecución.
    """
    return _SECRETOS.sub(r"\1********", str(texto))


class FuenteNoDisponible(RuntimeError):
    """La fuente no ha respondido tras agotar los reintentos, o devolvió algo inválido."""

    def __init__(self, url: str, causa: str) -> None:
        super().__init__(f"{ocultar(url)} → {ocultar(causa)}")
        self.url = ocultar(url)
        self.causa = ocultar(causa)


def _nombre_cache(url: str, sufijo: str) -> str:
    """Nombre de fichero estable y corto para una URL, con hash para evitar colisiones."""
    firma = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
    sello = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"{sello}_{firma}{sufijo}"


def descargar(
    url: str,
    *,
    dir_raw: Path,
    sufijo: str = ".bin",
    timeout: int = TIMEOUT_POR_DEFECTO,
    reintentos: int = 3,
    espera_inicial: float = 2.0,
    cabeceras: dict[str, str] | None = None,
    guardar: bool = True,
) -> bytes:
    """Descarga una URL y devuelve su contenido en bytes.

    Args:
        url: dirección a descargar.
        dir_raw: directorio donde se archiva la descarga cruda.
        sufijo: extensión del fichero archivado (``.json``, ``.csv``, ``.xlsx``…).
        timeout: segundos de espera por intento.
        reintentos: número total de intentos.
        espera_inicial: segundos de espera tras el primer fallo; se duplica en cada intento.
        cabeceras: cabeceras HTTP adicionales.
        guardar: si es ``False`` no se archiva la descarga (ficheros muy grandes de un solo uso).

    Returns:
        El cuerpo de la respuesta.

    Raises:
        FuenteNoDisponible: si se agotan los reintentos o la respuesta viene vacía.
    """
    cab = {"User-Agent": AGENTE}
    if cabeceras:
        cab.update(cabeceras)

    espera = espera_inicial
    ultimo_error = "sin detalle"
    for intento in range(1, reintentos + 1):
        try:
            resp = requests.get(url, headers=cab, timeout=timeout)
            if resp.status_code == 429:
                # Límite de cadencia (AEMET lo aplica por clave): merece una espera
                # mucho más larga que un fallo de red corriente.
                espera = max(espera, 30.0)
                raise ValueError("429 Too Many Requests: límite de cadencia de la fuente")
            resp.raise_for_status()
            if not resp.content:
                # AEMET, entre otros, devuelve 200 con cuerpo vacío cuando falta la clave.
                raise ValueError("respuesta HTTP 200 con cuerpo vacío")
            if guardar:
                dir_raw.mkdir(parents=True, exist_ok=True)
                destino = dir_raw / _nombre_cache(url, sufijo)
                destino.write_bytes(resp.content)
                log.debug("archivado %s (%d bytes)", destino.name, len(resp.content))
            return resp.content
        except Exception as exc:  # noqa: BLE001 — se reintenta cualquier fallo de red
            ultimo_error = ocultar(f"{type(exc).__name__}: {exc}")
            if intento < reintentos:
                log.warning("intento %d/%d falló (%s); reintento en %.0fs",
                            intento, reintentos, ultimo_error, espera)
                time.sleep(espera)
                espera *= 2
            else:
                log.error("agotados %d intentos contra %s", reintentos, ocultar(url))

    raise FuenteNoDisponible(url, ultimo_error)


def descargar_json(url: str, **kwargs: Any) -> Any:
    """Descarga y decodifica una respuesta JSON.

    Se intenta UTF-8 y, si falla, ``latin-1``: AEMET sirve los ficheros de datos
    en ISO-8859 sin declararlo, de modo que asumir UTF-8 los descarta enteros.
    """
    kwargs.setdefault("sufijo", ".json")
    crudo = descargar(url, **kwargs)
    for codificacion in ("utf-8", "latin-1"):
        try:
            return json.loads(crudo.decode(codificacion))
        except UnicodeDecodeError:
            continue
        except json.JSONDecodeError as exc:
            raise FuenteNoDisponible(url, f"respuesta no es JSON válido: {exc}") from exc
    raise FuenteNoDisponible(url, "no se pudo decodificar la respuesta ni en UTF-8 ni en latin-1")


def descargar_texto(url: str, *, codificacion: str = "utf-8", **kwargs: Any) -> str:
    """Descarga y decodifica una respuesta de texto.

    Varias fuentes españolas (SEPE, Dataestur) publican CSV en ``latin-1``; hay que
    indicarlo explícitamente porque no lo declaran en la cabecera.
    """
    kwargs.setdefault("sufijo", ".csv")
    return descargar(url, **kwargs).decode(codificacion, errors="replace")
