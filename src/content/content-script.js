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
  // 只读预备:算出建议项目/标签/项目列表,先不入库。
  const prep = await sendMessage({ type: MSG.PREPARE, clip });
  if (!prep?.ok) {
    toast('Clip failed', true);
    return;
  }
  showBubble(clip, prep);
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
    case 'clipvault-shortcut': {
      // 快捷键不带选区信息,自己从页面读 window.getSelection;有选区剪文本,
      // 没有就退化为剪整页(等价 clipvault-page)。
      const sel = (window.getSelection?.().toString() || '').trim();
      if (sel) return { ...base, type: CLIP_TYPES.TEXT, content: sel };
      const media = detectMediaType(msg.pageUrl);
      if (media) return { ...base, type: media.type, content: msg.pageUrl, thumbnail: media.thumbnail };
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

function sendMessage(payload) {
  return new Promise((res) => {
    chrome.runtime.sendMessage(payload, res);
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

function showBubble(clip, prep) {
  removeBubble();
  const projects = prep.projects || [];
  const current = prep.project || '';
  const options = [...new Set([...projects, current])].filter(Boolean).sort();
  const optionHtml = options
    .map((p) => `<option value="${escapeHtml(p)}"${p === current ? ' selected' : ''}>${escapeHtml(p)}</option>`)
    .join('');

  const wrap = document.createElement('div');
  wrap.id = 'clipvault-bubble';
  wrap.innerHTML = `
    <div class="cv-head">
      <span class="cv-title">
        <svg class="cv-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        Save clip
      </span>
      <button class="cv-x" title="Discard" aria-label="Discard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <label class="cv-row"><span>Project</span>
      <select class="cv-project">${optionHtml}<option value="__new__">+ New project…</option></select>
    </label>
    <label class="cv-row cv-newproj" hidden><span>New project name</span>
      <input class="cv-newproj-input" type="text" placeholder="e.g. Moodboard">
    </label>
    <label class="cv-row"><span>Tags</span>
      <input class="cv-tags" type="text" value="${escapeHtml((prep.tags || []).join(', '))}" placeholder="comma separated">
    </label>
    <label class="cv-row"><span>Note</span>
      <input class="cv-note" type="text" placeholder="optional">
    </label>
    <div class="cv-actions">
      <button class="cv-discard">Discard</button>
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
  wrap.querySelector('.cv-discard').onclick = removeBubble;
  const saveBtn = wrap.querySelector('.cv-save');
  saveBtn.onclick = () => {
    const tags = wrap.querySelector('.cv-tags').value.split(',').map((s) => s.trim()).filter(Boolean);
    const note = wrap.querySelector('.cv-note').value.trim();
    const project = projectSel.value === '__new__'
      ? newProjInput.value.trim()
      : projectSel.value;
    const toSave = { ...clip, tags, note };
    if (project) toSave.project = project;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    sendMessage({ type: MSG.CAPTURE, clip: toSave }).then((resp) => {
      if (!resp?.ok) {
        toast('Save failed', true);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        return;
      }
      toast(resp.status === 'duplicate' ? 'Already saved — skipped duplicate' : 'Saved');
      removeBubble();
    });
  };

  // Enter 在文本输入里 = 保存;Escape 在气泡内任意处 = 放弃(不入库)。
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      if (!saveBtn.disabled) saveBtn.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      removeBubble();
    }
  });

  // 只在"完全没碰过冒泡"时才自动关闭;一旦聚焦输入框或鼠标移入,
  // 取消倒计时,避免正在输标签时被关掉。未点 Save 而关闭 = 不入库。
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
    width: '292px', background: '#ffffff', color: '#1c1917',
    borderRadius: '12px', boxShadow: '0 12px 32px -10px rgba(28,25,23,.28)',
    border: '1px solid #e7e5e4',
    font: '13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
    padding: '14px', boxSizing: 'border-box',
    animation: 'cvBubbleIn .24s ease',
  });
  const style = document.createElement('style');
  style.textContent = `
    @keyframes cvBubbleIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion: reduce){#clipvault-bubble{animation:none!important}}
    #clipvault-bubble .cv-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-weight:600;font-size:13px}
    #clipvault-bubble .cv-title{display:inline-flex;align-items:center;gap:6px;color:#1c1917}
    #clipvault-bubble .cv-check{width:15px;height:15px}
    #clipvault-bubble .cv-x{display:inline-flex;align-items:center;justify-content:center;border:0;background:none;cursor:pointer;color:#a8a29e;padding:2px;transition:color .15s}
    #clipvault-bubble .cv-x svg{width:16px;height:16px}
    #clipvault-bubble .cv-x:hover{color:#1c1917}
    #clipvault-bubble .cv-row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
    #clipvault-bubble .cv-row span{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#78716c}
    #clipvault-bubble .cv-row input,#clipvault-bubble .cv-row select{padding:8px 10px;border:1px solid #e7e5e4;border-radius:8px;font-size:13px;box-sizing:border-box;background:#ffffff;color:#1c1917;font-family:inherit}
    #clipvault-bubble .cv-row input:focus,#clipvault-bubble .cv-row select:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px #eff6ff}
    #clipvault-bubble .cv-row input::placeholder{color:#a8a29e}
    #clipvault-bubble .cv-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
    #clipvault-bubble .cv-actions button{padding:8px 14px;border-radius:8px;border:1px solid #e7e5e4;background:#ffffff;color:#1c1917;cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;transition:background .15s,border-color .15s}
    #clipvault-bubble .cv-actions button:hover{background:#f5f5f4;border-color:#a8a29e}
    #clipvault-bubble .cv-save{background:#2563eb;color:#fff;border-color:#2563eb;font-weight:600}
    #clipvault-bubble .cv-save:hover{background:#1d4ed8;border-color:#1d4ed8}`;
  wrap.appendChild(style);
}

function toast(text, isError) {
  const t = document.createElement('div');
  t.textContent = text;
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  Object.assign(t.style, {
    position: 'fixed', left: '50%', bottom: '32px', transform: 'translateX(-50%)',
    zIndex: 2147483647, padding: '10px 18px', borderRadius: '10px',
    background: isError ? '#fef2f2' : '#1c1917', color: isError ? '#dc2626' : '#ffffff',
    border: isError ? '1px solid #fecaca' : '1px solid transparent',
    font: '13px system-ui, sans-serif', fontWeight: '500',
    boxShadow: '0 10px 28px -10px rgba(28,25,23,.4)',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
