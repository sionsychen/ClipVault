import { CLIP_TYPES, TEXT_PREVIEW_LEN } from '../core/constants.js';

export function buildCardModel(clip) {
  const isTextual = clip.type === CLIP_TYPES.TEXT || clip.type === CLIP_TYPES.ARTICLE;
  const image = clip.thumbnail || (clip.type === CLIP_TYPES.IMAGE ? clip.content : null);
  return {
    id: clip.id,
    type: clip.type,
    image: image || null,
    previewText: isTextual ? (clip.content || '').slice(0, TEXT_PREVIEW_LEN) : '',
    title: clip.pageTitle || '',
    sourceUrl: clip.sourceUrl || '',
    tags: clip.tags || [],
    project: clip.project || '',
  };
}
