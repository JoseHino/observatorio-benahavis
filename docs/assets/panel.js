/* Observatorio de Benahavís — construcción del panel principal.
   Cada bloque se pinta de forma independiente: si un JSON falta, su sección
   queda documentada como sin datos y el resto de la página sigue funcionando. */

import {
  PALETA, MESES, FUENTES, num, periodoLargo, periodoCorto, cargar,
  ficha, lectura, cifra, enlaceFuente, baseOpciones, ejeValorHorizontal, pintar,
  activarPestanas, ocultarPestana, redibujar
} from './comun.js';

const RUPTURA_CNAE = '2026-01';
let META = null;
/** Explotación municipal del Big Data de Turismo Costa del Sol; alimenta varias pestañas. */
let CDS = null;

/** Fuente que se cita en toda ficha procedente del Big Data de Turismo Costa del Sol. */
const FUENTE_CDS = 'Turismo y Planificación Costa del Sol (Diputación de Málaga), Big Data';

function fechaActualizacion() {
  if (!META?.generado) return '—';
  return new Date(META.generado).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'long', year: 'numeric' });
}

function anexar(idContenedor, elemento) {
  const c = document.getElementById(idContenedor);
  if (c) c.appendChild(elemento);
}

/**
 * Retira del observatorio la temática que no ha podido publicar ningún dato.
 *
 * El panel no muestra huecos: una pestaña sin datos se oculta entera en lugar de
 * quedarse en pantalla anunciando lo que falta.
 */
function sinDatos(pestana) {
  ocultarPestana(pestana);
}

/** Etiqueta corta de periodo trimestral: «2026-06» → «2T 2026». */
function trimestre(t) {
  const [a, m] = t.split('-');
  return `${Math.ceil(Number(m) / 3)}T ${a}`;
}

/* ══════════════════════════════════════════════════ Bloque 1 · Demografía */
async function demografia() {
  const d = await cargar('demografia');
  if (!d?.padron?.total?.length) return sinDatos('poblacion');

  const serie = d.padron.total;
  const ult = serie[serie.length - 1];
  const previo = serie[serie.length - 2];
  const variacion = previo ? ((ult.v - previo.v) / previo.v) * 100 : null;
  const hace10 = serie[Math.max(0, serie.length - 11)];

  document.getElementById('dato-poblacion').textContent = `${num(ult.v)} hab. (${ult.t})`;

  const rentaP = d.renta?.renta_neta_persona || [];
  const rentaH = d.renta?.renta_neta_hogar || [];
  const uRentaP = rentaP[rentaP.length - 1];
  const uRentaH = rentaH[rentaH.length - 1];

  anexar('cifras-demografia', cifra('Población empadronada', num(ult.v), 'hab.',
    `A 1 de enero de ${ult.t}`));
  anexar('cifras-demografia', cifra('Variación interanual',
    variacion === null ? '—' : `${variacion > 0 ? '+' : ''}${num(variacion, 1)}`, '%',
    previo ? `Respecto a ${previo.t}` : ''));
  anexar('cifras-demografia', cifra('Crecimiento en diez años',
    hace10 ? `+${num(((ult.v - hace10.v) / hace10.v) * 100, 1)}` : '—', '%',
    hace10 ? `${hace10.t} — ${ult.t}` : ''));
  anexar('cifras-demografia', cifra('Renta neta media por persona',
    uRentaP ? num(uRentaP.v) : '—', '€', uRentaP ? `Ejercicio ${uRentaP.t}` : ''));
  anexar('cifras-demografia', cifra('Renta neta media por hogar',
    uRentaH ? num(uRentaH.v) : '—', '€', uRentaH ? `Ejercicio ${uRentaH.t}` : ''));

  // — Evolución del padrón
  const f1 = ficha({
    titulo: 'Evolución de la población empadronada',
    unidad: 'personas', ambito: 'municipal',
    fuente: 'INE, Cifras oficiales de población de los municipios españoles (tabla 2882)',
    enlace: FUENTES.INE_PADRON,
    referencia: `${serie[0].t}–${ult.t}`, actualizado: fechaActualizacion()
  });
  anexar('graficos-demografia', f1.art);
  pintar(f1.lienzo, {
    ...baseOpciones(),
    legend: { show: false },
    xAxis: { ...baseOpciones().xAxis, data: serie.map((p) => p.t) },
    series: [{
      name: 'Población', type: 'line', symbol: 'none',
      lineStyle: { width: 2.2, color: PALETA[0] },
      areaStyle: { color: 'rgba(29,78,137,.08)' },
      data: serie.map((p) => p.v)
    }]
  });

  // — Población por sexo
  if (d.padron.hombres?.length && d.padron.mujeres?.length) {
    const f2 = ficha({
      titulo: 'Población empadronada por sexo',
      unidad: 'personas', ambito: 'municipal',
      fuente: 'INE, Padrón municipal (tabla 2882)',
      enlace: FUENTES.INE_PADRON,
      referencia: `${d.padron.hombres[0].t}–${ult.t}`, actualizado: fechaActualizacion()
    });
    anexar('graficos-demografia', f2.art);
    pintar(f2.lienzo, {
      ...baseOpciones(),
      xAxis: { ...baseOpciones().xAxis, data: d.padron.hombres.map((p) => p.t) },
      series: [
        { name: 'Hombres', type: 'line', symbol: 'none', lineStyle: { width: 2 },
          data: d.padron.hombres.map((p) => p.v) },
        { name: 'Mujeres', type: 'line', symbol: 'none', lineStyle: { width: 2 },
          data: d.padron.mujeres.map((p) => p.v) }
      ]
    });
  }

  // — Renta media
  if (rentaP.length) {
    const f3 = ficha({
      titulo: 'Renta media de los hogares',
      unidad: 'euros anuales', ambito: 'municipal',
      fuente: 'INE, Atlas de Distribución de Renta de los Hogares (tabla 30824)',
      enlace: FUENTES.INE_RENTA,
      referencia: `${rentaP[0].t}–${uRentaP.t}`, actualizado: fechaActualizacion(),
      nota: 'Calculada sobre el conjunto de la población residente, no sobre declarantes: no comparable con la estadística del IRPF de la AEAT.'
    });
    anexar('graficos-demografia', f3.art);
    const bo = baseOpciones();
    pintar(f3.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: rentaP.map((p) => p.t) },
      yAxis: { ...bo.yAxis,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v / 1000)} k€` } },
      series: [
        { name: 'Renta neta por persona', type: 'bar', barMaxWidth: 26,
          data: rentaP.map((p) => p.v) },
        { name: 'Renta neta por hogar', type: 'line', symbol: 'circle', symbolSize: 6,
          lineStyle: { width: 2.2 }, data: rentaH.map((p) => p.v) }
      ]
    });

    // — Media frente a mediana
    const media = d.renta?.renta_uc_media || [];
    const mediana = d.renta?.renta_uc_mediana || [];
    if (media.length && mediana.length) {
      const f4 = ficha({
        titulo: 'Renta por unidad de consumo: media y mediana',
        unidad: 'euros anuales', ambito: 'municipal',
        fuente: 'INE, Atlas de Distribución de Renta de los Hogares (tabla 30824)',
        enlace: FUENTES.INE_RENTA,
        referencia: `${media[0].t}–${media[media.length - 1].t}`,
        actualizado: fechaActualizacion(),
        nota: 'La distancia entre media y mediana indica el grado de dispersión de la renta.'
      });
      anexar('graficos-demografia', f4.art);
      pintar(f4.lienzo, {
        ...baseOpciones(),
        xAxis: { ...baseOpciones().xAxis, data: media.map((p) => p.t) },
        series: [
          { name: 'Media', type: 'line', symbol: 'none', lineStyle: { width: 2.2 },
            data: media.map((p) => p.v) },
          { name: 'Mediana', type: 'line', symbol: 'none',
            lineStyle: { width: 2.2, type: 'dashed' }, data: mediana.map((p) => p.v) }
        ]
      });
    }
  }

  // — Desigualdad en el reparto de la renta
  const gini = d.desigualdad?.gini || [];
  const p80 = d.desigualdad?.p80_p20 || [];
  const uGini = gini[gini.length - 1];
  const uP80 = p80[p80.length - 1];
  if (gini.length) {
    anexar('cifras-demografia', cifra('Índice de Gini', num(uGini.v, 1), '',
      `Escala 0–100 · ejercicio ${uGini.t}`));

    const f5 = ficha({
      titulo: 'Desigualdad en el reparto de la renta',
      unidad: 'índice de Gini (0–100) y razón P80/P20', ambito: 'municipal',
      fuente: 'INE, Atlas de Distribución de Renta de los Hogares (tabla 37677)',
      enlace: FUENTES.INE_GINI,
      referencia: `${gini[0].t}–${uGini.t}`, actualizado: fechaActualizacion(),
      nota: 'El índice de Gini vale 0 en el reparto perfectamente igualitario y 100 en el de máxima concentración. El P80/P20 es la razón entre la renta del quintil superior y la del inferior. Ambos miden el reparto, no el nivel: son independientes de la renta media.'
    });
    anexar('graficos-demografia', f5.art);
    const bg = baseOpciones();
    pintar(f5.lienzo, {
      ...bg,
      xAxis: { ...bg.xAxis, data: gini.map((p) => p.t) },
      yAxis: [
        { ...bg.yAxis, name: 'Gini', nameTextStyle: { fontSize: 11, color: '#6b7883' },
          min: 0, max: 100 },
        // El eje del P80/P20 se fija a 0–10 —y no al máximo de la serie— para que la
        // línea quede a la altura de las barras del Gini. Con la escala automática se
        // dibujaba muy por encima de ellas y sugería una desigualdad mayor que la real.
        { ...bg.yAxis, name: 'P80/P20', nameTextStyle: { fontSize: 11, color: '#6b7883' },
          min: 0, max: Math.max(10, Math.ceil(Math.max(...p80.map((p) => p.v)))),
          splitLine: { show: false },
          axisLabel: { ...bg.yAxis.axisLabel, formatter: (v) => num(v, 1) } }
      ],
      series: [
        { name: 'Índice de Gini', type: 'bar', barMaxWidth: 26, yAxisIndex: 0,
          data: gini.map((p) => p.v) },
        { name: 'Razón P80/P20', type: 'line', yAxisIndex: 1, symbol: 'circle',
          symbolSize: 6, lineStyle: { width: 2.2 }, data: p80.map((p) => p.v) }
      ]
    });
  }

  anexar('lectura-demografia', lectura(
    `El municipio registra ${num(ult.v)} habitantes empadronados a 1 de enero de ${ult.t}, ` +
    `frente a ${num(hace10.v)} en ${hace10.t}, lo que supone un crecimiento del ` +
    `${num(((ult.v - hace10.v) / hace10.v) * 100, 1)} % en la última década (INE, Padrón municipal). ` +
    (uRentaP ? `La renta neta media por persona alcanza ${num(uRentaP.v)} euros en ${uRentaP.t} y la ` +
      `renta neta media por hogar ${num(uRentaH.v)} euros (INE, Atlas de Distribución de Renta de los ` +
      `Hogares). ` : '') +
    (uGini ? `El índice de Gini se sitúa en ${num(uGini.v, 1)} sobre 100 en ${uGini.t}` +
      (uP80 ? `, con una razón P80/P20 de ${num(uP80.v, 1)}` : '') +
      (gini.length > 1 ? `, frente a ${num(gini[0].v, 1)} en ${gini[0].t}` : '') +
      `: el reparto de la renta es notablemente más desigual que el nivel medio del municipio ` +
      `permite suponer, aunque la brecha se ha estrechado a lo largo de la serie. ` : '') +
    `Se advierte que la cifra padronal no recoge la población estacional ni a los residentes no ` +
    `empadronados, por lo que la población efectivamente presente en el municipio es superior a la ` +
    `registrada. Esta diferencia resulta relevante para el dimensionamiento de los servicios públicos.`
  ));
}

/* ══════════════════════════════════════════════════ Bloque 2 · Oferta */
async function oferta() {
  const d = await cargar('oferta');
  if (!d?.rta) return sinDatos('oferta');

  const rta = d.rta;
  const tipos = Object.entries(rta.por_tipo);
  const hoteles = rta.por_tipo['Establecimiento Hotelero'];
  const vutRta = rta.por_tipo['Vivienda de uso turístico'];
  const ine = d.ine_experimental || {};
  const uV = ine.viviendas?.[ine.viviendas.length - 1];
  const uP = ine.plazas?.[ine.plazas.length - 1];
  const uPct = ine.porcentaje_sobre_censadas?.[ine.porcentaje_sobre_censadas.length - 1];

  anexar('cifras-oferta', cifra('Inscripciones en el RTA', num(rta.total_inscripciones), '',
    'Registro de Turismo de Andalucía'));
  anexar('cifras-oferta', cifra('Plazas de alojamiento registradas', num(rta.plazas_alojamiento), '',
    'Suma de plazas declaradas al RTA'));
  anexar('cifras-oferta', cifra('Establecimientos hoteleros',
    hoteles ? num(hoteles.establecimientos) : '0', '',
    hoteles ? `${num(hoteles.plazas)} plazas hoteleras` : ''));
  anexar('cifras-oferta', cifra('Viviendas de uso turístico inscritas',
    vutRta ? num(vutRta.establecimientos) : '0', '',
    vutRta ? `${num(vutRta.plazas)} plazas` : ''));
  anexar('cifras-oferta', cifra('Viviendas turísticas anunciadas',
    uV ? num(uV.v) : '—', '', uV ? `INE experimental, ${periodoLargo(uV.t)}` : ''));
  anexar('cifras-oferta', cifra('Peso sobre el parque residencial',
    uPct ? num(uPct.v, 1) : '—', '%', uPct ? `INE experimental, ${periodoLargo(uPct.t)}` : ''));

  const bo = baseOpciones();

  // — Plazas por tipología (RTA)
  const conPlazas = tipos.filter(([, v]) => v.plazas > 0).sort((a, b) => a[1].plazas - b[1].plazas);
  const f1 = ficha({
    titulo: 'Plazas de alojamiento por tipología, según el Registro de Turismo de Andalucía',
    unidad: 'plazas', ambito: 'municipal',
    fuente: 'Junta de Andalucía, OpenRTA',
    enlace: FUENTES.OPENRTA,
    referencia: 'Inscripciones vigentes', actualizado: fechaActualizacion(),
    nota: 'Oferta inscrita administrativamente.'
  });
  anexar('graficos-oferta', f1.art);
  pintar(f1.lienzo, {
    ...bo,
    legend: { show: false },
    grid: { left: 16, right: 66, top: 18, bottom: 10, containLabel: true },
    tooltip: { ...bo.tooltip, trigger: 'item' },
    xAxis: ejeValorHorizontal(),
    yAxis: { type: 'category', data: conPlazas.map(([k]) => k),
             axisLine: { lineStyle: { color: '#d8dee5' } }, axisTick: { show: false },
             // `width` fuerza el ajuste de línea; sin margen suficiente ECharts recorta
             // la etiqueta en lugar de partirla («Establecimiento Hotelero»).
             axisLabel: { fontSize: 11.5, color: '#4a5866', width: 132,
                          overflow: 'break', lineHeight: 14 } },
    series: [{
      type: 'bar', barMaxWidth: 22, data: conPlazas.map(([, v]) => v.plazas),
      itemStyle: { color: PALETA[0] },
      label: { show: true, position: 'right', fontSize: 11.5, color: '#4a5866',
               formatter: (p) => num(p.value) }
    }]
  });

  // — Altas acumuladas en el RTA
  if (rta.acumulado_altas?.length) {
    const acum = rta.acumulado_altas;
    const f2 = ficha({
      titulo: 'Inscripciones acumuladas en el Registro de Turismo de Andalucía',
      unidad: 'inscripciones', ambito: 'municipal',
      fuente: 'Junta de Andalucía, OpenRTA',
      enlace: FUENTES.OPENRTA,
      referencia: `Por año de alta, ${acum[0].t}–${acum[acum.length - 1].t}`,
      actualizado: fechaActualizacion(),
      nota: 'Recoge únicamente las inscripciones vivas en la fecha de descarga, no las bajas históricas.'
    });
    anexar('graficos-oferta', f2.art);
    pintar(f2.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: acum.map((p) => p.t) },
      series: [{
        name: 'Inscripciones acumuladas', type: 'line', step: 'end', symbol: 'none',
        lineStyle: { width: 2.2, color: PALETA[0] },
        areaStyle: { color: 'rgba(29,78,137,.08)' },
        data: acum.map((p) => p.v)
      }]
    });
  }

  // — INE experimental, en gráfico separado por exigencia metodológica
  if (ine.viviendas?.length) {
    const f3 = ficha({
      titulo: 'Viviendas turísticas anunciadas en plataformas (estadística experimental del INE)',
      unidad: 'viviendas y plazas', ambito: 'municipal-experimental',
      fuente: 'INE, Viviendas turísticas en España (tablas 39363 y 39366)',
      enlace: FUENTES.INE_VUT,
      referencia: `${periodoLargo(ine.viviendas[0].t)} – ${periodoLargo(uV.t)}`,
      actualizado: fechaActualizacion(),
      nota: 'Mide oferta ANUNCIADA en plataformas; no es la misma magnitud que el registro administrativo del gráfico anterior.'
    });
    anexar('graficos-oferta', f3.art);
    pintar(f3.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: ine.viviendas.map((p) => periodoCorto(p.t)) },
      yAxis: [
        { type: 'value', name: 'Viviendas', nameTextStyle: { fontSize: 11, color: '#6b7883' },
          splitLine: { lineStyle: { color: '#eef1f4' } },
          axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => num(v) } },
        { type: 'value', name: 'Plazas', nameTextStyle: { fontSize: 11, color: '#6b7883' },
          splitLine: { show: false },
          axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => num(v) } }
      ],
      series: [
        { name: 'Viviendas turísticas', type: 'bar', barMaxWidth: 24,
          data: ine.viviendas.map((p) => p.v) },
        { name: 'Plazas', type: 'line', yAxisIndex: 1, symbol: 'circle', symbolSize: 5,
          lineStyle: { width: 2.2 }, data: (ine.plazas || []).map((p) => p.v) }
      ]
    });
  }

  // — Serie histórica de la oferta inscrita (Big Data de Turismo Costa del Sol).
  //   El RTA en vivo solo da la foto de hoy; esta explotación conserva la evolución.
  const hist = CDS?.oferta;
  if (hist?.meses?.length) {
    const meses = hist.meses;
    const tipologias = Object.entries(hist.por_tipologia)
      .sort((a, b) => (b[1][b[1].length - 1]?.plazas || 0) - (a[1][a[1].length - 1]?.plazas || 0));
    const f4 = ficha({
      titulo: 'Evolución histórica de las plazas inscritas, por tipología',
      unidad: 'plazas', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, sobre el Registro de Turismo de Andalucía`,
      enlace: FUENTES.CDS_OFERTA,
      referencia: `${periodoLargo(meses[0])} – ${periodoLargo(meses[meses.length - 1])}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'Misma fuente registral que el primer gráfico, con la serie histórica que el registro en vivo no conserva. Febrero de 2022 aparece duplicado en el fichero de origen; el observatorio no corrige el dato ajeno y deja constancia del salto en el informe de validación.'
    });
    anexar('graficos-oferta', f4.art);
    pintar(f4.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: meses.map((t) => periodoCorto(t)) },
      series: tipologias.map(([nombre, serie]) => {
        const porMes = Object.fromEntries(serie.map((p) => [p.t, p.plazas]));
        return {
          name: nombre, type: 'line', stack: 'plazas', symbol: 'none',
          areaStyle: { opacity: 0.85 }, lineStyle: { width: 0.8 },
          data: meses.map((t) => porMes[t] ?? 0)
        };
      })
    });

    const total = hist.total;
    const ultimoTotal = total[total.length - 1];
    const f5 = ficha({
      titulo: 'Establecimientos inscritos en el municipio',
      unidad: 'establecimientos', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, sobre el Registro de Turismo de Andalucía`,
      enlace: FUENTES.CDS_OFERTA,
      referencia: `${periodoLargo(meses[0])} – ${periodoLargo(ultimoTotal.t)}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'La curva recoge el efecto de la inscripción obligatoria de las viviendas con fines turísticos, que multiplica el número de establecimientos sin multiplicar en la misma medida las plazas. El pico de febrero de 2022 es un duplicado del fichero de origen, no una alta real.'
    });
    anexar('graficos-oferta', f5.art);
    pintar(f5.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: total.map((p) => periodoCorto(p.t)) },
      tooltip: { ...bo.tooltip,
        formatter: (ps) => {
          const p = total[ps[0].dataIndex];
          return `${periodoLargo(p.t)}<br><strong>${num(p.establecimientos)}</strong> establecimientos`
            + `<br>${num(p.plazas)} plazas`;
        } },
      series: [{
        name: 'Establecimientos', type: 'line', symbol: 'none',
        lineStyle: { width: 2.2, color: PALETA[1] },
        areaStyle: { color: 'rgba(47,158,143,.10)' },
        data: total.map((p) => p.establecimientos)
      }]
    });
  }

  // — Comparación explícita de los dos universos, en tabla y no en gráfico
  const cont = document.getElementById('tabla-oferta');
  const rot = document.createElement('h3');
  rot.className = 'ficha__titulo';
  rot.style.margin = '0 0 10px';
  rot.textContent = 'Las dos mediciones de la vivienda turística, una junto a otra';
  const marco = document.createElement('div');
  marco.className = 'tabla-marco';
  marco.innerHTML = `
    <table>
      <thead><tr>
        <th>Fuente</th><th>Qué mide</th><th class="num">Viviendas turísticas</th>
        <th class="num">Plazas</th><th>Referencia</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><strong>Registro de Turismo de Andalucía</strong></td>
          <td>Oferta inscrita administrativamente (registro nominal)</td>
          <td class="num">${vutRta ? num(vutRta.establecimientos) : '—'}</td>
          <td class="num">${vutRta ? num(vutRta.plazas) : '—'}</td>
          <td>Inscripciones vigentes</td>
        </tr>
        <tr>
          <td><strong>INE, estadística experimental</strong></td>
          <td>Oferta anunciada en plataformas de intermediación</td>
          <td class="num">${uV ? num(uV.v) : '—'}</td>
          <td class="num">${uP ? num(uP.v) : '—'}</td>
          <td>${uV ? periodoLargo(uV.t) : '—'}</td>
        </tr>
      </tbody>
    </table>`;
  const pieTabla = document.createElement('p');
  pieTabla.style.cssText = 'font-size:12px;color:#6b7883;margin:9px 0 0';
  pieTabla.innerHTML = 'Las dos filas <strong>no son alternativas de un mismo dato</strong>: '
    + 'cuentan universos distintos. Se muestran juntas para hacer visible la divergencia, '
    + 'no para elegir entre ellas.';
  cont.append(rot, marco, pieTabla);

  mapaOferta(rta);

  anexar('lectura-oferta', lectura(
    `El Registro de Turismo de Andalucía contabiliza ${num(rta.total_inscripciones)} inscripciones ` +
    `con domicilio en el municipio, que suman ${num(rta.plazas_alojamiento)} plazas de alojamiento. ` +
    `La vivienda de uso turístico concentra ${vutRta ? num(vutRta.establecimientos) : 0} de esas ` +
    `inscripciones, frente a ${hoteles ? hoteles.establecimientos : 0} establecimientos hoteleros con ` +
    `${hoteles ? num(hoteles.plazas) : 0} plazas. ` +
    (uV ? `La estadística experimental del INE estima ${num(uV.v)} viviendas anunciadas en plataformas ` +
      `en ${periodoLargo(uV.t)}, equivalentes al ${uPct ? num(uPct.v, 1) : '—'} % del parque residencial ` +
      `censado. ` : '') +
    `La divergencia entre ambas cifras es estructural y responde a que registran universos distintos: ` +
    `inscripción administrativa frente a anuncio en plataforma.`
  ));
}

function mapaOferta(rta) {
  const nodo = document.getElementById('mapa-oferta');
  if (!nodo || !rta.puntos?.length) return;

  const mapa = L.map(nodo, { scrollWheelZoom: false });
  // Se expone para poder recalcular su tamaño al abrir la pestaña: un mapa creado
  // dentro de un panel oculto se dibuja con el contenedor a cero y sale en blanco.
  window.MAPA_OFERTA = mapa;
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO', maxZoom: 19
  }).addTo(mapa);

  const colores = {
    'Establecimiento Hotelero': '#a8456a',
    'Vivienda de uso turístico': '#1d4e89',
    'Vivienda turística de alojamiento rural': '#2f9e8f'
  };

  const capa = L.layerGroup().addTo(mapa);
  rta.puntos.forEach((p) => {
    const hotel = p.tipo === 'Establecimiento Hotelero';
    L.circleMarker([p.lat, p.lon], {
      radius: hotel ? 8 : 4,
      color: '#fff', weight: hotel ? 1.6 : 0.7,
      fillColor: colores[p.tipo] || '#6b7883', fillOpacity: hotel ? 0.95 : 0.62
    }).bindPopup(
      `<strong>${p.nombre || 'Sin denominación'}</strong><br>${p.tipo}` +
      `${p.categoria ? `<br>${p.categoria}` : ''}<br>${num(p.plazas)} plazas`
    ).addTo(capa);
  });

  // El encuadre se guarda además de aplicarse: si el mapa se creó con su pestaña
  // oculta, el contenedor medía cero y el ajuste inicial no sirve de nada. Al
  // abrir la pestaña hay que recalcular tamaño y volver a encuadrar.
  const encuadre = L.featureGroup(capa.getLayers()).getBounds();
  mapa.MI_ENCUADRE = encuadre;
  mapa.fitBounds(encuadre, { padding: [24, 24] });

  const leyenda = L.control({ position: 'bottomright' });
  leyenda.onAdd = () => {
    const div = L.DomUtil.create('div');
    div.style.cssText = 'background:#fff;padding:9px 12px;border:1px solid #d8dee5;'
      + 'border-radius:4px;font-size:11.5px;line-height:1.8;box-shadow:0 1px 4px rgba(0,0,0,.1)';
    div.innerHTML = Object.entries(colores).map(([k, c]) =>
      `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;`
      + `background:${c};margin-right:6px"></span>${k}</div>`).join('');
    return div;
  };
  leyenda.addTo(mapa);

  document.getElementById('meta-mapa').textContent =
    `${num(rta.puntos.length)} alojamientos georreferenciados`;
  document.getElementById('pie-mapa').innerHTML =
    `<strong>Fuente:</strong> `
    + `${enlaceFuente('Junta de Andalucía, Registro de Turismo de Andalucía (OpenRTA)', FUENTES.OPENRTA)}. `
    + `Coordenadas originales en EPSG:25830, transformadas a WGS84. `
    + `De los ${num(rta.total_inscripciones)} registros del municipio se representan `
    + `${num(rta.puntos.length)} alojamientos; ${num(rta.alojamientos_sin_coordenadas)} carecen de `
    + `coordenada y ${num(rta.alojamientos_coordenada_erronea)} la tienen fuera del entorno del `
    + `municipio en el registro de origen. Ninguna coordenada se ha corregido ni estimado. `
    + `Actualizado el ${fechaActualizacion()}.`;
}

/* ══════════════════════════════════════════════════ Bloque 3 · Demanda */
async function demanda() {
  const d = await cargar('demanda');
  const pob = (await cargar('demografia'))?.poblacion_actual;

  if (!d?.receptor?.serie?.length) return sinDatos('demanda');

  const r = d.receptor;
  const serie = r.serie;
  const ult = serie[serie.length - 1];
  const ventana = serie.slice(-12);
  const total12 = ventana.reduce((s, p) => s + p.v, 0);
  const interno = d.interno?.serie || [];
  const ultInterno = interno[interno.length - 1];

  // Estacionalidad sobre los años naturales completos.
  const porAnyo = {};
  serie.forEach((p) => {
    const a = p.t.slice(0, 4);
    (porAnyo[a] = porAnyo[a] || []).push(p);
  });
  const completos = Object.keys(porAnyo).filter((a) => porAnyo[a].length === 12).sort();
  const anyoRef = completos[completos.length - 1];
  const mesesRef = anyoRef ? porAnyo[anyoRef] : [];
  const maxRef = mesesRef.length ? Math.max(...mesesRef.map((p) => p.v)) : null;
  const minRef = mesesRef.length ? Math.min(...mesesRef.map((p) => p.v)) : null;

  anexar('cifras-demanda', cifra('Turistas extranjeros', num(ult.v), '', periodoLargo(ult.t)));
  anexar('cifras-demanda', cifra('Acumulado de doce meses', num(total12), '',
    `${periodoLargo(ventana[0].t)} – ${periodoLargo(ult.t)}`));
  if (pob) {
    anexar('cifras-demanda', cifra('Turistas por habitante y año',
      num(total12 / pob.v, 1), '', `Sobre ${num(pob.v)} habitantes empadronados`));
  }
  if (maxRef && minRef) {
    anexar('cifras-demanda', cifra('Razón de estacionalidad',
      `${num(maxRef / minRef, 1)}`, '×', `Mes máximo entre mes mínimo, ${anyoRef}`));
  }
  if (ultInterno) {
    anexar('cifras-demanda', cifra('Turistas nacionales', num(ultInterno.v), '',
      periodoLargo(ultInterno.t)));
  }
  const ocupacionVut = (CDS?.vivienda_turistica?.serie || []).filter((p) => p.ocupacion !== null);
  const ultOcupacion = ocupacionVut[ocupacionVut.length - 1];
  if (ultOcupacion) {
    anexar('cifras-demanda', cifra('Ocupación de la vivienda turística',
      num(ultOcupacion.ocupacion, 1), '%',
      `${periodoLargo(ultOcupacion.t)} · dato municipal`));
  }

  const bo = baseOpciones();

  // — Serie mensual
  const f1 = ficha({
    titulo: 'Turistas extranjeros con destino Benahavís',
    unidad: 'turistas al mes', ambito: 'municipal-experimental',
    fuente: 'INE, medición del turismo receptor a partir de la posición de los teléfonos móviles (vía Dataestur, SEGITTUR)',
    enlace: FUENTES.DATAESTUR_MOVIL,
    referencia: `${periodoLargo(serie[0].t)} – ${periodoLargo(ult.t)}`,
    actualizado: fechaActualizacion(), alto: true,
    nota: 'Estadística experimental; no equivale a pernoctaciones en alojamiento reglado. La banda sombreada señala el periodo de restricciones de movilidad por la pandemia.'
  });
  anexar('graficos-demanda', f1.art);
  pintar(f1.lienzo, {
    ...bo,
    legend: { show: false },
    xAxis: { ...bo.xAxis, data: serie.map((p) => periodoCorto(p.t)) },
    tooltip: { ...bo.tooltip,
      formatter: (ps) => `${periodoLargo(serie[ps[0].dataIndex].t)}<br><strong>${num(ps[0].value)}</strong> turistas` },
    series: [{
      name: 'Turistas extranjeros', type: 'line', symbol: 'none',
      lineStyle: { width: 2, color: PALETA[0] },
      areaStyle: { color: 'rgba(29,78,137,.10)' },
      data: serie.map((p) => p.v),
      markArea: {
        silent: true,
        itemStyle: { color: 'rgba(168,69,106,.07)' },
        label: { show: false },
        data: [[{ xAxis: periodoCorto('2020-03') }, { xAxis: periodoCorto('2021-06') }]]
      }
    }]
  });

  // — Estacionalidad por año
  if (completos.length) {
    const ultimos = completos.slice(-4);
    const f2 = ficha({
      titulo: 'Perfil estacional de la demanda, por año natural completo',
      unidad: 'turistas al mes', ambito: 'municipal-experimental',
      fuente: 'INE, posicionamiento de telefonía móvil (vía Dataestur)',
      enlace: FUENTES.DATAESTUR_MOVIL,
      referencia: ultimos.join(', '), actualizado: fechaActualizacion(), alto: true
    });
    anexar('graficos-demanda', f2.art);
    pintar(f2.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: MESES.map((m) => m.slice(0, 3)) },
      series: ultimos.map((a, i) => ({
        name: a, type: 'line', symbol: 'circle', symbolSize: 4,
        lineStyle: { width: i === ultimos.length - 1 ? 2.6 : 1.6 },
        data: porAnyo[a].slice().sort((x, y) => x.t.localeCompare(y.t)).map((p) => p.v)
      }))
    });
  }

  // — Países de origen
  if (r.top_paises_12m?.length) {
    const top = r.top_paises_12m.slice(0, 12).slice().reverse();
    const f3 = ficha({
      titulo: 'Procedencia de los turistas extranjeros, acumulado de doce meses',
      unidad: 'turistas', ambito: 'municipal-experimental',
      fuente: 'INE, posicionamiento de telefonía móvil (vía Dataestur)',
      enlace: FUENTES.DATAESTUR_MOVIL,
      referencia: `${periodoLargo(r.ventana_12m[0])} – ${periodoLargo(r.ventana_12m[r.ventana_12m.length - 1])}`,
      actualizado: fechaActualizacion(), alto: true
    });
    anexar('graficos-demanda', f3.art);
    pintar(f3.lienzo, {
      ...bo,
      legend: { show: false },
      grid: { left: 14, right: 64, top: 12, bottom: 8, containLabel: true },
      tooltip: { ...bo.tooltip, trigger: 'item' },
      xAxis: ejeValorHorizontal(),
      yAxis: { type: 'category', data: top.map((p) => p.pais),
               axisLine: { lineStyle: { color: '#d8dee5' } }, axisTick: { show: false },
               axisLabel: { fontSize: 11.5, color: '#4a5866' } },
      series: [{
        type: 'bar', barMaxWidth: 16, itemStyle: { color: PALETA[0] },
        data: top.map((p) => p.v),
        label: { show: true, position: 'right', fontSize: 11, color: '#4a5866',
                 formatter: (p) => num(p.value) }
      }]
    });
  }

  // — Turismo interno
  if (d.interno?.top_origenes?.length) {
    const top = d.interno.top_origenes.slice(0, 12).slice().reverse();
    const f4 = ficha({
      titulo: 'Turistas nacionales con destino Benahavís, por municipio de origen',
      unidad: 'turistas', ambito: 'municipal-experimental',
      fuente: 'INE, medición del turismo interno a partir de la posición de los teléfonos móviles (vía Dataestur)',
      enlace: FUENTES.DATAESTUR_MOVIL,
      referencia: `Años ${d.interno.anyos.join(' y ')}`,
      actualizado: fechaActualizacion(), alto: true
    });
    anexar('graficos-demanda', f4.art);
    pintar(f4.lienzo, {
      ...bo,
      legend: { show: false },
      grid: { left: 14, right: 64, top: 12, bottom: 8, containLabel: true },
      tooltip: { ...bo.tooltip, trigger: 'item' },
      xAxis: ejeValorHorizontal(),
      yAxis: { type: 'category', data: top.map((p) => p.municipio),
               axisLine: { lineStyle: { color: '#d8dee5' } }, axisTick: { show: false },
               axisLabel: { fontSize: 11.5, color: '#4a5866' } },
      series: [{
        type: 'bar', barMaxWidth: 16, itemStyle: { color: PALETA[1] },
        data: top.map((p) => p.v),
        label: { show: true, position: 'right', fontSize: 11, color: '#4a5866',
                 formatter: (p) => num(p.value) }
      }]
    });
  }

  // — Ocupación de la vivienda turística: la única serie de ocupación de alojamiento
  //   con ámbito estrictamente municipal que existe para Benahavís.
  const vut = CDS?.vivienda_turistica?.serie || [];
  if (vut.length) {
    const conOcupacion = vut.filter((p) => p.ocupacion !== null);
    const ultVut = conOcupacion[conOcupacion.length - 1];
    const fVut = ficha({
      titulo: 'Grado de ocupación de la vivienda turística en Benahavís',
      unidad: 'porcentaje de ocupación', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, seguimiento de plataformas de intermediación`,
      enlace: FUENTES.CDS_VIVIENDAS,
      referencia: `${periodoLargo(vut[0].t)} – ${periodoLargo(ultVut.t)}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'Mide la ocupación del alojamiento anunciado en plataformas, no la del alojamiento hotelero reglado.'
    });
    anexar('graficos-demanda', fVut.art);
    pintar(fVut.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: conOcupacion.map((p) => periodoCorto(p.t)) },
      yAxis: { ...bo.yAxis, max: 100,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v)} %` } },
      tooltip: { ...bo.tooltip,
        formatter: (ps) => {
          const p = conOcupacion[ps[0].dataIndex];
          return `${periodoLargo(p.t)}<br><strong>${num(p.ocupacion, 1)} %</strong> de ocupación`
            + `<br>${num(p.viviendas)} viviendas · ${num(p.plazas)} plazas anunciadas`;
        } },
      series: [{
        name: 'Ocupación', type: 'line', symbol: 'none',
        lineStyle: { width: 2, color: PALETA[1] },
        areaStyle: { color: 'rgba(47,158,143,.12)' },
        data: conOcupacion.map((p) => p.ocupacion)
      }]
    });

    // — Perfil estacional de esa ocupación, sobre los años naturales completos.
    const porAnyoVut = {};
    conOcupacion.forEach((p) => {
      const a = p.t.slice(0, 4);
      (porAnyoVut[a] = porAnyoVut[a] || {})[Number(p.t.slice(5, 7))] = p.ocupacion;
    });
    const completosVut = Object.keys(porAnyoVut)
      .filter((a) => Object.keys(porAnyoVut[a]).length === 12).sort().slice(-4);
    if (completosVut.length) {
      const fVutEst = ficha({
        titulo: 'Estacionalidad de la ocupación de la vivienda turística',
        unidad: 'porcentaje de ocupación', ambito: 'municipal',
        fuente: `${FUENTE_CDS}, seguimiento de plataformas de intermediación`,
        enlace: FUENTES.CDS_VIVIENDAS,
        referencia: completosVut.join(', '), actualizado: fechaActualizacion(), alto: true,
        nota: 'Años naturales completos. La distancia entre el mes de máxima y el de mínima ocupación mide la presión estacional efectiva sobre el municipio.'
      });
      anexar('graficos-demanda', fVutEst.art);
      pintar(fVutEst.lienzo, {
        ...bo,
        xAxis: { ...bo.xAxis, data: MESES.map((m) => m.slice(0, 3)) },
        yAxis: { ...bo.yAxis, max: 100,
          axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v)} %` } },
        series: completosVut.map((a, i) => ({
          name: a, type: 'line', symbol: 'circle', symbolSize: 4,
          lineStyle: { width: i === completosVut.length - 1 ? 2.6 : 1.6 },
          data: Array.from({ length: 12 }, (_, m) => porAnyoVut[a][m + 1] ?? null)
        }))
      });
    }
  }

  // — Viajeros y pernoctaciones del microdato de la Encuesta de Ocupación Hotelera.
  const micro = CDS?.eoh;
  if (micro?.serie?.length) {
    const fMicro = ficha({
      titulo: 'Viajeros y pernoctaciones en apartamentos turísticos de Benahavís',
      unidad: 'viajeros y pernoctaciones', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, sobre el microdato de la Encuesta de Ocupación Hotelera del INE`,
      enlace: FUENTES.CDS_VIAJEROS,
      referencia: micro.serie.map((p) => periodoLargo(p.t)).join(', '),
      actualizado: fechaActualizacion(),
      nota: micro.cobertura
    });
    anexar('graficos-demanda', fMicro.art);
    pintar(fMicro.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: micro.serie.map((p) => periodoLargo(p.t)) },
      yAxis: [
        { ...bo.yAxis, name: 'Pernoctaciones', nameTextStyle: { fontSize: 11, color: '#6b7883' } },
        { ...bo.yAxis, name: 'Viajeros', nameTextStyle: { fontSize: 11, color: '#6b7883' },
          splitLine: { show: false } }
      ],
      series: [
        { name: 'Pernoctaciones', type: 'bar', barMaxWidth: 42, itemStyle: { color: PALETA[0] },
          data: micro.serie.map((p) => p.pernoctaciones ?? null) },
        { name: 'Viajeros', type: 'line', yAxisIndex: 1, symbol: 'circle', symbolSize: 7,
          lineStyle: { width: 2.4, color: PALETA[2] }, itemStyle: { color: PALETA[2] },
          data: micro.serie.map((p) => p.viajeros ?? null) }
      ]
    });
  }

  // — Indicador sustitutivo del hueco de pernoctaciones: EOH de la zona turística.
  //   Va después de los indicadores municipales y con ámbito declarado en la ficha,
  //   para que no pueda leerse como una cifra de Benahavís.
  const eoh = d.eoh_zona_turistica;
  const mesesEoh = eoh?.serie_mensual || [];
  if (mesesEoh.length) {
    const ultEoh = eoh.ultimo;
    anexar('cifras-demanda', cifra('Ocupación hotelera Costa del Sol',
      num(ultEoh.ocupacion_plazas, 1), '%',
      `${periodoLargo(ultEoh.t)} · zona turística, dato NO municipal`));

    const f5 = ficha({
      titulo: 'Grado de ocupación hotelera por plazas en la zona turística Costa del Sol',
      unidad: 'porcentaje de plazas ocupadas', ambito: 'zona_turistica',
      fuente: 'INE, Encuesta de Ocupación Hotelera por zonas turísticas (vía Dataestur, SEGITTUR)',
      enlace: FUENTES.DATAESTUR_EOH,
      referencia: `${periodoLargo(mesesEoh[0].t)} – ${periodoLargo(ultEoh.t)}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'Indicador sustitutivo del hueco de pernoctaciones. Describe el alojamiento reglado de toda la zona turística Costa del Sol (Málaga), no el de Benahavís. La banda sombreada señala el periodo de restricciones de movilidad.'
    });
    anexar('graficos-demanda', f5.art);
    pintar(f5.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: mesesEoh.map((m) => periodoCorto(m.t)) },
      yAxis: { ...bo.yAxis, max: 100,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v)} %` } },
      tooltip: { ...bo.tooltip,
        formatter: (ps) => {
          const m = mesesEoh[ps[0].dataIndex];
          return `${periodoLargo(m.t)}<br><strong>${num(m.ocupacion_plazas, 1)} %</strong> de ocupación`
            + `<br>${num(m.pernoctaciones)} pernoctaciones<br>Estancia media ${num(m.estancia_media, 1)} noches`;
        } },
      series: [{
        name: 'Ocupación por plazas', type: 'line', symbol: 'none',
        lineStyle: { width: 1.8, color: PALETA[2] },
        areaStyle: { color: 'rgba(193,116,58,.10)' },
        data: mesesEoh.map((m) => m.ocupacion_plazas),
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(168,69,106,.07)' },
          label: { show: false },
          data: [[{ xAxis: periodoCorto('2020-03') }, { xAxis: periodoCorto('2021-06') }]]
        }
      }]
    });

    // — Pernoctaciones anuales por lugar de residencia, sobre años naturales completos.
    const res = eoh.pernoctaciones_por_residencia || {};
    const anual = eoh.anual || [];
    const anyosEoh = anual.map((a) => a.t);
    const sumaAnual = (puntos) => anyosEoh.map((a) => (puntos || [])
      .filter((p) => p.t.startsWith(a)).reduce((s, p) => s + p.v, 0));
    if (anyosEoh.length) {
      const f6 = ficha({
        titulo: 'Pernoctaciones hoteleras en la zona turística, por lugar de residencia',
        unidad: 'pernoctaciones al año', ambito: 'zona_turistica',
        fuente: 'INE, Encuesta de Ocupación Hotelera por zonas turísticas (vía Dataestur, SEGITTUR)',
        enlace: FUENTES.DATAESTUR_EOH,
        referencia: `${anyosEoh[0]}–${anyosEoh[anyosEoh.length - 1]}, años naturales completos`,
        actualizado: fechaActualizacion(), alto: true,
        nota: 'Ámbito de zona turística. No es dato de Benahavís y no se suma con ningún indicador municipal.'
      });
      anexar('graficos-demanda', f6.art);
      pintar(f6.lienzo, {
        ...bo,
        xAxis: { ...bo.xAxis, data: anyosEoh },
        yAxis: { ...bo.yAxis,
          axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v / 1e6, 1)} M` } },
        series: [
          { name: 'Residentes en España', type: 'bar', stack: 'p', barMaxWidth: 32,
            itemStyle: { color: PALETA[0] }, data: sumaAnual(res.espana) },
          { name: 'Residentes en el extranjero', type: 'bar', stack: 'p', barMaxWidth: 32,
            itemStyle: { color: PALETA[1] }, data: sumaAnual(res.extranjero) }
        ]
      });
    }
  }

  const primerPais = r.top_paises_12m?.[0];
  anexar('lectura-demanda', lectura(
    `En ${periodoLargo(ult.t)} se contabilizan ${num(ult.v)} turistas extranjeros con destino ` +
    `Benahavís, y ${num(total12)} en el acumulado de los doce meses precedentes` +
    (pob ? `, equivalentes a ${num(total12 / pob.v, 1)} turistas por habitante empadronado. ` : '. ') +
    (primerPais ? `El principal mercado emisor es ${primerPais.pais}, con ${num(primerPais.v)} turistas ` +
      `en ese mismo periodo. ` : '') +
    (maxRef && minRef ? `La demanda presenta una concentración estacional de ${num(maxRef / minRef, 1)} ` +
      `veces entre el mes de máxima y el de mínima afluencia de ${anyoRef}. ` : '') +
    `Se reitera que estas cifras proceden de una estadística experimental basada en posicionamiento ` +
    `de telefonía móvil y no son comparables con las pernoctaciones de la Encuesta de Ocupación Hotelera. ` +
    (ultOcupacion ? `La vivienda turística del municipio registra un grado de ocupación del ` +
      `${num(ultOcupacion.ocupacion, 1)} % en ${periodoLargo(ultOcupacion.t)}, sobre ` +
      `${num(ultOcupacion.viviendas)} viviendas y ${num(ultOcupacion.plazas)} plazas anunciadas ` +
      `(Turismo y Planificación Costa del Sol). Es el único indicador de ocupación de alojamiento ` +
      `con ámbito estrictamente municipal disponible para Benahavís. ` : '') +
    (mesesEoh.length ? `Como contexto supramunicipal, y sin atribuirlo al municipio, la zona turística ` +
      `Costa del Sol (Málaga) registra un grado de ocupación por plazas del ` +
      `${num(eoh.ultimo.ocupacion_plazas, 1)} % en ${periodoLargo(eoh.ultimo.t)}, con una estancia media ` +
      `de ${num(eoh.ultimo.estancia_media, 1)} noches (INE, Encuesta de Ocupación Hotelera).` : '')
  ));
}

/* ══════════════════════════════════ Precios y valoración de los alojamientos */
async function precios() {
  const series = CDS?.precios?.series || {};
  const vut = CDS?.vivienda_turistica?.serie || [];
  const nombres = Object.keys(series);
  if (!nombres.length && !vut.length) return sinDatos('precios');

  const bo = baseOpciones();
  const meses = CDS?.precios?.meses || [];

  // El «General» de cada tipología es el agregado ponderado de sus categorías: se
  // usa para las cifras destacadas y se separa del detalle por categoría.
  const general = series['Hoteles · General'] || [];
  const ultGeneral = general[general.length - 1];
  const ultVut = vut.filter((p) => p.precio_plaza !== null).slice(-1)[0];

  if (ultGeneral) {
    anexar('cifras-precios', cifra('Precio medio hotelero', num(ultGeneral.precio), '€',
      `${periodoLargo(ultGeneral.t)} · por habitación y noche`));
    if (ultGeneral.valoracion) {
      anexar('cifras-precios', cifra('Valoración media hotelera',
        num(ultGeneral.valoracion, 1), '/10', `${periodoLargo(ultGeneral.t)} · portal de reservas`));
    }
  }
  if (ultVut) {
    anexar('cifras-precios', cifra('Precio medio de la vivienda turística',
      num(ultVut.precio_plaza), '€', `${periodoLargo(ultVut.t)} · por plaza y noche`));
  }
  const cinco = series['Hoteles · 5 Estrellas'] || [];
  const ultCinco = cinco[cinco.length - 1];
  if (ultCinco) {
    anexar('cifras-precios', cifra('Precio medio en cinco estrellas',
      num(ultCinco.precio), '€', `${periodoLargo(ultCinco.t)} · por habitación y noche`));
  }

  // — Precio por categoría hotelera.
  //   Se representan solo las categorías con muestra sostenida y oferta viva en el
  //   último año. Las categorías residuales —un hostal suelto durante unos meses—
  //   dibujan picos que parecen variaciones de precio y solo reflejan la entrada y
  //   salida de un único establecimiento de la muestra.
  const SOSTENIDA = 36;
  const ultimoAnyo = meses.slice(-12);
  // «Viva» exige oferta en la mitad del último año, no un mes suelto: un hostal que
  // aparece dos meses vuelve a introducir el pico de muestra que se quiere evitar.
  const viva = (nombre, campo) => series[nombre].filter(
    (p) => p[campo] !== null && ultimoAnyo.includes(p.t)).length >= 6;
  const categorias = nombres
    .filter((n) => n.startsWith('Hoteles · ') && !n.endsWith('General'))
    .filter((n) => series[n].filter((p) => p.precio !== null).length >= SOSTENIDA)
    .filter((n) => viva(n, 'precio'));
  if (categorias.length) {
    const f1 = ficha({
      titulo: 'Precio medio por categoría hotelera',
      unidad: 'euros por habitación y noche', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, seguimiento de portales de reserva`,
      enlace: FUENTES.CDS_PRECIOS,
      referencia: `${periodoLargo(meses[0])} – ${periodoLargo(meses[meses.length - 1])}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: `Precio anunciado, no facturado. Los meses sin oferta publicada en una categoría quedan sin punto: no se rellenan. Se representan las categorías con al menos ${SOSTENIDA} meses de muestra y oferta comercializada en el último año.`
    });
    anexar('graficos-precios', f1.art);
    pintar(f1.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: meses.map((t) => periodoCorto(t)) },
      yAxis: { ...bo.yAxis,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v)} €` } },
      series: categorias.map((nombre) => {
        const porMes = Object.fromEntries(series[nombre].map((p) => [p.t, p.precio]));
        return {
          name: nombre.replace('Hoteles · ', ''), type: 'line', symbol: 'none',
          connectNulls: false, lineStyle: { width: 1.9 },
          data: meses.map((t) => porMes[t] ?? null)
        };
      })
    });
  }

  // — Precio de la vivienda turística
  const conPrecio = vut.filter((p) => p.precio_plaza !== null);
  if (conPrecio.length) {
    const f2 = ficha({
      titulo: 'Precio medio por plaza en la vivienda turística',
      unidad: 'euros por plaza y noche', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, seguimiento de plataformas de intermediación`,
      enlace: FUENTES.CDS_VIVIENDAS,
      referencia: `${periodoLargo(conPrecio[0].t)} – ${periodoLargo(ultVut.t)}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'Universo distinto del hotelero: no se compara con el gráfico anterior.'
    });
    anexar('graficos-precios', f2.art);
    pintar(f2.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: conPrecio.map((p) => periodoCorto(p.t)) },
      yAxis: { ...bo.yAxis,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v)} €` } },
      series: [{
        name: 'Precio medio por plaza', type: 'line', symbol: 'none',
        lineStyle: { width: 2, color: PALETA[2] },
        areaStyle: { color: 'rgba(193,116,58,.10)' },
        data: conPrecio.map((p) => p.precio_plaza)
      }]
    });
  }

  // — Valoración de los clientes
  const conValoracion = nombres
    .filter((n) => series[n].filter((p) => p.valoracion).length >= SOSTENIDA)
    .filter((n) => viva(n, 'valoracion'));
  if (conValoracion.length) {
    const f3 = ficha({
      titulo: 'Valoración de los clientes por tipología y categoría',
      unidad: 'puntuación de 0 a 10', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, seguimiento de portales de reserva`,
      enlace: FUENTES.CDS_PRECIOS,
      referencia: `${periodoLargo(meses[0])} – ${periodoLargo(meses[meses.length - 1])}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'Puntuación media de las reseñas publicadas en el portal, en su propia escala. Se representan las series con muestra sostenida en el tiempo.'
    });
    anexar('graficos-precios', f3.art);
    pintar(f3.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: meses.map((t) => periodoCorto(t)) },
      yAxis: { ...bo.yAxis, min: 6, max: 10,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => num(v, 1) } },
      series: conValoracion.map((nombre) => {
        const porMes = Object.fromEntries(series[nombre].map((p) => [p.t, p.valoracion]));
        return {
          name: nombre.replace('Hoteles · ', ''), type: 'line', symbol: 'none',
          connectNulls: false, lineStyle: { width: 1.9 },
          data: meses.map((t) => porMes[t] ?? null)
        };
      })
    });
  }

  const primero = general[0];
  anexar('lectura-precios', lectura(
    (ultGeneral ? `El precio medio anunciado por el conjunto de la planta hotelera del municipio es de ` +
      `${num(ultGeneral.precio)} euros por habitación y noche en ${periodoLargo(ultGeneral.t)}` +
      (primero ? `, frente a ${num(primero.precio)} euros en ${periodoLargo(primero.t)}` : '') + '. ' : '') +
    (ultCinco ? `La categoría de cinco estrellas alcanza ${num(ultCinco.precio)} euros, cifra que ` +
      `sitúa a Benahavís en el segmento alto del litoral occidental. ` : '') +
    (ultVut ? `La vivienda turística se comercializa a ${num(ultVut.precio_plaza)} euros por plaza y ` +
      `noche en ${periodoLargo(ultVut.t)}. ` : '') +
    (ultGeneral?.valoracion ? `La valoración media de los clientes se sitúa en ` +
      `${num(ultGeneral.valoracion, 1)} sobre 10. ` : '') +
    `Se advierte que todas las cifras de esta pestaña son precios anunciados en portales de reserva ` +
    `y no ingresos efectivos: no equivalen a la tarifa media diaria ni al ingreso por habitación ` +
    `disponible que publica la Encuesta de Ocupación Hotelera.`
  ));
}

/* ══════════════════════════════════════════════════ Bloque 4 · Trabajo */
async function trabajo() {
  const d = await cargar('trabajo');
  if (!d?.paro?.serie?.length) return sinDatos('empleo');

  const paro = d.paro.serie;
  const uParo = paro[paro.length - 1];
  const contratos = d.contratos?.serie || [];
  const uContr = contratos[contratos.length - 1];
  const afi = d.afiliacion || {};
  const uAfi = afi.serie_total?.[afi.serie_total.length - 1];
  const uTur = afi.serie_turistico?.[afi.serie_turistico.length - 1];

  const intervalo = (a) => (a ? (a.exacto ? num(a.min) : `${num(a.min)}–${num(a.max)}`) : '—');

  anexar('cifras-trabajo', cifra('Paro registrado', num(uParo.total), '', periodoLargo(uParo.t)));
  anexar('cifras-trabajo', cifra('Contratos registrados', uContr ? num(uContr.total) : '—', '',
    uContr ? periodoLargo(uContr.t) : ''));
  anexar('cifras-trabajo', cifra('Afiliación a la Seguridad Social', intervalo(uAfi), '',
    uAfi ? `${periodoLargo(uAfi.t)} · intervalo por censura estadística` : ''));
  anexar('cifras-trabajo', cifra('Afiliación en ramas turísticas', intervalo(uTur), '',
    uTur ? `CNAE 55, 56, 79 y 93 · ${periodoLargo(uTur.t)}` : ''));
  if (d.paro_anual_ieca?.total) {
    anexar('cifras-trabajo', cifra('Paro medio anual', num(d.paro_anual_ieca.total, 1), '',
      `Media de ${d.paro_anual_ieca.anyo} · IECA`));
  }

  const bo = baseOpciones();

  // — Paro mensual por sexo
  const f1 = ficha({
    titulo: 'Paro registrado mensual, por sexo',
    unidad: 'personas', ambito: 'municipal',
    fuente: 'SEPE, paro registrado por municipios',
    enlace: FUENTES.SEPE,
    referencia: `${periodoLargo(paro[0].t)} – ${periodoLargo(uParo.t)}`,
    actualizado: fechaActualizacion(), alto: true
  });
  anexar('graficos-trabajo', f1.art);
  pintar(f1.lienzo, {
    ...bo,
    xAxis: { ...bo.xAxis, data: paro.map((p) => periodoCorto(p.t)) },
    series: [
      { name: 'Hombres', type: 'bar', stack: 'p', barMaxWidth: 18,
        data: paro.map((p) => p.hombres) },
      { name: 'Mujeres', type: 'bar', stack: 'p', barMaxWidth: 18,
        data: paro.map((p) => p.mujeres) },
      // El color se fija en `color` y no solo en `lineStyle`: de lo contrario el icono
      // de la leyenda toma el de la paleta y deja de coincidir con el trazo.
      { name: 'Total', type: 'line', symbol: 'none', color: '#4a5866',
        lineStyle: { width: 2 }, data: paro.map((p) => p.total) }
    ]
  });

  // — Comparativa territorial en índice base 100
  if (d.paro.comparativa?.length) {
    const comp = d.paro.comparativa.filter((c) => paro.some((p) => p.t === c.t));
    const base = { mun: paro[0].total, mal: comp[0]?.malaga,
                   and: comp[0]?.andalucia, esp: comp[0]?.espana };
    const idx = (v, b) => (b ? (v / b) * 100 : null);
    const f2 = ficha({
      titulo: 'Evolución comparada del paro registrado (índice, primer mes = 100)',
      unidad: 'índice', ambito: 'municipal',
      fuente: 'SEPE, paro registrado por municipios; los agregados territoriales se calculan con el mismo fichero',
      enlace: FUENTES.SEPE,
      referencia: `Base ${periodoLargo(paro[0].t)} = 100`, actualizado: fechaActualizacion(),
      nota: 'Las cuatro series proceden de la misma fuente y metodología, por lo que son plenamente comparables.'
    });
    anexar('graficos-trabajo', f2.art);
    pintar(f2.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: comp.map((c) => periodoCorto(c.t)) },
      yAxis: { ...bo.yAxis, scale: true },
      series: [
        { name: 'Benahavís', type: 'line', symbol: 'none', lineStyle: { width: 2.6 },
          data: comp.map((c) => idx(paro.find((p) => p.t === c.t)?.total, base.mun)) },
        { name: 'Provincia de Málaga', type: 'line', symbol: 'none', lineStyle: { width: 1.6 },
          data: comp.map((c) => idx(c.malaga, base.mal)) },
        { name: 'Andalucía', type: 'line', symbol: 'none', lineStyle: { width: 1.6 },
          data: comp.map((c) => idx(c.andalucia, base.and)) },
        { name: 'España', type: 'line', symbol: 'none',
          lineStyle: { width: 1.6, type: 'dashed' },
          data: comp.map((c) => idx(c.espana, base.esp)) }
      ]
    });
  }

  // — Contratos
  if (contratos.length) {
    const f3 = ficha({
      titulo: 'Contratos registrados mensualmente, por tipo',
      unidad: 'contratos', ambito: 'municipal',
      fuente: 'SEPE, contratos registrados por municipios',
      enlace: FUENTES.SEPE,
      referencia: `${periodoLargo(contratos[0].t)} – ${periodoLargo(uContr.t)}`,
      actualizado: fechaActualizacion(),
      nota: 'Cuenta contratos, no personas. La reforma laboral de 2022 alteró la composición entre indefinidos y temporales.'
    });
    anexar('graficos-trabajo', f3.art);
    pintar(f3.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: contratos.map((p) => periodoCorto(p.t)) },
      series: [
        { name: 'Indefinidos', type: 'bar', stack: 'c', barMaxWidth: 18,
          data: contratos.map((p) => p.indefinidos) },
        { name: 'Temporales', type: 'bar', stack: 'c', barMaxWidth: 18,
          data: contratos.map((p) => p.temporales) }
      ]
    });
  }

  // — Afiliación turística con marca de ruptura CNAE
  if (afi.serie_turistico?.length) {
    const s = afi.serie_turistico;
    const hayRuptura = s.some((p) => p.t === RUPTURA_CNAE);
    const f4 = ficha({
      titulo: 'Afiliación a la Seguridad Social en ramas turísticas (CNAE 55, 56, 79 y 93)',
      unidad: 'afiliados', ambito: 'municipal',
      fuente: 'Seguridad Social, afiliados por municipios CNAE 2D',
      enlace: FUENTES.SEGURIDAD_SOCIAL,
      referencia: `${periodoLargo(s[0].t)} – ${periodoLargo(s[s.length - 1].t)}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'El trazo grueso es el mínimo observado y la banda superior el máximo posible dado el enmascaramiento «&lt;5».'
    });
    anexar('graficos-trabajo', f4.art);
    pintar(f4.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: s.map((p) => periodoCorto(p.t)) },
      yAxis: { ...bo.yAxis, scale: true },
      series: [
        { name: 'Máximo posible', type: 'line', symbol: 'none', color: '#6fa3ce',
          lineStyle: { width: 1, type: 'dotted' },
          areaStyle: { color: 'rgba(29,78,137,.07)' },
          data: s.map((p) => p.max) },
        { name: 'Mínimo observado', type: 'line', symbol: 'none', color: PALETA[0],
          lineStyle: { width: 2.4 },
          data: s.map((p) => p.min),
          markLine: hayRuptura ? {
            silent: true, symbol: 'none',
            lineStyle: { color: '#a8680f', type: 'dashed', width: 1.4 },
            label: { formatter: 'CNAE-2025', fontSize: 10.5, color: '#a8680f',
                     position: 'insideEndTop' },
            data: [{ xAxis: periodoCorto(RUPTURA_CNAE) }]
          } : undefined }
      ]
    });
  }

  // — Empleo turístico por subsector, sin la censura del «<5».
  //   La misma afiliación, agregada por subsector antes de publicarse, de modo que
  //   aquí las cifras salen completas y no como intervalo.
  const empleoCds = CDS?.empleo;
  if (empleoCds?.periodos?.length) {
    const periodos = empleoCds.periodos;
    const subsectores = Object.entries(empleoCds.por_subsector)
      .sort((a, b) => (b[1][b[1].length - 1]?.trabajadores || 0)
                    - (a[1][a[1].length - 1]?.trabajadores || 0));
    const ultimoTotal = empleoCds.total[empleoCds.total.length - 1];
    const fT = ficha({
      titulo: 'Afiliación por subsector turístico',
      unidad: 'personas afiliadas', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, sobre afiliación a la Seguridad Social`,
      enlace: FUENTES.CDS_EMPLEO,
      referencia: `${trimestre(periodos[0])} – ${trimestre(ultimoTotal.t)}`,
      actualizado: fechaActualizacion(), alto: true,
      nota: 'Publicada ya agregada por subsector, de modo que no le afecta el enmascaramiento «&lt;5» del fichero por rama de actividad.'
    });
    anexar('graficos-trabajo', fT.art);
    pintar(fT.lienzo, {
      ...bo,
      xAxis: { ...bo.xAxis, data: periodos.map((t) => trimestre(t)) },
      series: subsectores.map(([nombre, serie]) => {
        const porPeriodo = Object.fromEntries(serie.map((p) => [p.t, p.trabajadores]));
        return {
          name: nombre, type: 'bar', stack: 'afiliacion', barMaxWidth: 26,
          data: periodos.map((t) => porPeriodo[t] ?? 0)
        };
      })
    });

    const fE = ficha({
      titulo: 'Empresas con actividad turística inscritas en la Seguridad Social',
      unidad: 'empresas', ambito: 'municipal',
      fuente: `${FUENTE_CDS}, sobre afiliación a la Seguridad Social`,
      enlace: FUENTES.CDS_EMPLEO,
      referencia: `${trimestre(periodos[0])} – ${trimestre(ultimoTotal.t)}`,
      actualizado: fechaActualizacion(), alto: true
    });
    anexar('graficos-trabajo', fE.art);
    pintar(fE.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: empleoCds.total.map((p) => trimestre(p.t)) },
      tooltip: { ...bo.tooltip,
        formatter: (ps) => {
          const p = empleoCds.total[ps[0].dataIndex];
          return `${trimestre(p.t)}<br><strong>${num(p.empresas)}</strong> empresas`
            + `<br>${num(p.trabajadores)} personas afiliadas`;
        } },
      series: [{
        name: 'Empresas', type: 'line', symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2.2, color: PALETA[1] }, itemStyle: { color: PALETA[1] },
        areaStyle: { color: 'rgba(47,158,143,.10)' },
        data: empleoCds.total.map((p) => p.empresas)
      }]
    });
  }

  // — Tabla de ramas del último mes
  if (afi.ultimo?.ramas?.length) {
    const u = afi.ultimo;
    const cont = document.getElementById('tabla-trabajo');
    const rot = document.createElement('h3');
    rot.className = 'ficha__titulo';
    rot.style.margin = '0 0 10px';
    rot.textContent = `Afiliación por rama de actividad · ${periodoLargo(u.mes)} · ${u.clasificacion}`;
    const marco = document.createElement('div');
    marco.className = 'tabla-marco';
    const filas = u.ramas.filter((x) => x.min > 0 || x.celdas_censuradas > 0).slice(0, 22);
    marco.innerHTML = `
      <table>
        <thead><tr>
          <th>CNAE</th><th>Rama de actividad</th>
          <th class="num">Afiliados</th><th class="num">Celdas enmascaradas</th>
        </tr></thead>
        <tbody>${filas.map((x) => `
          <tr>
            <td class="num">${x.cnae}</td>
            <td>${x.descripcion || '—'}</td>
            <td class="num">${x.exacto ? num(x.min)
              : `<span class="censurado">${num(x.min)}–${num(x.max)}</span>`}</td>
            <td class="num">${x.celdas_censuradas || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    const pie = document.createElement('p');
    pie.style.cssText = 'font-size:12px;color:#6b7883;margin:9px 0 0';
    pie.innerHTML = `<strong>Fuente:</strong> `
      + `${enlaceFuente('Seguridad Social, afiliados por municipios CNAE 2D, regímenes y sexo', FUENTES.SEGURIDAD_SOCIAL)}. `
      + `Los valores en cursiva son intervalos derivados del enmascaramiento `
      + `«&lt;5» aplicado a los valores comprendidos entre 1 y 4. ${afi.nota_censura || ''} `
      + `Actualizado el ${fechaActualizacion()}.`;
    cont.append(rot, marco, pie);
  }

  const pctTur = (uTur && uAfi && uAfi.min) ? (uTur.min / uAfi.min) * 100 : null;
  anexar('lectura-trabajo', lectura(
    `El municipio registra ${num(uParo.total)} personas en situación de paro registrado en ` +
    `${periodoLargo(uParo.t)}, de las cuales ${num(uParo.mujeres)} son mujeres y ` +
    `${num(uParo.hombres)} hombres (SEPE). ` +
    (uAfi ? `La afiliación a la Seguridad Social se sitúa en ${intervalo(uAfi)} personas en ` +
      `${periodoLargo(uAfi.t)}, expresada como intervalo porque ${uAfi.celdas_censuradas} celdas del ` +
      `fichero están enmascaradas por secreto estadístico. ` : '') +
    (pctTur ? `Las cuatro ramas turísticas concentran al menos el ${num(pctTur, 1)} % del empleo ` +
      `afiliado del municipio. ` : '') +
    `Se advierte que la serie de afiliación por rama no puede empalmarse a través de enero de 2026, ` +
    `fecha en la que la clasificación de actividades pasó de CNAE-2009 a CNAE-2025.`
  ));
}

/* ══════════════════════════════════════════════════ Bloque 5 · Economía */
async function economia() {
  const d = await cargar('economia');
  if (!d) return;

  const serie = d.deuda_viva?.serie || [];
  const ult = serie[serie.length - 1];

  if (ult) {
    anexar('cifras-economia', cifra('Deuda viva del Ayuntamiento',
      num(ult.v), 'miles €', `A 31 de diciembre de ${ult.t}`));
  }

  const todoCero = serie.length > 0 && serie.every((p) => p.v === 0);

  if (todoCero) {
    // Un gráfico de barras con todos los valores a cero es un lienzo en blanco: no
    // comunica nada. El hecho —que el Ayuntamiento no tiene deuda financiera— se
    // enuncia y se acompaña de la serie completa en forma de tabla.
    const cont = document.getElementById('graficos-economia');
    const art = document.createElement('article');
    art.className = 'ficha';
    art.innerHTML = `
      <div class="ficha__cabecera">
        <h3 class="ficha__titulo">Deuda viva del Ayuntamiento de Benahavís</h3>
        <div class="ficha__meta">
          <span class="etiqueta etiqueta--municipal">Ámbito municipal</span>
          <span>Unidad: miles de euros</span>
          <span>Referencia: ${serie[0].t}–${ult.t}, a 31 de diciembre</span>
        </div>
      </div>
      <div style="padding:22px 20px 6px">
        <p style="margin:0 0 14px;font-size:15px;color:#1b2733">
          El Ayuntamiento <strong>no registra deuda financiera viva</strong> en ninguno de los
          ejercicios publicados por el Ministerio de Hacienda.
        </p>
        <table style="width:auto;min-width:260px">
          <thead><tr><th>Ejercicio</th><th class="num">Deuda viva</th></tr></thead>
          <tbody>${serie.map((p) => `
            <tr><td>${p.t}</td><td class="num">0 miles €</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="ficha__pie">
        <strong>Fuente:</strong> ${enlaceFuente('Ministerio de Hacienda, deuda viva de las entidades locales', FUENTES.HACIENDA_DEUDA)}.
        Recoge la deuda de la entidad principal; no incorpora la de los entes dependientes.
        Actualizado el ${fechaActualizacion()}.
      </div>`;
    cont.appendChild(art);
  } else if (serie.length) {
    const f1 = ficha({
      titulo: 'Deuda viva del Ayuntamiento de Benahavís',
      unidad: 'miles de euros', ambito: 'municipal',
      fuente: 'Ministerio de Hacienda, deuda viva de las entidades locales',
      enlace: FUENTES.HACIENDA_DEUDA,
      referencia: `${serie[0].t}–${ult.t}, a 31 de diciembre`, actualizado: fechaActualizacion()
    });
    anexar('graficos-economia', f1.art);
    const bo = baseOpciones();
    pintar(f1.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: serie.map((p) => p.t) },
      yAxis: { ...bo.yAxis, min: 0 },
      series: [{
        type: 'bar', barMaxWidth: 48, itemStyle: { color: PALETA[0] },
        data: serie.map((p) => p.v),
        label: { show: true, position: 'top', fontSize: 12, color: '#4a5866',
                 formatter: (p) => num(p.value) }
      }]
    });
  }

  if (ult) {
    anexar('lectura-economia', lectura(
      `El Ayuntamiento de Benahavís presenta una deuda viva de ${num(ult.v)} miles de euros a 31 de ` +
      `diciembre de ${ult.t}, según el Ministerio de Hacienda` +
      (serie.every((p) => p.v === 0)
        ? `, cifra que se mantiene en cero durante todo el periodo publicado (${serie[0].t}–${ult.t})` : '') +
      `. El indicador recoge la deuda financiera de la entidad principal y no incorpora la de los ` +
      `entes dependientes.`
    ));
  }
}

/* ══════════════════════════════════════════════════ Bloque 6 · Clima */
async function clima() {
  const d = await cargar('clima');
  if (!d?.normales?.length) return sinDatos('clima');

  const tAnual = d.temperatura_anual || [];
  const pAnual = d.precipitacion_anual || [];
  const uT = tAnual[tAnual.length - 1];
  const uP = pAnual[pAnual.length - 1];
  const mediaT = tAnual.length ? tAnual.reduce((s, p) => s + p.v, 0) / tAnual.length : null;
  const mediaP = pAnual.length ? pAnual.reduce((s, p) => s + p.v, 0) / pAnual.length : null;

  anexar('cifras-clima', cifra('Temperatura media anual',
    mediaT ? num(mediaT, 1) : '—', '°C',
    tAnual.length ? `Media de ${tAnual[0].t}–${uT.t}` : ''));
  anexar('cifras-clima', cifra('Precipitación media anual',
    mediaP ? num(mediaP, 1) : '—', 'mm',
    pAnual.length ? `Media de ${pAnual[0].t}–${uP.t}` : ''));
  anexar('cifras-clima', cifra('Meses observados', num(d.meses_observados), '',
    `${periodoLargo(d.primer_mes)} – ${periodoLargo(d.ultimo_mes)}`));
  anexar('cifras-clima', cifra('Estación de medida', d.estacion?.indicativo || '—', '',
    `${d.estacion?.nombre}, ${d.estacion?.altitud_m} m · dentro del término municipal`));

  const bo = baseOpciones();

  // — Climograma
  const f1 = ficha({
    titulo: 'Climograma de Benahavís: temperatura y precipitación medias mensuales',
    unidad: 'grados Celsius y milímetros', ambito: 'municipal',
    fuente: `AEMET OpenData, estación ${d.estacion?.indicativo} Benahavís (${d.estacion?.altitud_m} m)`,
    enlace: FUENTES.AEMET,
    referencia: `Periodo ${d.primer_mes?.slice(0, 4)}–${d.ultimo_mes?.slice(0, 4)}`,
    actualizado: fechaActualizacion(), alto: true,
    nota: 'El periodo de cálculo no coincide con el trentenio estándar de la Organización Meteorológica Mundial, por lo que no son normales climatológicas en sentido estricto.'
  });
  anexar('graficos-clima', f1.art);
  pintar(f1.lienzo, {
    ...bo,
    xAxis: { ...bo.xAxis, data: d.normales.map((n) => MESES[n.mes - 1].slice(0, 3)) },
    yAxis: [
      { type: 'value', name: 'mm', nameTextStyle: { fontSize: 11, color: '#6b7883' },
        splitLine: { lineStyle: { color: '#eef1f4' } },
        axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => num(v) } },
      { type: 'value', name: '°C', nameTextStyle: { fontSize: 11, color: '#6b7883' },
        splitLine: { show: false },
        axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => num(v) } }
    ],
    series: [
      { name: 'Precipitación media', type: 'bar', barMaxWidth: 30,
        itemStyle: { color: PALETA[0] },
        data: d.normales.map((n) => n.precipitacion_media) },
      { name: 'Temperatura media', type: 'line', yAxisIndex: 1, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2.4, color: PALETA[2] }, itemStyle: { color: PALETA[2] },
        data: d.normales.map((n) => n.temperatura_media) }
    ]
  });

  // — Temperatura anual
  if (tAnual.length > 2) {
    const f2 = ficha({
      titulo: 'Temperatura media anual',
      unidad: 'grados Celsius', ambito: 'municipal',
      fuente: `AEMET OpenData, estación ${d.estacion?.indicativo} Benahavís`,
      enlace: FUENTES.AEMET,
      referencia: `${tAnual[0].t}–${uT.t}`, actualizado: fechaActualizacion(),
      nota: 'Resumen anual calculado por la propia AEMET; los años sin resumen publicado no se representan.'
    });
    anexar('graficos-clima', f2.art);
    pintar(f2.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: tAnual.map((p) => p.t) },
      yAxis: { ...bo.yAxis, scale: true,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v, 1)} °C` } },
      series: [{
        type: 'line', symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, color: PALETA[2] }, itemStyle: { color: PALETA[2] },
        data: tAnual.map((p) => p.v),
        markLine: { silent: true, symbol: 'none',
          lineStyle: { color: '#9aa6b1', type: 'dashed', width: 1 },
          label: { formatter: 'Media del periodo', fontSize: 10.5, color: '#6b7883' },
          data: [{ yAxis: mediaT ? Number(mediaT.toFixed(1)) : 0 }] }
      }]
    });
  }

  // — Precipitación anual
  if (pAnual.length > 2) {
    const f3 = ficha({
      titulo: 'Precipitación anual acumulada',
      unidad: 'milímetros', ambito: 'municipal',
      fuente: `AEMET OpenData, estación ${d.estacion?.indicativo} Benahavís`,
      enlace: FUENTES.AEMET,
      referencia: `${pAnual[0].t}–${uP.t}`, actualizado: fechaActualizacion(),
      nota: 'Resumen anual publicado por AEMET. Los registros marcados como inapreciables se contabilizan como cero.'
    });
    anexar('graficos-clima', f3.art);
    pintar(f3.lienzo, {
      ...bo,
      legend: { show: false },
      xAxis: { ...bo.xAxis, data: pAnual.map((p) => p.t) },
      yAxis: { ...bo.yAxis,
        axisLabel: { ...bo.yAxis.axisLabel, formatter: (v) => `${num(v)} mm` } },
      series: [{
        type: 'bar', barMaxWidth: 24, itemStyle: { color: PALETA[0] },
        data: pAnual.map((p) => p.v),
        markLine: { silent: true, symbol: 'none',
          lineStyle: { color: '#9aa6b1', type: 'dashed', width: 1 },
          label: { formatter: 'Media del periodo', fontSize: 10.5, color: '#6b7883' },
          data: [{ yAxis: mediaP ? Number(mediaP.toFixed(0)) : 0 }] }
      }]
    });
  }

  anexar('lectura-clima', lectura(
    `La estación ${d.estacion?.indicativo} de AEMET, situada dentro del término municipal a ` +
    `${d.estacion?.altitud_m} metros de altitud, acumula ${num(d.meses_observados)} meses de ` +
    `observación entre ${periodoLargo(d.primer_mes)} y ${periodoLargo(d.ultimo_mes)}. ` +
    (mediaT ? `La temperatura media del periodo se sitúa en ${num(mediaT, 1)} grados Celsius y la ` +
      `precipitación media anual en ${num(mediaP, 1)} milímetros. ` : '') +
    `La existencia de estación dentro del municipio permite que este bloque sea dato municipal ` +
    `observado y no un indicador sustitutivo de ámbito comarcal. Se advierte, no obstante, que una ` +
    `única estación no describe la variabilidad de un término que se extiende desde las ` +
    `proximidades de la costa hasta la Sierra de las Nieves.`
  ));
}

/* ══════════════════════════════════════════════════ Arranque */
async function iniciar() {
  // El Big Data de Turismo Costa del Sol alimenta cuatro de las seis pestañas, de
  // modo que se carga antes que ellas y no dentro de cada una.
  [META, CDS] = await Promise.all([cargar('meta'), cargar('costadelsol')]);
  if (META) {
    document.getElementById('dato-actualizado').textContent = fechaActualizacion();
    document.getElementById('pie-version').textContent = META.version || '—';
    document.getElementById('pie-generado').textContent = fechaActualizacion();
  }
  await Promise.all([demografia(), oferta(), demanda(), precios(), trabajo(), economia(), clima()]);

  // Los gráficos de una pestaña oculta se dibujaron con anchura cero: hay que
  // recalcularlos en cuanto su panel se hace visible.
  activarPestanas(() => requestAnimationFrame(() => {
    redibujar();
    const mapa = window.MAPA_OFERTA;
    if (mapa) {
      mapa.invalidateSize();
      if (mapa.MI_ENCUADRE) mapa.fitBounds(mapa.MI_ENCUADRE, { padding: [24, 24] });
    }
  }));
}

iniciar();
