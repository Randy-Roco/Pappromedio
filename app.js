const state = {
  files: [],
  parsedRows: [],
  groupedRows: [],
};

const EXPORT_PROFILES = {
  civil3d: {
    label: 'Civil 3D (UTF-8)',
    filename: 'PA_PROMEDIADOS_CIVIL3D.txt',
    build(rows) {
      return rows.map(r => `${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`).join('\n');
    },
  },
  erdas: {
    label: 'ERDAS',
    filename: 'PA_PROMEDIADOS_ERDAS.txt',
    build(rows) {
      return ['P,Y,X,Z,DESC', ...rows.map(r => `P,${fmt(r.Y)},${fmt(r.X)},${fmt(r.Z)},${r.descriptor}`)].join('\n');
    },
  },
};

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const filesTableBody = document.querySelector('#filesTable tbody');
const aliasGrid = document.getElementById('aliasGrid');
const aliasTemplate = document.getElementById('aliasRowTemplate');
const resultTableBody = document.querySelector('#resultTable tbody');

const sumFiles = document.getElementById('sumFiles');
const sumRows = document.getElementById('sumRows');
const sumGroups = document.getElementById('sumGroups');

boot();

function boot() {
  addAliasRow();
  bindEvents();
}

function bindEvents() {
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    await handleFiles([...e.target.files]);
    e.target.value = '';
  });

  ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  }));
  dropzone.addEventListener('drop', async (e) => {
    await handleFiles([...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.txt')));
  });

  document.getElementById('btnClearFiles').addEventListener('click', clearFiles);
  document.getElementById('btnAddAlias').addEventListener('click', addAliasRow);
  document.getElementById('btnLoadAliasExample').addEventListener('click', loadAliasExample);
  document.getElementById('btnApply').addEventListener('click', processData);
  document.getElementById('btnExportTxt').addEventListener('click', exportTxt);
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
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
  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 5) continue;
    const [id, yRaw, xRaw, zRaw, descriptorRaw] = parts;
    const x = toNumber(xRaw);
    const y = toNumber(yRaw);
    const z = toNumber(zRaw);
    if (![x, y, z].every(Number.isFinite)) continue;
    const descriptorOriginal = descriptorRaw;
    const normalized = normalizeDescriptor(descriptorOriginal);
    rows.push({
      id,
      X: x,
      Y: y,
      Z: z,
      descriptorOriginal,
      normalized,
      filename,
      isPA: normalized.startsWith('PA'),
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
  const paRows = state.files.flatMap(entry => entry.parsed).filter(r => r.isPA);
  state.parsedRows = paRows.map(r => ({ ...r, finalDescriptor: aliases[r.normalized] || r.normalized }));

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
    const paCount = entry.parsed.filter(r => r.isPA).length;
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
  renderFiles();
  renderResults();
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

  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  const wsDetalle = XLSX.utils.json_to_sheet(detalle);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Promedios');
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');
  XLSX.writeFile(wb, 'PA_PROMEDIADOS.xlsx');
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
