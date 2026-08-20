/* Página de alineación con el Decreto 72/2017. */

import { FUENTES, num, periodoLargo, cargar, cifra, enlaceFuente } from './comun.js';

async function iniciar() {
  const meta = await cargar('meta');
  if (meta) {
    const f = new Date(meta.generado).toLocaleDateString('es-ES',
      { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('pie-version').textContent = meta.version || '—';
    document.getElementById('pie-generado').textContent = f;
  }

  const [dem, ofe, pob, vis, cds] = await Promise.all([
    cargar('demanda'), cargar('oferta'), cargar('demografia'), cargar('visitantes'),
    cargar('costadelsol')
  ]);

  // ── Indicadores de apoyo
  const cont = document.getElementById('apoyo-cifras');
  const serie = dem?.receptor?.serie || [];
  const habitantes = pob?.poblacion_actual;

  if (serie.length) {
    const ventana = serie.slice(-12);
    const total12 = ventana.reduce((s, p) => s + p.v, 0);
    const ult = serie[serie.length - 1];
    cont.appendChild(cifra('Turistas extranjeros, doce meses', num(total12), '',
      `${periodoLargo(ventana[0].t)} – ${periodoLargo(ult.t)} · estadística experimental`));
    if (habitantes) {
      cont.appendChild(cifra('Turistas por habitante y año', num(total12 / habitantes.v, 1), '',
        `Sobre ${num(habitantes.v)} habitantes empadronados en ${habitantes.t}`));
    }
    cont.appendChild(cifra('Mes de máxima afluencia',
      periodoLargo(ventana.reduce((a, b) => (b.v > a.v ? b : a)).t), '',
      'Dentro de los últimos doce meses'));
  }

  const ocupacion = (cds?.vivienda_turistica?.serie || []).filter((p) => p.ocupacion !== null);
  const ultOcupacion = ocupacion[ocupacion.length - 1];
  if (ultOcupacion) {
    cont.appendChild(cifra('Ocupación de la vivienda turística',
      num(ultOcupacion.ocupacion, 1), '%',
      `${periodoLargo(ultOcupacion.t)} · ${num(ultOcupacion.plazas)} plazas anunciadas`));
  }

  if (ofe?.rta) {
    cont.appendChild(cifra('Plazas de alojamiento inscritas', num(ofe.rta.plazas_alojamiento), '',
      'Registro de Turismo de Andalucía · registro nominal'));
    if (habitantes) {
      cont.appendChild(cifra('Plazas por cada 100 habitantes',
        num((ofe.rta.plazas_alojamiento / habitantes.v) * 100, 1), '',
        'Ratio de intensidad de la oferta'));
    }
  }

  // ── Oferta por tipología
  if (ofe?.rta?.por_tipo) {
    const tipos = Object.entries(ofe.rta.por_tipo)
      .sort((a, b) => b[1].plazas - a[1].plazas);
    const marco = document.createElement('div');
    marco.className = 'tabla-marco';
    marco.innerHTML = `
      <table>
        <thead><tr>
          <th>Tipología inscrita en el RTA</th>
          <th class="num">Inscripciones</th>
          <th class="num">Plazas</th>
          <th class="num">Unidades de alojamiento</th>
        </tr></thead>
        <tbody>${tipos.map(([k, v]) => `
          <tr>
            <td>${k}</td>
            <td class="num">${num(v.establecimientos)}</td>
            <td class="num">${v.plazas ? num(v.plazas) : '—'}</td>
            <td class="num">${v.unidades ? num(v.unidades) : '—'}</td>
          </tr>`).join('')}
          <tr>
            <td><strong>Total</strong></td>
            <td class="num"><strong>${num(ofe.rta.total_inscripciones)}</strong></td>
            <td class="num"><strong>${num(ofe.rta.plazas_totales)}</strong></td>
            <td class="num">—</td>
          </tr>
        </tbody>
      </table>`;
    const sinPlazas = tipos.filter(([, v]) => !v.plazas).map(([k]) => k);
    const pie = document.createElement('p');
    pie.style.cssText = 'font-size:12px;color:#6b7883;margin:9px 0 0';
    pie.innerHTML = '<strong>Fuente:</strong> '
      + `${enlaceFuente('Junta de Andalucía, Registro de Turismo de Andalucía (OpenRTA)', FUENTES.OPENRTA)}. `
      + (sinPlazas.length
        ? `Las tipologías sin plazas (${sinPlazas.join(', ')}) corresponden a servicios turísticos `
          + 'que no son alojamiento.'
        : 'Todas las inscripciones del municipio corresponden a tipologías de alojamiento: el RTA no '
          + 'registra en Benahavís agencias de viajes, guías, restauración turística, turismo activo '
          + 'ni oficinas de información.');
    document.getElementById('oferta-tabla').append(marco, pie);
  }

  // ── Estado del módulo de conteo
  const estado = document.getElementById('estado-conteo');
  if (vis?.estado === 'con_datos') {
    const total = (vis.serie_mensual || []).reduce((s, p) => s + p.v, 0);
    const aviso = document.createElement('div');
    aviso.className = 'aviso aviso--neutro';
    aviso.innerHTML = `<span class="aviso__titulo">Módulo de conteo con datos</span>
      <p>Se han incorporado ${num(vis.registros)} registros de conteo, con un total de
      ${num(total)} visitantes en ${vis.recursos.length} recurso(s):
      ${vis.recursos.join(', ')}.</p>`;
    estado.appendChild(aviso);
  } else {
    // Sin conteos depositados no se dibuja un hueco: se explica qué hacer, que es lo
    // único accionable para el Ayuntamiento en este punto del expediente.
    const nota = document.createElement('div');
    nota.className = 'aviso aviso--neutro';
    nota.innerHTML = `<span class="aviso__titulo">El módulo queda a la espera del primer fichero</span>
      <p>La ingesta está implementada y validada. En cuanto el Ayuntamiento deposite el primer
      fichero de conteo con el esquema anterior, la serie aparece aquí y en el panel principal
      sin ninguna intervención técnica.</p>`;
    estado.appendChild(nota);
  }
}

iniciar();
