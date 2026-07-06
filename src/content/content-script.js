import { MSG, CLIP_TYPES, THUMB_MAX_DIM } from '../core/constants.js';
import { computeThumbDimensions } from '../core/thumbnail.js';
import { detectMediaType } from '../core/media-type.js';

// 防重复注入:按需注入(executeScript)可能把本文件重复执行一遍,
// 若无此 guard 就会注册第二个 onMessage listener,导致一次剪藏存两次。
if (!window.__clipvaultInjected) {
  window.__clipvaultInjected = true;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== MSG.CAPTURE_TRIGGER) return false;
    handleTrigger(msg).catch((e) => toast('Clip failed: ' + e.message, true));
    sendResponse({ received: true }); // 干净关闭消息端口,避免 background 侧误报 lastError
    return false;
  });
}

async function handleTrigger(msg) {
  const clip = await buildClip(msg);
  if (!clip) return;
  const resp = await sendCapture(clip);
  if (!resp?.ok) {
    toast('Clip failed', true);
    return;
  }
  if (resp.status === 'duplicate') {
    toast('Already saved — skipped duplicate');
  }
  showBubble(resp);
}

async function buildClip(msg) {
  const pageTitle = document.title || '';
  const base = { sourceUrl: msg.pageUrl, pageTitle };

  switch (msg.menuId) {
    case 'clipvault-image': {
      const thumbnail = await makeThumbnail(msg.srcUrl).catch(() => null);
      return { ...base, type: CLIP_TYPES.IMAGE, content: msg.srcUrl, thumbnail };
    }
    case 'clipvault-selection':
      return { ...base, type: CLIP_TYPES.TEXT, content: (msg.selectionText || '').trim() };
    case 'clipvault-link': {
      const media = detectMediaType(msg.linkUrl);
      if (media) {
        return { ...base, type: media.type, content: msg.linkUrl, thumbnail: media.thumbnail, note: msg.selectionText || '' };
      }
      return { ...base, type: CLIP_TYPES.TEXT, content: msg.linkUrl, note: msg.selectionText || '' };
    }
    case 'clipvault-page': {
      const media = detectMediaType(msg.pageUrl);
      if (media) {
        return { ...base, type: media.type, content: msg.pageUrl, thumbnail: media.thumbnail };
      }
      return {
        ...base,
        type: CLIP_TYPES.ARTICLE,
        content: (getMeta('description') || document.body?.innerText || '').slice(0, 2000),
      };
    }
    default:
      return null;
  }
}

function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"], meta[property="og:${name}"]`);
  return el?.getAttribute('content') || '';
}

function sendCapture(clip) {
  return new Promise((res) => {
    chrome.runtime.sendMessage({ type: MSG.CAPTURE, clip }, res);
  });
}

// 用 canvas 把图片缩到 THUMB_MAX_DIM 以内,存 dataURL,避免库页面拉全尺寸原图。
function makeThumbnail(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const { width, height } = computeThumbDimensions(img.naturalWidth, img.naturalHeight, THUMB_MAX_DIM);
        if (!width || !height) return resolve(null);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        resolve(null); // 跨域污染 canvas 时降级为无缩略图
      }
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

// ---- UI: 编辑气泡 + toast ----

let bubbleEl = null;

function showBubble(resp) {
  removeBubble();
  const projects = resp.projects || [];
  const current = resp.project || '';
  const options = [...new Set([...projects, current])].filter(Boolean).sort();
  const optionHtml = options
    .map((p) => `<option value="${escapeHtml(p)}"${p === current ? ' selected' : ''}>${escapeHtml(p)}</option>`)
    .join('');

  const wrap = document.createElement('div');
  wrap.id = 'clipvault-bubble';
  wrap.innerHTML = `
    <div class="cv-head">
      <span>&#10003; Clipped</span>
      <button class="cv-x" title="Close">&times;</button>
    </div>
    <label class="cv-row"><span>Project</span>
      <select class="cv-project">${optionHtml}<option value="__new__">+ New project…</option></select>
    </label>
    <label class="cv-row cv-newproj" hidden><span>New project name</span>
      <input class="cv-newproj-input" type="text" placeholder="e.g. Moodboard">
    </label>
    <label class="cv-row"><span>Tags</span>
      <input class="cv-tags" type="text" value="${escapeHtml((resp.tags || []).join(', '))}" placeholder="comma separated">
    </label>
    <label class="cv-row"><span>Note</span>
      <input class="cv-note" type="text" placeholder="optional">
    </label>
    <div class="cv-actions">
      <button class="cv-open">Open Library</button>
      <button class="cv-save">Save</button>
    </div>`;
  applyBubbleStyles(wrap);
  document.body.appendChild(wrap);
  bubbleEl = wrap;

  const projectSel = wrap.querySelector('.cv-project');
  const newProjRow = wrap.querySelector('.cv-newproj');
  const newProjInput = wrap.querySelector('.cv-newproj-input');
  projectSel.onchange = () => {
    const isNew = projectSel.value === '__new__';
    newProjRow.hidden = !isNew;
    if (isNew) newProjInput.focus();
  };

  wrap.querySelector('.cv-x').onclick = removeBubble;
  wrap.querySelector('.cv-open').onclick = () => {
    chrome.runtime.sendMessage({ type: 'clipvault:openLibrary' }, () => void chrome.runtime.lastError);
    removeBubble();
  };
  wrap.querySelector('.cv-save').onclick = () => {
    const tags = wrap.querySelector('.cv-tags').value.split(',').map((s) => s.trim()).filter(Boolean);
    const note = wrap.querySelector('.cv-note').value.trim();
    const project = projectSel.value === '__new__'
      ? newProjInput.value.trim()
      : projectSel.value;
    const patch = { tags, note };
    if (project && project !== current) patch.project = project;
    chrome.runtime.sendMessage({ type: MSG.SAVE_EDITS, id: resp.id, patch }, () => {
      void chrome.runtime.lastError;
      toast('Saved');
      removeBubble();
    });
  };

  // 只在"完全没碰过冒泡"时才自动关闭;一旦聚焦输入框或鼠标移入,
  // 取消倒计时,避免正在输标签时被关掉。
  const cancelAutoClose = () => clearTimeout(showBubble._t);
  wrap.addEventListener('mouseenter', cancelAutoClose);
  wrap.addEventListener('focusin', cancelAutoClose);

  clearTimeout(showBubble._t);
  showBubble._t = setTimeout(removeBubble, 12000);
}

function removeBubble() {
  clearTimeout(showBubble._t);
  if (bubbleEl?.parentNode) bubbleEl.remove();
  bubbleEl = null;
}

function applyBubbleStyles(wrap) {
  Object.assign(wrap.style, {
    position: 'fixed', right: '20px', bottom: '20px', zIndex: 2147483647,
    width: '292px', background: '#221d15', color: '#efe7d8',
    borderRadius: '14px', boxShadow: '0 18px 48px -12px rgba(0,0,0,.7)',
    border: '1px solid #362f23',
    font: '13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: '14px', boxSizing: 'border-box',
    animation: 'cvBubbleIn .28s cubic-bezier(.2,.8,.3,1)',
  });
  const style = document.createElement('style');
  style.textContent = `
    @keyframes cvBubbleIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
    #clipvault-bubble .cv-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-weight:600;font-size:13px}
    #clipvault-bubble .cv-head span{display:inline-flex;align-items:center;gap:6px;color:#e6c473}
    #clipvault-bubble .cv-x{border:0;background:none;font-size:20px;cursor:pointer;color:#9d9280;line-height:1;padding:0;transition:color .15s}
    #clipvault-bubble .cv-x:hover{color:#efe7d8}
    #clipvault-bubble .cv-row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
    #clipvault-bubble .cv-row span{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#d3a84e}
    #clipvault-bubble .cv-row input,#clipvault-bubble .cv-row select{padding:8px 10px;border:1px solid #362f23;border-radius:9px;font-size:13px;box-sizing:border-box;background:#1d1912;color:#efe7d8;font-family:inherit}
    #clipvault-bubble .cv-row input:focus,#clipvault-bubble .cv-row select:focus{outline:none;border-color:#d3a84e;box-shadow:0 0 0 3px #3a2f18}
    #clipvault-bubble .cv-row input::placeholder{color:#6f6657}
    #clipvault-bubble .cv-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
    #clipvault-bubble .cv-actions button{padding:8px 14px;border-radius:9px;border:1px solid #362f23;background:#1d1912;color:#efe7d8;cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;transition:all .15s}
    #clipvault-bubble .cv-actions button:hover{border-color:#d3a84e;color:#e6c473}
    #clipvault-bubble .cv-save{background:linear-gradient(#e6c473,#d3a84e);color:#201a0d;border-color:transparent;font-weight:600}
    #clipvault-bubble .cv-save:hover{filter:brightness(1.06);color:#201a0d}`;
  wrap.appendChild(style);
}

function toast(text, isError) {
  const t = document.createElement('div');
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed', left: '50%', bottom: '32px', transform: 'translateX(-50%)',
    zIndex: 2147483647, padding: '10px 18px', borderRadius: '10px',
    background: isError ? '#3a221a' : '#221d15', color: isError ? '#d67a5c' : '#efe7d8',
    border: `1px solid ${isError ? '#d67a5c' : '#362f23'}`,
    font: '13px system-ui, sans-serif', fontWeight: '500',
    boxShadow: '0 10px 32px -8px rgba(0,0,0,.6)',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
