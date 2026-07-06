import {
  getAllClips, getProjects, getTags, updateClip, deleteClip,
  estimateUsage, exportData, importData, getFullImage, removeTag,
} from '../db/clip-store.js';
import { filterClips } from '../core/search.js';
import { buildCardModel } from './render.js';
import { CLIP_TYPES } from '../core/constants.js';

const state = {
  clips: [],
  project: null,
  activeTags: new Set(),
  query: '',
  sort: 'newest',
  selected: new Set(),
  allProjects: [], // 侧栏 + 编辑模态共用的项目全集
};

const els = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  projects: document.getElementById('projects'),
  tags: document.getElementById('tags'),
  search: document.getElementById('search'),
  usage: document.getElementById('usage'),
  sort: document.getElementById('sort'),
  export: document.getElementById('export'),
  exportMd: document.getElementById('export-md'),
  import: document.getElementById('import'),
  importFile: document.getElementById('import-file'),
  selbar: document.getElementById('selbar'),
  selcount: document.getElementById('selcount'),
  selClear: document.getElementById('sel-clear'),
  selDelete: document.getElementById('sel-delete'),
  modal: document.getElementById('modal'),
  modalBody: document.querySelector('#modal .modal-body'),
  modalBackdrop: document.querySelector('#modal .modal-backdrop'),
};

const TYPE_LABEL = {
  [CLIP_TYPES.IMAGE]: 'IMG',
  [CLIP_TYPES.TEXT]: 'TEXT',
  [CLIP_TYPES.ARTICLE]: 'ARTICLE',
  [CLIP_TYPES.VIDEO]: 'VIDEO',
  [CLIP_TYPES.TWEET]: 'TWEET',
};

init();

async function init() {
  els.search.addEventListener('input', debounce((e) => {
    state.query = e.target.value;
    renderGrid();
  }, 150));
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    sortClips();
    renderGrid();
  });
  els.selClear.addEventListener('click', clearSelection);
  els.selDelete.addEventListener('click', deleteSelected);
  els.export.addEventListener('click', doExportJson);
  els.exportMd.addEventListener('click', doExportMarkdown);
  els.import.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', doImport);
  els.modalBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  await reload();
  renderUsage();
}

function sortClips() {
  const dir = state.sort === 'oldest' ? 1 : -1;
  state.clips.sort((a, b) => (a.createdAt - b.createdAt) * dir);
}

async function reload() {
  const [clips, projects, tags] = await Promise.all([getAllClips(), getProjects(), getTags()]);
  state.clips = clips;
  sortClips();
  // 去掉已不存在的选中项
  const ids = new Set(clips.map((c) => c.id));
  state.selected.forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });
  renderSidebar(projects, tags);
  renderGrid();
}

function renderSidebar(projects, tags) {
  // 项目:含数据但未登记的项目也补进去
  const projSet = new Set(projects);
  state.clips.forEach((c) => c.project && projSet.add(c.project));
  const projList = [...projSet].sort();
  state.allProjects = projList;

  els.projects.innerHTML = '';
  els.projects.appendChild(makePill('All', state.project === null, () => {
    state.project = null;
    renderSidebar(projects, tags);
    renderGrid();
  }));
  for (const p of projList) {
    els.projects.appendChild(makePill(p, state.project === p, () => {
      state.project = state.project === p ? null : p;
      renderSidebar(projects, tags);
      renderGrid();
    }));
  }

  els.tags.innerHTML = '';
  for (const t of tags) {
    const active = state.activeTags.has(t.name);
    const pill = makePill(t.name, active, () => {
      if (active) state.activeTags.delete(t.name);
      else state.activeTags.add(t.name);
      renderSidebar(projects, tags);
      renderGrid();
    }, t.count);
    const del = document.createElement('button');
    del.className = 'pill-del';
    del.textContent = '×';
    del.title = `Delete tag "${t.name}" from all clips`;
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete tag "${t.name}" from all clips? This can't be undone.`)) return;
      await removeTag(t.name);
      state.activeTags.delete(t.name);
      await reload();
    };
    pill.appendChild(del);
    els.tags.appendChild(pill);
  }
}

function makePill(label, active, onClick, count) {
  const li = document.createElement('li');
  li.className = 'pill' + (active ? ' active' : '');
  li.textContent = label;
  if (count != null) {
    const c = document.createElement('span');
    c.className = 'count';
    c.textContent = count;
    li.appendChild(c);
  }
  li.onclick = onClick;
  return li;
}

function renderGrid() {
  const filtered = filterClips(state.clips, {
    project: state.project,
    tags: [...state.activeTags],
    query: state.query,
  });
  els.empty.hidden = filtered.length > 0;
  els.empty.textContent = state.clips.length === 0
    ? 'Nothing clipped yet. Right-click an image or text on any page to start collecting.'
    : 'No clips match your filters.';
  els.grid.innerHTML = '';
  filtered.forEach((clip, i) => {
    const card = renderCard(clip);
    // 前若干张错峰入场,再多就不延迟,避免翻大库时长时间空屏
    if (i < 24) card.style.animationDelay = `${i * 28}ms`;
    els.grid.appendChild(card);
  });
  renderSelbar();
}

function renderCard(clip) {
  const m = buildCardModel(clip);
  const card = document.createElement('div');
  card.className = 'card' + (state.selected.has(clip.id) ? ' selected' : '');

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'select-box';
  check.checked = state.selected.has(clip.id);
  check.title = 'Select';
  check.onclick = (e) => e.stopPropagation();
  check.onchange = () => {
    if (check.checked) state.selected.add(clip.id);
    else state.selected.delete(clip.id);
    card.classList.toggle('selected', check.checked);
    renderSelbar();
  };
  card.appendChild(check);

  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.textContent = TYPE_LABEL[m.type] || m.type;
  card.appendChild(badge);

  if (m.image) {
    const frame = document.createElement('div');
    frame.className = 'thumb';
    const img = document.createElement('img');
    img.src = m.image;
    img.loading = 'lazy';
    img.alt = m.title;
    frame.appendChild(img);
    if (m.isVideo) {
      const play = document.createElement('span');
      play.className = 'play-badge';
      play.textContent = '▶';
      frame.appendChild(play);
    }
    frame.onclick = () => openLightbox(clip, m);
    frame.style.cursor = 'pointer';
    card.appendChild(frame);
  } else if (m.previewText) {
    const p = document.createElement('div');
    p.className = 'text-preview';
    p.textContent = m.previewText;
    card.appendChild(p);
  }

  const body = document.createElement('div');
  body.className = 'body';
  if (m.title) {
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = m.title;
    body.appendChild(t);
  }
  if (m.tags.length) {
    const tw = document.createElement('div');
    tw.className = 'tags';
    m.tags.forEach((tag) => {
      const s = document.createElement('span');
      s.className = 'tag';
      s.textContent = tag;
      tw.appendChild(s);
    });
    body.appendChild(tw);
  }
  card.appendChild(body);

  card.appendChild(buildActions(clip));
  return card;
}

function buildActions(clip) {
  const wrap = document.createElement('div');
  wrap.className = 'card-actions';

  const open = document.createElement('button');
  open.textContent = '↗';
  open.title = 'Open source';
  open.onclick = (e) => { e.stopPropagation(); if (clip.sourceUrl) window.open(clip.sourceUrl, '_blank'); };

  const edit = document.createElement('button');
  edit.textContent = '✎';
  edit.title = 'Edit';
  edit.onclick = (e) => { e.stopPropagation(); openEditModal(clip); };

  const del = document.createElement('button');
  del.textContent = '🗑';
  del.title = 'Delete';
  del.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm('Delete this clip?')) return;
    await deleteClip(clip.id);
    state.selected.delete(clip.id);
    await reload();
  };

  wrap.append(open, edit, del);
  return wrap;
}

// ---- 批量选择 ----

function renderSelbar() {
  const n = state.selected.size;
  els.selbar.hidden = n === 0;
  els.selcount.textContent = `${n} selected`;
}

function clearSelection() {
  state.selected.clear();
  renderGrid();
}

async function deleteSelected() {
  const n = state.selected.size;
  if (!n) return;
  if (!confirm(`Delete ${n} selected clip${n > 1 ? 's' : ''}?`)) return;
  for (const id of state.selected) await deleteClip(id);
  state.selected.clear();
  await reload();
  renderUsage();
}

// ---- 灯箱 ----

let lightboxUrl = null; // 上一张灯箱的 objectURL,切换/关闭时回收

async function openLightbox(clip, m) {
  els.modalBody.innerHTML = '';
  const img = document.createElement('img');
  img.className = 'lightbox-img';
  img.src = m.image; // 先挂缩略图,原图到手再替换,避免白屏
  els.modalBody.appendChild(img);

  const cap = document.createElement('div');
  cap.className = 'modal-caption';
  if (m.title) {
    const t = document.createElement('div');
    t.textContent = m.title;
    cap.appendChild(t);
  }
  if (m.sourceUrl) {
    const a = document.createElement('a');
    a.href = m.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = m.isVideo ? 'Watch source ↗' : 'Open source ↗';
    cap.appendChild(a);
  }
  els.modalBody.appendChild(cap);
  els.modal.hidden = false;

  // 图片剪藏:优先取存库原图,退而求其次用 content URL。
  if (clip.type === CLIP_TYPES.IMAGE) {
    revokeLightboxUrl();
    const blob = await getFullImage(clip.id).catch(() => null);
    if (els.modal.hidden) return; // 期间已关闭
    if (blob) {
      lightboxUrl = URL.createObjectURL(blob);
      img.src = lightboxUrl;
    } else if (clip.content) {
      img.src = clip.content;
    }
  }
}

// ---- 编辑模态(tags + note + 项目移动) ----

function openEditModal(clip) {
  els.modalBody.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'edit-panel';

  const h = document.createElement('h3');
  h.textContent = 'Edit clip';
  panel.appendChild(h);

  const projSel = buildProjectSelect(clip.project || '');
  const projLabel = labeled('Project', projSel.wrap);
  panel.appendChild(projLabel);

  const tagEditor = buildTagEditor(clip.tags || []);
  panel.appendChild(labeled('Tags', tagEditor.wrap));

  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.value = clip.note || '';
  noteInput.placeholder = 'optional';
  panel.appendChild(labeled('Note', noteInput));

  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  const cancel = document.createElement('button');
  cancel.className = 'tool-btn';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeModal;
  const save = document.createElement('button');
  save.className = 'tool-btn primary';
  save.textContent = 'Save';
  save.onclick = async () => {
    const tags = tagEditor.value();
    const note = noteInput.value.trim();
    const project = projSel.value() || clip.project;
    await updateClip(clip.id, { tags, note, project });
    closeModal();
    await reload();
  };
  actions.append(cancel, save);
  panel.appendChild(actions);

  els.modalBody.appendChild(panel);
  els.modal.hidden = false;
}

// tag 编辑:现有 tag 显示为可删 chip(× 单条移除),输入框回车/逗号新增。
function buildTagEditor(initial) {
  const tags = [...new Set(initial)];
  const wrap = document.createElement('div');
  wrap.className = 'tag-editor';
  const chips = document.createElement('div');
  chips.className = 'tag-chips';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = 'add tag, Enter to confirm';

  function renderChips() {
    chips.innerHTML = '';
    tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.textContent = '×';
      x.title = 'Remove tag';
      x.onclick = () => {
        const i = tags.indexOf(tag);
        if (i >= 0) tags.splice(i, 1);
        renderChips();
      };
      chip.appendChild(x);
      chips.appendChild(chip);
    });
  }

  function commit() {
    input.value.split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => {
      if (!tags.includes(t)) tags.push(t);
    });
    input.value = '';
    renderChips();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      tags.pop();
      renderChips();
    }
  });
  input.addEventListener('blur', commit);

  renderChips();
  wrap.append(chips, input);
  return { wrap, value: () => { commit(); return [...tags]; } };
}

// 项目下拉:已有项目 + 当前项目 + "New project…"(选中后显露文本框)
function buildProjectSelect(current) {
  const wrap = document.createElement('div');
  const sel = document.createElement('select');
  const names = [...new Set([...state.allProjects, current])].filter(Boolean).sort();
  for (const name of names) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    if (name === current) o.selected = true;
    sel.appendChild(o);
  }
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ New project…';
  sel.appendChild(newOpt);

  const newInput = document.createElement('input');
  newInput.type = 'text';
  newInput.placeholder = 'New project name';
  newInput.hidden = true;
  newInput.style.marginTop = '6px';

  sel.onchange = () => {
    const isNew = sel.value === '__new__';
    newInput.hidden = !isNew;
    if (isNew) newInput.focus();
  };

  wrap.append(sel, newInput);
  return {
    wrap,
    value: () => (sel.value === '__new__' ? newInput.value.trim() : sel.value),
  };
}

function labeled(labelText, control) {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function closeModal() {
  els.modal.hidden = true;
  els.modalBody.innerHTML = '';
  revokeLightboxUrl();
}

function revokeLightboxUrl() {
  if (lightboxUrl) {
    URL.revokeObjectURL(lightboxUrl);
    lightboxUrl = null;
  }
}

// ---- 导出 / 导入 ----

async function doExportJson() {
  const data = await exportData();
  downloadBlob(
    JSON.stringify(data, null, 2),
    `clipvault-backup-${dateStamp()}.json`,
    'application/json'
  );
}

async function doExportMarkdown() {
  const md = clipsToMarkdown(state.clips);
  downloadBlob(md, `clipvault-${dateStamp()}.md`, 'text/markdown');
}

async function doImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const r = await importData(payload);
    await reload();
    renderUsage();
    alert(`Imported ${r.added} new clip${r.added === 1 ? '' : 's'}, skipped ${r.skipped} duplicate${r.skipped === 1 ? '' : 's'}.`);
  } catch (err) {
    alert('Import failed: ' + err.message);
  } finally {
    e.target.value = ''; // 允许再次选同一文件
  }
}

// 纯格式化,不触库。
function clipsToMarkdown(clips) {
  const lines = ['# ClipVault export', ''];
  for (const c of clips) {
    const title = c.pageTitle || c.content || '(untitled)';
    lines.push(`- **${title}**`);
    if (c.sourceUrl) lines.push(`  - Source: ${c.sourceUrl}`);
    if (c.project) lines.push(`  - Project: ${c.project}`);
    if (c.tags?.length) lines.push(`  - Tags: ${c.tags.join(', ')}`);
    if (c.note) lines.push(`  - Note: ${c.note}`);
  }
  return lines.join('\n');
}

function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function renderUsage() {
  const { usage } = await estimateUsage();
  if (!usage) {
    els.usage.textContent = `${state.clips.length} clips`;
    return;
  }
  const mb = (usage / 1024 / 1024).toFixed(1);
  els.usage.textContent = `${mb} MB used · ${state.clips.length} clips`;
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
