// Sign-up / sign-in screen (Session 9). Shown by main.js on top of the loading screen BEFORE
// the save is loaded, because every player has their own save. Look: src/ui/account.css.
//
//   const result = await showSignIn({ account, accountsCfg })   // { save: '<json>' | '', adoptOldSave }
//
// Sign up: name, Bangladeshi phone number, class, 4-digit PIN twice.
// Sign in: phone + PIN. Players already known on this phone are listed as quick buttons.
// Text: data/strings.json → account.*  (the current game language; বাংলা by default).

import { t, getLanguage, setLanguage } from './i18n.js';
import { esc } from './overlay.js';

function classOptions(cfg) {
  const L = getLanguage();
  return (cfg.classes || []).map((c) => `<option value="${esc(c.id)}">${esc(c[L] || c.en)}</option>`).join('');
}

function html(mode, cfg, account) {
  const known = account.known.filter((k) => k.phone !== cfg.testAccount?.phone);
  const field = (name, key, attrs = '') => `<label><span>${esc(t(key))}</span><input name="${name}" ${attrs}></label>`;
  const pinAttrs = 'type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"';
  return `
    <div class="acc-card">
      <div class="acc-brand"><b>${esc(t('game.title'))}</b><small>${esc(t('account.tagline'))}</small></div>
      <div class="acc-tabs">
        <button type="button" data-mode="signup" class="${mode === 'signup' ? 'on' : ''}">${esc(t('account.signUp'))}</button>
        <button type="button" data-mode="signin" class="${mode === 'signin' ? 'on' : ''}">${esc(t('account.signIn'))}</button>
      </div>
      <form class="acc-form" novalidate>
        ${mode === 'signup' ? field('name', 'account.name', 'autocomplete="name" maxlength="40"') : ''}
        ${field('phone', 'account.phone', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX" maxlength="16"')}
        ${mode === 'signup' ? `<label><span>${esc(t('account.class'))}</span><select name="classLevel"><option value="">${esc(t('account.pickClass'))}</option>${classOptions(cfg)}</select></label>` : ''}
        ${field('pin', mode === 'signup' ? 'account.newPin' : 'account.pin', pinAttrs)}
        ${mode === 'signup' ? field('pin2', 'account.pinAgain', pinAttrs) : ''}
        <p class="acc-error" hidden></p>
        <button type="submit" class="acc-go">${esc(t(mode === 'signup' ? 'account.create' : 'account.enter'))}</button>
      </form>
      ${mode === 'signin' && known.length ? `<div class="acc-known"><small>${esc(t('account.onThisPhone'))}</small>${known.map((k) => `<button type="button" data-phone="${esc(k.phone)}">${esc(k.name)} · ${esc(k.phone.slice(0, 3))}•••••${esc(k.phone.slice(-3))}</button>`).join('')}</div>` : ''}
      <p class="acc-note">${esc(t(account.online ? 'account.noteOnline' : 'account.noteLocal'))}</p>
      <button type="button" class="acc-lang" data-lang>${esc(t('account.otherLanguage'))}</button>
    </div>`;
}

export function showSignIn({ account, accountsCfg }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'account-screen';
    document.body.appendChild(root);
    let mode = account.known.length ? 'signin' : 'signup';
    let busy = false;

    const render = () => {
      root.innerHTML = html(mode, accountsCfg, account);
      root.querySelector('input')?.focus({ preventScroll: true });
    };
    const showError = (code) => {
      const el = root.querySelector('.acc-error');
      el.textContent = t(`account.error.${code}`);
      el.hidden = false;
    };

    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-mode]');
      const quick = e.target.closest('[data-phone]');
      if (tab && !busy) { mode = tab.dataset.mode; render(); }
      else if (quick) { root.querySelector('[name=phone]').value = quick.dataset.phone; root.querySelector('[name=pin]').focus(); }
      else if (e.target.closest('[data-lang]')) {
        setLanguage(getLanguage() === 'bn' ? 'en' : 'bn', true);
        account.language = getLanguage();
        render();
      }
    });

    root.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const f = Object.fromEntries(new FormData(e.target).entries());
      busy = true;
      const go = root.querySelector('.acc-go');
      go.disabled = true;
      go.textContent = t('account.wait');
      const r = mode === 'signup' ? await account.signUp(f) : await account.signIn(f);
      busy = false;
      if (!r.ok) {
        go.disabled = false;
        go.textContent = t(mode === 'signup' ? 'account.create' : 'account.enter');
        showError(r.error);
        if (r.error === 'exists' && mode === 'signup') { mode = 'signin'; const phone = f.phone; render(); root.querySelector('[name=phone]').value = phone; showError('exists'); }
        return;
      }
      root.classList.add('fade-out');
      setTimeout(() => root.remove(), 400);
      resolve({ save: r.save || '', adoptOldSave: !!r.adoptOldSave });
    });

    render();
  });
}
