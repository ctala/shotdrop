// Tiny i18n layer over chrome.i18n: {name} placeholders and data-i18n attributes in the HTML.
import { translate } from './common.js';

// Bundled English, used only if the browser's message catalog is not loaded (see translate()).
const FALLBACK = await fetch(chrome.runtime.getURL('_locales/en/messages.json'))
  .then((r) => r.json())
  .catch(() => ({}));

export const t = (key, vars = {}) => translate(key, vars, (k) => chrome.i18n.getMessage(k), FALLBACK);

export function applyI18n(root = document) {
  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0];
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
}
