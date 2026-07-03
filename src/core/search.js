// 纯过滤,保持入参顺序;排序交给调用方。
export function filterClips(clips, { project, tags = [], query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return clips.filter((c) => {
    if (project && c.project !== project) return false;
    if (tags.length && !tags.every((t) => (c.tags || []).includes(t))) return false;
    if (q) {
      const hay = [c.pageTitle, c.note, (c.tags || []).join(' '), c.content]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
