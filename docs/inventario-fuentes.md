# Inventario de fuentes — Observatorio Turístico y Socioeconómico de Benahavís

**Municipio:** Benahavís (Málaga) · **Código INE:** 29023 · **Provincia:** 29 · **Comarca:** Costa del Sol Occidental
**Fecha de verificación de endpoints:** 17 de agosto de 2026 · fuentes 1.5, 3.3, 3.4 y 3.4b,
el 18 de agosto de 2026 · bloque 9 completo, el 20 de agosto de 2026
**Autoría técnica:** Consultoría AMMA · **Destinatario:** Ayuntamiento de Benahavís

---

## 0. Método de verificación

Toda fuente listada en este inventario ha sido consultada de forma efectiva contra su endpoint
real en la fecha indicada. No se incluye ninguna fuente por referencia bibliográfica ni por
suposición sobre su estructura. Para cada una se registra:

- la **URL exacta** que devuelve el dato,
- el **dato concreto obtenido para Benahavís** como prueba de que la fuente resuelve a nivel municipal,
- la **limitación conocida**, cuando existe.

Las fuentes cuyo endpoint no ha podido verificarse quedan marcadas como `PENDIENTE` o
`REQUIERE SOLICITUD FORMAL`, y **no se integran en el pipeline automático**.

Códigos de identificación del municipio en las distintas plataformas (todos verificados):

| Plataforma | Identificador de Benahavís |
|---|---|
| INE (código municipal) | `29023` |
| INE Tempus3 (variable 19, unidades territoriales) | `Id = 2923` |
| INE Tempus3 (distrito / secciones censales) | `2902301` · `2902301001`, `2902301002` |
| IECA / BADEA (nodo de jerarquía territorial) | `2934` (padre `3023` = Málaga) |
| OpenRTA (Junta de Andalucía) | `municipality=BENAHAVIS`, `province=MÁLAGA` |
| Seguridad Social (fichero MUNCNAE) | `COD MUNICIPIO = 29023` |
| Catastro (OVC) | provincia `29`, municipio `23` |

---

## 1. Corrección relevante a la hipótesis de partida del encargo

El encargo parte de que **no existe ninguna serie de demanda turística a nivel municipal para
Benahavís**. La verificación confirma esa premisa **para la estadística de ocupación en
alojamientos reglados**, pero la desmiente para el conjunto del bloque de demanda. Conviene
dejarlo fijado antes de diseñar los indicadores:

### 1.1 Lo que se confirma

La ficha municipal SIMA del IECA para Benahavís (`ficha.htm?mun=29023`) devuelve, en el
apartado de turismo del año 2024:

| Indicador | Valor publicado |
|---|---|
| Hoteles. 2024 | `*` |
| Plazas en hoteles. 2024 | `*` |
| Hostales y pensiones. 2024 | `-` |
| Plazas en hostales y pensiones. 2024 | `-` |

con la nota literal: *«Dato no significativo, al disponer el municipio de menos de 5
establecimientos turísticos»*.

En consecuencia: **no existe serie municipal de pernoctaciones, grado de ocupación ni estancia
media** procedente de la Encuesta de Ocupación Hotelera. La EOH se publica por zonas y puntos
turísticos, y Benahavís no constituye punto turístico propio.

### 1.2 Lo que NO se confirma — existe demanda municipal por otra vía

La estadística experimental del INE de **medición del turismo a partir de la posición de los
teléfonos móviles** sí resuelve a nivel de municipio de destino, y Benahavís aparece en ella.
Redistribuida por Dataestur (SEGITTUR) en formato descargable, arroja para Benahavís:

> **Julio de 2025: 11.421 turistas extranjeros**, desagregados por país de origen
> (Reino Unido 2.918 · Países Bajos 994 · Bélgica 992 · Suecia 726 · Francia 714 ·
> Estados Unidos 391 · Emiratos Árabes Unidos 137 · Arabia Saudí 115 · Kuwait 101 …).
> Serie mensual disponible desde julio de 2019.

Existe además la matriz de **turismo interno municipio-origen → municipio-destino**, con 222
registros que implican a Benahavís solo en 2025.

Esto **no sustituye** a la EOH ni mide lo mismo: se trata de una operación experimental basada
en posicionamiento de telefonía móvil, con su propia definición de turista y sus propios
márgenes. Pero permite que el bloque de demanda del observatorio contenga **dato municipal
real**, y no exclusivamente proxies comarcales. Se integrará como bloque propio, con
advertencia metodológica explícita y sin mezclarlo en ningún gráfico con datos de EOH o de RTA.

### 1.3 Matiz sobre la oferta hotelera

El enmascaramiento de SIMA es **estadístico, no registral**. El Registro de Turismo de
Andalucía (OpenRTA) publica los establecimientos **de forma nominal**, con nombre, titular,
dirección, coordenadas y número de plazas. Para Benahavís devuelve, entre otros, el *Gran Hotel
Benahavís* (4 estrellas, 188 plazas, 95 unidades de alojamiento, alta 30/05/2003) y *Amanhavis*
(3 estrellas, 17 plazas, 9 unidades, alta 20/07/2000).

Es decir: **la oferta hotelera de Benahavís es conocible y publicable con fuente oficial**,
aunque la estadística agregada del IECA la oculte por el umbral de los 5 establecimientos.
Esta divergencia se documentará en la página de metodología, porque es exactamente el tipo de
cuestión que un técnico de la Junta puede plantear en la defensa del expediente.

---

## 2. Fuentes verificadas e integrables en el pipeline

### Bloque 1 — Demografía y territorio

| # | Organismo · operación | Endpoint verificado | Granularidad | Periodicidad | Formato | Licencia | Estado |
|---|---|---|---|---|---|---|---|
| 1.1 | INE — Cifras oficiales de población (Padrón), tabla **2882** «Málaga: población por municipios y sexo» | `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/2882?nult=N` | Municipal, por sexo | Anual (1 de enero) | JSON | Reutilización libre citando al INE | **Disponible** |
| 1.2 | INE — Atlas de Distribución de Renta de los Hogares, tabla **30824** | `.../DATOS_TABLA/30824?tv=19:2923&nult=N` | Municipal y por sección censal | Anual | JSON | Ídem | **Disponible** |
| 1.3 | INE — unidades territoriales (distritos y secciones de Benahavís) | `.../VALORES_GRUPOSTABLA/30824/90487` | Sección censal | — | JSON | Ídem | **Disponible** |
| 1.4 | IECA — ficha municipal SIMA 29023 | `https://www.juntadeandalucia.es/institutodeestadisticaycartografia/sima/ficha.htm?mun=29023` | Municipal | Anual | HTML | CC BY | **Disponible** (extracción HTML) |
| 1.5 | INE — Atlas de Renta, **índice de Gini y distribución de la renta P80/P20**, tabla **37677** | `.../DATOS_TABLA/37677?tv=19:2923&nult=N` | Municipal y por sección censal | Anual | JSON | Ídem | **Disponible** |

**Prueba de resolución municipal (1.1):** Padrón a 1 de enero de 2025 → **9.472 habitantes**
(4.732 hombres / 4.740 mujeres). Series `DPOP13531`, `DPOP13532`, `DPOP13533`.

**Prueba de resolución municipal (1.2):** Atlas de Renta 2023 → renta neta media por persona
**14.248 €**; renta neta media por hogar **37.268 €**; renta bruta media por persona
**20.419 €**; renta bruta media por hogar **53.410 €**; mediana de renta por unidad de consumo
**17.850 €**. Serie disponible desde 2015.

**Prueba de resolución municipal (1.5):** ejercicio 2023 → **índice de Gini 43,6** y
**distribución P80/P20 = 4,0**, frente a 46,7 y 5,9 en 2016. Serie 2016–2023; el año 2015
figura en la tabla sin valor publicado y se descarta.

> **Trampa de la tabla 37677.** El Atlas publica **54 tablas homónimas** de Gini, una por
> demarcación. Solo la **37677** contiene los municipios de Málaga: sus vecinas de
> identificador (37607, 37608, 37678…) responden **sin contenido** al mismo filtro
> `tv=19:2923`, de modo que el identificador no es intercambiable ni deducible del de la
> tabla de rentas medias (30824). Además, **el Gini se publica en escala 0–100**, no 0–1:
> tratarlo como proporción da una desigualdad cien veces menor.

> **Nota metodológica obligatoria.** El Atlas de Renta del INE y la Estadística de declarantes
> del IRPF de la AEAT (fuente 5.1) **no son comparables** y darán cifras muy distintas para
> Benahavís: el Atlas reparte la renta entre **toda la población residente**, mientras que la
> AEAT la calcula sobre **declarantes**. En un municipio con alta proporción de residentes
> extranjeros no declarantes en España, la brecha es estructural, no un error. Irán en gráficos
> separados.

> **Aviso ECP.** La Estadística Continua de Población (operación `ECP`, 78 tablas) **no
> desagrega por municipio**: sus tablas llegan a nivel nacional, de comunidad autónoma y de
> provincia. No es utilizable para Benahavís. El dato municipal de población procede
> exclusivamente de `DPOP`.

---

### Bloque 2 — Oferta turística

| # | Organismo · operación | Endpoint verificado | Granularidad | Periodicidad | Formato | Licencia | Estado |
|---|---|---|---|---|---|---|---|
| 2.1 | Junta de Andalucía — **OpenRTA** (Registro de Turismo de Andalucía) | `https://datos.juntadeandalucia.es/api/v0/openrta/search?...&province=MÁLAGA&municipality=BENAHAVIS` | Municipal, registro nominal con coordenadas | Diario | JSON / CSV | Datos abiertos Junta de Andalucía | **Disponible** |
| 2.2 | INE — Viviendas turísticas, tabla **39363** (viviendas, plazas, plazas por vivienda) | `.../DATOS_TABLA/39363?nult=N` | Municipal | Semestral / infra-anual | JSON | Reutilización libre citando al INE | **Disponible** |
| 2.3 | INE — Viviendas turísticas, tabla **39366** (% sobre viviendas censadas) | `.../DATOS_TABLA/39366?nult=N` | Municipal | Ídem | JSON | Ídem | **Disponible** |
| 2.4 | Dataestur — `VIVIENDA_TURISTICA_INE_MUN_DL` | `https://www.dataestur.es/API-SEGITTUR-v2/VIVIENDA_TURISTICA_INE_MUN_DL?...&Provincia=Málaga` | Municipal | Mensual desde 2020-08 | CSV `;` latin-1 | Reutilización libre | **Disponible** (redundante con 2.2; se usará como contraste) |

**Prueba de resolución municipal (2.1):** **2.251 registros** inscritos en el RTA con municipio
Benahavís. El esquema devuelve 92 campos, entre ellos `objects_type_id` (tipología),
`categories`, `group`, `modalities`, `tot_gen_places` (plazas), `tot_gen_ua` (unidades de
alojamiento), `registration_date`, `activity_start_date`, `coord_x`/`coord_y` con
`srid = 25830`, `holder` y `catastral_ref`. Es, con diferencia, la fuente más rica del
observatorio y permite además cartografía municipal.

**Prueba de resolución municipal (2.2):** último periodo publicado → **861 viviendas
turísticas**, **5.453 plazas**, 6,33 plazas por vivienda. Periodo anterior: 917 viviendas y
5.630 plazas.

> **Divergencia RTA vs. INE experimental — no fusionar nunca.** El RTA cuenta **oferta
> registrada administrativamente** (2.251 inscripciones). El INE experimental cuenta **oferta
> anunciada en plataformas de intermediación** (861 viviendas). Miden universos distintos y
> divergen por un factor superior a 2,5. Irán en **gráficos separados**, cada uno con su nota
> metodológica. Cualquier gráfico que sume o compare directamente ambas series sería
> técnicamente incorrecto.

> **Trampa de la API OpenRTA (documentada).** El endpoint `/search` **exige que se envíen todos
> los parámetros** (`id`, `object_type`, `category`, `group`, `modality`, `province`,
> `municipality`, `order_by`, `mode`); si falta alguno devuelve `422` con cuerpo vacío en
> algunos clientes. El valor neutro es `-`. La provincia debe enviarse **con tilde**
> (`MÁLAGA`), mientras que el municipio va **sin tilde y en mayúsculas** (`BENAHAVIS`).
> Además, el endpoint `/count` **ignora los filtros** y devuelve siempre el total de Andalucía
> (175.209): no debe usarse para contar la oferta municipal — hay que leer `total_hits` de
> `/search`.

---

### Bloque 3 — Demanda y presión turística

| # | Organismo · operación | Endpoint verificado | Granularidad | Periodicidad | Formato | Estado |
|---|---|---|---|---|---|---|
| 3.1 | INE / SEGITTUR-Dataestur — **turismo receptor por municipio y país** (`TURISMO_RECEPTOR_MUN_PAIS_DL`) | `https://www.dataestur.es/API-SEGITTUR-v2/TURISMO_RECEPTOR_MUN_PAIS_DL?desde (año)=&desde (mes)=&hasta (año)=&hasta (mes)=&Provincia=Málaga` | **Municipal**, por país de origen | Mensual desde 2019-07 | CSV `;` latin-1 | **Disponible** |
| 3.2 | INE / Dataestur — **turismo interno municipio-municipio** (`TURISMO_INTERNO_MUN_MUN_DL`) | `.../TURISMO_INTERNO_MUN_MUN_DL?año=YYYY` | **Municipal** origen y destino | Mensual, fichero anual (~31 MB) | CSV | **Disponible** |
| 3.3 | Diputación de Málaga — Encuesta de Ocupación Hotelera provincial | `https://opendata.malaga.es/api/3/action/package_show?id=ocupacionhotelera` | **Provincial** | Mensual | CSV/JSON/XLSX | **Verificada, no incorporada** (ver nota) |
| 3.4 | INE / Dataestur — **Encuesta de Ocupación Hotelera por zona turística** (`EOH_ZONA_TUR_DL`) | `.../EOH_ZONA_TUR_DL` | Zona turística (48 zonas) | Mensual desde 2012-01 | **XLSX**, no CSV | **Disponible como proxy comarcal etiquetado** |
| 3.4b | INE / Dataestur — EOH por **punto turístico** (`EOH_PUNT_TUR_DL`) | `.../EOH_PUNT_TUR_DL` | Punto turístico | Mensual | — | **No disponible**: el endpoint devuelve `504` de forma sistemática. Benahavís no es punto turístico, de modo que no aportaría dato municipal |
| 3.5 | INE Tempus3 — operaciones TMOV (436 receptor, 437 emisor, 438 interno) | `.../TABLAS_OPERACION/436` | Por resolver en Fase 2 | Mensual | JSON | **Pendiente** (vía alternativa a 3.1, sin dependencia de Dataestur) |

**Prueba de resolución municipal (3.1):** julio de 2025 → **11.421 turistas extranjeros** en
Benahavís, con desglose por 40+ países de origen y por continente. Para dimensionar: el
municipio tiene 9.472 habitantes empadronados.

**Prueba de resolución municipal (3.2):** 222 registros de origen-destino que implican a
Benahavís en 2025 (p. ej. enero 2025: 36 turistas con origen Algeciras y destino Benahavís).

**Prueba de resolución de la zona turística (3.4):** junio de 2026 → zona **Costa del Sol
(Málaga), Andalucía**: 565.438 viajeros, 2.193.961 pernoctaciones, estancia media 3,88 noches,
**grado de ocupación por plazas 73,60 %**, 513 establecimientos y 96.652 plazas estimadas.
Serie completa de 174 meses, de enero de 2012 a junio de 2026.

> **Tres trampas verificadas de `EOH_ZONA_TUR_DL`.**
> 1. Devuelve un **fichero XLSX** —cabecera `PK`, `Content-Type: application/vnd.ms-excel`—
>    pese a que el resto de operaciones `*_DL` del mismo API sirven CSV en `latin-1`.
>    Parsearlo como texto delimitado produce una única columna de bytes ilegibles.
> 2. Responde **`504 Gateway Time-out` con frecuencia**, también entre dos peticiones
>    correctas. Necesita más reintentos y esperas más largas que el resto del pipeline.
> 3. La variable `LUGAR_RESIDENCIA` trae tres filas por mes: «Total» y sus dos componentes.
>    **Solo la fila de total lleva grado de ocupación, plazas y personal**; en las otras dos
>    esas celdas van en blanco. Un blanco ahí no es un cero, y sumar las tres filas duplica
>    viajeros y pernoctaciones.
>
> Abril de 2020 vale **0** de ocupación y **mayo y junio de 2020 no se publicaron**, por el
> cierre de los establecimientos durante el confinamiento. La validación del pipeline los
> marca como aviso; son correctos y no se corrigen.

**Sobre 3.3 (EOH provincial), verificada pero no incorporada.** Mide el mismo fenómeno que 3.4
con menos proximidad al municipio: la provincia incluye la capital y el interior, cuyo
comportamiento hotelero difiere del litoral occidental. Publicar dos indicadores sustitutivos
del mismo hueco invita a compararlos entre sí, que es precisamente lo que el observatorio evita.
Queda documentada por si el expediente exige el marco provincial.

**Advertencia de cabecera obligatoria para todo el bloque 3.** Los indicadores 3.1 y 3.2
proceden de una **estadística experimental del INE basada en el posicionamiento de teléfonos
móviles**. No son equivalentes a pernoctaciones en alojamiento reglado, ni proceden de la
Encuesta de Ocupación Hotelera. Los indicadores 3.3 y 3.4 **no son municipales**: su ámbito es
provincial y de zona turística respectivamente, y así figurará en el título de cada gráfico.
Las cifras de 3.4 no se suman ni se comparan con ninguna serie municipal.

---

### Bloque 4 — Mercado de trabajo

| # | Organismo · operación | Endpoint verificado | Granularidad | Periodicidad | Formato | Estado |
|---|---|---|---|---|---|---|
| 4.1 | SEPE — paro registrado por municipios | `https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/datos_abiertos/datos/Paro_por_municipios_{AAAA}_csv.csv` | Municipal, por sexo, edad y sector | Mensual (refundido anual) | CSV `;` latin-1 | **Disponible** |
| 4.2 | SEPE — contratos registrados por municipios | `.../Contratos_por_municipios_{AAAA}_csv.csv` | Ídem | Ídem | CSV | **Disponible** |
| 4.3 | SEPE — avance mensual por provincia | `https://www.sepe.es/HomeSepe/que-es-el-sepe/estadisticas/datos-estadisticos/municipios/{AAAA}/{mes}.html` → `MUNI_MALAGA_{MMAA}.xls` | Municipal | Mensual (sale antes que el CSV anual) | XLS | **Disponible** (parche de meses recientes) |
| 4.4 | Seguridad Social — **Afiliados por Municipios CNAE 2D · Regímenes · Sexo** | `https://www.seg-social.es/descargas/STAT/MUNCNAE{MM}{AA}.xlsx` | Municipal × CNAE 2 dígitos × régimen × sexo | Mensual | XLSX (~25 MB) | **Disponible** |
| 4.5 | IECA/BADEA — paro registrado por edad y sexo (consulta 37016) | `https://www.juntadeandalucia.es/institutodeestadisticaycartografia/intranet/admin/rest/v1.0/consulta/37016?D_TERRITORIO_0=2934` | Municipal | Anual (media) | JSON | **Disponible** |
| 4.6 | IECA/BADEA — afiliación a la Seguridad Social por régimen (consulta 876) | `.../consulta/876?D_TEMPORAL_0={periodo}` | Municipal × régimen | Mensual desde jul-2021 | JSON | **Disponible** |

**Prueba de resolución municipal (4.4):** fichero `MUNCNAE0626.xlsx` (junio de 2026), 512.763
filas, 12 columnas. Benahavís (`29023`) aparece con **164 filas**. Empleo turístico visible:

| CNAE | Descripción | Afiliados (jun. 2026) |
|---|---|---|
| 55 | Servicios de alojamiento | 162 |
| 56 | Servicios de comidas y bebidas | 274 |
| 79 | Agencias de viajes y operadores turísticos | `<5` (enmascarado) |
| 93 | Actividades deportivas, recreativas y de entretenimiento | 240 |

Ramas no turísticas más relevantes: actividades inmobiliarias (418), construcción de edificios
(384), servicios a edificios (331).

**Prueba de resolución municipal (4.5):** paro registrado medio de 2025 → **182,9 personas**
(69,9 hombres / 113,0 mujeres; 101,0 mayores de 45 años).

> **Enmascaramiento `<5` — cuantificado.** De las 164 filas de Benahavís del fichero de la
> Seguridad Social, **75 (el 45,7 %) están enmascaradas como `<5`**. La suma de los valores
> visibles asciende a 3.164 afiliados. Esto significa que cualquier desagregación sectorial
> fina llevará un intervalo de incertidumbre, y que el total municipal por suma de CNAE
> **está subestimado**. El pipeline tratará `<5` como valor censurado —nunca como 0, nunca
> como 2,5— y la interfaz lo mostrará como tal.

> **Ruptura de serie CNAE-2025.** Verificada en el propio catálogo de ficheros: hasta
> `MUNCNAE1225.xlsx` (diciembre de 2025) la clasificación es **CNAE-2009**; desde
> `MUNCNAE0126.xlsx` (enero de 2026) es **CNAE-2025**, y el título del fichero cambia a
> «CNAE25 2D». Las series de afiliación por rama **se cortarán visualmente en enero de 2026**
> con una marca en el gráfico y nota al pie. No se empalmarán.

> **Trampa de nomenclatura.** Algunos meses se republican revisados con sufijo `R`
> (p. ej. `MUNCNAE0925R.xlsx`). El extractor debe probar primero la variante `R` y caer a la
> versión sin sufijo. Además, en este fichero el municipio figura como `BENAHAVIS`
> —mayúsculas y sin tilde—, por lo que el filtrado debe hacerse por `COD MUNICIPIO = 29023`
> y no por nombre.

---

### Bloque 5 — Renta y actividad económica

| # | Organismo · operación | Acceso | Granularidad | Periodicidad | Estado |
|---|---|---|---|---|---|
| 5.1 | AEAT — Estadística de declarantes del IRPF por municipios (EDM) | Páginas HTML por municipio bajo `.../sites/irpfmunicipios/{año}/` + conjunto en datos.gob.es | Municipal (>1.000 hab.) | Anual | **Disponible** (extracción HTML; URLs con hash no predecible → requiere resolución del índice) |
| 5.2 | INE — Atlas de Renta (ver 1.2) | API Tempus3 | Municipal y sección censal | Anual | **Disponible** |
| 5.3 | Ministerio de Hacienda — Deuda viva de las entidades locales | `https://www.hacienda.gob.es/cdi/sist financiacion y deuda/informacioneells/{AAAA}/deuda-viva-ayuntamientos-{AAAA}12.xlsx` | Municipal | Anual (a 31/12) | **Disponible** |
| 5.4 | Ministerio de Hacienda — Periodo medio de pago a proveedores | `https://serviciostelematicosext.hacienda.gob.es/SGCIEF/PMP_NET/` | Municipal | Mensual/trimestral | **Pendiente** (aplicación web con formulario; sin descarga directa verificada) |
| 5.5 | Ministerio de Hacienda — Presupuestos y liquidaciones de EELL | `https://serviciostelematicosext.hacienda.gob.es/SGCIEF/` | Municipal | Anual | **Pendiente** (misma limitación) |
| 5.6 | Catastro — servicio OVC de callejero y estadísticas | `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/ConsultaMunicipio?Provincia=MALAGA&Municipio=BENAHAVIS` | Municipal | Continua | **Disponible** |
| 5.7 | Catastro — descarga INSPIRE de parcelario | `https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/ES.SDGC.CP.atom.xml` | Parcela | Semestral | **Disponible** (GML por municipio vía ATOM) |
| 5.8 | Ministerio de Vivienda (MIVAU) — transacciones inmobiliarias y precio de vivienda tasada | `https://www.mivau.gob.es/vivienda/estadisticas/` | Municipal (>25.000 hab. en algunas series) | Trimestral | **Pendiente** — el portal devuelve `403` a peticiones automatizadas; además varias series tienen umbral poblacional que Benahavís no alcanza |

**Verificado (5.6):** el servicio OVC devuelve para Benahavís `<nm>BENAHAVIS</nm>`, provincia
`29`, municipio `23`, confirmando la correspondencia de códigos.

**Verificado (5.3):** patrón de URL estable comprobado para los ejercicios 2022, 2023 y 2024.

---

### Bloque 6 — Clima

| # | Organismo · operación | Endpoint verificado | Granularidad | Periodicidad | Estado |
|---|---|---|---|---|---|
| 6.1 | AEMET OpenData — **estación 6069X BENAHAVÍS** | `https://opendata.aemet.es/opendata/api/valores/climatologicos/mensualesanuales/datos/anioini/{a}/aniofin/{b}/estacion/6069X?api_key=…` | **Municipal** (estación dentro del término) | Mensual y anual, desde 2004 | **Disponible** |
| 6.2 | AEMET OpenData — estaciones de contraste: `6155A` Málaga Aeropuerto, `6058I` Estepona, `6083X` Marbella | Mismo endpoint, cambiando el indicativo | Estación de medida | Diaria | **Disponible** |
| 6.3 | AEMET OpenData — inventario de estaciones | `.../valores/climatologicos/inventarioestaciones/todasestaciones` | 921 estaciones, 26 en Málaga | — | **Disponible** |
| 6.4 | Copernicus CDS — reanálisis ERA5 | API CDS | Celda ~9 km sobre el término municipal | Horaria desde 1940 | **Opcional** — solo si se requiere serie homogénea anterior a la estación |

> **Corrección a la hipótesis del encargo: sí existe estación meteorológica en Benahavís.**
> El inventario de AEMET incluye la estación **`6069X BENAHAVÍS`**, a 392 m de altitud
> (36°32'37"N, 5°01'29"W), dentro del término municipal. Se ha verificado que devuelve serie
> diaria completa —temperatura media, máxima y mínima, precipitación, viento, racha y humedad—
> y también los **agregados mensuales y anuales calculados por la propia AEMET**. La serie
> **arranca en 2004**: las consultas de 1998–2003 devuelven «No hay datos que satisfagan esos
> criterios». Descargados **299 registros mensuales** que cubren de 2004 a 2026, con dos meses
> ausentes (noviembre y diciembre de 2020) que la validación del pipeline detecta y comunica.
>
> En consecuencia, **el bloque de clima es municipal real y no un proxy**. Las estaciones de
> Málaga Aeropuerto, Estepona y Marbella se conservan únicamente como **contraste**, etiquetadas
> como tales.
>
> **Trampas verificadas de la API de AEMET:**
> 1. Sin `api_key` devuelve `HTTP 200` con **cuerpo vacío** —no un error—, por lo que el
>    extractor debe validar el contenido, no solo el código de estado.
> 2. Patrón de **doble llamada**: la primera respuesta es un sobre `{estado, descripcion, datos}`
>    y el dato real reside en la URL del campo `datos`.
> 3. El fichero de datos viene codificado en **latin-1 sin declararlo**. Decodificarlo como UTF-8
>    lanza `UnicodeDecodeError` y descarta la respuesta entera; fue la causa de que la primera
>    versión del extractor devolviera cero registros pese a que la fuente respondía correctamente.
> 4. Rango máximo por petición: **36 meses** en el endpoint mensual, **6 meses** en el diario
>    (`404 · "El rango de fechas no puede ser superior a 6 meses"`). Se usa el mensual, que además
>    ofrece los agregados oficiales y reduce seis veces el número de peticiones.
> 5. AEMET limita la **cadencia por clave** y responde `429 Too Many Requests` con pausas cortas.
> 6. Los valores llegan como **texto con coma decimal** (`tm_mes = "19,0"`) y a veces con sufijos
>    entre paréntesis que indican el día del extremo.
> 7. El **«mes» 13 de cada año no es un mes**: es el resumen anual. Tratarlo como mes natural
>    duplicaría e inflaría la serie mensual.

---

### Bloque 7 — Medio ambiente y territorio

| # | Organismo · servicio | Endpoint | Estado |
|---|---|---|---|
| 7.1 | REDIAM — MapServer WFS: `REDIAM_RENPA` (capas `ms:eennpp`, `ms:red_natura_2000`, `ms:reservas_biosfera`), `REDIAM_habitats_interes_comunitario`, `REDIAM_Inventario_VVPP`, `REDIAM_Redvia` | WFS de la Consejería de Medio Ambiente | **Disponible** (verificado en trabajo previo sobre Marbella) |
| 7.2 | DERA (IECA) | `https://www.ideandalucia.es/services/DERA_g3_hidrografia/wfs?` y grupos análogos | **Disponible** — el nombre del servicio incluye el grupo temático; no existe un `DERA` genérico |
| 7.3 | IGN/CNIG — PNOA, LiDAR, MDT | Centro de descargas del CNIG | **Disponible** |
| 7.4 | Copernicus Sentinel-2 — NDVI | Sentinel Hub | **Requiere registro** (y rechaza EPSG:25830 — usar EPSG:32630) |

> **Limitaciones verificadas:** Montes Públicos de Andalucía y Zonas de peligro de incendio
> ofrecen **solo WMS** (su WFS responde `400`). Los servicios de `wms.mapama.gob.es` (dominio
> público marítimo-terrestre, servidumbre de protección, dominio público hidráulico) estaban
> **caídos** en la última comprobación. Los WFS de REDIAM **topan en 5.000 entidades** y
> requieren paginación con `COUNT`/`STARTINDEX`; cuando no hay resultados devuelven **cuerpo
> vacío en lugar de error**.

---

### Bloque 8 — Finanzas municipales

Cubierto por 5.3 (deuda viva, disponible) y 5.4/5.5 (PMP y presupuestos, pendientes). El portal
de transparencia del Ayuntamiento de Benahavís y la ficha del municipio en Gobierno Abierto de
la Diputación de Málaga (`https://www.malaga.es/gobiernoabierto/datosabiertos/`) publican
presupuestos y cuentas anuales en PDF/HTML, lo que exige extracción no automatizable con
garantías. Se propone tratarlos como **carga documental manual versionada**, no como fuente del
pipeline.

---

### Bloque 9 — Big Data de Turismo y Planificación Costa del Sol

Observatorio provincial de la Diputación de Málaga. Publica por municipio series que ninguna
fuente estatal baja a un municipio del tamaño de Benahavís. **Es la fuente que resuelve el hueco
principal del encargo**: la ocupación de alojamiento con ámbito estrictamente municipal.

Portal: `https://www.costadelsolmalaga.org/bigdata/` · Visor:
`https://visor.bigdata.costadelsolmalaga.org/informe?id={informe}&mun=29023`

| # | Informe | Entidad consultada | Contenido para Benahavís | Cobertura verificada | Estado |
|---|---|---|---|---|---|
| 9.1 | `viviendas-turisticas` | medidas de `_Cálculos` sobre `Calendario` × `Municipios` | **Grado de ocupación**, viviendas y plazas anunciadas y **precio medio por plaza** | 101 meses, 2018-03 → 2026-07 | **Disponible** |
| 9.2 | `oferta-alojamiento` | `RTA` × `Municipios` × `Tipologías` | Establecimientos y plazas inscritos, **serie histórica por tipología** | 94 periodos, 1998-12 → 2026-07 | **Disponible** |
| 9.3 | `precios-hoteles` | `Lurmetrika_Booking` | Precio medio y valoración por tipología y categoría | 139 meses, 2015-01 → 2026-07 | **Disponible** |
| 9.4 | `empleo-turismo` | `Seguridad Social Municipal` × `Municipios` | Empresas y personas afiliadas **por subsector turístico y régimen** | 30 trimestres, 2019-1T → 2026-2T | **Disponible** |
| 9.5 | `viajeros-pernoctaciones` | `Viajeros y Pernoctaciones` | Microdato de la EOH: viajeros y pernoctaciones por tipología y país | **Solo 3 meses** de apartamentos turísticos (2025-06, 2025-07, 2025-10) | **Disponible, cobertura mínima** |
| 9.6 | `empleo-hosteleria`, `reservas-alojamiento`, `concentracion-territorio` | varias | Afiliación en hostelería, disponibilidad de alojamiento y matriz origen-destino | Responden para el municipio | **Verificados, no incorporados** (ver nota) |

**Prueba de resolución municipal (9.1):** julio de 2026 → **62,94 % de ocupación**, 804 viviendas
y 5.050 plazas anunciadas, 112,10 € de precio medio por plaza y noche.

**Prueba de resolución municipal (9.2):** julio de 2026 → 2.257 establecimientos y 16.523 plazas
inscritas, repartidas en cinco tipologías. Diciembre de 1998, primer periodo de la serie: un
apartamento turístico con 29 plazas.

**Prueba de resolución municipal (9.4):** segundo trimestre de 2026 → 66 empresas y 737 personas
afiliadas en los seis subsectores turísticos. **Sin censura `<5`**, porque el dato se publica ya
agregado por subsector: cubre justo el punto ciego del fichero MUNCNAE.

#### Cómo se consulta

No hay API pública. Cada informe es un **Power BI embebido** y se consulta su endpoint semántico:

1. **Token.** El visor incrusta un token de embed efímero en el HTML
   (`accessToken: '…'`), que se regenera en cada carga. Hay que pedir uno por informe y ejecución.
2. **Endpoint.** `POST https://wabi-europe-north-b-redirect.analysis.windows.net/explore/querydata?synchronous=true`
   con `Authorization: EmbedToken <token>` y **`Origin: https://app.powerbi.com`**. La ruta
   `/public/reports/querydata` devuelve `403`. Como el servicio solo acepta ese origen, la
   consulta **no puede hacerse desde el navegador**: tiene que ir en el pipeline.
3. **Identificadores.** El cuerpo exige `modelId` y `DatasetId`, que el visor no publica; se
   obtienen de `GET /explore/reports/{reportId}/modelsAndExploration?preferReadOnlySession=true`
   y quedan fijados en `src/extract/costadelsol.py`. El `reportId` sí se lee del visor en cada
   ejecución, por si la Diputación republica el panel.
4. **Esquema.** `POST /explore/conceptualschema` con `{"modelIds":[…]}` devuelve entidades y
   columnas, que es como se localizan los nombres reales —`06. Territorio`,
   `etiqueta_municipio`, `Municipios_Etiqueta`—, distintos en cada informe.

#### Trampas verificadas

- **Respuesta con BOM.** El JSON llega con marca de orden de bytes; decodificarlo como UTF-8 a
  secas deja el BOM delante y el documento no parsea. Hay que usar `utf-8-sig`.
- **Formato DM0.** Los datos vienen comprimidos: descriptor `S` con diccionarios `ValueDicts`,
  máscara `R` de «repite el valor de la fila anterior» y máscara `Ø` de nulos. Sin deshacer las
  tres cosas las etiquetas salen como números y las filas quedan corridas.
- **Filas de total.** En 9.4 la variable `regimen` trae «Total» junto a sus componentes (General,
  Autónomo, Mar); sumar todas las filas duplica el empleo. Lo mismo ocurre en 9.5 con el mercado
  emisor y sus agregados continentales.
- **Medidas frente a columnas.** En 9.1 el grado de ocupación y el precio **no son columnas**: la
  columna homónima devuelve nulos. Hay que pedir las medidas del modelo
  (`0.4 Grado de Ocupación`, `0.3 Precio medio por plaza mapa`) con la tabla `Calendario` como
  contexto temporal.
- **Decimales como texto.** Los valores no enteros llegan en cadena («62.941603…»), con punto
  decimal.
- **Duplicado en origen (9.2).** Febrero de 2022 dobla el registro: 2.057 establecimientos y
  15.258 plazas entre un enero de 1.010 y 8.670 y un marzo de 1.050 y 8.878. El observatorio
  **no corrige el dato ajeno**: lo publica, lo señala en la ficha del gráfico y lo recoge el
  informe de validación.
- **Frecuencia variable (9.2).** La serie es anual hasta mediados de la década pasada y mensual
  después. Validarla entera como mensual produce doscientos «meses ausentes» que no existen.

**Sobre 9.6, verificados y no incorporados.** `empleo-hosteleria` es un subconjunto de 9.4;
`reservas-alojamiento` publica recuentos de alojamiento-día cuya definición no consta en el
visor; y `concentracion-territorio` mide turistas por origen con una magnitud que **no reconcilia**
con la serie de posicionamiento móvil que ya publica el bloque 3 —362.964 frente a 102.317
turistas en 2025—, sin que el visor documente la diferencia. Publicar dos cifras del mismo
concepto que se contradicen sería peor que no publicar ninguna.

**Informes del portal que no resuelven para Benahavís:** `prevision-aeropuerto`,
`llegadas-aeropuerto`, `rentabilidad-hoteles`, `busqueda-vuelos`, `demanda-turistica`,
`reservas-hoteles`, `busqueda-hoteles`, `ocupacion-alojamientos`, `caracteristicas-viajeros`,
`caracteristicas-golf` y `caracteristicas-ocio`. El visor devuelve la página de error para
`mun=29023`.

---

## 3. Fuentes que requieren solicitud formal o convenio

Ninguna de estas se integra en el pipeline automático. Se listan con el organismo destinatario
para que el Ayuntamiento pueda cursar la petición.

| Fuente | Indicador que aportaría | Organismo destinatario | Por qué no es automatizable |
|---|---|---|---|
| **Acosol S.A.** (Mancomunidad de Municipios de la Costa del Sol Occidental) | **Consumo de agua mensual por municipio** — el mejor proxy disponible de presión turística real y de estacionalidad | Acosol S.A. / Mancomunidad de Municipios de la Costa del Sol Occidental | No existe portal de datos abiertos. La web publica únicamente calidad de aguas en visores ArcGIS, sin serie de consumo por municipio. **Prioridad alta**: es el indicador que mejor acreditaría población turística asistida ante la Junta |
| **Consorcio Provincial de Residuos Sólidos Urbanos de Málaga** | Toneladas recogidas por municipio y mes — segundo mejor proxy de presión estacional | Diputación de Málaga / Consorcio Provincial de RSU | Sin API ni descarga pública localizada |
| **Turismo y Planificación Costa del Sol** (Diputación de Málaga) | Segmentación de mercados, perfil del visitante, posible desagregación por municipio o zona | Turismo y Planificación Costa del Sol, S.L.M. | Publica informes en PDF; el portal `opendata.malaga.es` solo ofrece EOH **provincial**. Merece consulta directa por si dispone de explotación municipal no publicada |
| **Ayuntamiento de Benahavís** | Conteo de visitantes en recursos turísticos (Cañón de las Angosturas, senderos, oficina de turismo), licencias de obra, plazas de aparcamiento, entradas a equipamientos | Ayuntamiento de Benahavís | Dato propio municipal. **Es la vía operativa para acreditar población turística asistida** conforme al Decreto 72/2017 |
| **Copernicus CDS / Sentinel Hub** | ERA5 (serie climática anterior a la estación) y NDVI | ECMWF / ESA | Requiere cuenta de usuario. Para NDVI hace falta además un par `client_id`/`client_secret` generado en el panel del CDSE |

*(AEMET figuraba aquí en la primera redacción. Su API Key ya está obtenida y verificada, por lo
que el bloque de clima se integra en el pipeline automático.)*

---

## 4. Indicadores marcados como NO DISPONIBLES A NIVEL MUNICIPAL

Se documentarán como tales en la interfaz, con la causa y el proxy sustitutivo.

| Indicador | Causa | Proxy que se usará en su lugar | Ámbito real del proxy |
|---|---|---|---|
| Pernoctaciones hoteleras | Umbral de 5 establecimientos — secreto estadístico (EOH/SIMA) | **Ocupación hotelera de la zona turística Costa del Sol (3.4), publicada en el panel**; turistas por posicionamiento móvil (3.1) | Zona turística Costa del Sol · *(3.1 sí es municipal)* |
| Grado de ocupación y estancia media | Ídem | Ídem | Ídem |
| Número de hoteles y plazas (estadística agregada IECA) | Ídem | **Registro nominal RTA (2.1)** — dato municipal real, de naturaleza registral | Municipal |
| Criminalidad y tasa de delitos | El Portal Estadístico de Criminalidad publica dato municipal solo para municipios de más de 20.000 habitantes (más de 30.000 entre 2017 y 2020). Benahavís queda fuera | Tasa de delitos provincial (`SEGURIDAD_PROVINCIA_DL` de Dataestur) | Provincia de Málaga |
| Afiliación en CNAE 79 (agencias de viajes) | Enmascaramiento `<5` | Ninguno; se muestra como valor censurado | Municipal |
| ~~Clima observado en el término municipal~~ | **Descartado como limitación:** sí existe estación en el municipio (AEMET `6069X BENAHAVÍS`) | — | Municipal |
| Precio de vivienda y transacciones (varias series MIVAU) | Umbral poblacional de la estadística | Serie provincial, si se confirma | Provincia de Málaga |

---

## 5. Fuentes exploradas y descartadas

| Fuente | Motivo del descarte |
|---|---|
| INE — Estadística Continua de Población (`ECP`) | Verificado: ninguna de sus 78 tablas desagrega por municipio |
| Dataestur — endpoints `GASTO_TPV_*` | La desagregación mínima es **provincial**; no hay nivel municipal. Utilizable solo como contexto provincial etiquetado |
| Dataestur — `SEGURIDAD_CCAA_DL` / `SEGURIDAD_PROVINCIA_DL` | Confirman que no hay dato municipal de criminalidad; se usan como proxy provincial |
| `datos.gob.es` (API SPARQL/linked-data) | Responde correctamente, pero actúa como catálogo federado: los datos residen en los portales de origen ya inventariados. Se mantiene solo como vía de descubrimiento |
| Diputación de Málaga — `opendata.malaga.es`, dataset `ocupacionhotelera` | Verificado: solo **provincia de Málaga**, sin desagregación municipal (10 registros mensuales para 2025) |

---

## 6. Resumen de disponibilidad

| Bloque | Fuentes verificadas y automatizables | Con dato municipal real |
|---|---|---|
| 1 · Demografía y territorio | 5 | Sí |
| 2 · Oferta turística | 4 | Sí |
| 3 · Demanda y presión turística | 4 verificadas + 1 pendiente + 1 no disponible (3.4b) | Sí (3.1 y 3.2); 3.3 y 3.4 son proxies etiquetados |
| 4 · Mercado de trabajo | 6 | Sí |
| 5 · Renta y actividad económica | 4 verificadas + 3 pendientes | Sí |
| 6 · Clima | 3 (requieren clave de AEMET, ya disponible) | Sí — estación `6069X` dentro del término |
| 7 · Medio ambiente y territorio | 3 | Sí (geometría) |
| 8 · Finanzas municipales | 1 verificada + 2 pendientes | Sí |
| 9 · Big Data de Turismo Costa del Sol | 5 informes incorporados + 3 verificados no incorporados | Sí, los cinco |

**Total: 38 fuentes verificadas contra su endpoint real**, de las cuales 34 resuelven a nivel
municipal para Benahavís.

---

*Documento generado el 17 de agosto de 2026, ampliado el 18 de agosto de 2026 con las fuentes
1.5 (Gini y P80/P20) y 3.4 (EOH por zona turística), y el 20 de agosto de 2026 con el bloque 9
(Big Data de Turismo y Planificación Costa del Sol). Consultoría AMMA para el Ayuntamiento de
Benahavís.*
