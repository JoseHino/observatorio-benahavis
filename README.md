# Observatorio Turístico y Socioeconómico de Benahavís

Sitio estático de indicadores del municipio de **Benahavís** (Málaga, código INE 29023),
alimentado por un pipeline reproducible en Python que descarga, normaliza y versiona datos de
fuentes públicas oficiales.

**Sitio publicado:** https://josehino.github.io/observatorio-benahavis/
**Autoría técnica:** Consultoría AMMA · **Destinatario:** Ayuntamiento de Benahavís

---

## Qué es y qué no es

Es una herramienta de consultoría pensada para defenderse ante el Ayuntamiento y ante la
Consejería de Turismo de la Junta de Andalucía, y para servir de evidencia documental en un
expediente de **Municipio Turístico de Andalucía** (Decreto 72/2017).

No estima, no interpola y no rellena huecos: **publica solo los indicadores para los que existe
dato**, y cuando uno es sustitutivo lleva su ámbito territorial real escrito en la ficha del
gráfico. El rastro de lo consultado y descartado vive en el inventario de fuentes, no en el panel.

## Lo que condiciona el diseño

Benahavís tiene unos 9.500 habitantes y cae por debajo de varios umbrales de difusión
estadística. Las consecuencias están documentadas en
[`docs/inventario-fuentes.md`](docs/inventario-fuentes.md) y resumidas en la
[página de metodología](https://josehino.github.io/observatorio-benahavis/metodologia.html):

- **No hay serie municipal de pernoctaciones hoteleras.** La Encuesta de Ocupación Hotelera se
  difunde por zonas y puntos turísticos, y la ficha del IECA aplica secreto estadístico con la
  nota «Dato no significativo, al disponer el municipio de menos de 5 establecimientos
  turísticos». **Sí hay, en cambio, ocupación municipal de la vivienda turística**, mensual desde
  2018, en el Big Data de Turismo y Planificación Costa del Sol.
- **Sí hay medición municipal de demanda** por otra vía: la estadística experimental del INE
  basada en posicionamiento de telefonía móvil, con serie mensual desde julio de 2019 y desglose
  por país de origen. Como contexto del alojamiento reglado —y solo como contexto— se publica la
  ocupación de la **zona turística Costa del Sol (Málaga)**, con su ámbito escrito en la ficha.
- **Sí hay estación meteorológica en el término municipal** (AEMET `6069X`, 392 m), con serie
  desde 2004.
- **Cerca de la mitad de las celdas** del fichero municipal de afiliación de la Seguridad Social
  vienen enmascaradas como `<5`. Los totales afectados se publican como intervalo, nunca como
  cifra puntual.
- **La afiliación por rama de actividad tiene ruptura de serie en enero de 2026** por el paso de
  CNAE-2009 a CNAE-2025. Las series no se empalman.

## Arquitectura

```
observatorio-benahavis/
├── run_pipeline.py             # orquestador: un bloque por sección del observatorio
├── config/
│   ├── fuentes.yaml            # identidad del municipio en cada plataforma y endpoints
│   └── indicadores.yaml        # catálogo de indicadores con ámbito, estado y limitaciones
├── src/
│   ├── contexto.py             # códigos del municipio y rutas del proyecto
│   ├── extract/                # un módulo por fuente
│   ├── transform/              # validación y conversión de coordenadas
│   ├── load/                   # escritura a data/processed y docs/data
│   └── utils/                  # HTTP con reintentos, logging y control de censura
├── data/
│   ├── raw/                    # descargas crudas con marca temporal (no versionadas)
│   ├── processed/              # resultado del pipeline
│   └── visitantes/             # CSV de conteo depositados por el Ayuntamiento
├── docs/                       # raíz de GitHub Pages
│   ├── index.html              # panel de indicadores
│   ├── metodologia.html
│   ├── municipio-turistico.html
│   ├── inventario-fuentes.md
│   ├── plantilla-conteo-visitantes.csv
│   ├── assets/                 # CSS y JavaScript, sin paso de compilación
│   └── data/                   # JSON que consume el frontend
└── .github/workflows/
    └── actualizar-datos.yml    # ejecución mensual y manual
```

**Frontend:** HTML, CSS y JavaScript sin bundler. Gráficos con ECharts y mapa con Leaflet, ambos
por CDN. Es mantenible por un consultor, no requiere un perfil de desarrollo frontend. El panel
se organiza en **seis pestañas temáticas** —población y renta, oferta de alojamiento, demanda y
ocupación, precios y valoración, empleo y economía, y clima—; la pestaña activa va en el
fragmento de la URL, de modo que cualquiera de ellas se puede enlazar y compartir. Una temática
que no logre publicar ningún dato se oculta entera en lugar de quedarse anunciando el hueco.

## Instalación y ejecución

```bash
git clone https://github.com/JoseHino/observatorio-benahavis.git
cd observatorio-benahavis
python -m venv .venv && .venv\Scripts\activate      # en Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                 # y rellenar AEMET_API_KEY
python run_pipeline.py
```

Para ver el sitio en local:

```bash
cd docs && python -m http.server 8000
```

### Ejecución parcial

```bash
python run_pipeline.py --listar          # lista los bloques disponibles
python run_pipeline.py --bloques 1 4     # solo demografía y mercado de trabajo
```

Los bloques están aislados: si una fuente cae, se registra el fallo, se conserva el dato
publicado anteriormente y el bloque queda marcado como desactualizado en `docs/data/meta.json`.
El pipeline no se detiene ni escribe datos de relleno.

### Bloques

| Nº | Bloque | Salida | Notas |
|----|--------|--------|-------|
| 1 | Demografía y renta | `demografia.json` | Padrón, Atlas de Renta e índice de Gini del INE |
| 2 | Oferta turística | `oferta.json` | RTA georreferenciado e INE experimental, en gráficos separados |
| 3 | Demanda turística | `demanda.json` | Posicionamiento móvil vía Dataestur (~30 MB por año) y EOH de la zona turística Costa del Sol, etiquetada como supramunicipal |
| 4 | Mercado de trabajo | `trabajo.json` | SEPE y Seguridad Social; descarga **incremental** |
| 5 | Economía y finanzas | `economia.json` | Deuda viva del Ministerio de Hacienda |
| 6 | Clima | `clima.json` | AEMET, estación municipal `6069X`; requiere clave |
| 7 | Conteo de visitantes | `visitantes.json` | Decreto 72/2017; módulo preparado, a la espera de datos |
| 8 | Big Data Costa del Sol | `costadelsol.json` | Ocupación y precio de la vivienda turística, serie histórica del RTA, precios de portales, empleo por subsector y microdato EOH |

## Variables de entorno

Se leen de `.env` en local y de los **secretos del repositorio** en GitHub Actions. Nunca se
escriben en el código ni se suben al repositorio; el cliente HTTP además **oculta cualquier
credencial que viaje en la URL** antes de registrarla en el log.

| Variable | Necesaria para | Cómo obtenerla |
|---|---|---|
| `AEMET_API_KEY` | Bloque 6 (clima) | https://opendata.aemet.es/centrodedescargas/altaUsuario |
| `CDS_API_KEY` | Reanálisis ERA5 (opcional, no implementado) | https://cds.climate.copernicus.eu/ |
| `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` | NDVI con Sentinel-2 (opcional, no implementado) | Panel del Copernicus Data Space Ecosystem |

Sin `AEMET_API_KEY` el bloque de clima queda vacío y marcado como pendiente; el resto del
pipeline funciona con normalidad.

## Cómo añadir una fuente nueva

1. Verificar el endpoint **contra la fuente real** y anotarlo en
   [`docs/inventario-fuentes.md`](docs/inventario-fuentes.md) con la prueba de que resuelve a
   nivel municipal, su licencia y sus limitaciones conocidas. Sin esa verificación previa la
   fuente no entra.
2. Declarar los indicadores en `config/indicadores.yaml`, con `ambito_territorial`, `es_proxy`,
   `limitaciones` y `estado`.
3. Registrar el endpoint y sus trampas técnicas en `config/fuentes.yaml`.
4. Crear el módulo en `src/extract/`, usando `src.utils.http.descargar*` para que la descarga
   cruda quede archivada y los reintentos sean homogéneos.
5. Añadir la función del bloque en `run_pipeline.py` y registrarla en el diccionario `BLOQUES`,
   con sus llamadas a `serie_temporal()` para la validación.
6. Añadir la dirección pública de la fuente al catálogo `FUENTES` de
   `docs/assets/comun.js`, para que el pie del gráfico enlace a su origen.
7. Pintar en `docs/assets/panel.js` usando el componente `ficha()`, que obliga a declarar título,
   unidad, ámbito territorial, fuente, enlace, referencia y fecha de actualización.

Un indicador que no sea de ámbito municipal **debe** declararse como tal: la etiqueta de ámbito
aparece en el gráfico y es parte del dato.

## Módulo de conteo de visitantes

Para acreditar población turística asistida por la vía de visitas (Decreto 72/2017), el
Ayuntamiento deposita ficheros CSV en `data/visitantes/` con el esquema de
[`docs/plantilla-conteo-visitantes.csv`](docs/plantilla-conteo-visitantes.csv). El pipeline los
incorpora en su siguiente ejecución. Las filas con fecha mal formada o recuento no numérico se
rechazan y se registran, en lugar de aceptarse en silencio.

## Automatización

`.github/workflows/actualizar-datos.yml` se ejecuta el **día 5 de cada mes** —tras la publicación
del SEPE y de la Seguridad Social— y también manualmente. Regenera los JSON de `docs/data/` y
comitea solo si hay cambios reales.

## Licencia

El código se publica bajo licencia MIT (ver [`LICENSE`](LICENSE)).

Los **datos** pertenecen a sus organismos productores y se redistribuyen conforme a sus
respectivas condiciones de reutilización, detalladas en la
[página de metodología](https://josehino.github.io/observatorio-benahavis/metodologia.html).
Al reutilizarlos debe citarse la fuente original —INE, IECA, SEPE, Seguridad Social, Junta de
Andalucía, SEGITTUR, AEMET o Ministerio de Hacienda—, no este observatorio.
