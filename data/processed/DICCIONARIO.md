# Diccionario de variables — data/processed

Cada fichero JSON de `data/processed/` acompaña al bloque del mismo nombre en
`docs/data/`. El contenido es idéntico: se duplica para que el frontend no dependa de
rutas fuera de `docs/`, que es la raíz que sirve GitHub Pages.

## Convenciones comunes

| Clave | Tipo | Significado |
|---|---|---|
| `t` | texto | Periodo. `AAAA` en series anuales, `AAAA-MM` en mensuales |
| `v` | número | Valor del indicador en ese periodo |
| `ambito` | texto | `municipal`, `comarcal`, `provincial` o `zona_turistica` |
| `es_proxy` | booleano | `true` si el indicador no describe al municipio |
| `actualizado` | texto | Marca temporal UTC de la ejecución que lo generó |
| `fuente` | texto | Organismo y operación estadística de origen |

## Valores censurados

Los agregados afectados por el enmascaramiento `<5` no se publican como número, sino
como objeto:

| Clave | Tipo | Significado |
|---|---|---|
| `min` | entero | Suma de las celdas con valor observable |
| `max` | entero | `min` + 4 x número de celdas censuradas |
| `exacto` | booleano | `true` si ninguna celda estaba censurada |
| `celdas_censuradas` | entero | Número de celdas enmascaradas como `<5` |
| `celdas_vacias` | entero | Número de celdas sin dato |

Un `<5` nunca se convierte en 0 ni en 2,5. El valor real está en `[min, max]`.

## Ficheros

| Fichero | Bloque | Claves principales |
|---|---|---|
| `demografia.json` | 1 | `padron.{total,hombres,mujeres}`, `renta.*`, `poblacion_actual` |
| `oferta.json` | 2 | `rta.{por_tipo,plazas_alojamiento,puntos,acumulado_altas}`, `ine_experimental.*` |
| `demanda.json` | 3 | `receptor.{serie,top_paises_12m,por_pais}`, `interno.{serie,top_origenes}` |
| `trabajo.json` | 4 | `paro.{serie,comparativa}`, `contratos.serie`, `afiliacion.*`, `paro_anual_ieca` |
| `economia.json` | 5 | `deuda_viva.serie`, `pendientes` |
| `clima.json` | 6 | `temperatura_mensual`, `precipitacion_mensual`, `normales`, `extremos`, `estacion` |
| `visitantes.json` | 7 | `estado`, `serie_mensual`, `por_recurso` |
| `meta.json` | — | Estado de cada bloque en la última ejecución |
| `validacion.json` | — | Incidencias detectadas por la validación automática |

## Geometría

Los puntos de `oferta.json` (`rta.puntos`) llevan `lat` y `lon` en **EPSG:4326**,
transformados desde el **EPSG:25830** en que los publica el Registro de Turismo de
Andalucía. Los registros con coordenada ausente o situada fuera del entorno del
municipio se excluyen del mapa y se contabilizan en
`alojamientos_sin_coordenadas` y `alojamientos_coordenada_erronea`. Ninguna
coordenada se corrige ni se estima.
