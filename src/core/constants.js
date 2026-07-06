export const DB_NAME = 'clipvault';
export const DB_VERSION = 2;

export const STORE_CLIPS = 'clips';
export const STORE_PROJECTS = 'projects';
export const STORE_TAGS = 'tags';
export const STORE_IMAGES = 'images'; // 原图字节,按 clipId 键;列表只读缩略图,灯箱才按需取

export const CLIP_TYPES = {
  IMAGE: 'image',
  TEXT: 'text',
  ARTICLE: 'article',
  VIDEO: 'video',
  TWEET: 'tweet',
};

// content <-> background 消息类型
export const MSG = {
  CAPTURE_TRIGGER: 'clipvault:captureTrigger', // background -> content(右键菜单点击)
  CAPTURE: 'clipvault:capture',                // content -> background(提交剪藏)
  SAVE_EDITS: 'clipvault:saveEdits',           // content(气泡) -> background(保存编辑)
};

export const LAST_PROJECT_KEY = 'clipvault:lastProject';
export const DEFAULT_PROJECT = 'Unsorted';
export const TEXT_PREVIEW_LEN = 140; // 库页面文本卡预览截断长度
export const THUMB_MAX_DIM = 320;    // 缩略图最长边
