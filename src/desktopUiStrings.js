import locales from '../locales/desktop-ui.json'

/**
 * Desktop shell strings (native menu, welcome strip, modals). See `locales/desktop-ui.json`.
 */
export function normalizeUiLang(langCode) {
  if (!langCode || typeof langCode !== 'string') return 'en'
  const c = langCode.trim()
  if (c === 'zh-CN' || c === 'zh-Hans') return 'zh-CN'
  if (c === 'zh-TW' || c === 'zh-HK') return 'zh-TW'
  if (Object.prototype.hasOwnProperty.call(locales, c)) return c
  return 'en'
}

export function getUiStrings(langCode) {
  const key = normalizeUiLang(langCode)
  const base = locales.en
  if (key === 'en') return { ...base }
  const overrides = locales[key] || {}
  return { ...base, ...overrides }
}
