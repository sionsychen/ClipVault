import { MSG, CLIP_TYPES, DEFAULT_PROJECT, LAST_PROJECT_KEY } from '../core/constants.js';
import { addClip, updateClip, getProjects } from '../db/clip-store.js';
import { inferTags } from '../core/tag-inference.js';

const MENU = {
  IMAGE: 'clipvault-image',
  SELECTION: 'clipvault-selection',
  LINK: 'clipvault-link',
  PAGE: 'clipvault-page',
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.IMAGE, title: 'Clip this image', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.SELECTION, title: 'Clip selected text', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.LINK, title: 'Clip this link', contexts: ['link'] });
    chrome.contextMenus.create({ id: MENU.PAGE, title: 'Clip this page', contexts: ['page'] });
  });
});

// 点击工具栏图标打开库
chrome.action.onClicked.addListener(() => openLibrary());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const payload = {
    type: MSG.CAPTURE_TRIGGER,
    menuId: info.menuItemId,
    srcUrl: info.srcUrl || '',
    linkUrl: info.linkUrl || '',
    selectionText: info.selectionText || '',
    pageUrl: info.pageUrl || tab.url || '',
  };
  sendToTab(tab.id, payload);
});

// 老标签页在装扩展前打开,没注入 content script,直接 sendMessage 会
// "Receiving end does not exist"。仅在这种错误下按需注入再重发一次;
// 其它 lastError(如 message port closed)不重发,避免重复保存。
function sendToTab(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload, () => {
    const err = chrome.runtime.lastError;
    if (!err) return;
    if (!/Receiving end does not exist/i.test(err.message || '')) return;
    chrome.scripting.executeScript(
      { target: { tabId }, files: ['content-script.js'] },
      () => {
        if (chrome.runtime.lastError) return; // chrome:// 等页面无法注入,静默放弃
        chrome.tabs.sendMessage(tabId, payload, () => void chrome.runtime.lastError);
      }
    );
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === MSG.CAPTURE) {
    handleCapture(msg.clip).then(sendResponse);
    return true; // async
  }
  if (msg?.type === MSG.SAVE_EDITS) {
    updateClip(msg.id, msg.patch).then((r) => sendResponse({ ok: !!r })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === 'clipvault:openLibrary') {
    openLibrary();
    sendResponse({ ok: true });
  }
  return false;
});

async function handleCapture(clip) {
  try {
    const project = clip.project || (await lastProject()) || DEFAULT_PROJECT;
    const inferred = inferTags(clip.sourceUrl, clip.pageTitle);
    const tags = [...new Set([...(clip.tags || []), ...inferred])];
    const record = {
      type: clip.type || CLIP_TYPES.TEXT,
      sourceUrl: clip.sourceUrl || '',
      pageTitle: clip.pageTitle || '',
      thumbnail: clip.thumbnail || null,
      content: clip.content || '',
      project,
      tags,
      note: clip.note || '',
    };
    const result = await addClip(record);
    await setLastProject(project);
    const projects = await getProjects();
    return { ok: true, ...result, project, tags, projects };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function openLibrary() {
  const url = chrome.runtime.getURL('library.html');
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find((t) => t.url === url);
    if (existing) chrome.tabs.update(existing.id, { active: true });
    else chrome.tabs.create({ url });
  });
}

function lastProject() {
  return new Promise((res) => {
    chrome.storage.local.get(LAST_PROJECT_KEY, (o) => res(o[LAST_PROJECT_KEY]));
  });
}

function setLastProject(name) {
  return new Promise((res) => {
    chrome.storage.local.set({ [LAST_PROJECT_KEY]: name }, res);
  });
}
