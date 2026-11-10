(function () {
  "use strict";
  var API = window.WIT_API_URL || "";
  var T = {
    subOpen: Date.parse("2026-11-11T13:30:00+08:00"), subClose: Date.parse("2026-11-13T12:00:00+08:00"),
    voteOpen: Date.parse("2026-11-13T13:00:00+08:00"), voteClose: Date.parse("2026-11-17T12:00:00+08:00"),
    luckyOpen: Date.parse("2026-11-18T13:00:00+08:00")
  };
  var S = { offset: 0, data: null, picks: [], cat: "all", voted: false, token: "", admin: null, spinning: false };
  try { S.token = sessionStorage.getItem("wit-admin") || ""; } catch (e) {}
  function $(id) { return document.getElementById(id); }
  function now() { return Date.now() + S.offset; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function chars(s) { return String(s || "").replace(/\s/g, "").length; }
  function setMsg(id, text, kind) { var e = $(id); e.textContent = text || ""; e.className = "status" + (kind ? " " + kind : ""); }

  /* ---------------- API ---------------- */
  function apiGet() {
    if (!API) return Promise.reject(new Error("noapi"));
    return fetch(API + "?action=data", { cache: "no-store" }).then(function (r) { return r.json(); });
  }
  function apiPost(o) {
    if (!API) return Promise.resolve({ ok: false, msg: "系統設定中，請稍後再試。" });
    return fetch(API, { method: "POST", body: JSON.stringify(o) }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, msg: "連線失敗，請檢查網路後再試一次。" }; });
  }

  /* ---------------- 路由 ---------------- */
  var VIEWS = ["guide", "write", "vote", "admin"];
  var HERO = {
    guide: ["心靈病房（Wit）：把電影當作一本書", "片長約 98 分鐘，全片不中斷播放。題目供觀賞時思考，不需現場作答；看完後歡迎投稿心得。"],
    write: ["心得投稿", "從電影出發，寫下你的感受與思考。投稿時間：11/11（三）13:30 至 11/13（五）中午 12:00。"],
    vote: ["匿名作品集與投票", "用心閱讀每一篇作品，投下你的共鳴票。投票時間：11/13（五）13:00 至 11/17（二）中午 12:00。"],
    admin: ["承辦人後台", "投稿與投票名單統計、作品公開與幸運參與獎抽獎。"]
  };
  function route() {
    var v = (location.hash || "").slice(1); if (VIEWS.indexOf(v) < 0) v = "guide";
    VIEWS.forEach(function (n) { $(n).hidden = n !== v; });
    document.body.dataset.view = v;
    $("modal").hidden = true;
    document.querySelectorAll("#tabs a").forEach(function (a) { if (a.getAttribute("href") === "#" + v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("heroTitle").textContent = HERO[v][0]; $("heroSub").textContent = HERO[v][1];
    if (v === "admin") showAdmin();
    renderVote();
  }
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-jump]"); if (!a) return; e.preventDefault();
    var t = $(a.dataset.jump); if (t) t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  /* ---------------- 投稿 ---------------- */
  function roleLabel(name, labelId) {
    document.querySelectorAll("input[name=" + name + "]").forEach(function (r) {
      r.addEventListener("change", function () { $(labelId).textContent = this.value === "實習學生" ? "姓名" : "人事號"; });
    });
  }
  roleLabel("srole", "sKeyLabel"); roleLabel("vrole", "vKeyLabel");
  $("sBody").addEventListener("input", function () {
    var n = chars(this.value), c = $("sCount");
    c.textContent = n + " / 200–300 字（不含空白）" + (n > 0 && n < 200 ? "　還差 " + (200 - n) + " 字" : n > 300 ? "　超過 " + (n - 300) + " 字" : "");
    c.classList.toggle("off", n > 0 && (n < 200 || n > 300));
  });
  function renderWrite() {
    var t = now(), before = t < T.subOpen, open = !before && t < T.subClose;
    $("subState").textContent = !API ? "系統設定中，投稿功能即將開放。" : before ? "投稿將於 11/11（三）13:30 開放，至 11/13（五）中午 12:00 截止。" : open ? "投稿開放中，至 11/13（五）中午 12:00 截止。" : "投稿已於 11/13（五）中午 12:00 截止，感謝大家的分享。";
    var f = $("essayForm"); var dis = !open || !API;
    Array.prototype.forEach.call(f.elements, function (x) { x.disabled = dis; });
  }
  $("essayForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var role = document.querySelector("input[name=srole]:checked").value;
    var o = { action: "submit", role: role, key: $("sKey").value.trim(), theme: $("sTheme").value, title: $("sTitle").value.trim(), body: $("sBody").value.trim(), privacy: $("sPrivacy").checked };
    var n = chars(o.body);
    if (!o.key) return setMsg("sMsg", "請輸入" + (role === "實習學生" ? "姓名" : "人事號") + "。", "err");
    if (!o.theme || !o.title) return setMsg("sMsg", "請選擇主題並填寫題目。", "err");
    if (n < 200 || n > 300) return setMsg("sMsg", "內文目前 " + n + " 字，請調整為 200–300 字。", "err");
    if (!o.privacy) return setMsg("sMsg", "請勾選隱私確認。", "err");
    $("sSend").disabled = true; setMsg("sMsg", "送出中…");
    apiPost(o).then(function (r) { setMsg("sMsg", r.msg, r.ok ? "ok" : "err"); $("sSend").disabled = false; });
  });

  /* ---------------- 作品集與投票 ---------------- */
  function phase() { var t = now(); return t < T.voteOpen ? "before" : t >= T.voteClose ? "after" : "during"; }
  function load() {
    apiGet().then(function (d) {
      if (!d || !d.ok) throw new Error("bad");
      S.data = d; S.offset = d.now - Date.now(); if (d.t) T = { subOpen: d.t.submitOpen, subClose: d.t.submitClose, voteOpen: d.t.voteOpen, voteClose: d.t.voteClose, luckyOpen: d.t.luckyOpen }; renderAll();
    }).catch(function (err) {
      $("voteState").textContent = err && err.message === "noapi" ? "系統設定中，作品集即將開放。" : "暫時無法載入作品，請稍後重新整理。";
      renderAll();
    });
  }
  function renderAll() { renderWrite(); renderVote(); }
  function renderVote() {
    var d = S.data, p = phase(), pill = $("votePill");
    pill.textContent = p === "before" ? "尚未開始" : p === "during" ? "投票中" : "已截止";
    pill.className = "pill " + (p === "during" ? "vote" : p === "after" ? "results" : "");
    if (!d) { $("votebar").hidden = true; if (!$("works").innerHTML) $("works").innerHTML = '<div class="empty">作品整理中，敬請期待。</div>'; return; }
    $("voteState").innerHTML = p === "before" ? "投票將於 <b>11/13（五）13:00</b> 開始，作品公開後可以先慢慢閱讀。"
      : p === "during" ? (S.voted ? "您已完成投票，感謝您的參與！仍可繼續閱讀作品與查看排行榜。" : "請在作品下方按「投這篇一票」（最多 3 篇），選好後按畫面下方「送出投票」。<b>每人僅能送出一次。</b>")
      : "投票已於 11/17（二）中午 12:00 截止，感謝大家參與！";
    $("vVoted").textContent = d.voted; $("vElig").textContent = d.eligible; $("vCount").textContent = d.works.length + " 篇";
    $("vBar").style.width = (d.eligible ? Math.min(100, Math.round(d.voted / d.eligible * 100)) : 0) + "%";
    var themes = ["all"]; d.works.forEach(function (w) { if (themes.indexOf(w.theme) < 0) themes.push(w.theme); });
    $("cats").innerHTML = themes.map(function (t) {
      var n = t === "all" ? d.works.length : d.works.filter(function (w) { return w.theme === t; }).length;
      return '<a data-cat="' + esc(t) + '" class="' + (S.cat === t ? "on" : "") + '">' + (t === "all" ? "全部作品" : esc(String(t).split("：")[1] || t)) + "（" + n + "）</a>";
    }).join("");
    if (p === "before") { $("rankList").innerHTML = ""; $("rankNote").textContent = "投票開始後即時更新。"; }
    else {
      $("rankList").innerHTML = d.ranking.map(function (r, i) { return '<li><span class="n">' + (i + 1) + '</span><span class="t">' + esc(r.no) + " 號｜" + esc(r.title) + '</span><span class="v">' + r.votes + "</span></li>"; }).join("") || '<li><span></span><span class="note">尚無作品</span><span></span></li>';
      $("rankNote").textContent = "前三名為最具共鳴獎，每分鐘自動更新。";
    }
    S.picks = S.picks.filter(function (x) { return d.works.some(function (w) { return w.no === x; }); });
    var canPick = p === "during" && !S.voted;
    var list = d.works.filter(function (w) { return S.cat === "all" || w.theme === S.cat; });
    $("works").innerHTML = list.length ? list.map(function (w) {
      var on = S.picks.indexOf(w.no) >= 0;
      return '<article class="post' + (on ? " picked" : "") + '"><div class="meta"><b>No.' + esc(w.no) + '</b><span class="tag">' + esc(w.theme) + "</span><span>匿名投稿</span></div><h3>" + esc(w.title) + '</h3><div class="text">' + esc(w.body) + '</div><div class="foot"><span class="heart">♥ 共鳴 ' + (p === "before" ? "—" : w.votes) + " 票</span>"
        + (canPick ? '<button type="button" class="pick' + (on ? " on" : "") + '" data-no="' + esc(w.no) + '"' + (!on && S.picks.length >= 3 ? " disabled" : "") + ">" + (on ? "✓ 已選" : "投這篇一票") + "</button>" : "") + "</div></article>";
    }).join("") : '<div class="empty">作品整理中，敬請期待。</div>';
    $("votebar").hidden = !(canPick && document.body.dataset.view === "vote");
    $("vSel").textContent = S.picks.length ? "已選：" + S.picks.map(function (x) { return x + " 號"; }).join("、") + "（" + S.picks.length + "/3）" : "尚未選擇作品（最多 3 篇）";
    $("vGo").disabled = !S.picks.length;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".pick");
    if (b) { var no = b.dataset.no, i = S.picks.indexOf(no); if (i >= 0) S.picks.splice(i, 1); else if (S.picks.length < 3) S.picks.push(no); renderVote(); return; }
    var c = e.target.closest("[data-cat]"); if (c) { S.cat = c.dataset.cat; renderVote(); }
  });
  $("vGo").addEventListener("click", function () {
    $("mPicks").innerHTML = S.picks.map(function (no) { var w = S.data.works.filter(function (x) { return x.no === no; })[0]; return "<li>" + esc(no) + " 號｜" + esc(w ? w.title : "") + "</li>"; }).join("");
    setMsg("vMsg", ""); $("vAck").checked = false; $("modal").hidden = false; $("vKey").focus();
  });
  $("vCancel").addEventListener("click", function () { $("modal").hidden = true; });
  $("vSend").addEventListener("click", function () {
    var role = document.querySelector("input[name=vrole]:checked").value, key = $("vKey").value.trim();
    if (!key) return setMsg("vMsg", "請輸入" + (role === "實習學生" ? "姓名" : "人事號") + "。", "err");
    if (!$("vAck").checked) return setMsg("vMsg", "請勾選確認後再送出。", "err");
    $("vSend").disabled = true; setMsg("vMsg", "送出中…");
    apiPost({ action: "vote", role: role, key: key, picks: S.picks }).then(function (r) {
      $("vSend").disabled = false; setMsg("vMsg", r.msg, r.ok ? "ok" : "err");
      if (r.ok || r.voted) { S.voted = true; S.picks = []; $("vKey").value = ""; setTimeout(function () { $("modal").hidden = true; load(); }, 1800); }
    });
  });

  /* ---------------- 承辦人後台 ---------------- */
  function showAdmin() {
    if (S.token) { $("loginBox").hidden = true; $("dash").hidden = false; loadAdmin(); }
    else { $("loginBox").hidden = false; $("dash").hidden = true; }
  }
  function logout(msg) {
    if (S.token) apiPost({ action: "logout", token: S.token });
    S.token = ""; S.admin = null; try { sessionStorage.removeItem("wit-admin"); } catch (e) {}
    $("lPass").value = ""; showAdmin(); setMsg("lMsg", msg || "", "err");
  }
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("lBtn").disabled = true; setMsg("lMsg", "登入中…");
    apiPost({ action: "login", user: $("lUser").value, pass: $("lPass").value }).then(function (r) {
      $("lBtn").disabled = false;
      if (!r.ok) return setMsg("lMsg", r.msg, "err");
      S.token = r.token; try { sessionStorage.setItem("wit-admin", r.token); } catch (e) {}
      $("lPass").value = ""; setMsg("lMsg", ""); showAdmin();
    });
  });
  $("dLogout").addEventListener("click", function () { logout("已登出。"); });
  $("dRefresh").addEventListener("click", loadAdmin);
  function adminCall(o) { o.token = S.token; return apiPost(o).then(function (r) { if (r.auth) { logout("登入已逾時，請重新登入。"); throw new Error("auth"); } return r; }); }
  function loadAdmin() {
    $("dUpd").textContent = "讀取中…";
    adminCall({ action: "admin" }).then(function (d) {
      if (!d.ok) { $("dUpd").textContent = d.msg; return; }
      S.admin = d; renderAdmin();
    }).catch(function () {});
  }
  function tile(k, v, tot, note) {
    var pct = tot ? Math.round(v / tot * 100) : 0;
    return '<div class="tile"><div class="k">' + k + '</div><div class="v">' + v + (tot ? " <small>/ " + tot + "</small>" : "") + "</div>" + (tot ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : "") + '<div class="note">' + (note || "") + "</div></div>";
  }
  function table(head, rows) {
    return '<div class="tablewrap"><table><thead><tr>' + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>"
      + (rows.length ? rows.join("") : '<tr><td colspan="' + head.length + '" class="muted">目前沒有資料</td></tr>') + "</tbody></table></div>";
  }
  function renderAdmin() {
    var d = S.admin, s = d.stats;
    $("dUpd").textContent = "更新於 " + new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    $("tiles").innerHTML = tile("有效投稿", s.subValid, s.attendees, s.attendees ? "應投稿 " + s.attendees + " 人" : "名單尚未標記參加者")
      + tile("參加者未投稿", s.attendNoSub, 0, "列入 Seminar 提問名單") + tile("已投票", s.voted, s.voters, "未投票 " + (s.voters - s.voted) + " 人") + tile("公開作品", s.works, 0, "未計入的投票 " + s.rejected + " 筆");
    var subs = d.subs.slice().sort(function (a, b) { return (a.first || "99").localeCompare(b.first || "99"); });
    $("p-subs").innerHTML = '<div class="row" style="margin-bottom:10px"><button type="button" id="pubBtn">公開勾選的作品</button><span class="note">勾選後按「公開」，系統會隨機編號並顯示在作品集。投票開始後不能取消公開。</span><span class="status" id="pubMsg"></span></div>'
      + table(["", "首次投稿", "最後修改", "身分", "人事號／姓名", "姓名", "主題", "題目", "字數", "作品"], subs.map(function (r) {
        return "<tr><td>" + (r.no ? "" : '<input type="checkbox" class="pubck" value="' + esc(r.key) + '" aria-label="公開 ' + esc(r.title) + '">') + "</td><td>" + esc(r.first) + "</td><td>" + esc(r.last) + "</td><td>" + esc(r.role) + "</td><td>" + esc(r.id) + "</td><td>" + esc(r.name) + "</td><td>" + esc(r.theme) + "</td><td>" + esc(r.title) + '</td><td class="n">' + esc(r.chars) + "</td><td>"
          + (r.no ? '<b>' + esc(r.no) + ' 號</b> <button type="button" class="ghost unpub" data-no="' + esc(r.no) + '" style="padding:2px 8px;font-size:12px">取消</button>' : '<span class="muted">未公開</span>') + "</td></tr>";
      }));
    $("p-nosub").innerHTML = '<p class="note">11/11 參加觀影但尚未投稿者（列入 Seminar 提問名單）。請先在試算表「名單」把參加者標為「是」。</p>'
      + table(["#", "身分", "人事號", "姓名"], d.noSub.map(function (p, i) { return '<tr><td class="n">' + (i + 1) + "</td><td>" + esc(p.role) + "</td><td>" + esc(p.id) + "</td><td>" + esc(p.name) + "</td></tr>"; }));
    $("p-votes").innerHTML = '<div class="two"><div><h3 class="ok" style="margin-top:0">已投票（' + d.voted.length + "）</h3>"
      + table(["#", "身分", "姓名", "投票時間"], d.voted.map(function (p, i) { return '<tr><td class="n">' + (i + 1) + "</td><td>" + esc(p.role) + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.at) + "</td></tr>"; }))
      + '</div><div><h3 class="warn" style="margin-top:0">未投票（' + d.notVoted.length + "）</h3>"
      + table(["#", "身分", "人事號", "姓名"], d.notVoted.map(function (p, i) { return '<tr><td class="n">' + (i + 1) + "</td><td>" + esc(p.role) + "</td><td>" + esc(p.id) + "</td><td>" + esc(p.name) + "</td></tr>"; }))
      + '</div></div><h3>未計入的投票嘗試（' + d.rejected.length + "）</h3>"
      + table(["時間", "身分", "輸入的帳號", "姓名", "原因"], d.rejected.map(function (r) { return "<tr><td>" + esc(r.at) + "</td><td>" + esc(r.role) + "</td><td>" + esc(r.id) + "</td><td>" + esc(r.name) + '</td><td class="warn">' + esc(r.result) + "</td></tr>"; }))
      + '<div class="row" style="margin-top:12px"><button type="button" class="ghost" id="statusBtn">更新試算表「完成情形」</button><span class="status" id="statusMsg"></span></div>';
    $("p-rank").innerHTML = '<p class="note">依票數排序，同票以首次成功投稿時間較早者優先。作者姓名僅承辦人可見。</p>'
      + table(["名次", "編號", "題目", "主題", "作者", "首次投稿", "票數"], d.rank.map(function (r) { return "<tr><td>" + (r.rank <= 3 ? '<b style="color:var(--gold)">最具共鳴獎 ' + r.rank + "</b>" : r.rank) + "</td><td>" + esc(r.no) + "</td><td>" + esc(r.title) + "</td><td>" + esc(r.theme) + "</td><td>" + esc(r.author) + "</td><td>" + esc(r.first) + '</td><td class="n"><b>' + r.votes + "</b></td></tr>"; }));
    renderLucky();
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("#dtabs a")) { var a = t.closest("#dtabs a"); document.querySelectorAll("#dtabs a").forEach(function (x) { x.classList.toggle("on", x === a); }); document.querySelectorAll(".pane").forEach(function (p) { p.classList.toggle("on", p.id === "p-" + a.dataset.p); }); }
    if (t.id === "pubBtn") {
      var keys = Array.prototype.map.call(document.querySelectorAll(".pubck:checked"), function (c) { return c.value; });
      if (!keys.length) return setMsg("pubMsg", "請先勾選要公開的作品。", "err");
      t.disabled = true; setMsg("pubMsg", "處理中…");
      adminCall({ action: "publish", keys: keys }).then(function (r) { setMsg("pubMsg", r.msg, r.ok ? "ok" : "err"); loadAdmin(); load(); }).catch(function () {});
    }
    if (t.classList.contains("unpub")) {
      if (!t.dataset.armed) { t.dataset.armed = "1"; t.textContent = "確定取消？"; return; }
      adminCall({ action: "unpublish", no: t.dataset.no }).then(function (r) { setMsg("pubMsg", r.msg, r.ok ? "ok" : "err"); loadAdmin(); load(); }).catch(function () {});
    }
    if (t.id === "statusBtn") { setMsg("statusMsg", "更新中…"); adminCall({ action: "status" }).then(function (r) { setMsg("statusMsg", r.msg, r.ok ? "ok" : "err"); }).catch(function () {}); }
    if (t.id === "drawBtn") draw(false);
    if (t.id === "redoBtn") { if (!t.dataset.armed) { t.dataset.armed = "1"; t.textContent = "再按一次確認重新抽獎（原結果會被取代）"; return; } draw(true); }
  });
  function renderLucky() {
    var d = S.admin, open = now() >= T.luckyOpen, has = d.lucky.length > 0;
    var slots = has ? d.lucky.map(function (w) { return '<div class="slot done">' + esc(w.name) + "</div>"; }).join("") : '<div class="slot" id="s0">？</div><div class="slot" id="s1">？</div>';
    $("p-lucky").innerHTML = '<div class="card lucky"><h3 style="margin:0;font:700 22px var(--display)">幸運參與獎　2 名</h3><p class="note" style="margin:8px 0 0">候選人：所有有效投稿的同仁，共 <b>' + d.luckyPool.length + "</b> 位（承辦人除外，每人一次機會）。開放時間：11/18（三）13:00</p>"
      + '<div class="drum" id="drum">' + slots + "</div>"
      + (has ? "<p>抽出時間：" + esc(d.lucky[0].at) + "　" + d.lucky.map(function (w) { return esc(w.place) + "：" + esc(w.name) + "（" + esc(w.role) + "）"; }).join("　") + '</p><button type="button" class="ghost" id="redoBtn">重新抽獎</button>'
        : '<button type="button" id="drawBtn"' + (open ? "" : " disabled") + ">" + (open ? "開始抽獎" : "11/18 13:00 開放") + "</button>")
      + '<p class="status" id="lkMsg" style="margin-top:8px"></p></div>';
  }
  function draw(redo) {
    if (S.spinning) return; S.spinning = true;
    var pool = S.admin.luckyPool.length ? S.admin.luckyPool : ["？"];
    $("drum").innerHTML = '<div class="slot" id="s0">？</div><div class="slot" id="s1">？</div>';
    var tm = setInterval(function () { $("s0").textContent = pool[Math.floor(Math.random() * pool.length)]; $("s1").textContent = pool[Math.floor(Math.random() * pool.length)]; }, 70);
    setMsg("lkMsg", "抽獎中…");
    adminCall({ action: "draw", redo: redo }).then(function (r) {
      setTimeout(function () {
        clearInterval(tm); S.spinning = false;
        if (r.winners) S.admin.lucky = r.winners;
        renderLucky(); setMsg("lkMsg", r.ok ? "恭喜得獎同仁！結果已記錄在試算表「抽獎結果」。" : r.msg, r.ok ? "ok" : "err");
      }, 2200);
    }).catch(function () { clearInterval(tm); S.spinning = false; });
  }

  /* ---------------- 啟動 ---------------- */
  route(); renderAll(); load();
  setInterval(load, 60000);
  setInterval(renderWrite, 30000);
})();
