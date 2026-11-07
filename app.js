/* TV Archive mockup */
(function () {
  "use strict";

  const CELL_W = 236;
  const CELL_H = 164;
  const GAP = 8;
  const GRID_MIN = -8;
  const SCALE_MIN = 0.38;
  const SCALE_MAX = 1.75;
  const DEFAULT_SCALE = 1;
  const AUTH_KEY = "tv-archive-unlocked";
  const DATA_KEY = "tv-archive-data-v4";
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
    return (p.updates || [])
      .map((u, i) => [u, i])
      .sort((a, b) => (a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : b[1] - a[1]))
      .map((x) => x[0]);
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

  // Free cell closest to what the user is looking at (camera centre), so the
  // new TV appears near the current view rather than at a far grid corner.
  function nearestFreeCell(w, h) {
    const occ = occupiedSet();
    if (!projects().length) return { x: 0, y: 0 };
    const cx = Math.floor(camera.cx / CELL_W + GRID_MIN);
    const cy = Math.floor(camera.cy / CELL_H + GRID_MIN);
    const fits = (x, y) => {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
        if (occ.has(x + dx + "," + (y + dy))) return false;
      return true;
    };
    for (let r = 0; r < 40; r++) {
      const ring = [];
      for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++)
        if (Math.max(Math.abs(x), Math.abs(y)) === r) ring.push({ x: cx + x, y: cy + y });
      ring.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) || a.y - b.y || a.x - b.x);
      const hit = ring.find(c => fits(c.x, c.y));
      if (hit) return hit;
    }
    return findEmpty(w, h);
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Growth and drag both use the same non-recursive nearest-free-cell planner.
  function resolveCollisions(moved) {
    commitMove(moved, simulateMove(moved, moved.x, moved.y));
  }

  function growProject(p) {
    const beforeW = p.w || 1;
    const beforeH = p.h || 1;
    applySizes();
    if (p.w !== beforeW || p.h !== beforeH) resolveCollisions(p, "right", 0);
  }

  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (err) { return false; }
  }

  function snapCellFromPixels(tlx, tly) {
    return {
      x: Math.round(tlx / CELL_W + GRID_MIN),
      y: Math.round(tly / CELL_H + GRID_MIN),
    };
  }

  function simulateMove(p, nx, ny) {
    applySizes();
    const moved = { id: p.id, x: nx, y: ny, w: p.w, h: p.h };
    const others = projects().filter(o => o.id !== p.id)
      .map(o => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h }));
    const all = others;
    // Only TVs directly covered by the destination may move. Never recursively
    // push stationary neighbors, or mutate the real layout while previewing.
    const displaced = all.filter(o => rectsOverlap(moved, o));
    const fixed = [moved].concat(all.filter(o => !rectsOverlap(moved, o)));
    const source = { x: p.x, y: p.y, w: p.w, h: p.h };
    const dx = Math.sign(p.x - nx), dy = Math.sign(p.y - ny);
    displaced.sort((a, b) => b.w * b.h - a.w * a.h || a.id.localeCompare(b.id));
    displaced.forEach(o => {
      const ox = o.x, oy = o.y;
      // Manhattan-distance shells guarantee minimal displacement. For equally
      // near cells prefer the vacated source, then the incoming side.
      for (let radius = 1; ; radius++) {
        const candidates = [];
        for (let x = -radius; x <= radius; x++) {
          const y = radius - Math.abs(x);
          candidates.push({ x: ox + x, y: oy + y, w: o.w, h: o.h });
          if (y) candidates.push({ x: ox + x, y: oy - y, w: o.w, h: o.h });
        }
        const free = candidates.filter(c => !fixed.some(f => rectsOverlap(c, f)));
        if (!free.length) continue;
        free.sort((a, b) => {
          const aSource = rectsOverlap(a, source) ? 1 : 0;
          const bSource = rectsOverlap(b, source) ? 1 : 0;
          return bSource - aSource ||
            ((b.x - ox) * dx + (b.y - oy) * dy) - ((a.x - ox) * dx + (a.y - oy) * dy) ||
            a.y - b.y || a.x - b.x;
        });
        o.x = free[0].x;
        o.y = free[0].y;
        fixed.push(o);
        break;
      }
    });
    return { nx, ny, others };
  }

  function commitMove(p, plan) {
    p.x = plan.nx;
    p.y = plan.ny;
    plan.others.forEach(o => {
      const actual = getProject(o.id);
      if (actual) { actual.x = o.x; actual.y = o.y; }
    });
  }

  function applyDragPreview(p, nx, ny) {
    const wall = $("#wall");
    if (!wall || !p) return;
    let slot = $(".tv-drop-slot", wall);
    const loc = cellToLocal(nx, ny);
    const w = p.w * CELL_W - GAP;
    const h = p.h * CELL_H - GAP;
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "tv-drop-slot" + (p.sizeKey === "2x2" || p.sizeKey === "3x3" ? " is-large" : "");
      slot.style.left = loc.x + "px";
      slot.style.top = loc.y + "px";
      slot.style.width = w + "px";
      slot.style.height = h + "px";
      wall.insertBefore(slot, wall.firstChild);
      requestAnimationFrame(function () { slot.classList.add("is-live"); });
    } else {
      slot.style.left = loc.x + "px";
      slot.style.top = loc.y + "px";
      slot.style.width = w + "px";
      slot.style.height = h + "px";
    }
    const sim = simulateMove(p, nx, ny);
    if (drag && drag.id === p.id) drag.plan = sim;
    const seen = {};
    sim.others.forEach(function (o) {
      seen[o.id] = true;
      const el = $('#wall .tv[data-id="' + o.id + '"]');
      if (!el) return;
      const orig = getProject(o.id);
      const moved = orig && (orig.x !== o.x || orig.y !== o.y);
      el.classList.toggle("is-previewing", !!moved);
      const pos = cellToLocal(o.x, o.y);
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
    });
    projects().forEach(function (o) {
      if (o.id === p.id || seen[o.id]) return;
      const el = $('#wall .tv[data-id="' + o.id + '"]');
      if (!el) return;
      el.classList.remove("is-previewing");
      const pos = cellToLocal(o.x, o.y);
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
    });
  }

  function clearDragPreview() {
    const slot = $("#wall .tv-drop-slot");
    if (slot) slot.remove();
    $$("#wall .tv.is-previewing").forEach(function (el) { el.classList.remove("is-previewing"); });
  }

  let hoverRippleTv = null;
  let hoverPulseTimer = null;

  function spawnRipple(tv) {
    if (!tv || reducedMotion()) return;
    const wall = $("#wall");
    if (!wall) return;
    const cx = tv.offsetLeft + tv.offsetWidth / 2;
    const cy = tv.offsetTop + tv.offsetHeight / 2;
    const rip = document.createElement("div");
    rip.className = "tv-ripple";
    rip.style.left = cx + "px";
    rip.style.top = cy + "px";
    rip.style.setProperty("--ripple-w", tv.offsetWidth + "px");
    rip.style.setProperty("--ripple-h", tv.offsetHeight + "px");
    rip.innerHTML = "<i></i><i></i>";
    wall.insertBefore(rip, wall.firstChild);
    setTimeout(function () { if (rip.parentNode) rip.remove(); }, 900);
  }

  function beginTvHover(tv) {
    if (!tv || hoverRippleTv === tv || (drag && drag.moved)) return;
    if (hoverRippleTv && hoverRippleTv !== tv) endTvHover(hoverRippleTv);
    hoverRippleTv = tv;
    tv.classList.add("is-hover");
    spawnRipple(tv);
    clearInterval(hoverPulseTimer);
    if (!reducedMotion()) {
      hoverPulseTimer = setInterval(function () {
        if (hoverRippleTv === tv && !(drag && drag.moved)) spawnRipple(tv);
        else clearInterval(hoverPulseTimer);
      }, 2600);
    }
  }

  function endTvHover(tv) {
    if (tv) tv.classList.remove("is-hover");
    if (!tv || hoverRippleTv === tv) {
      hoverRippleTv = null;
      clearInterval(hoverPulseTimer);
      hoverPulseTimer = null;
    }
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

  let cameraAnimation = 0;

  function animateCamera(tx, ty, ts, duration) {
    const animation = ++cameraAnimation;
    const sx = camera.cx, sy = camera.cy, ss = camera.scale;
    const t0 = performance.now();
    const dur = duration || 520;
    function step(now) {
      if (animation !== cameraAnimation) return;
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
    // Read the rendered wall matrix rather than assuming the viewport starts
    // at (0, 0). Its bounds include sidebar offsets, translations and origin.
    const wall = $("#wall");
    const rect = wall.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(wall).transform);
    return {
      x: (e.clientX - rect.left) / matrix.a,
      y: (e.clientY - rect.top) / matrix.d,
    };
  }

  /* —— render wall —— */
  const MASCOT_SVG =
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
        "</svg>";

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

    if (!list.length) {
      const wrap = document.createElement("div");
      // Empty state: centered on the camera focus (cell 0,0 centre); points to the
      // floating "+ 새 프로젝트" button instead of a clickable "+" TV.
      const c = cellToLocal(0.5, 0.5);
      wrap.className = "mascot-wrap is-empty";
      wrap.style.left = c.x + "px";
      wrap.style.top = c.y + "px";
      wrap.innerHTML =
        MASCOT_SVG +
        '<div class="mascot-speech">첫 방송을 시작해볼까...?<span class="mascot-hint">오른쪽 아래 <b>+ 새 프로젝트</b>를 눌러봐 ↘</span></div>';
      wall.appendChild(wrap);
    }
    document.body.classList.toggle("is-empty-wall", !list.length);

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

  /* —— project feed —— */
  function getProject(id) {
    return state.projects.find((p) => p.id === id);
  }

  function visibleUpdate(p, u) {
    if (!u) return false;
    if (p && p.private && !unlocked) return false;
    if (u.private && !unlocked) return false;
    return true;
  }

  function channelUpdates(p, chId) {
    return sortedUpdates(p).filter((u) => !chId || u.channelId === chId);
  }

  let mountToken = 0;
  let threeHost = null;

  function unmount3D() {
    mountToken++;
    if (threeCtl && threeCtl.dispose) threeCtl.dispose();
    threeCtl = null;
    if (threeHost) threeHost.classList.remove("is-live");
    threeHost = null;
  }

  function mount3D(el) {
    if (threeHost === el && threeCtl) return;
    unmount3D();
    const token = mountToken;
    threeHost = el;
    el.classList.add("is-live");
    const run = function (THREE) {
      if (token !== mountToken || !el.isConnected) return;
      const w = el.clientWidth || 560;
      const h = el.clientHeight || 320;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x262626);
      const cam = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
      cam.position.set(0, 0.55, 3.2);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.domElement.className = "viewer3d-canvas";
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
      let spinning = false, moved = false, lx = 0, ly = 0, mx = 0.4, my = 0.25, dist = 3.2;
      const onDown = (e) => { spinning = true; moved = false; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); };
      const onMove = (e) => {
        if (!spinning) return;
        if (Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) > 1) moved = true;
        mx += (e.clientX - lx) * 0.01;
        my += (e.clientY - ly) * 0.01;
        lx = e.clientX;
        ly = e.clientY;
      };
      const onUp = () => { spinning = false; };
      // a drag-rotate must not also count as a "click to open lightbox"
      const onClick = (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };
      const onWheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dist = Math.min(8, Math.max(1.4, dist + e.deltaY * 0.005));
      };
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("click", onClick, true);
      el.addEventListener("wheel", onWheel, { passive: false });
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!spinning) mx += 0.003;
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
          el.removeEventListener("click", onClick, true);
          el.removeEventListener("wheel", onWheel);
          renderer.dispose();
          if (renderer.forceContextLoss) renderer.forceContextLoss();
          if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
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
        if (token !== mountToken) return;
        el.classList.remove("is-live");
        const hint = el.querySelector(".media-hint");
        if (hint) hint.textContent = "Three.js 예정";
        else el.insertAdjacentHTML("beforeend", '<span class="media-hint">Three.js 예정</span>');
      });
  }

  /* line icons (stroke = currentColor) */
  const ICON = {
    more: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15" cy="10" r="1.3"/></svg>',
    todo: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5.5l1.4 1.4L8 4.3M4 11.5l1.4 1.4L8 10.3M10.5 5.8H16M10.5 11.8H16M4.5 16.5H16"/></svg>',
    link: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.4 11.6a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.6 8.4a3 3 0 0 0-4.2 0L4.8 11a3 3 0 0 0 4.2 4.2l.9-.9"/></svg>',
    up: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 12.5L10 8l4.5 4.5"/></svg>',
    down: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 7.5L10 12l4.5-4.5"/></svg>',
    play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 5.5v9l7-4.5z"/></svg>',
    cube: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3l6 3.3v7.4L10 17l-6-3.3V6.3zM4 6.3l6 3.4 6-3.4M10 9.7V17"/></svg>',
  };

  let newPostId = null;
  let todoOpen = {};

  function fmtSlash(d) {
    return String(d || "").replace(/-/g, "/");
  }

  function channelName(p, chId) {
    const ch = (p.channels || []).find((c) => c.id === chId);
    return ch ? ch.name : "채널";
  }

  function isVideoSrc(src) {
    return !!src && (/^data:video/.test(src) || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(src));
  }

  function mediaTileHTML(f, i) {
    const shade = " shade-" + (i % 4);
    const cap = f.name ? '<span class="media-cap">' + esc(f.name) + "</span>" : "";
    if (f.type === "model3d") {
      return '<button type="button" class="media-tile is-3d' + shade + '" data-fi="' + i + '">' +
        '<span class="media-glyph">' + ICON.cube + "</span>" +
        '<span class="media-hint">3D · 올리면 돌려볼 수 있어</span>' + cap + "</button>";
    }
    if (f.type === "video") {
      const vid = isVideoSrc(f.src) ? '<video muted loop playsinline preload="metadata" src="' + esc(f.src) + '"></video>' : "";
      return '<button type="button" class="media-tile is-video' + shade + '" data-fi="' + i + '">' + vid +
        '<span class="media-play">' + ICON.play + "</span>" + cap + "</button>";
    }
    const img = f.src ? '<img alt="" loading="lazy" src="' + esc(f.src) + '" />' : "";
    return '<button type="button" class="media-tile' + (f.src ? " has-img" : "") + shade + '" data-fi="' + i + '">' + img + cap + "</button>";
  }

  function postHTML(p, u, idx, total) {
    const open = visibleUpdate(p, u);
    const files = open ? u.files || [] : [];
    const todo = u.nextTodo || "";
    const meta = "@" + esc(channelName(p, u.channelId)) + " · " + esc(fmtSlash(u.date));
    let media = "";
    if (!open) {
      media = '<div class="post-media n1"><button type="button" class="media-tile is-nosignal" data-unlock="1">' +
        '<div class="tv-nosignal"><span>NO SIGNAL</span></div><span class="media-hint">눌러서 잠금 풀기</span></button></div>';
    } else if (files.length) {
      const n = Math.min(files.length, 4);
      media = '<div class="post-media n' + n + '">' + files.slice(0, 4).map(mediaTileHTML).join("") +
        (files.length > 4 ? '<span class="media-more">+' + (files.length - 4) + "</span>" : "") + "</div>";
    }
    const priv = u.private ? '<span class="post-lock" title="비공개">비공개</span>' : "";
    return (
      '<article class="post' + (u.id === newPostId ? " is-new" : "") + (open ? "" : " is-locked") + '" data-up="' + esc(u.id) + '" id="post-' + esc(u.id) + '">' +
      '<header class="post-head">' +
      '<span class="post-avatar" aria-hidden="true"></span>' +
      '<div class="post-who"><b>' + esc(p.name) + "</b>" + priv + '<span class="post-meta">' + meta + "</span></div>" +
      '<div class="post-tools">' +
      '<button type="button" class="sq-btn mood" data-act="mood" title="기분">' + esc(open ? (u.mood || "·") : "·") + "</button>" +
      '<button type="button" class="sq-btn" data-act="menu" title="게시물 메뉴">' + ICON.more + "</button>" +
      "</div></header>" +
      '<h3 class="post-title">' + esc(open ? (u.title || "제목 없음") : "비공개 방송") + "</h3>" +
      (open && u.description ? '<p class="post-desc">' + esc(u.description) + "</p>" : "") +
      media +
      (open && todo ? '<div class="post-todo"' + (todoOpen[u.id] ? "" : " hidden") + '><b>다음 할 일</b><span>' + esc(todo) + "</span></div>" : "") +
      '<footer class="post-foot">' +
      '<div class="post-foot-l">' +
      '<button type="button" class="sq-btn' + (todoOpen[u.id] ? " is-on" : "") + '" data-act="todo" title="다음 할 일"' + (open && todo ? "" : " disabled") + ">" + ICON.todo + "</button>" +
      '<button type="button" class="sq-btn" data-act="link" title="링크 복사">' + ICON.link + "</button>" +
      "</div>" +
      '<div class="post-foot-r">' +
      '<button type="button" class="sq-btn" data-act="prev" title="이전(최신) 게시물"' + (idx === 0 ? " disabled" : "") + ">" + ICON.up + "</button>" +
      '<button type="button" class="sq-btn" data-act="next" title="다음(이전) 게시물"' + (idx === total - 1 ? " disabled" : "") + ">" + ICON.down + "</button>" +
      "</div></footer></article>"
    );
  }

  function renderFeed() {
    const p = getProject(currentId);
    if (!p) return closeFeed();
    unmount3D();
    $("#post-pop").hidden = true;
    const posts = channelUpdates(p, currentCh);
    const feed = $("#feed");
    const chip = currentCh
      ? '<div class="feed-chip"><span>@' + esc(channelName(p, currentCh)) + " · " + posts.length + "개 방송</span>" +
        '<button type="button" data-act="all-ch">전체 채널 보기</button></div>'
      : '<div class="feed-chip"><span>' + esc(p.name) + " · 전체 채널 · " + posts.length + "개 방송</span></div>";
    if (!(p.updates || []).length) {
      feed.innerHTML =
        '<div class="feed-empty">' +
        MASCOT_SVG +
        '<p class="feed-empty-text">첫 방송을 시작해볼까...?</p>' +
        '<button type="button" class="btn-onair" data-act="onair">● ON AIR</button></div>';
    } else if (!posts.length) {
      feed.innerHTML = chip + '<p class="feed-none">이 채널엔 아직 방송이 없어.</p>';
    } else {
      feed.innerHTML = chip + posts.map((u, i) => postHTML(p, u, i, posts.length)).join("");
    }
    feed.classList.toggle("is-empty", !(p.updates || []).length);
    $("#btn-complete").textContent = p.completed ? "다시 켜기" : "방송 종료";
    $("#btn-complete").classList.toggle("is-on", !!p.completed);
    $("#btn-toggle-private").textContent = p.private ? "공개로 전환" : "비공개 전환";
    renderSideTree();
  }

  let wallCameraBeforeFeed = null;

  function openFeed(id, channelId, opts) {
    const p = getProject(id);
    if (!p) return;
    const wasOpen = !$("#feed-view").hidden;
    if (!wasOpen) {
      const saved = opts && opts.camera;
      wallCameraBeforeFeed = saved || { cx: camera.cx, cy: camera.cy, scale: camera.scale };
    }
    if (currentId !== id) todoOpen = {};
    currentId = id;
    focusedId = id;
    expanded["proj:" + id] = true;
    expanded["cat:__all"] = true;
    if (p.category) expanded["cat:" + p.category] = true;
    currentCh = channelId && (p.channels || []).some((c) => c.id === channelId) ? channelId : null;
    const view = $("#feed-view");
    view.hidden = false;
    if (!wasOpen && !reducedMotion()) {
      view.classList.remove("is-entering");
      void view.offsetWidth;
      view.classList.add("is-entering");
      setTimeout(() => view.classList.remove("is-entering"), 260);
    }
    $("#proj-menu").hidden = true;
    document.body.classList.remove("on-wall");
    closeRecapKeep();
    setRail("archive");
    renderFeed();
    $("#feed-scroll").scrollTop = 0;
  }

  function closeFeed() {
    unmount3D();
    closeLightbox();
    $("#feed-view").hidden = true;
    $("#proj-menu").hidden = true;
    $("#post-pop").hidden = true;
    currentId = null;
    currentCh = null;
    document.body.classList.add("on-wall");
    if (wallCameraBeforeFeed) {
      camera.cx = wallCameraBeforeFeed.cx;
      camera.cy = wallCameraBeforeFeed.cy;
      camera.scale = wallCameraBeforeFeed.scale;
      wallCameraBeforeFeed = null;
      cameraAnimation++;
    }
    $("#wall").classList.remove("is-flying");
    renderWall();
    applyCamera();
    renderSideTree();
  }

  /* clicking a TV on the wall: quick push-in toward it, then fade into its feed */
  function flyIntoFeed(p) {
    if (reducedMotion()) return openFeed(p.id);
    const saved = { cx: camera.cx, cy: camera.cy, scale: camera.scale };
    applySizes();
    const loc = cellToLocal(p.x + p.w / 2, p.y + p.h / 2);
    animateCamera(loc.x, loc.y, Math.min(2.6, camera.scale * 1.7), 240);
    $("#wall").classList.add("is-flying");
    setTimeout(() => {
      if (!getProject(p.id)) return;
      openFeed(p.id, null, { camera: saved });
    }, 200);
  }

  /* —— lightbox —— */
  let lb = null;

  function openLightbox(upId, fi) {
    const p = getProject(currentId);
    const u = p && (p.updates || []).find((x) => x.id === upId);
    if (!u || !visibleUpdate(p, u) || !(u.files || []).length) return;
    lb = { upId: upId, fi: fi || 0 };
    $("#lightbox").hidden = false;
    renderLightbox();
  }

  function renderLightbox() {
    if (!lb) return;
    const p = getProject(currentId);
    const u = p && (p.updates || []).find((x) => x.id === lb.upId);
    if (!u) return closeLightbox();
    const files = u.files || [];
    const n = files.length;
    lb.fi = (lb.fi + n) % n;
    const f = files[lb.fi];
    unmount3D();
    const stage = $("#lb-stage");
    let inner = "";
    if (f.type === "model3d") inner = '<div class="lb-media lb-3d"></div>';
    else if (f.type === "video" && isVideoSrc(f.src)) inner = '<video class="lb-media" controls autoplay playsinline src="' + esc(f.src) + '"></video>';
    else if (f.type === "video") inner = '<div class="lb-media lb-blank"><span class="media-play">' + ICON.play + "</span></div>";
    else if (f.src) inner = '<img class="lb-media" alt="" src="' + esc(f.src) + '" />';
    else inner = '<div class="lb-media lb-blank"></div>';
    stage.innerHTML = inner + '<p class="lb-cap">' + esc(u.title || "") + (f.name ? " · " + esc(f.name) : "") + "</p>";
    $("#lb-count").textContent = n > 1 ? (lb.fi + 1) + " / " + n : "";
    $("#lb-prev").hidden = n < 2;
    $("#lb-next").hidden = n < 2;
    const holder = $(".lb-3d", stage);
    if (holder) requestAnimationFrame(() => mount3D(holder));
  }

  function closeLightbox() {
    if (!lb) return;
    lb = null;
    unmount3D();
    $("#lightbox").hidden = true;
    $("#lb-stage").innerHTML = "";
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1600);
  }

  function copyText(text) {
    const done = () => toast("링크 복사했어");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function scrollToPost(id) {
    const el = document.getElementById("post-" + id);
    if (!el) return;
    const sc = $("#feed-scroll");
    const top = el.offsetTop - 44;
    sc.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function openPostPop(btn, html) {
    const pop = $("#post-pop");
    pop.innerHTML = html;
    pop.hidden = false;
    const host = $("#feed-view").getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom - host.top + 6) + "px";
    pop.style.left = Math.max(8, r.right - host.left - pop.offsetWidth) + "px";
  }

  function bindFeed() {
    const feed = $("#feed");
    feed.addEventListener("click", (e) => {
      const p = getProject(currentId);
      if (!p) return;
      const actBtn = e.target.closest("[data-act]");
      const post = e.target.closest(".post[data-up]");
      const u = post && (p.updates || []).find((x) => x.id === post.getAttribute("data-up"));
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.getAttribute("data-act");
        if (act === "onair") return ensureEdit(openOnAir);
        if (act === "all-ch") { currentCh = null; return renderFeed(); }
        if (!u) return;
        if (act === "todo") {
          todoOpen[u.id] = !todoOpen[u.id];
          const memo = $(".post-todo", post);
          if (memo) memo.hidden = !todoOpen[u.id];
          actBtn.classList.toggle("is-on", !!todoOpen[u.id]);
          return;
        }
        if (act === "link") {
          return copyText(location.href.split("#")[0] + "#p=" + encodeURIComponent(p.id) + "&u=" + encodeURIComponent(u.id));
        }
        if (act === "prev" || act === "next") {
          const sib = act === "prev" ? post.previousElementSibling : post.nextElementSibling;
          if (sib && sib.matches(".post")) scrollToPost(sib.getAttribute("data-up"));
          return;
        }
        if (act === "mood") {
          if (!visibleUpdate(p, u)) return;
          return openPostPop(actBtn, '<div class="mood-pick" data-up="' + esc(u.id) + '">' +
            MOODS.map((m) => '<button type="button" data-mood="' + m + '"' + (m === u.mood ? ' class="is-on"' : "") + ">" + m + "</button>").join("") + "</div>");
        }
        if (act === "menu") {
          return openPostPop(actBtn,
            '<button type="button" data-post-act="private" data-up="' + esc(u.id) + '">' + (u.private ? "공개로 전환" : "비공개 전환") + "</button>" +
            '<button type="button" data-post-act="delete" data-up="' + esc(u.id) + '" class="danger">이 방송 삭제</button>');
        }
        return;
      }
      if (e.target.closest("[data-unlock]")) {
        return ensureEdit(() => renderFeed());
      }
      const tile = e.target.closest(".media-tile[data-fi]");
      if (tile && u) openLightbox(u.id, Number(tile.getAttribute("data-fi")));
    });
    // hover: video previews play, 3D tiles become live viewers
    feed.addEventListener("pointerover", (e) => {
      const tile = e.target.closest(".media-tile");
      if (!tile || tile.contains(e.relatedTarget)) return;
      if (tile.classList.contains("is-3d")) mount3D(tile);
      const v = $("video", tile);
      if (v) { v.play().catch(() => {}); tile.classList.add("is-playing"); }
    });
    feed.addEventListener("pointerout", (e) => {
      const tile = e.target.closest(".media-tile");
      if (!tile || tile.contains(e.relatedTarget)) return;
      const v = $("video", tile);
      if (v) { v.pause(); tile.classList.remove("is-playing"); }
    });

    $("#post-pop").addEventListener("click", (e) => {
      e.stopPropagation();
      const p = getProject(currentId);
      if (!p) return;
      const moodBtn = e.target.closest("[data-mood]");
      if (moodBtn) {
        const id = moodBtn.closest("[data-up]").getAttribute("data-up");
        return ensureEdit(() => {
          const u = (p.updates || []).find((x) => x.id === id);
          if (!u) return;
          u.mood = moodBtn.getAttribute("data-mood");
          saveState();
          renderFeed();
        });
      }
      const b = e.target.closest("[data-post-act]");
      if (!b) return;
      const id = b.getAttribute("data-up");
      const act = b.getAttribute("data-post-act");
      $("#post-pop").hidden = true;
      ensureEdit(() => {
        const u = (p.updates || []).find((x) => x.id === id);
        if (!u) return;
        if (act === "private") {
          u.private = !u.private;
        } else if (act === "delete") {
          if (!window.confirm("이 방송을 지울까...? (되돌릴 수 없어)")) return;
          p.updates = p.updates.filter((x) => x.id !== id);
          applySizes();
        }
        saveState();
        renderFeed();
        renderWall();
      });
    });
    $("#feed-scroll").addEventListener("scroll", () => { $("#post-pop").hidden = true; }, { passive: true });

    $("#lb-prev").addEventListener("click", () => { if (lb) { lb.fi--; renderLightbox(); } });
    $("#lb-next").addEventListener("click", () => { if (lb) { lb.fi++; renderLightbox(); } });
    $$('#lightbox [data-close="lightbox"]').forEach((b) => b.addEventListener("click", closeLightbox));
    document.addEventListener("keydown", (e) => {
      if (!lb) return;
      if (e.key === "ArrowLeft") { lb.fi--; renderLightbox(); }
      if (e.key === "ArrowRight") { lb.fi++; renderLightbox(); }
    });
  }

  function openFromHash() {
    const m = /#p=([^&]+)(?:&u=([^&]+))?/.exec(location.hash || "");
    if (!m) return;
    const pid = decodeURIComponent(m[1]);
    const upId = m[2] ? decodeURIComponent(m[2]) : "";
    if (!getProject(pid)) return;
    openFeed(pid);
    if (upId) requestAnimationFrame(() => scrollToPost(upId));
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
    if (!points.length) chart = '<p class="muted-note">이 기간엔 기분 기록이 없어.</p>';

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
      .join("") || '<p class="muted-note">아직 채널별 기록이 없어.</p>';

    const thumbs = rec.items
      .map((it) => {
        const img = it.src
          ? '<img alt="" src="' + esc(it.src) + '" />'
          : '<div class="recap-ph"></div>';
        return "<figure>" + img + "<figcaption>" + esc(it.update.date.slice(5)) + " · " + esc(it.update.title) + "</figcaption></figure>";
      })
      .join("") || '<p class="muted-note">이 기간의 방송이 없어.</p>';

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
    if (currentId) closeFeed();
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
      .map((c) => '<option value="' + esc(c.id) + '"' + (c.id === (currentCh || (lastUpdate(p) || {}).channelId) ? " selected" : "") + ">" + esc(c.name) + "</option>")
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
    if (currentId) closeFeed();
    const p = getProject(id);
    if (!p) return;
    document.body.classList.add("on-wall");
    focusedId = id;
    renderWall();
    renderSideTree();
    flyToProject(p);
  }

  /* —— trash —— */
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



  /* —— mutations —— */
  function createProject() {
    if (previewEmpty) {
      previewEmpty = false;
    }
    applySizes();
    const pos = nearestFreeCell(1, 1);
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
    // Let the camera land on the new TV first, then zoom in (same flow as before).
    setTimeout(() => { if (getProject(p.id)) openFeed(p.id); }, reducedMotion() ? 0 : 560);
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
    if (currentCh && currentCh !== ch) currentCh = null;
    newPostId = update.id;
    closeOnAir();
    playBroadcast(() => {
      renderFeed();
      renderWall();
      $("#feed-scroll").scrollTop = 0;
      setTimeout(() => {
        newPostId = null;
        const el = document.getElementById("post-" + update.id);
        if (el) el.classList.remove("is-new");
      }, 1400);
    });
  }

  /* —— events —— */
  function bindEvents() {
    const vp = $("#viewport");

    vp.addEventListener("wheel", (e) => {
      if (!$("#feed-view").hidden || !$("#recap-view").hidden) return;
      e.preventDefault();
      const dy = e.deltaY || (e.deltaX ? e.deltaX : 0);
      const factor = Math.exp(-dy * 0.0015);
      const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, camera.scale * factor));
      if (next === camera.scale) return;
      const world = worldFromEvent(e);
      const rect = vp.getBoundingClientRect();
      const origin = viewOrigin();
      cameraAnimation++;
      // screen = viewportOffset + origin + scale * (world - camera).
      // Solve for the NEW camera, dividing by the NEW scale (not multiplying).
      camera.cx = world.x - (e.clientX - rect.left - origin.x) / next;
      camera.cy = world.y - (e.clientY - rect.top - origin.y) / next;
      camera.scale = next;
      applyCamera();
    }, { passive: false });

    vp.addEventListener("pointerdown", (e) => {
      if (!$("#feed-view").hidden) return;
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
          endTvHover(hoverRippleTv);
          const el = $('#wall .tv[data-id="' + drag.id + '"]');
          if (el) el.classList.add("is-dragging");
          try { vp.setPointerCapture(e.pointerId); } catch (err) {}
        }
        if (drag && drag.moved) {
          const world = worldFromEvent(e);
          const el = $('#wall .tv[data-id="' + drag.id + '"]');
          if (el) {
            el.style.left = world.x - drag.ox + "px";
            el.style.top = world.y - drag.oy + "px";
          }
          const p = getProject(drag.id);
          if (p) {
            const snap = snapCellFromPixels(world.x - drag.ox, world.y - drag.oy);
            if (!drag.snap || drag.snap.x !== snap.x || drag.snap.y !== snap.y) {
              drag.snap = snap;
              applyDragPreview(p, snap.x, snap.y);
            }
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
          clearDragPreview();
          if (p && e.type !== "pointercancel") {
            const world = worldFromEvent(e);
            const snap = snapCellFromPixels(world.x - info.ox, world.y - info.oy);
            const plan = info.plan && info.plan.nx === snap.x && info.plan.ny === snap.y
              ? info.plan : simulateMove(p, snap.x, snap.y);
            commitMove(p, plan);
            saveState();
          }
          renderWall();
        }
        setTimeout(() => { skipClick = false; }, 40);
      }
      pan = null;
    }
    vp.addEventListener("pointerup", endPointer);
    vp.addEventListener("pointercancel", endPointer);

    vp.addEventListener("pointerover", (e) => {
      if (drag && drag.moved) return;
      const tv = e.target.closest("#wall .tv");
      if (!tv) return;
      if (e.relatedTarget && tv.contains(e.relatedTarget)) return;
      beginTvHover(tv);
    });
    vp.addEventListener("pointerout", (e) => {
      const tv = e.target.closest("#wall .tv");
      if (!tv) return;
      if (e.relatedTarget && tv.contains(e.relatedTarget)) return;
      endTvHover(tv);
    });

    vp.addEventListener("click", (e) => {
      if (skipClick) return;
      const tv = e.target.closest(".tv");
      if (!tv) return;
      const p = tv.dataset.id && getProject(tv.dataset.id);
      if (p) flyIntoFeed(p);
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

    $("#btn-new-project").addEventListener("click", () => ensureEdit(createProject));
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
      if (!e.target.closest("#post-pop")) $("#post-pop").hidden = true;
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
        if (currentId) closeFeed();
        renderCats();
        renderWall();
        centerOnLatest(true);
      });
    });
    $("#btn-empty-preview").addEventListener("click", () => {
      previewEmpty = true;
      $("#menu-pop").hidden = true;
      closeRecap();
      if (currentId) closeFeed();
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

    $("#btn-back-wall").addEventListener("click", closeFeed);
    $("#btn-recap-back").addEventListener("click", closeRecap);
    $("#btn-onair").addEventListener("click", () => ensureEdit(openOnAir));
    $("#btn-complete").addEventListener("click", () => {
      ensureEdit(() => {
        const p = getProject(currentId);
        if (!p) return;
        p.completed = !p.completed;
        saveState();
        renderFeed();
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
          renderFeed();
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
        renderFeed();
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
        closeFeed();
      });
    });

    $("#btn-add-ch").addEventListener("click", () => {
      $("#proj-menu").hidden = true;
      ensureEdit(() => {
        const p = getProject(currentId);
        if (!p) return;
        const name = window.prompt("채널 이름", "");
        if (!name || !name.trim()) return;
        const ch = { id: uid("ch"), name: name.trim() };
        p.channels = p.channels || [];
        p.channels.push(ch);
        currentCh = ch.id;
        saveState();
        renderFeed();
      });
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
        if (currentId) renderFeed();
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
      if (!$("#lightbox").hidden) return closeLightbox();
      if (!$("#post-pop").hidden) return ($("#post-pop").hidden = true);
      if (!$("#proj-menu").hidden) return ($("#proj-menu").hidden = true);
      if (!$("#trash-view").hidden) { $("#trash-view").hidden = true; syncRail(); return; }
      if (!$("#cat-view").hidden) return ($("#cat-view").hidden = true);
      if (!$("#recap-view").hidden) return closeRecap();
      if (!$("#feed-view").hidden) return closeFeed();
    });

    function bindSidebar() {
      $$(".rail-nav [data-rail]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const name = btn.getAttribute("data-rail");
          if (name === "home") {
            previewEmpty = false;
            closeRecap();
            if (currentId) closeFeed();
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
        if (currentId) closeFeed();
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
          if (p) openFeed(p.id, ch.getAttribute("data-ch"));
          return;
        }
        const proj = e.target.closest(".tree-row.project[data-pid]");
        if (proj) {
          const id = proj.getAttribute("data-pid");
          const p = getProject(id);
          if (!p) return;
          closeRecap();
          openFeed(p.id);
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
    }
    bindSidebar();

    window.addEventListener("resize", applyCamera);
  }

  function startAmbience() {
    setInterval(() => {
      if (!$("#feed-view").hidden) return;
      const tvs = $$("#wall .tv[data-id]");
      if (!tvs.length) return;
      const el = tvs[Math.floor(Math.random() * tvs.length)];
      el.classList.add("is-glitch");
      setTimeout(() => el.classList.remove("is-glitch"), 280);
    }, 9000);
    setInterval(() => {
      $$(".tv-mood-face").forEach((n) => n.remove());
      if (!$("#feed-view").hidden) return;
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
    openProject: function (id) { openFeed(id); },
    openRecap: openRecap,
    openOnAir: function () {
      if (!currentId) openFeed("p-poster");
      unlocked = true;
      openOnAir();
    },
    showEmpty: function () {
      previewEmpty = true;
      closeRecap();
      if (currentId) closeFeed();
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
    spawnRipple: spawnRipple,
    previewHover: function (id) {
      const el = $('#wall .tv[data-id="' + id + '"]') || $("#wall .tv");
      if (!el) return;
      beginTvHover(el);
    },
    previewDrag: function (id, nx, ny) {
      const p = getProject(id);
      const el = $('#wall .tv[data-id="' + id + '"]');
      if (!p || !el) return;
      unlocked = true;
      endTvHover(el);
      el.classList.add("is-dragging");
      const snap = { x: nx != null ? nx : p.x + 1, y: ny != null ? ny : p.y };
      const world = cellToLocal(snap.x + 0.18, snap.y + 0.12);
      el.style.left = world.x + "px";
      el.style.top = world.y + "px";
      applyDragPreview(p, snap.x, snap.y);
    },
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
    bindFeed();
    renderCats();
    renderWall();
    centerOnLatest(false);
    startAmbience();
    openFromHash();
  }

  init();
})();
