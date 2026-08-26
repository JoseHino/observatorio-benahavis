# -*- coding: utf-8 -*-
"""Comprueba que los enlaces a fuentes del panel siguen vivos.

    python check_enlaces.py

Las direcciones se leen del propio ``docs/assets/panel-benahavis.js``, no de una
lista aparte: una lista paralela se desincroniza a la primera y acaba dando por
buenos enlaces que ya nadie usa, o al revés.

Devuelve 1 si alguno falla, para poder engancharlo a una comprobación periódica.
Un 404 no es lo único que rompe un enlace: hay portales que responden 200 y
sirven una página de error, así que también se mira el cuerpo.
"""
from __future__ import annotations

import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

PANEL = Path(__file__).parent / "docs" / "assets" / "panel-benahavis.js"

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/128 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/json,*/*"}

#: Páginas de error servidas con código 200. Sin esto, un portal que "responde"
#: pasaría la comprobación aunque el enlace lleve a ninguna parte.
SENALES_DE_ERROR = ("no se ha encontrado", "página no encontrada",
                    "pagina no encontrada", "error 404", "not found",
                    "servicio no disponible")

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


def enlaces() -> list[tuple[str, str]]:
    """Pares (etiqueta, dirección) de las fuentes declaradas en el panel."""
    js = PANEL.read_text(encoding="utf-8")
    pares = re.findall(r"txt:\s*'([^']+)'\s*,\s*\n?\s*url:\s*'([^']+)'", js)
    # Las que se construyen concatenando la base del Big Data.
    base = re.search(r"var CDS = '([^']+)'", js)
    if base:
        for txt, resto in re.findall(r"txt:\s*'([^']+)'\s*,\s*url:\s*CDS \+ '([^']+)'", js):
            pares.append((txt, base.group(1) + resto))
    return sorted(set(pares), key=lambda x: x[0])


def revisar(url: str) -> tuple[bool, str]:
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA),
                                   timeout=60, context=_CTX)
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:                                        # noqa: BLE001
        return False, f"{type(e).__name__}: {str(e)[:40]}"
    cuerpo = r.read(9000).decode("utf-8", "replace").lower()
    mal = next((s for s in SENALES_DE_ERROR if s in cuerpo), None)
    if mal:
        return False, f"HTTP {r.status} pero sirve página de error ({mal!r})"
    return True, f"HTTP {r.status}"


def main() -> int:
    pares = enlaces()
    if not pares:
        print("No se encontró ninguna fuente en", PANEL)
        return 1
    fallos = 0
    for txt, url in pares:
        ok, detalle = revisar(url)
        if not ok:
            fallos += 1
        print(f"  {'ok ' if ok else '[!]'} {detalle:16} {txt[:44]:44} {url[:60]}")
    print(f"\n{len(pares) - fallos}/{len(pares)} enlaces correctos")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
