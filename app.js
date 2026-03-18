const state = {
  files: [],
  parsedRows: [],
  groupedRows: [],
  ignoredRows: [],
};

const EXPORT_PROFILES = {
  civil3d: {
    label: 'Civil 3D (UTF-8)',
    filename: 'PA_PROMEDIADOS_CIVIL3D.txt',
    build(rows) {
      // 🔥 SIN encabezado (clave)
      return rows.map(r => `${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`).join('\n');
    },
  },

  pix4d: {
    label: 'Pix4D',
    filename: 'PA_PROMEDIADOS_PIX4D.txt',
    build(rows) {
      // ✔ Con encabezado
      return [
        'Y,X,Z,DESCRIPTOR',
        ...rows.map(r => `${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`)
      ].join('\n');
    },
  },

  arcgispro: {
    label: 'ArcGIS Pro',
    filename: 'PA_PROMEDIADOS_ARCGISPRO.txt',
    build(rows) {
      return [
        'Y,X,Z,DESCRIPTOR',
        ...rows.map(r => `${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`)
      ].join('\n');
    },
  },

  arcmap: {
    label: 'ArcMap',
    filename: 'PA_PROMEDIADOS_ARCMAP.txt',
    build(rows) {
      return [
        'Y,X,Z,DESCRIPTOR',
        ...rows.map(r => `${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`)
      ].join('\n');
    },
  },

  erdas: {
    label: 'ERDAS',
    filename: 'PA_PROMEDIADOS_ERDAS.txt',
    build(rows) {
      return [
        'P,Y,X,Z,DESC',
        ...rows.map(r => `P,${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`)
      ].join('\n');
    },
  },

  metashape: {
    label: 'Agisoft Metashape',
    filename: 'PA_PROMEDIADOS_METASHAPE.txt',
    build(rows) {
      return [
        'P,Y,X,Z,DESC',
        ...rows.map(r => `P,${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`)
      ].join('\n');
    },
  },
};

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const filesTableBody = document.querySelector('#filesTable tbody');
const aliasGrid = document.getElementById('aliasGrid');
const aliasTemplate = document.getElementById('aliasRowTemplate');
const resultTableBody = document.querySelector('#resultTable tbody');
const ignoredTableBody = document.querySelector('#ignoredTable tbody');

const sumFiles = document.getElementById('sumFiles');
const sumRows = document.getElementById('sumRows');
const sumGroups = document.getElementById('sumGroups');
const sumIgnored = document.getElementById('sumIgnored');

boot();

function boot() {
  addAliasRow();
  bindEvents();
  renderFiles();
  renderResults();
  renderIgnored();
}

function bindEvents() {
  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    await handleFiles([...e.target.files]);
    e.target.value = '';
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', async (e) => {
    await handleFiles([...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.txt')));
  });

  document.getElementById('btnClearFiles').addEventListener('click', clearFiles);
  document.getElementById('btnAddAlias').addEventListener('click', addAliasRow);
  document.getElementById('btnLoadAliasExample').addEventListener('click', loadAliasExample);
  document.getElementById('btnApply').addEventListener('click', processData);
  document.getElementById('btnExportTxt').addEventListener('click', exportTxt);
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
  document.getElementById('btnToggleIgnored').addEventListener('click', toggleIgnoredPanel);
  document.getElementById('btnExportIgnoredCsv').addEventListener('click', exportIgnoredCsv);
  document.getElementById('btnExportGeoJSON').addEventListener('click', exportGeoJSON);
  document.getElementById('btnExportSHP').addEventListener('click', exportSHP);
  document.getElementById('btnToggleAliases').addEventListener('click', toggleAliasPanel);
}

async function handleFiles(fileList) {
  if (!fileList.length) return;

  const incoming = [];
  for (const file of fileList) {
    const text = await file.text();
    const parsed = parseTxt(text, file.name);
    incoming.push({ file, parsed });
  }

  state.files.push(...incoming);
  renderFiles();
}

function parseTxt(text, filename) {
  const rows = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',').map(p => p.trim());

    if (parts.length < 5) {
      rows.push({
        id: '',
        X: NaN,
        Y: NaN,
        Z: NaN,
        descriptorOriginal: '',
        normalized: '',
        finalDescriptor: '',
        filename,
        isPA: false,
        ignored: true,
        ignoredReason: 'Menos de 5 columnas',
        rawLine: line,
        lineNumber: i + 1,
      });
      continue;
    }

    const [id, yRaw, xRaw, zRaw, descriptorRaw] = parts;
    const x = toNumber(xRaw);
    const y = toNumber(yRaw);
    const z = toNumber(zRaw);
    const descriptorOriginal = descriptorRaw || '';
    const normalized = normalizeDescriptor(descriptorOriginal);
    const hasCoords = [x, y, z].every(Number.isFinite);
    const isPA = normalized.startsWith('PA') && /^PA\d+$/.test(normalized);

    let ignored = false;
    let ignoredReason = '';

    if (!descriptorOriginal) {
      ignored = true;
      ignoredReason = 'Sin descriptor';
    } else if (!hasCoords) {
      ignored = true;
      ignoredReason = 'Coordenadas inválidas';
    } else if (!isPA) {
      ignored = true;
      ignoredReason = 'Descriptor no utilizado / no PA';
    }

    rows.push({
      id,
      X: x,
      Y: y,
      Z: z,
      descriptorOriginal,
      normalized,
      finalDescriptor: normalized,
      filename,
      isPA,
      ignored,
      ignoredReason,
      rawLine: line,
      lineNumber: i + 1,
    });
  }

  return rows;
}

function normalizeDescriptor(value) {
  if (!value) return '';
  const cleaned = String(value).toUpperCase().replace(/[_\-\s]+/g, '');
  const match = cleaned.match(/^PA0*(\d+)$/);
  if (match) {
    return `PA${match[1].padStart(2, '0')}`;
  }
  return cleaned;
}

function toNumber(value) {
  const normalized = String(value).replace(',', '.');
  return Number(normalized);
}

function collectAliases() {
  const rows = [...aliasGrid.querySelectorAll('.alias-row')];
  const aliases = {};
  for (const row of rows) {
    const from = normalizeDescriptor(row.querySelector('.alias-from').value);
    const to = normalizeDescriptor(row.querySelector('.alias-to').value);
    if (from && to) aliases[from] = to;
  }
  return aliases;
}

function processData() {
  if (!state.files.length) {
    alert('Primero carga uno o más archivos .txt');
    return;
  }

  const aliases = collectAliases();
  const allRows = state.files.flatMap(entry => entry.parsed);

  state.ignoredRows = allRows.filter(r => r.ignored).map(r => ({
    archivo: r.filename,
    linea: r.lineNumber,
    descriptor: r.descriptorOriginal || '',
    motivo: r.ignoredReason,
    contenido: r.rawLine,
  }));

  const paRows = allRows.filter(r => !r.ignored && r.isPA);

  state.parsedRows = paRows.map(r => ({
    ...r,
    finalDescriptor: aliases[r.normalized] || r.normalized,
  }));

  const groups = new Map();
  for (const row of state.parsedRows) {
    const key = row.finalDescriptor;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  state.groupedRows = [...groups.entries()]
    .map(([descriptor, rows]) => ({
      descriptor,
      X: avg(rows.map(r => r.X)),
      Y: avg(rows.map(r => r.Y)),
      Z: avg(rows.map(r => r.Z)),
      count: rows.length,
      origen: [...new Set(rows.map(r => r.filename))].join(' | '),
    }))
    .sort((a, b) => a.descriptor.localeCompare(b.descriptor, undefined, { numeric: true }));

  renderResults();
  renderIgnored();
}

function avg(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function renderFiles() {
  if (!state.files.length) {
    filesTableBody.innerHTML = '<tr><td colspan="3" class="empty">Aún no hay archivos cargados.</td></tr>';
    return;
  }

  filesTableBody.innerHTML = state.files.map(entry => {
    const total = entry.parsed.length;
    const paCount = entry.parsed.filter(r => !r.ignored && r.isPA).length;
    return `<tr><td>${escapeHtml(entry.file.name)}</td><td>${total}</td><td>${paCount}</td></tr>`;
  }).join('');
}

function renderResults() {
  if (!state.groupedRows.length) {
    resultTableBody.innerHTML = '<tr><td colspan="6" class="empty">No hay resultados todavía.</td></tr>';
  } else {
    resultTableBody.innerHTML = state.groupedRows.map((row, index) => `
      <tr data-index="${index}">
        <td><input value="${escapeAttr(row.descriptor)}" data-field="descriptor"></td>
        <td><input value="${fmt(row.X)}" data-field="X"></td>
        <td><input value="${fmt(row.Y)}" data-field="Y"></td>
        <td><input value="${fmt(row.Z)}" data-field="Z"></td>
        <td>${row.count}</td>
        <td>${escapeHtml(row.origen)}</td>
      </tr>
    `).join('');

    [...resultTableBody.querySelectorAll('input')].forEach(input => {
      input.addEventListener('change', handleEditResult);
    });
  }

  sumFiles.textContent = state.files.length;
  sumRows.textContent = state.parsedRows.length;
  sumGroups.textContent = state.groupedRows.length;
  sumIgnored.textContent = state.ignoredRows.length;
}

function renderIgnored() {
  if (!state.ignoredRows.length) {
    ignoredTableBody.innerHTML = '<tr><td colspan="5" class="empty">No hay registros no utilizados.</td></tr>';
    return;
  }

  ignoredTableBody.innerHTML = state.ignoredRows.map(row => `
    <tr>
      <td>${escapeHtml(row.archivo)}</td>
      <td>${row.linea}</td>
      <td>${escapeHtml(row.descriptor || '(vacío)')}</td>
      <td>${escapeHtml(row.motivo)}</td>
      <td>${escapeHtml(row.contenido)}</td>
    </tr>
  `).join('');
}

function handleEditResult(e) {
  const tr = e.target.closest('tr');
  const index = Number(tr.dataset.index);
  const field = e.target.dataset.field;
  let value = e.target.value;

  if (field === 'descriptor') {
    value = normalizeDescriptor(value) || value.trim();
  } else {
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n)) {
      e.target.value = fmt(state.groupedRows[index][field]);
      return;
    }
    value = n;
  }

  state.groupedRows[index][field] = value;
  if (field !== 'descriptor') e.target.value = fmt(value);
}

function addAliasRow(from = '', to = '') {
  const node = aliasTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.alias-from').value = from;
  node.querySelector('.alias-to').value = to;
  node.querySelector('.alias-remove').addEventListener('click', () => node.remove());
  aliasGrid.appendChild(node);
}

function loadAliasExample() {
  aliasGrid.innerHTML = '';
  addAliasRow('PA001', 'PA01');
  addAliasRow('PA1', 'PA01');
  addAliasRow('PA-01', 'PA01');
}

function clearFiles() {
  state.files = [];
  state.parsedRows = [];
  state.groupedRows = [];
  state.ignoredRows = [];
  renderFiles();
  renderResults();
  renderIgnored();
}

function exportTxt() {
  if (!state.groupedRows.length) {
    alert('No hay resultados para exportar.');
    return;
  }

  const key = document.getElementById('exportProfile').value;
  const profile = EXPORT_PROFILES[key];
  const content = profile.build(state.groupedRows);
  downloadFile(profile.filename, content, 'text/plain;charset=utf-8');
}

function exportExcel() {
  if (!state.groupedRows.length) {
    alert('No hay resultados para exportar.');
    return;
  }

  const resumen = state.groupedRows.map(r => ({
    Descriptor: r.descriptor,
    X: r.X,
    Y: r.Y,
    Z: r.Z,
    Observaciones: r.count,
    Origen: r.origen,
  }));

  const detalle = state.parsedRows.map(r => ({
    Archivo: r.filename,
    ID: r.id,
    DescriptorOriginal: r.descriptorOriginal,
    DescriptorNormalizado: r.normalized,
    DescriptorFinal: r.finalDescriptor,
    X: r.X,
    Y: r.Y,
    Z: r.Z,
  }));

  const noUtilizados = state.ignoredRows.map(r => ({
    Archivo: r.archivo,
    Linea: r.linea,
    Descriptor: r.descriptor,
    Motivo: r.motivo,
    Contenido: r.contenido,
  }));

  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  const wsNoUtilizados = XLSX.utils.json_to_sheet(noUtilizados);

  XLSX.utils.book_append_sheet(wb, wsResumen, 'Promedios');
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');
  XLSX.utils.book_append_sheet(wb, wsNoUtilizados, 'NoUtilizados');
  XLSX.writeFile(wb, 'PA_PROMEDIADOS.xlsx');
}

function exportIgnoredCsv() {
  if (!state.ignoredRows.length) {
    alert('No hay registros no utilizados para exportar.');
    return;
  }

  const headers = ['Archivo', 'Linea', 'Descriptor', 'Motivo', 'Contenido'];
  const rows = state.ignoredRows.map(r => [
    csvCell(r.archivo),
    csvCell(r.linea),
    csvCell(r.descriptor),
    csvCell(r.motivo),
    csvCell(r.contenido),
  ]);

  const content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile('PA_NO_UTILIZADOS.csv', content, 'text/csv;charset=utf-8');
}

function exportGeoJSON() {
  if (!state.groupedRows.length) {
    alert('No hay resultados para exportar.');
    return;
  }

  const epsg = document.getElementById('epsgSelect').value;

  const geojson = {
    type: 'FeatureCollection',
    name: 'PA_PROMEDIADOS',
    crs: {
      type: 'name',
      properties: {
        name: epsg,
      },
    },
    features: state.groupedRows.map(r => ({
      type: 'Feature',
      properties: {
        descriptor: r.descriptor,
        z: Number(r.Z),
        observ: Number(r.count),
        origen: r.origen,
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(r.X), Number(r.Y)],
      },
    })),
  };

  downloadFile('PA_PROMEDIADOS.geojson', JSON.stringify(geojson, null, 2), 'application/geo+json;charset=utf-8');
}

function exportSHP() {
  if (!state.groupedRows.length) {
    alert('No hay resultados para exportar.');
    return;
  }

  if (typeof shpwrite === 'undefined') {
    alert('La librería shp-write no está cargada en index.html');
    return;
  }

  const epsg = document.getElementById('epsgSelect').value;

  const geojson = {
    type: 'FeatureCollection',
    features: state.groupedRows.map(r => ({
      type: 'Feature',
      properties: {
        descriptor: r.descriptor,
        z: Number(r.Z),
        observ: Number(r.count),
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(r.X), Number(r.Y)],
      },
    })),
  };

  shpwrite.download(geojson, {
    folder: 'PA_PROMEDIADOS_SHP',
    file: 'PA_PROMEDIADOS',
    types: {
      point: 'PA_PROMEDIADOS',
    },
    prj: getPrjWKT(epsg),
  });
}

function getPrjWKT(epsg) {
  const wkts = {
    'EPSG:32718': 'PROJCS["WGS_1984_UTM_Zone_18S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-75.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
    'EPSG:32719': 'PROJCS["WGS_1984_UTM_Zone_19S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-69.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
  };

  return wkts[epsg] || wkts['EPSG:32719'];
}

function toggleIgnoredPanel() {
  const panel = document.getElementById('ignoredPanel');
  panel.hidden = !panel.hidden;
}

function toggleAliasPanel() {
  const panel = document.getElementById('aliasPanel');
  const btn = document.getElementById('btnToggleAliases');
  panel.hidden = !panel.hidden;
  btn.textContent = panel.hidden ? 'Mostrar aliases' : 'Ocultar aliases';
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fmt(value) {
  return Number(value).toFixed(4);
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}
