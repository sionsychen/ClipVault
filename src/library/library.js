import { getAllClips, getProjects, getTags, updateClip, deleteClip } from '../db/clip-store.js';
import { filterClips } from '../core/search.js';
import { buildCardModel } from './render.js';
import { estimateUsage } from '../db/clip-store.js';
import { CLIP_TYPES } from '../core/constants.js';

const state = {
  clips: [],
  project: null,
  activeTags: new Set(),
  query: '',
};

const els = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  projects: document.getElementById('projects'),
  tags: document.getElementById('tags'),
  search: document.getElementById('search'),
  usage: document.getElementById('usage'),
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
  await reload();
  renderUsage();
}

async function reload() {
  const [clips, projects, tags] = await Promise.all([getAllClips(), getProjects(), getTags()]);
  state.clips = clips.sort((a, b) => b.createdAt - a.createdAt);
  renderSidebar(projects, tags);
  renderGrid();
}

function renderSidebar(projects, tags) {
  // 项目:含数据但未登记的项目也补进去
  const projSet = new Set(projects);
  state.clips.forEach((c) => c.project && projSet.add(c.project));
  const projList = [...projSet].sort();

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
    els.tags.appendChild(makePill(t.name, active, () => {
      if (active) state.activeTags.delete(t.name);
      else state.activeTags.add(t.name);
      renderSidebar(projects, tags);
      renderGrid();
    }, t.count));
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
  for (const clip of filtered) {
    els.grid.appendChild(renderCard(clip));
  }
}

function renderCard(clip) {
  const m = buildCardModel(clip);
  const card = document.createElement('div');
  card.className = 'card';

  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.textContent = TYPE_LABEL[m.type] || m.type;
  card.appendChild(badge);

  if (m.image) {
    const img = document.createElement('img');
    img.src = m.image;
    img.loading = 'lazy';
    img.alt = m.title;
    img.onclick = () => m.sourceUrl && window.open(m.sourceUrl, '_blank');
    img.style.cursor = m.sourceUrl ? 'pointer' : 'default';
    card.appendChild(img);
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
  edit.title = 'Edit tags';
  edit.onclick = async (e) => {
    e.stopPropagation();
    const tagStr = prompt('Tags (comma separated):', (clip.tags || []).join(', '));
    if (tagStr === null) return;
    const tags = tagStr.split(',').map((s) => s.trim()).filter(Boolean);
    await updateClip(clip.id, { tags });
    await reload();
  };

  const del = document.createElement('button');
  del.textContent = '🗑';
  del.title = 'Delete';
  del.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm('Delete this clip?')) return;
    await deleteClip(clip.id);
    await reload();
  };

  wrap.append(open, edit, del);
  return wrap;
}

async function renderUsage() {
  const { usage, quota } = await estimateUsage();
  if (!usage) return;
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
