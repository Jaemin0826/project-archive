/* TV Archive mockup */
(function () {
  "use strict";

  const CELL_W = 236;
  const CELL_H = 164;
  const GAP = 16;
  const GRID_MIN = -8;
  const SCALE_MIN = 0.38;
  const SCALE_MAX = 1.75;
  const DEFAULT_SCALE = 1;
  const AUTH_KEY = "tv-archive-unlocked";
  const DATA_KEY = "tv-archive-data-v3";
  const SIDEBAR_KEY = "tv-archive-sidebar-collapsed";
  const PASSWORD = "0000";
  const MOODS = ["😊", "😐", "😵", "🔥", "✨", "😢"];
  const MOOD_VAL = { "😢": 1, "😵": 2, "😐": 3, "😊": 4, "✨": 5, "🔥": 5 };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const camera = { cx: 0, cy: 0, scale: DEFAULT_SCALE };
  let state = null;
  let unlocked = false;
  let previewEmpty = false;
  let catsEditing = false;
  let activeCat = "__all";
  let rerun = null;
  let pendingEdit = null;
  let currentId = null;
  let currentCh = null;
  let currentUp = null;
  let currentFile = 0;
  let recapPeriod = "week";
  let oaFiles = [];
  let oaMood = "😊";
  let threeCtl = null;
  let searchIndex = -1;
  let drag = null;
  let pan = null;
  let skipClick = false;
  let sideMode = "category";
  let sideQuery = "";
  let expanded = { "cat:__all": true };
  let focusedId = null;
  let railSection = "archive";
  let sidebarCollapsed = false;
  const STATUS_GROUPS = [
    { key: "onair", label: "ON AIR", dot: "green", match: function (vs) { return vs.key === "onair"; } },
    { key: "on", label: "ON", dot: "green", match: function (vs) { return vs.key === "on"; } },
    { key: "pause", label: "PAUSE", dot: "red", match: function (vs) { return vs.key === "static" || vs.key === "night"; } },
    { key: "offline", label: "OFFLINE", dot: "gray", match: function (vs) { return vs.key === "offline" || vs.key === "nosignal"; } },
    { key: "ended", label: "방송 종료", dot: "", match: function (vs) { return vs.key === "ended"; } },
  ];

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }
  function today() {
    // Mock "today" locked to the planning date so TV states stay stable.
    return new Date(2026, 10, 7);
  }
  function parseDay(str) {
    if (!str) return today();
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function fmtDay(dt) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  function daysBetween(str) {
    return Math.round((today() - parseDay(str)) / 86400000);
  }
  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function sizeFor(n) {
    if (n >= 20) return { w: 3, h: 3, key: "3x3" };
    if (n >= 10) return { w: 2, h: 2, key: "2x2" };
    if (n >= 5) return { w: 2, h: 1, key: "2x1" };
    return { w: 1, h: 1, key: "1x1" };
  }

  function projects() {
    return previewEmpty ? [] : state.projects;
  }

  function applySizes() {
    projects().forEach((p) => {
      const s = sizeFor((p.updates || []).length);
      p.w = s.w;
      p.h = s.h;
      p.sizeKey = s.key;
    });
  }

  function sortedUpdates(p) {
    return (p.updates || []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function lastUpdate(p) {
    return sortedUpdates(p)[0] || null;
  }

  function lastDate(p) {
    const u = lastUpdate(p);
    return u ? u.date : "2000-01-01";
  }

  function latestMood(p) {
    const u = sortedUpdates(p).find((x) => x.mood);
    return u ? u.mood : "";
  }

  function coverOf(p, update) {
    const u = update || lastUpdate(p);
    if (!u || !u.files || !u.files.length) return "";
    return u.files[0].src || "";
  }

  function visualState(p) {
    if (p.private && !unlocked) {
      return { key: "nosignal", badge: "OFFLINE", label: "비공개", days: daysBetween(lastDate(p)), dot: "gray" };
    }
    if (p.completed) {
      return { key: "ended", badge: "방송 종료", label: "방송 종료", days: daysBetween(lastDate(p)) };
    }
    const d = daysBetween(lastDate(p));
    if (d <= 3) return { key: "onair", badge: "ON AIR", label: "방송 중", days: d, dot: "green" };
    if (d <= 14) return { key: "on", badge: "ON", label: "켜져 있음", days: d, dot: "green" };
    if (d <= 30) return { key: "static", badge: "PAUSE", label: "지지직", days: d, dot: "red" };
    if (d <= 90) return { key: "night", badge: "PAUSE", label: "혼자 켜진 밤", days: d, dot: "red" };
    return { key: "offline", badge: "OFFLINE", label: "꺼짐", days: d, dot: "gray" };
  }

  function daysLabel(d) {
    if (d <= 0) return "오늘";
    if (d === 1) return "어제";
    return d + "일 전";
  }

  function cellToLocal(x, y) {
    return { x: (x - GRID_MIN) * CELL_W, y: (y - GRID_MIN) * CELL_H };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects)) {
          state = parsed;
          if (!state.recap) state.recap = { x: 2, y: 0 };
          if (!state.categories) state.categories = clone(TV_SEED.categories);
          if (!state.trash) state.trash = [];
          return;
        }
      }
    } catch (err) {
      console.warn("seed fallback", err);
    }
    state = clone(window.TV_SEED);
  }

  function saveState() {
    if (previewEmpty) return;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("save failed", err);
    }
  }

  function purgeTrash() {
    state.trash = (state.trash || []).filter((p) => daysBetween(p.deletedAt) <= 30);
  }

  function pickRerun() {
    const targets = [];
    projects().forEach((p) => {
      if (p.private && !unlocked) return;
      (p.updates || []).forEach((u) => {
        const d = daysBetween(u.date);
        if ([30, 90, 365].some((n) => Math.abs(d - n) <= 6)) {
          targets.push({ projectId: p.id, updateId: u.id });
        }
      });
    });
    rerun = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
  }

  function occupiedSet(exceptId) {
    const set = new Set();
    applySizes();
    projects().forEach((p) => {
      if (p.id === exceptId) return;
      for (let y = 0; y < p.h; y++) {
        for (let x = 0; x < p.w; x++) set.add(p.x + x + "," + (p.y + y));
      }
    });
    if (projects().length && !(exceptId === "__recap")) {
      set.add(state.recap.x + "," + state.recap.y);
    }
    return set;
  }

  function findEmpty(w, h, exceptId) {
    const occ = occupiedSet(exceptId);
    let minX = 0, minY = 0, maxX = 5, maxY = 4;
    projects().forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    });
    for (let y = minY; y <= maxY + 3; y++) {
      for (let x = minX; x <= maxX + 3; x++) {
        let ok = true;
        for (let dy = 0; dy < h && ok; dy++) {
          for (let dx = 0; dx < w && ok; dx++) {
            if (occ.has(x + dx + "," + (y + dy))) ok = false;
          }
        }
        if (ok) return { x: x, y: y };
      }
    }
    return { x: maxX + 1, y: minY };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function resolveCollisions(moved, dir, depth) {
    if (depth > 14) return;
    applySizes();
    projects().forEach((o) => {
      if (o === moved) return;
      if (!rectsOverlap(moved, o)) return;
      if (dir === "left") o.x = moved.x - o.w;
      else if (dir === "up") o.y = moved.y - o.h;
      else if (dir === "down") o.y = moved.y + moved.h;
      else o.x = moved.x + moved.w;
      resolveCollisions(o, dir, depth + 1);
    });
    if (projects().length) {
      const rec = { x: state.recap.x, y: state.recap.y, w: 1, h: 1 };
      if (moved.id !== "__recap" && rectsOverlap(moved, rec)) {
        if (dir === "left") state.recap.x = moved.x - 1;
        else if (dir === "up") state.recap.y = moved.y - 1;
        else if (dir === "down") state.recap.y = moved.y + moved.h;
        else state.recap.x = moved.x + moved.w;
      }
    }
  }

  function growProject(p) {
    const beforeW = p.w || 1;
    const beforeH = p.h || 1;
    applySizes();
    if (p.w !== beforeW || p.h !== beforeH) resolveCollisions(p, "right", 0);
  }

  /* —— camera —— */
  function viewOrigin() {
    const vp = $("#viewport");
    const w = vp ? vp.clientWidth : 0;
    const h = vp ? vp.clientHeight : 0;
    if (!state || !projects().length) return { x: w / 2, y: h / 2 };
    return { x: w / 2, y: Math.min(148, Math.max(120, h * 0.26)) };
  }

  function applyCamera() {
    const vp = $("#viewport");
    const wall = $("#wall");
    if (!vp || !wall) return;
    const o = viewOrigin();
    wall.style.transform =
      "translate(" + o.x + "px," + o.y + "px) scale(" +
      camera.scale + ") translate(" + (-camera.cx) + "px," + (-camera.cy) + "px)";
    renderMinimap();
  }

  function centerOnLatest(animate) {
    const list = projects().slice().sort((a, b) => (lastDate(a) < lastDate(b) ? 1 : -1));
    const p = list[0];
    if (p) {
      applySizes();
      const loc = cellToLocal(p.x + p.w / 2, p.y + p.h / 2);
      if (animate) animateCamera(loc.x, loc.y, DEFAULT_SCALE);
      else {
        camera.cx = loc.x;
        camera.cy = loc.y;
        camera.scale = DEFAULT_SCALE;
        applyCamera();
      }
    } else {
      const loc = cellToLocal(0.5, 0.5);
      camera.cx = loc.x;
      camera.cy = loc.y;
      camera.scale = 1.05;
      applyCamera();
    }
  }

  function flyToProject(p) {
    applySizes();
    const loc = cellToLocal(p.x + p.w / 2, p.y + p.h / 2);
    animateCamera(loc.x, loc.y, camera.scale);
    const el = $('#wall .tv[data-id="' + p.id + '"]');
    if (el) {
      el.classList.add("is-flash");
      setTimeout(() => el.classList.remove("is-flash"), 900);
    }
  }

  function animateCamera(tx, ty, ts) {
    const sx = camera.cx, sy = camera.cy, ss = camera.scale;
    const t0 = performance.now();
    const dur = 520;
    function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      camera.cx = sx + (tx - sx) * e;
      camera.cy = sy + (ty - sy) * e;
      camera.scale = ss + (ts - ss) * e;
      applyCamera();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function worldFromEvent(e) {
    const r = $("#viewport").getBoundingClientRect();
    const o = viewOrigin();
    return {
      x: camera.cx + (e.clientX - r.left - o.x) / camera.scale,
      y: camera.cy + (e.clientY - r.top - o.y) / camera.scale,
    };
  }

  /* —— render wall —— */
  function tvScreenHTML(opts) {
    const badgeDot = opts.dot ? '<i class="dot ' + esc(opts.dot) + '"></i>' : "";
    const name = opts.name ? '<p class="tv-name">' + esc(opts.name) + "</p>" : "";
    const badge = opts.badge
      ? '<div class="tv-badge">' + badgeDot + esc(opts.badge) + "</div>"
      : "";
    const rerunTag = opts.rerun ? '<div class="tv-rerun">재방송</div>' : "";
    let body = "";
    if (opts.kind === "nosignal") {
      body = '<div class="tv-nosignal"><span>NO SIGNAL</span></div>';
    } else if (opts.kind === "ended") {
      body = '<div class="tv-bars"></div>';
    } else if (opts.kind === "plus") {
      body = '<div class="tv-plus-mark">+</div>';
    } else if (opts.kind === "recap") {
      body = '<div class="tv-recap-art"><div class="recap-word">RECAP</div></div>';
    } else {
      const img = opts.src
        ? '<img class="tv-thumb" alt="" src="' + esc(opts.src) + '" />'
        : "";
      body = img;
    }
    const staticLayer = opts.kind === "static" ? '<div class="tv-static"></div>' : "";
    return (
      '<div class="tv-screen">' +
      body +
      '<div class="tv-glow"></div>' +
      '<div class="tv-scan"></div>' +
      '<div class="tv-scrim"></div>' +
      staticLayer +
      rerunTag +
      badge +
      name +
      "</div>"
    );
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderWall() {
    const wall = $("#wall");
    wall.innerHTML = "";
    applySizes();
    const list = projects();
    const hideOthers = activeCat !== "__all";

    list.forEach((p) => {
      const vs = visualState(p);
      const loc = cellToLocal(p.x, p.y);
      const el = document.createElement("div");
      const isRerun = rerun && rerun.projectId === p.id;
      let src = coverOf(p);
      let kind = vs.key;
      if (isRerun) {
        const ru = (p.updates || []).find((u) => u.id === rerun.updateId);
        if (ru && ru.files && ru.files[0]) src = ru.files[0].src;
      }
      if (vs.key === "nosignal") kind = "nosignal";
      else if (vs.key === "ended") kind = "ended";
      else if (vs.key === "offline") kind = "offline";
      else if (vs.key === "static") kind = "static";

      el.className = "tv size-" + p.sizeKey + " state-" + vs.key;
      el.dataset.id = p.id;
      el.style.left = loc.x + "px";
      el.style.top = loc.y + "px";
      el.style.width = p.w * CELL_W - GAP + "px";
      el.style.height = p.h * CELL_H - GAP + "px";
      if (hideOthers && p.category !== activeCat) el.classList.add("is-dim");
      el.innerHTML = tvScreenHTML({
        kind: kind,
        src: src,
        name: p.name,
        badge: vs.badge,
        dot: vs.dot,
        rerun: isRerun,
      });
      wall.appendChild(el);
    });

    if (list.length) {
      const loc = cellToLocal(state.recap.x, state.recap.y);
      const rec = document.createElement("div");
      rec.className = "tv size-1x1 tv-special";
      rec.dataset.special = "recap";
      rec.style.left = loc.x + "px";
      rec.style.top = loc.y + "px";
      rec.style.width = CELL_W - GAP + "px";
      rec.style.height = CELL_H - GAP + "px";
      rec.innerHTML = tvScreenHTML({
        kind: "recap",
        name: "주간 특집",
        badge: "특집",
      });
      wall.appendChild(rec);
    }

    const plusAt = findEmpty(1, 1);
    const ploc = cellToLocal(plusAt.x, plusAt.y);
    const plus = document.createElement("div");
    plus.className = "tv size-1x1 state-offline tv-special";
    plus.dataset.special = "plus";
    plus.dataset.x = String(plusAt.x);
    plus.dataset.y = String(plusAt.y);
    plus.style.left = ploc.x + "px";
    plus.style.top = ploc.y + "px";
    plus.style.width = CELL_W - GAP + "px";
    plus.style.height = CELL_H - GAP + "px";
    plus.innerHTML = tvScreenHTML({ kind: "plus", badge: "OFFLINE", name: "", dot: "gray" });
    wall.appendChild(plus);

    if (!list.length) {
      const wrap = document.createElement("div");
      wrap.className = "mascot-wrap";
      wrap.style.left = ploc.x + CELL_W - 8 + "px";
      wrap.style.top = ploc.y + 28 + "px";
      wrap.innerHTML =
        '<svg class="mascot-blob" viewBox="0 0 64 56" xmlns="http://www.w3.org/2000/svg">' +
        '<ellipse cx="32" cy="30" rx="22" ry="18" fill="#3a3a40"/>' +
        '<ellipse cx="32" cy="22" rx="16" ry="14" fill="#4a4a52"/>' +
        '<circle cx="26" cy="22" r="3.2" fill="#efece4"/>' +
        '<circle cx="38" cy="22" r="3.2" fill="#efece4"/>' +
        '<circle cx="26.6" cy="22.4" r="1.3" fill="#222"/>' +
        '<circle cx="38.6" cy="22.4" r="1.3" fill="#222"/>' +
        '<path d="M28 30 q4 3 8 0" stroke="#c8c4bc" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<circle cx="46" cy="10" r="3.5" fill="#5a5a62"/>' +
        '<rect x="45" y="2" width="2" height="8" rx="1" fill="#6a6a72"/>' +
        "</svg>" +
        '<div class="mascot-speech">첫 방송을 시작해볼까...?</div>';
      wall.appendChild(wrap);
    }

    renderMinimap();
  }

  function setRail(name) {
    railSection = name;
    $$(".rail-nav [data-rail]").forEach((b) => {
      b.classList.toggle("is-on", b.getAttribute("data-rail") === name);
    });
  }

  function applySidebarCollapsed(collapsed) {
    sidebarCollapsed = !!collapsed;
    const app = $("#app");
    if (app) app.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    try { localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0"); } catch (err) {}
    applyCamera();
  }

  function syncRail() {
    if (!$("#trash-view").hidden) setRail("trash");
    else if (!$("#recap-view").hidden) setRail("recap");
    else setRail(railSection === "home" ? "home" : "archive");
  }

  function folderIco() {
    return '<svg class="tree-folder-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7h6l2 2h10v10H3V7z"/></svg>';
  }

  function sortByRecent(items) {
    return items.slice().sort(function (a, b) {
      const da = lastDate(a), db = lastDate(b);
      if (da < db) return 1;
      if (da > db) return -1;
      return 0;
    });
  }

  function projectMatchesQuery(p, q) {
    if (!q) return true;
    if ((p.name || "").toLowerCase().indexOf(q) !== -1) return true;
    if ((p.category || "").toLowerCase().indexOf(q) !== -1) return true;
    return (p.channels || []).some(function (c) {
      return (c.name || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderProjectRow(p) {
    const q = sideQuery.trim().toLowerCase();
    if (q && !projectMatchesQuery(p, q)) return "";
    const vs = visualState(p);
    const expKey = "proj:" + p.id;
    const open = !!expanded[expKey];
    const on = (focusedId === p.id || currentId === p.id) ? " is-on" : "";
    const channels = p.channels || [];
    const chev = channels.length
      ? '<span class="tree-chevron' + (open ? " is-open" : "") + '" data-toggle="' + esc(expKey) + '"></span>'
      : '<span class="tree-pad"></span>';
    let html = '<div class="tree-block">' +
      '<button type="button" class="tree-row project' + on + '" data-pid="' + esc(p.id) + '">' +
      chev +
      '<i class="tree-dot' + (vs.dot ? " " + vs.dot : "") + '"></i>' +
      '<span class="tree-name">' + esc(p.name) + "</span></button>";
    if (open && channels.length) {
      html += '<div class="tree-children">';
      channels.forEach(function (ch) {
        const chOn = (currentId === p.id && currentCh === ch.id) ? " is-on" : "";
        html += '<button type="button" class="tree-row channel' + chOn + '" data-pid="' + esc(p.id) + '" data-ch="' + esc(ch.id) + '">' +
          '<span class="tree-name">' + esc(ch.name) + "</span></button>";
      });
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function renderSideTree() {
    const box = $("#side-tree");
    if (!box || !state) return;
    const q = sideQuery.trim().toLowerCase();
    const list = projects();
    let html = "";
    if (sideMode === "status") {
      STATUS_GROUPS.forEach(function (g) {
        const items = sortByRecent(list.filter(function (p) { return g.match(visualState(p)); })
          .filter(function (p) { return !q || projectMatchesQuery(p, q); }));
        if (!items.length && q) return;
        const key = "status:" + g.key;
        if (q) expanded[key] = true;
        const open = !!expanded[key];
        html += '<div class="tree-block">';
        html += '<button type="button" class="tree-row folder' + (open ? " is-open" : "") + '" data-toggle="' + key + '">' +
          '<span class="tree-chevron' + (open ? " is-open" : "") + '"></span>' +
          (g.dot ? '<i class="tree-dot ' + g.dot + '"></i>' : folderIco()) +
          '<span class="tree-name">' + esc(g.label) + "</span>" +
          '<span class="tree-count">' + items.length + "</span></button>";
        if (open) html += '<div class="tree-children">' + items.map(renderProjectRow).join("") + "</div>";
        html += "</div>";
      });
    } else {
      const groups = [{ id: "__all", name: "전체" }].concat(
        (state.categories || []).map(function (c) { return { id: c, name: c }; })
      );
      groups.forEach(function (g) {
        const items = sortByRecent((g.id === "__all" ? list : list.filter(function (p) { return p.category === g.id; }))
          .filter(function (p) { return !q || projectMatchesQuery(p, q); }));
        if (q && !items.length && g.name.toLowerCase().indexOf(q) === -1) return;
        const key = "cat:" + g.id;
        if (q) expanded[key] = true;
        const open = !!expanded[key];
        const active = activeCat === g.id ? " is-active" : "";
        html += '<div class="tree-block">';
        html += '<button type="button" class="tree-row folder' + active + (open ? " is-open" : "") +
          '" data-cat="' + esc(g.id) + '" data-toggle="' + key + '">' +
          '<span class="tree-chevron' + (open ? " is-open" : "") + '"></span>' +
          folderIco() +
          '<span class="tree-name">' + esc(g.name) + "</span>" +
          '<span class="tree-count">' + items.length + "</span>";
        if (catsEditing && g.id !== "__all") {
          html += '<span class="cat-x" data-del="' + esc(g.id) + '">×</span>';
        }
        html += "</button>";
        if (open) html += '<div class="tree-children">' + items.map(renderProjectRow).join("") + "</div>";
        html += "</div>";
      });
    }
    box.innerHTML = html || '<p class="side-empty">맞는 항목이 없어.</p>';
    $$("[data-side-mode]").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-side-mode") === sideMode);
    });
    const lab = $("#ws-cat-label");
    if (lab) lab.textContent = activeCat === "__all" ? "전체" : activeCat;
  }

  function renderWsCatMenu() {
    const menu = $("#ws-cat-menu");
    if (!menu) return;
    const cats = ["__all"].concat(state.categories || []);
    menu.innerHTML = cats.map(function (c) {
      const label = c === "__all" ? "전체" : c;
      return '<li><button type="button" data-cat="' + esc(c) + '"' + (c === activeCat ? ' class="is-on"' : "") + ">" +
        esc(label) + "</button></li>";
    }).join("");
  }

  function renderCats() {
    renderWsCatMenu();
    renderSideTree();
  }

  function setActiveCat(cat) {
    activeCat = cat || "__all";
    expanded["cat:" + activeCat] = true;
    renderCats();
    renderWall();
  }

  function setSideMode(mode) {
    sideMode = mode === "status" ? "status" : "category";
    if (sideMode === "status") {
      STATUS_GROUPS.forEach(function (g) { expanded["status:" + g.key] = true; });
    } else {
      expanded["cat:__all"] = true;
    }
    renderSideTree();
  }

  let projClickAt = 0;
  let projClickId = "";

  function focusProject(p) {
    if (!p) return;
    focusedId = p.id;
    if (activeCat !== "__all" && p.category && p.category !== activeCat) {
      activeCat = p.category;
      renderWall();
      renderCats();
    } else {
      $$(".tree-row.project").forEach(function (el) {
        el.classList.toggle("is-on", el.getAttribute("data-pid") === p.id);
      });
    }
    flyToProject(p);
  }

  function contentBounds() {
    applySizes();
    const list = projects();
    if (!list.length) {
      const a = cellToLocal(-1, -1);
      const b = cellToLocal(2, 2);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    list.forEach((p) => {
      const a = cellToLocal(p.x, p.y);
      const b = cellToLocal(p.x + p.w, p.y + p.h);
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, b.x);
      maxY = Math.max(maxY, b.y);
    });
    const rec = cellToLocal(state.recap.x, state.recap.y);
    minX = Math.min(minX, rec.x);
    minY = Math.min(minY, rec.y);
    maxX = Math.max(maxX, rec.x + CELL_W);
    maxY = Math.max(maxY, rec.y + CELL_H);
    const pad = CELL_W;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  function renderMinimap() {
    const host = $("#minimap");
    if (!host) return;
    let canvas = $("canvas", host);
    if (!canvas) {
      canvas = document.createElement("canvas");
      host.appendChild(canvas);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = host.clientWidth || 168;
    const h = host.clientHeight || 108;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, 0, w, h);
    const b = contentBounds();
    const scale = Math.min(w / b.w, h / b.h);
    const ox = (w - b.w * scale) / 2 - b.x * scale;
    const oy = (h - b.h * scale) / 2 - b.y * scale;
    applySizes();
    projects().forEach((p) => {
      const vs = visualState(p);
      const loc = cellToLocal(p.x, p.y);
      const colors = {
        onair: "#7a7a7a",
        on: "#5a5a5a",
        static: "#4a4a4a",
        night: "#3a3a3a",
        offline: "#2e2e2e",
        ended: "#555555",
        nosignal: "#333333",
      };
      ctx.fillStyle = colors[vs.key] || "#444";
      ctx.fillRect(loc.x * scale + ox, loc.y * scale + oy, (p.w * CELL_W - GAP) * scale, (p.h * CELL_H - GAP) * scale);
    });
    if (projects().length) {
      const loc = cellToLocal(state.recap.x, state.recap.y);
      ctx.fillStyle = "#4a4a4a";
      ctx.fillRect(loc.x * scale + ox, loc.y * scale + oy, (CELL_W - GAP) * scale, (CELL_H - GAP) * scale);
    }
    const vp = $("#viewport");
    if (vp) {
      const o = viewOrigin();
      const vw = vp.clientWidth / camera.scale;
      const vh = vp.clientHeight / camera.scale;
      const vx = camera.cx - o.x / camera.scale;
      const vy = camera.cy - o.y / camera.scale;
      ctx.strokeStyle = "rgba(240,240,240,0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(vx * scale + ox, vy * scale + oy, vw * scale, vh * scale);
    }
    host._map = { scale: scale, ox: ox, oy: oy };
  }

  /* —— zoom —— */
  function getProject(id) {
    return state.projects.find((p) => p.id === id);
  }

  function visibleUpdate(p, u) {
    if (!u) return false;
    if (u.private && !unlocked) return false;
    return true;
  }

  function channelUpdates(p, chId) {
    return sortedUpdates(p).filter((u) => !chId || u.channelId === chId);
  }

  function currentUpdate(p) {
    return (p.updates || []).find((u) => u.id === currentUp) || lastUpdate(p);
  }

  function unmount3D() {
    if (threeCtl && threeCtl.dispose) threeCtl.dispose();
    threeCtl = null;
  }

  function mount3D(el) {
    unmount3D();
    const run = function (THREE) {
    if (!THREE) {
      el.innerHTML = '<div class="tv-nosignal"><span>Three.js 예정</span></div>';
      return;
    }
    const w = el.clientWidth || 640;
    const h = el.clientHeight || 360;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x191919);
    const cam = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    cam.position.set(0, 0.55, 3.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2.4, 3, 4);
    scene.add(dir);
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 1.15, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.18, roughness: 0.42 })
    );
    scene.add(cube);
    let spinning = false, lx = 0, ly = 0, mx = 0.4, my = 0.25, dist = 3.2;
    const onDown = (e) => { spinning = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); };
    const onMove = (e) => {
      if (!spinning) return;
      mx += (e.clientX - lx) * 0.01;
      my += (e.clientY - ly) * 0.01;
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = () => { spinning = false; };
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dist = Math.min(8, Math.max(1.4, dist + e.deltaY * 0.005));
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      cube.rotation.y = mx;
      cube.rotation.x = my;
      cam.position.z = dist;
      renderer.render(scene, cam);
    };
    loop();
    threeCtl = {
      dispose: function () {
        cancelAnimationFrame(raf);
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("wheel", onWheel);
        renderer.dispose();
        el.innerHTML = "";
      },
    };
    };
    if (window.THREE) {
      run(window.THREE);
      return;
    }
    import("https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js")
      .then(function (mod) {
        window.THREE = mod;
        run(mod);
      })
      .catch(function () {
        el.innerHTML = '<div class="tv-nosignal"><span>Three.js 예정</span></div>';
      });
  }

  function renderZoom() {
    const p = getProject(currentId);
    if (!p) return closeZoom();
    const vs = visualState(p);
    const u = currentUpdate(p);
    const files = u && visibleUpdate(p, u) ? u.files || [] : [];
    if (currentFile >= files.length) currentFile = 0;
    const file = files[currentFile];

    const big = $("#big-tv");
    big.className = "tv tv-big size-2x2 state-" + vs.key;
    let kind = vs.key === "nosignal" ? "nosignal" : vs.key === "ended" ? "ended" : vs.key === "offline" ? "offline" : vs.key === "static" ? "static" : "image";
    const hideContent = (p.private && !unlocked) || (u && u.private && !unlocked);
    if (hideContent) kind = "nosignal";
    if (p.completed && !hideContent) kind = "ended";

    let src = file ? file.src : coverOf(p);
    if (hideContent) src = "";
    big.innerHTML = tvScreenHTML({
      kind: kind === "ended" ? "ended" : kind,
      src: hideContent ? "" : src,
      name: p.name,
      badge: hideContent ? "NO SIGNAL" : vs.badge,
      dot: !hideContent && vs.dot,
    });

    const screen = $(".tv-screen", big);
    if (!hideContent && file && file.type === "model3d") {
      const holder = document.createElement("div");
      holder.id = "viewer3d";
      screen.insertBefore(holder, screen.firstChild);
      const note = document.createElement("div");
      note.className = "model-note";
      note.textContent = "Three.js · 드래그로 회전 · 휠로 줌";
      screen.appendChild(note);
      requestAnimationFrame(() => mount3D(holder));
    } else {
      unmount3D();
      if (!hideContent && file && file.type === "video") {
        const layer = document.createElement("div");
        layer.className = "play-layer";
        layer.textContent = "▶";
        layer.addEventListener("click", (e) => {
          e.stopPropagation();
          if (layer.classList.contains("is-playing")) {
            layer.classList.remove("is-playing");
            layer.textContent = "▶";
            const vid = $("video", screen);
            if (vid) vid.pause();
          } else {
            layer.classList.add("is-playing");
            layer.textContent = "";
            if (file.src && /\.(mp4|webm|ogg)$/i.test(file.src) || (file.src || "").indexOf("video") === 5) {
              let vid = $("video", screen);
              if (!vid && (file.src || "").slice(0, 10) === "data:video") {
                vid = document.createElement("video");
                vid.src = file.src;
                vid.controls = true;
                vid.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
                screen.insertBefore(vid, screen.firstChild);
                vid.play();
              }
            }
          }
        });
        screen.appendChild(layer);
      }
    }

    const meta = $("#zoom-meta");
    if (hideContent) {
      meta.innerHTML = '<p class="zm-sub">NO SIGNAL</p>';
    } else if (u) {
      const ch = (p.channels || []).find((c) => c.id === u.channelId);
      meta.innerHTML =
        "<h3>" + esc(u.mood || "") + " " + esc(u.title || "제목 없음") + "</h3>" +
        '<div class="zm-sub">' + esc(u.date) + (ch ? " · " + esc(ch.name) : "") + "</div>" +
        (u.description ? '<p class="zm-desc">' + esc(u.description) + "</p>" : "") +
        (u.nextTodo || p.nextTodo ? '<p class="zm-todo">다음 · ' + esc(u.nextTodo || p.nextTodo) + "</p>" : "");
    } else {
      meta.innerHTML = '<p class="zm-sub">아직 방송이 없어. ON AIR로 첫 송출을 해볼까?</p>';
    }

    const tabs = $("#channel-tabs");
    tabs.innerHTML = (p.channels || [])
      .map((c) => '<button type="button" class="ch-tab' + (c.id === currentCh ? " is-on" : "") + '" data-ch="' + esc(c.id) + '">' + esc(c.name) + "</button>")
      .join("") +
      '<button type="button" class="ch-tab add" id="btn-add-ch">+ 새 채널</button>';

    const row = $("#vhs-row");
    const tapes = channelUpdates(p, currentCh);
    row.innerHTML = tapes
      .map((t) => {
        const hidden = t.private && !unlocked;
        return (
          '<button type="button" class="vhs' + (t.id === currentUp ? " is-on" : "") + (hidden ? " is-priv" : "") + '" data-up="' + esc(t.id) + '">' +
          '<span class="vhs-label"><em>' + esc(t.date.slice(5)) + "</em><b>" + esc(hidden ? "NO SIGNAL" : (t.title || "무제")) + "</b></span></button>"
        );
      })
      .join("") || '<p class="zm-sub">이 채널엔 아직 테이프가 없어.</p>';

    const slots = $("#file-slots");
    if (hideContent || !files.length) {
      slots.innerHTML = "";
    } else {
      slots.innerHTML = files
        .map((f, i) => {
          if (f.type === "image" && f.src) {
            return '<button type="button" class="fslot' + (i === currentFile ? " is-on" : "") + '" data-fi="' + i + '"><img alt="" src="' + esc(f.src) + '" /></button>';
          }
          if (f.type === "image") {
            return '<button type="button" class="fslot' + (i === currentFile ? " is-on" : "") + '" data-fi="' + i + '"></button>';
          }
          return '<button type="button" class="fslot ' + esc(f.type) + (i === currentFile ? " is-on" : "") + '" data-fi="' + i + '">' + (f.type === "model3d" ? "3D" : "영상") + "</button>";
        })
        .join("");
    }

    $("#btn-prev-file").disabled = files.length < 2;
    $("#btn-next-file").disabled = files.length < 2;
    $("#btn-complete").textContent = p.completed ? "다시 켜기" : "방송 종료";
    $("#btn-toggle-private").textContent = p.private ? "공개로 전환" : "비공개 전환";
    renderSideTree();
  }

  function openZoom(id, channelId) {
    const p = getProject(id);
    if (!p) return;
    currentId = id;
    focusedId = id;
    expanded["proj:" + id] = true;
    expanded["cat:__all"] = true;
    if (p.category) expanded["cat:" + p.category] = true;
    const latest = lastUpdate(p);
    currentCh = latest ? latest.channelId : (p.channels[0] && p.channels[0].id);
    currentUp = latest ? latest.id : null;
    currentFile = 0;
    if (channelId && (p.channels || []).some(function (c) { return c.id === channelId; })) {
      currentCh = channelId;
      const tapes = channelUpdates(p, currentCh);
      currentUp = tapes[0] ? tapes[0].id : null;
    }
    $("#zoom-view").hidden = false;
    $("#proj-menu").hidden = true;
    document.body.classList.remove("on-wall");
    closeRecapKeep();
    setRail("archive");
    renderZoom();
    renderSideTree();
  }

  function closeZoom() {
    unmount3D();
    $("#zoom-view").hidden = true;
    $("#proj-menu").hidden = true;
    currentId = null;
    document.body.classList.add("on-wall");
    renderWall();
    renderSideTree();
  }

  /* —— recap —— */
  function rangeFor(period) {
    const t = today();
    if (period === "month") {
      return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    }
    const day = t.getDay();
    const monday = day === 0 ? -6 : 1 - day;
    const start = new Date(t);
    start.setDate(t.getDate() + monday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return [start, end];
  }

  function inRange(dateStr, range) {
    const d = parseDay(dateStr);
    return d >= range[0] && d <= range[1];
  }

  function collectRecap(period) {
    const range = rangeFor(period);
    const items = [];
    projects().forEach((p) => {
      (p.updates || []).forEach((u) => {
        if (!inRange(u.date, range)) return;
        if (u.private && !unlocked) return;
        if (p.private && !unlocked) return;
        const ch = (p.channels || []).find((c) => c.id === u.channelId);
        items.push({
          project: p,
          update: u,
          channelName: ch ? ch.name : "본방송",
          src: (u.files && u.files[0] && u.files[0].src) || coverOf(p),
        });
      });
    });
    items.sort((a, b) => (a.update.date < b.update.date ? 1 : -1));
    return { range: range, items: items };
  }

  function renderRecap() {
    const rec = collectRecap(recapPeriod);
    const page = $("#recap-page");
    const title = recapPeriod === "month"
      ? today().getFullYear() + "년 " + (today().getMonth() + 1) + "월"
      : fmtDay(rec.range[0]).slice(5) + " – " + fmtDay(rec.range[1]).slice(5);
    const activeNow = projects().filter((p) => {
      const k = visualState(p).key;
      return k === "onair" || k === "on";
    }).length;
    const completed = projects().filter((p) => p.completed).length;
    const tvSet = new Set(rec.items.map((i) => i.project.id));

    const points = rec.items.slice().reverse();
    const w = 680, h = 180, pad = 28;
    let chart = '<svg class="mood-chart" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">';
    chart += '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - 10) + '" y2="' + (h - pad) + '" stroke="#2a2a2a"/>';
    if (points.length) {
      const coords = points.map((it, i) => {
        const x = pad + (points.length === 1 ? (w - pad - 10) / 2 : (i / (points.length - 1)) * (w - pad - 20));
        const val = MOOD_VAL[it.update.mood] || 3;
        const y = h - pad - ((val - 1) / 4) * (h - pad * 2);
        return { x: x, y: y, mood: it.update.mood || "😐" };
      });
      const d = coords.map((c, i) => (i ? "L" : "M") + c.x.toFixed(1) + " " + c.y.toFixed(1)).join(" ");
      chart += '<path d="' + d + '" fill="none" stroke="#b0b0b0" stroke-width="2"/>';
      coords.forEach((c) => {
        chart += '<circle cx="' + c.x + '" cy="' + c.y + '" r="4" fill="#1a1a1a" stroke="#b0b0b0"/>';
        chart += '<text x="' + c.x + '" y="' + (c.y - 10) + '" text-anchor="middle" font-size="12">' + c.mood + "</text>";
      });
    }
    chart += "</svg>";
    if (!points.length) chart = '<p class="zm-sub">이 기간엔 기분 기록이 없어.</p>';

    const byCh = {};
    rec.items.forEach((it) => {
      const name = it.channelName;
      byCh[name] = byCh[name] || [];
      if (it.update.mood) byCh[name].push(it.update.mood);
    });
    const chRows = Object.keys(byCh)
      .map((name) => {
        const counts = {};
        byCh[name].forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
        const emojis = Object.keys(counts)
          .sort((a, b) => counts[b] - counts[a])
          .map((m) => m + " ×" + counts[m])
          .join("   ");
        return '<div class="ch-mood-row"><strong>' + esc(name) + '</strong><div class="emojis">' + emojis + "</div></div>";
      })
      .join("") || '<p class="zm-sub">아직 채널별 기록이 없어.</p>';

    const thumbs = rec.items
      .map((it) => {
        const img = it.src
          ? '<img alt="" src="' + esc(it.src) + '" />'
          : '<div class="recap-ph"></div>';
        return "<figure>" + img + "<figcaption>" + esc(it.update.date.slice(5)) + " · " + esc(it.update.title) + "</figcaption></figure>";
      })
      .join("") || '<p class="zm-sub">이 기간의 방송이 없어.</p>';

    const todos = [];
    const seen = new Set();
    rec.items.forEach((it) => {
      const t = it.update.nextTodo || it.project.nextTodo;
      if (!t || seen.has(it.project.id + t)) return;
      seen.add(it.project.id + t);
      todos.push({ name: it.project.name, text: t });
    });
    projects().forEach((p) => {
      if (!p.nextTodo || seen.has(p.id + p.nextTodo)) return;
      if (tvSet.has(p.id) || daysBetween(lastDate(p)) <= 14) {
        seen.add(p.id + p.nextTodo);
        todos.push({ name: p.name, text: p.nextTodo });
      }
    });

    page.innerHTML =
      '<p class="recap-kicker">RECAP</p>' +
      "<h1>" + esc(title) + " 특집</h1>" +
      '<div class="recap-cards">' +
      '<div class="recap-card"><div class="num">' + rec.items.length + '</div><div class="lbl">이번 ' + (recapPeriod === "month" ? "달" : "주") + " 방송</div></div>" +
      '<div class="recap-card"><div class="num">' + activeNow + '</div><div class="lbl">지금 켜진 TV</div></div>' +
      '<div class="recap-card"><div class="num">' + completed + '</div><div class="lbl">완결한 프로젝트</div></div>' +
      "</div>" +
      '<section class="recap-sec"><h2>기분 시청률</h2>' + chart + "</section>" +
      '<section class="recap-sec"><h2>채널별 기분</h2><div class="ch-moods">' + chRows + "</div></section>" +
      '<section class="recap-sec"><h2>그 기간의 방송</h2><div class="recap-thumbs">' + thumbs + "</div></section>" +
      '<section class="recap-sec"><h2>이어서 할 일</h2><ul class="todo-list">' +
      (todos.map((t) => "<li><span class=\"t-proj\">" + esc(t.name) + "</span>" + esc(t.text) + "</li>").join("") || "<li>적힌 다음 할 일이 없어.</li>") +
      "</ul></section>";
  }

  function closeRecapKeep() {
    $("#recap-view").hidden = true;
  }

  function openRecap() {
    if (currentId) closeZoom();
    $("#recap-view").hidden = false;
    document.body.classList.remove("on-wall");
    setRail("recap");
    renderRecap();
  }

  function closeRecap() {
    $("#recap-view").hidden = true;
    document.body.classList.add("on-wall");
    setRail("archive");
    renderSideTree();
  }

  /* —— on air —— */
  function fileKind(file) {
    if (file.type.indexOf("video") === 0) return "video";
    if (/\.(glb|gltf|obj)$/i.test(file.name)) return "model3d";
    return "image";
  }

  function readFiles(list) {
    Array.from(list).forEach((file) => {
      const kind = fileKind(file);
      const reader = new FileReader();
      reader.onload = () => {
        oaFiles.push({ type: kind, src: reader.result, name: file.name });
        renderOaPreviews();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderOaPreviews() {
    const box = $("#oa-previews");
    box.innerHTML = oaFiles
      .map((f) => {
        if (f.type === "image") return '<img alt="" src="' + esc(f.src) + '" />';
        return '<div class="oa-file">' + esc(f.type === "video" ? "영상" : "3D") + "</div>";
      })
      .join("");
  }

  function openOnAir() {
    const p = getProject(currentId);
    if (!p) return;
    oaFiles = [];
    oaMood = "😊";
    $("#oa-title").value = "";
    $("#oa-desc").value = "";
    $("#oa-todo").value = p.nextTodo || "";
    $("#oa-private").checked = false;
    $("#oa-channel").innerHTML = (p.channels || [])
      .map((c) => '<option value="' + esc(c.id) + '"' + (c.id === currentCh ? " selected" : "") + ">" + esc(c.name) + "</option>")
      .join("");
    $("#oa-moods").innerHTML = MOODS.map((m) =>
      '<button type="button" data-mood="' + m + '"' + (m === oaMood ? ' class="is-on"' : "") + ">" + m + "</button>"
    ).join("");
    renderOaPreviews();
    $("#onair-view").hidden = false;
  }

  function closeOnAir() {
    $("#onair-view").hidden = true;
  }

  function playBroadcast(done) {
    const fx = $("#broadcast-fx");
    fx.hidden = false;
    fx.className = "broadcast-fx show-light";
    setTimeout(() => {
      fx.className = "broadcast-fx show-static";
      setTimeout(() => {
        fx.hidden = true;
        fx.className = "broadcast-fx";
        if (done) done();
      }, 380);
    }, 1000);
  }

  /* —— password —— */
  function ensureEdit(fn) {
    if (unlocked) {
      fn();
      return;
    }
    pendingEdit = fn;
    $("#pass-err").hidden = true;
    $("#pass-input").value = "";
    $("#pass-view").hidden = false;
    setTimeout(() => $("#pass-input").focus(), 30);
  }

  function closePass() {
    $("#pass-view").hidden = true;
    pendingEdit = null;
  }

  /* —— search —— */
  function searchItems(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    projects().forEach((p) => {
      const vs = visualState(p);
      const blob = (p.name + " " + (p.category || "") + " " + (p.nextTodo || "") + " " +
        (p.updates || []).map((u) => u.title + " " + (u.description || "")).join(" ")).toLowerCase();
      if (blob.indexOf(q) !== -1) {
        out.push({ p: p, vs: vs });
      }
    });
    return out;
  }

  function renderSearch() {
    const q = $("#search").value;
    const box = $("#search-results");
    if (!q.trim()) {
      box.hidden = true;
      box.innerHTML = "";
      searchIndex = -1;
      return;
    }
    const items = searchItems(q);
    if (!items.length) {
      box.hidden = false;
      box.innerHTML = '<li class="search-empty">찾는 TV가 없어...</li>';
      return;
    }
    box.hidden = false;
    box.innerHTML = items
      .map((it, i) => {
        const src = coverOf(it.p);
        const img = src && !(it.p.private && !unlocked)
          ? '<img alt="" src="' + esc(src) + '" />'
          : '<span class="sh-ph"></span>';
        return (
          '<li><button type="button" class="search-hit' + (i === searchIndex ? " is-active" : "") + '" data-sid="' + esc(it.p.id) + '">' +
          img + "<div><div class=\"sh-name\">" + esc(it.p.name) + "</div>" +
          '<div class="sh-status">' + esc(it.vs.label) + " · " + esc(it.p.category || "") + "</div></div></button></li>"
        );
      })
      .join("");
  }

  function goToSearch(id) {
    $("#search-results").hidden = true;
    closeRecap();
    if (currentId) closeZoom();
    const p = getProject(id);
    if (!p) return;
    document.body.classList.add("on-wall");
    focusedId = id;
    renderWall();
    renderSideTree();
    flyToProject(p);
  }

  /* —— trash / shelf —— */
  function renderTrash() {
    const body = $("#trash-body");
    const items = state.trash || [];
    if (!items.length) {
      body.innerHTML = '<p class="trash-empty">창고가 비어 있어.</p>';
      return;
    }
    body.innerHTML = items
      .map((p) => {
        const left = 30 - daysBetween(p.deletedAt);
        const src = coverOf(p);
        return (
          '<div class="trash-item" data-tid="' + esc(p.id) + '">' +
          (src ? '<img alt="" src="' + esc(src) + '" />' : '<span class="ti-ph"></span>') +
          "<div><div class=\"ti-name\">" + esc(p.name) + "</div>" +
          '<div class="ti-days">' + left + "일 뒤 사라짐</div></div>" +
          '<div class="ti-acts"><button type="button" class="hud-btn" data-restore="' + esc(p.id) + '">되돌리기</button>' +
          '<button type="button" class="hud-btn" data-purge="' + esc(p.id) + '">삭제</button></div></div>'
        );
      })
      .join("");
  }

  function renderShelf() {
    const p = getProject(currentId);
    const body = $("#shelf-body");
    if (!p) return;
    body.innerHTML = (p.channels || [])
      .map((ch) => {
        const tapes = channelUpdates(p, ch.id)
          .map((t) => {
            const hidden = t.private && !unlocked;
            return (
              '<button type="button" class="vhs' + (t.id === currentUp ? " is-on" : "") + (hidden ? " is-priv" : "") + '" data-up="' + esc(t.id) + '">' +
              '<span class="vhs-label"><em>' + esc(t.date.slice(5)) + "</em><b>" + esc(hidden ? "NO SIGNAL" : (t.title || "무제")) + "</b></span></button>"
            );
          })
          .join("");
        return '<div class="shelf-group"><h3>' + esc(ch.name) + "</h3><div class=\"shelf-tapes\">" + (tapes || "<span class=\"zm-sub\">빈 칸</span>") + "</div></div>";
      })
      .join("");
  }

  /* —— mutations —— */
  function createProject() {
    if (previewEmpty) {
      previewEmpty = false;
    }
    applySizes();
    const pos = findEmpty(1, 1);
    const p = {
      id: uid("p"),
      name: "더미 프로젝트",
      category: state.categories[0] || "미분류",
      completed: false,
      private: false,
      nextTodo: "",
      x: pos.x,
      y: pos.y,
      channels: [{ id: uid("ch"), name: "본방송" }],
      updates: [],
    };
    state.projects.push(p);
    saveState();
    renderWall();
    renderCats();
    flyToProject(p);
    openZoom(p.id);
  }

  function submitOnAir(e) {
    e.preventDefault();
    const p = getProject(currentId);
    if (!p) return;
    const title = $("#oa-title").value.trim();
    if (!title && !oaFiles.length) {
      $("#oa-title").focus();
      return;
    }
    const ch = $("#oa-channel").value || (p.channels[0] && p.channels[0].id);
    const todo = $("#oa-todo").value.trim();
    const update = {
      id: uid("u"),
      channelId: ch,
      date: fmtDay(today()),
      title: title || (oaFiles[0] && oaFiles[0].name) || "새 방송",
      description: $("#oa-desc").value.trim(),
      nextTodo: todo,
      mood: oaMood,
      private: $("#oa-private").checked,
      files: oaFiles.slice(),
    };
    p.updates = p.updates || [];
    p.updates.push(update);
    if (todo) p.nextTodo = todo;
    growProject(p);
    saveState();
    currentCh = ch;
    currentUp = update.id;
    currentFile = 0;
    closeOnAir();
    playBroadcast(() => {
      renderZoom();
      renderWall();
    });
  }

  /* —— events —— */
  function bindEvents() {
    const vp = $("#viewport");

    vp.addEventListener("wheel", (e) => {
      if (!$("#zoom-view").hidden || !$("#recap-view").hidden) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, camera.scale * factor));
        const world = worldFromEvent(e);
        const k = next / camera.scale;
        camera.cx = world.x - (world.x - camera.cx) * k;
        camera.cy = world.y - (world.y - camera.cy) * k;
        camera.scale = next;
        applyCamera();
      } else {
        camera.cx += e.deltaX / camera.scale;
        camera.cy += e.deltaY / camera.scale;
        applyCamera();
      }
    }, { passive: false });

    vp.addEventListener("pointerdown", (e) => {
      if (!$("#zoom-view").hidden) return;
      const tv = e.target.closest(".tv");
      if (tv && tv.dataset.id) {
        const p = getProject(tv.dataset.id);
        if (!p) return;
        const world = worldFromEvent(e);
        const loc = cellToLocal(p.x, p.y);
        drag = {
          id: p.id,
          startX: e.clientX,
          startY: e.clientY,
          ox: world.x - loc.x,
          oy: world.y - loc.y,
          moved: false,
          pointer: e.pointerId,
        };
        return;
      }
      pan = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
      vp.classList.add("is-panning");
      vp.setPointerCapture(e.pointerId);
    });

    vp.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.moved && dx * dx + dy * dy > 36) {
          if (!unlocked) {
            const id = drag.id;
            drag = null;
            ensureEdit(() => {});
            return;
          }
          drag.moved = true;
          skipClick = true;
          const el = $('#wall .tv[data-id="' + drag.id + '"]');
          if (el) el.classList.add("is-dragging");
        }
        if (drag && drag.moved) {
          const world = worldFromEvent(e);
          const el = $('#wall .tv[data-id="' + drag.id + '"]');
          if (el) {
            el.style.left = world.x - drag.ox + "px";
            el.style.top = world.y - drag.oy + "px";
          }
        }
        return;
      }
      if (pan) {
        camera.cx -= (e.clientX - pan.x) / camera.scale;
        camera.cy -= (e.clientY - pan.y) / camera.scale;
        pan.x = e.clientX;
        pan.y = e.clientY;
        applyCamera();
      }
    });

    function endPointer(e) {
      vp.classList.remove("is-panning");
      if (drag) {
        const info = drag;
        drag = null;
        if (info.moved) {
          const p = getProject(info.id);
          const el = $('#wall .tv[data-id="' + info.id + '"]');
          if (el) el.classList.remove("is-dragging");
          if (p) {
            const world = worldFromEvent(e);
            const tlx = world.x - info.ox;
            const tly = world.y - info.oy;
            const nx = Math.round(tlx / CELL_W + GRID_MIN);
            const ny = Math.round(tly / CELL_H + GRID_MIN);
            const dirX = nx - p.x;
            const dirY = ny - p.y;
            const dir = Math.abs(dirX) >= Math.abs(dirY) ? (dirX < 0 ? "left" : "right") : (dirY < 0 ? "up" : "down");
            p.x = nx;
            p.y = ny;
            resolveCollisions(p, dir, 0);
            saveState();
            renderWall();
          }
        }
        setTimeout(() => { skipClick = false; }, 40);
      }
      pan = null;
    }
    vp.addEventListener("pointerup", endPointer);
    vp.addEventListener("pointercancel", endPointer);

    vp.addEventListener("click", (e) => {
      if (skipClick) return;
      const tv = e.target.closest(".tv");
      if (!tv) return;
      if (tv.dataset.special === "plus") {
        ensureEdit(createProject);
        return;
      }
      if (tv.dataset.special === "recap") {
        openRecap();
        return;
      }
      if (tv.dataset.id) openZoom(tv.dataset.id);
    });

    vp.addEventListener("pointermove", (e) => {
      if (drag && drag.moved) {
        $("#tooltip").hidden = true;
        return;
      }
      const tv = e.target.closest(".tv[data-id]");
      const tip = $("#tooltip");
      if (!tv) {
        tip.hidden = true;
        return;
      }
      const p = getProject(tv.dataset.id);
      if (!p) return;
      const vs = visualState(p);
      tip.hidden = false;
      tip.innerHTML =
        "<strong>" + esc(p.name) + "</strong>" +
        '<div class="tt-line">' + esc(vs.label) + " · " + daysLabel(vs.days) + "</div>" +
        '<div class="tt-line">' + esc(p.category || "미분류") + "</div>" +
        (p.nextTodo ? '<div class="tt-line">다음 · ' + esc(p.nextTodo) + "</div>" : "");
      tip.style.left = Math.min(window.innerWidth - 260, e.clientX + 14) + "px";
      tip.style.top = Math.min(window.innerHeight - 120, e.clientY + 16) + "px";
    });
    vp.addEventListener("pointerleave", () => { $("#tooltip").hidden = true; });

    $("#btn-zoom-in").addEventListener("click", () => {
      camera.scale = Math.min(SCALE_MAX, camera.scale * 1.18);
      applyCamera();
    });
    $("#btn-zoom-out").addEventListener("click", () => {
      camera.scale = Math.max(SCALE_MIN, camera.scale / 1.18);
      applyCamera();
    });
    $("#btn-home").addEventListener("click", () => centerOnLatest(true));

    $("#minimap").addEventListener("click", (e) => {
      const map = $("#minimap")._map;
      if (!map) return;
      const r = $("#minimap").getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      camera.cx = (x - map.ox) / map.scale;
      camera.cy = (y - map.oy) / map.scale;
      applyCamera();
    });

    $("#btn-add-cat").addEventListener("click", () => {
      ensureEdit(() => {
        $("#cat-name").value = "";
        $("#cat-view").hidden = false;
        setTimeout(() => $("#cat-name").focus(), 30);
      });
    });
    $("#btn-edit-cats").addEventListener("click", () => {
      ensureEdit(() => {
        catsEditing = !catsEditing;
        document.body.classList.toggle("cats-editing", catsEditing);
        $("#btn-edit-cats").classList.toggle("is-on", catsEditing);
      });
    });
    $("#cat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#cat-name").value.trim();
      if (name && state.categories.indexOf(name) === -1) state.categories.push(name);
      saveState();
      $("#cat-view").hidden = true;
      renderCats();
    });

    $("#search").addEventListener("input", renderSearch);
    $("#search").addEventListener("keydown", (e) => {
      const hits = $$(".search-hit");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        searchIndex = Math.min(hits.length - 1, searchIndex + 1);
        renderSearch();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        searchIndex = Math.max(0, searchIndex - 1);
        renderSearch();
      } else if (e.key === "Enter") {
        const target = hits[searchIndex] || hits[0];
        if (target) goToSearch(target.getAttribute("data-sid"));
      } else if (e.key === "Escape") {
        $("#search-results").hidden = true;
        $("#search").blur();
      }
    });
    $("#search-results").addEventListener("click", (e) => {
      const hit = e.target.closest(".search-hit");
      if (hit) goToSearch(hit.getAttribute("data-sid"));
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-box")) $("#search-results").hidden = true;
      if (!e.target.closest("#btn-menu") && !e.target.closest("#menu-pop")) $("#menu-pop").hidden = true;
      if (!e.target.closest("#btn-more-proj") && !e.target.closest("#proj-menu")) $("#proj-menu").hidden = true;
      if (!e.target.closest(".ws-title")) {
        const menu = $("#ws-cat-menu");
        if (menu) menu.hidden = true;
      }
    });

    $("#btn-menu").addEventListener("click", (e) => {
      e.stopPropagation();
      $("#menu-pop").hidden = !$("#menu-pop").hidden;
    });
    $("#btn-reset").addEventListener("click", () => {
      ensureEdit(() => {
        previewEmpty = false;
        state = clone(window.TV_SEED);
        saveState();
        pickRerun();
        $("#menu-pop").hidden = true;
        closeRecap();
        if (currentId) closeZoom();
        renderCats();
        renderWall();
        centerOnLatest(true);
      });
    });
    $("#btn-empty-preview").addEventListener("click", () => {
      previewEmpty = true;
      $("#menu-pop").hidden = true;
      closeRecap();
      if (currentId) closeZoom();
      renderWall();
      centerOnLatest(false);
    });

    $("#btn-trash").addEventListener("click", () => {
      renderTrash();
      $("#trash-view").hidden = false;
      setRail("trash");
    });
    $("#trash-body").addEventListener("click", (e) => {
      const rest = e.target.closest("[data-restore]");
      const purge = e.target.closest("[data-purge]");
      if (rest) {
        ensureEdit(() => {
          const id = rest.getAttribute("data-restore");
          const item = state.trash.find((t) => t.id === id);
          if (!item) return;
          state.trash = state.trash.filter((t) => t.id !== id);
          applySizes();
          const s = sizeFor((item.updates || []).length);
          const pos = findEmpty(s.w, s.h);
          item.x = pos.x;
          item.y = pos.y;
          delete item.deletedAt;
          state.projects.push(item);
          saveState();
          renderTrash();
          renderWall();
        });
      }
      if (purge) {
        ensureEdit(() => {
          state.trash = state.trash.filter((t) => t.id !== purge.getAttribute("data-purge"));
          saveState();
          renderTrash();
        });
      }
    });

    $("#btn-back-wall").addEventListener("click", closeZoom);
    $("#btn-recap-back").addEventListener("click", closeRecap);
    $("#btn-onair").addEventListener("click", () => ensureEdit(openOnAir));
    $("#btn-complete").addEventListener("click", () => {
      ensureEdit(() => {
        const p = getProject(currentId);
        if (!p) return;
        p.completed = !p.completed;
        saveState();
        renderZoom();
      });
    });
    $("#btn-more-proj").addEventListener("click", (e) => {
      e.stopPropagation();
      $("#proj-menu").hidden = !$("#proj-menu").hidden;
    });
    $("#btn-rename").addEventListener("click", () => {
      ensureEdit(() => {
        const p = getProject(currentId);
        if (!p) return;
        const name = window.prompt("프로젝트 이름", p.name);
        if (name != null && name.trim()) {
          p.name = name.trim();
          saveState();
          renderZoom();
        }
        $("#proj-menu").hidden = true;
      });
    });
    $("#btn-toggle-private").addEventListener("click", () => {
      ensureEdit(() => {
        const p = getProject(currentId);
        if (!p) return;
        p.private = !p.private;
        saveState();
        renderZoom();
        $("#proj-menu").hidden = true;
      });
    });
    $("#btn-delete-proj").addEventListener("click", () => {
      ensureEdit(() => {
        const p = getProject(currentId);
        if (!p) return;
        state.projects = state.projects.filter((x) => x.id !== p.id);
        const copy = clone(p);
        copy.deletedAt = fmtDay(today());
        state.trash.push(copy);
        saveState();
        $("#proj-menu").hidden = true;
        closeZoom();
      });
    });

    $("#channel-tabs").addEventListener("click", (e) => {
      if (e.target.id === "btn-add-ch") {
        ensureEdit(() => {
          const p = getProject(currentId);
          if (!p) return;
          const name = window.prompt("채널 이름", "");
          if (!name || !name.trim()) return;
          const ch = { id: uid("ch"), name: name.trim() };
          p.channels.push(ch);
          currentCh = ch.id;
          saveState();
          renderZoom();
        });
        return;
      }
      const tab = e.target.closest(".ch-tab[data-ch]");
      if (!tab) return;
      currentCh = tab.getAttribute("data-ch");
      const p = getProject(currentId);
      const first = channelUpdates(p, currentCh)[0];
      currentUp = first ? first.id : null;
      currentFile = 0;
      renderZoom();
    });
    $("#vhs-row").addEventListener("click", (e) => {
      const tape = e.target.closest(".vhs[data-up]");
      if (!tape) return;
      currentUp = tape.getAttribute("data-up");
      currentFile = 0;
      const p = getProject(currentId);
      const u = currentUpdate(p);
      if (u) currentCh = u.channelId;
      renderZoom();
    });
    $("#file-slots").addEventListener("click", (e) => {
      const slot = e.target.closest("[data-fi]");
      if (!slot) return;
      currentFile = Number(slot.getAttribute("data-fi"));
      renderZoom();
    });
    $("#btn-prev-file").addEventListener("click", () => {
      const p = getProject(currentId);
      const u = currentUpdate(p);
      const n = u && u.files ? u.files.length : 0;
      if (n < 2) return;
      currentFile = (currentFile + n - 1) % n;
      renderZoom();
    });
    $("#btn-next-file").addEventListener("click", () => {
      const p = getProject(currentId);
      const u = currentUpdate(p);
      const n = u && u.files ? u.files.length : 0;
      if (n < 2) return;
      currentFile = (currentFile + 1) % n;
      renderZoom();
    });
    $("#btn-shelf").addEventListener("click", () => {
      renderShelf();
      $("#shelf-view").hidden = false;
    });
    $("#shelf-body").addEventListener("click", (e) => {
      const tape = e.target.closest(".vhs[data-up]");
      if (!tape) return;
      currentUp = tape.getAttribute("data-up");
      const p = getProject(currentId);
      const u = currentUpdate(p);
      if (u) currentCh = u.channelId;
      currentFile = 0;
      $("#shelf-view").hidden = true;
      renderZoom();
    });

    $("#onair-form").addEventListener("submit", submitOnAir);
    $("#oa-moods").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mood]");
      if (!b) return;
      oaMood = b.getAttribute("data-mood");
      $$("#oa-moods button").forEach((x) => x.classList.toggle("is-on", x === b));
    });
    const drop = $("#oa-drop");
    drop.addEventListener("click", () => $("#oa-files").click());
    $("#oa-files").addEventListener("change", (e) => readFiles(e.target.files));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-drag"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-drag"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-drag");
      readFiles(e.dataTransfer.files);
    });

    $$("[data-close]").forEach((el) => {
      el.addEventListener("click", () => {
        const which = el.getAttribute("data-close");
        if (which === "onair") closeOnAir();
        if (which === "pass") closePass();
        if (which === "shelf") $("#shelf-view").hidden = true;
        if (which === "trash") { $("#trash-view").hidden = true; syncRail(); }
        if (which === "cat") $("#cat-view").hidden = true;
      });
    });

    $("#pass-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if ($("#pass-input").value === PASSWORD) {
        unlocked = true;
        localStorage.setItem(AUTH_KEY, "1");
        $("#pass-view").hidden = true;
        const fn = pendingEdit;
        pendingEdit = null;
        renderWall();
        if (currentId) renderZoom();
        if (fn) fn();
      } else {
        $("#pass-err").hidden = false;
      }
    });

    $("#recap-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-period]");
      if (!b) return;
      recapPeriod = b.getAttribute("data-period");
      $$("#recap-tabs button").forEach((x) => x.classList.toggle("is-on", x === b));
      renderRecap();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#pass-view").hidden) return closePass();
      if (!$("#onair-view").hidden) return closeOnAir();
      if (!$("#shelf-view").hidden) return ($("#shelf-view").hidden = true);
      if (!$("#trash-view").hidden) { $("#trash-view").hidden = true; syncRail(); return; }
      if (!$("#cat-view").hidden) return ($("#cat-view").hidden = true);
      if (!$("#recap-view").hidden) return closeRecap();
      if (!$("#zoom-view").hidden) return closeZoom();
    });

    function bindSidebar() {
      $$(".rail-nav [data-rail]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const name = btn.getAttribute("data-rail");
          if (name === "home") {
            previewEmpty = false;
            closeRecap();
            if (currentId) closeZoom();
            $("#trash-view").hidden = true;
            setActiveCat("__all");
            centerOnLatest(true);
            setRail("home");
          } else if (name === "archive") {
            previewEmpty = false;
            closeRecap();
            $("#trash-view").hidden = true;
            if (currentId) { /* stay zoomed */ }
            else document.body.classList.add("on-wall");
            applySidebarCollapsed(false);
            setRail("archive");
            renderSideTree();
          } else if (name === "recap") {
            $("#trash-view").hidden = true;
            openRecap();
          } else if (name === "trash") {
            renderTrash();
            $("#trash-view").hidden = false;
            setRail("trash");
          }
        });
      });
      const logo = $("#btn-rail-logo");
      if (logo) logo.addEventListener("click", function () {
        previewEmpty = false;
        closeRecap();
        if (currentId) closeZoom();
        $("#trash-view").hidden = true;
        setActiveCat("__all");
        centerOnLatest(true);
        setRail("home");
      });
      $("#btn-side-new").addEventListener("click", function () { ensureEdit(createProject); });
      $("#btn-side-collapse").addEventListener("click", function () { applySidebarCollapsed(true); });
      $("#btn-side-expand").addEventListener("click", function () { applySidebarCollapsed(false); });
      $("#side-panel").addEventListener("transitionend", function (e) {
        if (e.propertyName === "width") applyCamera();
      });
      $$("[data-side-mode]").forEach(function (b) {
        b.addEventListener("click", function () { setSideMode(b.getAttribute("data-side-mode")); });
      });
      $("#side-search").addEventListener("input", function () {
        sideQuery = $("#side-search").value;
        renderSideTree();
      });
      $("#btn-ws-cat").addEventListener("click", function (e) {
        e.stopPropagation();
        const menu = $("#ws-cat-menu");
        menu.hidden = !menu.hidden;
        if (!menu.hidden) renderWsCatMenu();
      });
      $("#ws-cat-menu").addEventListener("click", function (e) {
        const btn = e.target.closest("[data-cat]");
        if (!btn) return;
        setActiveCat(btn.getAttribute("data-cat"));
        $("#ws-cat-menu").hidden = true;
      });
      $("#side-tree").addEventListener("click", function (e) {
        const del = e.target.closest("[data-del]");
        if (del && catsEditing && del.getAttribute("data-del") !== "__all") {
          e.stopPropagation();
          const name = del.getAttribute("data-del");
          ensureEdit(function () {
            state.categories = state.categories.filter(function (c) { return c !== name; });
            if (activeCat === name) activeCat = "__all";
            saveState();
            renderCats();
            renderWall();
          });
          return;
        }
        const chev = e.target.closest("[data-toggle]");
        if (chev && (e.target === chev || e.target.closest(".tree-chevron"))) {
          e.preventDefault();
          e.stopPropagation();
          const key = chev.getAttribute("data-toggle");
          expanded[key] = !expanded[key];
          renderSideTree();
          return;
        }
        const ch = e.target.closest(".tree-row.channel[data-ch]");
        if (ch) {
          const p = getProject(ch.getAttribute("data-pid"));
          if (p) openZoom(p.id, ch.getAttribute("data-ch"));
          return;
        }
        const proj = e.target.closest(".tree-row.project[data-pid]");
        if (proj) {
          const id = proj.getAttribute("data-pid");
          const p = getProject(id);
          if (!p) return;
          const now = Date.now();
          if (projClickId === id && now - projClickAt < 450) {
            projClickId = "";
            openZoom(p.id);
            return;
          }
          projClickId = id;
          projClickAt = now;
          closeRecap();
          if (currentId) closeZoom();
          document.body.classList.add("on-wall");
          focusProject(p);
          return;
        }
        const folder = e.target.closest(".tree-row.folder");
        if (folder) {
          const cat = folder.getAttribute("data-cat");
          const key = folder.getAttribute("data-toggle");
          if (cat) {
            expanded[key] = true;
            setActiveCat(cat);
          } else if (key) {
            expanded[key] = !expanded[key];
            renderSideTree();
          }
        }
      });
      $("#side-tree").addEventListener("dblclick", function (e) {
        const proj = e.target.closest(".tree-row.project[data-pid]");
        if (!proj) return;
        const p = getProject(proj.getAttribute("data-pid"));
        if (p) openZoom(p.id);
      });
    }
    bindSidebar();

    window.addEventListener("resize", applyCamera);
  }

  function startAmbience() {
    setInterval(() => {
      if (!$("#zoom-view").hidden) return;
      const tvs = $$("#wall .tv[data-id]");
      if (!tvs.length) return;
      const el = tvs[Math.floor(Math.random() * tvs.length)];
      el.classList.add("is-glitch");
      setTimeout(() => el.classList.remove("is-glitch"), 280);
    }, 9000);
    setInterval(() => {
      $$(".tv-mood-face").forEach((n) => n.remove());
      if (!$("#zoom-view").hidden) return;
      const cands = projects().filter((p) => !(p.private && !unlocked) && latestMood(p));
      if (!cands.length) return;
      const p = cands[Math.floor(Math.random() * cands.length)];
      const el = $('#wall .tv[data-id="' + p.id + '"]');
      if (!el) return;
      const face = document.createElement("div");
      face.className = "tv-mood-face";
      face.textContent = latestMood(p);
      $(".tv-screen", el).appendChild(face);
      setTimeout(() => face.remove(), 3200);
    }, 15000);
  }

  window.TVArchive = {
    unlock: function () {
      unlocked = true;
      localStorage.setItem(AUTH_KEY, "1");
    },
    openProject: function (id) { openZoom(id); },
    openRecap: openRecap,
    openOnAir: function () {
      if (!currentId) openZoom("p-poster");
      unlocked = true;
      openOnAir();
    },
    showEmpty: function () {
      previewEmpty = true;
      closeRecap();
      if (currentId) closeZoom();
      renderWall();
      renderCats();
      centerOnLatest(false);
    },
    reset: function () {
      previewEmpty = false;
      state = clone(window.TV_SEED);
      saveState();
      pickRerun();
      renderCats();
      renderWall();
      centerOnLatest(false);
    },
    setSideMode: setSideMode,
    collapseSidebar: applySidebarCollapsed,
  };

  function init() {
    unlocked = localStorage.getItem(AUTH_KEY) === "1";
    try { sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === "1"; } catch (err) {}
    loadState();
    purgeTrash();
    pickRerun();
    document.body.classList.add("on-wall");
    if (sidebarCollapsed) $("#app").classList.add("sidebar-collapsed");
    bindEvents();
    renderCats();
    renderWall();
    centerOnLatest(false);
    startAmbience();
  }

  init();
})();
