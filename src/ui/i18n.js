// Strings + number formatting (CLAUDE.md rule 6). All UI text comes from data/strings.json.
//
//   t('loading.start')              -> text in the current language
//   t('some.key', { name: 'X' })    -> fills {name}
//   formatNumber(1500)              -> "১,৫০০" in Bangla, "1,500" in English
//   formatMoney(500)                -> "৳৫০০"
//   bn(30)                          -> always Bangla digits (Class Mode must use this)

import { events } from '../core/events.js';
import { fontStack } from './fonts.js';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

let strings = {};
let lang = 'bn';
let currency = '৳';
let digitMode = 'language';

/** Convert any digits in a value to Bangla digits. */
export function bn(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
}

export function initI18n({ stringsCfg, uiCfg, economyCfg, savedLanguage }) {
  strings = stringsCfg.strings || {};
  currency = economyCfg.currencySymbol || '৳';
  digitMode = uiCfg.hud?.digits || 'language';
  setLanguage(savedLanguage || uiCfg.defaultLanguage || 'bn', true);
}

export function setLanguage(next, silent = false) {
  lang = next === 'en' ? 'en' : 'bn';
  document.documentElement.lang = lang;
  document.documentElement.style.setProperty('--font-ui', fontStack(lang));
  applyStrings(document);
  if (!silent) events.emit('language:changed', { language: lang });
}

export const getLanguage = () => lang;

export function t(key, vars) {
  return tl(lang, key, vars);
}

/** Text in a FIXED language (Class Mode is always Bangla, whatever the game language is). */
export function tl(language, key, vars) {
  const entry = strings[key];
  let text = entry ? entry[language] ?? entry.en ?? key : key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  return text;
}

/** Pick the right language from a { en, bn } object (used for names in data files). */
export function pickName(obj) {
  if (!obj) return '';
  return typeof obj === 'string' ? obj : obj[lang] ?? obj.en ?? '';
}

export function formatNumber(n) {
  const text = Math.round(n).toLocaleString('en-US');
  return digitMode === 'language' && lang === 'bn' ? bn(text) : text;
}

export const formatMoney = (n) => currency + formatNumber(n);

/** Fill every element that has data-i18n="key" (static HTML in index.html). */
export function applyStrings(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

/** Number in a fixed language: Bangla digits for 'bn' (Class Mode rule), western for 'en'. */
export function numIn(language, n) {
  const text = Math.round(n).toLocaleString('en-US');
  return language === 'en' ? text : bn(text);
}

export const moneyIn = (language, n) => currency + numIn(language, n);
