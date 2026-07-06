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
  PREPARE: 'clipvault:prepare',                // content -> background(只读:算标签/项目,不入库)
  CAPTURE: 'clipvault:capture',                // content(气泡 Save) -> background(真正入库)
};

export const LAST_PROJECT_KEY = 'clipvault:lastProject';
export const LAST_BACKUP_KEY = 'clipvault:lastBackup';   // 上次导出备份的时间戳(ms)
export const BACKUP_SNOOZE_KEY = 'clipvault:backupSnooze'; // 备份提醒暂缓到期时间戳(ms)
export const DEFAULT_PROJECT = 'Unsorted';
export const TEXT_PREVIEW_LEN = 140; // 库页面文本卡预览截断长度
export const THUMB_MAX_DIM = 320;    // 缩略图最长边

// 数据安全阈值(阶段 2)
export const STORAGE_WARN_RATIO = 0.8;          // 用量超配额此比例 → 顶栏预警
export const BACKUP_STALE_MS = 14 * 24 * 60 * 60 * 1000; // 距上次备份超此时长 → 提醒
export const BACKUP_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;  // 点「稍后」后暂缓时长
