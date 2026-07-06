import { CLIP_TYPES, TEXT_PREVIEW_LEN } from '../core/constants.js';

export function buildCardModel(clip) {
  const isTextual = clip.type === CLIP_TYPES.TEXT || clip.type === CLIP_TYPES.ARTICLE;
  const image = clip.thumbnail || (clip.type === CLIP_TYPES.IMAGE ? clip.content : null);
  // TWEET 无缩略图,拿 URL 当预览,避免卡片空荡荡。
  const previewSource = isTextual || clip.type === CLIP_TYPES.TWEET ? clip.content : '';
  return {
    id: clip.id,
    type: clip.type,
    image: image || null,
    isVideo: clip.type === CLIP_TYPES.VIDEO,
    // 图片剪藏但没抓到全分辨率原图(常见于跨域 CORS)→ 只剩链接/缩略图,
    // 源站图挂了原图就没了。卡片上给个提示。
    linkOnly: clip.type === CLIP_TYPES.IMAGE && !clip.gotImage,
    previewText: (previewSource || '').slice(0, TEXT_PREVIEW_LEN),
    title: clip.pageTitle || '',
    sourceUrl: clip.sourceUrl || '',
    tags: clip.tags || [],
    project: clip.project || '',
  };
}
