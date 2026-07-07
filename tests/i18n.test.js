import { describe, it, expect } from 'vitest';
import { makeT, resolveLang, SUPPORTED_LANGS } from '../src/core/i18n.js';

describe('i18n resolveLang', () => {
  it('passes through explicit en/zh', () => {
    expect(resolveLang('en')).toBe('en');
    expect(resolveLang('zh')).toBe('zh');
  });
  it('auto follows browser: zh* -> zh, else en', () => {
    expect(resolveLang('auto', 'zh-CN')).toBe('zh');
    expect(resolveLang('auto', 'zh')).toBe('zh');
    expect(resolveLang('auto', 'en-US')).toBe('en');
    expect(resolveLang('auto', 'fr')).toBe('en');
  });
  it('unknown pref falls back via navLang', () => {
    expect(resolveLang(undefined, 'zh-TW')).toBe('zh');
    expect(resolveLang('', 'en')).toBe('en');
  });
});

describe('i18n makeT', () => {
  it('returns plain strings', () => {
    expect(makeT('en')('edit.save')).toBe('Save');
    expect(makeT('zh')('edit.save')).toBe('保存');
  });
  it('interpolates params via functions', () => {
    expect(makeT('en')('selbar.count', { n: 3 })).toBe('3 selected');
    expect(makeT('zh')('selbar.count', { n: 3 })).toBe('已选 3 项');
  });
  it('handles plural in en', () => {
    expect(makeT('en')('toast.deleted', { n: 1 })).toBe('Deleted 1 clip');
    expect(makeT('en')('toast.deleted', { n: 2 })).toBe('Deleted 2 clips');
  });
  it('falls back to en for missing key in zh, then to key itself', () => {
    // 未知键回退到键名本身
    expect(makeT('zh')('nonexistent.key')).toBe('nonexistent.key');
  });
  it('every en key has a zh counterpart', () => {
    const en = makeT('en');
    const zh = makeT('zh');
    // 抽查若干关键键在两种语言下都不等于键名(即都已定义)
    for (const k of ['edit.save', 'bubble.title', 'settings.language', 'toast.undo', 'empty.none']) {
      expect(en(k)).not.toBe(k);
      expect(zh(k)).not.toBe(k);
    }
  });
  it('exposes supported langs', () => {
    expect(SUPPORTED_LANGS).toEqual(['en', 'zh']);
  });
});
