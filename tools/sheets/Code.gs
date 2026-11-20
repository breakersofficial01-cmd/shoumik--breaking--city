/**
 * Breaking City — Google Sheet web app (Session 9).
 * Paste this whole file into the sheet: Extensions → Apps Script → Code.gs, then
 * Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). Copy the
 * web-app URL into data/sheet.json → apiUrl. Steps with pictures: tools/sheets/README.md.
 *
 * What it does:
 *   GET  ?action=content            → { ok, products, classes, questions }  (never the Players tab)
 *   POST {action:'signup', phone, name, classLevel, pin, save}  → { ok, token, profile }
 *   POST {action:'signin', phone, pin}                          → { ok, token, profile, save }
 *   POST {action:'save',   phone, token, save, summary}         → { ok }
 * Errors come back as { ok:false, error:'<code>' } (exists, notFound, badPin, locked, badToken,
 * badPhone, badName, badClass, badPinFormat, tooBig, busy).
 *
 * Security: the PIN is never stored. pin_hash = SHA-256(pepper + salt + phone + pin), where the
 * pepper is a secret kept in Script Properties (made automatically the first time) and the salt
 * is random per player. After 5 wrong PINs the account waits 15 minutes. Sign-in gives a random
 * token (only its hash is stored); saves need that token. Keep the sheet itself private.
 */

var TABS = { products: 'Products', classes: 'Classes', questions: 'Questions', players: 'Players' };
var PLAYER_COLS = ['phone', 'name', 'class_level', 'cash', 'health', 'vehicles', 'weapons', 'homes',
  'lessons_done', 'created_at', 'last_seen', 'pin_salt', 'pin_hash', 'token_hash', 'failed_logins', 'save_json'];
var MAX_FAILS = 5;
var LOCK_MINUTES = 15;
var MAX_SAVE_CHARS = 45000; // one sheet cell holds 50,000

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function tabRows_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase().replace(/\s+/g, '_'); });
  return values.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (h, i) { if (h) o[h] = row[i]; });
    return o;
  });
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'content';
  if (action !== 'content') return json_({ ok: false, error: 'unknownAction' });
  return json_({ ok: true, products: tabRows_(TABS.products), classes: tabRows_(TABS.classes), questions: tabRows_(TABS.questions), at: Date.now() });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'badRequest' }); }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, error: 'busy' });
  try {
    if (req.action === 'signup') return json_(signup_(req));
    if (req.action === 'signin') return json_(signin_(req));
    if (req.action === 'save') return json_(save_(req));
    return json_({ ok: false, error: 'unknownAction' });
  } catch (err) {
    return json_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- helpers

function pepper_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('PEPPER');
  if (!p) { p = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PEPPER', p); }
  return p;
}

function hash_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

/** 01XXXXXXXXX from +8801…, 8801…, 01… (spaces/dashes ignored). '' when not a Bangladeshi mobile. */
function phone_(raw) {
  var d = String(raw || '').replace(/[\s-]/g, '').replace(/^\+/, '');
  if (/^8801[3-9]\d{8}$/.test(d)) d = d.slice(2);
  return /^01[3-9]\d{8}$/.test(d) ? d : '';
}

/** Text that cannot turn into a formula in the sheet. */
function safe_(text, max) {
  var s = String(text == null ? '' : text).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 60);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function playersSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(TABS.players) || ss.insertSheet(TABS.players);
  if (sh.getLastRow() === 0) sh.appendRow(PLAYER_COLS);
  return sh;
}

function findPlayer_(sh, phone) {
  var last = sh.getLastRow();
  if (last < 2) return null;
  var phones = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < phones.length; i++) {
    if (phone_(phones[i][0]) === phone) {
      var row = i + 2;
      var vals = sh.getRange(row, 1, 1, PLAYER_COLS.length).getValues()[0];
      var o = {};
      PLAYER_COLS.forEach(function (c, k) { o[c] = vals[k]; });
      return { row: row, data: o };
    }
  }
  return null;
}

function setCells_(sh, row, fields) {
  Object.keys(fields).forEach(function (k) {
    var col = PLAYER_COLS.indexOf(k) + 1;
    if (col > 0) sh.getRange(row, col).setValue(fields[k]);
  });
}

function profile_(d) {
  return { phone: phone_(d.phone), name: String(d.name).replace(/^'/, ''), classLevel: String(d.class_level).replace(/^'/, ''), createdAt: d.created_at };
}

function summaryFields_(summary, save) {
  var s = summary || {};
  return {
    cash: Number(s.cash) || 0,
    health: Number(s.health) || 0,
    vehicles: safe_((s.vehicles || []).join(', '), 500),
    weapons: safe_((s.weapons || []).join(', '), 500),
    homes: safe_((s.homes || []).join(', '), 300),
    lessons_done: Number(s.lessonsDone) || 0,
    last_seen: new Date(),
    save_json: save,
  };
}

// ---------------------------------------------------------------- actions

function signup_(req) {
  var phone = phone_(req.phone);
  if (!phone) return { ok: false, error: 'badPhone' };
  var name = safe_(req.name, 40);
  if (name.replace(/^'/, '').length < 2) return { ok: false, error: 'badName' };
  var cls = safe_(req.classLevel, 40);
  if (!cls) return { ok: false, error: 'badClass' };
  if (!/^\d{4}$/.test(String(req.pin || ''))) return { ok: false, error: 'badPinFormat' };
  var save = typeof req.save === 'string' ? req.save : JSON.stringify(req.save || {});
  if (save.length > MAX_SAVE_CHARS) return { ok: false, error: 'tooBig' };

  var sh = playersSheet_();
  if (findPlayer_(sh, phone)) return { ok: false, error: 'exists' }; // one account per phone number
  var salt = Utilities.getUuid();
  var token = Utilities.getUuid() + Utilities.getUuid();
  var now = new Date();
  var f = summaryFields_(req.summary, save);
  var row = PLAYER_COLS.map(function (c) {
    switch (c) {
      case 'phone': return phone;
      case 'name': return name;
      case 'class_level': return cls;
      case 'created_at': return now;
      case 'pin_salt': return salt;
      case 'pin_hash': return hash_(pepper_() + salt + phone + req.pin);
      case 'token_hash': return hash_(token);
      case 'failed_logins': return '0';
      default: return f[c] != null ? f[c] : '';
    }
  });
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1).setNumberFormat('@'); // keep the leading 0 of the phone number
  sh.getRange(r, 1, 1, row.length).setValues([row]);
  return { ok: true, token: token, profile: { phone: phone, name: name.replace(/^'/, ''), classLevel: cls.replace(/^'/, ''), createdAt: now } };
}

function signin_(req) {
  var phone = phone_(req.phone);
  if (!phone) return { ok: false, error: 'badPhone' };
  var sh = playersSheet_();
  var p = findPlayer_(sh, phone);
  if (!p) return { ok: false, error: 'notFound' };
  var fails = String(p.data.failed_logins || '0').split('|');
  var count = Number(fails[0]) || 0;
  var lastFail = Number(fails[1]) || 0;
  if (count >= MAX_FAILS && Date.now() - lastFail < LOCK_MINUTES * 60000) return { ok: false, error: 'locked' };
  if (hash_(pepper_() + p.data.pin_salt + phone + String(req.pin || '')) !== p.data.pin_hash) {
    setCells_(sh, p.row, { failed_logins: (count >= MAX_FAILS ? 1 : count + 1) + '|' + Date.now() });
    return { ok: false, error: 'badPin' };
  }
  var token = Utilities.getUuid() + Utilities.getUuid();
  setCells_(sh, p.row, { token_hash: hash_(token), failed_logins: '0', last_seen: new Date() });
  return { ok: true, token: token, profile: profile_(p.data), save: String(p.data.save_json || '') };
}

function save_(req) {
  var phone = phone_(req.phone);
  if (!phone) return { ok: false, error: 'badPhone' };
  var sh = playersSheet_();
  var p = findPlayer_(sh, phone);
  if (!p) return { ok: false, error: 'notFound' };
  if (!req.token || hash_(String(req.token)) !== p.data.token_hash) return { ok: false, error: 'badToken' };
  var save = typeof req.save === 'string' ? req.save : JSON.stringify(req.save || {});
  if (save.length > MAX_SAVE_CHARS) return { ok: false, error: 'tooBig' };
  setCells_(sh, p.row, summaryFields_(req.summary, save));
  return { ok: true };
}
