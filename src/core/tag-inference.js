const DOMAIN_TAGS = {
  'artstation.com': ['reference'],
  'pinterest.com': ['reference'],
  'dribbble.com': ['design'],
  'behance.net': ['design'],
  'youtube.com': ['video'],
  'store.steampowered.com': ['competitor'],
  'x.com': ['tweet'],
  'twitter.com': ['tweet'],
};

const TITLE_KEYWORD_TAGS = [
  { kw: 'ui', tag: 'UI' },
  { kw: 'shader', tag: 'shader' },
  { kw: 'level', tag: 'level' },
  { kw: 'concept', tag: 'concept' },
];

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function inferTags(sourceUrl, title) {
  const tags = new Set();
  const domain = domainOf(sourceUrl);
  for (const key of Object.keys(DOMAIN_TAGS)) {
    if (domain === key || domain.endsWith('.' + key)) {
      DOMAIN_TAGS[key].forEach((t) => tags.add(t));
    }
  }
  const lowerTitle = (title || '').toLowerCase();
  for (const { kw, tag } of TITLE_KEYWORD_TAGS) {
    if (lowerTitle.includes(kw)) tags.add(tag);
  }
  return [...tags];
}
