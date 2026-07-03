import { CLIP_TYPES } from './constants.js';

// 从链接识别 YouTube 视频 / X(Twitter) 推文。命中返回富类型信息,
// 未命中返回 null,调用方据此决定是否覆盖默认的 TEXT/ARTICLE 类型。
export function detectMediaType(url) {
  const videoId = youtubeId(url);
  if (videoId) {
    return {
      type: CLIP_TYPES.VIDEO,
      videoId,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
  if (isTweetUrl(url)) {
    return { type: CLIP_TYPES.TWEET, videoId: null, thumbnail: null };
  }
  return null;
}

export function youtubeId(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    return sanitizeId(u.pathname.slice(1).split('/')[0]);
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host.endsWith('.youtube.com')) {
    if (u.pathname === '/watch') return sanitizeId(u.searchParams.get('v') || '');
    const m = u.pathname.match(/^\/(?:shorts|embed|v)\/([^/?#]+)/);
    if (m) return sanitizeId(m[1]);
  }
  return '';
}

export function isTweetUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') return false;
  return /^\/[^/]+\/status\/\d+/.test(u.pathname);
}

// YouTube video id 是 11 位 [A-Za-z0-9_-];宽松校验,挡掉明显非法值。
function sanitizeId(id) {
  return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : '';
}
