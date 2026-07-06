import { MSG, CLIP_TYPES, DEFAULT_PROJECT, LAST_PROJECT_KEY } from '../core/constants.js';
import { addClip, getProjects, saveFullImage } from '../db/clip-store.js';
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

// 键盘快捷键。注意:快捷键手势授予 activeTab(可注入),但不带光标下的图片/
// 选区信息,所以只能剪「选区或整页」——由 content script 自己读 selection。
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-library') return void openLibrary();
  if (command !== 'clip-selection') return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    sendToTab(tab.id, {
      type: MSG.CAPTURE_TRIGGER,
      menuId: 'clipvault-shortcut',
      pageUrl: tab.url || '',
    });
  });
});

// content script 不再常驻(activeTab 模型):每次右键点击都按需注入。
// 右键点击授予 activeTab,故 executeScript 被许可。content-script 顶部的
// __clipvaultInjected 守卫保证重复注入不会二次注册监听器 → 不会重复保存。
// 注入回调里才发消息,确保监听器已注册。
function sendToTab(tabId, payload) {
  chrome.scripting.executeScript(
    { target: { tabId }, files: ['content-script.js'] },
    () => {
      if (chrome.runtime.lastError) return; // chrome:// 等受限页面无法注入,静默放弃
      chrome.tabs.sendMessage(tabId, payload, () => void chrome.runtime.lastError);
    }
  );
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === MSG.PREPARE) {
    handlePrepare(msg.clip).then(sendResponse);
    return true; // async
  }
  if (msg?.type === MSG.CAPTURE) {
    handleCapture(msg.clip).then(sendResponse);
    return true; // async
  }
  if (msg?.type === 'clipvault:openLibrary') {
    openLibrary();
    sendResponse({ ok: true });
  }
  return false;
});

// 只读:算出默认项目、推断标签、项目列表,喂给气泡预填。不碰库。
async function handlePrepare(clip) {
  try {
    const project = clip.project || (await lastProject()) || DEFAULT_PROJECT;
    const inferred = inferTags(clip.sourceUrl, clip.pageTitle);
    const tags = [...new Set([...(clip.tags || []), ...inferred])];
    const projects = await getProjects();
    return { ok: true, project, tags, projects };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

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
    // 图片剪藏:后台尝试抓原图字节存库,不阻塞气泡返回。
    // activeTab 模型下没有广域 host 权限,跨域图片可能被 CORS 拦(抓不到就
    // 静默放弃,灯箱回退到 content URL)。Phase 2 会在卡片上标「仅链接」。
    if (result.status === 'added' && record.type === CLIP_TYPES.IMAGE && record.content) {
      fetchAndStoreImage(result.id, record.content);
    }
    return { ok: true, ...result, project, tags, projects };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function fetchAndStoreImage(clipId, url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return;
    const blob = await resp.blob();
    if (blob.type.startsWith('image/')) await saveFullImage(clipId, blob);
  } catch {
    // 抓取失败(防盗链/网络等)静默放弃,灯箱会回退到原 URL。
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
