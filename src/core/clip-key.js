// 紧凑哈希,把任意长度 content 压成短字符串,避免用整段正文当索引键。
export function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function makeClipKey(sourceUrl, content) {
  return `${sourceUrl || ''}#${djb2(content || '')}`;
}
