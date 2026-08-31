# -*- coding: utf-8 -*-
"""Descarga el límite del término municipal y lo archiva en ``docs/data/limite.json``.

Va aparte del pipeline mensual a propósito: **un término municipal no cambia de un
mes para otro**, y Overpass es un servicio comunitario con cupos que no conviene
golpear en cada ejecución programada. El GeoJSON pesa 8 KB, se versiona en el
repositorio y el panel lo carga como un fichero de datos más.

Se ejecuta a mano cuando haga falta::

    python actualizar_limite.py

Trampas verificadas:

* Overpass responde **406 Not Acceptable** si la petición no lleva ``User-Agent``
  propio. El error no dice nada de la cabecera y despista hacia la consulta.
* La relación se busca por ``name``, pero lo que confirma que es el término
  correcto es la etiqueta ``ine:municipio``, que aquí debe valer ``29023``.
* Los miembros ``outer`` llegan como tramos sueltos y **sin orden**: hay que
  encadenarlos comparando extremos, y algunos vienen recorridos al revés.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
DESTINO = RAIZ / "docs" / "data" / "limite.json"

#: Overpass es infraestructura comunitaria y responde 504 con frecuencia cuando
#: está cargada. Se prueban las réplicas en orden hasta que una conteste; todas
#: sirven la misma base de OSM.
ESPEJOS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
AGENTE = "observatorio-benahavis/1.0 (Consultoria AMMA para el Ayuntamiento de Benahavis)"
MUNICIPIO = "Benahavís"
CODIGO_INE = "29023"

CONSULTA = (
    "[out:json][timeout:120];"
    f'relation["boundary"="administrative"]["admin_level"="8"]["name"="{MUNICIPIO}"];'
    "out geom;"
)

#: Tolerancia para dar dos vértices por coincidentes al encadenar tramos. Los
#: extremos compartidos de dos ways vienen con las mismas coordenadas exactas,
#: así que basta con absorber el error de coma flotante.
EPSILON = 1e-9


def _descargar() -> dict:
    cuerpo = urllib.parse.urlencode({"data": CONSULTA}).encode("utf-8")
    fallos = []
    for espejo in ESPEJOS:
        peticion = urllib.request.Request(espejo, data=cuerpo,
                                          headers={"User-Agent": AGENTE})
        try:
            with urllib.request.urlopen(peticion, timeout=240) as respuesta:
                return json.loads(respuesta.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 — se prueba el siguiente espejo
            print(f"   {espejo}: {exc}")
            fallos.append(f"{espejo}: {exc}")
    raise RuntimeError("ningún espejo de Overpass respondió:\n  " + "\n  ".join(fallos))


def _anillo(relacion: dict) -> list[tuple[float, float]]:
    """Encadena los tramos ``outer`` en un anillo cerrado de (lon, lat)."""
    tramos = [[(p["lon"], p["lat"]) for p in m["geometry"]]
              for m in relacion["members"]
              if m.get("role") == "outer" and m.get("type") == "way"]
    if not tramos:
        raise ValueError("la relación no trae tramos exteriores")

    anillo = tramos.pop(0)
    while tramos:
        for i, tramo in enumerate(tramos):
            if _mismo(tramo[0], anillo[-1]):
                anillo += tramo[1:]
            elif _mismo(tramo[-1], anillo[-1]):
                anillo += tramo[::-1][1:]
            else:
                continue
            tramos.pop(i)
            break
        else:
            raise ValueError(f"el contorno se rompe: quedan {len(tramos)} tramos sin encajar")

    if not _mismo(anillo[0], anillo[-1]):
        anillo.append(anillo[0])
    return anillo


def _mismo(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return abs(a[0] - b[0]) < EPSILON and abs(a[1] - b[1]) < EPSILON


def main() -> int:
    datos = _descargar()
    relaciones = [e for e in datos.get("elements", []) if e.get("type") == "relation"]
    if not relaciones:
        raise ValueError(f"Overpass no devolvió ninguna relación para {MUNICIPIO}")

    relacion = relaciones[0]
    ine = (relacion.get("tags") or {}).get("ine:municipio")
    if ine != CODIGO_INE:
        raise ValueError(f"la relación {relacion['id']} tiene ine:municipio={ine!r}, "
                         f"se esperaba {CODIGO_INE!r}")

    anillo = _anillo(relacion)
    lons = [c[0] for c in anillo]
    lats = [c[1] for c in anillo]

    geojson = {
        "type": "Feature",
        "properties": {
            "nombre": MUNICIPIO,
            "ine": CODIGO_INE,
            "fuente": f"OpenStreetMap · relación {relacion['id']} "
                      "(boundary=administrative, admin_level=8, ine:municipio=29023)",
            "licencia": "ODbL",
        },
        # Cinco decimales son poco más de un metro: de sobra para dibujar un
        # término de 15 km de lado, y deja el fichero en 8 KB.
        "geometry": {"type": "Polygon",
                     "coordinates": [[[round(x, 5), round(y, 5)] for x, y in anillo]]},
    }
    DESTINO.write_text(json.dumps(geojson, ensure_ascii=False, separators=(",", ":")),
                       encoding="utf-8")
    print(f"{DESTINO.relative_to(RAIZ)}: {len(anillo)} vértices · "
          f"bbox {min(lons):.4f} {min(lats):.4f} {max(lons):.4f} {max(lats):.4f} · "
          f"{DESTINO.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
