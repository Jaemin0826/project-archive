/* 작업 메이트 — a broadcast-style companion page that stays open while working.
   Generative orbit-line canvas + Web Audio ambience + REC timer + shy mascot. */
(function () {
  "use strict";
  const core = window.TVArchiveCore;
  if (!core) return;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Separate keys: the project data shape (tv-archive-data-v5) is untouched, so no bump/migration.
  const SESS_KEY = "tv-archive-work-sessions";
  const PREF_KEY = "tv-archive-work-prefs";
  const LIVE_KEY = "tv-archive-work-live";

  const CHANNELS = [
    { id: "orbit", name: "우주", en: "ORBIT", dot: 9, line: "별 보는 중..." },
    { id: "rain", name: "비", en: "RAIN", dot: 6, line: "빗소리 좋다..." },
    { id: "fire", name: "모닥불", en: "CAMPFIRE", dot: 7, line: "따뜻해..." },
    { id: "static", name: "노이즈", en: "STATIC", dot: 5, line: "지지직... 집중 모드..." },
    { id: "lofi", name: "lo-fi", en: "LO-FI", dot: 6, line: "이 노래 좋아..." },
  ];
  const chById = (id) => CHANNELS.find((c) => c.id === id) || CHANNELS[0];

  const LINES = {
    start: ["오늘도 옆에 있을게...", "천천히 해도 돼...", "같이 방송 시작이야..."],
    idle: ["물 마셔...", "자세 괜찮아...?", "잘 하고 있어...", "나도 조용히 보고 있을게...", "숨 한 번 크게 쉬어...", "화면이랑 너무 가까운 거 아니야...?", "조금 쉬어도 돼..."],
    pause: ["쉬는 중... 다녀와...", "기다리고 있을게..."],
    resume: ["다시 시작이야...!", "어서 와..."],
    poke: ["으앗... 깜짝이야...", "나 불렀어...?", "열심히 하는 거 보고 있어...", "헤헤...", "물 마셨어...?"],
  };
  const MILESTONES = [
    [25, "25분 됐어... 어깨 한 번 돌려볼까...?"],
    [50, "물 마셔..."],
    [60, "벌써 1시간 했어..."],
    [90, "조금 쉬어도 돼..."],
    [120, "2시간째야... 대단해..."],
  ];

  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ }
  }

  let prefs = Object.assign({ channel: "orbit", volume: 55, muted: false }, readJSON(PREF_KEY, {}));
  let session = null; // { id, pid, todo, elapsed, runningSince, startedAt, said:[] , nextIdleAt }
  let open = false;

  /* ———————————————— time ———————————————— */
  function elapsedMs() {
    if (!session) return 0;
    return session.elapsed + (session.runningSince ? Date.now() - session.runningSince : 0);
  }
  function clock(ms) {
    const s = Math.floor(ms / 1000);
    const p = (n) => String(n).padStart(2, "0");
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60);
  }
  function human(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 1) return Math.max(0, Math.floor(ms / 1000)) + "초";
    const h = Math.floor(m / 60);
    return h ? h + "시간" + (m % 60 ? " " + (m % 60) + "분" : "") : m + "분";
  }
  function julian() {
    return (Date.now() / 86400000 + 2440587.5).toFixed(5);
  }

  function persistLive() {
    if (!session) { localStorage.removeItem(LIVE_KEY); return; }
    writeJSON(LIVE_KEY, Object.assign({}, session, { elapsed: elapsedMs(), running: !!session.runningSince, runningSince: null }));
  }

  function projectName(pid) {
    const p = pid && core.getProject(pid);
    return p ? p.name : "더미 프로젝트";
  }

  function newSession() {
    const pid = core.focusedProjectId() || core.latestProjectId();
    const p = pid && core.getProject(pid);
    session = {
      id: "ws-" + Date.now().toString(36),
      pid: p ? p.id : "",
      todo: (p && p.nextTodo) || "",
      elapsed: 0,
      runningSince: Date.now(),
      startedAt: Date.now(),
      said: [],
      nextIdleAt: 7 * 60000,
    };
    persistLive();
  }

  /* ———————————————— audio ———————————————— */
  const audio = { ctx: null, master: null, analyser: null, cur: null, buffers: {}, armed: false };

  function masterLevel() {
    if (prefs.muted) return 0;
    const v = prefs.volume / 100;
    return v * v * 0.9 * (session && !session.runningSince ? 0.35 : 1);
  }

  // Only ever called from a user gesture (click / key / pointerdown).
  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0;
      const comp = audio.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 1024;
      audio.master.connect(comp);
      comp.connect(audio.analyser);
      audio.analyser.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    audio.armed = true;
    $("#work-sound-hint").hidden = true;
    if (open && (!audio.cur || audio.cur.id !== prefs.channel)) startSound(prefs.channel);
    applyLevel(0.4);
    return true;
  }

  function applyLevel(ramp) {
    if (!audio.ctx) return;
    const g = audio.master.gain;
    const now = audio.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(open ? masterLevel() : 0, now + (ramp || 0.3));
  }

  function noiseBuffer(kind) {
    if (audio.buffers[kind]) return audio.buffers[kind];
    const ctx = audio.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "white") d[i] = w;
      else if (kind === "pink") {
        b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056;
        d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6;
      } else { // brown
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    audio.buffers[kind] = buf;
    return buf;
  }

  function makeChannelBus() {
    const ctx = audio.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(audio.master);
    const bus = { gain, nodes: [], timers: [], alive: true };
    bus.loopNoise = function (kind, filters, level) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(kind);
      src.loop = true;
      let node = src;
      (filters || []).forEach((f) => {
        const bq = ctx.createBiquadFilter();
        bq.type = f[0]; bq.frequency.value = f[1]; if (f[2]) bq.Q.value = f[2];
        node.connect(bq); node = bq;
      });
      const g = ctx.createGain();
      g.gain.value = level;
      node.connect(g); g.connect(gain);
      src.start();
      bus.nodes.push(src);
      return g;
    };
    bus.osc = function (type, freq, level, dest) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g); g.connect(dest || gain);
      o.start();
      bus.nodes.push(o);
      return { o, g };
    };
    // one-shot filtered noise burst (drops, crackles, hats)
    bus.burst = function (at, dur, level, ftype, freq, q) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer("white");
      const bq = ctx.createBiquadFilter();
      bq.type = ftype; bq.frequency.value = freq; bq.Q.value = q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(bq); bq.connect(g); g.connect(gain);
      src.start(at, Math.random() * 2, dur + 0.05);
    };
    bus.tone = function (at, type, f0, f1, dur, level, filterHz) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, at);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level, at + Math.min(0.08, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      let node = o;
      if (filterHz) { const bq = ctx.createBiquadFilter(); bq.type = "lowpass"; bq.frequency.value = filterHz; o.connect(bq); node = bq; }
      node.connect(g); g.connect(gain);
      o.start(at); o.stop(at + dur + 0.05);
    };
    // random scheduler: fn(atTime) every [min,max] seconds
    bus.every = function (min, max, fn) {
      const tick = () => {
        if (!bus.alive) return;
        fn(ctx.currentTime + 0.02);
        bus.timers.push(setTimeout(tick, (min + Math.random() * (max - min)) * 1000));
      };
      bus.timers.push(setTimeout(tick, min * 500));
    };
    bus.stop = function (fade) {
      bus.alive = false;
      bus.timers.forEach(clearTimeout);
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => { bus.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); gain.disconnect(); }, fade * 1000 + 120);
    };
    return bus;
  }

  const SOUNDS = {
    orbit(bus) { // low drone + faint sonar pings
      const ctx = audio.ctx;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; lp.connect(bus.gain);
      const pad = ctx.createGain(); pad.gain.value = 0.16; pad.connect(lp);
      bus.osc("sine", 55, 0.5, pad); bus.osc("sine", 82.41, 0.35, pad); bus.osc("triangle", 110.3, 0.12, pad); bus.osc("sine", 164.8, 0.08, pad);
      const lfo = bus.osc("sine", 0.07, 0.06, pad.gain); void lfo;
      bus.loopNoise("pink", [["lowpass", 320]], 0.05);
      bus.every(7, 14, (at) => bus.tone(at, "sine", 880 * (Math.random() < 0.5 ? 1 : 1.5), 0, 2.4, 0.035));
    },
    rain(bus) { // filtered noise + scattered drops
      bus.loopNoise("pink", [["highpass", 450], ["lowpass", 5200]], 0.42);
      bus.loopNoise("brown", [["lowpass", 260]], 0.22);
      bus.every(0.03, 0.14, (at) => bus.burst(at, 0.03 + Math.random() * 0.05, 0.05 + Math.random() * 0.08, "bandpass", 1800 + Math.random() * 4200, 6));
    },
    fire(bus) { // warm rumble + crackles and pops
      const body = bus.loopNoise("brown", [["lowpass", 520]], 0.55);
      bus.osc("sine", 2.6, 0.18, body.gain);
      bus.every(0.04, 0.32, (at) => bus.burst(at, 0.004 + Math.random() * 0.016, 0.1 + Math.random() * 0.35, "highpass", 1400 + Math.random() * 2600, 0.7));
      bus.every(1.2, 4.5, (at) => bus.tone(at, "sine", 140, 45, 0.18, 0.12));
    },
    static(bus) { // TV static with a flutter and mains hum
      const hiss = bus.loopNoise("white", [["bandpass", 3200, 0.45]], 0.16);
      bus.osc("sine", 60, 0.02);
      bus.osc("sine", 120, 0.012);
      bus.every(0.06, 0.16, (at) => hiss.gain.setTargetAtTime(0.08 + Math.random() * 0.14, at, 0.02));
    },
    lofi(bus) { // Fmaj7 → Em7 → Dm7 → Cmaj7, soft kick, vinyl crackle
      const ctx = audio.ctx;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1150; lp.connect(bus.gain);
      const chords = [["Fmaj7", [53, 57, 60, 64]], ["Em7", [52, 55, 59, 62]], ["Dm7", [50, 53, 57, 60]], ["Cmaj7", [48, 52, 55, 59]]];
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const beat = 60 / 76, bar = beat * 4;
      let next = ctx.currentTime + 0.12, idx = 0;
      bus.chord = chords[0][0];
      const schedule = () => {
        if (!bus.alive) return;
        while (next < ctx.currentTime + 0.8) {
          const [name, notes] = chords[idx % chords.length];
          const at = next;
          bus.timers.push(setTimeout(() => { bus.chord = name; }, Math.max(0, (at - ctx.currentTime) * 1000)));
          notes.forEach((m, k) => {
            [-5, 5].forEach((cents) => {
              const o = ctx.createOscillator(); o.type = "triangle";
              o.frequency.value = mtof(m) * Math.pow(2, cents / 1200);
              const g = ctx.createGain();
              g.gain.setValueAtTime(0, at + k * 0.03);
              g.gain.linearRampToValueAtTime(0.045, at + k * 0.03 + 0.09);
              g.gain.exponentialRampToValueAtTime(0.018, at + bar * 0.7);
              g.gain.exponentialRampToValueAtTime(0.0001, at + bar + 0.3);
              o.connect(g); g.connect(lp); o.start(at); o.stop(at + bar + 0.4);
            });
          });
          bus.tone(at, "sine", mtof(notes[0] - 12), 0, bar * 0.95, 0.12, 400);
          for (let b = 0; b < 4; b++) {
            const t = at + b * beat;
            if (b % 2 === 0) bus.tone(t, "sine", 130, 46, 0.32, 0.22);
            bus.burst(t + beat / 2, 0.04, 0.03, "highpass", 7000, 0.8);
          }
          next += bar; idx++;
        }
        bus.timers.push(setTimeout(schedule, 200));
      };
      schedule();
      bus.loopNoise("pink", [["bandpass", 1400, 0.6]], 0.012);
      bus.every(0.15, 0.9, (at) => bus.burst(at, 0.006, 0.06 + Math.random() * 0.1, "highpass", 2500, 0.7));
    },
  };

  function startSound(id) {
    if (!audio.ctx || !audio.armed) return;
    if (audio.cur) audio.cur.stop(0.6);
    const bus = makeChannelBus();
    bus.id = id;
    SOUNDS[id](bus);
    const now = audio.ctx.currentTime;
    bus.gain.gain.setValueAtTime(0, now);
    bus.gain.gain.linearRampToValueAtTime(1, now + 1.2);
    audio.cur = bus;
  }

  function stopSound() {
    if (audio.cur) { audio.cur.stop(0.5); audio.cur = null; }
  }

  /* ———————————————— visuals ———————————————— */
  const cv = $("#work-canvas");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, S = 0, dpr = 1, raf = 0, lastTs = 0, T = 0, switchFx = 0;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let scene = {};

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight; S = Math.min(W, H * 1.25);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene(prefs.channel);
  }

  const WHITE = (a) => "rgba(240,240,240," + a.toFixed(3) + ")";
  const RED = (a) => "rgba(255,59,59," + a.toFixed(3) + ")";

  // point on a tilted ellipse (focus at the system centre when e > 0)
  function orbitPt(o, th, cx, cy) {
    const a = o.a * S, b = a * o.k;
    const x = Math.cos(th) * a - o.e * a, y = Math.sin(th) * b;
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    return [cx + x * c - y * s, cy + x * s + y * c];
  }
  function strokeOrbit(o, cx, cy, alpha, dash) {
    const a = o.a * S, b = a * o.k;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(o.rot);
    ctx.beginPath(); ctx.ellipse(-o.e * a, 0, a, b, 0, 0, Math.PI * 2);
    ctx.strokeStyle = WHITE(alpha); ctx.lineWidth = 1;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }
  function bodyWithTrail(o, th, cx, cy, color) {
    const N = 26;
    ctx.lineWidth = o.size > 2.4 ? 1.6 : 1.2;
    let prev = orbitPt(o, th - o.trail, cx, cy);
    for (let i = 1; i <= N; i++) {
      const p = orbitPt(o, th - o.trail * (1 - i / N), cx, cy);
      ctx.strokeStyle = (color || WHITE)(Math.pow(i / N, 1.6) * 0.95);
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      prev = p;
    }
    ctx.fillStyle = (color || WHITE)(1);
    ctx.beginPath(); ctx.arc(prev[0], prev[1], o.size, 0, Math.PI * 2); ctx.fill();
  }

  function orbitSystem() {
    const tilt = -0.36;
    const list = [
      { a: 0.03, k: 0.62, rot: tilt, e: 0, period: 16, size: 1.6, trail: 0.9 },
      { a: 0.045, k: 0.62, rot: tilt, e: 0, period: 30, size: 2.1, trail: 0.8 },
      { a: 0.064, k: 0.62, rot: tilt, e: 0, period: 46, size: 2.2, trail: 0.7 },
      { a: 0.088, k: 0.6, rot: tilt, e: 0.04, period: 80, size: 1.8, trail: 0.6 },
      { a: 0.15, k: 0.58, rot: tilt + 0.04, e: 0.05, period: 140, size: 2.6, trail: 0.85 },
      { a: 0.2, k: 0.57, rot: tilt + 0.02, e: 0.04, period: 210, size: 2.4, trail: 0.7 },
      { a: 0.26, k: 0.56, rot: tilt + 0.05, e: 0.05, period: 300, size: 2.2, trail: 0.9 },
      { a: 0.31, k: 0.55, rot: tilt + 0.03, e: 0.03, period: 380, size: 2.2, trail: 0.6 },
      { a: 0.47, k: 0.33, rot: -0.2, e: 0.3, period: 520, size: 2, trail: 0.45, faint: true },
      { a: 0.62, k: 0.3, rot: 0.2, e: 0.28, period: 640, size: 1.8, trail: 0.35, faint: true },
      { a: 0.5, k: 0.5, rot: -0.62, e: 0.22, period: 560, size: 2.4, trail: 0.55, faint: true },
      { a: 0.75, k: 0.2, rot: -0.08, e: 0.18, period: 900, size: 1.6, trail: 0.25, faint: true },
    ];
    list.forEach((o) => { o.phase = rnd(0, Math.PI * 2); });
    return list;
  }

  function buildScene(id) {
    const cx = W * 0.5, cy = H * 0.47;
    scene = { id, cx, cy };
    if (id === "orbit" || id === "static") scene.orbits = orbitSystem();
    if (id === "rain") {
      const n = Math.round((W * H) / 7000);
      scene.drops = Array.from({ length: n }, () => ({ x: rnd(-0.1, 1.1) * W, y: rnd(0, H), len: rnd(14, 42), v: rnd(520, 900), a: rnd(0.12, 0.5) }));
      scene.ripples = [];
      scene.rippleT = 0;
      scene.horizon = H * 0.5;
    }
    if (id === "fire") { scene.parts = []; scene.spawnT = 0; scene.base = [W * 0.5, H * 0.66]; }
    if (id === "static") scene.glitchT = 0;
    if (id === "lofi") scene.wave = new Uint8Array(1024);
  }

  const DRAW = {
    orbit(dt) {
      const { cx, cy } = scene;
      const wob = 1 + Math.sin(T * 0.05) * 0.03;
      scene.orbits.forEach((o) => {
        const oo = Object.assign({}, o, { k: o.k * wob });
        strokeOrbit(oo, cx, cy, o.faint ? 0.22 : 0.42);
        const th = o.phase + (T / o.period) * Math.PI * 2;
        bodyWithTrail(oo, th, cx, cy);
      });
      ctx.fillStyle = WHITE(1);
      ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = WHITE(0.35);
      ctx.beginPath(); ctx.arc(cx, cy, 8 + Math.sin(T * 0.8) * 1.2, 0, Math.PI * 2); ctx.stroke();
    },
    rain(dt) {
      const { cx } = scene;
      // ground plane: faint perspective ellipses
      for (let i = 1; i <= 5; i++) {
        ctx.strokeStyle = WHITE(0.05 + i * 0.02);
        ctx.beginPath(); ctx.ellipse(cx, H * 0.78, S * 0.12 * i, S * 0.03 * i, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = WHITE(0.18);
      ctx.beginPath(); ctx.moveTo(0, scene.horizon); ctx.lineTo(W, scene.horizon); ctx.stroke();
      // streaks
      const slant = 0.16;
      scene.drops.forEach((d) => {
        d.y += d.v * dt; d.x += d.v * dt * slant;
        if (d.y > H + 40) { d.y = rnd(-80, -10); d.x = rnd(-0.15, 1.05) * W; }
        ctx.strokeStyle = WHITE(d.a);
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * slant, d.y - d.len); ctx.stroke();
      });
      // ripples
      scene.rippleT -= dt;
      if (scene.rippleT <= 0) {
        scene.rippleT = rnd(0.05, 0.22);
        const depth = rnd(0, 1);
        scene.ripples.push({ x: rnd(0.05, 0.95) * W, y: scene.horizon + 18 + depth * (H - scene.horizon - 60), age: 0, life: rnd(1.6, 2.6), r: S * (0.03 + depth * 0.07) });
      }
      scene.ripples = scene.ripples.filter((r) => (r.age += dt) < r.life);
      scene.ripples.forEach((r) => {
        const p = r.age / r.life;
        [1, 0.62].forEach((m, j) => {
          const q = Math.max(0, p - j * 0.12);
          if (q <= 0) return;
          ctx.strokeStyle = WHITE((1 - q) * 0.55);
          ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * q * m + 1, r.r * q * m * 0.3 + 0.5, 0, 0, Math.PI * 2); ctx.stroke();
        });
      });
    },
    fire(dt) {
      const [bx, by] = scene.base;
      for (let i = 1; i <= 7; i++) {
        ctx.strokeStyle = WHITE(0.5 - i * 0.055);
        ctx.beginPath(); ctx.ellipse(bx, by, S * 0.022 * i, S * 0.006 * i, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // logs as crossing lines
      ctx.strokeStyle = WHITE(0.55);
      ctx.beginPath(); ctx.moveTo(bx - S * 0.09, by + S * 0.012); ctx.lineTo(bx + S * 0.07, by - S * 0.016); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + S * 0.09, by + S * 0.012); ctx.lineTo(bx - S * 0.07, by - S * 0.016); ctx.stroke();
      // flame: nested tall ellipses breathing
      for (let i = 0; i < 4; i++) {
        const h = S * (0.13 - i * 0.022) * (1 + 0.12 * Math.sin(T * (3.1 + i) + i) + 0.06 * Math.sin(T * 7.3 + i * 2));
        const w = S * (0.042 - i * 0.007) * (1 + 0.08 * Math.sin(T * 4.2 + i));
        const sway = Math.sin(T * 1.7 + i) * S * 0.006;
        ctx.strokeStyle = WHITE(0.32 + i * 0.12);
        ctx.beginPath(); ctx.ellipse(bx + sway, by - h, w, h, Math.sin(T * 1.3 + i) * 0.06, 0, Math.PI * 2); ctx.stroke();
      }
      // spiralling embers with trails
      scene.spawnT -= dt;
      while (scene.spawnT <= 0) {
        scene.spawnT += 0.06;
        scene.parts.push({ age: 0, life: rnd(1.8, 3.6), r0: rnd(0.01, 0.05) * S, w: rnd(1.5, 3.2) * (Math.random() < 0.5 ? -1 : 1), ph: rnd(0, 6.28), v: rnd(0.12, 0.26) * S, red: Math.random() < 0.08 });
      }
      const pos = (p, age) => {
        const r = p.r0 * (1 - age / p.life * 0.7);
        return [bx + Math.cos(p.ph + p.w * age) * r, by - S * 0.04 - p.v * age, r];
      };
      scene.parts = scene.parts.filter((p) => (p.age += dt) < p.life);
      scene.parts.forEach((p) => {
        const fade = 1 - p.age / p.life;
        const col = p.red ? RED : WHITE;
        let prev = pos(p, Math.max(0, p.age - 0.5));
        for (let i = 1; i <= 10; i++) {
          const q = pos(p, Math.max(0, p.age - 0.5 * (1 - i / 10)));
          ctx.strokeStyle = col(fade * (i / 10) * 0.7);
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
          prev = q;
        }
        ctx.fillStyle = col(fade);
        ctx.beginPath(); ctx.arc(prev[0], prev[1], p.red ? 1.8 : 1.3, 0, Math.PI * 2); ctx.fill();
      });
    },
    static(dt) {
      const { cx, cy } = scene;
      scene.glitchT -= dt;
      const jitter = scene.glitchT <= 0 && Math.random() < 0.06;
      if (jitter) scene.glitchT = rnd(0.1, 0.3);
      scene.orbits.forEach((o, i) => {
        if (i > 8) return;
        const off = scene.glitchT > 0 ? rnd(-14, 14) : 0;
        strokeOrbit(o, cx + off, cy, 0.18 + Math.random() * 0.12, i % 3 === 0 ? [2, 6] : null);
        const th = o.phase + (T / o.period) * Math.PI * 2 + (Math.random() < 0.02 ? rnd(-0.6, 0.6) : 0);
        const p = orbitPt(o, th, cx + off, cy);
        ctx.fillStyle = WHITE(0.9);
        ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
      });
      // snow: short dashes
      const n = Math.round((W * H) / 2600);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = WHITE(Math.random() * 0.4);
        ctx.fillRect(Math.random() * W, Math.random() * H, rnd(1, 7), 1);
      }
      // rolling band
      const by = ((T * 60) % (H + 200)) - 100;
      const g = ctx.createLinearGradient(0, by - 60, 0, by + 60);
      g.addColorStop(0, WHITE(0)); g.addColorStop(0.5, WHITE(0.07)); g.addColorStop(1, WHITE(0));
      ctx.fillStyle = g; ctx.fillRect(0, by - 60, W, 120);
      if (scene.glitchT > 0) {
        for (let i = 0; i < 6; i++) { ctx.fillStyle = WHITE(rnd(0.05, 0.25)); ctx.fillRect(0, rnd(0, H), W, rnd(1, 6)); }
      }
    },
    lofi(dt) {
      const cx = W * 0.5, cy = H * 0.5, rot = -0.22, k = 0.4;
      const spin = T * (Math.PI * 2 / 5.4);
      for (let i = 0; i < 26; i++) {
        const r = S * (0.05 + i * 0.0105);
        ctx.strokeStyle = WHITE(i === 0 || i === 25 ? 0.55 : 0.08 + (i % 4 === 0 ? 0.12 : 0.04));
        ctx.beginPath(); ctx.ellipse(cx, cy, r, r * k, rot, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = WHITE(1);
      ctx.beginPath(); ctx.ellipse(cx, cy, 3, 3, 0, 0, Math.PI * 2); ctx.fill();
      // label marker + groove dots spinning with trails
      [0.31, 0.19, 0.12].forEach((rr, j) => {
        const o = { a: rr, k, rot, e: 0, size: j === 0 ? 2.4 : 1.6, trail: 1.1 };
        bodyWithTrail(o, spin * (1 + j * 0.0) + j * 2.1, cx, cy, j === 0 ? WHITE : WHITE);
      });
      // tonearm
      const px = cx + S * 0.36, py = cy - S * 0.2;
      const tip = [cx + S * 0.2 + Math.sin(T * 0.4) * 2, cy + S * 0.02];
      ctx.strokeStyle = WHITE(0.75); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - S * 0.02, py + S * 0.16); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = WHITE(1); ctx.beginPath(); ctx.arc(tip[0], tip[1], 2.2, 0, Math.PI * 2); ctx.fill();
      // waveform from the live analyser (or a gentle synthetic line before sound is on)
      const y0 = H * 0.71, x0 = W * 0.24, x1 = W * 0.76;
      ctx.strokeStyle = WHITE(0.6);
      ctx.beginPath();
      const live = audio.analyser && audio.cur && audio.cur.id === "lofi";
      if (live) audio.analyser.getByteTimeDomainData(scene.wave);
      const N = 160;
      for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * (i / N);
        const env = Math.sin(Math.PI * i / N);
        const v = live ? (scene.wave[Math.floor(i / N * (scene.wave.length - 1))] - 128) / 128 * 4 : Math.sin(i * 0.3 + T * 3) * 0.25 + Math.sin(i * 0.11 - T * 1.7) * 0.2;
        const y = y0 + v * 26 * env;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = WHITE(0.7);
      ctx.fillText((audio.cur && audio.cur.chord) || "Fmaj7", tip[0] + 10, tip[1] + 4);
      ctx.fillStyle = WHITE(0.4);
      ctx.fillText("76 BPM", x1 - 44, y0 + 30);
    },
  };

  function drawSwitchFx(dt) {
    if (switchFx <= 0) return;
    switchFx -= dt;
    const a = Math.max(0, switchFx / 0.42);
    for (let i = 0; i < 14; i++) { ctx.fillStyle = WHITE(rnd(0.05, 0.35) * a); ctx.fillRect(rnd(-50, W * 0.6), rnd(0, H), rnd(W * 0.2, W), rnd(1, 9)); }
    const n = Math.round((W * H) / 1600 * a);
    for (let i = 0; i < n; i++) { ctx.fillStyle = WHITE(Math.random() * 0.5 * a); ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    const speed = (reduce ? 0.35 : 1) * (session && !session.runningSince ? 0.25 : 1);
    T += dt * speed;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    DRAW[scene.id](dt * speed);
    drawSwitchFx(dt);
  }

  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  /* ———————————————— UI ———————————————— */
  function renderLegend() {
    $("#work-legend").innerHTML = CHANNELS.map((c, i) =>
      '<button type="button" class="wl-item' + (c.id === prefs.channel ? " is-on" : "") + '" data-ch="' + c.id + '" aria-pressed="' + (c.id === prefs.channel) + '" title="' + (i + 1) + " · " + esc(c.name) + '">' +
      '<i style="--d:' + c.dot + 'px"></i><span class="mono">' + esc(c.name) + "</span></button>"
    ).join("");
  }

  function renderChannelLabel() {
    const i = CHANNELS.findIndex((c) => c.id === prefs.channel);
    const c = CHANNELS[i];
    $("#work-ch-no").textContent = "CH " + String(i + 1).padStart(2, "0");
    $("#work-ch-name").textContent = c.name + " · " + c.en;
  }

  function setChannel(id, gesture) {
    if (!CHANNELS.some((c) => c.id === id)) return;
    const changed = id !== prefs.channel;
    prefs.channel = id;
    writeJSON(PREF_KEY, prefs);
    renderLegend();
    renderChannelLabel();
    if (changed) { buildScene(id); switchFx = 0.42; }
    if (gesture) ensureAudio();
    if (audio.armed) startSound(id);
    if (changed && Math.random() < 0.6) say(chById(id).line);
  }

  function renderProjectSelect() {
    const sel = $("#work-project");
    const list = core.projects();
    sel.innerHTML = list.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>").join("") +
      '<option value="">더미 프로젝트 (새로 만들기)</option>';
    sel.value = session ? session.pid : "";
    sizeSelect();
  }
  let measureCtx = null;
  function sizeSelect() {
    const sel = $("#work-project");
    const txt = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
    measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
    measureCtx.font = getComputedStyle(sel).font;
    sel.style.width = Math.min(280, Math.ceil(measureCtx.measureText(txt).width) + 20) + "px";
  }

  function renderTodo() {
    const t = $("#work-todo-text");
    const todo = session && session.todo;
    t.textContent = todo || "오늘 할 일을 한 줄 적어줘... (눌러서 쓰기)";
    t.classList.toggle("is-empty", !todo);
    const track = t.parentElement;
    track.classList.remove("is-long");
    requestAnimationFrame(() => {
      if (t.scrollWidth > track.clientWidth + 2) {
        track.classList.add("is-long");
        t.style.setProperty("--tk-dur", Math.max(10, t.scrollWidth / 40) + "s");
      }
    });
  }

  function renderClock() {
    const ms = elapsedMs();
    $("#work-time").textContent = clock(ms);
    $("#work-jd").textContent = "JD " + julian();
    const paused = session && !session.runningSince;
    $("#work-view").classList.toggle("is-paused", !!paused);
    $("#work-rec-label").textContent = paused ? "PAUSE" : "REC";
    $("#work-pause").textContent = paused ? "다시 시작" : "일시정지";
  }

  function renderWallButton() {
    const btn = $("#btn-work");
    const live = !!session;
    btn.classList.toggle("is-live", live);
    $("#btn-work-label").textContent = live ? (session.runningSince ? "작업 중 " : "쉬는 중 ") + clock(elapsedMs()) : "작업 시작하기";
  }

  /* mascot */
  let bubbleTimer = 0;
  function say(text, ms) {
    const b = $("#work-bubble");
    b.textContent = text;
    b.hidden = false;
    b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    $("#work-mate").classList.add("is-talking");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { b.hidden = true; $("#work-mate").classList.remove("is-talking"); }, ms || 6500);
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function mateTick() {
    if (!session || !session.runningSince) return;
    const ms = elapsedMs();
    const min = ms / 60000;
    // say only the latest milestone reached (no burst after a long pause/jump)
    let due = null;
    for (const [m, line] of MILESTONES) {
      if (min >= m && session.said.indexOf(m) < 0) { session.said.push(m); due = line; }
    }
    if (due) { session.nextIdleAt = Math.max(session.nextIdleAt, ms + 5 * 60000); return say(due, 9000); }
    if (min >= 180) {
      const h = Math.floor(min / 60);
      if (session.said.indexOf(h * 60) < 0) { session.said.push(h * 60); session.nextIdleAt = Math.max(session.nextIdleAt, ms + 5 * 60000); return say(h + "시간째... 눈 좀 감았다 떠...", 9000); }
    }
    if (ms >= session.nextIdleAt && $("#work-bubble").hidden) {
      session.nextIdleAt = ms + rnd(5.5, 9) * 60000;
      say(pick(LINES.idle));
    }
  }

  /* ticks */
  let tickTimer = 0, wallTimer = 0, persistAt = 0;
  function tick() {
    if (open) { renderClock(); mateTick(); }
    else renderWallButton();
    if (Date.now() - persistAt > 5000) { persistAt = Date.now(); persistLive(); }
  }
  function ensureTicking() {
    if (!tickTimer) tickTimer = setInterval(tick, 500);
  }

  /* open / close */
  function show() {
    open = true;
    core.clearOverlays();
    const v = $("#work-view");
    v.hidden = false;
    v.classList.remove("is-entering"); void v.offsetWidth; v.classList.add("is-entering");
    document.body.classList.add("is-working");
    if (location.hash !== "#work") history.pushState(null, "", "#work");
    resize();
    startLoop();
    renderLegend(); renderChannelLabel(); renderProjectSelect(); renderTodo(); renderClock(); updateMute();
    ensureTicking();
    if (audio.armed) { if (audio.ctx.state === "suspended") audio.ctx.resume(); startSound(prefs.channel); applyLevel(0.6); }
    else $("#work-sound-hint").hidden = false;
    setTimeout(() => { if (open) say(pick(LINES.start)); }, 1600);
  }

  function openWork(gesture) {
    if (open) return;
    if (!session) newSession();
    if (gesture) ensureAudio();
    if (gesture && !reduce) core.playBroadcast(show, "REC");
    else show();
  }

  function closeWork(fromHash) {
    if (!open) return;
    open = false;
    $("#work-view").hidden = true;
    $("#work-summary").hidden = true;
    $("#work-sessions").hidden = true;
    document.body.classList.remove("is-working");
    stopLoop();
    stopSound();
    applyLevel(0.3);
    if (!fromHash && location.hash === "#work") history.replaceState(null, "", location.pathname + location.search);
    persistLive();
    renderWallButton();
  }

  function togglePause() {
    if (!session) return;
    if (session.runningSince) {
      session.elapsed += Date.now() - session.runningSince;
      session.runningSince = null;
      say(pick(LINES.pause));
    } else {
      session.runningSince = Date.now();
      say(pick(LINES.resume));
    }
    persistLive();
    renderClock();
    applyLevel(0.5);
  }

  function updateMute() {
    const b = $("#work-mute");
    b.setAttribute("aria-pressed", String(!!prefs.muted));
    b.classList.toggle("is-muted", !!prefs.muted);
    $("#work-volume").value = prefs.volume;
  }

  /* sessions */
  function sessions() { return readJSON(SESS_KEY, []); }
  function saveSessions(list) { writeJSON(SESS_KEY, list.slice(0, 200)); }

  let ended = null; // the record just saved by 작업 끝내기

  function endWork() {
    if (!session) return;
    if (session.runningSince) { session.elapsed += Date.now() - session.runningSince; session.runningSince = null; }
    const ms = session.elapsed;
    ended = {
      id: session.id,
      pid: session.pid,
      projectName: projectName(session.pid),
      todo: session.todo,
      memo: "",
      channel: prefs.channel,
      startedAt: session.startedAt,
      endedAt: Date.now(),
      durationMs: ms,
      posted: false,
    };
    const list = sessions().filter((s) => s.id !== ended.id);
    list.unshift(ended);
    saveSessions(list);
    renderClock();
    applyLevel(0.6);
    $("#ws-time").innerHTML = esc(human(ms)) + ' <small>' + clock(ms) + "</small>";
    $("#ws-project").textContent = ended.projectName;
    $("#ws-channel").textContent = chById(ended.channel).name;
    $("#ws-todo").textContent = ended.todo || "—";
    $("#ws-memo").value = "";
    const todayKey = new Date().toDateString();
    const todays = list.filter((s) => new Date(s.endedAt).toDateString() === todayKey);
    const total = todays.reduce((a, s) => a + s.durationMs, 0);
    $("#ws-note").textContent = "오늘 " + todays.length + "번째 방송 · 오늘 합계 " + human(total) + " · 기록은 이 브라우저에 저장돼.";
    $("#ws-post").textContent = session.pid ? "● 업데이트로 올리기" : "● 더미 프로젝트로 올리기";
    $("#work-summary").hidden = false;
    say("수고했어... 오늘도 잘 했어...", 8000);
    setTimeout(() => $("#ws-memo").focus(), 50);
  }

  function finishEnded(patch) {
    if (!ended) return;
    Object.assign(ended, patch || {}, { memo: $("#ws-memo").value.trim() });
    const list = sessions().map((s) => (s.id === ended.id ? ended : s));
    saveSessions(list);
  }

  function clearSession() {
    session = null;
    ended = null;
    localStorage.removeItem(LIVE_KEY);
    renderWallButton();
  }

  function renderSessions() {
    const list = sessions();
    $("#work-sessions-list").innerHTML = list.length ? list.slice(0, 30).map((s) => {
      const d = new Date(s.endedAt);
      const when = (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      return '<li><div class="wsl-top"><b>' + esc(s.projectName) + '</b><span class="mono">' + esc(human(s.durationMs)) + "</span></div>" +
        '<div class="wsl-sub mono">' + esc(when) + " · " + esc(chById(s.channel).name) + (s.posted ? ' · <em>올림</em>' : "") + "</div>" +
        (s.todo ? '<p>' + esc(s.todo) + "</p>" : "") + (s.memo ? '<p class="wsl-memo">“' + esc(s.memo) + "”</p>" : "") + "</li>";
    }).join("") : '<li class="wsl-empty">아직 기록이 없어... 첫 방송 해볼까?</li>';
  }

  /* bindings */
  function bind() {
    $("#btn-work").addEventListener("click", () => openWork(true));
    $("#work-back").addEventListener("click", () => closeWork(false));
    $("#work-pause").addEventListener("click", () => { ensureAudio(); togglePause(); });
    $("#work-end").addEventListener("click", endWork);
    $("#work-legend").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ch]");
      if (b) setChannel(b.getAttribute("data-ch"), true);
    });
    $("#work-mute").addEventListener("click", () => {
      prefs.muted = !prefs.muted;
      writeJSON(PREF_KEY, prefs);
      updateMute();
      ensureAudio();
      applyLevel(0.25);
    });
    $("#work-volume").addEventListener("input", (e) => {
      prefs.volume = Number(e.target.value);
      if (prefs.volume > 0 && prefs.muted) { prefs.muted = false; updateMute(); }
      writeJSON(PREF_KEY, prefs);
      ensureAudio();
      applyLevel(0.08);
    });
    // first gesture anywhere on the page turns sound on (direct #work loads)
    $("#work-view").addEventListener("pointerdown", () => { if (!audio.armed) ensureAudio(); });
    $("#work-project").addEventListener("change", (e) => {
      if (!session) return;
      session.pid = e.target.value;
      const p = session.pid && core.getProject(session.pid);
      if (!session.todo && p && p.nextTodo) session.todo = p.nextTodo;
      sizeSelect(); renderTodo(); persistLive();
      say(p ? p.name + "... 같이 해보자..." : "더미 프로젝트... 새 출발이야...");
    });
    const ticker = $(".wf-ticker");
    const input = $("#work-todo");
    ticker.addEventListener("click", () => {
      if (!session || !input.hidden) return;
      input.value = session.todo || "";
      input.hidden = false;
      ticker.classList.add("is-editing");
      input.focus();
      input.select();
    });
    const commit = () => {
      if (input.hidden) return;
      session.todo = input.value.trim();
      input.hidden = true;
      ticker.classList.remove("is-editing");
      renderTodo(); persistLive();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); input.hidden = true; ticker.classList.remove("is-editing"); }
    });
    input.addEventListener("blur", commit);
    $("#work-mate-btn").innerHTML = core.mascotSVG();
    $("#work-mate-btn").addEventListener("click", () => say(pick(LINES.poke), 4000));
    $("#work-sessions-btn").addEventListener("click", () => {
      const el = $("#work-sessions");
      el.hidden = !el.hidden;
      if (!el.hidden) renderSessions();
    });
    $('[data-work-close="sessions"]').addEventListener("click", () => { $("#work-sessions").hidden = true; });

    $("#ws-post").addEventListener("click", () => {
      if (!ended) return;
      finishEnded({ posted: true });
      const rec = ended;
      const memo = rec.memo;
      const desc = [
        rec.todo ? "오늘 할 일: " + rec.todo : "",
        memo,
        "— 작업 메이트 · " + chById(rec.channel).name + " 채널 · " + clock(rec.durationMs),
      ].filter(Boolean).join("\n");
      clearSession();
      closeWork(false);
      core.postWorkSession(rec.pid, { title: "작업 메이트 · " + human(rec.durationMs), description: desc, mood: "😊" });
    });
    $("#ws-save").addEventListener("click", () => {
      finishEnded();
      clearSession();
      closeWork(false);
    });
    $("#ws-resume").addEventListener("click", () => {
      if (!ended || !session) return;
      saveSessions(sessions().filter((s) => s.id !== ended.id));
      ended = null;
      $("#work-summary").hidden = true;
      session.runningSince = Date.now();
      persistLive(); renderClock(); applyLevel(0.5);
      say(pick(LINES.resume));
    });

    document.addEventListener("keydown", (e) => {
      if (!open) return;
      const typing = e.target.closest && e.target.closest("input, textarea, select");
      if (e.key === "Escape") {
        if (!$("#work-sessions").hidden) { $("#work-sessions").hidden = true; return; }
        if (!$("#work-summary").hidden) { $("#ws-resume").click(); return; }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || !$("#work-summary").hidden) return;
      const n = Number(e.key);
      if (n >= 1 && n <= CHANNELS.length) setChannel(CHANNELS[n - 1].id, true);
      else if (e.key === " ") { e.preventDefault(); ensureAudio(); togglePause(); }
      else if (e.key === "m") $("#work-mute").click();
    });
    window.addEventListener("resize", () => { if (open) resize(); });
    window.addEventListener("hashchange", () => {
      if (location.hash === "#work") openWork(false);
      else if (open) closeWork(true);
    });
    window.addEventListener("pagehide", persistLive);
    document.addEventListener("visibilitychange", () => { if (document.hidden) persistLive(); });
  }

  function restore() {
    const live = readJSON(LIVE_KEY, null);
    if (live && live.id) {
      session = Object.assign({ said: [], nextIdleAt: 7 * 60000 }, live, { runningSince: live.running ? Date.now() : null });
      delete session.running;
      if (session.pid && !core.getProject(session.pid)) session.pid = "";
      ensureTicking();
    }
    renderWallButton();
    if (location.hash === "#work") openWork(false);
  }

  bind();
  restore();

  // test / debug surface
  window.TVArchive = window.TVArchive || {};
  window.TVArchive.work = {
    open: () => openWork(false),
    close: () => closeWork(false),
    setChannel: (id) => setChannel(id, false),
    say: (t) => say(t),
    addMinutes: (m) => { if (session) { session.elapsed += m * 60000; tick(); } },
    end: endWork,
    state: () => ({ open, channel: prefs.channel, session: session && Object.assign({}, session, { elapsedMs: elapsedMs() }), sessions: sessions(), audio: audio.ctx ? audio.ctx.state : "none", playing: audio.cur ? audio.cur.id : null }),
  };
})();
