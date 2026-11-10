/**
 * 《心靈病房》敘事心得競賽：後端 API（資料存在這份 Google 試算表）
 *
 * 安裝：
 * 1. 開一個新的 Google 試算表 →「擴充功能 → Apps Script」→ 刪掉預設內容，貼上本檔並儲存。
 * 2. 回到試算表重新整理 → 選單「敘事競賽 → 1. 初始化」→ 依提示授權。
 * 3. 在「名單」工作表貼上名單；選單「設定承辦人帳號密碼」。
 * 4. Apps Script 右上「部署 → 新增部署作業 → 網頁應用程式」
 *    執行身分：我；誰可以存取：所有人 → 部署 → 複製網址，填進網站的 config.js。
 */

const CFG = {
  submitOpen:  new Date('2026-11-11T13:30:00+08:00'),
  submitClose: new Date('2026-11-13T12:00:00+08:00'),
  voteOpen:    new Date('2026-11-13T13:00:00+08:00'),
  voteClose:   new Date('2026-11-17T12:00:00+08:00'),
  luckyOpen:   new Date('2026-11-18T13:00:00+08:00'),
  luckyCount: 2, minChars: 200, maxChars: 300, maxPicks: 3,
};
const SH = { roster: '名單', subs: '投稿', log: '投票紀錄', tally: '計票', status: '完成情形', lucky: '抽獎結果' };
const ROLE_STAFF = '正式同仁', ROLE_INTERN = '實習學生';
const THEMES = ['主題一：多停留的那「一會兒」', '主題二：換一雙眼睛看', '主題三：點頭之後'];

/* ======================= 試算表選單（僅承辦人） ======================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('敘事競賽')
    .addItem('1. 初始化（建立工作表）', 'setup')
    .addItem('設定承辦人帳號密碼', 'setAdminLogin')
    .addSeparator()
    .addItem('產出完成情形名單', 'buildStatus')
    .addToUi();
}
function setup() {
  guard_();
  ensureSheet_(SH.roster, ['身分（正式同仁／實習學生）', '人事號', '姓名', '11/11 參加觀影（是／否）', '承辦人（是／否）']);
  ensureSheet_(SH.subs, ['首次成功投稿時間', '最後修改時間', '身分', '登入帳號', '姓名', '主題', '題目', '內文', '字數', '狀態', '作品編號']);
  ensureSheet_(SH.log, ['投票時間', '身分', '登入帳號', '姓名', '結果']);
  ensureSheet_(SH.tally, ['作品編號', '題目', '首次成功投稿時間', '票數']);
  ensureSheet_(SH.status, ['（投票截止時自動產生）']);
  ensureSheet_(SH.lucky, ['抽出時間', '獎項', '身分', '人事號', '姓名']);
  sheet_(SH.roster).getRange('B:B').setNumberFormat('@');
  sheet_(SH.subs).getRange('D:D').setNumberFormat('@');
  sheet_(SH.subs).getRange('K:K').setNumberFormat('@');
  sheet_(SH.tally).getRange('A:A').setNumberFormat('@');
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  if (new Date() < CFG.voteClose) ScriptApp.newTrigger('closeVoting').timeBased().at(CFG.voteClose).create();
  SpreadsheetApp.getUi().alert('初始化完成。\n1. 在「名單」工作表貼上名單。\n2. 選單「設定承辦人帳號密碼」。\n3. 到 Apps Script「部署 → 新增部署作業 → 網頁應用程式」（執行身分：我；存取：所有人），把網址填進網站 config.js。');
}
function setAdminLogin() {
  guard_();
  const ui = SpreadsheetApp.getUi();
  const u = ui.prompt('設定承辦人帳號', '請輸入後台登入帳號：', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK || !u.getResponseText().trim()) return;
  const pw = ui.prompt('設定承辦人密碼', '請輸入密碼（至少 8 碼；輸入時會顯示，請注意旁人）：', ui.ButtonSet.OK_CANCEL);
  if (pw.getSelectedButton() !== ui.Button.OK) return;
  if (pw.getResponseText().length < 8) { ui.alert('密碼至少需要 8 碼。'); return; }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ adminUser: u.getResponseText().trim(), adminSalt: salt, adminHash: hash_(salt + pw.getResponseText()) });
  ui.alert('承辦人帳密設定完成。');
}
function buildStatus() { guard_(); buildStatus_(); SpreadsheetApp.getActive().setActiveSheet(sheet_(SH.status)); }
function closeVoting() { if (new Date() >= CFG.voteClose) buildStatus_(); }

/* ======================= 網站 API ======================= */
function doGet(e) {
  const a = (e && e.parameter && e.parameter.action) || 'data';
  if (a === 'data') return json_(publicData_());
  return json_({ ok: false, msg: '未知的請求' });
}
function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, msg: '資料格式錯誤' }); }
  try {
    switch (b.action) {
      case 'submit': return json_(submit_(b));
      case 'vote': return json_(vote_(b));
      case 'login': return json_(login_(b));
      case 'logout': CacheService.getScriptCache().remove('adm_' + b.token); return json_({ ok: true });
      case 'admin': auth_(b.token); return json_(adminData_());
      case 'publish': auth_(b.token); return json_(publish_(b.keys || []));
      case 'unpublish': auth_(b.token); return json_(unpublish_(b.no));
      case 'draw': auth_(b.token); return json_(drawLucky_(!!b.redo));
      case 'attend': auth_(b.token); return json_(setAttend_(b.keys || []));
      case 'status': auth_(b.token); buildStatus_(); return json_({ ok: true, msg: '已更新「完成情形」工作表。' });
      default: return json_({ ok: false, msg: '未知的請求' });
    }
  } catch (err) { return json_({ ok: false, msg: String(err.message || err), auth: /登入/.test(String(err.message)) }); }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- 公開資料：只有匿名作品與票數 ---------- */
function publicData_() {
  const now = new Date();
  const works = publishedWorks_();
  const tally = tallyMap_();
  const started = now >= CFG.voteOpen;
  const roster = readRoster_();
  const voted = sheet_(SH.log).getDataRange().getValues().slice(1).filter(r => r[4] === '有效').length;
  const ranking = started ? rank_(works, tally).slice(0, 10).map(r => ({ no: r.no, title: r.title, votes: r.votes })) : [];
  return {
    ok: true, now: now.getTime(),
    t: { submitOpen: +CFG.submitOpen, submitClose: +CFG.submitClose, voteOpen: +CFG.voteOpen, voteClose: +CFG.voteClose, luckyOpen: +CFG.luckyOpen },
    works: works.map(w => ({ no: w.no, theme: w.theme, title: w.title, body: w.body, votes: started ? (tally[w.no] || 0) : 0 })),
    ranking: ranking, eligible: roster.filter(p => !p.admin).length, voted: voted,
  };
}

/* ---------- 投稿 ---------- */
function submit_(b) {
  const now = new Date();
  if (now < CFG.submitOpen) return { ok: false, msg: '投稿將於 11/11（三）13:30 開放。' };
  if (now >= CFG.submitClose) return { ok: false, msg: '投稿已於 11/13（五）中午 12:00 截止。' };
  const role = b.role === ROLE_INTERN ? ROLE_INTERN : b.role === ROLE_STAFF ? ROLE_STAFF : '';
  const key = norm_(b.key);
  const theme = THEMES.indexOf(b.theme) >= 0 ? b.theme : '';
  const title = String(b.title || '').trim().slice(0, 40);
  const body = String(b.body || '').trim();
  const n = body.replace(/\s/g, '').length;
  if (!role || !key) return { ok: false, msg: '請選擇身分並輸入' + (role === ROLE_INTERN ? '姓名' : '人事號') + '。' };
  if (!theme || !title) return { ok: false, msg: '請選擇主題並填寫題目。' };
  if (n < CFG.minChars || n > CFG.maxChars) return { ok: false, msg: '內文目前 ' + n + ' 字，請調整為 200–300 字（不含空白）。' };
  if (!b.privacy) return { ok: false, msg: '請勾選隱私確認。' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, msg: '目前投稿人數較多，請稍候再送出。' };
  try {
    const person = findPerson_(role, key);
    if (!person) return { ok: false, msg: '查無資料，請確認' + (role === ROLE_STAFF ? '人事號' : '姓名') + '是否正確。' };
    if (person.admin) return { ok: false, msg: '承辦人不參與投稿。' };
    const sh = sheet_(SH.subs);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][2] === person.role && norm_(rows[i][3]) === person.key) {
        // 公平起見，每人只能投稿一次，送出後不得修改
        return { ok: false, msg: '您已經投稿過了，每人限投稿一篇，送出後不能修改。', done: true };
      }
    }
    sh.appendRow([now, now, person.role, acct_(person), person.name, theme, title, body, n, '有效', '']);
    return { ok: true, msg: '投稿成功，謝謝您的分享！' };
  } finally { lock.releaseLock(); }
}

/* ---------- 投票（一次性） ---------- */
function vote_(b) {
  const now = new Date();
  if (now < CFG.voteOpen) return { ok: false, msg: '投票將於 11/13（五）13:00 開始。' };
  if (now >= CFG.voteClose) return { ok: false, msg: '投票已於 11/17（二）中午 12:00 截止。' };
  const role = b.role === ROLE_INTERN ? ROLE_INTERN : b.role === ROLE_STAFF ? ROLE_STAFF : '';
  const key = norm_(b.key);
  if (!role || !key) return { ok: false, msg: '請選擇身分並輸入人事號或姓名。' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, msg: '目前投票人數較多，請稍候再送出。' };
  try {
    const person = findPerson_(role, key);
    const log = sheet_(SH.log);
    if (!person) { log.appendRow([now, role, String(b.key).slice(0, 30), '', '不在名單（未計）']); return { ok: false, msg: '查無資料，請確認' + (role === ROLE_STAFF ? '人事號' : '姓名') + '是否正確。' }; }
    if (person.admin) return { ok: false, msg: '承辦人因知悉作者身分，不參與投票。' };
    if (log.getDataRange().getValues().slice(1).some(r => r[1] === person.role && norm_(r[2]) === person.key && r[4] === '有效')) {
      log.appendRow([now, person.role, acct_(person), person.name, '重複投票（未計）']);
      return { ok: false, msg: '您已經投過票了，每人僅能投票一次。', voted: true };
    }
    const valid = new Set(publishedWorks_().map(w => w.no));
    let picks = [...new Set([].concat(b.picks || []).map(x => String(x).padStart(2, '0')))].filter(x => valid.has(x));
    if (picks.length < 1 || picks.length > CFG.maxPicks) return { ok: false, msg: '請選擇 1 至 3 篇不同作品。' };
    const t = sheet_(SH.tally);
    const tr = t.getDataRange().getValues();
    for (let i = 1; i < tr.length; i++) if (picks.indexOf(String(tr[i][0]).padStart(2, '0')) >= 0) t.getRange(i + 1, 4).setValue(Number(tr[i][3] || 0) + 1);
    // 只記錄誰投過票，不記錄選了哪些作品
    log.appendRow([now, person.role, acct_(person), person.name, '有效']);
    SpreadsheetApp.flush();
    return { ok: true, msg: '投票成功！感謝您的參與與鼓勵。' };
  } finally { lock.releaseLock(); }
}

/* ---------- 承辦人登入 ---------- */
function login_(b) {
  const props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache();
  const fails = Number(cache.get('loginFails') || 0);
  if (fails >= 5) return { ok: false, msg: '登入失敗次數過多，請 15 分鐘後再試。' };
  if (!props.getProperty('adminHash')) return { ok: false, msg: '尚未設定承辦人帳密，請在試算表選單「設定承辦人帳號密碼」。' };
  const good = String(b.user || '').trim() === props.getProperty('adminUser') && hash_(props.getProperty('adminSalt') + String(b.pass || '')) === props.getProperty('adminHash');
  if (!good) { cache.put('loginFails', String(fails + 1), 900); Utilities.sleep(800); return { ok: false, msg: '帳號或密碼錯誤。' }; }
  cache.remove('loginFails');
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('adm_' + token, '1', 21600);
  return { ok: true, token: token };
}
function auth_(token) { if (!token || !CacheService.getScriptCache().get('adm_' + token)) throw new Error('登入已逾時，請重新登入。'); }
function hash_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(x => ('0' + (x & 0xff).toString(16)).slice(-2)).join(''); }

/* ---------- 後台資料 ---------- */
function adminData_() {
  const roster = readRoster_();
  const subs = sheet_(SH.subs).getDataRange().getValues().slice(1).filter(r => r[2]);
  const logs = sheet_(SH.log).getDataRange().getValues().slice(1).filter(r => r[0]);
  const okSub = new Set(subs.filter(r => r[9] === '有效').map(r => r[2] + '|' + norm_(r[3])));
  const okVoteRows = logs.filter(r => r[4] === '有效');
  const voteAt = {}; okVoteRows.forEach(r => { voteAt[r[1] + '|' + norm_(r[2])] = fmt_(r[0]); });
  const voters = roster.filter(p => !p.admin), attendees = roster.filter(p => p.attended);
  const k = p => p.role + '|' + p.key;
  const works = publishedWorks_(), tally = tallyMap_();
  return {
    ok: true, now: Date.now(), luckyOpen: +CFG.luckyOpen,
    stats: { subValid: okSub.size, attendees: attendees.length, attendNoSub: attendees.filter(p => !okSub.has(k(p))).length, works: works.length, voters: voters.length, voted: voters.filter(p => voteAt[k(p)]).length, rejected: logs.length - okVoteRows.length },
    subs: subs.map(r => ({ key: r[2] + '|' + norm_(r[3]), first: fmt_(r[0]), last: fmt_(r[1]), role: r[2], id: String(r[3]), name: r[4], theme: String(r[5]).slice(0, 3), title: r[6], chars: r[8], status: r[9], no: r[10] ? String(r[10]).padStart(2, '0') : '' })),
    noSub: attendees.filter(p => !okSub.has(k(p))).map(p => ({ role: p.role, id: p.id, name: p.name })),
    voted: voters.filter(p => voteAt[k(p)]).map(p => ({ role: p.role, id: p.id, name: p.name, at: voteAt[k(p)] })),
    notVoted: voters.filter(p => !voteAt[k(p)]).map(p => ({ role: p.role, id: p.id, name: p.name })),
    rejected: logs.filter(r => r[4] !== '有效').map(r => ({ at: fmt_(r[0]), role: r[1], id: String(r[2]), name: r[3], result: r[4] })),
    rank: rank_(works, tally).map((r, i) => ({ rank: i + 1, no: r.no, title: r.title, theme: String(r.theme).slice(0, 3), author: r.name, first: r.firstMs < 9e15 ? fmt_(r.firstMs) : '', votes: r.votes })),
    lucky: luckyResults_(), luckyPool: luckyPool_().map(p => p.name),
    roster: roster.filter(p => !p.admin).map(p => ({ key: k(p), role: p.role, id: p.id, name: p.name, attended: p.attended })),
  };
}

/* ---------- 標記 11/11 參加者 ---------- */
function setAttend_(keys) {
  const want = new Set(keys);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_(SH.roster), rows = sh.getDataRange().getValues();
    if (rows.length < 2) return { ok: false, msg: '名單是空的。' };
    let n = 0;
    const col = rows.slice(1).map(r => {
      const role = String(r[0]).indexOf('實習') >= 0 ? ROLE_INTERN : ROLE_STAFF;
      const key = role + '|' + norm_(role === ROLE_INTERN ? r[2] : r[1]);
      if (String(r[4]).trim() === '是') return [r[3]];
      const on = want.has(key); if (on) n++;
      return [on ? '是' : '否'];
    });
    sh.getRange(2, 4, col.length, 1).setValues(col);
    return { ok: true, msg: '已儲存，共 ' + n + ' 位參加者。' };
  } finally { lock.releaseLock(); }
}

/* ---------- 公開作品（隨機編號） ---------- */
function publish_(keys) {
  const want = new Set(keys);
  const sh = sheet_(SH.subs), rows = sh.getDataRange().getValues();
  let maxNo = 0; const batch = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][10]) maxNo = Math.max(maxNo, Number(rows[i][10]));
    else if (rows[i][9] === '有效' && want.has(rows[i][2] + '|' + norm_(rows[i][3]))) batch.push({ row: i + 1, first: rows[i][0], title: rows[i][6] });
  }
  if (!batch.length) return { ok: false, msg: '沒有可公開的作品（需為有效且尚未公開）。' };
  for (let i = batch.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [batch[i], batch[j]] = [batch[j], batch[i]]; }
  const t = sheet_(SH.tally);
  batch.forEach((b, i) => { const no = String(maxNo + i + 1).padStart(2, '0'); sh.getRange(b.row, 11).setValue(no); t.appendRow([no, b.title, b.first, 0]); });
  return { ok: true, msg: '已公開 ' + batch.length + ' 篇作品。' };
}
function unpublish_(no) {
  no = String(no || '').padStart(2, '0');
  if (new Date() >= CFG.voteOpen) return { ok: false, msg: '投票開始後不能取消公開，以免影響票數。' };
  const sh = sheet_(SH.subs), rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][10]).padStart(2, '0') === no) sh.getRange(i + 1, 11).setValue('');
  const t = sheet_(SH.tally), tr = t.getDataRange().getValues();
  for (let i = tr.length - 1; i >= 1; i--) if (String(tr[i][0]).padStart(2, '0') === no) t.deleteRow(i + 1);
  return { ok: true, msg: '已取消公開 ' + no + ' 號。' };
}

/* ---------- 幸運參與獎 ---------- */
function luckyPool_() {
  const roster = readRoster_(), seen = {}, pool = [];
  sheet_(SH.subs).getDataRange().getValues().slice(1).forEach(r => {
    if (r[9] !== '有效') return;
    const p = roster.find(x => x.role === r[2] && x.key === norm_(r[3]));
    if (!p || p.admin || seen[p.role + p.key]) return;
    seen[p.role + p.key] = 1; pool.push(p);
  });
  return pool;
}
function luckyResults_() { const sh = sheet_(SH.lucky); return sh ? sh.getDataRange().getValues().slice(1).filter(r => r[0]).map(r => ({ at: fmt_(r[0]), place: r[1], role: r[2], id: String(r[3]), name: r[4] })) : []; }
function drawLucky_(redo) {
  const now = new Date();
  if (now < CFG.luckyOpen) return { ok: false, msg: '幸運參與獎將於 11/18（三）13:00 開放抽獎。' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_(SH.lucky) || ensureSheet_(SH.lucky, ['抽出時間', '獎項', '身分', '人事號', '姓名']);
    const existing = luckyResults_();
    if (existing.length && !redo) return { ok: false, msg: '已經抽過了。', winners: existing };
    const pool = luckyPool_();
    if (pool.length < CFG.luckyCount) return { ok: false, msg: '符合資格的投稿者只有 ' + pool.length + ' 位，人數不足。' };
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (existing.length) sh.getRange(2, 1, sh.getMaxRows() - 1, 5).clearContent();
    sh.getRange(2, 1, CFG.luckyCount, 5).setValues(pool.slice(0, CFG.luckyCount).map((p, i) => [now, '幸運參與獎 ' + (i + 1), p.role, p.id, p.name]));
    SpreadsheetApp.flush();
    return { ok: true, winners: luckyResults_() };
  } finally { lock.releaseLock(); }
}

/* ---------- 完成情形工作表 ---------- */
function buildStatus_() {
  const d = adminData_();
  const sh = sheet_(SH.status); sh.clear();
  const out = [['產出時間', Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'), '', ''], ['', '', '', ''],
    ['【投票完成情形】', '應投票 ' + d.stats.voters + ' 人', '已投票 ' + d.stats.voted + ' 人', '未投票 ' + d.notVoted.length + ' 人'], ['狀態', '身分', '人事號', '姓名']];
  d.voted.forEach(p => out.push(['已投票', p.role, p.id, p.name]));
  d.notVoted.forEach(p => out.push(['未投票（列入 Seminar 提問名單）', p.role, p.id, p.name]));
  out.push(['', '', '', ''], ['【投稿完成情形（11/11 參加觀影者）】', '應投稿 ' + d.stats.attendees + ' 人', '未投稿 ' + d.noSub.length + ' 人', ''], ['狀態', '身分', '人事號', '姓名']);
  d.noSub.forEach(p => out.push(['未投稿（列入 Seminar 提問名單）', p.role, p.id, p.name]));
  out.push(['', '', '', ''], ['【排名】', '作品編號／題目', '票數', '作者']);
  d.rank.forEach(r => out.push([(r.rank <= 3 ? '最具共鳴獎　' : '') + '第 ' + r.rank + ' 名', r.no + ' 號｜' + r.title, r.votes, r.author]));
  sh.getRange(1, 1, out.length, 4).setValues(out);
  sh.autoResizeColumns(1, 4);
}

/* ======================= 工具 ======================= */
function guard_() { const a = Session.getActiveUser().getEmail(); if (!a || a !== Session.getEffectiveUser().getEmail()) throw new Error('僅限承辦人在試算表中執行。'); }
function rank_(works, tally) {
  return works.map(w => ({ no: w.no, title: w.title, theme: w.theme, name: w.name, votes: tally[w.no] || 0, firstMs: w.first ? new Date(w.first).getTime() : 9e15 }))
    .sort((a, b) => (b.votes - a.votes) || (a.firstMs - b.firstMs) || a.no.localeCompare(b.no));
}
function publishedWorks_() {
  return sheet_(SH.subs).getDataRange().getValues().slice(1).filter(r => r[10] !== '' && r[10] !== null)
    .map(r => ({ no: String(r[10]).padStart(2, '0'), first: r[0], theme: r[5], title: r[6], body: r[7], name: r[4] }))
    .sort((a, b) => a.no.localeCompare(b.no));
}
function tallyMap_() { const m = {}; sheet_(SH.tally).getDataRange().getValues().slice(1).forEach(r => { if (r[0] !== '') m[String(r[0]).padStart(2, '0')] = Number(r[3] || 0); }); return m; }
function fmt_(d) { return d ? Utilities.formatDate(new Date(d), 'Asia/Taipei', 'MM/dd HH:mm') : ''; }
function acct_(p) { return p.role === ROLE_STAFF ? p.id : p.name; }
function ensureSheet_(name, header) {
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (header.length && sh.getLastRow() === 0) { sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function sheet_(n) { return SpreadsheetApp.getActive().getSheetByName(n); }
function norm_(v) { return String(v == null ? '' : v).replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\s+/g, '').toUpperCase(); }
function readRoster_() {
  return sheet_(SH.roster).getDataRange().getValues().slice(1).filter(r => r[0] || r[2]).map(r => {
    const role = String(r[0]).indexOf('實習') >= 0 ? ROLE_INTERN : ROLE_STAFF;
    return { role, id: String(r[1]).trim(), name: String(r[2]).trim(), key: norm_(role === ROLE_INTERN ? r[2] : r[1]), attended: String(r[3]).trim() === '是', admin: String(r[4]).trim() === '是' };
  });
}
function findPerson_(role, key) { return readRoster_().find(p => p.role === role && p.key === key) || null; }
