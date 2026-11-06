(() => {
  const STORAGE_KEY = "project-archive-v1";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  let state = load();
  let activeCat = "__all";
  let selectedId = null;
  let activePart = "__all";
  let searchQ = "";
  let catsEditing = false;
  let pendingFileName = "";

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return structuredClone(window.ARCHIVE_SEED);
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function mediaLabel(t) {
    if (t === "video") return "영상";
    if (t === "model3d") return "3D";
    return "이미지";
  }
  function statusClass(s) {
    if (s === "보류") return "hold";
    if (s === "완료") return "done";
    return "ing";
  }
  function fmtDate(d) {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${y}.${m}.${day}`;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function projectStats(p) {
    const parts = p.parts || [];
    const ing = parts.filter((x) => x.status === "진행 중").length;
    return { partCount: parts.length, ing };
  }

  function lastUpdated(p) {
    return p.updated || p.started || "";
  }

  function filteredProjects() {
    let list = state.projects.slice();
    if (activeCat !== "__all") {
      list = list.filter((p) => p.category === activeCat);
    }
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter((p) => {
        const hay = [
          p.name,
          p.category,
          p.status,
          ...(p.parts || []).map((x) => x.name),
          ...(p.updates || []).flatMap((u) => [u.title, u.detail]),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    list.sort((a, b) => (lastUpdated(b) || "").localeCompare(lastUpdated(a) || ""));
    return list;
  }

  function getProject(id) {
    return state.projects.find((p) => p.id === id);
  }

  /* —— Render categories —— */
  function renderCats() {
    const wrap = $("#cat-tabs");
    const cats = ["__all", ...state.categories];
    wrap.innerHTML = cats
      .map((c) => {
        const label = c === "__all" ? "전체" : c;
        const active = activeCat === c ? "is-active" : "";
        const x =
          c === "__all"
            ? ""
            : `<span class="cat-x" data-del-cat="${escapeHtml(c)}" title="삭제">×</span>`;
        return `<button type="button" class="cat-tab ${active}" data-cat="${escapeHtml(c)}" role="tab">${escapeHtml(label)}${x}</button>`;
      })
      .join("");
  }

  /* —— Render grid —— */
  function renderGrid() {
    const grid = $("#project-grid");
    const list = filteredProjects();
    const cards = list
      .map((p) => {
        const st = projectStats(p);
        const sel = selectedId === p.id ? "is-selected" : "";
        return `
        <article class="pcard ${sel}" data-id="${p.id}" tabindex="0">
          <div class="pcard-thumb">
            <img src="${escapeHtml(p.cover)}" alt="" loading="lazy" />
            <span class="media-badge ${escapeHtml(p.mediaType || "image")}">${mediaLabel(p.mediaType)}</span>
          </div>
          <div class="pcard-body">
            <p class="pcard-cat">${escapeHtml(p.category)}</p>
            <h3 class="pcard-name">${escapeHtml(p.name)}</h3>
            <div class="pcard-meta">
              <span class="status-dot ${statusClass(p.status)}"></span>
              <span>${escapeHtml(p.status)}</span>
              <span>·</span>
              <span>${fmtDate(lastUpdated(p))}</span>
            </div>
            <p class="pcard-stats">파트 ${st.partCount} · 진행 중 ${st.ing}</p>
          </div>
        </article>`;
      })
      .join("");

    const newCard = `<button type="button" class="pcard-new" id="btn-new-project">
        <div class="plus">+</div>
        <span>새 프로젝트</span>
      </button>`;
    grid.innerHTML = newCard + cards;
  }

  /* —— Detail pane —— */
  function renderDetail() {
    const empty = $("#detail-empty");
    const body = $("#detail-body");
    const p = selectedId ? getProject(selectedId) : null;
    if (!p) {
      empty.classList.remove("hidden");
      body.classList.add("hidden");
      body.innerHTML = "";
      return;
    }
    empty.classList.add("hidden");
    body.classList.remove("hidden");

    if (!p.parts.some((x) => x.id === activePart) && activePart !== "__all") {
      activePart = "__all";
    }

    const updates = (p.updates || [])
      .filter((u) => activePart === "__all" || u.partId === activePart)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    const partTabs = [
      `<button type="button" class="part-tab ${activePart === "__all" ? "is-active" : ""}" data-part="__all">전체</button>`,
      ...p.parts.map(
        (pt) =>
          `<button type="button" class="part-tab ${activePart === pt.id ? "is-active" : ""}" data-part="${pt.id}">${escapeHtml(pt.name)}</button>`
      ),
      `<button type="button" class="part-tab add" id="btn-add-part">+ 파트</button>`,
    ].join("");

    const timeline =
      updates.length === 0
        ? `<p class="tl-empty">이 파트에 업데이트가 아직 없어요.</p>`
        : updates
            .map((u) => {
              const part = p.parts.find((x) => x.id === u.partId);
              const mediaHtml = (u.media || [])
                .map((m) => {
                  if (m.type === "image" && m.src)
                    return `<img src="${escapeHtml(m.src)}" alt="" />`;
                  if (m.type === "video")
                    return m.src
                      ? `<img src="${escapeHtml(m.src)}" alt="영상" title="영상" />`
                      : `<div class="media-chip">▶ 영상</div>`;
                  if (m.type === "model3d")
                    return m.src
                      ? `<img src="${escapeHtml(m.src)}" alt="3D" title="3D" />`
                      : `<div class="media-chip">⬡ 3D</div>`;
                  return "";
                })
                .join("");

              return `
              <article class="tl-item">
                <p class="tl-date">${fmtDate(u.date)}</p>
                <h4 class="tl-title">${escapeHtml(u.title)}${
                part && activePart === "__all"
                  ? `<span class="tl-part-tag">${escapeHtml(part.name)}</span>`
                  : ""
              }</h4>
                ${u.detail ? `<p class="tl-detail">${escapeHtml(u.detail)}</p>` : ""}
                ${mediaHtml ? `<div class="tl-media">${mediaHtml}</div>` : ""}
              </article>`;
            })
            .join("");

    body.innerHTML = `
      <img class="detail-cover" src="${escapeHtml(p.cover)}" alt="" />
      <div class="detail-head">
        <p class="detail-cat">${escapeHtml(p.category)}</p>
        <h2 class="detail-title">${escapeHtml(p.name)}</h2>
        <div class="detail-status-row">
          <span class="status-dot ${statusClass(p.status)}"></span>
          <span>${escapeHtml(p.status)}</span>
        </div>
        <div class="detail-dates">
          <span>시작 ${fmtDate(p.started)}</span>
          <span>최근 업데이트 ${fmtDate(p.updated)}</span>
        </div>
      </div>
      <div class="part-tabs">${partTabs}</div>
      <button type="button" class="btn-add-update" id="btn-open-update">+ 업데이트 추가</button>
      <div class="timeline">${timeline}</div>
    `;
  }

  function renderAll() {
    document.body.classList.toggle("cats-editing", catsEditing);
    $("#btn-edit-cats").classList.toggle("is-on", catsEditing);
    $("#btn-edit-cats").textContent = catsEditing ? "완료" : "편집";
    renderCats();
    renderGrid();
    renderDetail();
  }

  /* —— Modals —— */
  function openModal(id) {
    const m = $(id);
    m.hidden = false;
    document.body.classList.add("modal-open");
  }
  function closeModal(el) {
    const m = el.closest(".modal");
    if (!m) return;
    m.hidden = true;
    if ($$(".modal:not([hidden])").length === 0) {
      document.body.classList.remove("modal-open");
    }
  }
  function closeAllModals() {
    $$(".modal").forEach((m) => (m.hidden = true));
    document.body.classList.remove("modal-open");
  }

  function fillCatSelect(sel) {
    sel.innerHTML = state.categories
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
  }

  function openUpdateModal() {
    const p = getProject(selectedId);
    if (!p) return;
    const sel = $("#fu-part");
    sel.innerHTML = p.parts
      .map((pt) => `<option value="${pt.id}">${escapeHtml(pt.name)}</option>`)
      .join("");
    if (activePart !== "__all") sel.value = activePart;
    $("#fu-title").value = "";
    $("#fu-detail").value = "";
    $("#fu-media-type").value = "image";
    pendingFileName = "";
    const dz = $("#fu-drop");
    dz.classList.remove("has-file");
    $("p", dz).textContent = "파일을 끌어다 놓거나 클릭해서 선택";
    openModal("#modal-update");
    setTimeout(() => $("#fu-title").focus(), 50);
  }

  /* —— Events —— */
  $("#cat-tabs").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-cat]");
    if (del) {
      e.stopPropagation();
      const name = del.dataset.delCat;
      if (!confirm(`「${name}」 카테고리를 삭제할까요?\n(해당 프로젝트는 남아 있어요)`)) return;
      state.categories = state.categories.filter((c) => c !== name);
      if (activeCat === name) activeCat = "__all";
      save();
      renderAll();
      return;
    }
    const tab = e.target.closest("[data-cat]");
    if (!tab) return;
    activeCat = tab.dataset.cat;
    renderAll();
  });

  $("#btn-edit-cats").addEventListener("click", () => {
    catsEditing = !catsEditing;
    renderAll();
  });

  $("#btn-add-cat").addEventListener("click", () => {
    $("#fc-name").value = "";
    openModal("#modal-cat");
    setTimeout(() => $("#fc-name").focus(), 50);
  });

  $("#project-grid").addEventListener("click", (e) => {
    if (e.target.closest("#btn-new-project")) {
      fillCatSelect($("#fp-cat"));
      $("#fp-name").value = "";
      $("#fp-status").value = "진행 중";
      openModal("#modal-project");
      setTimeout(() => $("#fp-name").focus(), 50);
      return;
    }
    const card = e.target.closest(".pcard[data-id]");
    if (!card) return;
    selectedId = card.dataset.id;
    activePart = "__all";
    renderAll();
  });

  $("#project-grid").addEventListener("keydown", (e) => {
    const card = e.target.closest(".pcard[data-id]");
    if (!card) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectedId = card.dataset.id;
      activePart = "__all";
      renderAll();
    }
  });

  $("#detail-body").addEventListener("click", (e) => {
    const partBtn = e.target.closest("[data-part]");
    if (partBtn) {
      activePart = partBtn.dataset.part;
      renderDetail();
      return;
    }
    if (e.target.closest("#btn-add-part")) {
      $("#fpart-name").value = "";
      openModal("#modal-part");
      setTimeout(() => $("#fpart-name").focus(), 50);
      return;
    }
    if (e.target.closest("#btn-open-update")) {
      openUpdateModal();
    }
  });

  $("#search").addEventListener("input", (e) => {
    searchQ = e.target.value;
    renderGrid();
  });

  // modal close
  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) closeModal(e.target);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });

  // dropzone
  const drop = $("#fu-drop");
  drop.addEventListener("click", () => $("#fu-file").click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("is-drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-drag");
    const f = e.dataTransfer.files?.[0];
    if (f) setPendingFile(f.name);
  });
  $("#fu-file").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f.name);
  });
  function setPendingFile(name) {
    pendingFileName = name;
    drop.classList.add("has-file");
    $("p", drop).textContent = `선택됨: ${name}`;
  }

  $("#form-update").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = getProject(selectedId);
    if (!p) return;
    const mediaType = $("#fu-media-type").value;
    const media = [];
    if (mediaType !== "none") {
      // reuse a placeholder thumb for mock
      const thumbs = [
        "images/th-02.jpg",
        "images/th-12.jpg",
        "images/th-13.jpg",
        "images/th-14.jpg",
        "images/th-15.jpg",
      ];
      media.push({
        type: mediaType,
        src: thumbs[Math.floor(Math.random() * thumbs.length)],
        name: pendingFileName || undefined,
      });
    }
    const today = new Date();
    const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    p.updates.unshift({
      id: uid("u"),
      partId: $("#fu-part").value,
      date: ds,
      title: $("#fu-title").value.trim(),
      detail: $("#fu-detail").value.trim(),
      media,
    });
    p.updated = ds;
    // bump part status to 진행 중 if was 보류
    const part = p.parts.find((x) => x.id === $("#fu-part").value);
    if (part && part.status === "보류") part.status = "진행 중";
    if (p.status === "보류") p.status = "진행 중";
    save();
    closeAllModals();
    renderAll();
  });

  $("#form-project").addEventListener("submit", (e) => {
    e.preventDefault();
    const today = new Date();
    const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const covers = [
      "images/th-01.jpg",
      "images/th-03.jpg",
      "images/th-09.jpg",
      "images/th-11.jpg",
      "images/th-13.jpg",
    ];
    const proj = {
      id: uid("p"),
      name: $("#fp-name").value.trim(),
      category: $("#fp-cat").value,
      status: $("#fp-status").value,
      cover: covers[Math.floor(Math.random() * covers.length)],
      mediaType: "image",
      started: ds,
      updated: ds,
      parts: [{ id: uid("pt"), name: "메인", status: $("#fp-status").value }],
      updates: [],
    };
    state.projects.unshift(proj);
    selectedId = proj.id;
    activePart = "__all";
    activeCat = "__all";
    save();
    closeAllModals();
    renderAll();
  });

  $("#form-cat").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#fc-name").value.trim();
    if (!name) return;
    if (state.categories.includes(name)) {
      alert("이미 있는 카테고리예요.");
      return;
    }
    state.categories.push(name);
    activeCat = name;
    save();
    closeAllModals();
    renderAll();
  });

  $("#form-part").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = getProject(selectedId);
    if (!p) return;
    const name = $("#fpart-name").value.trim();
    const part = { id: uid("pt"), name, status: "진행 중" };
    p.parts.push(part);
    activePart = part.id;
    save();
    closeAllModals();
    renderAll();
  });

  // expose for screenshots / debugging
  window.__archive = {
    select(id) {
      selectedId = id;
      activePart = "__all";
      renderAll();
    },
    openUpdate: openUpdateModal,
    setCatsEditing(v) {
      catsEditing = !!v;
      renderAll();
    },
    openAddCat() {
      $("#fc-name").value = "";
      openModal("#modal-cat");
    },
    state: () => state,
  };

  renderAll();
})();
