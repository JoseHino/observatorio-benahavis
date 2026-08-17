/* Página de metodología: publica el informe de validación de la última ejecución. */

import { num, cargar } from './comun.js';

const NOMBRES_TIPO = {
  serie_vacia: 'Serie sin datos',
  fuera_de_rango: 'Valor fuera del rango plausible',
  salto_anomalo: 'Salto anómalo entre periodos consecutivos',
  meses_ausentes: 'Meses sin dato en una serie mensual',
  periodos_duplicados: 'Periodos repetidos',
  valores_no_numericos: 'Puntos sin valor numérico',
  orden: 'Serie desordenada'
};

async function iniciar() {
  const meta = await cargar('meta');
  if (meta) {
    const f = new Date(meta.generado).toLocaleDateString('es-ES',
      { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('pie-version').textContent = meta.version || '—';
    document.getElementById('pie-generado').textContent = f;
  }

  const cont = document.getElementById('informe-validacion');
  const val = await cargar('validacion');
  if (!val) {
    cont.innerHTML = '<div class="hueco">No hay informe de validación publicado.</div>';
    return;
  }

  const resumen = document.createElement('div');
  resumen.className = val.errores > 0 ? 'aviso aviso--critico' : 'aviso aviso--neutro';
  resumen.innerHTML = `<span class="aviso__titulo">Resultado de la última ejecución</span>
    <p>Se han revisado <strong>${num(val.series_revisadas)} series</strong>, con
    <strong>${num(val.errores)} error(es)</strong> y <strong>${num(val.avisos)} aviso(s)</strong>.
    ${val.errores === 0
      ? 'Ninguna serie presenta valores fuera de rango ni ausencia total de datos.'
      : 'Los errores señalan series vacías o con valores fuera del rango plausible declarado.'}</p>`;
  cont.appendChild(resumen);

  if (!val.incidencias?.length) {
    const ok = document.createElement('p');
    ok.textContent = 'La validación no ha registrado ninguna incidencia.';
    cont.appendChild(ok);
    return;
  }

  const orden = { error: 0, aviso: 1 };
  const filas = val.incidencias.slice()
    .sort((a, b) => (orden[a.gravedad] - orden[b.gravedad]) || a.serie.localeCompare(b.serie));

  const marco = document.createElement('div');
  marco.className = 'tabla-marco';
  marco.innerHTML = `
    <table>
      <thead><tr><th>Gravedad</th><th>Serie</th><th>Tipo</th><th>Detalle</th></tr></thead>
      <tbody>${filas.map((i) => `
        <tr>
          <td>${i.gravedad === 'error'
            ? '<span class="etiqueta etiqueta--nodisponible" style="background:#fbeaea;color:#a32a2a">Error</span>'
            : '<span class="etiqueta etiqueta--proxy">Aviso</span>'}</td>
          <td><code>${i.serie}</code></td>
          <td>${NOMBRES_TIPO[i.tipo] || i.tipo}</td>
          <td>${i.detalle}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  cont.appendChild(marco);

  const nota = document.createElement('p');
  nota.style.cssText = 'font-size:12.5px;color:#6b7883;margin:10px 0 0';
  nota.innerHTML = 'Los avisos por salto anómalo en las series de demanda turística corresponden '
    + 'al colapso y la recuperación de la movilidad durante la pandemia: son reales y no se '
    + 'corrigen. Los avisos por meses ausentes reflejan huecos en la publicación de la fuente.';
  cont.appendChild(nota);
}

iniciar();
