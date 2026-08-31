# -*- coding: utf-8 -*-
"""Extracción del SIMA del IECA: ficha municipal de «Andalucía pueblo a pueblo».

El INE dejó de publicar la nacionalidad a escala municipal después de 2022 —la
Estadística Continua de Población solo la baja a los 83 municipios mayores—, de
modo que la única cifra reciente de población extranjera de Benahavís es la que
el IECA publica en su ficha municipal a partir de su propia explotación del
Padrón.

.. warning::
   La ficha del SIMA **no es la cifra oficial del INE**: es una explotación
   distinta del padrón y su población total no coincide con la del Real Decreto
   de cifras oficiales. Por eso el porcentaje de extranjeros se calcula siempre
   contra la población de la propia ficha, y el dato se publica etiquetado como
   IECA, nunca fundido con la serie del INE.

El fichero es un ``.xls`` binario (Excel 97) con **una fila por municipio
andaluz** y una columna por variable, con el año pegado al nombre de la columna
(«Número de extranjeros. 2025»): el año hay que leerlo de la cabecera, no darlo
por supuesto.
"""
from __future__ import annotations

import io
import re
from typing import Any

import xlrd

from ..contexto import COD_INE, DATA_RAW
from ..utils.http import descargar
from ..utils.log import get_logger

log = get_logger("extract.sima")

URL = ("https://www.juntadeandalucia.es/institutodeestadisticaycartografia"
       "/sima/datos/smex99.xls")

FILA_CABECERA = 10
COL_COD_MUNICIPIO = 1

#: Columnas que interesan, por el texto que precede al año en la cabecera.
VARIABLES = {
    "Población total": "poblacion",
    "Número de extranjeros": "extranjeros",
    "Principal procedencia de los extranjeros residentes": "principal_procedencia",
    "Porcentaje que representa respecto total de extranjeros": "peso_principal_procedencia",
}

#: El resto de la ficha, que viaja en el **mismo fichero** que ya se descarga.
#: Son 124 columnas de las que el observatorio usaba cuatro; estas son las que
#: dicen algo de la presión turística sobre el municipio y no las publica ninguna
#: otra fuente de las inventariadas a escala municipal.
#:
#: Cada entrada es ``clave -> (texto de cabecera, tipo)``. El tipo decide cómo se
#: lee la celda, porque el fichero mezcla números, textos y marcas de secreto.
FICHA = {
    # Territorio: sin la superficie no se puede calcular ninguna densidad
    "superficie_km2": ("Extensión superficial (Km2)", "num"),
    "nucleos": ("Número de núcleos que componen el municipio", "num"),
    "poblacion_nucleos": ("Población en núcleos", "num"),
    "poblacion_diseminados": ("Población en diseminados", "num"),
    "variacion_10_anyos": ("Variación relativa de la población en diez años (%)", "num"),
    # Movimiento natural y flujos migratorios: el INE publica el saldo, el IECA
    # las dos patas por separado, que es lo que explica de dónde sale
    "nacimientos": ("Nacimientos", "num"),
    "defunciones": ("Defunciones", "num"),
    "matrimonios": ("Matrimonios", "num"),
    "inmigraciones": ("Inmigraciones", "num"),
    "emigraciones": ("Emigraciones", "num"),
    # Vivienda: el denominador que le faltaba al censo de viviendas turísticas
    "viviendas_principales": ("Viviendas familiares principales", "num"),
    "transacciones_nueva": ("Transacciones inmobiliarias. Vivienda nueva", "num"),
    "transacciones_usada": ("Transacciones inmobiliarias. Vivienda segunda mano", "num"),
    "ibi_urbana_recibos": ("IBI de naturaleza urbana. Número de recibos", "num"),
    "parcelas_edificadas": ("Número de parcelas catastrales: Parcelas edificadas", "num"),
    "solares": ("Número de parcelas catastrales: Solares", "num"),
    # Consumo eléctrico: el mejor proxy de presión que hay publicado. El de agua
    # exige convenio con Acosol; este sale de la ficha sin pedir nada
    "energia_total_mwh": ("Consumo de energía eléctrica (MWh)", "num"),
    "energia_residencial_mwh": ("Consumo de energía eléctrica residencial (MWh)", "num"),
    # Tejido empresarial por tamaño, que el DIRCE no desglosa por municipio
    "establecimientos": ("Total establecimientos", "num"),
    "est_sin_asalariados": ("Sin asalariados", "num"),
    "est_hasta_5": ("Hasta 5 asalariados", "num"),
    "est_6_a_19": ("Entre 6 y 19 asalariados", "num"),
    "est_20_y_mas": ("De 20 y más asalariados", "num"),
    "actividad_1": ("Actividad 1", "txt"),
    "actividad_2": ("Actividad 2", "txt"),
    "actividad_3": ("Actividad 3", "txt"),
    # Alojamiento reglado: viene censurado, y esa censura es en sí el dato
    "hoteles": ("Hoteles", "censurable"),
    "plazas_hoteles": ("Plazas en hoteles", "censurable"),
    # Presupuesto municipal: sostiene el argumento de servicio a población flotante
    "presupuesto_ingresos": ("Presupuesto liquidado de ingresos (euros)", "num"),
    "presupuesto_gastos": ("Presupuesto liquidado de gastos (euros)", "num"),
    "ingresos_por_habitante": ("Ingresos por habitante (euros)", "num"),
    "gastos_por_habitante": ("Gastos por habitante (euros)", "num"),
    # Renta de la AEAT: NO es la del Atlas del INE y no se mezcla con ella
    "declaraciones_irpf": ("Número de declaraciones", "num"),
    "renta_bruta_aeat": ("Renta bruta media", "num"),
    "renta_disponible_aeat": ("Renta disponible media", "num"),
    # Otros
    "tasa_paro": ("Tasa municipal de desempleo (%)", "num"),
    "turismos": ("Parque de vehículos. Turismos", "num"),
}

#: Marcas con las que el IECA señala que no hay dato. ``*`` es **secreto
#: estadístico** —hay establecimientos pero son tan pocos que identificarían al
#: titular— y ``-`` es **cero o no procede**. No significan lo mismo y ninguna
#: de las dos es un número: tratarlas como 0 diría que en Benahavís no hay
#: hoteles, cuando lo que dice la fuente es que no puede decir cuántos.
CENSURA = {"*": "secreto_estadistico", "-": "sin_dato"}


def _anyo(cabecera: str) -> str | None:
    encontrado = re.search(r"(\d{4})\s*$", cabecera.strip())
    return encontrado.group(1) if encontrado else None


_CACHE: tuple[Any, int, list[str]] | None = None


def _hoja() -> tuple[Any, int, list[str]]:
    """Hoja del SIMA, fila de Benahavís y cabeceras, descargando una sola vez.

    La ficha es un único fichero de 796 municipios y 124 columnas: bajarlo dos
    veces en la misma ejecución para leer dos grupos de variables sería tirar
    varios megas por nada.
    """
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    log.info("IECA/SIMA · ficha municipal (%s)", URL.rsplit("/", 1)[-1])
    contenido = descargar(URL, dir_raw=DATA_RAW, sufijo=".xls", timeout=300, guardar=False)
    hoja = xlrd.open_workbook(file_contents=contenido).sheet_by_index(0)
    cabeceras = [str(hoja.cell_value(FILA_CABECERA, c)) for c in range(hoja.ncols)]
    fila = None
    for r in range(FILA_CABECERA + 1, hoja.nrows):
        if str(hoja.cell_value(r, COL_COD_MUNICIPIO)).strip() == COD_INE:
            fila = r
            break
    if fila is None:
        raise ValueError(f"la ficha del SIMA no contiene el municipio {COD_INE}")
    _CACHE = (hoja, fila, cabeceras)
    return _CACHE


def ficha_completa() -> dict[str, Any]:
    """El resto de la ficha municipal del IECA, indicador a indicador.

    Cada uno viene con **su propio año**, que va pegado al nombre de la columna:
    la ficha mezcla el padrón de 2025 con el censo de viviendas de 2021 y la
    superficie de 2019, así que no hay un «año de la ficha» y publicarlos todos
    bajo una misma etiqueta temporal sería falso. Por eso cada indicador se
    devuelve como ``{"v": valor, "anyo": "AAAA"}``.

    Los valores censurados no se convierten en cero: ``*`` significa que el dato
    existe pero identificaría al titular, y ``-`` que es cero o no procede.
    """
    hoja, fila, cabeceras = _hoja()
    salida: dict[str, Any] = {}
    for clave, (etiqueta, tipo) in FICHA.items():
        indice = next((i for i, c in enumerate(cabeceras) if c.strip().startswith(etiqueta)), None)
        if indice is None:
            log.warning("   la ficha no trae la columna «%s»", etiqueta)
            continue
        bruto = hoja.cell_value(fila, indice)
        texto = str(bruto).strip()
        entrada: dict[str, Any] = {"anyo": _anyo(cabeceras[indice]), "etiqueta": etiqueta}
        if texto in CENSURA:
            entrada["v"] = None
            entrada["censura"] = CENSURA[texto]
        elif tipo == "txt":
            entrada["v"] = texto or None
        else:
            try:
                entrada["v"] = float(bruto)
            except (TypeError, ValueError):
                entrada["v"] = None
        salida[clave] = entrada

    log.info("   %d indicadores leídos de la ficha (%d censurados)", len(salida),
             sum(1 for v in salida.values() if v.get("censura")))
    return salida


def poblacion_extranjera() -> dict[str, Any]:
    """Población extranjera del municipio según la ficha municipal del IECA.

    Returns:
        ``{"anyo", "poblacion", "extranjeros", "porcentaje", "principal_procedencia",
        "peso_principal_procedencia"}``. El porcentaje se calcula con la población
        de la propia ficha para que numerador y denominador sean de la misma fuente.
    """
    hoja, fila, cabeceras = _hoja()
    columnas: dict[str, int] = {}
    anyos: list[str] = []
    for indice, cabecera in enumerate(cabeceras):
        for etiqueta, clave in VARIABLES.items():
            if cabecera.startswith(etiqueta) and clave not in columnas:
                columnas[clave] = indice
                if (a := _anyo(cabecera)):
                    anyos.append(a)

    def valor(clave: str) -> Any:
        indice = columnas.get(clave)
        if indice is None:
            return None
        v = hoja.cell_value(fila, indice)
        return v if v != "" else None

    poblacion = valor("poblacion")
    extranjeros = valor("extranjeros")
    salida = {
        "anyo": max(anyos) if anyos else None,
        "poblacion": int(poblacion) if poblacion else None,
        "extranjeros": int(extranjeros) if extranjeros else None,
        "porcentaje": round(extranjeros / poblacion * 100, 1) if poblacion and extranjeros else None,
        "principal_procedencia": valor("principal_procedencia"),
        "peso_principal_procedencia": valor("peso_principal_procedencia"),
        "fuente": "IECA · SIMA, ficha municipal (explotación propia del Padrón)",
        "advertencia": ("Explotación del IECA, distinta de las cifras oficiales del INE: "
                        "su población total no coincide con la del padrón oficial y las dos "
                        "cifras no deben mezclarse en una misma serie."),
    }
    log.info("   %s: %s extranjeros de %s habitantes (%s %%), principal origen %s",
             salida["anyo"], salida["extranjeros"], salida["poblacion"],
             salida["porcentaje"], salida["principal_procedencia"])
    return salida
