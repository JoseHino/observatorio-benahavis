# -*- coding: utf-8 -*-
"""Orquestador del Observatorio de Benahavís.

Ejecuta los ocho bloques temáticos. Cada bloque está aislado: si una fuente falla,
se registra el fallo, se conserva el dato publicado anteriormente y el indicador
queda marcado como desactualizado en ``docs/data/meta.json``. El pipeline nunca se
detiene por una fuente caída y nunca escribe datos de relleno.

Uso::

    python run_pipeline.py                # todos los bloques
    python run_pipeline.py --bloques 1 4  # solo demografía y mercado de trabajo
    python run_pipeline.py --listar       # muestra los bloques disponibles
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from typing import Any, Callable

from dotenv import load_dotenv

from src.contexto import (
    AEMET_ESTACION, COD_INE, COMARCA, DATA_PROC, DATA_RAW, DOCS_DATA, LOG,
    MUNICIPIO, NOMBRE_PROVINCIA, VERSION,
)
from src.extract import (
    aemet, badea, costadelsol, dataestur, eoh, hacienda, ine_tempus, openrta, sepe, sima,
)
from src.extract import seguridad_social as ss
from src.extract import visitantes as vis
from src.load import escribir, leer_previo
from src.transform.validar import Informe, serie_temporal
from src.utils.log import configurar, get_logger

log = get_logger("pipeline")

AHORA = dt.datetime.now(dt.timezone.utc)
SELLO = AHORA.strftime("%Y-%m-%dT%H:%M:%SZ")

#: Estado de cada bloque tras la ejecución, volcado a ``meta.json``.
ESTADO: dict[str, dict[str, Any]] = {}
INFORME = Informe()


def _registrar(bloque: str, ok: bool, detalle: str = "") -> None:
    ESTADO[bloque] = {
        "actualizado": ok,
        "sello": SELLO if ok else ESTADO.get(bloque, {}).get("sello"),
        "detalle": detalle,
    }


def _bloque(nombre: str, clave: str, funcion: Callable[[], Any]) -> None:
    """Ejecuta un bloque aislando su fallo del resto del pipeline."""
    log.info("")
    log.info("── %s ─────────────────────────────────────────", nombre)
    try:
        datos = funcion()
    except Exception as exc:  # noqa: BLE001 — un bloque caído no puede tumbar el pipeline
        log.error("bloque «%s» falló: %s: %s", nombre, type(exc).__name__, exc)
        previo = leer_previo(clave)
        if previo is not None:
            log.warning("   se conserva la versión publicada anteriormente")
            _registrar(clave, False, f"{type(exc).__name__}: {exc}")
        else:
            escribir(clave, {"estado": "sin_datos", "motivo": str(exc)})
            _registrar(clave, False, f"sin dato previo · {exc}")
        return
    escribir(clave, datos)
    _registrar(clave, True)


# ---------------------------------------------------------------- Bloque 1
def bloque_demografia() -> dict[str, Any]:
    """Población empadronada y renta de los hogares."""
    padron = ine_tempus.padron()
    renta = ine_tempus.atlas_renta()

    try:
        desigualdad = ine_tempus.desigualdad()
    except Exception as exc:  # noqa: BLE001 — indicador secundario del bloque
        log.warning("Gini y P80/P20 no disponibles: %s", exc)
        desigualdad = {}

    # Nacionalidad: el Padrón Continuo dejó de bajarla al municipio tras 2022, así
    # que la serie del INE termina ahí y la única cifra reciente es la ficha del
    # IECA. Ninguna de las dos fuentes puede tumbar el bloque: el padrón sí, ellas no.
    try:
        nacionalidad = ine_tempus.padron_nacionalidad()
        paises = ine_tempus.nacionalidades()
    except Exception as exc:  # noqa: BLE001 — indicador secundario del bloque
        log.warning("padrón por nacionalidad no disponible: %s", exc)
        previo_demo = leer_previo("demografia") or {}
        nacionalidad = previo_demo.get("nacionalidad") or {}
        paises = previo_demo.get("nacionalidades") or {}

    try:
        ieca_extranjeros = sima.poblacion_extranjera()
    except Exception as exc:  # noqa: BLE001 — cierra el hueco 2023-hoy, no es imprescindible
        log.warning("ficha del SIMA no disponible: %s", exc)
        ieca_extranjeros = (leer_previo("demografia") or {}).get("extranjeros_ieca") or {}

    # Contexto territorial de la renta: misma operación del INE que la municipal,
    # de modo que la comparación es homogénea en definición, fuente y año.
    try:
        renta_contexto = ine_tempus.renta_comparada()
    except Exception as exc:  # noqa: BLE001 — indicador de contexto
        log.warning("renta de las demarcaciones superiores no disponible: %s", exc)
        renta_contexto = (leer_previo("demografia") or {}).get("renta_contexto") or {}

    serie_temporal(INFORME, "padron.total", padron["total"], minimo=1000, maximo=50000)
    for clave, puntos in renta.items():
        serie_temporal(INFORME, f"renta.{clave}", puntos, minimo=0, maximo=500000)
    if desigualdad.get("gini"):
        serie_temporal(INFORME, "renta.gini", desigualdad["gini"], minimo=0, maximo=100)
    if desigualdad.get("p80_p20"):
        serie_temporal(INFORME, "renta.p80_p20", desigualdad["p80_p20"], minimo=0, maximo=50)

    ultimo = padron["total"][-1] if padron["total"] else None
    if nacionalidad.get("extranjera", {}).get("total"):
        serie_temporal(INFORME, "padron.extranjeros", nacionalidad["extranjera"]["total"],
                       minimo=0, maximo=20000)

    return {
        "padron": padron,
        "nacionalidad": nacionalidad,
        "nacionalidades": paises,
        "extranjeros_ieca": ieca_extranjeros,
        "renta": renta,
        "renta_contexto": renta_contexto,
        "desigualdad": desigualdad,
        "poblacion_actual": ultimo,
        "fuente": "INE · Cifras oficiales de población (tabla 2882), Padrón por nacionalidad "
                  "(tablas 33571 y 33572), Atlas de Distribución de Renta de los Hogares "
                  "(tablas 30824 y 53689) e índice de Gini y P80/P20 (tabla 37677) · "
                  "IECA/SIMA para la población extranjera posterior a 2022",
        "ambito": "municipal",
        "actualizado": SELLO,
    }


# ---------------------------------------------------------------- Bloque 2
def bloque_oferta() -> dict[str, Any]:
    """Oferta turística: registro administrativo (RTA) y oferta anunciada (INE)."""
    rta = openrta.resumir(openrta.registros())
    vut = ine_tempus.viviendas_turisticas()

    serie_temporal(INFORME, "rta.acumulado_altas", rta["acumulado_altas"], minimo=0)
    if vut.get("viviendas"):
        serie_temporal(INFORME, "ine.viviendas_turisticas", vut["viviendas"], minimo=0)

    return {
        "rta": rta,
        "ine_experimental": vut,
        "advertencia": (
            "El Registro de Turismo de Andalucía mide oferta inscrita administrativamente; "
            "la estadística experimental del INE mide oferta anunciada en plataformas de "
            "intermediación. Miden universos distintos y no deben compararse ni sumarse."
        ),
        "fuente": "Junta de Andalucía · OpenRTA · e INE · Viviendas turísticas (tablas 39363 y 39366)",
        "ambito": "municipal",
        "actualizado": SELLO,
    }


# ---------------------------------------------------------------- Bloque 3
def bloque_demanda() -> dict[str, Any]:
    """Demanda turística municipal a partir de posicionamiento de telefonía móvil."""
    hoy = dt.date.today()
    receptor = dataestur.turismo_receptor((2019, 7), (hoy.year, hoy.month))
    interno = dataestur.turismo_interno([hoy.year - 1, hoy.year])

    # Indicador sustitutivo del hueco de pernoctaciones: ámbito de zona turística,
    # nunca municipal. Su caída no puede tumbar el bloque, que sí es municipal.
    try:
        hotelera = eoh.zona_turistica()
    except Exception as exc:  # noqa: BLE001 — el endpoint devuelve 504 con frecuencia
        log.warning("EOH por zona turística no disponible: %s", exc)
        hotelera = (leer_previo("demanda") or {}).get("eoh_zona_turistica") or {}

    serie_temporal(INFORME, "demanda.turistas_extranjeros", receptor["serie"],
                   minimo=0, maximo=200000, mensual=True)
    serie_temporal(INFORME, "demanda.turistas_nacionales", interno["serie"],
                   minimo=0, maximo=200000, mensual=True)
    if hotelera.get("serie_mensual"):
        serie_temporal(INFORME, "eoh.ocupacion_zona_turistica",
                       [{"t": m["t"], "v": m["ocupacion_plazas"]}
                        for m in hotelera["serie_mensual"] if m["ocupacion_plazas"] is not None],
                       minimo=0, maximo=100, mensual=True, salto_relativo=5.0)

    return {
        "receptor": receptor,
        "interno": interno,
        "eoh_zona_turistica": hotelera,
        "advertencia": (
            "Estadística EXPERIMENTAL del INE basada en el posicionamiento de teléfonos "
            "móviles, redistribuida por Dataestur (SEGITTUR). No mide pernoctaciones en "
            "alojamiento reglado ni procede de la Encuesta de Ocupación Hotelera. No es "
            "comparable con las cifras de oferta del Registro de Turismo de Andalucía."
        ),
        "fuente": "INE · Medición del turismo a partir de la posición de los teléfonos móviles "
                  "y Encuesta de Ocupación Hotelera por zonas turísticas "
                  "(ambas vía Dataestur, SEGITTUR)",
        "ambito": "municipal",
        "es_proxy": False,
        "actualizado": SELLO,
    }


# ---------------------------------------------------------------- Bloque 4
def bloque_trabajo() -> dict[str, Any]:
    """Mercado de trabajo: paro, contratos y afiliación por rama de actividad."""
    anyos = sepe.anyos_recientes(4)
    paro = sepe.paro(anyos)
    contratos = sepe.contratos(anyos)
    # Descarga incremental: se reutilizan los meses ya publicados.
    previo = (leer_previo("trabajo") or {}).get("afiliacion")
    afiliacion = ss.afiliacion(ss.meses_recientes(24), previo)

    try:
        anual = badea.paro_anual()
    except Exception as exc:  # noqa: BLE001 — indicador secundario
        log.warning("BADEA no disponible: %s", exc)
        anual = {}

    serie_temporal(INFORME, "sepe.paro",
                   [{"t": p["t"], "v": p["total"]} for p in paro["serie"]],
                   minimo=0, maximo=5000, mensual=True)
    serie_temporal(INFORME, "sepe.contratos",
                   [{"t": c["t"], "v": c["total"]} for c in contratos["serie"]],
                   minimo=0, maximo=20000, mensual=True, salto_relativo=5.0)

    return {
        "paro": paro,
        "contratos": contratos,
        "afiliacion": afiliacion,
        "paro_anual_ieca": anual,
        "fuente": "SEPE · datos abiertos de paro y contratos por municipios · "
                  "Seguridad Social · Afiliados por municipios CNAE 2D · IECA/BADEA",
        "ambito": "municipal",
        "actualizado": SELLO,
    }


# ---------------------------------------------------------------- Bloque 5 y 8
def bloque_economia() -> dict[str, Any]:
    """Tejido empresarial, trabajo autónomo y finanzas municipales."""
    deuda = hacienda.deuda_viva()
    serie_temporal(INFORME, "hacienda.deuda_viva", deuda["serie"], minimo=0)

    try:
        empresas = ine_tempus.empresas()
        serie_temporal(INFORME, "dirce.empresas", empresas["total"], minimo=0, maximo=20000)
    except Exception as exc:  # noqa: BLE001 — indicador secundario del bloque
        log.warning("DIRCE no disponible: %s", exc)
        empresas = (leer_previo("economia") or {}).get("empresas") or {}

    # BADEA obliga a una petición por mes, así que la serie se descarga de forma
    # incremental sobre lo ya publicado: en la ejecución mensual son uno o dos meses.
    try:
        regimenes = badea.afiliacion_por_regimen((leer_previo("economia") or {}).get("afiliacion_regimen"))
        serie_temporal(INFORME, "badea.autonomos",
                       [{"t": p["t"], "v": p["autonomos"]} for p in regimenes["serie"]
                        if p.get("autonomos") is not None],
                       minimo=0, maximo=10000, mensual=False)
    except Exception as exc:  # noqa: BLE001 — indicador secundario del bloque
        log.warning("afiliación por régimen no disponible: %s", exc)
        regimenes = (leer_previo("economia") or {}).get("afiliacion_regimen") or {}

    return {
        "empresas": empresas,
        "afiliacion_regimen": regimenes,
        "deuda_viva": deuda,
        "pendientes": [
            {"indicador": "Periodo medio de pago a proveedores",
             "motivo": "aplicación web con formulario, sin descarga directa",
             "organismo": "Ministerio de Hacienda · SGCIEF"},
            {"indicador": "Presupuestos y liquidaciones",
             "motivo": "aplicación web con formulario, sin descarga directa",
             "organismo": "Ministerio de Hacienda · SGCIEF"},
            {"indicador": "Precio de vivienda y transacciones inmobiliarias",
             "motivo": "el portal rechaza peticiones automatizadas y varias series "
                       "tienen umbral poblacional que Benahavís no alcanza",
             "organismo": "Ministerio de Vivienda y Agenda Urbana"},
        ],
        "fuente": "INE · DIRCE, empresas por municipio (tabla 4721) · IECA/BADEA, "
                  "afiliaciones por régimen (consulta 876) · Ministerio de Hacienda, "
                  "deuda viva de las entidades locales",
        "ambito": "municipal",
        "actualizado": SELLO,
    }


# ---------------------------------------------------------------- Bloque 6
def bloque_clima() -> dict[str, Any]:
    """Clima observado en la estación de AEMET situada dentro del término municipal.

    Solo observación. Se probó completar la serie hacia atrás con el reanálisis
    ERA5 —que llega a 1950— y se descartó por decisión del cliente: el panel
    publica lo que mide un termómetro dentro del término y nada más. El hallazgo
    y sus cifras quedan en ``docs/inventario-fuentes.md`` por si alguna vez hace
    falta el contexto de medio siglo.
    """
    resumen = aemet.resumir(aemet.serie_mensual(AEMET_ESTACION))
    serie_temporal(INFORME, "clima.temperatura_anual", resumen["temperatura_anual"],
                   minimo=5, maximo=30, salto_relativo=1.5)
    serie_temporal(INFORME, "clima.precipitacion_anual", resumen["precipitacion_anual"],
                   minimo=0, maximo=3000, salto_relativo=6.0)
    serie_temporal(INFORME, "clima.temperatura_mensual", resumen["temperatura_mensual"],
                   minimo=-5, maximo=40, salto_relativo=3.0, mensual=True)

    return {
        **resumen,
        "estacion": {"indicativo": AEMET_ESTACION, "nombre": "Benahavís",
                     "altitud_m": 392, "dentro_del_termino": True},
        "fuente": "AEMET OpenData · estación 6069X Benahavís",
        "ambito": "municipal",
        "actualizado": SELLO,
    }


# ---------------------------------------------------------------- Decreto 72/2017
def bloque_visitantes() -> dict[str, Any]:
    """Conteo municipal de visitantes para acreditar población turística asistida."""
    datos = vis.cargar()
    return {
        **datos,
        "marco_normativo": "Decreto 72/2017, de 13 de junio, de Municipio Turístico de "
                           "Andalucía · Ley 13/2011 del Turismo de Andalucía",
        "via_acreditacion": "visitas",
        "fuente": "Ayuntamiento de Benahavís (dato propio municipal)",
        "ambito": "municipal",
        "actualizado": SELLO,
    }


# ---------------------------------------------------------------- Bloque 8
def _tramo_mensual(puntos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Devuelve el tramo final de la serie que ya tiene periodicidad mensual.

    La serie histórica del registro de alojamiento publica un dato al año hasta
    mediados de la década pasada y pasa a mensual después. Validar el conjunto
    como serie mensual marcaría dos décadas de huecos inexistentes, y validarlo
    como serie anual daría por anómalo que un municipio pase de uno a dos
    establecimientos. Solo el tramo mensual admite un control de continuidad.
    """
    corte = 0
    for i in range(len(puntos) - 1, 0, -1):
        anterior, actual = puntos[i - 1]["t"], puntos[i]["t"]
        anyo, mes = int(anterior[:4]), int(anterior[5:7])
        siguiente = f"{anyo + (mes // 12)}-{(mes % 12) + 1:02d}"
        if actual != siguiente:
            corte = i
            break
    return puntos[corte:]


def bloque_costadelsol() -> dict[str, Any]:
    """Explotación municipal del Big Data de Turismo y Planificación Costa del Sol.

    Aporta las series municipales que las fuentes estadísticas generales no bajan
    a un municipio de este tamaño: ocupación de la vivienda turística, oferta
    inscrita con serie histórica, precios y valoración de los alojamientos y
    empleo turístico sin la censura del «<5» de la Seguridad Social.
    """
    datos = costadelsol.todo()

    if datos.get("vivienda_turistica", {}).get("serie"):
        serie_temporal(INFORME, "cds.ocupacion_vut",
                       [{"t": p["t"], "v": p["ocupacion"]}
                        for p in datos["vivienda_turistica"]["serie"] if p["ocupacion"] is not None],
                       minimo=0, maximo=100, mensual=True, salto_relativo=4.0)
        serie_temporal(INFORME, "cds.viviendas_anunciadas",
                       [{"t": p["t"], "v": p["viviendas"]}
                        for p in datos["vivienda_turistica"]["serie"] if p["viviendas"] is not None],
                       minimo=0, mensual=True, salto_relativo=4.0)
    if datos.get("oferta", {}).get("total"):
        # La serie histórica del RTA trae algún mes duplicado en origen —febrero de
        # 2022 dobla el registro—; se publica tal cual y el aviso queda recogido en
        # el informe de validación, que es donde debe verse.
        mensual = _tramo_mensual(datos["oferta"]["total"])
        serie_temporal(INFORME, "cds.plazas_inscritas",
                       [{"t": p["t"], "v": p["plazas"]} for p in mensual],
                       minimo=0, mensual=True, salto_relativo=1.6)
        serie_temporal(INFORME, "cds.establecimientos_inscritos",
                       [{"t": p["t"], "v": p["establecimientos"]} for p in mensual],
                       minimo=0, mensual=True, salto_relativo=1.6)
    if datos.get("empleo", {}).get("total"):
        serie_temporal(INFORME, "cds.trabajadores_turismo",
                       [{"t": p["t"], "v": p["trabajadores"]} for p in datos["empleo"]["total"]],
                       minimo=0, maximo=20000)

    return {
        **datos,
        "fuente": "Turismo y Planificación Costa del Sol (Diputación de Málaga) · Big Data",
        "url": costadelsol.PORTAL,
        "ambito": "municipal",
        "actualizado": SELLO,
    }


def bloque_vut() -> dict[str, Any]:
    """Censo nominal de viviendas turísticas, para el mapa de la pestaña de VUT.

    Cruza el registro administrativo (RTA) con el rastreo de portales del Big
    Data de Turismo Costa del Sol. Las dos fuentes NO se fusionan en una sola
    capa: miden cosas distintas y se cruzan solo por número de inscripción para
    enriquecer la ficha de cada vivienda.

    Si el Big Data no responde, el bloque sigue publicando el censo del RTA: el
    mapa es lo esencial de la pestaña y no debe caerse por una fuente auxiliar.
    """
    from build_vut import construir
    return construir()


BLOQUES: dict[int, tuple[str, str, Callable[[], Any]]] = {
    1: ("Demografía y renta", "demografia", bloque_demografia),
    2: ("Oferta turística", "oferta", bloque_oferta),
    3: ("Demanda turística", "demanda", bloque_demanda),
    4: ("Mercado de trabajo", "trabajo", bloque_trabajo),
    5: ("Empresas, autónomos y finanzas municipales", "economia", bloque_economia),
    6: ("Clima", "clima", bloque_clima),
    7: ("Conteo de visitantes (Decreto 72/2017)", "visitantes", bloque_visitantes),
    8: ("Big Data de Turismo Costa del Sol", "costadelsol", bloque_costadelsol),
    9: ("Viviendas de uso turístico (censo y mapa)", "vut", bloque_vut),
}


def escribir_meta(parcial: bool) -> None:
    """Publica el estado del pipeline y el informe de validación.

    En una ejecución parcial (``--bloques``) se conserva el estado de los bloques
    que no se han tocado: de lo contrario la interfaz mostraría como inexistentes
    unos datos que sí están publicados, y el informe de validación reflejaría solo
    las series de la última ejecución.
    """
    if parcial:
        for clave, previo in (leer_previo("meta") or {}).get("bloques", {}).items():
            ESTADO.setdefault(clave, previo)
        INFORME.heredar(leer_previo("validacion") or {})

    escribir("meta", {
        "municipio": MUNICIPIO,
        "codigo_ine": COD_INE,
        "provincia": NOMBRE_PROVINCIA,
        "comarca": COMARCA,
        "version": VERSION,
        "generado": SELLO,
        "autoria_tecnica": "Consultoría AMMA",
        "destinatario": "Ayuntamiento de Benahavís",
        "bloques": ESTADO,
    })
    escribir("validacion", {"generado": SELLO, **INFORME.a_dict()})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pipeline del Observatorio de Benahavís")
    parser.add_argument("--bloques", nargs="*", type=int,
                        help="números de bloque a ejecutar (por defecto, todos)")
    parser.add_argument("--listar", action="store_true", help="lista los bloques y sale")
    args = parser.parse_args(argv)

    if args.listar:
        for num, (nombre, clave, _) in BLOQUES.items():
            print(f"  {num}  {nombre:44} → docs/data/{clave}.json")
        return 0

    load_dotenv()
    for ruta in (DATA_RAW, DATA_PROC, DOCS_DATA):
        ruta.mkdir(parents=True, exist_ok=True)
    configurar(LOG)

    log.info("Observatorio de %s (%s) · versión %s", MUNICIPIO, COD_INE, VERSION)
    log.info("Inicio: %s", SELLO)

    seleccion = args.bloques or list(BLOQUES)
    for num in seleccion:
        if num not in BLOQUES:
            log.error("bloque %s desconocido; use --listar", num)
            continue
        nombre, clave, funcion = BLOQUES[num]
        _bloque(nombre, clave, funcion)

    escribir_meta(parcial=bool(args.bloques))

    fallidos = [k for k, v in ESTADO.items() if not v["actualizado"]]
    log.info("")
    log.info("Fin. %d bloque(s) actualizados, %d con incidencia.",
             len(ESTADO) - len(fallidos), len(fallidos))
    if fallidos:
        log.warning("Bloques con incidencia: %s", ", ".join(fallidos))
    log.info("Validación: %d avisos, %d errores sobre %d series.",
             INFORME.a_dict()["avisos"], INFORME.a_dict()["errores"], INFORME.series_revisadas)
    return 0


if __name__ == "__main__":
    sys.exit(main())
