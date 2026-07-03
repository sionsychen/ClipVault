import { MSG, CLIP_TYPES, THUMB_MAX_DIM } from '../core/constants.js';
import { computeThumbDimensions } from '../core/thumbnail.js';

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
    case 'clipvault-link':
      return { ...base, type: CLIP_TYPES.TEXT, content: msg.linkUrl, note: msg.selectionText || '' };
    case 'clipvault-page':
      return {
        ...base,
        type: CLIP_TYPES.ARTICLE,
        content: (getMeta('description') || document.body?.innerText || '').slice(0, 2000),
      };
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
  const wrap = document.createElement('div');
  wrap.id = 'clipvault-bubble';
  wrap.innerHTML = `
    <div class="cv-head">
      <span>&#10003; Saved to <b>${escapeHtml(resp.project || '')}</b></span>
      <button class="cv-x" title="Close">&times;</button>
    </div>
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

  wrap.querySelector('.cv-x').onclick = removeBubble;
  wrap.querySelector('.cv-open').onclick = () => {
    chrome.runtime.sendMessage({ type: 'clipvault:openLibrary' }, () => void chrome.runtime.lastError);
    removeBubble();
  };
  wrap.querySelector('.cv-save').onclick = () => {
    const tags = wrap.querySelector('.cv-tags').value.split(',').map((s) => s.trim()).filter(Boolean);
    const note = wrap.querySelector('.cv-note').value.trim();
    chrome.runtime.sendMessage({ type: MSG.SAVE_EDITS, id: resp.id, patch: { tags, note } }, () => {
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
    width: '280px', background: '#fff', color: '#1a1a1a',
    borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,.24)',
    font: '13px/1.5 system-ui, sans-serif', padding: '12px', boxSizing: 'border-box',
  });
  const style = document.createElement('style');
  style.textContent = `
    #clipvault-bubble .cv-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:500}
    #clipvault-bubble .cv-x{border:0;background:none;font-size:18px;cursor:pointer;color:#888;line-height:1}
    #clipvault-bubble .cv-row{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
    #clipvault-bubble .cv-row span{font-size:11px;color:#666}
    #clipvault-bubble .cv-row input{padding:5px 7px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box}
    #clipvault-bubble .cv-actions{display:flex;gap:8px;justify-content:flex-end}
    #clipvault-bubble .cv-actions button{padding:5px 12px;border-radius:6px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;font-size:12px}
    #clipvault-bubble .cv-save{background:#2d6cdf;color:#fff;border-color:#2d6cdf}`;
  wrap.appendChild(style);
}

function toast(text, isError) {
  const t = document.createElement('div');
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed', left: '50%', bottom: '32px', transform: 'translateX(-50%)',
    zIndex: 2147483647, padding: '8px 16px', borderRadius: '8px',
    background: isError ? '#c0392b' : '#333', color: '#fff',
    font: '13px system-ui, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,.3)',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
