/**
 * 나의 수업 공간 — 파일·웹앱 주소 보관함 (구글 시트 + Apps Script)
 *
 * 학생 명단·로그인 없이, 관리자(나) 한 사람이 자료를 올리고
 * 링크를 받은 선생님들은 보기·내려받기만 할 수 있어요.
 *
 * ▶ 설치
 * 1) 새 구글 시트 → 확장 프로그램 → Apps Script
 * 2) Code.gs 에 이 코드를 모두 붙여 넣고 저장
 * 3) 위쪽 함수 선택에서 setup → ▶ 실행 → 권한 허용
 *    → 아래 '실행 로그'에 나오는 6자리 '관리 코드'를 적어 두세요.
 * 4) 배포 → 새 배포 → 유형: 웹 앱 / 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
 *    → …/exec 로 끝나는 주소를 복사해요.
 * 5) 화면 파일(index.html)을 쓰는 방법은 두 가지예요.
 *    (가) 쉬운 방법: Apps Script 에서 ＋ → HTML → 이름을 Index 로 만들고 index.html 내용을 붙여 넣기.
 *        그다음 배포 관리 → 수정 → 새 버전 → 배포. 이제 웹 앱 주소가 곧 사이트 주소예요.
 *    (나) 따로 된 사이트: index.html 의 API_URL 에 웹 앱 주소를 넣고 Netlify 등에 올리기.
 */

const DEFAULTS = {
  title: '나의 수업 공간',
  desc: '자주 쓰는 웹앱과 수업 자료를 한곳에 모아 두었어요.',
  sections: [{ id: 's1', name: '자주 쓰는 웹앱' }, { id: 's2', name: '수업 자료' }, { id: 's3', name: '서식·양식' }]
};
const COLS = ['id', 'section', 'title', 'desc', 'url', 'files', 'imageId', 'color', 'pinned', 'order', 'createdAt', 'updatedAt'];
const FILE_MAX_MB = 20, FILE_MAX_COUNT = 5;
// 실행 파일은 올릴 수 없어요. (HTML 웹앱 파일은 올릴 수 있어요)
const BLOCKED_EXT = /^(exe|msi|bat|cmd|com|scr|vbs|vbe|js|jse|wsf|ps1|sh|jar|apk|dll|lnk|reg|hta|svg)$/;
const PLACEHOLDER = '여기에_웹앱_주소를_붙여_넣으세요';

/* ---------- 처음 한 번 실행 ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Items') || ss.insertSheet('Items');
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const p = props_();
  if (!p.getProperty('FOLDER_ID')) p.setProperty('FOLDER_ID', DriveApp.createFolder('나의 수업 공간 파일').getId());
  if (!p.getProperty('ADMIN_CODE')) p.setProperty('ADMIN_CODE', String(Math.floor(100000 + Math.random() * 900000)));
  if (!p.getProperty('BOARD')) p.setProperty('BOARD', JSON.stringify(DEFAULTS));
  bump_();
  Logger.log('설정 완료! 관리 코드: ' + p.getProperty('ADMIN_CODE') + '  ← 이 번호로 관리자 모드에 들어가요.');
}

/* 관리 코드를 잊었을 때: Apps Script 에서 이 함수를 실행하면 실행 로그에 보여요. */
function showAdminCode() { Logger.log('관리 코드: ' + props_().getProperty('ADMIN_CODE')); }

/* ---------- 웹 앱 ---------- */
function doGet() {
  let html;
  try { html = HtmlService.createHtmlOutputFromFile('Index').getContent(); }
  catch (e) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">연결은 잘 됐어요. 화면 파일(Index.html)은 아직 없어요.<br>index.html 의 API_URL 에 이 웹 앱 주소를 넣어 따로 된 사이트로 쓰거나, Index.html 을 추가해 주세요.</p>');
  }
  html = html.replace(PLACEHOLDER, ScriptApp.getService().getUrl());
  return HtmlService.createHtmlOutput(html)
    .setTitle(board_().title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const API = {
    getState: getState, checkAdmin: checkAdmin, saveItem: saveItem, deleteItem: deleteItem,
    moveItem: moveItem, togglePin: togglePin, saveBoard: saveBoard, uploadFile: uploadFile,
    changeAdminCode: changeAdminCode, setViewCode: setViewCode
  };
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const name = String(req.fn || '');
    if (!Object.prototype.hasOwnProperty.call(API, name)) throw new Error('없는 기능이에요.');
    const data = API[name].apply(null, Array.isArray(req.args) ? req.args : []);
    out = { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 권한 ---------- */
function props_() { return PropertiesService.getScriptProperties(); }
function isAdmin_(ctx) {
  const code = props_().getProperty('ADMIN_CODE');
  const given = String((ctx && ctx.adminCode) || '').trim();
  if (!code || !given) return false;
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('adminFail') || 0);
  if (fails >= 20) throw new Error('관리 코드를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요.');
  if (given === code) return true;
  cache.put('adminFail', String(fails + 1), 600);
  return false;
}
function admin_(ctx) { if (!isAdmin_(ctx)) throw new Error('ADMIN_REQUIRED'); }
function checkAdmin(ctx) { return isAdmin_(ctx); }

/* ---------- 시트 도우미 ---------- */
function sheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Items');
  if (!sh) throw new Error('Apps Script 에서 setup 을 먼저 실행해 주세요.');
  return sh;
}
function rows_() {
  const v = sheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    const o = {};
    COLS.forEach((c, j) => o[c] = v[i][j]);
    out.push(o);
  }
  return out;
}
function findRow_(id) {
  const f = sheet_().getRange('A:A').createTextFinder(String(id)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}
function readRow_(row) {
  const v = sheet_().getRange(row, 1, 1, COLS.length).getValues()[0];
  const o = {};
  COLS.forEach((c, j) => o[c] = v[j]);
  return o;
}
function writeRow_(row, o) { sheet_().getRange(row, 1, 1, COLS.length).setValues([COLS.map(c => o[c] == null ? '' : o[c])]); }
function safe_(v, max) {
  let s = String(v == null ? '' : v).slice(0, max || 3000);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // 수식으로 해석되지 않게
  return s;
}
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function bump_() { const p = props_(); const v = Number(p.getProperty('VERSION') || 0) + 1; p.setProperty('VERSION', String(v)); return v; }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { const r = fn(); bump_(); return r; } finally { lock.releaseLock(); }
}
function board_() {
  try { const b = JSON.parse(props_().getProperty('BOARD') || ''); if (b && Array.isArray(b.sections) && b.sections.length) return b; } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}
function parseFiles_(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

/* ---------- 읽기 ---------- */
function getState(ctx, clientVersion) {
  const admin = isAdmin_(ctx);
  const viewCode = props_().getProperty('VIEW_CODE') || '';
  if (!admin && viewCode && String((ctx && ctx.viewCode) || '').trim() !== viewCode) throw new Error('VIEW_CODE_REQUIRED');
  const v = Number(props_().getProperty('VERSION') || 0);
  if (clientVersion === v) return { version: v, unchanged: true, admin: admin };
  const items = rows_().map(r => ({
    id: String(r.id), section: String(r.section), title: String(r.title), desc: String(r.desc), url: String(r.url || ''),
    files: parseFiles_(r.files).map(f => ({ id: String(f.id), name: String(f.name), size: Number(f.size) || 0 })),
    imageId: String(r.imageId || ''), color: String(r.color || ''), pinned: String(r.pinned) === 'Y',
    order: Number(r.order) || 0, createdAt: Number(r.createdAt) || 0, updatedAt: Number(r.updatedAt) || 0
  }));
  const out = { version: v, admin: admin, board: board_(), items: items };
  if (admin) out.viewCode = viewCode;
  return out;
}

/* ---------- 쓰기 (관리자만) ---------- */
function cleanLink_(v) {
  let u = String(v == null ? '' : v).trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (u.length > 1000 || !/^https?:\/\/[^\s"'<>]+\.[^\s"'<>]+$/i.test(u)) throw new Error('웹 주소가 올바르지 않아요. 예: https://www.naver.com');
  return u;
}
function inFolder_(file) {
  const id = props_().getProperty('FOLDER_ID');
  const it = file.getParents();
  while (it.hasNext()) if (it.next().getId() === id) return true;
  return false;
}
function driveFile_(id) {
  let f;
  try { f = DriveApp.getFileById(String(id)); } catch (e) { return null; }
  return (inFolder_(f) && !f.isTrashed()) ? f : null;
}
function cleanFiles_(list) {
  if (!Array.isArray(list)) return [];
  if (list.length > FILE_MAX_COUNT) throw new Error('파일은 한 항목에 ' + FILE_MAX_COUNT + '개까지 붙일 수 있어요.');
  const seen = {};
  return list.map(f => String((f && f.id) || '')).filter(id => id && !seen[id] && (seen[id] = true)).map(id => {
    const f = driveFile_(id);
    if (!f) throw new Error('첨부파일을 찾을 수 없어요. 다시 올려 주세요.');
    return { id: id, name: f.getName(), size: f.getSize() };
  });
}
function cleanImage_(id) {
  id = String(id || '');
  if (!id) return '';
  const f = driveFile_(id);
  if (!f || !/^image\//.test(f.getMimeType())) throw new Error('대표 사진을 찾을 수 없어요. 다시 올려 주세요.');
  return id;
}
function trash_(id) { const f = driveFile_(id); if (f) try { f.setTrashed(true); } catch (e) {} }

function saveItem(ctx, d) {
  admin_(ctx);
  d = d || {};
  const b = board_();
  const sec = b.sections.some(s => s.id === d.section) ? String(d.section) : b.sections[0].id;
  const url = cleanLink_(d.url);
  const files = cleanFiles_(d.files);
  const imageId = cleanImage_(d.imageId);
  const title = String(d.title || '').trim(), desc = String(d.desc || '').trim();
  if (!title && !url && !files.length && !imageId && !desc) throw new Error('제목, 웹 주소, 파일 중 하나는 있어야 해요.');
  withLock_(() => {
    const now = Date.now();
    const row = d.id ? findRow_(d.id) : 0;
    if (d.id && !row) throw new Error('항목을 찾을 수 없어요. 새로고침해 주세요.');
    const old = row ? readRow_(row) : null;
    const rec = {
      id: old ? String(old.id) : newId_(), section: sec, title: safe_(title, 120), desc: safe_(desc, 3000), url: url,
      files: JSON.stringify(files), imageId: imageId, color: safe_(d.color, 20), pinned: d.pinned ? 'Y' : '',
      order: old && String(old.section) === sec ? Number(old.order) || now : now,
      createdAt: old ? Number(old.createdAt) || now : now, updatedAt: now
    };
    if (row) {
      writeRow_(row, rec);
      const keep = {}; files.forEach(f => keep[f.id] = true);
      parseFiles_(old.files).forEach(f => { if (!keep[f.id]) trash_(f.id); });
      if (old.imageId && String(old.imageId) !== imageId) trash_(String(old.imageId));
    } else {
      sheet_().appendRow(COLS.map(c => rec[c]));
    }
  });
  return getState(ctx, -1);
}
function deleteItem(ctx, id) {
  admin_(ctx);
  withLock_(() => {
    const row = findRow_(id);
    if (!row) return;
    const old = readRow_(row);
    sheet_().deleteRow(row);
    parseFiles_(old.files).forEach(f => trash_(f.id));
    if (old.imageId) trash_(String(old.imageId));
  });
  return getState(ctx, -1);
}
function moveItem(ctx, id, section) {
  admin_(ctx);
  if (!board_().sections.some(s => s.id === section)) throw new Error('칼럼을 찾을 수 없어요.');
  withLock_(() => {
    const row = findRow_(id);
    if (!row) throw new Error('항목을 찾을 수 없어요.');
    const o = readRow_(row);
    o.section = section; o.order = Date.now();
    writeRow_(row, o);
  });
  return getState(ctx, -1);
}
function togglePin(ctx, id) {
  admin_(ctx);
  withLock_(() => {
    const row = findRow_(id);
    if (!row) throw new Error('항목을 찾을 수 없어요.');
    const o = readRow_(row);
    o.pinned = String(o.pinned) === 'Y' ? '' : 'Y';
    writeRow_(row, o);
  });
  return getState(ctx, -1);
}
function saveBoard(ctx, b) {
  admin_(ctx);
  b = b || {};
  const cur = board_();
  const secs = (Array.isArray(b.sections) ? b.sections : cur.sections).slice(0, 12)
    .map(s => ({ id: String((s && s.id) || ('s' + newId_().slice(0, 8))).slice(0, 40), name: String((s && s.name) || '').trim().slice(0, 40) }))
    .filter(s => s.name);
  if (!secs.length) throw new Error('칼럼이 하나 이상 있어야 해요.');
  const next = {
    title: String(b.title != null ? b.title : cur.title).trim().slice(0, 60) || DEFAULTS.title,
    desc: String(b.desc != null ? b.desc : cur.desc).trim().slice(0, 300),
    sections: secs
  };
  withLock_(() => props_().setProperty('BOARD', JSON.stringify(next)));
  return getState(ctx, -1);
}

/* 파일 올리기: 링크가 있는 사람은 볼 수 있게 공유돼요 (선생님들이 내려받을 수 있도록). */
function uploadFile(ctx, name, base64, mime) {
  admin_(ctx);
  let nm = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(-120) || '파일';
  const m = /\.([A-Za-z0-9]+)$/.exec(nm), ext = m ? m[1].toLowerCase() : '';
  if (!ext) throw new Error('확장자가 없는 파일은 올릴 수 없어요: ' + nm);
  if (BLOCKED_EXT.test(ext)) throw new Error('이 형식은 올릴 수 없어요: .' + ext);
  const bytes = Utilities.base64Decode(String(base64 || ''));
  if (!bytes.length) throw new Error('빈 파일이에요.');
  if (bytes.length > FILE_MAX_MB * 1024 * 1024) throw new Error('파일은 ' + FILE_MAX_MB + 'MB까지 올릴 수 있어요.');
  const type = /^[\w.+-]+\/[\w.+-]+$/.test(String(mime || '')) ? String(mime) : 'application/octet-stream';
  const file = DriveApp.getFolderById(props_().getProperty('FOLDER_ID')).createFile(Utilities.newBlob(bytes, type, nm));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {} }
  return { id: file.getId(), name: file.getName(), size: bytes.length };
}

function changeAdminCode(ctx, code) {
  admin_(ctx);
  code = String(code || '').trim();
  if (!/^\S{4,20}$/.test(code)) throw new Error('관리 코드는 띄어쓰기 없이 4~20자로 정해 주세요.');
  props_().setProperty('ADMIN_CODE', code);
  return { ok: true };
}
/* 보기 코드: 비워 두면 링크가 있는 누구나 볼 수 있어요. */
function setViewCode(ctx, code) {
  admin_(ctx);
  code = String(code || '').trim();
  if (code && !/^\S{4,20}$/.test(code)) throw new Error('보기 코드는 띄어쓰기 없이 4~20자로 정해 주세요. (비워 두면 누구나 볼 수 있어요)');
  if (code) props_().setProperty('VIEW_CODE', code); else props_().deleteProperty('VIEW_CODE');
  bump_();
  return { ok: true };
}