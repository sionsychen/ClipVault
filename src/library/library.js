import {
  getAllClips, getProjects, getTags, updateClip, deleteClip,
  estimateUsage, exportData, importData, getFullImage, removeTag,
  addClip, saveFullImage, removeProject,
} from '../db/clip-store.js';
import { filterClips } from '../core/search.js';
import { buildCardModel } from './render.js';
import {
  CLIP_TYPES, LAST_BACKUP_KEY, BACKUP_SNOOZE_KEY,
  STORAGE_WARN_RATIO, BACKUP_STALE_MS, BACKUP_SNOOZE_MS, DEFAULT_PROJECT,
} from '../core/constants.js';

const state = {
  clips: [],
  filtered: [], // 当前筛选/搜索后的可见集合(灯箱翻页用)
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
  backupBanner: document.getElementById('backup-banner'),
  backupMsg: document.querySelector('#backup-banner .backup-msg'),
  backupNow: document.getElementById('backup-now'),
  backupSnooze: document.getElementById('backup-snooze'),
  toasts: document.getElementById('toasts'),
};

const TYPE_LABEL = {
  [CLIP_TYPES.IMAGE]: 'IMG',
  [CLIP_TYPES.TEXT]: 'TEXT',
  [CLIP_TYPES.ARTICLE]: 'ARTICLE',
  [CLIP_TYPES.VIDEO]: 'VIDEO',
  [CLIP_TYPES.TWEET]: 'TWEET',
};

// Inline Lucide-style icons (stroke, 24-grid). Avoids emoji/unicode glyphs,
// which render inconsistently across platforms and read as filler.
const ICON_PATHS = {
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

// ---- toast(含可选 Undo 动作)----
// 替代原生 alert/confirm:非阻塞,不打断,契合中性风格。
function showToast(message, { actionLabel, onAction, duration = 5000, danger = false } = {}) {
  const t = document.createElement('div');
  t.className = 'toast' + (danger ? ' danger' : '');
  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message;
  t.appendChild(msg);

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    t.classList.add('out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
    // 兜底:动画被 reduced-motion 关掉时直接移除
    setTimeout(() => t.remove(), 250);
  };

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.onclick = () => { dismiss(); onAction(); };
    t.appendChild(btn);
  }

  els.toasts.appendChild(t);
  timer = setTimeout(dismiss, duration);
  return dismiss;
}

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
  els.backupNow.addEventListener('click', () => { doExportJson(); });
  els.backupSnooze.addEventListener('click', snoozeBackupReminder);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return closeModal();
    // 灯箱开着时方向键翻页(编辑模态开着时不翻)。
    if (!lightboxOpen || els.modal.hidden) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const cur = lightboxClipId;
      const next = cur != null ? adjacentImageClip(cur, dir) : null;
      if (next) openLightbox(next.clip, next.m);
    }
  });
  await reload();
  renderUsage();
  refreshBackupReminder();
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
  refreshBackupReminder();
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
    const pill = makePill(p, state.project === p, () => {
      state.project = state.project === p ? null : p;
      renderSidebar(projects, tags);
      renderGrid();
    });
    // 默认项目(Unsorted)是兜底归属,不给删除入口。
    if (p !== DEFAULT_PROJECT) {
      const del = document.createElement('button');
      del.className = 'pill-del';
      del.appendChild(icon('x'));
      del.title = `Delete project "${p}" (clips move to ${DEFAULT_PROJECT})`;
      del.setAttribute('aria-label', `Delete project ${p}, moving its clips to ${DEFAULT_PROJECT}`);
      del.onclick = async (e) => {
        e.stopPropagation();
        // 记下受影响的 clip,供撤销时归还原项目。
        const affected = state.clips.filter((c) => c.project === p).map((c) => c.id);
        await removeProject(p);
        if (state.project === p) state.project = null;
        await reload();
        showToast(`Deleted project "${p}" · ${affected.length} clip${affected.length === 1 ? '' : 's'} moved to ${DEFAULT_PROJECT}`, {
          actionLabel: 'Undo',
          onAction: async () => {
            for (const id of affected) await updateClip(id, { project: p });
            await reload();
          },
        });
      };
      pill.appendChild(del);
    }
    els.projects.appendChild(pill);
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
    del.appendChild(icon('x'));
    del.title = `Delete tag "${t.name}" from all clips`;
    del.setAttribute('aria-label', `Delete tag ${t.name} from all clips`);
    del.onclick = async (e) => {
      e.stopPropagation();
      // 记下带此 tag 的 clip,供撤销时逐个加回。
      const affected = state.clips.filter((c) => c.tags?.includes(t.name)).map((c) => c.id);
      await removeTag(t.name);
      state.activeTags.delete(t.name);
      await reload();
      showToast(`Removed tag "${t.name}" from ${affected.length} clip${affected.length === 1 ? '' : 's'}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          for (const id of affected) {
            const clip = state.clips.find((x) => x.id === id);
            const tags = [...new Set([...(clip?.tags || []), t.name])];
            await updateClip(id, { tags });
          }
          await reload();
        },
      });
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
  state.filtered = filtered; // 灯箱 ←/→ 在这个可见集合里翻
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
  badge.className = 'type-badge' + (m.image ? '' : ' on-light');
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
      play.appendChild(icon('play'));
      frame.appendChild(play);
    }
    if (m.linkOnly) {
      const lo = document.createElement('span');
      lo.className = 'link-only';
      lo.appendChild(icon('open'));
      lo.append('Link only');
      lo.title = 'Full-resolution image was not saved (cross-origin). Shows thumbnail; opens source for the original.';
      frame.appendChild(lo);
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
  open.appendChild(icon('open'));
  open.title = 'Open source';
  open.setAttribute('aria-label', 'Open source page');
  open.onclick = (e) => { e.stopPropagation(); if (clip.sourceUrl) window.open(clip.sourceUrl, '_blank'); };

  const edit = document.createElement('button');
  edit.appendChild(icon('edit'));
  edit.title = 'Edit';
  edit.setAttribute('aria-label', 'Edit clip');
  edit.onclick = (e) => { e.stopPropagation(); openEditModal(clip); };

  const del = document.createElement('button');
  del.className = 'danger';
  del.appendChild(icon('trash'));
  del.title = 'Delete';
  del.setAttribute('aria-label', 'Delete clip');
  del.onclick = (e) => {
    e.stopPropagation();
    deleteWithUndo([clip]);
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
  const clips = state.clips.filter((c) => state.selected.has(c.id));
  state.selected.clear();
  await deleteWithUndo(clips);
}

// 删除即时执行(不再弹 confirm),给一个 Undo toast 兜底。
// 撤销 = 重插记录 + 原图 Blob。addClip 保留 createdAt,所以排序位置能复原。
async function deleteWithUndo(clips) {
  if (!clips.length) return;
  // 删前抓齐原图 Blob,供撤销时还原。
  const snapshots = await Promise.all(clips.map(async (c) => ({
    clip: c,
    blob: c.gotImage ? await getFullImage(c.id).catch(() => null) : null,
  })));
  for (const c of clips) {
    await deleteClip(c.id);
    state.selected.delete(c.id);
  }
  await reload();
  renderUsage();

  const n = clips.length;
  showToast(`Deleted ${n} clip${n === 1 ? '' : 's'}`, {
    actionLabel: 'Undo',
    onAction: async () => {
      for (const { clip, blob } of snapshots) {
        const { id } = await addClip(clip); // clipKey 去重:已存在则命中原记录
        if (blob) await saveFullImage(id, blob);
      }
      await reload();
      renderUsage();
    },
  });
}

// ---- 灯箱 ----

let lightboxUrl = null; // 上一张灯箱的 objectURL,切换/关闭时回收
let lightboxOpen = false;
let lightboxClipId = null;

async function openLightbox(clip, m) {
  lightboxOpen = true;
  lightboxClipId = clip.id;
  els.modalBody.innerHTML = '';

  const nav = (dir) => {
    const next = adjacentImageClip(clip.id, dir);
    if (next) openLightbox(next.clip, next.m);
  };

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

  // 上一张/下一张按钮:仅当可见集合里有多张带图的 clip 才显示。
  if (countImageClips() > 1) {
    els.modalBody.appendChild(makeNavButton('prev', () => nav(-1)));
    els.modalBody.appendChild(makeNavButton('next', () => nav(1)));
  }

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

// 可见集合里带缩略图/图的 clip(灯箱可翻的那些)。
function imageClipsInView() {
  return state.filtered
    .map((c) => ({ clip: c, m: buildCardModel(c) }))
    .filter((x) => x.m.image);
}
function countImageClips() {
  return imageClipsInView().length;
}
// 相对当前 clip 的上/下一张(带图),循环。
function adjacentImageClip(currentId, dir) {
  const list = imageClipsInView();
  if (list.length < 2) return null;
  const i = list.findIndex((x) => x.clip.id === currentId);
  if (i < 0) return null;
  const j = (i + dir + list.length) % list.length;
  return list[j];
}

function makeNavButton(dir, onClick) {
  const btn = document.createElement('button');
  btn.className = `lightbox-nav ${dir}`;
  btn.setAttribute('aria-label', dir === 'prev' ? 'Previous' : 'Next');
  btn.appendChild(icon(dir === 'prev' ? 'chevronLeft' : 'chevronRight'));
  btn.onclick = (e) => { e.stopPropagation(); onClick(); };
  return btn;
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
      x.appendChild(icon('x'));
      x.title = 'Remove tag';
      x.setAttribute('aria-label', `Remove tag ${tag}`);
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
  lightboxOpen = false;
  lightboxClipId = null;
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
  // 记下备份时间,清掉暂缓,收起提醒。整库 JSON 才算备份,Markdown 不算。
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  localStorage.removeItem(BACKUP_SNOOZE_KEY);
  refreshBackupReminder();
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
    showToast(`Imported ${r.added} new clip${r.added === 1 ? '' : 's'}, skipped ${r.skipped} duplicate${r.skipped === 1 ? '' : 's'}.`);
  } catch (err) {
    showToast('Import failed: ' + err.message, { danger: true, duration: 7000 });
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
  const { usage, quota } = await estimateUsage();
  if (!usage) {
    els.usage.textContent = `${state.clips.length} clips`;
    els.usage.classList.remove('warn');
    return;
  }
  const mb = (usage / 1024 / 1024).toFixed(1);
  const near = quota && usage / quota >= STORAGE_WARN_RATIO;
  els.usage.classList.toggle('warn', !!near);
  if (near) {
    const pct = Math.round((usage / quota) * 100);
    els.usage.textContent = `⚠ Storage ${pct}% full · export a backup`;
    els.usage.title = `${mb} MB of ${(quota / 1024 / 1024).toFixed(0)} MB used. Approaching the browser limit — export a backup to avoid losing clips.`;
  } else {
    els.usage.textContent = `${mb} MB used · ${state.clips.length} clips`;
    els.usage.title = '';
  }
}

// ---- 备份提醒(阶段 2:数据安全)----
// 库非空、距上次整库备份超阈值、且不在暂缓期 → 顶部提示导出。
// localStorage 存在库页面(与 clip 的 IndexedDB 分开),清缓存两者一起没,
// 提醒的意义正是催用户在清缓存/换设备前导出。
function refreshBackupReminder() {
  const n = state.clips.length;
  const last = Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0;
  const snoozeUntil = Number(localStorage.getItem(BACKUP_SNOOZE_KEY)) || 0;
  const now = Date.now();
  const stale = now - last >= BACKUP_STALE_MS; // last=0 时必 stale
  const snoozed = now < snoozeUntil;
  const show = n > 0 && stale && !snoozed;

  els.backupBanner.hidden = !show;
  if (!show) return;

  els.backupMsg.textContent = last
    ? `Your last backup was ${daysAgo(now - last)}. Export a backup to keep your ${n} clip${n === 1 ? '' : 's'} safe.`
    : `You have ${n} clip${n === 1 ? '' : 's'} and no backup yet. Clips live only in this browser — export a backup so you don't lose them.`;
}

function snoozeBackupReminder() {
  localStorage.setItem(BACKUP_SNOOZE_KEY, String(Date.now() + BACKUP_SNOOZE_MS));
  refreshBackupReminder();
}

function daysAgo(ms) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
