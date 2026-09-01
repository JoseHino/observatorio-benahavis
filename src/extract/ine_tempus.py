# -*- coding: utf-8 -*-
"""Extracción del INE mediante la API Tempus3.

Cubre tres operaciones, todas verificadas contra el endpoint real para Benahavís:

* ``DPOP`` tabla **2882** — Padrón municipal por sexo (Málaga).
* ``ADRH`` tabla **37677** — Índice de Gini y distribución de la renta P80/P20.
* ``VTE`` tablas **39363** y **39366** — Viviendas turísticas y su peso sobre el
  parque residencial.

.. note::
   La **renta media del municipio** ya no sale de aquí. La tabla 30824 (Atlas de
   Distribución de Renta de los Hogares) y la 53689 (mismo Atlas, demarcaciones
   superiores) se retiraron del módulo cuando el observatorio pasó a tomar la renta
   de Datosmacro —renta declarada de IRPF, ver :mod:`src.extract.datosmacro`—. De la
   familia del Atlas siguen usándose las tablas de Gini, fuente de ingresos, umbrales
   de ingreso e indicadores demográficos, que Datosmacro no publica.

.. warning::
   El campo ``Fecha`` que devuelve Tempus3 viene expresado en hora de Madrid. Al
   convertirlo a UTC cae en el mes anterior y toda la serie mensual sale corrida.
   Este módulo **ignora ``Fecha``** y construye el periodo a partir de ``Anyo`` y
   ``FK_Periodo``, que son los campos fiables.
"""
from __future__ import annotations

import re
from typing import Any

from ..contexto import DATA_RAW, INE_TV_MUNICIPIO
from ..utils.http import descargar_json
from ..utils.log import get_logger

log = get_logger("extract.ine")

BASE = "https://servicios.ine.es/wstempus/js/ES"

TABLA_PADRON = "2882"
#: El Atlas publica 54 tablas homónimas de Gini, una por demarcación. Solo la 37677
#: contiene los municipios de Málaga: las contiguas devuelven una respuesta vacía
#: para ``tv=19:2923``, de modo que el identificador no es intercambiable.
TABLA_GINI = "37677"
TABLA_VUT = "39363"
TABLA_VUT_PORCENTAJE = "39366"


def _periodo(dato: dict[str, Any], *, mensual: bool) -> str:
    """Construye la etiqueta de periodo a partir de ``Anyo`` y ``FK_Periodo``.

    No se usa el campo ``Fecha``: viene en hora de Madrid y al pasarlo a UTC
    desplaza la serie un mes hacia atrás, con lo que toda la serie sale corrida.

    ``FK_Periodo`` no significa lo mismo en todas las operaciones: en las series
    anuales del Padrón vale 28 y en las del Atlas de Renta vale 1, mientras que en
    las viviendas turísticas identifica el mes de referencia. Por eso el formato
    se decide con el argumento explícito ``mensual`` y no infiriéndolo del código.
    """
    anyo = dato.get("Anyo")
    if not mensual:
        return str(anyo)
    fk = dato.get("FK_Periodo")
    if not isinstance(fk, int) or not 1 <= fk <= 12:
        return str(anyo)
    return f"{anyo}-{fk:02d}"


def _serie(dato_serie: dict[str, Any], *, mensual: bool = False) -> list[dict[str, Any]]:
    """Convierte el array ``Data`` de una serie Tempus3 en puntos ``{t, v}`` ordenados."""
    puntos = []
    for d in dato_serie.get("Data", []):
        valor = d.get("Valor")
        if valor is None:
            continue
        puntos.append({"t": _periodo(d, mensual=mensual), "v": valor})
    return sorted(puntos, key=lambda p: p["t"])


def _datos_tabla(tabla: str, *, nult: int | None = None, tv: str | None = None) -> list[dict]:
    """Descarga ``DATOS_TABLA`` con filtros opcionales."""
    partes = []
    if nult is not None:
        partes.append(f"nult={nult}")
    if tv is not None:
        partes.append(f"tv={tv}")
    url = f"{BASE}/DATOS_TABLA/{tabla}"
    if partes:
        url += "?" + "&".join(partes)
    return descargar_json(url, dir_raw=DATA_RAW)


def padron(nult: int = 30) -> dict[str, Any]:
    """Población empadronada de Benahavís por sexo, serie anual.

    La tabla 2882 contiene los 103 municipios de Málaga; se filtra por nombre de
    serie porque el identificador de serie (``DPOP13531`` y siguientes) no está
    documentado como estable entre revisiones.

    Returns:
        ``{"total": [...], "hombres": [...], "mujeres": [...]}`` con puntos ``{t, v}``.
    """
    log.info("INE · Padrón municipal (tabla %s)", TABLA_PADRON)
    crudo = _datos_tabla(TABLA_PADRON, nult=nult)
    salida: dict[str, list] = {"total": [], "hombres": [], "mujeres": []}
    for s in crudo:
        nombre = s.get("Nombre", "")
        if "Benahavís" not in nombre:
            continue
        if ". Total." in nombre:
            salida["total"] = _serie(s)
        elif ". Hombres." in nombre:
            salida["hombres"] = _serie(s)
        elif ". Mujeres." in nombre:
            salida["mujeres"] = _serie(s)
    if not salida["total"]:
        raise ValueError("la tabla 2882 no devolvió la serie total de Benahavís")
    log.info("   %d años de padrón (último: %s = %s hab.)",
             len(salida["total"]), salida["total"][-1]["t"], salida["total"][-1]["v"])
    return salida


def desigualdad(nult: int = 12) -> dict[str, list]:
    """Índice de Gini y distribución P80/P20 de Benahavís, serie anual.

    Ambos indicadores describen el **reparto** de la renta, que las medias del
    Atlas no revelan: un municipio con renta media alta puede tener una
    distribución muy desigual. El Gini se publica en escala 0–100 —no 0–1— y el
    P80/P20 es la razón entre la renta del quintil superior y la del inferior.

    Los años sin dato publicado se descartan en :func:`_serie`, de modo que la
    serie devuelta no contiene huecos rellenados.
    """
    log.info("INE · Gini y P80/P20 (tabla %s, tv=%s)", TABLA_GINI, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_GINI, nult=nult, tv=INE_TV_MUNICIPIO)
    salida: dict[str, list] = {}
    for s in crudo:
        nombre = s.get("Nombre", "")
        if "Gini" in nombre:
            salida["gini"] = _serie(s)
        elif "P80/P20" in nombre:
            salida["p80_p20"] = _serie(s)
    if salida.get("gini"):
        ult = salida["gini"][-1]
        log.info("   %d años (último: %s = %s)", len(salida["gini"]), ult["t"], ult["v"])
    else:
        log.warning("   la tabla %s no devolvió el índice de Gini del municipio", TABLA_GINI)
    return salida


def viviendas_turisticas(nult: int = 24) -> dict[str, Any]:
    """Viviendas turísticas anunciadas en plataformas, estadística experimental del INE.

    .. important::
       Esta fuente mide **oferta anunciada en plataformas de intermediación**. NO es
       comparable con el Registro de Turismo de Andalucía, que mide **oferta inscrita
       administrativamente**. Los dos indicadores van en gráficos separados.
    """
    log.info("INE · Viviendas turísticas (tablas %s y %s)", TABLA_VUT, TABLA_VUT_PORCENTAJE)
    salida: dict[str, Any] = {}

    # Sin el filtro `tv` estas tablas devuelven las 24.621 series de toda España y
    # la petición tarda más de dos minutos; con él, tres series y dos segundos.
    crudo = _datos_tabla(TABLA_VUT, nult=nult, tv=INE_TV_MUNICIPIO)
    for s in crudo:
        nombre = s.get("Nombre", "")
        if not nombre.startswith("Benahavís."):
            continue
        if "Viviendas turísticas" in nombre:
            salida["viviendas"] = _serie(s, mensual=True)
        elif "Plazas por vivienda" in nombre:
            salida["plazas_por_vivienda"] = _serie(s, mensual=True)
        elif "Plazas" in nombre:
            salida["plazas"] = _serie(s, mensual=True)

    try:
        crudo_pct = _datos_tabla(TABLA_VUT_PORCENTAJE, nult=nult, tv=INE_TV_MUNICIPIO)
        for s in crudo_pct:
            if s.get("Nombre", "").startswith("Benahavís."):
                salida["porcentaje_sobre_censadas"] = _serie(s, mensual=True)
                break
    except Exception as exc:  # noqa: BLE001 — tabla secundaria; no debe tumbar el bloque
        log.warning("   tabla %s no disponible: %s", TABLA_VUT_PORCENTAJE, exc)

    if "viviendas" in salida and salida["viviendas"]:
        ult = salida["viviendas"][-1]
        log.info("   último periodo %s: %s viviendas", ult["t"], ult["v"])
    return salida


# --------------------------------------------------------------------- Padrón
#: Padrón continuo: población por sexo, municipio y nacionalidad española/extranjera.
TABLA_NACIONALIDAD = "33571"
#: Padrón continuo: población por sexo, municipio y principales nacionalidades.
TABLA_PAISES = "33572"
#: DIRCE: empresas por municipio y grupo de actividad.
TABLA_EMPRESAS = "4721"

#: Etiquetas de la tabla 33572 que NO son un país sino un agregado. Si se cuelan,
#: encabezan cualquier reparto: «Europa (sin España)» vale por sí sola cuatro
#: quintos del total y dejaría el resto de la tarta en una rendija.
AGREGADOS_NACIONALIDAD = {
    "Total", "Española", "Extranjera",
    "Europa (sin España)", "País de la UE28 sin España", "País de la UE27_2020 sin España",
    "País de Europa menos UE28", "País de Europa menos UE27_2020",
    "De Africa", "De África", "De América", "De Asia",
}


def _sexo_de(nombre: str) -> str | None:
    """Primer campo de la serie: ``Total``, ``Hombres`` o ``Mujeres``."""
    cabeza = nombre.split(".")[0].strip()
    return {"Total": "total", "Hombres": "hombres", "Mujeres": "mujeres"}.get(cabeza)


def padron_nacionalidad(nult: int = 25) -> dict[str, Any]:
    """Población empadronada por sexo y nacionalidad (española/extranjera).

    .. important::
       Esta explotación del Padrón Continuo dejó de publicarse **después de 2022**:
       el INE ya no baja la nacionalidad al municipio (la Estadística Continua de
       Población solo la publica para los 83 municipios mayores). La serie termina
       ahí a propósito y no se prolonga con estimaciones.

    Returns:
        ``{"total": {...}, "espanola": {...}, "extranjera": {...}}``, cada uno con
        ``total``/``hombres``/``mujeres`` como listas de puntos ``{t, v}``.
    """
    log.info("INE · Padrón por nacionalidad (tabla %s, tv=%s)", TABLA_NACIONALIDAD, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_NACIONALIDAD, nult=nult, tv=INE_TV_MUNICIPIO)
    salida: dict[str, dict[str, list]] = {
        clave: {"total": [], "hombres": [], "mujeres": []}
        for clave in ("total", "espanola", "extranjera")
    }
    for s in crudo:
        nombre = s.get("Nombre", "")
        if "Todas las edades" not in nombre:
            continue
        sexo = _sexo_de(nombre)
        if sexo is None:
            continue
        if ". Española." in nombre:
            clave = "espanola"
        elif ". Extranjera." in nombre:
            clave = "extranjera"
        elif ". Dato base. Todas las edades." in nombre:
            clave = "total"
        else:
            continue
        salida[clave][sexo] = _serie(s)
    if not salida["extranjera"]["total"]:
        raise ValueError(f"la tabla {TABLA_NACIONALIDAD} no devolvió la serie de extranjeros")
    ult = salida["extranjera"]["total"][-1]
    log.info("   %s: %s extranjeros", ult["t"], ult["v"])
    return salida


def nacionalidades(nult: int = 25) -> dict[str, Any]:
    """Población extranjera por país de nacionalidad y año.

    El reparto se cierra siempre contra el total de extranjeros de la propia
    tabla: la diferencia entre ese total y la suma de los países publicados se
    devuelve como ``Resto de países``, de modo que el porcentaje de cada país es
    el real sobre toda la población extranjera y no sobre la parte listada.
    """
    log.info("INE · Padrón por país de nacionalidad (tabla %s, tv=%s)", TABLA_PAISES, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_PAISES, nult=nult, tv=INE_TV_MUNICIPIO)

    paises: dict[str, dict[str, float]] = {}
    extranjeros: dict[str, float] = {}
    for s in crudo:
        nombre = s.get("Nombre", "")
        if _sexo_de(nombre) != "total":
            continue
        partes = [p.strip() for p in nombre.split(".") if p.strip()]
        # "Total. Benahavís. Reino Unido. Dato base." → la etiqueta va en tercer lugar
        if len(partes) < 3:
            continue
        etiqueta = partes[2]
        puntos = {p["t"]: p["v"] for p in _serie(s)}
        if etiqueta == "Extranjera":
            extranjeros = puntos
        elif etiqueta not in AGREGADOS_NACIONALIDAD:
            paises[etiqueta] = puntos

    anyos = sorted(extranjeros)
    por_anyo: dict[str, list[dict[str, Any]]] = {}
    for anyo in anyos:
        filas = [{"pais": p, "v": v[anyo]} for p, v in paises.items() if v.get(anyo)]
        filas.sort(key=lambda f: -f["v"])
        resto = extranjeros[anyo] - sum(f["v"] for f in filas)
        if resto > 0:
            filas.append({"pais": "Resto de países", "v": resto})
        por_anyo[anyo] = filas

    log.info("   %d años (%s–%s), %d países con dato", len(anyos),
             anyos[0] if anyos else "?", anyos[-1] if anyos else "?", len(paises))
    return {
        "anyos": anyos,
        "por_anyo": por_anyo,
        "total_extranjeros": [{"t": a, "v": extranjeros[a]} for a in anyos],
    }


def empresas(nult: int = 15) -> dict[str, Any]:
    """Empresas con actividad económica en el municipio, por grupo de actividad.

    Fuente: explotación estadística del Directorio Central de Empresas (DIRCE).
    Cuenta empresas con **domicilio social** en el municipio a 1 de enero; en
    Benahavís, con mucha sociedad patrimonial e inmobiliaria domiciliada, no
    equivale al número de establecimientos abiertos al público.
    """
    log.info("INE · DIRCE, empresas por municipio (tabla %s, tv=%s)", TABLA_EMPRESAS, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_EMPRESAS, nult=nult, tv=INE_TV_MUNICIPIO)
    total: list[dict[str, Any]] = []
    por_sector: dict[str, list[dict[str, Any]]] = {}
    for s in crudo:
        nombre = s.get("Nombre", "")
        partes = [p.strip() for p in nombre.split(".") if p.strip()]
        if len(partes) < 2:
            continue
        sector = partes[1]
        if sector == "Total CNAE":
            total = _serie(s)
        else:
            por_sector[sector] = _serie(s)
    if not total:
        raise ValueError(f"la tabla {TABLA_EMPRESAS} no devolvió el total de empresas")
    log.info("   %s: %s empresas", total[-1]["t"], total[-1]["v"])
    return {"total": total, "por_sector": por_sector}


# ------------------------------------------------------- Atlas: más indicadores
#: ADRH, «Indicadores demográficos». Es la **segunda** de las 54 tablas homónimas,
#: igual que la 30824 lo es en la familia de renta; las otras 53 devuelven vacío
#: para ``tv=19:2923``. Interesa porque llega un año más lejos que el Padrón por
#: nacionalidad, que el INE dejó de publicar por municipio después de 2022.
TABLA_ATLAS_DEMOGRAFIA = "30832"
#: ADRH, «Distribución por fuente de ingresos»: de dónde sale la renta del hogar.
TABLA_ATLAS_INGRESOS = "30825"
#: ADRH, población por debajo de umbrales absolutos de ingreso por unidad de consumo.
TABLA_ATLAS_POBREZA = "30826"
#: EMCR, «Saldos por municipio, año, sexo y tipo de saldo». Es el dato municipal
#: más reciente del bloque demográfico: adelanta un año al Atlas y dos al Padrón.
TABLA_SALDO_MIGRATORIO = "69767"
#: Padrón continuo: población por sexo, municipio y edad en grupos quinquenales.
TABLA_PADRON_EDAD = "33570"
#: Padrón continuo: población por sexo, municipio y lugar de nacimiento.
TABLA_PADRON_NACIMIENTO = "33574"


def _por_etiqueta(crudo: list[dict], etiquetas: dict[str, str], *,
                  posicion: int | None = None) -> dict[str, list]:
    """Reparte las series de una tabla en claves propias según su rótulo.

    Args:
        etiquetas: rótulo del INE → clave de salida.
        posicion: si se indica, el rótulo se compara con ese campo del nombre
            —los que separa el INE con puntos— en lugar de buscarse por
            contención. Hace falta cuando un mismo rótulo se repite en series de
            distinto corte: «Saldo total» aparece igual en la de ambos sexos que
            en la de hombres.
    """
    salida: dict[str, list] = {}
    for s in crudo:
        nombre = s.get("Nombre", "")
        partes = [p.strip() for p in nombre.split(".") if p.strip()]
        for etiqueta, clave in etiquetas.items():
            casa = (partes[posicion] == etiqueta
                    if posicion is not None and len(partes) > posicion
                    else etiqueta in nombre)
            if casa and clave not in salida:
                salida[clave] = _serie(s)
                break
    return salida


def atlas_demografia(nult: int = 15) -> dict[str, Any]:
    """Indicadores demográficos del Atlas de Distribución de Renta de los Hogares.

    Cubre en parte el hueco que dejó el Padrón: la nacionalidad municipal se dejó
    de publicar en 2022, pero el Atlas sigue dando el **porcentaje de población
    española** un año más allá. No son la misma operación y no se funden en una
    sola serie: se publican por separado y se dice de dónde viene cada tramo.
    """
    log.info("INE · Atlas, indicadores demográficos (tabla %s, tv=%s)",
             TABLA_ATLAS_DEMOGRAFIA, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_ATLAS_DEMOGRAFIA, nult=nult, tv=INE_TV_MUNICIPIO)
    salida = _por_etiqueta(crudo, {
        "Edad media de la población": "edad_media",
        "Porcentaje de población menor de 18 años": "pct_menores_18",
        "Porcentaje de población de 65 y más años": "pct_65_y_mas",
        "Tamaño medio del hogar": "tamanyo_hogar",
        "Porcentaje de hogares unipersonales": "pct_hogares_unipersonales",
        "Porcentaje de población española": "pct_espanola",
    })
    if not salida.get("edad_media"):
        raise ValueError(f"la tabla {TABLA_ATLAS_DEMOGRAFIA} no devolvió la edad media")
    log.info("   %s: edad media %s años", salida["edad_media"][-1]["t"],
             salida["edad_media"][-1]["v"])
    return salida


def atlas_fuente_ingresos(nult: int = 15) -> dict[str, Any]:
    """Reparto de la renta del hogar según de dónde procede el ingreso.

    Los cinco conceptos suman 100 y salen de la misma operación que la renta
    municipal, de modo que se leen contra ella sin cambiar de fuente.
    """
    log.info("INE · Atlas, fuente de ingresos (tabla %s, tv=%s)",
             TABLA_ATLAS_INGRESOS, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_ATLAS_INGRESOS, nult=nult, tv=INE_TV_MUNICIPIO)
    salida = _por_etiqueta(crudo, {
        "Fuente de ingreso: salario": "salario",
        "Fuente de ingreso: pensiones": "pensiones",
        "Fuente de ingreso: prestaciones por desempleo": "desempleo",
        "Fuente de ingreso: otras prestaciones": "otras_prestaciones",
        "Fuente de ingreso: otros ingresos": "otros_ingresos",
    })
    if not salida.get("salario"):
        raise ValueError(f"la tabla {TABLA_ATLAS_INGRESOS} no devolvió el peso del salario")
    return salida


def atlas_pobreza(nult: int = 15) -> dict[str, Any]:
    """Porcentaje de población por debajo de umbrales absolutos de ingreso.

    Son umbrales en euros por unidad de consumo, no la tasa AROPE: no dependen de
    la mediana del propio municipio, así que se pueden comparar entre municipios.
    Se publican también por sexo; aquí se toma el total.
    """
    log.info("INE · Atlas, umbrales de ingreso (tabla %s, tv=%s)",
             TABLA_ATLAS_POBREZA, INE_TV_MUNICIPIO)
    crudo = [s for s in _datos_tabla(TABLA_ATLAS_POBREZA, nult=nult, tv=INE_TV_MUNICIPIO)
             if ". Total." in s.get("Nombre", "")]
    return _por_etiqueta(crudo, {
        "por debajo de 5.000 Euros": "bajo_5000",
        "por debajo de 7.500 Euros": "bajo_7500",
        "por debajo de 10.000 Euros": "bajo_10000",
    })


def saldo_migratorio(nult: int = 15) -> dict[str, Any]:
    """Saldo migratorio anual del municipio: total, con el extranjero y con España.

    El crecimiento de Benahavís no lo explican los nacimientos, así que este es el
    indicador que dice de dónde sale. El tipo de saldo se compara por **posición**
    en el nombre de la serie —``Benahavís. Ambos sexos. Saldo exterior.``— porque
    buscar «Saldo total» por contención casaría igual con las series de hombres y
    de mujeres, que llevan ese mismo rótulo.
    """
    log.info("INE · Saldos migratorios por municipio (tabla %s, tv=%s)",
             TABLA_SALDO_MIGRATORIO, INE_TV_MUNICIPIO)
    crudo = [s for s in _datos_tabla(TABLA_SALDO_MIGRATORIO, nult=nult, tv=INE_TV_MUNICIPIO)
             if s.get("Nombre", "").split(".")[1].strip() == "Ambos sexos"]
    salida = _por_etiqueta(crudo, {
        "Saldo total": "total",
        "Saldo exterior": "exterior",
        "Saldo interior": "interior",
    }, posicion=2)
    if not salida.get("total"):
        raise ValueError(f"la tabla {TABLA_SALDO_MIGRATORIO} no devolvió el saldo total")
    log.info("   %s: saldo total %s", salida["total"][-1]["t"], salida["total"][-1]["v"])
    return salida


def _edad_inicial(etiqueta: str) -> int:
    """Edad con la que empieza un grupo quinquenal, para poder ordenarlos.

    Sin esto los grupos se ordenan como texto y «De 5 a 9 años» cae detrás de
    «De 45 a 49 años», con lo que la pirámide sale barajada.
    """
    m = re.search(r"(\d+)", etiqueta)
    return int(m.group(1)) if m else 999


def padron_edad(nult: int = 25) -> dict[str, Any]:
    """Población empadronada por grupo quinquenal de edad y sexo.

    .. important::
       Igual que la nacionalidad, esta explotación del Padrón Continuo **termina
       en 2022**: el INE dejó de bajar la estructura por edad al municipio. La
       serie no se prolonga con estimaciones.

    Returns:
        ``{"grupos": [...], "anyos": [...], "por_anyo": {anyo: [{grupo, hombres,
        mujeres}]}}``, en la forma que pide una pirámide de población.
    """
    log.info("INE · Padrón por edad (tabla %s, tv=%s)", TABLA_PADRON_EDAD, INE_TV_MUNICIPIO)
    crudo = _datos_tabla(TABLA_PADRON_EDAD, nult=nult, tv=INE_TV_MUNICIPIO)
    datos: dict[str, dict[str, dict[str, float]]] = {}
    grupos: list[str] = []
    for s in crudo:
        nombre = s.get("Nombre", "")
        sexo = _sexo_de(nombre)
        if sexo in (None, "total"):
            continue
        partes = [p.strip() for p in nombre.split(".") if p.strip()]
        # "Hombres. Benahavís. Dato base. De 30 a 34 años. Total." → el grupo va cuarto
        if len(partes) < 4:
            continue
        grupo = partes[3]
        if grupo == "Todas las edades":
            continue
        if grupo not in grupos:
            grupos.append(grupo)
        for punto in _serie(s):
            datos.setdefault(punto["t"], {}).setdefault(grupo, {})[sexo] = punto["v"]
    if not datos:
        raise ValueError(f"la tabla {TABLA_PADRON_EDAD} no devolvió población por edad")
    grupos.sort(key=_edad_inicial)
    anyos = sorted(datos)
    log.info("   %d grupos de edad · %s–%s", len(grupos), anyos[0], anyos[-1])
    return {
        "grupos": grupos,
        "anyos": anyos,
        "por_anyo": {
            a: [{"grupo": g,
                 "hombres": datos[a].get(g, {}).get("hombres"),
                 "mujeres": datos[a].get(g, {}).get("mujeres")}
                for g in grupos]
            for a in anyos
        },
    }


def padron_nacimiento(nult: int = 25) -> dict[str, Any]:
    """Población empadronada según dónde nació.

    En Benahavís es de los indicadores que más dicen: casi dos tercios de los
    empadronados nacieron fuera de España. Solo se toman las categorías que **no
    se solapan** entre sí: el INE publica además los subtotales anidados de
    «misma provincia» y «mismo municipio», y sumarlos con el resto daría el doble
    de población de la que hay.
    """
    log.info("INE · Padrón por lugar de nacimiento (tabla %s, tv=%s)",
             TABLA_PADRON_NACIMIENTO, INE_TV_MUNICIPIO)
    crudo = [s for s in _datos_tabla(TABLA_PADRON_NACIMIENTO, nult=nult, tv=INE_TV_MUNICIPIO)
             if _sexo_de(s.get("Nombre", "")) == "total"]
    salida = _por_etiqueta(crudo, {
        "Misma Comunidad Autónoma. Misma Provincia. Mismo Municipio.": "mismo_municipio",
        "Misma Comunidad Autónoma. Misma Provincia. Distinto Municipio.": "misma_provincia",
        "Misma Comunidad Autónoma. Distinta Provincia.": "otra_provincia",
        "En distinta Comunidad Autónoma": "otra_comunidad",
        "En el extranjero": "extranjero",
    })
    salida.update(_por_etiqueta(crudo, {"Total": "total"}, posicion=2))
    if not salida.get("extranjero"):
        raise ValueError(f"la tabla {TABLA_PADRON_NACIMIENTO} no devolvió los nacidos fuera")
    return salida
