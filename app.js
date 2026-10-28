// app.js — AI Motion Studio
// 상태: projects 배열을 localStorage에 저장. 이미지·영상은 IndexedDB. 지식 데이터는 data/knowledge.js (window.KNOWLEDGE).
// 작업 단계: 1 기획 → 2 스타일프레임 → 3 캐릭터 시트 → 4 샷 이미지 → 5 애니메틱 → 6 영상화 → 7 편집·AE
(function () {
  "use strict";

  const K = window.KNOWLEDGE;
  const STORAGE_KEY = "ai-motion-studio:v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const newId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtTime = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.round(sec % 60))}`;

  // ── 상태 ──────────────────────────────────────────
  function newProject(name) {
    return normalizeProject({ name });
  }

  function normalizeShot(s) {
    const images = arr(s.images), videos = arr(s.videos);
    return {
      ...s,
      id: String(s.id || newId()),
      type: str(s.type) || K.shots[0].ko,
      duration: Number(s.duration) > 0 ? Number(s.duration) : 3,
      description: typeof s.description === "string" ? s.description : "",
      ko: s.ko || "", en: s.en || "", images, pick: images.includes(s.pick) ? s.pick : null,
      vko: s.vko || "", ven: s.ven || "", videos, take: videos.includes(s.take) ? s.take : null,
      // 엔드 프레임 후보 (영상이 끝나는 장면) — 받는 영상 모델이면 시작 → 끝 사이를 잇는다
      endImages: arr(s.endImages), endPick: arr(s.endImages).includes(s.endPick) ? s.endPick : null,
      // 샷 이미지 레퍼런스: refs 가 null 이면 자동(스타일프레임 + 캐릭터 시트), 배열이면 직접 고른 것
      refs: Array.isArray(s.refs) ? s.refs : null,
      refFiles: arr(s.refFiles), // 이 컷에 직접 올린 레퍼런스 이미지
      videoModel: s.videoModel || null, // 이 컷만의 영상 모델 (비우면 기본)
      // 스토리보드: 구도 스케치(SVG) + 연출 메모
      board: isObj(s.board) ? { svg: str(s.board.svg), action: s.board.action || "", camera: s.board.camera || "", sound: s.board.sound || "", transition: s.board.transition || "" } : null,
      // 애니메틱 편집기: 카메라 무빙·들어오는 전환. null 이면 스토리보드 연출 메모로 짐작한 값을 쓴다
      edit: isObj(s.edit) ? normEdit(s.edit) : null,
      // 기획 시나리오의 어느 장면에서 왔는지 (기획을 고치면 이 컷에 반영). descAuto = 기획에서 자동으로 채운 설명
      sceneId: s.sceneId || null, descAuto: typeof s.descAuto === "string" ? s.descAuto : null
    };
  }

  function normEdit(e) {
    const E = K.editing;
    return {
      move: E.moves.some((m) => m.id === e.move) ? e.move : "none",
      strength: E.strengths.some((x) => x.v === Number(e.strength)) ? Number(e.strength) : 1,
      trans: E.transitions.some((t) => t.id === e.trans) ? e.trans : "cut",
      transDur: Math.min(2, Math.max(0.1, Math.round((Number(e.transDur) || 0.5) * 10) / 10)),
      // 최종 편집: 영상 속도(배)·거꾸로 재생
      speed: Math.min(4, Math.max(0.1, Math.round((Number(e.speed) || 1) * 100) / 100)),
      reverse: !!e.reverse
    };
  }

  // 타임라인 메모: 컷에 붙어 있어 컷 순서·길이를 바꿔도 따라간다. off = 컷 안의 초, t = 마지막으로 알던 전체 시간(컷이 지워졌을 때)
  function normalizeNote(n) {
    return {
      id: String(n.id || newId()), shotId: n.shotId || null, off: Math.max(0, Number(n.off) || 0), t: Math.max(0, Number(n.t) || 0),
      text: str(n.text), done: !!n.done, created: Number(n.created) || Date.now()
    };
  }

  // 스토리보드 연출 메모(카메라·전환)에서 처음 값을 짐작한다
  function guessEdit(s) {
    const cam = s.board?.camera || "", tr = s.board?.transition || "";
    const move = /줌\s*인|푸시|다가|push|zoom in|dolly in/i.test(cam) ? "push"
      : /줌\s*아웃|풀\s*백|물러|pull|zoom out|dolly out/i.test(cam) ? "pull"
      : /틸트\s*업|tilt up/i.test(cam) ? "up" : /틸트\s*다운|tilt down/i.test(cam) ? "down"
      : /팬|트래킹|pan|track/i.test(cam) ? (/왼|left/i.test(cam) ? "panL" : "panR")
      : /핸드헬드|흔들|handheld|shake/i.test(cam) ? "handheld" : "none";
    const trans = /디졸브|크로스|dissolve|cross/i.test(tr) ? "dissolve" : /페이드|암전|fade/i.test(tr) ? "fade"
      : /와이프|wipe/i.test(tr) ? "wipe" : /슬라이드|slide/i.test(tr) ? "slide" : /줌|zoom/i.test(tr) ? "zoom" : "cut";
    return normEdit({ move, trans });
  }
  const editOf = (s) => s.edit || guessEdit(s);

  // 기획 시나리오 장면 → 컷 설명
  function sceneText(sc) {
    return [str(sc.title), str(sc.visual)].filter(Boolean).join(" — ");
  }

  function normalizeChar(c) {
    const images = arr(c.images), refs = arr(c.refs);
    return {
      ...c, id: String(c.id || newId()), name: c.name || "", desc: c.desc || "",
      expressions: c.expressions ?? "기쁨, 놀람, 화남, 슬픔", props: c.props || "",
      refs, // 기준 이미지 후보 (캐릭터 원본)
      basePick: refs.includes(c.basePick) ? c.basePick : refs.at(-1) || null, // ★ 고른 기준 이미지 — 시트는 이걸로 만든다
      // 지금 시트를 만든 기준 이미지 (이전 버전에서 만든 시트는 첫 기준 이미지로 본다)
      sheetBase: c.sheetBase || (images.length ? refs[0] || null : null),
      ko: c.ko || "", en: c.en || "", images, pick: images.includes(c.pick) ? c.pick : null
    };
  }

  // 저장본·가져온 파일 모두 같은 형태로 맞춘다 (빠진 필드 채우기 = 이전 버전 데이터 마이그레이션)
  function normalizeProject(p) {
    const style = isObj(p.style) ? p.style : {};
    const styleImages = arr(style.images);
    // 이전 버전 기획안에는 등장 캐릭터 항목·장면 id 가 없었다
    if (isObj(p.plan?.result)) {
      const r = p.plan.result;
      r.characters = arr(r.characters);
      r.scenario = arr(r.scenario).filter(isObj);
      r.scenario.forEach((sc) => { if (!sc.id) sc.id = newId(); });
      // 이 기획안으로 만든 컷이면 순서대로 장면과 이어 둔다 (기획을 고치면 컷에 반영되도록)
      const shots = arr(p.shots).filter(isObj);
      if (shots.length === r.scenario.length && shots.every((s) => !s.sceneId) && p.boardFrom && p.boardFrom === p.plan.generatedAt) {
        shots.forEach((s, i) => {
          s.sceneId = r.scenario[i].id;
          if (s.description === sceneText(r.scenario[i])) s.descAuto = s.description;
        });
      }
    }
    return {
      ...p,
      id: String(p.id || newId()),
      name: String(p.name || "이름 없는 프로젝트"),
      createdAt: Number(p.createdAt) || Date.now(),
      logs: arr(p.logs).filter(isObj),
      prompt: isObj(p.prompt) ? p.prompt : {},
      plan: isObj(p.plan) ? { ...p.plan, images: arr(p.plan.images) } : { images: [] },
      style: { ...style, ko: style.ko || "", en: style.en || "", images: styleImages, pick: styleImages.includes(style.pick) ? style.pick : null, skipChars: arr(style.skipChars) },
      characters: arr(p.characters).filter(isObj).map(normalizeChar),
      noChars: !!p.noChars,
      shots: arr(p.shots).filter(isObj).map(normalizeShot),
      notes: arr(p.notes).filter(isObj).map(normalizeNote),
      usage: arr(p.usage).filter(isObj), // Higgsfield 크레딧 사용 기록
      timeline: isObj(p.timeline) ? p.timeline : {}, // 애니메틱·편집 타임라인 순서와 뺀 컷 (없으면 컷 그대로)
      clips: arr(p.clips).filter((c) => isObj(c) && c.id && c.shotId && c.media) // 타임라인에 더 넣은 클립
    };
  }

  // 프로젝트가 가진 모든 이미지·영상 id
  const mediaIds = (p) => [
    ...p.plan.images, ...p.style.images, ...p.characters.flatMap((c) => [...c.refs, ...c.images]),
    ...p.shots.flatMap((s) => [...s.images, ...s.videos, ...s.refFiles, ...s.endImages]), ...p.logs.flatMap((l) => arr(l.images))
  ];
  const allMediaIds = (projects) => projects.flatMap(mediaIds);

  // 프롬프트 템플릿은 프로젝트와 무관하게 앱 전체에서 공유한다
  const isTemplate = (t) => isObj(t) && typeof t.name === "string" && t.name && isObj(t.data);
  const isTerm = (t) => isObj(t) && typeof t.ko === "string" && t.ko.trim() && typeof t.cat === "string";

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const projects = Array.isArray(s?.projects) ? s.projects.filter(isObj).map(normalizeProject) : [];
        if (projects.length) {
          s.projects = projects;
          s.templates = arr(s.templates).filter(isTemplate);
          s.customTerms = arr(s.customTerms).filter(isTerm); // 용어 사전에 직접 넣은 용어 (모든 프로젝트 공통)
          if (!s.projects.some((project) => project.id === s.currentId)) s.currentId = s.projects[0].id;
          return s;
        }
      }
    } catch (e) { /* localStorage 사용 불가 시 메모리로 동작 */ }
    const p = newProject("첫 프로젝트");
    return { projects: [p], currentId: p.id, templates: [], customTerms: [] };
  }

  let state = load();

  function save({ undo: track = true } = {}) {
    if (track) noteActivity();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { toast("저장 공간이 부족해요"); }
    trackUndo(track);
    queueMicrotask(() => schedulePromptSync()); // 기획·스토리보드가 바뀌었으면 잠시 뒤 샷 프롬프트 자동 반영
  }

  // ── 위쪽 검색 (Ctrl+K): 프로젝트 · 단계 · 지금 프로젝트의 컷 · 용어 ──
  function searchItems(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const has = (...xs) => xs.some((x) => str(x).toLowerCase().includes(q));
    const p = current(), out = [];
    state.projects.filter((x) => has(x.name, x.plan.result?.title, x.plan.topic)).slice(0, 4)
      .forEach((x) => out.push({ group: "프로젝트", title: x.name, sub: x.plan.result?.title || x.plan.topic || "", run: () => openProject(x.id) }));
    K.steps.filter((s) => has(s.title, s.desc)).slice(0, 4)
      .forEach((s) => out.push({ group: "단계", title: s.title, sub: s.desc, run: () => goTab(s.id) }));
    p.shots.map((s, i) => ({ s, i })).filter(({ s }) => has(s.description, s.ko, s.vko, briefOf(s)?.title)).slice(0, 5)
      .forEach(({ s, i }) => out.push({ group: "컷", title: `컷 ${pad2(i + 1)} · ${briefOf(s)?.title || fallbackBrief(s).title || s.type}`, sub: cutText(s.description, 60), run: () => { sxSel = s.id; goTab("shots"); } }));
    [...termByKo.values()].filter((t) => has(t.ko, t.en, t.desc)).slice(0, 4)
      .forEach((t) => out.push({ group: "용어", title: t.ko, sub: `${t.en}${t.desc ? ` — ${t.desc}` : ""}`, run: () => { goTab("shots"); termUi.dock = true; termUi.q = t.ko; termUi.hover = t.ko; renderTermDock(); refreshTermPanels(); $$("[data-term-search]").forEach((i) => (i.value = t.ko)); } }));
    return out;
  }

  const search = { items: [], sel: 0 };
  function renderSearch() {
    const box = $("#searchResults"), q = $("#globalSearch").value;
    search.items = searchItems(q);
    search.sel = Math.min(search.sel, Math.max(0, search.items.length - 1));
    if (!q.trim()) { box.hidden = true; return; }
    let last = "";
    box.innerHTML = search.items.length ? search.items.map((it, i) => {
      const head = it.group !== last ? `<div class="sr-group">${esc(it.group)}</div>` : "";
      last = it.group;
      return `${head}<button type="button" class="sr-item${i === search.sel ? " on" : ""}" data-sr="${i}"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></button>`;
    }).join("") : `<p class="sr-empty">‘${esc(q)}’에 맞는 게 없어요</p>`;
    box.hidden = false;
  }
  function runSearch(i) {
    const it = search.items[i];
    if (!it) return;
    $("#globalSearch").value = "";
    $("#searchResults").hidden = true;
    $("#globalSearch").blur();
    it.run();
  }
  $("#globalSearch").addEventListener("input", () => { search.sel = 0; renderSearch(); });
  $("#globalSearch").addEventListener("focus", renderSearch);
  $("#globalSearch").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); search.sel = (search.sel + (e.key === "ArrowDown" ? 1 : -1) + search.items.length) % Math.max(1, search.items.length); renderSearch(); }
    else if (e.key === "Enter") { e.preventDefault(); runSearch(search.sel); }
    else if (e.key === "Escape") { e.target.value = ""; $("#searchResults").hidden = true; e.target.blur(); }
  });
  $("#searchResults").addEventListener("mousedown", (e) => e.preventDefault());
  $("#searchResults").addEventListener("click", (e) => { const b = e.target.closest("[data-sr]"); if (b) runSearch(Number(b.dataset.sr)); });
  $("#globalSearch").addEventListener("blur", () => setTimeout(() => ($("#searchResults").hidden = true), 120));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || e.code === "KeyK")) { e.preventDefault(); $("#globalSearch").focus(); $("#globalSearch").select(); }
  });

  // 작업한 날 기록 (작업 현황의 '이번 주 작업') — 날짜별 저장 횟수, 최근 60일
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function noteActivity() {
    const a = (state.activity = isObj(state.activity) ? state.activity : {}), k = dayKey();
    a[k] = (a[k] || 0) + 1;
    const keys = Object.keys(a).sort();
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((x) => delete a[x]);
  }

  // ── 되돌리기 (Ctrl+Z) · 다시 하기 (Ctrl+Shift+Z / Ctrl+Y) ──
  // 저장할 때마다 바뀌기 전 프로젝트를 쌓아 둔다 (지금 프로젝트만, 메모리에 최근 80단계).
  // 글자를 연달아 치는 동안(1초 안)은 한 단계로 묶는다. 글 칸 안에서는 브라우저의 글자 되돌리기를 그대로 쓴다.
  const UNDO_MAX = 80;
  const undo = { pid: null, stack: [], redo: [], last: null, lastAt: 0, busy: false };

  function trackUndo(track = true) {
    if (undo.busy || !state.projects?.length) return;
    const p = current(), snap = JSON.stringify(p), now = Date.now();
    if (undo.pid !== p.id) { Object.assign(undo, { pid: p.id, stack: [], redo: [], last: snap, lastAt: 0 }); return; }
    if (snap === undo.last) return;
    // 자동으로 붙는 정보(컷 요약 등)는 단계로 남기지 않고 기준만 맞춘다
    if (!track) { undo.last = snap; return; }
    const typing = document.activeElement?.matches?.("input:not([type=range]):not([type=checkbox]), textarea, [contenteditable]");
    if (!(typing && now - undo.lastAt < 1000)) {
      undo.stack.push(undo.last);
      if (undo.stack.length > UNDO_MAX) undo.stack.shift();
    }
    undo.redo = [];
    undo.last = snap;
    undo.lastAt = now;
  }

  function applyUndo(dir) {
    const p = current();
    if (undo.pid !== p.id) return toast("되돌릴 작업이 없어요");
    const from = dir < 0 ? undo.stack : undo.redo, to = dir < 0 ? undo.redo : undo.stack;
    if (!from.length) return toast(dir < 0 ? "더 되돌릴 작업이 없어요" : "다시 할 작업이 없어요");
    to.push(undo.last);
    const snap = from.pop();
    const i = state.projects.findIndex((x) => x.id === undo.pid);
    const usage = state.projects[i].usage; // 크레딧 사용 기록은 실제로 쓴 것이라 되돌리지 않는다
    state.projects[i] = normalizeProject({ ...JSON.parse(snap), usage });
    undo.busy = true;
    save();
    undo.busy = false;
    undo.last = JSON.stringify(current());
    undo.lastAt = 0;
    renderActive();
    renderProjects();
    toast(dir < 0 ? `되돌렸어요 (남은 ${undo.stack.length}단계 · 다시 하기 Ctrl+Shift+Z)` : `다시 했어요 (Ctrl+Z 로 되돌리기)`);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-undo]");
    if (b) applyUndo(Number(b.dataset.undo));
    if (e.target.closest("#homeBody [data-open-settings]")) openSettings();
  });

  // 되돌리기에 남아 있는 미디어는 지우지 않는다 (되돌렸을 때 이미지가 없어지지 않게)
  const undoUses = (id) => undo.stack.some((s) => s.includes(id)) || undo.redo.some((s) => s.includes(id));

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase(), code = e.code;
    const isZ = k === "z" || code === "KeyZ", isY = k === "y" || code === "KeyY";
    if (!isZ && !isY) return;
    // 글 칸에서는 브라우저가 글자 단위로 되돌린다
    if (e.target.closest?.("input:not([type=range]):not([type=checkbox]):not([type=color]), textarea, select, [contenteditable]")) return;
    e.preventDefault();
    applyUndo(isY || e.shiftKey ? 1 : -1);
  });

  const current = () => state.projects.find((p) => p.id === state.currentId) || state.projects[0];

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    // 긴 문장(오류 설명 등)은 더 오래 보여 준다
    toast._t = setTimeout(() => (t.hidden = true), Math.min(9000, 2400 + String(msg).length * 45));
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  // ── 미디어 저장소 (IndexedDB: 이미지·영상 원본 + 썸네일) ──
  const MEDIA_DB = "ai-motion-studio-images", MEDIA_STORE = "images", THUMB_SIZE = 360;
  const MAX_IMAGE_MB = 30, MAX_VIDEO_MB = 500;
  let dbPromise;

  function openDb() {
    dbPromise ||= new Promise((resolve, reject) => {
      const req = indexedDB.open(MEDIA_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(MEDIA_STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  async function idb(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, mode);
      const req = fn(tx.objectStore(MEDIA_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  const getMedia = (id) => idb("readonly", (s) => s.get(id));
  const putMedia = (rec) => idb("readwrite", (s) => s.put(rec));
  const deleteMedia = (id) => idb("readwrite", (s) => s.delete(id));

  // 비트맵(이미지·영상 프레임) → 작은 JPEG 썸네일
  async function bitmapToJpeg(bmp, maxSide, quality = 0.8) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    // OffscreenCanvas 우선 (화면 렌더링과 무관), 없으면 일반 canvas
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // 투명 PNG 가 JPEG 에서 검게 나오지 않게
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (canvas.convertToBlob) return canvas.convertToBlob({ type: "image/jpeg", quality });
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("thumb"))), "image/jpeg", quality));
  }

  async function imageThumb(blob) {
    const bmp = await createImageBitmap(blob);
    try { return { thumb: await bitmapToJpeg(bmp, THUMB_SIZE), width: bmp.width, height: bmp.height }; } finally { bmp.close?.(); }
  }

  // 영상: 앞부분 한 프레임을 썸네일로, 길이도 함께 읽는다
  async function videoThumb(blob) {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    try {
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("video")); });
      const seek = new Promise((res) => { v.onseeked = res; setTimeout(res, 1500); });
      v.currentTime = Math.min(0.2, (v.duration || 1) / 2);
      await seek;
      const bmp = await createImageBitmap(v);
      try { return { thumb: await bitmapToJpeg(bmp, THUMB_SIZE), width: v.videoWidth, height: v.videoHeight, duration: v.duration }; } finally { bmp.close?.(); }
    } finally { URL.revokeObjectURL(url); }
  }

  async function storeMedia(blob, name, id = newId()) {
    const kind = blob.type.startsWith("video/") ? "video" : "image";
    const meta = kind === "video" ? await videoThumb(blob) : await imageThumb(blob);
    await putMedia({ id, blob, name, type: blob.type, kind, createdAt: Date.now(), ...meta });
    return id;
  }

  async function storeMediaFiles(files, kind) {
    const ids = [];
    for (const file of files) {
      if (!file.type.startsWith(`${kind}/`)) { toast(`'${file.name}'은 ${kind === "video" ? "영상" : "이미지"} 파일이 아니에요`); continue; }
      const max = kind === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
      if (file.size > max * 1024 * 1024) { toast(`'${file.name}'이 ${max}MB보다 커요`); continue; }
      try { ids.push(await storeMedia(file, file.name)); } catch { toast(`'${file.name}'을 읽을 수 없어요`); }
    }
    return ids;
  }

  const thumbUrls = new Map();
  const mediaKinds = new Map();

  // 어떤 프로젝트에서도 쓰이지 않는 미디어만 지운다 (가져온 사본과 공유할 수 있으므로)
  async function cleanupMedia(ids) {
    const used = new Set(allMediaIds(state.projects));
    for (const id of ids || []) {
      if (!id || used.has(id) || undoUses(id)) continue;
      try { await deleteMedia(id); } catch { /* ignore */ }
      if (thumbUrls.has(id)) { URL.revokeObjectURL(thumbUrls.get(id)); thumbUrls.delete(id); }
    }
  }

  async function thumbUrl(id) {
    if (!thumbUrls.has(id)) {
      const rec = await getMedia(id).catch(() => null);
      if (rec) { thumbUrls.set(id, URL.createObjectURL(rec.thumb)); mediaKinds.set(id, rec.kind || "image"); }
    }
    return thumbUrls.get(id) || "";
  }

  async function hydrateThumbs(root) {
    for (const img of $$("img[data-img-id]", root)) {
      const id = img.dataset.imgId;
      const url = await thumbUrl(id);
      const tile = img.closest(".thumb");
      if (url) { img.src = url; tile?.classList.toggle("is-video", mediaKinds.get(id) === "video"); }
      else tile?.classList.add("missing");
    }
  }

  // 미디어 묶음의 주인: "plan", "style", "char:<id>", "shot:<id>", "log:<id>"
  function findOwner(key) {
    const p = current();
    if (key === "plan") return p.plan;
    if (key === "style") return p.style;
    const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const list = { char: p.characters, shot: p.shots, log: p.logs }[kind] || [];
    return list.find((x) => String(x.id) === id);
  }
  // field 별 '선택' 속성: 이미지 후보는 pick, 영상 테이크는 take
  const pickField = (field) => (field === "videos" ? "take" : field === "refs" ? "basePick" : field === "endImages" ? "endPick" : "pick");

  // 썸네일 타일 묶음. pickable 이면 ★ 로 하나를 고를 수 있다
  function mediaGrid(owner, ownerKey, field, { pickable = false, add = true, addLabel, max } = {}) {
    const ids = arr(owner[field]);
    const picked = pickable ? owner[pickField(field)] : null;
    const kind = field === "videos" ? "video" : "image";
    const room = !max || ids.length < max;
    return `<div class="media-grid">${ids.map((id) => `
      <span class="thumb ${picked === id ? "picked" : ""}">
        <img data-img-id="${esc(id)}" alt="" title="크게 보기" />
        ${pickable ? `<button type="button" class="thumb-pick" data-pick="${esc(ownerKey)}|${field}|${esc(id)}" title="${picked === id ? "선택 해제" : "이걸로 선택"}" aria-label="선택">★</button>` : ""}
        <button type="button" class="thumb-del" data-media-del="${esc(ownerKey)}|${field}|${esc(id)}" aria-label="삭제">✕</button>
      </span>`).join("")}
      ${add && room ? `<button type="button" class="media-add" data-media-add="${esc(ownerKey)}|${field}">
        <span>＋</span>${addLabel || (kind === "video" ? "영상 올리기" : "이미지 올리기")}<small>끌어다 놓기 · Ctrl+V</small></button>` : ""}
    </div>`;
  }

  let pendingAdd = null;

  async function attachMedia(ownerKey, field, files) {
    const kind = field === "videos" ? "video" : "image";
    const owner = findOwner(ownerKey);
    if (!owner) return;
    if (ownerKey === "plan") {
      const room = K.planning.maxRefs - owner.images.length;
      if (room <= 0) return toast(`레퍼런스는 ${K.planning.maxRefs}장까지예요`);
      if (files.length > room) { toast(`${K.planning.maxRefs}장까지라 앞의 ${room}장만 붙여요`); files = files.slice(0, room); }
    }
    if (files.length) toast(kind === "video" ? "영상을 읽는 중…" : "이미지를 읽는 중…");
    const ids = await storeMediaFiles(files, kind);
    if (!ids.length) return;
    const target = findOwner(ownerKey);
    if (!target) return cleanupMedia(ids);
    target[field] = [...arr(target[field]), ...ids];
    // 컷에 직접 올린 레퍼런스는 바로 그 컷의 레퍼런스로 쓴다
    if (field === "refFiles") target.refs = [...shotRefs(current(), target), ...ids];
    // 처음 올린 결과는 자동으로 선택해 둔다 (나중에 ★로 바꾸면 됨)
    const pf = pickField(field);
    if ((field === "images" || field === "videos" || field === "endImages") && ownerKey !== "plan" && !ownerKey.startsWith("log:") && !target[pf]) target[pf] = ids[0];
    // 새로 올린 기준 이미지가 곧 시트의 기준이 된다
    if (field === "refs") target.basePick = ids[0];
    save();
    renderActive();
    toast(`${kind === "video" ? "영상" : "이미지"} ${ids.length}개를 올렸어요`);
    // 캐릭터 기준 이미지를 올리면 시트를 자동으로 만든다
    // (두 번째 후보부터는 ★로 고른 뒤 직접 만든다)
    if (field === "refs" && ownerKey.startsWith("char:") && target.refs.length === ids.length) {
      if (genReady("chars")) autoCharacterSheet(target);
      else toast("start.cmd 로 앱을 열면 Higgsfield 로 시트가 자동으로 만들어져요");
    }
  }

  document.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-media-add]");
    if (add) {
      const [ownerKey, field] = add.dataset.mediaAdd.split("|");
      pendingAdd = { ownerKey, field };
      const input = $("#mediaFile");
      input.accept = field === "videos" ? "video/*" : "image/*";
      input.click();
      return;
    }
    const del = e.target.closest("[data-media-del]");
    if (del) {
      const [ownerKey, field, id] = del.dataset.mediaDel.split("|");
      const owner = findOwner(ownerKey);
      if (!owner || !confirm("이 파일을 삭제할까요?")) return;
      owner[field] = arr(owner[field]).filter((x) => x !== id);
      if (field === "refFiles" && Array.isArray(owner.refs)) owner.refs = owner.refs.filter((x) => x !== id);
      const pf = pickField(field);
      if (owner[pf] === id) owner[pf] = owner[field][0] || null;
      save();
      renderActive();
      cleanupMedia([id]);
      return;
    }
    const pick = e.target.closest("[data-pick]");
    if (pick) {
      const [ownerKey, field, id] = pick.dataset.pick.split("|");
      const owner = findOwner(ownerKey);
      if (!owner) return;
      const pf = pickField(field);
      // 기준 이미지는 늘 하나가 골라져 있어야 한다 (해제 없음)
      owner[pf] = owner[pf] === id && field !== "refs" ? null : id;
      save();
      renderActive();
      if (field === "refs" && owner.images?.length && owner.sheetBase !== id) toast("기준 이미지를 바꿨어요. '이 기준으로 시트 만들기'를 누르면 새 시트가 만들어져요");
      return;
    }
    const thumb = e.target.closest("img[data-img-id]");
    if (thumb && !e.target.closest(".nle, [data-ref-toggle], [data-style-char], [data-open-project], .search-results")) openLightbox(thumb.dataset.imgId);
  });

  // 미디어 칸에 파일을 끌어다 놓기
  document.addEventListener("dragover", (e) => {
    const zone = e.target.closest(".media-grid, .ref-grid");
    if (zone && e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); zone.classList.add("drop"); }
  });
  document.addEventListener("dragleave", (e) => e.target.closest?.(".media-grid, .ref-grid")?.classList.remove("drop"));
  document.addEventListener("drop", (e) => {
    const zone = e.target.closest(".media-grid, .ref-grid");
    if (!zone || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    zone.classList.remove("drop");
    const add = $("[data-media-add]", zone);
    if (!add) return toast("더 올릴 수 없어요");
    const [ownerKey, field] = add.dataset.mediaAdd.split("|");
    attachMedia(ownerKey, field, [...e.dataTransfer.files]);
  });

  $("#mediaFile").addEventListener("change", (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    const job = pendingAdd;
    pendingAdd = null;
    if (files.length && job) attachMedia(job.ownerKey, job.field, files);
  });

  async function openLightbox(id) {
    const rec = await getMedia(id).catch(() => null);
    if (!rec) return toast("파일을 찾을 수 없어요");
    const box = $("#lightbox");
    const img = $("img", box), video = $("video", box);
    const url = URL.createObjectURL(rec.blob);
    const isVideo = rec.kind === "video";
    img.hidden = isVideo; video.hidden = !isVideo;
    if (isVideo) { video.src = url; video.play().catch(() => {}); } else { img.src = url; img.alt = rec.name || ""; }
    $("figcaption", box).textContent = rec.name || "";
    box.showModal();
  }
  $("#lightbox").addEventListener("click", (e) => { if (e.target.tagName !== "VIDEO") $("#lightbox").close(); });
  $("#lightbox").addEventListener("close", () => {
    for (const el of [$("#lightbox img"), $("#lightbox video")]) {
      if (el.src) URL.revokeObjectURL(el.src);
      el.removeAttribute("src");
      if (el.tagName === "VIDEO") el.load();
    }
  });

  async function downloadMedia(id, filename) {
    const rec = await getMedia(id).catch(() => null);
    if (!rec) return toast("파일을 찾을 수 없어요");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(rec.blob);
    a.download = filename || rec.name || "image";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ── 프로젝트 바 ──────────────────────────────────
  // 프로젝트 대표 썸네일: 스타일프레임 → 앵커 → 캐릭터 → 기획 레퍼런스
  const projThumb = (p) => p.style.pick || p.shots.map((s) => s.pick || s.images[0]).find(Boolean) || p.characters.map((c) => c.pick || c.refs[0]).find(Boolean) || p.plan.images[0] || null;
  const projTitle = (p) => p.plan.result?.title || p.name;
  function projProgress(p) {
    const st = stageStatus(p), done = K.steps.filter((s) => st[s.id].done).length;
    return { done, total: K.steps.length, state: done === K.steps.length ? "완료" : done || p.plan.topic ? "진행 중" : "대기 중" };
  }
  const recentProjects = () => [...state.projects].sort((a, b) => (b.openedAt || b.createdAt) - (a.openedAt || a.createdAt));

  function renderProjects() {
    const sel = $("#projectSelect");
    sel.innerHTML = `<option disabled>모든 프로젝트 (${state.projects.length})</option>` + recentProjects().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    sel.value = current().id;
    // 사이드바: 최근 프로젝트 5개 (썸네일 + 이름)
    $("#projectList").innerHTML = recentProjects().slice(0, 5).map((p) => `
      <button type="button" class="proj-item${p === current() ? " on" : ""}" data-open-project="${esc(p.id)}" title="${esc(projTitle(p))}">
        <span class="proj-thumb">${projThumb(p) ? `<img data-img-id="${esc(projThumb(p))}" alt="" />` : `<i>${esc((p.name || "?").trim().slice(0, 1))}</i>`}</span>
        <span class="proj-name">${esc(p.name)}</span></button>`).join("");
    hydrateThumbs($("#projectList"));
  }

  function openProject(id) {
    const p = state.projects.find((x) => x.id === id);
    if (!p || p === current()) return;
    if ($("#projectSelect").disabled) return toast("자동 진행 중에는 프로젝트를 바꿀 수 없어요");
    state.currentId = id;
    p.openedAt = Date.now();
    save({ undo: false });
    renderAll();
  }
  $("#projectSelect").addEventListener("change", (e) => openProject(e.target.value));
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-open-project]");
    if (b) { e.preventDefault(); openProject(b.dataset.openProject); }
  });

  $("#newProjectBtn").addEventListener("click", () => {
    const name = prompt("프로젝트 이름", `프로젝트 ${state.projects.length + 1}`);
    if (!name) return;
    const p = newProject(name.trim());
    p.openedAt = Date.now();
    state.projects.push(p);
    state.currentId = p.id;
    save();
    renderAll();
    goTab("plan");
  });

  $("#deleteProjectBtn").addEventListener("click", () => {
    if (state.projects.length === 1) return toast("마지막 프로젝트는 삭제할 수 없어요");
    if (!confirm(`'${current().name}' 프로젝트를 삭제할까요?`)) return;
    const removed = current();
    state.projects = state.projects.filter((p) => p.id !== state.currentId);
    state.currentId = state.projects[0].id;
    save();
    renderAll();
    cleanupMedia(mediaIds(removed));
  });

  // ── 백업: JSON 내보내기 / 가져오기 ───────────────
  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  $("#exportBtn").addEventListener("click", async () => {
    // 이미지는 data URL 로 함께 담는다. 영상은 너무 커서 백업에서 빼고, 편집·AE 패키지로 내보낸다.
    const images = {};
    let skippedVideos = 0;
    const ids = new Set(allMediaIds(state.projects));
    if (ids.size) toast("이미지를 담는 중…");
    for (const id of ids) {
      const rec = await getMedia(id).catch(() => null);
      if (!rec) continue;
      if (rec.kind === "video") { skippedVideos++; continue; }
      images[id] = { name: rec.name, data: await blobToDataUrl(rec.blob) };
    }
    const data = { app: "ai-motion-studio", version: 2, exportedAt: new Date().toISOString(), projects: state.projects, templates: state.templates, customTerms: state.customTerms, images };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-motion-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`${state.projects.length}개 프로젝트, 이미지 ${Object.keys(images).length}장을 백업했어요${skippedVideos ? ` (영상 ${skippedVideos}개는 제외)` : ""}`);
  });

  $("#importBtn").addEventListener("click", () => $("#importFile").click());

  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // 같은 파일을 다시 고를 수 있게
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast("JSON 파일을 읽을 수 없어요"); }
    // 전체 백업({ projects: [...] }) 또는 프로젝트 하나만 담긴 파일 모두 허용
    const incoming = (Array.isArray(data?.projects) ? data.projects : isObj(data) && data.name ? [data] : []).filter(isObj);
    // 템플릿은 같은 이름이 없을 때만 추가한다
    const names = new Set(state.templates.map((t) => t.name));
    const newTemplates = arr(data?.templates).filter((t) => isTemplate(t) && !names.has(t.name));
    // 내가 넣은 용어도 같은 이름이 없을 때만
    const termNames = new Set(state.customTerms.map((t) => t.ko));
    const newTerms = arr(data?.customTerms).filter((t) => isTerm(t) && !termNames.has(t.ko));
    if (newTerms.length) { state.customTerms.push(...newTerms); rebuildTerms(); }
    if (!incoming.length && !newTemplates.length) {
      if (newTerms.length) { save(); return toast(`용어 ${newTerms.length}개를 가져왔어요`); }
      return toast("가져올 프로젝트가 없어요");
    }

    // 이미지: 이 PC에 아직 없는 것만 저장한다
    let failed = 0;
    if (isObj(data.images)) {
      for (const [id, img] of Object.entries(data.images)) {
        if (!isObj(img) || typeof img.data !== "string" || !img.data.startsWith("data:image/")) continue;
        try {
          if (await getMedia(id)) continue;
          await storeMedia(await (await fetch(img.data)).blob(), String(img.name || ""), id);
        } catch { failed++; }
      }
    }
    const imgNote = failed ? ` (이미지 ${failed}장 실패)` : "";
    state.templates.push(...newTemplates.map((t) => ({ name: t.name, data: t.data, savedAt: Number(t.savedAt) || Date.now() })));
    if (!incoming.length) {
      save();
      return toast(`템플릿 ${newTemplates.length}개를 가져왔어요${imgNote}`);
    }

    // 기존 데이터는 덮어쓰지 않고 추가한다. 같은 id가 있으면 새 id와 이름 표시를 붙인다.
    const ids = new Set(state.projects.map((p) => p.id));
    const added = incoming.map(normalizeProject).map((p) => (ids.has(p.id) ? { ...p, id: newId(), name: `${p.name} (가져옴)` } : p));
    added.forEach((p) => ids.add(p.id));
    state.projects.push(...added);
    state.currentId = added[0].id;
    save();
    renderAll();
    toast(`${added.length}개 프로젝트${newTemplates.length ? `, 템플릿 ${newTemplates.length}개` : ""}를 가져왔어요${imgNote}`);
  });

  // ── 탭 · 페이지 머리 ─────────────────────────────
  const stepIndex = (id) => K.steps.findIndex((s) => s.id === id);
  const activeTab = () => $(".tab.active")?.dataset.tab || "home";

  function goTab(tab) {
    const btn = $(`.tab[data-tab="${tab}"]`);
    if (!btn) return;
    if (["select", "edit"].includes(activeTab()) && tab !== activeTab()) stopAnimatic();
    $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
    setPageHead(btn);
    renderActive();
    window.scrollTo({ top: 0 });
  }

  function setPageHead(btn) {
    const step = K.steps[stepIndex(btn.dataset.step)];
    $("#pageStep").textContent = step ? `STEP ${pad2(stepIndex(step.id) + 1)} / ${pad2(K.steps.length)}` : "";
    $("#pageTitle").textContent = step ? step.title : $("span", btn).textContent.trim();
    $("#pageDesc").textContent = step ? step.desc : btn.dataset.desc || "";
    renderPageSide();
  }

  // 화면 머리 오른쪽: 이 단계 상태 + 이전 · 다음 단계
  function renderPageSide() {
    const box = $("#pageSide"), id = $(".tab.active")?.dataset.step;
    if (!box) return;
    const i = stepIndex(id);
    if (!id || i < 0) { box.innerHTML = ""; return; }
    const s = stageStatus(current())[id], prev = K.steps[i - 1], next = K.steps[i + 1];
    box.innerHTML = `
      <div class="ph-nav">
        <button type="button" class="ph-btn" data-goto="${prev?.id || ""}" ${prev ? "" : "disabled"} title="${prev ? `이전: ${esc(prev.title)}` : ""}" aria-label="이전 단계">‹</button>
        ${next ? `<button type="button" class="ph-btn next" data-goto="${next.id}"><small>다음</small>${esc(next.title)} <span aria-hidden="true">→</span></button>` : ""}
      </div>`;
  }

  $$(".tab").forEach((btn) => btn.addEventListener("click", () => goTab(btn.dataset.tab)));
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-goto]");
    if (go) goTab(go.dataset.goto);
  });

  // 각 단계 아래 '다음 단계' 버튼
  function renderStageNext() {
    $$(".stage-next").forEach((el) => {
      const s = K.steps[stepIndex(el.dataset.next)];
      el.innerHTML = s ? `<button type="button" class="next-btn" data-goto="${s.id}">
        <span><small>다음 단계 ${stepIndex(s.id) + 1}</small>${esc(s.title)}</span><b aria-hidden="true">→</b></button>` : "";
    });
  }

  // ── 진행 상황 (체크리스트 대신 실제 작업 결과로 자동 계산) ──
  function stageStatus(p) {
    const n = p.shots.length;
    const count = (fn) => p.shots.filter(fn).length;
    const withImg = count((s) => s.images.length), picked = count((s) => s.pick), taken = count((s) => s.take);
    const charsDone = p.noChars || (p.characters.length > 0 && p.characters.every((c) => c.pick));
    return {
      plan: { done: !!p.plan.result, label: p.plan.result ? "기획안 있음" : "" },
      style: { done: !!p.style.pick, label: p.style.pick ? "선택함" : p.style.images.length ? `후보 ${p.style.images.length}` : p.style.ko ? "프롬프트 작성" : "" },
      chars: { done: charsDone, label: p.noChars ? "건너뜀" : p.characters.length ? `${p.characters.filter((c) => c.pick).length}/${p.characters.length}` : "" },
      board: { done: n > 0 && count((s) => s.board?.svg) === n, label: n ? `${count((s) => s.board?.svg)}/${n}` : "" },
      shots: { done: n > 0 && withImg === n, label: n ? `${withImg}/${n}` : "" },
      select: { done: n > 0 && picked === n, label: n ? `${picked}/${n}` : "" },
      video: { done: n > 0 && taken === n, label: n ? `${taken}/${n}` : "" },
      edit: { done: !!p.exportedAt, label: p.exportedAt ? "내보냄" : "" }
    };
  }

  function renderNav() {
    const st = stageStatus(current());
    $$(".tab[data-step]").forEach((btn) => {
      const s = st[btn.dataset.step];
      btn.classList.toggle("done", s.done);
      $(".nav-badge", btn).textContent = s.done ? "✓" : s.label;
    });
    renderPageSide();
  }

  // 단계별 '다음에 할 일' 안내
  function nextAction(p, st) {
    if (!st.plan.done) return ["plan", "브리프와 레퍼런스를 넣고 AI 기획안부터 받아 보세요."];
    if (!st.chars.done) return ["chars", "캐릭터가 있으면 기준 이미지와 캐릭터 시트를 만들고, 없으면 '캐릭터 없음'으로 넘어가세요."];
    if (!st.style.done) return ["style", p.style.images.length ? "후보 중 대표 스타일프레임을 ★로 골라 주세요." : "캐릭터 시트를 넣어 대표 장면 스타일프레임을 만들어 보세요."];
    if (!st.board.done) return ["board", p.shots.length ? "아직 스케치가 없는 컷이 있어요. AI로 그려 보고 컷마다 다듬어 보세요." : "기획 시나리오로 AI 스토리보드를 그려 컷 흐름을 잡아 보세요."];
    if (!st.shots.done) return ["shots", "아직 이미지가 없는 컷이 있어요. 프롬프트 → 영문화 → Higgsfield 순서로 만들어 보세요."];
    if (!st.select.done) return ["select", "컷마다 앵커 이미지를 고르고 애니메틱으로 흐름을 확인하세요."];
    if (!st.video.done) return ["video", "앵커 이미지로 영상 프롬프트를 만들어 Higgsfield에서 영상화하세요."];
    if (!st.edit.done) return ["edit", "모든 컷이 준비됐어요. AE 패키지로 내보내 최종 편집하세요."];
    return ["edit", "모든 단계를 마쳤어요. 수정할 컷이 있으면 해당 단계로 돌아가면 돼요."];
  }

  // 작업 현황: 단계별 크레딧 사용량 (Higgsfield 자동 생성 기록)
  function usageCard(p) {
    const rows = usageByStage(p), total = rows.reduce((a, r) => a + r.credits, 0), max = Math.max(1, ...rows.map((r) => r.credits));
    const all = state.projects.reduce((a, x) => a + arr(x.usage).reduce((b, u) => b + (Number(u.credits) || 0), 0), 0);
    const unknown = rows.reduce((a, r) => a + r.unknown, 0);
    const recent = arr(p.usage).slice(-6).reverse();
    const fmt = (n) => Number(n.toFixed(2)).toLocaleString();
    const unit = (r) => `${r.kind === "video" ? "영상" : "이미지"} ${r.n}${r.kind === "video" ? "개" : "장"}`;
    return `<section class="card usage-card" aria-label="크레딧 사용량">
      <div class="usage-head">
        <h3>크레딧 사용량</h3>
        <span class="usage-total"><b>${fmt(total)}</b> 크레딧</span>
        <span class="hint">이 프로젝트 · 앱에서 자동으로 만든 것 기준${state.projects.length > 1 ? ` · 전체 프로젝트 ${fmt(all)}` : ""}</span>
      </div>
      ${arr(p.usage).length ? `
        <div class="usage-rows">${rows.map((r) => `
          <div class="usage-row${r.n ? "" : " empty"}">
            <span class="usage-label">${esc(r.label)}</span>
            <span class="usage-bar"><i style="width:${(r.credits / max) * 100}%"></i></span>
            <b class="usage-num">${r.n ? fmt(r.credits) : "—"}</b>
            <span class="usage-sub">${r.n ? `${unit(r)}${r.unlim ? ` · 무제한 ${r.unlim}` : ""}${r.api ? ` · 내 API 키 ${r.api}` : ""}${r.unknown ? ` · 확인 안 됨 ${r.unknown}` : ""}` : "아직 없음"}</span>
          </div>`).join("")}</div>
        ${unknown ? `<p class="hint">‘확인 안 됨’은 Higgsfield가 사용량을 알려 주지 않은 건이에요. 정확한 잔액은 Higgsfield 사이트에서 확인하세요.</p>` : ""}
        <details class="usage-recent"><summary>최근 기록</summary><ul>${recent.map((u) => `
          <li><span>${fmtWhen(u.at)}</span><span>${esc(STAGE_LABEL[u.stage] || u.stage)}</span><span class="hint">${esc(u.model || "")}</span><b>${u.unlim ? "무제한" : u.api ? "API" : u.credits == null ? "?" : fmt(u.credits)}</b></li>`).join("")}</ul></details>`
        : `<p class="hint usage-empty">아직 Higgsfield로 만든 것이 없어요. 스타일프레임·캐릭터·샷 이미지·영상을 자동으로 만들면 단계별로 여기에 쌓여요.</p>`}
    </section>`;
  }

  // 히어로 그림: 유리 결정 + 리본 (장식)
  const HERO_ART = `<svg viewBox="0 0 420 300" class="hero-svg">
    <defs>
      <linearGradient id="hgA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#8fb3ff" stop-opacity=".55"/></linearGradient>
      <linearGradient id="hgB" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8cff" stop-opacity=".85"/><stop offset="1" stop-color="#c9dbff" stop-opacity=".35"/></linearGradient>
      <linearGradient id="hgC" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f5fe0" stop-opacity=".75"/><stop offset="1" stop-color="#a9c4ff" stop-opacity=".4"/></linearGradient>
      <linearGradient id="hgR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".45" stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="#9ab8ff" stop-opacity=".2"/></linearGradient>
      <filter id="hgBlur"><feGaussianBlur stdDeviation="14"/></filter>
    </defs>
    <ellipse cx="250" cy="170" rx="150" ry="90" fill="#7ea2ff" opacity=".35" filter="url(#hgBlur)"/>
    <path d="M20 250 C120 170 200 300 410 120 L410 160 C220 320 130 210 20 290 Z" fill="url(#hgR)"/>
    <g class="hero-crystal">
      <polygon points="230,40 330,95 300,215 190,235 150,120" fill="url(#hgA)" stroke="#fff" stroke-opacity=".8"/>
      <polygon points="230,40 150,120 215,140" fill="url(#hgB)"/>
      <polygon points="215,140 330,95 300,215" fill="url(#hgC)"/>
      <polygon points="150,120 215,140 190,235" fill="url(#hgB)" opacity=".8"/>
      <polygon points="215,140 300,215 190,235" fill="url(#hgA)" opacity=".7"/>
      <path d="M230 40 L215 140 L300 215 M215 140 L190 235" stroke="#fff" stroke-opacity=".7" fill="none"/>
    </g>
    <path d="M0 300 C160 220 230 290 420 190" stroke="#fff" stroke-opacity=".7" stroke-width="2" fill="none"/>
  </svg>`;

  // 원형 진행률
  const ring = (pct) => {
    const r = 46, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 112 112" class="ring"><circle cx="56" cy="56" r="${r}" class="ring-bg"/><circle cx="56" cy="56" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>`;
  };

  // 최근 알림: 기획 기록 · 생성 · 메모 · 내보내기
  function recentEvents(p) {
    const ev = [
      ...arr(p.plan.history).slice(0, 6).map((h) => ({ at: h.at, icon: "✎", title: "기획안이 바뀌었어요", sub: h.reason, go: "plan" })),
      ...arr(p.usage).slice(-6).map((u) => ({ at: u.at, icon: u.kind === "video" ? "▶" : "✦", title: `${STAGE_LABEL[u.stage] || u.stage} ${u.kind === "video" ? "영상" : "이미지"}를 만들었어요`, sub: `${u.model || ""}${u.credits != null ? ` · ${u.credits} 크레딧` : ""}`, go: u.stage === "video" ? "video" : u.stage })),
      ...p.notes.filter((n) => !n.done).slice(-4).map((n) => ({ at: n.created, icon: "✱", title: "고칠 메모", sub: cutText(n.text || "빈 메모", 40), go: "edit" })),
      ...(p.exportedAt ? [{ at: p.exportedAt, icon: "⇩", title: "AE 패키지를 내보냈어요", sub: projTitle(p), go: "edit" }] : [])
    ];
    return ev.filter((x) => x.at).sort((a, b) => b.at - a.at).slice(0, 4);
  }
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
  };

  function renderHome() {
    const p = current();
    const st = stageStatus(p);
    const prog = projProgress(p);
    const [nextId, nextText] = nextAction(p, st);
    const next = K.steps[stepIndex(nextId)];
    const r = p.plan.result;
    // 오늘 · 이번 주
    const today = new Date(), todayKey = dayKey(today);
    const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return { k: dayKey(d), label: "월화수목금토일"[i], today: dayKey(d) === todayKey }; });
    const act = isObj(state.activity) ? state.activity : {};
    const workedDays = week.filter((d) => act[d.k]).length;
    const todayCredits = state.projects.flatMap((x) => arr(x.usage)).filter((u) => dayKey(new Date(u.at)) === todayKey).reduce((a, u) => a + (Number(u.credits) || 0), 0);
    const takes = p.shots.filter((s) => s.take).length;
    const events = recentEvents(p);
    const tips = next.tips || [];
    const tip = tips[today.getDate() % Math.max(1, tips.length)] || "구체적인 예시와 방향을 함께 주면 AI 결과가 좋아져요.";
    $("#homeBody").innerHTML = `
      ${aiReady() ? "" : `<div class="card home-banner connect-banner">
        <div><b>먼저 내 AI를 연결해 주세요</b>
          <p>Claude · ChatGPT · Gemini 중 쓰는 것으로 — 구독 계정(연결 프로그램) 또는 API 키. 이미지·영상은 Higgsfield, 내 API 키, 또는 웹에서 직접 만들 수 있어요.</p></div>
        <button type="button" class="btn" data-open-settings>AI 연결하기</button></div>`}
      <div class="dash">
        <div class="dash-main">
          <section class="hero">
            <div class="hero-text">
              <span class="hero-eyebrow">AI Motion Studio · 지금 프로젝트</span>
              <h2>${esc(r?.title || p.name)}</h2>
              <p class="hero-sub">${esc(r?.logline || "주제만 적어도 기획부터 스토리보드 · 이미지 · 영상까지 이어서 만들어요.")}</p>
              <p class="hero-next"><b>다음</b>${esc(nextText)}</p>
              <div class="hero-actions">
                <button type="button" class="btn hero-btn" data-autopilot>✨ 남은 작업 자동 진행 <span aria-hidden="true">→</span></button>
                <button type="button" class="btn ghost" data-goto="${nextId}">${esc(next.title)} 열기</button>
              </div>
              <label class="inline small-check"><input type="checkbox" data-auto-images ${autoImagesOn() ? "checked" : ""} /> 샷 이미지도 자동으로 만들기</label>
            </div>
            <div class="hero-art" aria-hidden="true">${HERO_ART}</div>
          </section>

          <section class="dash-sec">
            <div class="dash-head"><h3>진행 중인 프로젝트</h3><span class="hint">${state.projects.length}개</span></div>
            <div class="proj-cards">${recentProjects().slice(0, 6).map((x) => {
              const pr = projProgress(x), th = projThumb(x);
              return `<button type="button" class="proj-card${x === p ? " on" : ""}" data-open-project="${esc(x.id)}">
                <span class="pc-thumb">${th ? `<img data-img-id="${esc(th)}" alt="" />` : `<i>${esc((x.name || "?").trim().slice(0, 1))}</i>`}</span>
                <span class="pc-body">
                  <b>${esc(x.name)}</b>
                  <small>${esc(x.plan.result?.logline || x.plan.topic || "아직 기획 전")}</small>
                  <span class="pc-chip ${pr.state === "완료" ? "done" : pr.state === "진행 중" ? "run" : ""}">${pr.state === "대기 중" ? "○" : "◇"} ${pr.state}</span>
                  <span class="pc-bar"><i style="width:${(pr.done / pr.total) * 100}%"></i></span>
                  <small class="pc-step">${pr.done} / ${pr.total} 단계 완료${x === p ? " · 지금 열림" : ""}</small>
                </span></button>`;
            }).join("")}
              <button type="button" class="proj-card add" data-new-project><span class="pc-plus">＋</span><b>새 프로젝트</b><small>주제만 적으면 시작해요</small></button>
            </div>
          </section>

          ${usageCard(p)}
        </div>

        <aside class="dash-side">
          <section class="side-card today">
            <div class="dash-head"><h3>오늘의 작업 현황</h3><span class="hint">${today.getMonth() + 1}.${today.getDate()} (${"일월화수목금토"[today.getDay()]})</span></div>
            <div class="today-main">
              <div class="ring-wrap">${ring(prog.done / prog.total)}<span><b>${Math.round((prog.done / prog.total) * 100)}%</b><small>단계 진행률</small></span></div>
              <ul class="today-stats">
                <li><span>컷</span><b>${p.shots.length}개</b></li>
                <li><span>영상 완성</span><b>${takes}/${p.shots.length}</b></li>
                <li><span>오늘 크레딧</span><b>${Number(todayCredits.toFixed(1))}</b></li>
              </ul>
            </div>
            <div class="week">
              <span class="week-label">이번 주 작업 <b>${workedDays}일</b></span>
              <div class="week-dots">${week.map((d) => `<span class="${act[d.k] ? "on" : ""}${d.today ? " today" : ""}" title="${d.k}${act[d.k] ? ` · 저장 ${act[d.k]}번` : ""}"><i></i>${d.label}</span>`).join("")}</div>
            </div>
          </section>

          <section class="side-card">
            <div class="dash-head"><h3>최근 알림</h3></div>
            ${events.length ? `<ul class="events">${events.map((e) => `
              <li><button type="button" data-goto="${e.go}"><span class="ev-icon">${e.icon}</span><span class="ev-body"><b>${esc(e.title)}</b><small>${esc(e.sub || "")}</small></span><span class="ev-at">${ago(e.at)}</span></button></li>`).join("")}</ul>`
              : `<p class="hint">아직 소식이 없어요. 작업을 시작하면 여기에 쌓여요.</p>`}
          </section>


        </aside>
      </div>`;
    hydrateThumbs($("#homeBody"));
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-new-project]")) $("#newProjectBtn").click(); });

  // ── AI 연결 ──────────────────────────────────────
  // 1순위: 로컬 연결 프로그램(start.cmd) — 로그인된 Claude Code(구독) + Higgsfield 커넥터, 키 불필요
  // 2순위: Claude API 키 (연결 프로그램 없이 파일로 열었을 때, 글 작업만)
  const readLocal = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const writeLocal = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } };
  const API_KEY_STORAGE = "ai-motion-studio:anthropic-key";
  const HF_SETTINGS_STORAGE = "ai-motion-studio:higgsfield";
  // ── AI 연결: 쓰는 사람마다 자기 계정 ──
  // 글 작업은 고른 곳 하나(K.providers.text), 이미지·영상은 단계별 모델(Higgsfield · 내 API 키 · 웹에서 직접)
  // 키는 이 브라우저(localStorage)에만 저장하고 프로젝트·백업에는 넣지 않는다
  const KEY_STORAGE = { anthropic: API_KEY_STORAGE, openai: "ai-motion-studio:openai-key", gemini: "ai-motion-studio:gemini-key" };
  const PROVIDER_STORAGE = "ai-motion-studio:providers";
  const keyOf = (k) => readLocal(KEY_STORAGE[k]);
  const getApiKey = () => keyOf("anthropic");
  const bridge = { on: false, claude: null, higgsfield: false, codex: null, gemini: null };
  function provSettings() {
    try { return { text: "", models: {}, ...JSON.parse(readLocal(PROVIDER_STORAGE) || "{}") }; } catch { return { text: "", models: {} }; }
  }
  const saveProvSettings = (patch) => writeLocal(PROVIDER_STORAGE, JSON.stringify({ ...provSettings(), ...patch }));
  const provReady = (pv) => (pv.bridge ? bridge.on && !!bridge[pv.bridge] : !!keyOf(pv.key));
  const provModel = (pv) => provSettings().models[pv.id] || pv.model || "";
  // 고른 곳이 준비돼 있으면 그곳, 아니면 준비된 첫 곳 (구독 → API 키 순)
  function textProvider() {
    const list = K.providers.text, want = list.find((p) => p.id === provSettings().text);
    return want && provReady(want) ? want : list.find(provReady) || null;
  }
  const aiReady = () => !!textProvider();
  const hfReady = () => bridge.on && bridge.higgsfield;
  // 이 모델로 앱에서 바로 만들 수 있나 (Higgsfield = 연결 프로그램 + 커넥터, API 모델 = 내 키, 웹 모델 = 아니요)
  function genReady(stageOrModel, shot) {
    const m = typeof stageOrModel === "string" ? hfModelFor(stageOrModel, shot) : stageOrModel;
    if (!m || m.web) return false;
    return m.api ? !!keyOf(m.api) : hfReady();
  }
  const genName = (m) => (m.api ? m.name.replace(/\s*\(.*\)$/, "") : `Higgsfield`);

  // Higgsfield 생성 설정 — 단계별 모델(스타일프레임·캐릭터·샷 이미지·영상 기본), 모델별 화질, 무제한 사용
  // 영상은 컷마다 shot.videoModel 로 따로 고를 수 있다 (비우면 기본 모델)
  const STAGE_KIND = { style: "image", chars: "image", shots: "image", video: "video" };
  const STAGE_LABEL = { style: "스타일프레임", chars: "캐릭터", shots: "샷 이미지", video: "영상" };
  function hfSettings() {
    let s = {};
    try { s = JSON.parse(readLocal(HF_SETTINGS_STORAGE) || "{}"); } catch { /* ignore */ }
    // 이전 버전(이미지·영상 모델 하나씩) 설정 이어받기
    const legacy = {
      ...(s.imageModel ? { style: s.imageModel, chars: s.imageModel, shots: s.imageModel } : {}),
      ...(s.videoModel ? { video: s.videoModel } : {})
    };
    return { ...K.higgsfield.defaults, ...s, models: { ...K.higgsfield.defaults.models, ...legacy, ...(s.models || {}) }, tiers: { ...(s.tiers || {}) } };
  }
  function saveHfSettings(patch) {
    const { imageModel, videoModel, ...rest } = { ...hfSettings(), ...patch };
    writeLocal(HF_SETTINGS_STORAGE, JSON.stringify(rest));
  }
  // 카탈로그에 없는 모델 id 를 직접 넣었을 때도 기본 규칙으로 동작하게
  function hfModel(kind, id) {
    const list = kind === "video" ? K.higgsfield.videoModels : K.higgsfield.imageModels;
    return list.find((m) => m.id === id) || { id, name: id, note: "", role: kind === "video" ? "start_image" : "image_references" };
  }
  const hfStageModelId = (stage, shot) => (stage === "video" && shot?.videoModel) || hfSettings().models[stage];
  const hfModelFor = (stage, shot) => hfModel(STAGE_KIND[stage], hfStageModelId(stage, shot));
  const hfTierOf = (m) => (m.tier ? hfSettings().tiers[m.id] || m.tier[1] : "");
  const isWebModel = (m) => !!m.web;
  // 컷 길이를 모델이 받는 길이로 맞춘다
  function fitDuration(m, sec) {
    const s = Math.round(sec);
    if (Array.isArray(m.duration)) return Math.min(m.duration[1], Math.max(m.duration[0], s));
    if (m.duration?.options) return m.duration.options.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));
    return Math.max(4, s);
  }
  const TIER_LABEL = { quality: "품질", resolution: "해상도", mode: "모드" };

  // 모델 고르기. stage = style | chars | shots | video, shot 을 주면 그 컷만의 영상 모델
  function hfPicker(stage, shot = null) {
    const kind = STAGE_KIND[stage];
    const list = kind === "video" ? K.higgsfield.videoModels : K.higgsfield.imageModels;
    const m = hfModelFor(stage, shot);
    const own = shot && shot.videoModel;
    const tier = hfTierOf(m);
    const attrs = `data-stage="${stage}"${shot ? ` data-cut="${esc(shot.id)}"` : ""}`;
    const known = list.some((x) => x.id === m.id);
    // 준비 안 된 곳은 이유를 붙인다 (키 필요 · 연결 프로그램 필요)
    const why = (x) => (x.web ? "" : x.api ? (keyOf(x.api) ? "" : " · 키 필요") : hfReady() ? "" : " · 연결 필요");
    const label = (x) => (shot ? `${x.name}${why(x)}` : `${x.name} — ${x.note}${why(x)}`);
    const opt = (x) => `<option value="${esc(x.id)}" ${(shot ? own === x.id : x.id === m.id) ? "selected" : ""}>${esc(label(x))}</option>`;
    const groups = [["Higgsfield · 자동", list.filter((x) => !x.api && !x.web)], ["내 API 키 · 자동", list.filter((x) => x.api)], ["웹에서 직접 · 프롬프트 복사 → 사이트", list.filter((x) => x.web)]].filter(([, xs]) => xs.length);
    const logo = isWebModel(m) ? "↗" : m.api === "openai" ? "O" : m.api === "gemini" ? "G" : "H";
    return `<span class="hf-picker ${isWebModel(m) ? "web" : ""} ${m.api ? "api" : ""} ${genReady(m) || isWebModel(m) ? "" : "not-ready"} ${shot ? "compact" : ""}" title="${STAGE_LABEL[stage]} 모델">
      <span class="hf-logo" aria-hidden="true">${logo}</span>
      <select data-hf-model ${attrs} aria-label="${STAGE_LABEL[stage]} 모델">
        ${shot ? `<option value="" ${own ? "" : "selected"}>기본 · ${esc(hfModel("video", hfSettings().models.video).name)}</option>` : ""}
        ${groups.map(([g, xs]) => `<optgroup label="${esc(g)}">${xs.map(opt).join("")}</optgroup>`).join("")}
        ${known ? "" : `<option value="${esc(m.id)}" selected>${esc(m.id)}</option>`}
      </select>
      ${m.tier ? `<select data-hf-tier ${attrs} aria-label="${TIER_LABEL[m.tier[0]] || m.tier[0]}">
        ${m.tier.slice(1).map((t) => `<option value="${esc(t)}" ${t === tier ? "selected" : ""}>${shot ? "" : `${TIER_LABEL[m.tier[0]] || m.tier[0]} `}${esc(t)}</option>`).join("")}</select>` : ""}
    </span>`;
  }

  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-hf-model], [data-hf-tier]");
    if (!el) return;
    const stage = el.dataset.stage;
    const shot = el.dataset.cut ? current().shots.find((s) => s.id === el.dataset.cut) : null;
    if (el.matches("[data-hf-model]")) {
      if (shot) { shot.videoModel = el.value || null; save(); }
      else saveHfSettings({ models: { ...hfSettings().models, [stage]: el.value } });
    } else {
      saveHfSettings({ tiers: { ...hfSettings().tiers, [hfModelFor(stage, shot).id]: el.value } });
    }
    // 열린 설정 창의 선택 칸도 맞춘다
    $$("#settingsDialog [data-hf-slot]").forEach((slot) => (slot.innerHTML = hfPicker(slot.dataset.hfSlot)));
    renderActive();
    const m = hfModelFor(stage, shot);
    toast(`${shot ? `컷 ${current().shots.indexOf(shot) + 1} ` : ""}${STAGE_LABEL[stage]} 모델: ${m.name}${hfTierOf(m) ? ` · ${hfTierOf(m)}` : ""}`);
  });

  // 웹에서 직접 만드는 모델(Midjourney 등): 프롬프트 복사 + 레퍼런스 저장 + 사이트 열기 — 클릭 즉시 실행해야 팝업이 막히지 않는다
  function webHandoff(m, prompt, refIds = [], prefix = "ref") {
    // @캐릭터: 이미지 모델이면 그 시트도 레퍼런스로 함께 저장
    if (!K.higgsfield.videoModels.includes(m)) refIds = [...new Set([...refIds.filter(Boolean), ...mentionsIn(prompt).map((e) => e.img).filter(Boolean)])];
    prompt = expandMentions(prompt, { refs: K.higgsfield.videoModels.includes(m) ? null : refIds });
    const copying = copyText(prompt);
    window.open(m.web, "_blank", "noopener");
    refIds.filter(Boolean).forEach((id, i) => downloadMedia(id, `${prefix}_${i + 1}`));
    copying.then((ok) => toast(ok ? `${m.name}: 프롬프트를 복사했어요${refIds.length ? ` · 레퍼런스 ${refIds.length}장 저장` : ""}. 결과는 해당 칸에 Ctrl+V` : "복사 실패 — 프롬프트를 직접 복사해 주세요"));
  }

  async function bridgeFetch(path, body) {
    let res;
    try {
      res = await fetch(path, body === undefined
        ? { headers: { "x-ams": "1" } }
        : { method: "POST", headers: { "x-ams": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      bridge.on = false;
      renderAiStatus();
      throw new Error("연결 프로그램과 연결이 끊겼어요. start.cmd 창이 켜져 있는지 확인해 주세요");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `연결 프로그램 오류 (${res.status})`);
    return data;
  }

  async function checkBridge() {
    if (!location.protocol.startsWith("http")) return;
    try {
      const h = await bridgeFetch("/bridge/health");
      Object.assign(bridge, { on: !!h.ok, claude: h.claude, higgsfield: !!h.higgsfield, codex: h.codex || null, gemini: h.gemini || null });
    } catch { bridge.on = false; }
    renderAiStatus();
    renderActive();
  }

  function renderAiStatus() {
    const pv = textProvider();
    $("#aiStatus").classList.toggle("on", !!pv);
    $("#aiLabel").textContent = pv ? `${pv.name} · ${pv.via.split(" · ")[0]}` : "AI 연결하기";
    $("#settingsBtn").title = pv ? `글 작업: ${pv.name} (${pv.via})${hfReady() ? " · Higgsfield 연결됨" : ""}` : "AI 연결 안 됨 — 눌러서 연결하기";
  }

  // ── AI 연결 설정 창: 글 작업 고르기 · 내 키 · 단계별 이미지·영상 모델 ──
  function providerCard(pv, chosen) {
    const ready = provReady(pv);
    const state = ready ? `<span class="pv-state ok">사용 가능</span>`
      : pv.bridge ? `<span class="pv-state">${bridge.on ? "설치·로그인 필요" : "연결 프로그램 필요"}</span>`
      : `<span class="pv-state">키 필요</span>`;
    return `<label class="pv-card${chosen ? " on" : ""}${ready ? "" : " off"}">
      <input type="radio" name="textProvider" value="${pv.id}" ${chosen ? "checked" : ""} />
      <span class="pv-name"><b>${esc(pv.name)}</b>${pv.beta ? `<em>베타</em>` : ""}</span>
      <span class="pv-via">${esc(pv.via)}</span>
      ${state}
      ${pv.bridge && !ready ? `<span class="pv-how">${bridge.on ? `${esc(pv.setup)} <a href="${esc(pv.link)}" target="_blank" rel="noopener">안내</a>` : "start.cmd(Mac: start.command)로 열면 이 PC의 로그인을 써요"}</span>` : ""}
      ${pv.key ? `<input class="pv-model" data-pv-model="${pv.id}" value="${esc(provModel(pv))}" placeholder="${esc(pv.model)}" title="모델 이름 (바뀌면 여기서 고쳐요)" aria-label="${esc(pv.name)} 모델" />` : ""}
    </label>`;
  }

  function renderSettings() {
    const hf = hfSettings(), cur = textProvider(), want = provSettings().text || cur?.id;
    const P = K.providers;
    // 웹에 올린 버전(github.io 등): 내 PC 연결 프로그램이 없으니 API 키로 시작하게 안내
    const onWeb = !/^(127\.0\.0\.1|localhost|\[::1\]|)$/.test(location.hostname);
    $("#settingsBody").innerHTML = `
      ${onWeb ? `<p class="set-web">🌐 <b>웹 버전이에요.</b> 아래 <b>2. 내 API 키</b>에 OpenAI · Gemini · Claude 키 중 하나를 넣으면 바로 써요. 작업과 키는 이 브라우저에만 저장돼요. Claude · ChatGPT 구독 연결과 Higgsfield 자동 생성은 <a href="시작하기.html" target="_blank" rel="noopener">내려받아 실행</a>하면 쓸 수 있어요.</p>` : ""}
      <section class="set-sec">
        <div class="set-head"><b>1. 글 작업</b><span class="hint">기획 · 스토리보드 · 프롬프트를 쓸 AI 하나</span>
          <span class="set-now">${cur ? `지금: <b>${esc(cur.name)}</b> ${esc(cur.via)}` : `<b class="warn-text">연결 안 됨</b>`}</span></div>
        <div class="pv-grid">${P.text.map((pv) => providerCard(pv, pv.id === want)).join("")}</div>
        <p class="hint">구독(Claude · ChatGPT · Gemini)은 <b>연결 프로그램</b>으로 열었을 때 이 PC에 로그인된 계정을 그대로 써요. API 키는 쓴 만큼 요금이 나가요.</p>
      </section>
      <section class="set-sec">
        <div class="set-head"><b>2. 내 API 키</b><span class="hint">이 브라우저에만 저장 · 백업 파일에 안 들어가요</span></div>
        <div class="key-grid">${Object.entries(P.keys).map(([k, v]) => `
          <label class="key-row"><span>${esc(v.name)} ${keyOf(k) ? `<em class="ok-text">✓ 저장됨</em>` : ""}</span>
            <span class="key-input"><input type="password" data-key="${k}" value="${esc(keyOf(k))}" placeholder="${esc(v.placeholder)}" autocomplete="off" spellcheck="false" />
            <a href="${esc(v.link)}" target="_blank" rel="noopener">발급</a></span></label>`).join("")}</div>
        <p class="hint">OpenAI·Gemini 키는 글 작업과 이미지 만들기(GPT Image · Nano Banana)에 함께 써요.</p>
      </section>
      <section class="set-sec">
        <div class="set-head"><b>3. 이미지 · 영상 만들기</b><span class="hint">단계마다 쓸 곳 — 각 화면에서도 바꿀 수 있어요</span></div>
        <p class="set-status">${hfReady() ? `<span class="ok-text">● Higgsfield 자동 생성 연결됨</span>` : bridge.on ? `<span class="warn-text">● Higgsfield 연결 안 됨</span> — Claude 앱 설정에서 Higgsfield 커넥터를 켜면 자동으로 만들어요` : `○ Higgsfield 자동 생성은 연결 프로그램 + Claude 의 Higgsfield 커넥터가 필요해요`}</p>
        <div class="stage-models">${["chars", "style", "shots", "video"].map((st) => `
          <label class="stage-model"><span>${esc(STAGE_LABEL[st] === "캐릭터" ? "캐릭터 시트" : STAGE_LABEL[st])}${st === "video" ? " <em>기본값 · 컷마다 따로</em>" : ""}</span><div data-hf-slot="${st}">${hfPicker(st)}</div></label>`).join("")}</div>
        <p class="hint">'웹에서 직접'을 고르면 프롬프트를 복사하고 그 사이트를 열어 줘요 — 결과는 칸에 Ctrl+V. 화질이 높을수록 크레딧·요금이 더 들어요.</p>
        <label class="inline"><input id="hfUnlim" type="checkbox" ${hf.useUnlim ? "checked" : ""} /> Higgsfield 무제한(체험) 생성이 있으면 그걸 먼저 쓰기</label>
      </section>
      <p class="set-foot">${bridge.on ? `연결 프로그램 사용 중 · Claude Code ${esc(bridge.claude || "없음")} · ChatGPT(Codex) ${esc(bridge.codex || "없음")} · Gemini CLI ${esc(bridge.gemini || "없음")}` : "연결 프로그램 없이 열려 있어요 — API 키와 '웹에서 직접'만 쓸 수 있어요. 구독을 쓰려면 start.cmd(Mac: start.command)로 여세요."}</p>`;
  }

  function openSettings() {
    renderSettings();
    if (!$("#settingsDialog").open) $("#settingsDialog").showModal();
  }
  $("#settingsBtn").addEventListener("click", openSettings);
  // 글 작업 고르기: 바로 반영 · 키를 넣으면 바로 '사용 가능'으로
  $("#settingsDialog").addEventListener("change", (e) => {
    if (e.target.name === "textProvider") {
      saveProvSettings({ text: e.target.value });
      const pv = K.providers.text.find((p) => p.id === e.target.value);
      if (pv && !provReady(pv)) toast(pv.key ? `${pv.name} API 키를 아래 '내 API 키'에 넣어 주세요` : `${pv.name}: ${pv.setup}`);
    }
    if (e.target.dataset.key) writeLocal(KEY_STORAGE[e.target.dataset.key], e.target.value.trim());
    if (e.target.dataset.pvModel) saveProvSettings({ models: { ...provSettings().models, [e.target.dataset.pvModel]: e.target.value.trim() } });
    if (e.target.id === "hfUnlim") saveHfSettings({ useUnlim: e.target.checked });
    if (e.target.matches("[data-key], [name=textProvider]")) { renderSettings(); renderAiStatus(); }
  });
  $("#saveKeyBtn").addEventListener("click", () => {
    $$("#settingsDialog [data-key]").forEach((i) => writeLocal(KEY_STORAGE[i.dataset.key], i.value.trim()));
    $("#settingsDialog").close();
    renderAiStatus();
    renderActive();
    const pv = textProvider();
    toast(pv ? `저장했어요 · 글 작업: ${pv.name} (${pv.via})` : "저장했어요 · 아직 글 작업에 쓸 AI가 없어요");
  });

  // ── Claude 호출 (모든 글 작업이 여기를 거친다) ──
  let Anthropic = null;
  let aiBusy = false;

  async function loadSdk() {
    if (!Anthropic) ({ default: Anthropic } = await import(K.ai.sdkUrl));
    return Anthropic;
  }

  // 구조화 출력(JSON 스키마)으로 받아 파싱한 객체를 돌려준다
  // 글 작업은 모두 여기로 — AI 연결에서 고른 곳(구독 CLI · Claude/OpenAI/Gemini API 키)으로 보낸다
  async function callClaude({ system, content, schema, onStream, onText, maxTokens = 16000 }) {
    const pv = textProvider();
    if (!pv) {
      openSettings();
      throw new Error("글 작업에 쓸 AI가 연결돼 있지 않아요 — AI 연결에서 골라 주세요");
    }
    if (pv.bridge) {
      // 연결 프로그램: 이미지 블록은 파일로, 글은 하나로 합쳐 이 PC 에 로그인된 구독(Claude Code · Codex · Gemini CLI)에 넘긴다
      const images = content.filter((b) => b.type === "image").map((b) => ({ type: b.source.media_type, data: b.source.data }));
      const prompt = content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n");
      onText?.("");
      const res = await bridgeFetch("/bridge/text", { provider: pv.bridge, system, prompt, schema, images, effort: K.ai.effort });
      return res.data;
    }
    if (pv.id === "openai-api") return openaiText(pv, { system, content, schema, maxTokens });
    if (pv.id === "gemini-api") return geminiText(pv, { system, content, schema, maxTokens });
    const key = getApiKey();
    try { await loadSdk(); } catch { throw new Error("AI 연결 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요"); }
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream({
      model: provModel(pv) || K.ai.model,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: K.ai.effort, format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content }]
    });
    onStream?.(stream);
    if (onText) stream.on("text", onText);
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("AI가 이 요청에 답하지 않았어요. 표현을 바꿔 보세요");
    if (message.stop_reason === "max_tokens") throw new Error("답변이 너무 길어 잘렸어요. 다시 시도해 주세요");
    return JSON.parse(message.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  }

  // ── 내 API 키로 바로 (브라우저 → 각 플랫폼) ──
  const dataUrlOf = (b) => `data:${b.source.media_type};base64,${b.source.data}`;
  const pickJsonText = (text) => {
    const t = String(text || "").replace(/```(?:json)?/gi, ""), s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("AI가 JSON 형식으로 답하지 않았어요. 다시 시도해 주세요");
    return JSON.parse(t.slice(s, e + 1));
  };
  async function apiFetch(name, url, init) {
    let res;
    try { res = await fetch(url, init); } catch { throw new Error(`${name}에 연결하지 못했어요. 인터넷 연결을 확인해 주세요`); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.error?.message || json.error || `HTTP ${res.status}`;
      throw new Error(res.status === 401 || res.status === 403 ? `${name} API 키가 올바르지 않거나 권한이 없어요` : res.status === 429 ? `${name}: 요청이 많거나 한도를 넘었어요 (${msg})` : `${name} 오류: ${msg}`);
    }
    return json;
  }

  // OpenAI 구조화 출력(strict): 선택 속성도 required 로, 대신 null 허용 → 받은 뒤 null 은 버린다
  function strictSchema(s) {
    if (!s || typeof s !== "object") return s;
    const o = { ...s };
    if (o.type === "object" && o.properties) {
      const req = new Set(o.required || []);
      o.properties = Object.fromEntries(Object.entries(o.properties).map(([k, v]) => {
        const p = strictSchema(v);
        if (!req.has(k) && p.type && !Array.isArray(p.type)) p.type = [p.type, "null"];
        return [k, p];
      }));
      o.required = Object.keys(o.properties);
      o.additionalProperties = false;
    }
    if (o.items) o.items = strictSchema(o.items);
    return o;
  }
  const dropNulls = (v) => (Array.isArray(v) ? v.map(dropNulls) : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)])) : v);

  async function openaiText(pv, { system, content, schema, maxTokens }) {
    const json = await apiFetch("OpenAI", "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${keyOf("openai")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provModel(pv), instructions: system, max_output_tokens: maxTokens,
        input: [{ role: "user", content: content.map((b) => (b.type === "image" ? { type: "input_image", image_url: dataUrlOf(b) } : { type: "input_text", text: b.text })) }],
        text: { format: { type: "json_schema", name: "result", schema: strictSchema(schema), strict: true } }
      })
    });
    if (json.status === "incomplete") throw new Error("답변이 너무 길어 잘렸어요. 다시 시도해 주세요");
    const text = json.output_text || arr(json.output).flatMap((o) => arr(o.content)).filter((c) => c.type === "output_text").map((c) => c.text).join("");
    return dropNulls(pickJsonText(text));
  }

  async function geminiText(pv, { system, content, schema, maxTokens }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provModel(pv))}:generateContent`;
    const parts = content.map((b) => (b.type === "image" ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } } : { text: b.text }));
    const send = (config, extra = "") => apiFetch("Gemini", url, {
      method: "POST",
      headers: { "x-goog-api-key": keyOf("gemini"), "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: extra ? [...parts, { text: extra }] : parts }], generationConfig: { maxOutputTokens: maxTokens, ...config } })
    });
    let json;
    try {
      json = await send({ responseMimeType: "application/json", responseJsonSchema: schema });
    } catch (err) {
      // 스키마 옵션을 못 받는 모델이면 글로 형식을 알려 주고 다시
      if (!/schema/i.test(err.message)) throw err;
      json = await send({ responseMimeType: "application/json" }, `\n\n[출력 형식] 아래 JSON 스키마에 맞는 JSON 하나만:\n${JSON.stringify(schema)}`);
    }
    const cand = arr(json.candidates)[0];
    if (cand?.finishReason === "MAX_TOKENS") throw new Error("답변이 너무 길어 잘렸어요. 다시 시도해 주세요");
    return pickJsonText(arr(cand?.content?.parts).map((p) => p.text || "").join(""));
  }

  // 이미지: 내 OpenAI · Gemini 키로 한 장씩 (레퍼런스가 있으면 편집으로)
  const OPENAI_SIZE = { "16:9": "1536x1024", "9:16": "1024x1536", "2:3": "1024x1536", "1:1": "1024x1024", "4:5": "1024x1536", "3:2": "1536x1024" };
  const b64Blob = (b64, type = "image/png") => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });

  async function openaiImage(m, { prompt, aspect, refs }) {
    const model = provSettings().models[m.id] || m.apiModel, size = OPENAI_SIZE[aspect] || "1024x1024", quality = hfTierOf(m) || "medium";
    const auth = { Authorization: `Bearer ${keyOf("openai")}` };
    let json;
    if (refs.length) {
      const fd = new FormData();
      fd.append("model", model);
      fd.append("prompt", prompt);
      fd.append("size", size);
      fd.append("quality", quality);
      for (const [i, id] of refs.slice(0, m.maxRefs || 16).entries()) {
        const rec = await getMedia(id).catch(() => null);
        if (rec && rec.kind !== "video") fd.append("image[]", rec.blob, `ref${i + 1}.${(rec.type || "image/png").split("/")[1] || "png"}`);
      }
      json = await apiFetch("OpenAI", "https://api.openai.com/v1/images/edits", { method: "POST", headers: auth, body: fd });
    } else {
      json = await apiFetch("OpenAI", "https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt, size, quality, n: 1 })
      });
    }
    const d = arr(json.data)[0];
    if (d?.b64_json) return b64Blob(d.b64_json);
    if (d?.url) return (await fetch(d.url)).blob();
    throw new Error("OpenAI 에서 이미지를 받지 못했어요");
  }

  async function geminiImage(m, { prompt, aspect, refs }) {
    const model = provSettings().models[m.id] || m.apiModel;
    const imgs = await imageBlocks(refs.slice(0, m.maxRefs || 3));
    const json = await apiFetch("Gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": keyOf("gemini"), "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [...imgs.map((b) => ({ inlineData: { mimeType: b.source.media_type, data: b.source.data } })), { text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect || "16:9" } }
      })
    });
    const part = arr(arr(json.candidates)[0]?.content?.parts).find((p) => p.inlineData?.data);
    if (!part) throw new Error(`Gemini 에서 이미지를 받지 못했어요${arr(json.candidates)[0]?.finishReason ? ` (${json.candidates[0].finishReason})` : ""}`);
    return b64Blob(part.inlineData.data, part.inlineData.mimeType || "image/png");
  }

  // 여러 장: 2장씩 동시에. 결과 모양은 Higgsfield 와 같게 [{ blobs, error }]
  async function apiGenerate(kind, items, m, stage, proj) {
    if (kind === "video") throw new Error(`${m.name}로는 영상을 만들 수 없어요`);
    if (!keyOf(m.api)) { openSettings(); throw new Error(`${m.name}: AI 연결에서 ${K.providers.keys[m.api].name} API 키를 넣어 주세요`); }
    const make = m.api === "openai" ? openaiImage : geminiImage;
    const out = items.map(() => ({ blobs: [], error: "" }));
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        try { out[i].blobs.push(await make(m, items[i])); } catch (err) { out[i].error = err.message; }
      }
    };
    await Promise.all([worker(), worker()]);
    // 크레딧 기록: API 요금은 각 플랫폼에서 확인 (여기서는 장수만)
    recordUsage(proj, stage, kind, m, out.map((r, i) => ({ index: i, status: r.blobs.length ? "completed" : "failed", files: r.blobs, credits: -1, api: true })));
    if (out.every((r) => r.error)) throw new Error(out[0].error);
    return out;
  }

  function aiErrorText(err) {
    if (Anthropic) {
      if (err instanceof Anthropic.APIUserAbortError) return "생성을 멈췄어요";
      if (err instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않아요";
      if (err instanceof Anthropic.PermissionDeniedError) return "이 API 키로는 모델을 쓸 수 없어요";
      if (err instanceof Anthropic.RateLimitError) return "요청이 많아요. 잠시 후 다시 시도해 주세요";
      if (err instanceof Anthropic.APIConnectionError) return "Claude API에 연결하지 못했어요. 인터넷 연결을 확인해 주세요";
      if (err instanceof Anthropic.APIError) return `API 오류 (${err.status ?? "?"}): ${err.message}`;
    }
    return err?.message || "AI 작업에 실패했어요";
  }

  // 버튼을 '작성 중' 상태로 두고 AI 작업을 실행한다
  async function runAi(btn, busyText, fn) {
    if (aiBusy) return toast("다른 AI 작업이 진행 중이에요");
    if (!aiReady()) { toast("글 작업에 쓸 AI를 AI 연결에서 골라 주세요"); return openSettings(); }
    aiBusy = true;
    const label = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="mini-spin"></span>${busyText}`; }
    try {
      await fn();
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      aiBusy = false;
      if (btn?.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  // ── Higgsfield 생성 (연결 프로그램 → Claude Code → Higgsfield 커넥터) ──
  // items: [{ prompt, aspect, refs: [mediaId], seconds }] → 항목마다 결과 Blob 배열. m = 모델(카탈로그 항목)
  // ── 캐릭터 요소: 프롬프트 어디서든 @이름 → 그 캐릭터 시트를 레퍼런스로 붙이고 이름으로 풀어 쓴다 ──
  // "빨콩이 (멈춰요)" → @빨콩이 — 괄호 속 설명과 기호는 빼고 이름만
  const charTag = (c) => {
    const name = str(c?.name);
    return name.replace(/[(（[［].*?[)）\]］]/g, "").replace(/[^\p{L}\p{N}_]/gu, "") || name.replace(/[^\p{L}\p{N}_]/gu, "");
  };
  const charImg = (c) => c.pick || baseOf(c) || c.images.at(-1) || null;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentionRe = (tag, g = "") => new RegExp(`@${escRe(tag)}(?![\\p{L}\\p{N}_])`, `u${g}`);
  const charElems = (p = current()) => (p?.characters || []).filter((c) => charTag(c)).map((c) => ({ c, tag: charTag(c), img: charImg(c) }));
  // 긴 이름부터 (@모모 와 @모모짱 이 함께 있을 때)
  const mentionsIn = (text, p = current()) => (str(text).includes("@") ? charElems(p).filter((e) => mentionRe(e.tag).test(str(text))).sort((a, b) => b.tag.length - a.tag.length) : []);
  // refs 를 주면 '레퍼런스 n번 캐릭터'로, 아니면 이름만
  function expandMentions(text, { refs = null, p = current() } = {}) {
    let out = str(text);
    for (const e of mentionsIn(out, p)) {
      const n = refs && e.img ? refs.indexOf(e.img) + 1 : 0;
      let first = true;
      out = out.replace(mentionRe(e.tag, "g"), () => {
        const s = first && n ? `"${e.c.name}" (the character in reference image ${n} — keep its design exactly)` : `"${e.c.name}"`;
        first = false;
        return s;
      });
    }
    return out;
  }
  // 생성 직전: 이미지면 언급된 캐릭터 시트를 레퍼런스에 더한다 (keepLast: 맨 뒤 스토리보드 스케치는 맨 뒤 그대로)
  function withMentions(kind, it, p) {
    const els = mentionsIn(it.prompt, p);
    if (!els.length) return it;
    let refs = it.refs.filter(Boolean);
    if (kind === "image" && !it.roles) {
      const add = els.map((e) => e.img).filter((id) => id && !refs.includes(id));
      refs = it.keepLast && refs.length ? [...refs.slice(0, -1), ...add, refs.at(-1)] : [...refs, ...add];
    }
    return { ...it, refs, prompt: expandMentions(it.prompt, { refs: kind === "image" ? refs : null, p }) };
  }

  async function higgsfieldGenerate(kind, items, m, stage = kind === "video" ? "video" : "shots") {
    const proj = current(); // 오래 걸리는 동안 프로젝트를 바꿔도 사용량은 요청한 프로젝트에
    items = items.map((it) => withMentions(kind, it, proj));
    if (m.api) return apiGenerate(kind, items, m, stage, proj); // 내 OpenAI · Gemini 키로
    if (!hfReady()) {
      openSettings();
      throw new Error(bridge.on ? "Higgsfield 커넥터가 연결돼 있지 않아요" : "Higgsfield 자동 생성은 start.cmd 로 앱을 열어야 쓸 수 있어요");
    }
    const hf = hfSettings();
    // 레퍼런스는 한 번씩만 올린다
    const files = [];
    for (const id of [...new Set(items.flatMap((it) => it.refs.filter(Boolean)))]) {
      const rec = await getMedia(id).catch(() => null);
      if (!rec || rec.kind === "video") continue;
      const bmp = await createImageBitmap(rec.blob);
      let blob = rec.blob;
      try { if (Math.max(bmp.width, bmp.height) > 2048 || !/png|jpeg|webp/.test(rec.type)) blob = await bitmapToJpeg(bmp, 2048, 0.92); } finally { bmp.close?.(); }
      const dataUrl = await blobToDataUrl(blob);
      files.push({ key: id, type: blob.type || "image/png", data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    }
    const have = new Set(files.map((f) => f.key));
    // 모델 규칙(카탈로그)에 맞춰 요청을 만든다: 레퍼런스 역할·화질 파라미터·길이·오디오 끄기
    const tier = hfTierOf(m);
    const res = await bridgeFetch("/bridge/higgsfield", {
      kind, model: m.id, useUnlim: !!hf.useUnlim && !!m.unlim, files,
      items: items.map((it) => ({
        params: {
          prompt: it.prompt, aspect_ratio: it.aspect,
          // 화질: 컷마다 고른 값(그 모델이 받는 값일 때) → 아니면 모델 기본
          ...(m.tier && (m.tier.includes(it.tier) ? it.tier : tier) ? { [m.tier[0]]: m.tier.includes(it.tier) ? it.tier : tier } : {}),
          ...(kind === "video" ? { ...(m.audioOff || {}), duration: fitDuration(m, it.seconds || 4) } : {}),
          ...(m.fixed || {})
        },
        // 레퍼런스마다 역할을 따로 줄 수 있다 (예: 시작 프레임 start_image · 엔드 프레임 end_image)
        refs: it.refs.map((id, j) => ({ key: id, role: it.roles?.[j] || m.role })).filter((r) => have.has(r.key)).slice(0, it.roles ? 16 : m.maxRefs || 16)
      }))
    });
    const out = items.map(() => ({ blobs: [], error: "" }));
    recordUsage(proj, stage, kind, m, res.items || []);
    for (const it of res.items || []) {
      const slot = out[it.index];
      if (!slot) continue;
      slot.error = it.error || (it.status !== "completed" && !it.files?.length ? `생성 실패 (${it.status})` : "");
      for (const f of it.files || []) {
        const r = await fetch(f, { headers: { "x-ams": "1" } });
        if (r.ok) slot.blobs.push(await r.blob());
      }
    }
    return out;
  }

  // ── 크레딧 사용량: Higgsfield 로 만든 것마다 단계별로 쌓는다 (작업 현황에 표시) ──
  // 한 항목 = { at, stage, kind, model, credits(모르면 null), unlim, ok }
  function recordUsage(p, stage, kind, m, items) {
    if (!p) return;
    const add = items.filter((it) => it.status === "completed" || it.files?.length || (it.credits || 0) > 0).map((it) => ({
      at: Date.now(), stage: STAGE_LABEL[stage] ? stage : kind === "video" ? "video" : "shots", kind, model: m.name || m.id,
      credits: Number.isFinite(it.credits) && it.credits >= 0 ? it.credits : null, unlim: !!it.unlim, ok: it.status === "completed" || !!it.files?.length,
      ...(it.api ? { api: m.api } : {}) // 내 API 키로 만든 것 — 요금은 그 플랫폼에서 확인
    }));
    if (!add.length) return;
    p.usage = [...arr(p.usage), ...add];
    save({ undo: false });
    if (activeTab() === "home") renderHome();
  }

  // 단계별 합계: { stage, credits, n, unknown, unlim }
  function usageByStage(p) {
    const u = arr(p.usage);
    return Object.keys(STAGE_LABEL).map((stage) => {
      const list = u.filter((x) => x.stage === stage);
      return {
        stage, label: STAGE_LABEL[stage], n: list.length,
        credits: list.reduce((a, x) => a + (Number(x.credits) || 0), 0),
        unknown: list.filter((x) => x.credits == null && !x.unlim && !x.api).length,
        unlim: list.filter((x) => x.unlim).length,
        api: list.filter((x) => x.api).length,
        kind: STAGE_KIND[stage]
      };
    });
  }

  // 한 장짜리 편의 함수 (스타일프레임·캐릭터)
  async function generateImage({ prompt, imageIds, aspect, stage }) {
    const [r] = await higgsfieldGenerate("image", [{ prompt, aspect, refs: imageIds || [] }], hfModelFor(stage), stage);
    if (!r.blobs.length) throw new Error(r.error || "Higgsfield 에서 이미지를 받지 못했어요");
    return r.blobs[0];
  }

  // 캐릭터 시트 자동 생성용 영문 프롬프트: 직접 쓰거나 영문화한 것이 있으면 그걸, 없으면 기본 레이아웃 프롬프트
  function characterSheetPrompt(c) {
    const fresh = c.en && !isStale({ obj: c, ko: "ko", en: "en" });
    if (fresh) return c.en;
    const look = current().plan.result?.direction?.look;
    return K.characterSheetPrompt
      .replace("{name}", c.name ? ` named "${c.name}"` : "")
      .replace("{desc}", c.desc ? ` Character notes (Korean): ${c.desc}` : "")
      .replace("{expressions}", str(c.expressions) || "happy, surprised, angry, sad")
      .replace("{props}", str(c.props) ? `- Bottom row: detail close-ups of these props, showing shape, material and color: ${c.props} (notes may be Korean).` : "")
      .replace("{look}", current().style.pick ? `The last reference image is a style frame: match its rendering style, but take the character only from the earlier images.${look ? ` Overall look: ${look}` : ""}` : look ? `Overall look (Korean notes): ${look}` : "");
  }

  // 기준 이미지가 없으면: 캐릭터 설명 + 스타일프레임으로 전신 기준 이미지를 먼저 만든다
  function characterBasePrompt(c) {
    const p = current();
    return K.characterBasePrompt
      .replace("{name}", c.name || "the main character")
      .replace("{desc}", c.desc || "")
      .replace("{style}", p.style.pick ? "Match the rendering style, palette and lighting of the reference style frame." : (p.plan.result?.direction?.look ? `Style notes (Korean): ${p.plan.result.direction.look}` : ""));
  }

  // ── 기획 레퍼런스의 쓰임: 스타일 / 등장 대상 / 구도·연출 (이미지마다 고른다, 기본은 스타일) ──
  const REF_ROLE = Object.fromEntries(K.refRoles.map((r) => [r.id, r]));
  const refRole = (plan, id) => (REF_ROLE[plan.refRoles?.[id]] ? plan.refRoles[id] : "style");
  const refsOf = (plan, role) => plan.images.filter((id) => refRole(plan, id) === role);
  const planRefsOrdered = (plan) => K.refRoles.flatMap((r) => refsOf(plan, r.id)); // 스타일 → 등장 대상 → 구도 순서
  const refCounts = (plan) => K.refRoles.map((r) => ({ ...r, n: refsOf(plan, r.id).length })).filter((r) => r.n);

  // 이미지 모델에 레퍼런스가 무엇인지 알려 주는 문장. 앞쪽 nChars 장 = 캐릭터 시트, 그 뒤 roles = 기획 레퍼런스 쓰임 (순서대로)
  function refRoleNote(nChars, roles = []) {
    const parts = [];
    if (nChars) parts.push(`Reference image${nChars > 1 ? `s 1-${nChars} are character sheets` : " 1 is a character sheet"}: put ${nChars > 1 ? "these characters" : "this character"} in the scene exactly as designed (face, colors, outfit, proportions, props). Do not copy the sheet's turnaround layout.`);
    let i = nChars;
    for (let k = 0; k < roles.length;) {
      let j = k;
      while (j < roles.length && roles[j] === roles[k]) j++;
      const a = i + 1, b = i + (j - k);
      parts.push(`Reference image${a === b ? ` ${a} is a` : `s ${a}-${b} are`} ${REF_ROLE[roles[k]]?.en || REF_ROLE.style.en}.`);
      i = b;
      k = j;
    }
    return parts.join("\n");
  }

  // 기획(컨셉·팔레트·룩)과 스타일프레임(이미지를 직접 보고)에 맞춘 기준 이미지 프롬프트 — Claude 가 없으면 기본 틀
  async function characterBaseEn(c) {
    if (!aiReady()) return characterBasePrompt(c);
    const p = current();
    const planChar = p.plan.result?.characters?.find((x) => x.name === c.name);
    const text = `${projectContext(p, { withChars: false })}\n\n[캐릭터]\n이름: ${c.name || "(이름 없음)"}\n설명: ${c.desc || planChar?.description || "(설명 없음)"}` +
      `${str(c.props) ? `\n소품: ${c.props}` : ""}\n\n${p.style.pick ? "첨부 이미지는 이 작품의 스타일프레임입니다. 이 화풍에 정확히 맞춰 " : refsOf(p.plan, "style").length ? "첨부 이미지는 기획의 스타일 레퍼런스예요. 화풍·색감·질감·분위기만 참고하고 그 안의 캐릭터·사물은 가져오지 말고 " : ""}이 캐릭터의 기준 이미지 프롬프트를 영어로 써 주세요.`;
    const out = await callClaude({
      system: K.prompting.characterBase,
      content: [...(await imageBlocks(p.style.pick ? [p.style.pick] : refsOf(p.plan, "style"))), { type: "text", text }],
      schema: { type: "object", additionalProperties: false, required: ["en"], properties: { en: { type: "string" } } }
    });
    return str(out.en) || characterBasePrompt(c);
  }

  // 기준 이미지 AI 생성. chain=true 면 이어서 캐릭터 시트까지 만든다 (자동 진행·'기준 이미지 + 시트' 버튼)
  async function autoCharacterBase(c, { chain = true } = {}) {
    const wm = hfModelFor("chars");
    // 웹 모델(Midjourney): 준비된 프롬프트가 있으면 바로 열고, 없으면 먼저 준비 (다음 클릭에 열림)
    if (isWebModel(wm) && c.baseEn) return webHandoff(wm, c.baseEn, [current().style.pick], "ref_style");
    if (sheetBusyFor) return toast("다른 캐릭터를 만드는 중이에요");
    if (!isWebModel(wm) && !genReady(wm)) { toast(wm.api ? `${wm.name}: AI 연결에서 API 키를 넣어 주세요` : "Higgsfield 자동 생성은 연결 프로그램(start.cmd)으로 열어야 돼요 — 다른 모델을 고를 수도 있어요"); return openSettings(); }
    sheetBusyFor = c.id;
    sheetBusyText = aiReady() ? "기획·스타일프레임에 맞춰 기준 이미지를 그리는 중이에요… (1~2분)" : "기준 이미지를 만드는 중이에요… (1~2분)";
    if (activeTab() === "chars") renderChars();
    let ok = false;
    try {
      const p = current();
      c.baseEn = await characterBaseEn(c);
      save();
      if (isWebModel(wm)) { toast(`프롬프트가 준비됐어요. '${wm.name} 열기'를 누르세요`); return; }
      // 스타일프레임이 있으면 그 화풍을, 없으면 기획의 스타일 레퍼런스를 (분위기만)
      const refs = p.style.pick ? [p.style.pick] : refsOf(p.plan, "style");
      const blob = await generateImage({ prompt: p.style.pick || !refs.length ? c.baseEn : `${c.baseEn}\n\n${refRoleNote(0, refs.map(() => "style"))}`, imageIds: refs, aspect: "2:3", stage: "chars" });
      const id = await storeMedia(blob, `${c.name || "character"}_base.png`);
      c.refs.push(id);
      c.basePick = id;
      save();
      ok = true;
      if (!chain) toast(c.refs.length > 1 ? "기준 이미지 후보를 하나 더 만들었어요. ★로 고르고 '시트 만들기'를 누르세요" : "기준 이미지를 만들었어요. 마음에 들면 '시트 만들기'를 누르세요");
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      sheetBusyFor = null;
      if (activeTab() === "chars") renderChars();
    }
    if (ok && chain) await autoCharacterSheet(c); // 이어서 시트까지
  }

  // 기준 이미지를 올리면 자동으로 불린다 (진행 상태는 renderChars 가 sheetBusyFor 로 표시)
  let sheetBusyFor = null, sheetBusyText = "";
  // 시트를 만들 기준 이미지: ★로 고른 것 (없으면 가장 최근 것)
  const baseOf = (c) => (c.refs.includes(c.basePick) ? c.basePick : c.refs.at(-1) || null);
  async function autoCharacterSheet(c) {
    const wm = hfModelFor("chars");
    if (isWebModel(wm)) return c.refs.length ? webHandoff(wm, characterSheetPrompt(c), [baseOf(c), current().style.pick], "ref") : toast("기준 이미지를 먼저 올려 주세요");
    if (sheetBusyFor) return toast("다른 캐릭터 시트를 만드는 중이에요. 끝나면 '만들기'를 눌러 주세요");
    if (!c.refs.length) return toast("기준 이미지를 먼저 올려 주세요");
    if (!genReady("chars")) { toast(hfModelFor("chars").api ? "AI 연결에서 API 키를 넣어 주세요" : "Higgsfield 자동 생성은 연결 프로그램(start.cmd)으로 열어야 돼요 — 다른 모델을 고를 수도 있어요"); return openSettings(); }
    sheetBusyFor = c.id;
    sheetBusyText = "시트를 만드는 중이에요… (1~2분)";
    if (activeTab() === "chars") renderChars();
    try {
      const base = baseOf(c);
      const blob = await generateImage({ prompt: characterSheetPrompt(c), imageIds: [base, current().style.pick], aspect: "3:2", stage: "chars" });
      const id = await storeMedia(blob, `${c.name || "character"}_sheet.png`);
      const target = current().characters.find((x) => x.id === c.id);
      if (!target) return cleanupMedia([id]);
      target.images.push(id);
      // 기준을 바꿔 새로 만든 시트는 바로 선택 (같은 기준으로 한 장 더 만들 때는 고른 것을 그대로 둔다)
      if (!target.pick || target.sheetBase !== base) target.pick = id;
      target.sheetBase = base;
      save();
      toast("캐릭터 시트를 만들었어요. 마음에 들면 ★로 고르세요");
    } catch (err) {
      toast(err.message || "캐릭터 시트를 만들지 못했어요");
    } finally {
      sheetBusyFor = null;
      if (activeTab() === "chars") renderChars();
      renderNav();
    }
  }

  // API 로 보낼 이미지: 긴 변 1568px 이하 JPEG 로 줄여 base64 로 만든다
  async function imageBlockFor(id) {
    const rec = await getMedia(id).catch(() => null);
    if (!rec || rec.kind === "video") return null;
    const bmp = await createImageBitmap(rec.blob);
    try {
      const dataUrl = await blobToDataUrl(await bitmapToJpeg(bmp, 1568, 0.85));
      return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) } };
    } finally { bmp.close?.(); }
  }
  const imageBlocks = async (ids) => (await Promise.all(ids.filter(Boolean).map(imageBlockFor))).filter(Boolean);

  // 프롬프트 초안에 넣을 작품 맥락 (기획 · 스타일프레임 · 캐릭터)
  function projectContext(p, { withChars = true, withStyle = true } = {}) {
    const plan = p.plan, r = plan.result;
    const lines = ["[작품 맥락]"];
    if (plan.topic) lines.push(`주제: ${plan.topic}`);
    if (plan.purpose) lines.push(`목적: ${plan.purpose}`);
    if (plan.mood) lines.push(`느낌: ${plan.mood}`);
    lines.push(`화면 비율: ${plan.ratio || "16:9"}`);
    if (r) {
      lines.push(`컨셉: ${r.title} — ${r.logline}`, r.concept);
      if (r.direction.look) lines.push(`룩: ${r.direction.look}`);
      if (r.direction.palette.length) lines.push(`팔레트: ${r.direction.palette.map((c) => `${c.name} ${c.hex}`).join(", ")}`);
      if (r.direction.motion) lines.push(`모션: ${r.direction.motion}`);
      if (r.direction.camera) lines.push(`카메라: ${r.direction.camera}`);
    }
    const kws = styleKeywordsOn(plan);
    if (kws.length) lines.push(`스타일 키워드 (레퍼런스 분석): ${kws.map((k) => `${k.ko}(${k.en})`).join(", ")}`);
    const subj = refsOf(plan, "subject").length;
    if (subj) lines.push(`등장 대상 레퍼런스: ${subj}장 (제품·사물·로고를 그 모습 그대로 등장시킬 것)`);
    if (withStyle && p.style.ko) lines.push(`스타일프레임 프롬프트: ${p.style.ko}`);
    if (withChars && p.characters.length) lines.push(`캐릭터 (프롬프트에서는 @이름으로): ${p.characters.map((c) => `${charTag(c) ? `@${charTag(c)}` : c.name}(${c.desc})`).join(" / ")}`);
    return lines.join("\n");
  }
  const shotLine = (s, i) => {
    let line = `컷 ${i + 1} (${s.duration}초, ${s.type}): ${s.description || "(설명 없음)"}`;
    const b = s.board;
    const notes = b ? [b.action && `  화면: ${b.action}`, b.camera && `  카메라: ${b.camera}`, b.sound && `  사운드: ${b.sound}`, b.transition && `  전환: ${b.transition}`].filter(Boolean) : [];
    return notes.length ? `${line}\n${notes.join("\n")}` : line;
  };

  // ── 프롬프트 카드 (한글 작성·확인 → 영문화 → Higgsfield) ──
  // pkey: "style", "char:<id>", "shot:<id>:img", "shot:<id>:vid"
  function promptTarget(pkey) {
    const p = current();
    if (pkey === "style") return { obj: p.style, ko: "ko", en: "en", kind: "image" };
    const [kind, id, sub] = pkey.split(":");
    if (kind === "char") return { obj: p.characters.find((c) => c.id === id), ko: "ko", en: "en", kind: "image" };
    const shot = p.shots.find((s) => s.id === id);
    return sub === "vid" ? { obj: shot, ko: "vko", en: "ven", kind: "video" } : { obj: shot, ko: "ko", en: "en", kind: "image" };
  }
  const isStale = (t) => !!(t.obj[t.en] && t.obj[`${t.en}Src`] !== undefined && t.obj[`${t.en}Src`] !== t.obj[t.ko]);

  function promptCard(pkey, { placeholder = "", hint = "" } = {}) {
    const t = promptTarget(pkey);
    if (!t.obj) return "";
    const site = t.kind === "video" ? "영상" : "이미지";
    return `<div class="pcard ${isStale(t) ? "stale" : ""}" data-pkey="${esc(pkey)}">
      <div class="pcard-cols">
        <label><span class="pcard-label">한글 프롬프트 <em>작성·확인</em>${pkey.startsWith("shot:") && t.kind === "image" ? shotPromptBadge(t.obj) : ""}</span>
          <textarea data-pfield="ko" rows="5" placeholder="${esc(placeholder)}">${esc(t.obj[t.ko])}</textarea></label>
        <label><span class="pcard-label">영문 프롬프트 <em class="stale-note">한글이 바뀌었어요 — 다시 영문화</em></span>
          <textarea data-pfield="en" rows="5" placeholder="영문화를 누르면 여기에 채워져요 (직접 고쳐도 돼요)">${esc(t.obj[t.en])}</textarea></label>
      </div>
      ${pkey.startsWith("char:") ? "" : charChips(`${t.obj[t.ko]} ${t.obj[t.en]}`)}
      ${hint ? `<p class="hint">${hint}</p>` : ""}
      <div class="pcard-ai">
        <span class="pcard-ai-icon" aria-hidden="true">✨</span>
        <input data-pedit placeholder="AI에게 고칠 점 — 예: ${t.kind === "video" ? "카메라를 천천히 위로, 끝에 미소 짓기" : "배경을 밤으로, 카메라를 더 낮게"}" aria-label="AI에게 고칠 점" />
        <div class="pcard-ai-chips">${(K.prompting.editPresets[t.kind] || []).map((x) => `<button type="button" class="chip-btn" data-pedit-preset="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <button type="button" class="btn small" data-pact="aiedit">고치기</button>
      </div>
      <div class="pcard-actions">
        <button type="button" class="btn ghost small" data-pact="draft">✨ AI 초안</button>
        <button type="button" class="btn ghost small" data-pact="translate">영문화 →</button>
        <button type="button" class="btn ghost small" data-pact="focus" title="크게 보고 용어 사전으로 고치기">⤢ 크게 보기 · 용어</button>
        ${isObj(t.obj[`${t.ko}Prev`]) ? `<button type="button" class="link-btn" data-pact="undo" title="자동으로 고쳐 쓰기 전 프롬프트로 (다시 누르면 되돌아가요)">↶ 이전 프롬프트</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="btn small higgs" data-pact="higgs">영문 복사 · Higgsfield ${site} 열기 ↗</button>
      </div>
    </div>`;
  }

  document.addEventListener("input", (e) => {
    const ta = e.target.closest("[data-pfield]");
    if (!ta) return;
    const card = ta.closest("[data-pkey]");
    const t = promptTarget(card.dataset.pkey);
    if (!t.obj) return;
    t.obj[ta.dataset.pfield === "ko" ? t.ko : t.en] = ta.value;
    if (ta.dataset.pfield === "en") t.obj[`${t.en}Src`] = t.obj[t.ko]; // 영문을 직접 고치면 최신으로 본다
    // 직접 처음 쓴 샷 프롬프트도 지금 기획·스토리보드를 바탕으로 쓴 것으로 본다 (이후 바뀌면 자동 반영)
    if (card.dataset.pkey.endsWith(":img") && !isObj(t.obj.koSrc) && str(t.obj.ko)) t.obj.koSrc = shotPromptSrc(current(), t.obj);
    card.classList.toggle("stale", isStale(t));
    refreshCharChips(card, t);
    save();
    renderNav();
    refreshTermUsed();
  });

  // ── 캐릭터 요소 칩 (프롬프트 카드) · @ 자동 완성 ──
  function charChips(text) {
    const els = charElems();
    if (!els.length) return "";
    const on = new Set(mentionsIn(text).map((e) => e.tag));
    return `<div class="pcard-chars"><span class="pcard-chars-label">캐릭터</span>${els.map((e) => `<button type="button" class="char-chip${on.has(e.tag) ? " on" : ""}" data-char-insert="${esc(e.tag)}">${e.img ? `<img data-img-id="${esc(e.img)}" alt="" />` : ""}@${esc(e.tag)}</button>`).join("")}<small>@이름을 쓰면 그 캐릭터 시트가 레퍼런스로 붙어요</small></div>`;
  }
  function refreshCharChips(card, t) {
    const on = new Set(mentionsIn(`${t.obj[t.ko]} ${t.obj[t.en]}`).map((e) => e.tag));
    $$("[data-char-insert]", card).forEach((b) => b.classList.toggle("on", on.has(b.dataset.charInsert)));
  }
  // 입력 칸 커서 자리에 넣기 (브라우저 입력으로 — 칸 안에서 Ctrl+Z 가능)
  function insertAtCursor(el, text, from = null) {
    const a = from ?? el.selectionStart ?? el.value.length, b = el.selectionEnd ?? el.value.length;
    el.focus();
    el.setSelectionRange(a, b);
    if (!document.execCommand("insertText", false, text)) {
      el.setRangeText(text, a, b, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  document.addEventListener("mousedown", (e) => { if (e.target.closest("[data-char-insert], .mention-pop")) e.preventDefault(); });
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-char-insert]");
    if (chip) {
      const card = chip.closest(".pcard");
      const act = document.activeElement;
      const ta = act && card.contains(act) && act.matches("textarea[data-pfield], [data-pedit]") ? act : $('[data-pfield="ko"]', card);
      const v = ta.value, a = ta.selectionStart ?? v.length;
      return insertAtCursor(ta, `${a && !/\s$/.test(v.slice(0, a)) ? " " : ""}@${chip.dataset.charInsert} `);
    }
    const h = e.target.closest("[data-copy-handle]");
    if (h) copyText(`@${h.dataset.copyHandle}`).then((ok) => toast(ok ? `@${h.dataset.copyHandle} 복사했어요 — 아무 프롬프트에 붙이면 이 캐릭터가 레퍼런스로 붙어요` : "복사 실패"));
  });

  // @ 를 치면 캐릭터 목록 (↑↓ · Enter/Tab · Esc)
  const mention = { el: null, pop: null, start: 0, items: [], i: 0 };
  const MENTION_FIELDS = "textarea[data-pfield], input[data-pedit]";
  function caretXY(el) {
    // 글 칸과 같은 모양의 숨은 거울로 커서 위치를 잰다
    const cs = getComputedStyle(el), m = document.createElement("div");
    for (const k of ["font", "letterSpacing", "lineHeight", "padding", "border", "boxSizing", "whiteSpace", "wordWrap", "overflowWrap", "width"]) m.style[k] = cs[k];
    Object.assign(m.style, { position: "fixed", visibility: "hidden", left: "0", top: "0", whiteSpace: el.tagName === "INPUT" ? "pre" : "pre-wrap" });
    m.textContent = el.value.slice(0, el.selectionStart);
    const mark = document.createElement("span");
    mark.textContent = "​";
    m.appendChild(mark);
    document.body.appendChild(m);
    const r = el.getBoundingClientRect(), x = mark.offsetLeft - el.scrollLeft, y = mark.offsetTop - el.scrollTop + mark.offsetHeight;
    m.remove();
    return { x: r.left + Math.min(x, r.width - 20), y: r.top + Math.min(y, r.height) + 4 };
  }
  function closeMention() { mention.pop?.remove(); mention.pop = null; mention.el = null; }
  function showMention(el) {
    const before = el.value.slice(0, el.selectionStart ?? 0);
    const mm = before.match(/(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_]*)$/u);
    const all = charElems();
    if (!mm || !all.length) return closeMention();
    const q = mm[2].toLowerCase();
    const items = all.filter((x) => x.tag.toLowerCase().startsWith(q) || x.c.name.toLowerCase().includes(q));
    if (!items.length) return closeMention();
    mention.el = el; mention.start = before.length - mm[2].length - 1; mention.items = items;
    mention.i = Math.min(mention.i, items.length - 1);
    if (!mention.pop) {
      mention.pop = document.createElement("div");
      mention.pop.className = "mention-pop";
      mention.pop.setAttribute("role", "listbox");
      (el.closest("dialog") || document.body).appendChild(mention.pop);
    }
    mention.pop.innerHTML = items.map((x, k) => `<button type="button" role="option" class="${k === mention.i ? "on" : ""}" data-mention="${k}">${x.img ? `<img data-img-id="${esc(x.img)}" alt="" />` : `<i></i>`}<b>@${esc(x.tag)}</b><small>${esc(cutText(str(x.c.desc), 24))}</small></button>`).join("");
    hydrateThumbs(mention.pop);
    const { x, y } = caretXY(el);
    Object.assign(mention.pop.style, { left: `${Math.min(x, innerWidth - 260)}px`, top: `${Math.min(y, innerHeight - 40 - items.length * 44)}px` });
  }
  function pickMention(k) {
    const x = mention.items[k], el = mention.el;
    if (!x || !el) return closeMention();
    const end = el.selectionStart;
    el.setSelectionRange(mention.start, end);
    closeMention();
    insertAtCursor(el, `@${x.tag} `);
  }
  document.addEventListener("input", (e) => { if (e.target.matches?.(MENTION_FIELDS)) showMention(e.target); else closeMention(); });
  document.addEventListener("keydown", (e) => {
    if (!mention.pop || e.target !== mention.el || e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      mention.i = (mention.i + (e.key === "ArrowDown" ? 1 : -1) + mention.items.length) % mention.items.length;
      showMention(mention.el);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopImmediatePropagation(); // 'AI에게 고칠 점' 칸의 Enter(고치기)보다 먼저
      pickMention(mention.i);
    } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMention(); }
  }, true);
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mention]");
    if (b) return pickMention(Number(b.dataset.mention));
    if (mention.pop && !e.target.closest(".mention-pop")) closeMention();
  });
  document.addEventListener("focusout", (e) => { if (e.target === mention.el) setTimeout(() => { if (document.activeElement !== mention.el) closeMention(); }, 120); });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-pact]");
    if (!btn) return;
    const pkey = btn.closest("[data-pkey]").dataset.pkey;
    const t = promptTarget(pkey);
    if (!t.obj) return;
    const act = btn.dataset.pact;
    if (act === "focus") return openPromptFocus(pkey);
    if (act === "aiedit") return aiEditPrompt(btn, pkey);
    if (act === "undo") {
      // 자동으로 고쳐 쓰기 전 ↔ 지금 (서로 바꾸므로 다시 누르면 되돌아간다)
      const prev = t.obj[`${t.ko}Prev`];
      if (!isObj(prev)) return;
      t.obj[`${t.ko}Prev`] = { ko: t.obj[t.ko], en: t.obj[t.en], at: Date.now() };
      t.obj[t.ko] = str(prev.ko);
      t.obj[t.en] = str(prev.en);
      if (t.obj[t.en]) t.obj[`${t.en}Src`] = t.obj[t.ko]; else delete t.obj[`${t.en}Src`];
      save();
      renderActive();
      return toast("이전 프롬프트로 바꿨어요. 한 번 더 누르면 되돌아가요");
    }
    if (act === "higgs") {
      const text = t.obj[t.en] || t.obj[t.ko];
      if (!text) return toast("프롬프트를 먼저 써 주세요");
      // 복사를 먼저 시작하고 곧바로 창을 연다 (await 뒤에 열면 팝업 차단에 걸린다) · @캐릭터는 이름으로 풀어서
      const copying = copyText(expandMentions(text));
      window.open(K.higgsfield[t.kind], "_blank", "noopener");
      const ok = await copying;
      // 영상: 시작 프레임(앵커 이미지)도 함께 내려받아 바로 올릴 수 있게
      const anchor = t.kind === "video" && anchorOf(t.obj);
      if (anchor) downloadMedia(anchor, `shot${pad2(current().shots.indexOf(t.obj) + 1)}_start`);
      return toast(!ok ? "복사 실패 — 직접 복사해 주세요" : anchor ? "프롬프트를 복사하고 시작 프레임을 저장했어요" : t.obj[t.en] ? "영문 프롬프트를 복사했어요. Higgsfield에 붙여넣으세요" : "영문이 없어 한글을 복사했어요");
    }
    if (act === "draft") {
      if (t.obj[t.ko] && !confirm("지금 한글 프롬프트를 AI 초안으로 바꿀까요?")) return;
      return runAi(btn, "작성 중…", async () => {
        t.obj[t.ko] = await draftPrompt(pkey);
        if (pkey === "style") t.obj.koAuto = t.obj.ko; // AI 가 쓴 그대로면 캐릭터 시트가 바뀔 때 자동으로 다시 쓴다
        save();
        renderActive();
        toast("초안을 썼어요. 읽어 보고 고친 뒤 영문화하세요");
      });
    }
    if (act === "translate") {
      if (!str(t.obj[t.ko])) return toast("한글 프롬프트를 먼저 써 주세요");
      return runAi(btn, "영문화 중…", async () => {
        const [en] = await translatePrompts([t.obj[t.ko]], t.kind);
        t.obj[t.en] = en;
        t.obj[`${t.en}Src`] = t.obj[t.ko];
        save();
        renderActive();
        toast("영문화했어요");
      });
    }
  });

  // ── 프롬프트 크게 보기 + 용어 사전 ──
  // 용어 사전은 크게 보기 창 오른쪽에 늘 있고, 샷 이미지·영상화 화면에서는 오른쪽 서랍(📖 용어 사전)으로도 띄운다.
  // 용어를 누르면 마지막으로 누른 프롬프트 칸의 커서 자리에 들어간다 (한글 칸 = 한글 용어, 영문 칸 = 영문 표현)
  const termUi = { cat: K.terms[0].id, q: "", target: null, hover: null, dock: false, adding: false, fresh: new Set() };
  // 기본 용어 + 내가 넣은 용어(state.customTerms, 모든 프로젝트 공통). 맞는 분류가 없으면 '내 용어'
  function termCats() {
    const mine = state.customTerms.map((t) => ({ ...t, mine: true }));
    const cats = K.terms.map((c) => ({ ...c, items: [...c.items, ...mine.filter((t) => t.cat === c.id)] }));
    const rest = mine.filter((t) => !K.terms.some((c) => c.id === t.cat));
    if (rest.length) cats.push({ id: "mine", ko: "내 용어", items: rest });
    return cats;
  }
  let termByKo = new Map();
  function rebuildTerms() { termByKo = new Map(termCats().flatMap((c) => c.items.map((x) => [x.ko, x]))); }
  rebuildTerms();

  function addCustomTerms(list) {
    const have = new Set(termByKo.keys());
    const add = list.filter((t) => isTerm(t) && !have.has(t.ko.trim())).map((t) => ({ id: t.id || newId(), cat: t.cat, ko: t.ko.trim(), en: str(t.en).trim(), desc: str(t.desc).trim(), icon: str(t.icon).trim().slice(0, 4) || "✦" }));
    if (!add.length) return [];
    state.customTerms.push(...add);
    rebuildTerms();
    save();
    termUi.fresh = new Set(add.map((t) => t.ko));
    termUi.q = "";
    termUi.cat = termCats().some((c) => c.id === add[0].cat) ? add[0].cat : "mine";
    termUi.hover = add[0].ko;
    $$("[data-term-search]").forEach((i) => (i.value = ""));
    refreshTermPanels();
    return add;
  }

  const TERM_SCHEMA = {
    type: "object", additionalProperties: false, required: ["terms"],
    properties: {
      terms: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["cat", "ko", "en", "desc", "icon"],
          properties: { cat: { type: "string", enum: [...K.terms.map((c) => c.id), "mine"] }, ko: { type: "string" }, en: { type: "string" }, desc: { type: "string" }, icon: { type: "string" } }
        }
      }
    }
  };

  // "유리 질감", "홀로그램 효과", "종이 재질 키워드 5개 더" 같은 요청 → AI 가 분류·영문·설명까지 채워 사전에 넣는다
  async function makeTerms(req, cat) {
    const text = `[분류 id]\n${K.terms.map((c) => `${c.id}: ${c.ko}`).join("\n")}\nmine: 내 용어 (어디에도 맞지 않을 때)\n\n[이미 있는 용어]\n${[...termByKo.keys()].join(", ")}\n\n[요청]\n${req}${cat ? `\n(분류는 '${cat}'로)` : ""}`;
    const out = await callClaude({ system: K.termMaker, content: [{ type: "text", text }], schema: TERM_SCHEMA, maxTokens: 3000 });
    const add = addCustomTerms(arr(out.terms).slice(0, 8).map((t) => ({ ...t, cat: cat || t.cat })));
    toast(add.length ? `용어 ${add.length}개를 넣었어요: ${add.map((t) => t.ko).join(", ")}` : "이미 사전에 있는 용어예요");
    return add.length;
  }
  const PROMPT_HOLDER = { image: "피사체, 배경, 구도, 빛, 팔레트, 스타일 + 필수·금지", video: "시간 순서의 움직임 + 카메라 움직임 + 금지(스타일 변화 등)" };

  // 용어 옆 작은 그림: 샷 크기 · 앵글 · 카메라 무빙 · 움직임 곡선
  function termFig(f) {
    const person = (x, k, ay) => `<g transform="translate(${x} 15) scale(${k}) translate(0 ${-ay})"><circle cx="0" cy="4" r="3.6"/><path d="M-6 26 L-5 11 Q0 8 5 11 L6 26 Z"/></g>`;
    const arrow = (d) => `<path d="${d}" class="tf-arrow" marker-end="url(#tfArrow)"/>`;
    let inner = "";
    if (f.t === "size") {
      inner = `${f.horizon ? '<path d="M1 21 H47" class="tf-line"/>' : ""}<g clip-path="url(#tfClip)" class="tf-fill">${person(24, f.k, f.ay)}</g>`;
    } else if (f.t === "angle") {
      const cam = { eye: [7, 11, 0], low: [8, 26, -32], high: [8, 3, 32], top: [24, 4, 90], dutch: [7, 11, 0] }[f.a];
      const subj = f.a === "top" ? [24, 21] : [32, 11];
      inner = `<g class="tf-fill"${f.a === "dutch" ? ' transform="rotate(-16 32 15)"' : ""}>${f.a === "top" ? '<circle cx="24" cy="21" r="4.5"/>' : person(32, 0.85, 13)}</g>
        <path d="M${cam[0]} ${cam[1]} L${subj[0]} ${subj[1]}" class="tf-dash"/>
        <g transform="translate(${cam[0]} ${cam[1]}) rotate(${cam[2]})" class="tf-cam"><rect x="-4" y="-2.5" width="6" height="5" rx="1"/><path d="M2 0 L5 -2.6 V2.6 Z"/></g>`;
    } else if (f.t === "move") {
      const body = `<g class="tf-fill faint">${person(24, 0.55, 13)}</g>`;
      inner = body + ({
        static: '<path d="M20 15 H28 M24 11 V19" class="tf-line"/>',
        push: arrow("M5 4 L11 8") + arrow("M43 4 L37 8") + arrow("M5 26 L11 22") + arrow("M43 26 L37 22"),
        pull: arrow("M12 9 L5 4") + arrow("M36 9 L43 4") + arrow("M12 21 L5 26") + arrow("M36 21 L43 26"),
        pan: arrow("M8 25 Q24 21 40 25"),
        tilt: arrow("M41 24 Q37 15 41 6"),
        track: arrow("M6 27 H42"),
        orbit: arrow("M9 19 A15 6 0 1 0 39 19"),
        crane: arrow("M6 26 Q10 8 40 5"),
        zoom: '<rect x="13" y="8" width="22" height="14" rx="1" class="tf-dash"/>' + arrow("M3 3 L12 7") + arrow("M45 27 L36 23"),
        crash: '<rect x="15" y="9" width="18" height="12" rx="1" class="tf-dash"/>' + arrow("M2 3 L13 8") + arrow("M46 3 L35 8") + arrow("M2 27 L13 22") + arrow("M46 27 L35 22"),
        vertigo: arrow("M20 15 L8 6") + arrow("M28 15 L40 24") + '<path d="M4 15 H10 M38 15 H44" class="tf-line"/>',
        handheld: '<path d="M6 25 l4 -3 l4 5 l4 -5 l4 5 l4 -5 l4 5 l4 -5 l4 5 l2 -2" class="tf-arrow"/>',
        whip: arrow("M5 15 H43") + '<path d="M9 9 H37 M9 21 H37" class="tf-line faint"/>',
        rack: '<circle cx="13" cy="15" r="6" class="tf-solid"/><circle cx="36" cy="13" r="4" class="tf-solid faint"/>' + arrow("M20 22 Q26 26 33 20")
      }[f.m] || "");
    } else if (f.t === "ease") {
      const c = {
        linear: "M5 25 L43 5", inout: "M5 25 C22 25 26 5 43 5", out: "M5 25 C9 7 22 5 43 5",
        overshoot: "M5 25 C14 -6 24 7 43 5", bounce: "M5 25 Q13 5 19 5 Q22 12 25 5 Q27 9 30 5 L43 5", step: "M5 25 H12 V20 H19 V15 H26 V10 H33 V5 H43"
      }[f.c];
      inner = `<path d="M5 3 V25 H45" class="tf-line faint"/><path d="${c}" class="tf-arrow"/>`;
    }
    return `<svg viewBox="0 0 48 30" class="tfig" aria-hidden="true"><defs><clipPath id="tfClip"><rect x="1" y="1" width="46" height="28" rx="3"/></clipPath>
      <marker id="tfArrow" viewBox="0 0 6 6" refX="4" refY="3" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6 Z" class="tf-head" stroke="none"/></marker></defs>
      <rect x="1" y="1" width="46" height="28" rx="3" class="tf-frame"/>${inner}</svg>`;
  }

  const termIcon = (x) => (x.fig ? termFig(x.fig) : `<span class="ticon">${esc(x.icon || "•")}</span>`);

  function termItems() {
    const q = termUi.q.trim().toLowerCase();
    const cats = termCats();
    if (!q) return (cats.find((c) => c.id === termUi.cat) || cats[0]).items;
    return cats.flatMap((c) => c.items).filter((x) => `${x.ko} ${x.en} ${x.desc}`.toLowerCase().includes(q));
  }

  // 지금 고르고 있는 프롬프트 칸에 이미 쓰인 용어
  function usedTerms() {
    const v = (termUi.target?.isConnected ? termUi.target.value : "").toLowerCase();
    return new Set(v ? [...termByKo.values()].filter((x) => v.includes(x.ko.toLowerCase()) || (x.en && v.includes(x.en.toLowerCase()))).map((x) => x.ko) : []);
  }
  const termWord = (x, ta) => (ta?.dataset.pfield === "en" ? x.en || x.ko : x.ko);

  function termTargetLabel() {
    const ta = termUi.target;
    if (!ta?.isConnected) return "";
    const card = ta.closest("[data-pkey]"), pkey = card?.dataset.pkey || "";
    const [kind, id, sub] = pkey.split(":");
    const where = kind === "shot" ? `컷 ${pad2(current().shots.findIndex((s) => s.id === id) + 1)} ${sub === "vid" ? "영상" : "이미지"}` : kind === "style" ? "스타일프레임" : "캐릭터";
    return `${where} · ${ta.dataset.pfield === "en" ? "영문" : "한글"} 프롬프트`;
  }

  function termInfoHtml() {
    const x = termByKo.get(termUi.hover);
    const target = termTargetLabel();
    if (!x) return `<p class="term-tip">${target ? `넣을 곳: <b>${esc(target)}</b><br>용어에 마우스를 올리면 설명이, 누르면 커서 자리에 들어가요.` : "먼저 고칠 <b>프롬프트 칸을 눌러</b> 커서를 두세요. 그다음 용어를 누르면 그 자리에 들어가요."}</p>`;
    return `<div class="term-detail">${termIcon(x)}<div><b>${esc(x.ko)}</b>${x.en ? `<code>${esc(x.en)}</code>` : ""}</div>
        ${x.mine ? `<span class="mine-tag">내 용어</span><button type="button" class="link-btn term-del" data-term-del="${esc(x.ko)}">지우기</button>` : ""}</div>
      ${x.desc ? `<p>${esc(x.desc)}</p>` : ""}
      <p class="term-tip">${target ? `누르면 <b>${esc(target)}</b>에 “${esc(termWord(x, termUi.target))}”가 들어가요` : "프롬프트 칸을 먼저 눌러 주세요"}</p>`;
  }

  function termGridHtml() {
    const used = usedTerms(), items = termItems();
    return items.map((x) => `<button type="button" class="term${used.has(x.ko) ? " used" : ""}${x.mine ? " mine" : ""}${termUi.fresh.has(x.ko) ? " fresh" : ""}" data-term="${esc(x.ko)}">${termIcon(x)}<b>${esc(x.ko)}</b><small>${esc(x.en || "내 용어")}</small></button>`).join("")
      || `<p class="hint">찾는 용어가 없어요. <button type="button" class="link-btn" data-term-add-toggle>＋ 추가</button>로 넣을 수 있어요</p>`;
  }

  function termCatsHtml() {
    return termCats().map((c) => `<button type="button" class="${!termUi.q.trim() && c.id === termUi.cat ? "on" : ""}" data-term-cat="${c.id}">${esc(c.ko)}</button>`).join("");
  }

  function termPanel({ dock = false } = {}) {
    return `<aside class="term-panel" aria-label="용어 사전">
      <div class="term-head"><b>📖 용어 사전</b><button type="button" class="btn ghost small term-add-btn${termUi.adding ? " on" : ""}" data-term-add-toggle title="재질·효과 등 원하는 용어를 사전에 넣기">＋ 용어 추가</button>${dock ? `<button type="button" class="icon-btn" data-term-dock aria-label="용어 사전 닫기">✕</button>` : ""}</div>
      <div class="term-add" ${termUi.adding ? "" : "hidden"}>
        <textarea data-term-req rows="2" placeholder="넣고 싶은 용어나 느낌 (예: 유리 질감 / 홀로그램 효과 / 종이 재질 키워드 5개 더)"></textarea>
        <div class="term-add-row">
          <select data-term-req-cat aria-label="분류"><option value="">분류: AI가 정하기</option>${K.terms.map((c) => `<option value="${c.id}">${esc(c.ko)}</option>`).join("")}<option value="mine">내 용어</option></select>
          <button type="button" class="btn ghost small" data-term-req-plain title="AI 없이 적은 그대로 넣기">그대로</button>
          <button type="button" class="btn small" data-term-req-ai>✨ AI로 만들기</button>
        </div>
      </div>
      <input class="term-search" data-term-search value="${esc(termUi.q)}" placeholder="찾기 (예: 앵글, zoom, 질감)" aria-label="용어 찾기" />
      <div class="term-cats">${termCatsHtml()}</div>
      <div class="term-grid">${termGridHtml()}</div>
      <div class="term-info">${termInfoHtml()}</div>
    </aside>`;
  }

  // 검색어·분류가 바뀌면 목록만 다시 그린다 (검색 칸 포커스 유지)
  function refreshTermPanels({ grid = true } = {}) {
    for (const panel of $$(".term-panel")) {
      if (grid) { $(".term-cats", panel).innerHTML = termCatsHtml(); $(".term-grid", panel).innerHTML = termGridHtml(); }
      $(".term-info", panel).innerHTML = termInfoHtml();
    }
  }
  function refreshTermUsed() {
    if (!$(".term-panel")) return;
    const used = usedTerms();
    $$(".term-panel [data-term]").forEach((b) => b.classList.toggle("used", used.has(b.dataset.term)));
  }

  function insertTerm(ko) {
    const x = termByKo.get(ko), ta = termUi.target;
    if (!x) return;
    if (!ta?.isConnected) return toast("용어를 넣을 프롬프트 칸을 먼저 눌러 주세요");
    const word = termWord(x, ta);
    const v = ta.value, a = ta.selectionStart ?? v.length, b = ta.selectionEnd ?? v.length;
    const pre = v.slice(0, a) && !/[\s,(\n]$/.test(v.slice(0, a)) ? ", " : "";
    const post = v.slice(b) && !/^[\s,.)\n]/.test(v.slice(b)) ? ", " : "";
    ta.focus();
    ta.setSelectionRange(a, b);
    // 브라우저 입력으로 넣어야 글 칸 안에서 Ctrl+Z 로 바로 되돌릴 수 있다 (안 되면 직접 넣기)
    if (!document.execCommand("insertText", false, pre + word + post)) {
      ta.setRangeText(pre + word + post, a, b, "end");
      ta.dispatchEvent(new Event("input", { bubbles: true })); // 저장 · 영문 최신 여부 · 쓰인 용어 표시
    }
    const card = ta.closest(".pcard");
    card?.classList.remove("term-flash");
    void card?.offsetWidth;
    card?.classList.add("term-flash");
  }

  // 오른쪽 서랍 (샷 이미지 · 영상화)
  function renderTermDock() {
    const show = termUi.dock && ["shots", "video"].includes(activeTab());
    let dock = $("#termDock");
    document.body.classList.toggle("term-dock-open", show);
    if (!show) { dock?.remove(); return; }
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "termDock";
      dock.className = "term-dock";
      document.body.appendChild(dock);
      dock.innerHTML = termPanel({ dock: true });
    } else refreshTermPanels();
    $$("[data-term-dock]").forEach((b) => b.classList.toggle("on", termUi.dock));
  }

  // 크게 보기: 넓은 편집 창 + 컷 맥락(스케치·앵커·요약) + 용어 사전. ‹ › 로 컷 이동
  let focusKey = null;
  function openPromptFocus(pkey) {
    let dlg = $("#promptFocus");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "promptFocus";
      dlg.className = "modal focus-modal";
      document.body.appendChild(dlg);
      dlg.addEventListener("close", () => { focusKey = null; renderActive(); });
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-focus-close]")) return dlg.close();
        const nav = e.target.closest("[data-focus-nav]");
        if (nav) {
          const [, id, sub] = focusKey.split(":"), shots = current().shots;
          const next = shots[shots.findIndex((s) => s.id === id) + Number(nav.dataset.focusNav)];
          if (next) { focusKey = `shot:${next.id}:${sub}`; renderPromptFocus(); $('#promptFocus [data-pfield="ko"]')?.focus(); }
        }
      });
    }
    focusKey = pkey;
    renderPromptFocus();
    if (!dlg.open) dlg.showModal();
    const ko = $('#promptFocus [data-pfield="ko"]');
    ko?.focus();
    ko?.setSelectionRange(ko.value.length, ko.value.length);
  }

  function renderPromptFocus() {
    const dlg = $("#promptFocus");
    if (!dlg || !focusKey) return;
    const t = promptTarget(focusKey);
    if (!t.obj) return dlg.close();
    const p = current();
    // 다시 그려도 쓰던 칸·커서를 지킨다
    const act = document.activeElement?.closest?.("#promptFocus") ? document.activeElement : null;
    const keep = act?.dataset.pfield ? { f: act.dataset.pfield, a: act.selectionStart, b: act.selectionEnd } : null;
    let title = "", ctx = "", nav = "";
    if (focusKey.startsWith("shot:")) {
      const i = p.shots.indexOf(t.obj), s = t.obj, isVid = t.kind === "video", anchor = anchorOf(s);
      title = `컷 ${pad2(i + 1)} · ${isVid ? "영상" : "이미지"} 프롬프트`;
      nav = `<button type="button" class="tbtn-l" data-focus-nav="-1" ${i ? "" : "disabled"} aria-label="이전 컷">‹</button><button type="button" class="tbtn-l" data-focus-nav="1" ${i < p.shots.length - 1 ? "" : "disabled"} aria-label="다음 컷">›</button>`;
      const pic = isVid && anchor ? `<img data-img-id="${esc(anchor)}" alt="앵커 이미지" />` : s.board?.svg ? `<img src="${svgUrl(s.board.svg)}" alt="스케치" />` : anchor ? `<img data-img-id="${esc(anchor)}" alt="" />` : "";
      ctx = `<div class="focus-ctx">${pic ? `<div class="focus-pic">${pic}</div>` : ""}${cutBrief(s)}</div>`;
    } else if (focusKey === "style") title = "스타일프레임 프롬프트";
    else title = `캐릭터 '${esc(t.obj.name || "이름 없음")}' 시트 프롬프트`;
    dlg.innerHTML = `
      <div class="focus-head"><h2>${title}</h2>${nav}<span class="spacer"></span><span class="hint">Esc 닫기</span><button type="button" class="icon-btn" data-focus-close aria-label="닫기">✕</button></div>
      <div class="focus-body">
        <div class="focus-main">${ctx}${promptCard(focusKey, { placeholder: PROMPT_HOLDER[t.kind] })}</div>
        ${termPanel()}
      </div>`;
    hydrateThumbs(dlg);
    if (keep) {
      const ta = $(`#promptFocus [data-pfield="${keep.f}"]`);
      ta?.focus();
      ta?.setSelectionRange(keep.a, keep.b);
    }
  }
  const refreshFocus = () => { if ($("#promptFocus")?.open) renderPromptFocus(); };

  document.addEventListener("focusin", (e) => {
    const ta = e.target.closest?.("textarea[data-pfield]");
    if (!ta) return;
    $$(".pcard.term-target").forEach((c) => c.classList.remove("term-target"));
    termUi.target = ta;
    if ($(".term-panel")) { ta.closest(".pcard")?.classList.add("term-target"); refreshTermPanels({ grid: false }); refreshTermUsed(); }
  });
  // 용어를 누를 때 프롬프트 칸의 커서·선택이 풀리지 않게
  document.addEventListener("mousedown", (e) => { if (e.target.closest("[data-term], [data-term-cat]")) e.preventDefault(); });
  document.addEventListener("click", (e) => {
    const term = e.target.closest("[data-term]");
    if (term) return insertTerm(term.dataset.term);
    const cat = e.target.closest("[data-term-cat]");
    if (cat) {
      termUi.cat = cat.dataset.termCat;
      termUi.q = "";
      $$("[data-term-search]").forEach((i) => (i.value = ""));
      return refreshTermPanels();
    }
    if (e.target.closest("[data-term-dock]")) {
      termUi.dock = !termUi.dock;
      return renderTermDock();
    }
    // 내 용어 넣기 · 지우기
    if (e.target.closest("[data-term-add-toggle]")) {
      termUi.adding = !termUi.adding;
      $$(".term-panel .term-add").forEach((f) => { f.hidden = !termUi.adding; });
      $$(".term-add-btn").forEach((b) => b.classList.toggle("on", termUi.adding));
      if (termUi.adding) $("[data-term-req]", e.target.closest(".term-panel") || document)?.focus();
      return;
    }
    const panel = e.target.closest(".term-panel");
    const req = panel && $("[data-term-req]", panel), reqCat = panel && $("[data-term-req-cat]", panel)?.value;
    const ai = e.target.closest("[data-term-req-ai]");
    if (ai) {
      const text = req.value.trim();
      if (!text) { req.focus(); return toast("넣고 싶은 용어나 느낌을 적어 주세요"); }
      return runAi(ai, "만드는 중…", async () => { if (await makeTerms(text, reqCat)) req.value = ""; });
    }
    if (e.target.closest("[data-term-req-plain]")) {
      const words = req.value.split(/[\n,]/).map((w) => w.trim()).filter(Boolean);
      if (!words.length) { req.focus(); return toast("넣을 용어를 적어 주세요 (쉼표로 여러 개)"); }
      const add = addCustomTerms(words.map((w) => ({ cat: reqCat || "mine", ko: w, en: /^[\x20-\x7e]+$/.test(w) ? w : "", desc: "", icon: "✦" })));
      if (add.length) req.value = "";
      return toast(add.length ? `용어 ${add.length}개를 넣었어요` : "이미 사전에 있는 용어예요");
    }
    const del = e.target.closest("[data-term-del]");
    if (del) {
      state.customTerms = state.customTerms.filter((t) => t.ko !== del.dataset.termDel);
      rebuildTerms();
      save();
      termUi.hover = null;
      refreshTermPanels();
      return toast(`'${del.dataset.termDel}'을(를) 사전에서 지웠어요`);
    }
  });
  document.addEventListener("input", (e) => {
    if (!e.target.matches?.("[data-term-search]")) return;
    termUi.q = e.target.value;
    $$("[data-term-search]").forEach((i) => { if (i !== e.target) i.value = termUi.q; });
    refreshTermPanels();
  });
  document.addEventListener("mouseover", (e) => {
    const term = e.target.closest?.(".term-panel [data-term]");
    const ko = term?.dataset.term || null;
    if (!term && !e.target.closest?.(".term-panel")) return;
    if (ko === termUi.hover || (!ko && !e.target.closest?.(".term-grid"))) return;
    termUi.hover = ko;
    refreshTermPanels({ grid: false });
  });

  const KO_SCHEMA = { type: "object", additionalProperties: false, required: ["ko"], properties: { ko: { type: "string", description: "한국어 프롬프트" } } };

  // ── 프롬프트 카드: 'AI에게 고칠 점' → 지금 프롬프트를 그 요청대로 고쳐 쓰고 영문화까지 (↶ 로 되돌리기) ──
  async function aiEditPrompt(btn, pkey, instr) {
    const card = btn.closest("[data-pkey]"), input = $("[data-pedit]", card);
    instr = str(instr ?? input?.value).trim();
    if (!instr) { input?.focus(); return toast("AI에게 고칠 점을 적거나 아래 버튼을 눌러 주세요"); }
    const t = promptTarget(pkey);
    if (!t.obj) return;
    const cur = str(t.obj[t.ko]) || str(t.obj[t.en]);
    if (!cur) return toast("고칠 프롬프트가 없어요 — 먼저 ✨ AI 초안을 써 주세요");
    return runAi(btn, "고치는 중…", async () => {
      const p = current(), P = K.prompting;
      const [kind, id] = pkey.split(":");
      const base = pkey === "style" ? P.style : kind === "char" ? (Array.isArray(P.character) ? P.character.join("\n") : P.character) : t.kind === "video" ? P.shotVideo : P.shotImage;
      const shot = kind === "shot" ? p.shots.find((s) => s.id === id) : null;
      const text = `${projectContext(p)}${shot ? `\n\n[이 컷]\n${shotLine(shot, p.shots.indexOf(shot))}` : ""}` +
        `\n\n[지금 프롬프트]\n${cur}${!str(t.obj[t.ko]) ? "\n(영문만 있어요 — 고친 결과는 한국어로)" : ""}\n\n[수정 요청]\n${instr}`;
      const images = await imageBlocks(shot ? [t.kind === "video" ? anchorOf(shot) : p.style.pick] : []);
      const out = await callClaude({ system: `${base}\n\n${P.rules}\n\n${P.edit}`, content: [...images, { type: "text", text }], schema: KO_SCHEMA, maxTokens: 4000 });
      const ko = str(out.ko).trim();
      if (!ko) throw new Error("AI가 고친 프롬프트를 돌려주지 않았어요");
      t.obj[`${t.ko}Prev`] = { ko: t.obj[t.ko], en: t.obj[t.en], at: Date.now() }; // ↶ 이전 프롬프트
      t.obj[t.ko] = ko;
      const [en] = await translatePrompts([ko], t.kind);
      if (en) { t.obj[t.en] = en; t.obj[`${t.en}Src`] = ko; }
      save();
      renderActive();
      toast(`“${cutText(instr, 30)}” 반영했어요 · 영문화까지 — ↶ 이전 프롬프트로 되돌릴 수 있어요`);
    });
  }
  // 빠른 요청 버튼 · Enter
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-pedit-preset]");
    if (!chip) return;
    const card = chip.closest("[data-pkey]");
    $("[data-pedit]", card).value = chip.dataset.peditPreset;
    aiEditPrompt($('[data-pact="aiedit"]', card), card.dataset.pkey, chip.dataset.peditPreset);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || !e.target.matches?.("[data-pedit]")) return;
    e.preventDefault();
    const card = e.target.closest("[data-pkey]");
    aiEditPrompt($('[data-pact="aiedit"]', card), card.dataset.pkey);
  });

  async function draftPrompt(pkey) {
    const p = current();
    const t = promptTarget(pkey);
    const P = K.prompting;
    let system, text, images = [];
    if (pkey === "style") {
      system = `${P.style}\n\n${P.rules}`;
      const { sheets, chars } = styleSheets(p);
      p.style.draftSheets = sheets.join(","); // 어떤 캐릭터 시트로 썼는지 기억 (바뀌면 다시 쓰기)
      // 컷 흐름(스토리보드)도 넣어 작품을 대표하는 장면을 고르게 한다
      const flow = p.shots.filter((s) => str(s.description)).map((s) => `컷 ${p.shots.indexOf(s) + 1}: ${s.description}`).join("\n");
      text = `${projectContext(p, { withChars: false, withStyle: false })}${chars.length ? `\n등장 캐릭터: ${chars.map((c) => `${c.name}(${c.desc})`).join(" / ")}` : ""}` +
        `${flow ? `\n\n[컷 흐름]\n${flow}` : ""}\n\n작품 전체를 대표하는 한 장면으로 스타일프레임 프롬프트를 써 주세요.` +
        (sheets.length ? ` 앞에 첨부한 ${sheets.length}장은 고른 캐릭터 시트예요. 이 캐릭터를 디자인 그대로 장면에 등장시켜 주세요.` : "") +
        (p.plan.images.length ? ` ${sheets.length ? "그 뒤" : "첨부한"} 기획 레퍼런스는 쓰임이 정해져 있어요: ${refCounts(p.plan).map((r) => `${r.ko} ${r.n}장(${r.desc})`).join(", ")} — 이 순서로 붙어 있어요.` : "");
      images = await imageBlocks([...sheets, ...planRefsOrdered(p.plan)]);
    } else if (pkey.startsWith("char:")) {
      const c = t.obj;
      system = `${P.character}\n\n${P.rules}`;
      text = `${projectContext(p, { withChars: false })}\n\n[캐릭터]\n이름: ${c.name || "(이름 없음)"}\n설명: ${c.desc || "(설명 없음)"}` +
        `\n표정 디테일: ${str(c.expressions) || "기본 표정 3~4개"}\n소품 디테일: ${str(c.props) || "(없음 — 소품 줄은 빼기)"}` +
        `\n\n[첨부 이미지]\n${c.refs.length ? "첫 장: 이 캐릭터의 기준 이미지 (그대로 유지)" : "기준 이미지 없음 — 설명대로 디자인"}` +
        `${p.style.pick ? `\n마지막 1장: 스타일프레임 (화풍 기준)` : ""}\n\n3면도·표정·소품 디테일을 담은 캐릭터 시트 프롬프트를 써 주세요.`;
      images = await imageBlocks([baseOf(c), p.style.pick]);
    } else {
      const i = p.shots.indexOf(t.obj);
      const isVideo = t.kind === "video";
      system = `${isVideo ? P.shotVideo : P.shotImage}\n\n${P.rules}`;
      text = `${projectContext(p)}\n\n[전체 컷]\n${p.shots.map(shotLine).join("\n")}\n\n[이번 컷]\n${shotLine(t.obj, i)}`;
      if (isVideo) {
        if (t.obj.ko) text += `\n이 컷의 이미지 프롬프트: ${t.obj.ko}`;
        const end = endOf(t.obj);
        text += `\n\n첨부한 앵커 이미지(시작 프레임)를 ${t.obj.vidSec || t.obj.duration}초 동안 움직이게 할 영상 프롬프트를 써 주세요.` +
          (end ? " 두 번째 첨부 이미지는 이 영상이 끝나는 장면(엔드 프레임)이에요. 시작에서 끝 장면으로 자연스럽게 이어지는 움직임으로 써 주세요." : "");
        images = await imageBlocks([anchorOf(t.obj), end]);
      } else {
        // 스토리보드 스케치가 있으면 함께 보고 구도(배치·샷 크기·앵글)를 프롬프트에 옮긴다
        const sketch = await boardRefId(p, t.obj).catch(() => null);
        text += `\n\n이 컷의 샷 이미지 프롬프트를 써 주세요.${sketch ? ` ${p.style.pick ? "두 번째" : "첨부한"} 이미지는 이 컷의 스토리보드 스케치예요 — 배치·샷 크기·앵글을 프롬프트에 구체적으로 옮기고, 선 그림체는 따르지 마세요.` : ""}`;
        images = await imageBlocks([p.style.pick, sketch]);
      }
    }
    const out = await callClaude({ system, content: [...images, { type: "text", text }], schema: KO_SCHEMA });
    if (pkey.startsWith("shot:") && t.kind === "image") t.obj.koSrc = shotPromptSrc(p, t.obj); // 이 내용으로 썼다 (바뀌면 자동 반영)
    return str(out.ko);
  }

  // 여러 컷을 한 번에: 비어 있는 한글 프롬프트만 채운다
  async function draftAllShots(kind) {
    const p = current();
    const P = K.prompting;
    const isVideo = kind === "video";
    const koField = isVideo ? "vko" : "ko";
    const targets = p.shots.map((s, i) => ({ s, i })).filter(({ s }) => !str(s[koField]) && (!isVideo || anchorOf(s)));
    if (!targets.length) return 0;
    const schema = {
      type: "object", additionalProperties: false, required: ["items"],
      properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["cut", "ko"], properties: { cut: { type: "integer" }, ko: { type: "string" } } } } }
    };
    const list = targets.map(({ s, i }) => shotLine(s, i) + (isVideo && s.ko ? `\n  이미지 프롬프트: ${s.ko}` : "")).join("\n");
    const text = `${projectContext(p)}\n\n[전체 컷]\n${p.shots.map(shotLine).join("\n")}\n\n[프롬프트를 쓸 컷]\n${list}\n\n위 컷들의 ${isVideo ? "영상(이미지 투 비디오)" : "샷 이미지"} 프롬프트를 컷 번호(cut)와 함께 써 주세요. 컷끼리 화풍과 팔레트가 이어지게 합니다.`;
    const images = await imageBlocks([p.style.pick]);
    const out = await callClaude({ system: `${isVideo ? P.shotVideo : P.shotImage}\n\n${P.rules}`, content: [...images, { type: "text", text }], schema });
    let filled = 0;
    for (const item of arr(out.items)) {
      const shot = p.shots[Number(item.cut) - 1];
      if (shot && targets.some((t) => t.s === shot) && str(item.ko)) {
        shot[koField] = str(item.ko);
        if (!isVideo) shot.koSrc = shotPromptSrc(p, shot);
        filled++;
      }
    }
    save();
    renderActive();
    return filled;
  }

  async function translatePrompts(texts, kind) {
    const schema = {
      type: "object", additionalProperties: false, required: ["items"],
      properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "en"], properties: { n: { type: "integer" }, en: { type: "string" } } } } }
    };
    const text = `다음 ${kind === "video" ? "영상" : "이미지"} 생성 프롬프트를 영어로 바꿔 주세요. 번호(n)를 그대로 돌려주세요.\n\n${texts.map((t, i) => `[${i + 1}]\n${t}`).join("\n\n")}`;
    const out = await callClaude({ system: K.prompting.translate, content: [{ type: "text", text }], schema });
    const map = new Map(arr(out.items).map((x) => [Number(x.n), str(x.en)]));
    return texts.map((_, i) => map.get(i + 1) || "");
  }

  async function translateAllShots(kind) {
    const p = current();
    const [ko, en] = kind === "video" ? ["vko", "ven"] : ["ko", "en"];
    const targets = p.shots.filter((s) => str(s[ko]) && (!s[en] || isStale({ obj: s, ko, en })));
    if (!targets.length) return 0;
    const results = await translatePrompts(targets.map((s) => s[ko]), kind);
    targets.forEach((s, i) => { if (results[i]) { s[en] = results[i]; s[`${en}Src`] = s[ko]; } });
    save();
    renderActive();
    return targets.length;
  }

  // ── 1 기획: 브리프 + 레퍼런스 → AI 컨셉·방향성·시나리오 ──
  const planForm = $("#planForm");
  const PLAN_FIELDS = ["topic", "purpose", "mood", "runtime", "ratio", "notes"];
  const HEX = /^#[0-9a-f]{6}$/i;
  let planJob = null; // 진행 중인 생성 { stream, chars, refine }

  // Claude 구조화 출력용 스키마 (shot_type 은 앱의 샷 용어 중에서 고르게 해 샷 리스트로 그대로 보낸다)
  const PLAN_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["title", "logline", "concept", "direction", "characters", "scenario", "risks"],
    properties: {
      title: { type: "string", description: "작품 가제" },
      logline: { type: "string", description: "작품을 한 문장으로" },
      concept: { type: "string", description: "컨셉 설명 3~5문장" },
      direction: {
        type: "object",
        additionalProperties: false,
        required: ["look", "palette", "motion", "camera", "typography", "sound"],
        properties: {
          look: { type: "string", description: "룩 & 필: 스타일, 질감, 조명, 그래픽 요소" },
          palette: {
            type: "array",
            description: "컬러 팔레트 4~6색",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "hex"],
              properties: { name: { type: "string" }, hex: { type: "string", description: "#RRGGBB" } }
            }
          },
          motion: { type: "string", description: "움직임의 성격과 리듬, 전환 방식" },
          camera: { type: "string", description: "카메라 운용 원칙" },
          typography: { type: "string", description: "글자 사용 방식 (없으면 '없음')" },
          sound: { type: "string", description: "음악·효과음 방향" }
        }
      },
      characters: {
        type: "array",
        description: "등장 캐릭터 (없으면 빈 배열). 사람·동물·마스코트처럼 여러 컷에서 같은 모습이 유지돼야 하는 것",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description"],
          properties: { name: { type: "string" }, description: { type: "string", description: "생김새·의상·색·성격" } }
        }
      },
      scenario: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["start", "end", "title", "visual", "shot_type", "camera_move", "sound"],
          properties: {
            start: { type: "number", description: "시작 초" },
            end: { type: "number", description: "끝 초" },
            title: { type: "string", description: "장면 이름 (짧게)" },
            visual: { type: "string", description: "화면에 보이는 것. 이미지 프롬프트로 옮길 수 있게 구체적으로" },
            shot_type: { type: "string", enum: K.shots.map((s) => s.ko) },
            camera_move: { type: "string" },
            sound: { type: "string" }
          }
        }
      },
      risks: { type: "array", items: { type: "string" }, description: "AI 생성 시 주의할 점, 후반 작업으로 돌릴 것" }
    }
  };

  function initPlanForm() {
    $("#purposeList").innerHTML = K.planning.purposes.map((p) => `<option value="${esc(p)}"></option>`).join("");
    $("#runtimeList").innerHTML = K.planning.runtimes.map((s) => `<option value="${s}"></option>`).join("");
  }

  function renderPlan() {
    const plan = current().plan;
    PLAN_FIELDS.forEach((f) => { planForm[f].value = plan[f] ?? (f === "ratio" ? "16:9" : ""); });
    renderPlanRefs();
    renderPlanResult();
  }

  planForm.addEventListener("input", () => {
    const plan = current().plan;
    PLAN_FIELDS.forEach((f) => { plan[f] = planForm[f].value; });
    save();
  });

  // 기획 레퍼런스: 이미지마다 쓰임(🎨 스타일 / 📦 등장 대상 / 📐 구도·연출)을 고르고, 스타일 레퍼런스는 자동으로 분석한다
  function renderPlanRefs() {
    const plan = current().plan;
    const box = $("#planRefs");
    box.innerHTML = `
      <div class="media-grid plan-refs">${plan.images.map((id) => {
        const role = refRole(plan, id);
        return `<span class="thumb ref-thumb role-${role}">
          <img data-img-id="${esc(id)}" alt="" title="크게 보기" />
          <button type="button" class="thumb-del" data-media-del="plan|images|${esc(id)}" aria-label="삭제">✕</button>
          <span class="role-seg" role="group" aria-label="이 레퍼런스의 쓰임">${K.refRoles.map((r) => `<button type="button" class="${r.id === role ? "on" : ""}" data-ref-role="${esc(id)}|${r.id}" title="${esc(r.ko)} — ${esc(r.desc)}" aria-pressed="${r.id === role}">${r.icon}</button>`).join("")}</span>
          <em class="role-name">${esc(REF_ROLE[role].ko)}</em>
        </span>`;
      }).join("")}
        ${plan.images.length < K.planning.maxRefs ? `<button type="button" class="media-add" data-media-add="plan|images"><span>＋</span>이미지 추가<small>끌어다 놓기 · Ctrl+V</small></button>` : ""}
      </div>
      <div id="styleAnalysis"></div>`;
    hydrateThumbs(box);
    renderStyleAnalysis();
    queueStyleAnalysis();
  }

  $("#planRefs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ref-role]");
    if (!b) return;
    const [id, role] = b.dataset.refRole.split("|");
    const plan = current().plan;
    if (refRole(plan, id) === role) return;
    plan.refRoles = { ...(isObj(plan.refRoles) ? plan.refRoles : {}), [id]: role };
    save();
    renderPlanRefs();
    toast(`${REF_ROLE[role].icon} ${REF_ROLE[role].ko} — ${REF_ROLE[role].desc}`);
  });

  // ── 스타일 레퍼런스 분석: 키워드(켜고 끄기) + 고를 수 있는 스타일 방향 3개 ──
  const STYLE_KW_CATS = ["화풍", "재질", "색", "빛", "효과", "구도", "분위기"];
  const STYLE_SCHEMA = {
    type: "object", additionalProperties: false, required: ["summary", "keywords", "options", "recommend", "reason"],
    properties: {
      summary: { type: "string" },
      recommend: { type: "integer", description: "가장 추천하는 방향 번호 (1~3)" },
      reason: { type: "string", description: "추천 이유 한 줄 (25자 안팎)" },
      keywords: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["cat", "ko", "en"], properties: { cat: { type: "string", enum: STYLE_KW_CATS }, ko: { type: "string" }, en: { type: "string" } } }
      },
      options: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["name", "desc", "look", "palette", "keywords"],
          properties: {
            name: { type: "string" }, desc: { type: "string" }, look: { type: "string" },
            palette: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "hex"], properties: { name: { type: "string" }, hex: { type: "string" } } } },
            keywords: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  };
  let styleJob = null, styleFailAt = 0, styleTimer = 0;
  const styleSig = (plan) => refsOf(plan, "style").join(",");
  const styleKeywordsOn = (plan) => arr(plan.styleAnalysis?.keywords).filter((k) => !arr(plan.styleOff).includes(k.ko));
  const styleOption = (plan) => arr(plan.styleAnalysis?.options)[plan.stylePick] || null;

  // 처음 스타일 레퍼런스가 생기면 알아서 분석 (이미 분석했으면 '다시 분석'으로만 — 고른 방향이 바뀌지 않게)
  function queueStyleAnalysis() {
    const p = current();
    clearTimeout(styleTimer);
    if (!aiReady() || styleJob || p.plan.styleAnalysis || !refsOf(p.plan, "style").length || Date.now() - styleFailAt < 5 * 60e3) return;
    styleTimer = setTimeout(() => { if (current() === p) analyzeStyle(p, { auto: true }); }, 1200);
  }

  async function analyzeStyle(p = current(), { auto = false } = {}) {
    const ids = refsOf(p.plan, "style");
    if (!ids.length) return toast("🎨 스타일로 표시한 레퍼런스가 없어요");
    if (styleJob) return;
    if (!aiReady()) { toast("글 작업에 쓸 AI를 AI 연결에서 골라 주세요"); return openSettings(); }
    styleJob = p.id;
    renderStyleAnalysis();
    try {
      const pl = p.plan;
      const brief = [pl.topic && `주제: ${pl.topic}`, pl.purpose && `목적: ${pl.purpose}`, pl.mood && `느낌: ${pl.mood}`, pl.notes && `메모: ${pl.notes}`].filter(Boolean).join("\n");
      const out = await callClaude({
        system: K.styleAnalysis,
        content: [...(await imageBlocks(ids)), { type: "text", text: `[브리프]\n${brief || "(아직 없음)"}\n\n위 ${ids.length}장은 스타일 레퍼런스예요. 공통된 스타일을 분석하고 방향 3개를 제안해 주세요.` }],
        schema: STYLE_SCHEMA,
        maxTokens: 6000
      });
      pl.styleAnalysis = {
        src: ids.join(","), at: Date.now(), summary: str(out.summary),
        recommend: Number.isInteger(out.recommend) && out.recommend >= 1 && out.recommend <= 3 ? out.recommend - 1 : null, reason: str(out.reason),
        keywords: arr(out.keywords).filter((k) => isObj(k) && str(k.ko)).map((k) => ({ cat: STYLE_KW_CATS.includes(k.cat) ? k.cat : "분위기", ko: str(k.ko).trim(), en: str(k.en).trim() })).slice(0, 8),
        options: arr(out.options).filter(isObj).slice(0, 3).map((o) => ({
          name: str(o.name), desc: str(o.desc), look: str(o.look),
          palette: arr(o.palette).filter((c) => isObj(c) && HEX.test(c.hex)).map((c) => ({ name: str(c.name), hex: c.hex.toUpperCase() })).slice(0, 6),
          keywords: arr(o.keywords).map(str).filter(Boolean).slice(0, 6)
        }))
      };
      pl.stylePick = null;
      pl.styleOff = [];
      save();
      toast("레퍼런스 스타일을 분석했어요. 키워드와 방향을 골라 보세요");
    } catch (err) {
      if (auto) styleFailAt = Date.now();
      toast(aiErrorText(err));
    } finally {
      styleJob = null;
      if (current() === p) renderStyleAnalysis();
    }
  }

  function renderStyleAnalysis() {
    const box = $("#styleAnalysis");
    if (!box) return;
    const p = current(), plan = p.plan, a = plan.styleAnalysis, n = refsOf(plan, "style").length;
    if (styleJob === p.id) { box.innerHTML = `<div class="sa-card busy"><span class="mini-spin"></span>스타일 레퍼런스 ${n}장을 분석하는 중…</div>`; return; }
    if (!a) {
      box.innerHTML = n ? `<div class="sa-card empty"><button type="button" class="btn ghost small" data-style-analyze>🎨 스타일 분석</button><span class="hint">레퍼런스에서 스타일 키워드와 방향을 뽑아요</span></div>` : "";
      return;
    }
    const stale = a.src !== styleSig(plan);
    const off = new Set(arr(plan.styleOff)), rec = a.recommend;
    box.innerHTML = `<div class="sa-card">
      <div class="sa-head"><b>🎨 스타일</b>${stale ? `<span class="tag warn-tag">레퍼런스 바뀜</span>` : ""}<span class="spacer"></span>
        <button type="button" class="icon-btn" data-kw-dict title="켜 둔 키워드를 용어 사전에 담기" aria-label="용어 사전에 담기">📖</button>
        <button type="button" class="icon-btn" data-style-analyze title="다시 분석" aria-label="다시 분석">↻</button></div>
      ${a.summary ? `<p class="sa-sum">${esc(a.summary)}</p>` : ""}
      <div class="sa-kws">${a.keywords.map((k) => `<button type="button" class="kw${off.has(k.ko) ? " off" : ""}" data-kw="${esc(k.ko)}" title="${esc(k.cat)} · ${esc(k.en)} — 눌러서 ${off.has(k.ko) ? "다시 쓰기" : "빼기"}">${esc(k.ko)}</button>`).join("")}</div>
      <div class="sa-opts">${a.options.map((o, i) => `<button type="button" class="sa-opt${plan.stylePick === i ? " on" : ""}" data-style-opt="${i}" aria-pressed="${plan.stylePick === i}" title="${esc(o.desc)}${o.look ? `\n${esc(o.look)}` : ""}">
          <span class="sa-pal">${o.palette.map((c) => `<i style="background:${c.hex}"></i>`).join("")}</span>
          <span class="sa-name">${esc(o.name)}${i === rec ? `<em class="sa-rec">추천</em>` : ""}</span></button>`).join("")}</div>
      ${plan.stylePick != null
        ? (plan.result ? `<button type="button" class="btn small full" data-style-apply>기획안 룩·키컬러에 적용</button>` : `<p class="sa-note">기획안을 만들 때 이 방향으로 써요</p>`)
        : rec != null && a.options[rec] ? `<p class="sa-note">추천 · <b>${esc(a.options[rec].name)}</b>${a.reason ? ` — ${esc(a.reason)}` : ""}</p>` : ""}
    </div>`;
  }
  // 분석 키워드 → 용어 사전 분류
  const KW_TO_TERM_CAT = { 화풍: "design", 재질: "material", 색: "design", 빛: "direction", 효과: "effect", 구도: "direction", 분위기: "design" };

  $("#planRefs").addEventListener("click", (e) => {
    const p = current(), plan = p.plan, a = plan.styleAnalysis;
    if (e.target.closest("[data-style-analyze]")) return analyzeStyle(p);
    if (!a) return;
    const kw = e.target.closest("[data-kw]");
    if (kw) {
      const off = new Set(arr(plan.styleOff));
      off.has(kw.dataset.kw) ? off.delete(kw.dataset.kw) : off.add(kw.dataset.kw);
      plan.styleOff = [...off];
      save();
      return renderStyleAnalysis();
    }
    const opt = e.target.closest("[data-style-opt]");
    if (opt) {
      const i = Number(opt.dataset.styleOpt);
      plan.stylePick = plan.stylePick === i ? null : i;
      save();
      return renderStyleAnalysis();
    }
    if (e.target.closest("[data-style-apply]")) {
      const o = styleOption(plan), r = plan.result;
      if (!o || !r) return;
      snapshotPlan(p, `스타일 방향 적용 전 — ${o.name}`);
      r.direction.look = o.look;
      if (o.palette.length) r.direction.palette = o.palette.map((c) => ({ ...c }));
      plan.editSnapAt = 0;
      save();
      renderPlanResult();
      toast(`'${o.name}' 방향을 룩·키컬러에 적용했어요 — 🕘 기록에서 되돌릴 수 있어요`);
      return queuePlanSync(p);
    }
    if (e.target.closest("[data-kw-dict]")) {
      const add = styleKeywordsOn(plan).filter((k) => !termByKo.has(k.ko))
        .map((k) => ({ id: newId(), cat: KW_TO_TERM_CAT[k.cat] || "mine", ko: k.ko, en: k.en, desc: `레퍼런스 분석에서 담은 ${k.cat} 키워드`, icon: "✦" }));
      if (!add.length) return toast("켜 둔 키워드가 이미 용어 사전에 있어요");
      addCustomTerms(add);
      return toast(`키워드 ${add.length}개를 용어 사전에 담았어요 (샷 이미지 · 영상화의 📖 용어 사전)`);
    }
  });

  // 스타일 분석에서 고른 방향 · 켜 둔 키워드 (기획안 만들 때 · 프롬프트 맥락)
  function styleBriefLines(plan) {
    const o = styleOption(plan), kws = styleKeywordsOn(plan);
    return [
      o && `스타일 방향 (사용자가 고름): ${o.name} — ${o.look}${o.palette.length ? ` / 팔레트 ${o.palette.map((c) => `${c.name} ${c.hex}`).join(", ")}` : ""}`,
      kws.length && `스타일 키워드: ${kws.map((k) => `${k.ko}(${k.en})`).join(", ")}`
    ].filter(Boolean);
  }

  function planBrief(plan) {
    const rt = Number(plan.runtime) || 30;
    const line = (label, v) => `${label}: ${str(v) || "(미정 — 브리프에 맞게 제안)"}`;
    return [
      "[브리프]",
      line("주제", plan.topic),
      line("목적", plan.purpose),
      line("느낌·무드", plan.mood),
      `러닝타임: 약 ${rt}초 (장면당 2~8초)`,
      `화면 비율: ${plan.ratio || "16:9"}`,
      line("타깃·추가 메모", plan.notes),
      plan.images.length
        ? `레퍼런스 (위에 첨부한 순서): ${plan.images.map((id, i) => `${i + 1}번 ${REF_ROLE[refRole(plan, id)].ko}`).join(", ")}\n${refCounts(plan).map((r) => `  · ${r.ko}: ${r.desc}`).join("\n")}`
        : "레퍼런스: 없음",
      ...styleBriefLines(plan)
    ].join("\n");
  }

  function planRequestText(plan, feedback) {
    let text = planBrief(plan);
    if (feedback && plan.result) {
      text += `\n\n[이전 기획안]\n${JSON.stringify(plan.result)}\n\n[수정 요청]\n${feedback}\n\n수정 요청을 반영해 기획안 전체를 다시 작성하세요. 요청과 관계없는 부분은 최대한 유지합니다.`;
    } else {
      text += "\n\n위 브리프로 컨셉, 방향성, 등장 캐릭터, 시나리오를 제안해 주세요.";
    }
    return text;
  }

  // prev: 다듬기 전 기획안 — 같은 순서의 장면 id 를 이어받아 컷 연결을 유지한다
  function normalizePlanResult(r, prev) {
    if (!isObj(r) || !Array.isArray(r.scenario)) throw new Error("기획안 형식이 아니에요");
    const oldIds = arr(prev?.scenario).map((s) => s.id);
    const d = isObj(r.direction) ? r.direction : {};
    return {
      title: str(r.title), logline: str(r.logline), concept: str(r.concept),
      direction: {
        look: str(d.look), motion: str(d.motion), camera: str(d.camera), typography: str(d.typography), sound: str(d.sound),
        palette: arr(d.palette).filter((c) => isObj(c) && HEX.test(c.hex)).map((c) => ({ name: str(c.name), hex: c.hex }))
      },
      characters: arr(r.characters).filter(isObj).map((c) => ({ name: str(c.name), description: str(c.description) })).filter((c) => c.name),
      scenario: r.scenario.filter(isObj).map((s, i) => ({
        id: oldIds[i] || newId(),
        start: Number(s.start) || 0, end: Number(s.end) || 0, title: str(s.title), visual: str(s.visual),
        shot_type: str(s.shot_type), camera_move: str(s.camera_move), sound: str(s.sound)
      })),
      risks: arr(r.risks).map(str).filter(Boolean)
    };
  }

  async function generatePlan(feedback) {
    if (planJob || aiBusy) return toast("AI 작업이 진행 중이에요");
    if (!aiReady()) {
      toast("글 작업에 쓸 AI를 AI 연결에서 골라 주세요");
      return openSettings();
    }
    const project = current();
    const plan = project.plan;
    let ok = false;
    aiBusy = true;
    planJob = { stream: null, chars: 0, refine: !!feedback };
    renderPlanResult();
    try {
      const images = await imageBlocks(plan.images);
      const out = await callClaude({
        system: K.planning.systemPrompt,
        content: [...images, { type: "text", text: planRequestText(plan, feedback) }],
        schema: PLAN_SCHEMA,
        onStream: (s) => { if (planJob) planJob.stream = s; },
        onText: (delta) => {
          if (!planJob) return;
          planJob.chars += delta.length;
          const el = $("#planProgress");
          if (el) el.textContent = `기획안 작성 중… ${planJob.chars.toLocaleString()}자`;
        }
      });
      const next = normalizePlanResult(out, feedback ? plan.result : null);
      snapshotPlan(project, feedback ? `AI 다듬기 전 — “${feedback.slice(0, 40)}”` : "새 기획안 만들기 전");
      plan.result = next;
      plan.editSnapAt = 0;
      plan.generatedAt = Date.now();
      save();
      ok = true;
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      planJob = null;
      aiBusy = false;
      if (current() === project) renderPlanResult();
      renderNav();
    }
    // 기획안이 나오면 시나리오대로 컷을 만들고 스토리보드를 자동으로 그린다 (아직 컷이 없을 때)
    if (ok) {
      if (!project.shots.length) {
        scenarioToShots(project);
        toast("기획안이 나왔어요. 스토리보드를 그리는 중이에요");
        await autoBoard(project);
      } else if (feedback) {
        // 다듬은 장면 글을 이어진 컷에 반영 (직접 고친 컷 설명은 그대로)
        const n = plan.result.scenario.filter((sc) => syncScene(project, sc)).length;
        save();
        toast(n ? `기획안을 다듬었어요. 컷 ${n}개에 반영했어요` : "기획안을 다듬었어요");
        queuePlanSync(project);
      } else { toast("기획안이 나왔어요"); queuePlanSync(project); }
    }
    return ok;
  }

  function renderPlanResult() {
    const box = $("#planResult");
    const r = current().plan.result;
    $("#generatePlanBtn").disabled = !!planJob;
    if (planJob) {
      box.innerHTML = `
        <div class="plan-loading">
          <div class="spinner" aria-hidden="true"></div>
          <p id="planProgress">${planJob.refine ? "수정 요청을 반영하는 중…" : "레퍼런스와 브리프를 읽는 중…"}</p>
          <p class="hint">보통 30초~1분 걸려요.</p>
          <button type="button" class="btn ghost small" data-plan-cancel>중지</button>
        </div>`;
      return;
    }
    if (!r) {
      box.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">✦</div>
          <h3>주제만 적어도 돼요</h3>
          <p>기획안이 나오면 시나리오대로 스토리보드까지 자동으로 그려져요.</p>
        </div>`;
      return;
    }
    const d = r.direction;
    const total = r.scenario.reduce((m, s) => Math.max(m, s.end), 0);
    // 모든 글은 그 자리에서 바로 고칠 수 있다. 입력하면 자동 저장, 칸을 벗어나면 컷·캐릭터에 반영
    // ✨ 를 누르면 그곳이 AI로 고칠 곳으로 골라진다
    const pick = (key) => `<button type="button" class="part-pick" data-ai-pick="${esc(key)}" title="AI로 고칠 곳으로 고르기" aria-label="AI로 고칠 곳으로 고르기">✨</button>`;
    box.innerHTML = `
      <div class="plan-edit-bar"><span class="hint">글을 눌러 바로 고치거나, <b>✨</b>로 고를 곳을 찍어 그 부분만 AI로 고칠 수 있어요.</span><span class="save-dot" id="planSaved"></span>
        <button type="button" class="btn ghost small" data-plan-history ${arr(current().plan.history).length ? "" : "disabled"} title="고치기 전 기획안들을 보고 되돌리기">🕘 기록 ${arr(current().plan.history).length || ""}</button></div>
      <header class="concept-head">
        <div class="part" data-part="title"><input class="pe pe-title" data-pr="title" value="${esc(r.title)}" placeholder="제목" aria-label="제목" />${pick("title")}</div>
        <div class="part" data-part="logline"><textarea class="pe pe-logline" data-pr="logline" rows="1" placeholder="한 줄 요약" aria-label="한 줄 요약">${esc(r.logline)}</textarea>${pick("logline")}</div>
      </header>
      <div class="part" data-part="concept"><textarea class="pe pe-body" data-pr="concept" rows="2" placeholder="컨셉" aria-label="컨셉">${esc(r.concept)}</textarea>${pick("concept")}</div>
      <div class="part" data-part="palette">${paletteEditor(d.palette)}${pick("palette")}</div>
      <div class="part" data-part="look"><textarea class="pe pe-look" data-pr="look" rows="1" placeholder="룩 (화풍·질감·조명)" aria-label="룩">${esc(d.look)}</textarea>${pick("look")}</div>

      <div class="section-head"><h3>시나리오</h3><span class="hint">${r.scenario.length}장면 · ${fmtTime(total)}</span></div>
      <ol class="scenario editable">${r.scenario.map((s, i) => `
        <li class="scene part" data-scene="${esc(s.id)}" data-part="scene:${esc(s.id)}">
          <div class="scene-time">
            <span>${fmtTime(s.start)}</span>
            <label class="scene-dur" title="장면 길이"><input type="number" data-sc="dur" min="0.5" max="30" step="0.5" value="${sceneDur(s)}" aria-label="장면 ${i + 1} 길이(초)" />초</label>
          </div>
          <div class="scene-body">
            <input class="pe pe-scene-title" data-sc="title" value="${esc(s.title)}" placeholder="장면 제목" aria-label="장면 ${i + 1} 제목" />
            <textarea class="pe pe-scene-visual" data-sc="visual" rows="2" placeholder="화면에 무엇이 보이고 어떻게 움직이는지" aria-label="장면 ${i + 1} 내용">${esc(s.visual)}</textarea>
          </div>
          <div class="scene-tools">
            <button type="button" class="icon-btn part-pick" data-ai-pick="scene:${esc(s.id)}" title="AI로 고칠 곳으로 고르기 (Shift: 여러 장면 한 번에)" aria-label="AI로 고칠 곳으로 고르기">✨</button>
            <button type="button" class="icon-btn" data-scene-add title="아래에 장면 추가" aria-label="아래에 장면 추가">＋</button>
            <button type="button" class="icon-btn danger" data-scene-del title="장면 삭제" aria-label="장면 삭제">✕</button>
          </div>
        </li>`).join("")}</ol>
      ${r.scenario.length ? "" : `<button type="button" class="btn ghost small" data-scene-add>＋ 장면 추가</button>`}

      <div class="section-head"><h3>등장 캐릭터</h3><button type="button" class="link-btn" data-pchar-add>＋ 추가</button></div>
      <div class="plan-chars">${r.characters.map((c, i) => `
        <div class="plan-char part" data-pchar="${i}" data-part="char:${i}">
          <input class="pe pe-char-name" data-pc="name" value="${esc(c.name)}" placeholder="이름" aria-label="캐릭터 이름" />
          <textarea class="pe pe-char-desc" data-pc="description" rows="1" placeholder="생김새·의상·성격" aria-label="캐릭터 설명">${esc(c.description)}</textarea>
          <span class="char-tools"><button type="button" class="icon-btn part-pick" data-ai-pick="char:${i}" title="AI로 고칠 곳으로 고르기" aria-label="AI로 고칠 곳으로 고르기">✨</button><button type="button" class="icon-btn danger" data-pchar-del title="빼기" aria-label="캐릭터 빼기">✕</button></span>
        </div>`).join("") || `<p class="hint">등장 캐릭터 없음</p>`}</div>

      <div class="refine-dock" id="planDock"></div>`;
    paintPicks();
    renderDock();
  }

  const sceneDur = (s) => Math.min(30, Math.max(0.1, Math.round((s.end - s.start) * 10) / 10 || 3));

  // 장면 길이를 바꾸거나 장면을 넣고 빼면 시작 시간을 처음부터 다시 잇는다
  function reflowScenes(r) {
    let t = 0;
    for (const s of r.scenario) {
      const d = sceneDur(s);
      s.start = Math.round(t * 10) / 10;
      s.end = Math.round((t + d) * 10) / 10;
      t += d;
    }
  }

  const sceneShot = (p, sc) => p.shots.find((s) => s.sceneId === sc.id);

  // 장면 하나를 그 장면에서 만든 컷에 반영한다. 컷 설명을 직접 고쳤으면 설명은 건드리지 않는다
  function syncScene(p, sc, { dur = false } = {}) {
    const s = sceneShot(p, sc);
    if (!s) return 0;
    let changed = 0;
    const text = sceneText(sc);
    if (s.descAuto !== null && s.description === s.descAuto && s.description !== text) {
      s.description = text;
      s.descAuto = text;
      p.boardAutoTried = false;
      changed++;
    }
    if (dur && s.duration !== sceneDur(sc)) { s.duration = sceneDur(sc); changed++; }
    return changed;
  }

  function flashSaved() {
    const el = $("#planSaved");
    if (!el) return;
    el.textContent = "✓ 저장됨";
    el.classList.add("on");
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => el.classList.remove("on"), 1400);
  }

  // ── 기획안 기록: 바뀌기 전 기획안을 저장해 두고 찾아보거나 되돌린다 ──
  const PLAN_HISTORY_MAX = 40;
  const planCopy = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === "_prev" ? undefined : v)));

  function snapshotPlan(p, reason) {
    const r = p.plan.result;
    if (!r) return;
    const h = (p.plan.history = arr(p.plan.history));
    const copy = planCopy(r);
    if (h.length && JSON.stringify(h[0].result) === JSON.stringify(copy)) return; // 바로 전 기록과 같으면 생략
    h.unshift({ id: newId(), at: Date.now(), reason, result: copy });
    h.length = Math.min(h.length, PLAN_HISTORY_MAX);
    const btn = $("[data-plan-history]");
    if (btn && current() === p) { btn.disabled = false; btn.textContent = `🕘 기록 ${h.length}`; }
  }

  // 직접 고칠 때는 한 번 고치기 시작할 때마다(3분 넘게 쉬었다가) 고치기 전 상태를 남긴다
  function snapshotBeforeEdit(p) {
    if (Date.now() - (p.plan.editSnapAt || 0) > 3 * 60e3) snapshotPlan(p, "직접 고치기 전");
    p.plan.editSnapAt = Date.now();
  }

  const fmtWhen = (t) => {
    const d = new Date(t), now = new Date();
    const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return d.toDateString() === now.toDateString() ? `오늘 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  };

  let historySel = null;
  function openPlanHistory() {
    let dlg = $("#planHistory");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "planHistory";
      dlg.className = "modal history-modal";
      document.body.appendChild(dlg);
      dlg.addEventListener("click", onHistoryClick);
    }
    historySel = arr(current().plan.history)[0]?.id || null;
    renderPlanHistory();
    if (!dlg.open) dlg.showModal();
  }

  function renderPlanHistory() {
    const dlg = $("#planHistory");
    if (!dlg) return;
    const p = current(), cur = p.plan.result, h = arr(p.plan.history);
    const v = h.find((x) => x.id === historySel) || h[0];
    const curScenes = new Map(arr(cur?.scenario).map((s) => [s.id, s]));
    // 지금 기획안과 다른 곳 표시
    const diff = (a, b) => (str(a) !== str(b) ? " changed" : "");
    const r = v?.result;
    dlg.innerHTML = `
      <div class="history-head"><h2>기획안 기록</h2><span class="hint">바뀌기 전 기획안 ${h.length}개 · 최근 ${PLAN_HISTORY_MAX}개까지 보관</span>
        <button type="button" class="icon-btn" data-history-close aria-label="닫기">✕</button></div>
      <div class="history-body">
        <ol class="history-list">${h.map((x) => `
          <li><button type="button" class="${x === v ? "on" : ""}" data-history-pick="${esc(x.id)}">
            <span class="when">${fmtWhen(x.at)}</span><b>${esc(x.result.title || "제목 없음")}</b>
            <small>${esc(x.reason)} · ${x.result.scenario.length}장면</small></button></li>`).join("")}</ol>
        ${r ? `<article class="history-view">
          <p class="history-note">${fmtWhen(v.at)} · ${esc(v.reason)} — <span class="changed-key">노란 표시</span>는 지금 기획안과 다른 부분이에요.</p>
          <h3 class="${diff(r.title, cur?.title)}">${esc(r.title || "제목 없음")}</h3>
          ${r.logline ? `<p class="hv-logline${diff(r.logline, cur?.logline)}">${esc(r.logline)}</p>` : ""}
          ${r.concept ? `<p class="hv-concept${diff(r.concept, cur?.concept)}">${esc(r.concept)}</p>` : ""}
          ${paletteHtml(r.direction.palette)}
          ${r.direction.look ? `<p class="hv-look${diff(r.direction.look, cur?.direction.look)}">${esc(r.direction.look)}</p>` : ""}
          <ol class="scenario">${r.scenario.map((s) => {
            const now = curScenes.get(s.id);
            const tag = !now ? `<em class="tag">지금은 없음</em>` : sceneText(now) !== sceneText(s) || sceneDur(now) !== sceneDur(s) ? `<em class="tag">다름</em>` : "";
            return `<li class="scene${now && !tag ? "" : " changed"}"><span class="scene-time">${fmtTime(s.start)}<br>${sceneDur(s)}초</span>
              <div class="scene-body"><strong>${esc(s.title)} ${tag}</strong><p>${esc(s.visual)}</p></div></li>`;
          }).join("")}</ol>
          ${r.characters.length ? `<p class="hint">등장 캐릭터: ${r.characters.map((c) => esc(c.name)).join(", ")}</p>` : ""}
        </article>` : `<p class="hint">아직 기록이 없어요.</p>`}
      </div>
      ${r ? `<div class="modal-actions"><span class="hint">되돌려도 지금 기획안은 기록에 남아요.</span>
        <button type="button" class="btn small" data-history-restore="${esc(v.id)}">이 버전으로 되돌리기</button></div>` : ""}`;
  }

  function onHistoryClick(e) {
    const dlg = $("#planHistory");
    if (e.target === dlg || e.target.closest("[data-history-close]")) return dlg.close();
    const pick = e.target.closest("[data-history-pick]");
    if (pick) { historySel = pick.dataset.historyPick; return renderPlanHistory(); }
    const rest = e.target.closest("[data-history-restore]");
    if (!rest) return;
    const p = current();
    const v = arr(p.plan.history).find((x) => x.id === rest.dataset.historyRestore);
    if (!v || !confirm(`${fmtWhen(v.at)} 기획안으로 되돌릴까요?\n이어진 컷의 설명·길이도 그 버전에 맞춰져요 (직접 고친 컷 설명은 그대로).`)) return;
    snapshotPlan(p, "되돌리기 전");
    p.plan.result = planCopy(v.result);
    p.plan.editSnapAt = 0;
    const n = p.plan.result.scenario.filter((sc) => syncScene(p, sc, { dur: true })).length;
    save();
    dlg.close();
    renderActive();
    toast(`${fmtWhen(v.at)} 기획안으로 되돌렸어요${n ? ` · 컷 ${n}개에 반영` : ""}`);
    queuePlanSync(p);
  }

  // 글 입력: 바로 저장만 (다시 그리지 않아 커서 유지)
  $("#planResult").addEventListener("input", (e) => {
    const r = current().plan.result;
    const el = e.target;
    if (!r) return;
    if (el.dataset.pr || el.dataset.sc || el.dataset.pc || el.dataset.palColor !== undefined || el.dataset.palName !== undefined || el.dataset.palHex !== undefined) snapshotBeforeEdit(current());
    if (el.dataset.pr) {
      if (el.dataset.pr === "look") r.direction.look = el.value; else r[el.dataset.pr] = el.value;
    } else if (el.dataset.sc && el.dataset.sc !== "dur") {
      const sc = r.scenario.find((x) => x.id === el.closest("[data-scene]").dataset.scene);
      if (sc) sc[el.dataset.sc] = el.value;
    } else if (el.dataset.pc) {
      const c = r.characters[Number(el.closest("[data-pchar]").dataset.pchar)];
      if (!c) return;
      c._prev ??= { name: c.name, description: c.description }; // 칸을 벗어날 때 캐릭터 단계에 반영하려고 이전 값을 기억
      c[el.dataset.pc] = el.value;
    } else return;
    save();
    flashSaved();
  });

  // 칸을 벗어나면(확정) 다른 단계에 반영
  $("#planResult").addEventListener("change", (e) => {
    const p = current(), r = p.plan.result;
    const el = e.target;
    if (!r) return;
    if (el.dataset.sc) {
      const sc = r.scenario.find((x) => x.id === el.closest("[data-scene]").dataset.scene);
      if (!sc) return;
      if (el.dataset.sc === "dur") {
        const v = Number(el.value);
        if (!(v >= 0.5 && v <= 30)) { toast("장면 길이는 0.5~30초예요"); return renderPlanResult(); }
        sc.end = sc.start + v;
        reflowScenes(r);
      }
      const n = syncScene(p, sc, { dur: el.dataset.sc === "dur" });
      save();
      if (el.dataset.sc === "dur") renderPlanResult();
      const shotNo = p.shots.indexOf(sceneShot(p, sc)) + 1;
      if (n && shotNo) toast(`컷 ${shotNo} 설명에 반영했어요`);
      else if (!shotNo && p.shots.length) toast("저장했어요 (이 장면과 이어진 컷이 없어요)");
    } else if (el.dataset.pc) {
      const c = r.characters[Number(el.closest("[data-pchar]").dataset.pchar)];
      if (!c?._prev) return;
      const prev = c._prev;
      delete c._prev;
      // 기획에서 불러온 캐릭터가 그대로면 이름·설명을 따라 바꾼다
      const ch = p.characters.find((x) => x.name === prev.name);
      if (ch) {
        if (c.name.trim() && ch.name === prev.name) ch.name = c.name.trim();
        if (ch.desc === prev.description || !ch.desc) ch.desc = c.description;
        toast(`캐릭터 '${ch.name}'에도 반영했어요`);
      }
      save();
    } else if (el.dataset.pr) {
      toast("저장했어요. 다음 AI 작업(프롬프트·스케치)부터 반영돼요");
    }
  });

  function paletteHtml(palette) {
    return palette.length ? `<div class="palette">${palette.map((c) => `
      <div class="swatch"><span style="background:${c.hex}"></span><b>${esc(c.name)}</b><code>${esc(c.hex.toUpperCase())}</code></div>`).join("")}</div>` : "";
  }

  // 기획안 키컬러 직접 고치기: 색 칸을 누르면 색 선택기, 이름·코드는 바로 입력, ✕ 빼기, ＋ 추가
  function paletteEditor(palette) {
    return `<div class="palette palette-edit">
      ${palette.map((c, i) => `
        <div class="swatch">
          <label class="swatch-color" style="background:${c.hex}" title="눌러서 색 바꾸기">
            <input type="color" value="${c.hex.toLowerCase()}" data-pal-color="${i}" aria-label="${esc(c.name || `색 ${i + 1}`)} 색 바꾸기" />
          </label>
          <input class="swatch-name" value="${esc(c.name)}" data-pal-name="${i}" placeholder="이름" aria-label="색 이름" />
          <input class="swatch-hex" value="${esc(c.hex.toUpperCase())}" data-pal-hex="${i}" maxlength="7" spellcheck="false" aria-label="색 코드" />
          ${palette.length > 1 ? `<button type="button" class="swatch-x" data-pal-del="${i}" aria-label="이 색 빼기">✕</button>` : ""}
        </div>`).join("")}
      ${palette.length < 8 ? `<button type="button" class="swatch-add" data-pal-add title="색 추가">＋</button>` : ""}
    </div>`;
  }

  // 색 바꾸기는 다시 그리지 않고 그 칸만 고친다 (입력 중 포커스 유지)
  $("#planResult").addEventListener("input", (e) => {
    const pal = current().plan.result?.direction?.palette;
    if (!pal) return;
    const el = e.target;
    if (el.dataset.palColor !== undefined || el.dataset.palName !== undefined || el.dataset.palHex !== undefined) snapshotBeforeEdit(current());
    if (el.dataset.palColor !== undefined) {
      const c = pal[Number(el.dataset.palColor)];
      c.hex = el.value.toUpperCase();
      const sw = el.closest(".swatch");
      sw.querySelector(".swatch-color").style.background = c.hex;
      sw.querySelector(".swatch-hex").value = c.hex;
    } else if (el.dataset.palName !== undefined) {
      pal[Number(el.dataset.palName)].name = el.value;
    } else if (el.dataset.palHex !== undefined) {
      let v = el.value.trim().toUpperCase();
      if (!v.startsWith("#")) v = `#${v}`;
      if (!HEX.test(v)) return; // 다 쓸 때까지 기다린다
      const c = pal[Number(el.dataset.palHex)];
      c.hex = v;
      const sw = el.closest(".swatch");
      sw.querySelector(".swatch-color").style.background = v;
      sw.querySelector("[data-pal-color]").value = v.toLowerCase();
    } else return;
    save();
  });
  $("#planResult").addEventListener("change", (e) => {
    if (e.target.dataset.palHex !== undefined && !HEX.test(e.target.value.trim().replace(/^#?/, "#"))) {
      toast("색 코드는 #RRGGBB 형식이에요 (예: #F6D365)");
      renderPlanResult();
    } else if (e.target.dataset.palColor !== undefined || e.target.dataset.palHex !== undefined) {
      toast("키컬러를 바꿨어요. 이후 프롬프트 초안에 반영돼요");
    }
  });

  // 기획 글을 확정(칸을 벗어남)하거나 장면·캐릭터·색을 넣고 빼면, 다른 단계에도 반영할지 묻는다
  $("#planResult").addEventListener("change", (e) => {
    if (e.target.closest("[data-pr], [data-sc], [data-pc], [data-pal-color], [data-pal-hex], [data-pal-name]")) queuePlanSync();
  });
  $("#planResult").addEventListener("click", (e) => {
    if (e.target.closest("[data-pal-del], [data-pal-add], [data-scene-add], [data-scene-del], [data-pchar-del]")) setTimeout(() => queuePlanSync());
  });

  // 기획 시나리오 → 컷 (기존 컷은 지우고 새로 만든다)
  function scenarioToShots(p = current()) {
    const r = p.plan.result;
    if (!r) return;
    const old = p.shots;
    const types = new Set(K.shots.map((s) => s.ko));
    p.shots = r.scenario.map((s) => normalizeShot({
      duration: sceneDur(s),
      type: types.has(s.shot_type) ? s.shot_type : K.shots[0].ko,
      description: sceneText(s), descAuto: sceneText(s), sceneId: s.id
    }));
    p.boardFrom = p.plan.generatedAt;
    save();
    cleanupMedia(old.flatMap((s) => [...s.images, ...s.videos]));
  }

  $("#generatePlanBtn").addEventListener("click", () => {
    if (current().plan.result && !confirm("지금 기획안을 새 기획안으로 바꿀까요?")) return;
    generatePlan();
  });

  $("#planResult").addEventListener("click", (e) => {
    if (e.target.closest("[data-plan-cancel]")) return planJob?.stream?.abort();
    if (e.target.closest("[data-plan-history]")) return openPlanHistory();
    if (e.target.closest("[data-pal-del], [data-pal-add], [data-scene-add], [data-scene-del], [data-pchar-add], [data-pchar-del]")) snapshotBeforeEdit(current());
    const pal = current().plan.result?.direction?.palette;
    const del = e.target.closest("[data-pal-del]");
    if (del && pal) { pal.splice(Number(del.dataset.palDel), 1); save(); return renderPlanResult(); }
    if (e.target.closest("[data-pal-add]") && pal) { pal.push({ name: "", hex: "#CCCCCC" }); save(); renderPlanResult(); return $$("#planResult [data-pal-name]").at(-1)?.focus(); }
    const p = current(), r = p.plan.result;
    if (r && e.target.closest("[data-scene-add]")) {
      // 장면 아래에 새 장면 + 같은 자리에 새 컷 (컷이 이미 있을 때)
      const li = e.target.closest("[data-scene]");
      const at = li ? r.scenario.findIndex((x) => x.id === li.dataset.scene) + 1 : r.scenario.length;
      const sc = { id: newId(), start: 0, end: 3, title: "", visual: "", shot_type: "", camera_move: "", sound: "" };
      r.scenario.splice(at, 0, sc);
      reflowScenes(r);
      if (p.shots.length) {
        const before = r.scenario[at - 1] && sceneShot(p, r.scenario[at - 1]);
        const pos = before ? p.shots.indexOf(before) + 1 : 0;
        p.shots.splice(pos, 0, normalizeShot({ duration: 3, description: "", descAuto: "", sceneId: sc.id }));
        p.boardAutoTried = false;
      }
      save();
      renderPlanResult();
      $(`#planResult [data-scene="${sc.id}"] [data-sc="title"]`)?.focus();
      return toast(p.shots.length ? "장면과 컷을 하나 추가했어요" : "장면을 추가했어요");
    }
    if (r && e.target.closest("[data-scene-del]")) {
      const sc = r.scenario.find((x) => x.id === e.target.closest("[data-scene]").dataset.scene);
      if (!sc || !confirm(`'${sc.title || "제목 없는 장면"}' 장면을 삭제할까요?`)) return;
      r.scenario = r.scenario.filter((x) => x !== sc);
      reflowScenes(r);
      const s = sceneShot(p, sc);
      let note = "장면을 삭제했어요";
      if (s && !s.images.length && !s.videos.length) {
        p.shots = p.shots.filter((x) => x !== s);
        cleanupMedia(s.refFiles);
        note = "장면과 그 컷을 삭제했어요";
      } else if (s) {
        s.sceneId = null;
        note = "장면을 삭제했어요. 이미지가 있는 컷은 남겨 뒀어요";
      }
      save();
      renderPlanResult();
      return toast(note);
    }
    if (r && e.target.closest("[data-pchar-add]")) {
      r.characters.push({ name: "", description: "" });
      save();
      renderPlanResult();
      return $$("#planResult [data-pc='name']").at(-1)?.focus();
    }
    if (r && e.target.closest("[data-pchar-del]")) {
      r.characters.splice(Number(e.target.closest("[data-pchar]").dataset.pchar), 1);
      dropCharPicks();
      save();
      return renderPlanResult();
    }
  });

  // ── 기획안 부분 AI 고치기: ✨로 고칠 곳을 고르고(글을 드래그해도 됨) 그곳만 AI로 다시 쓴 뒤, 비교해 보고 적용 ──
  const aiPick = { pid: null, keys: [], focus: {}, last: null }; // keys: 고른 순서, focus: 드래그한 표현
  let partJob = null;  // { pid, keys, instr, stream }
  let proposal = null; // { pid, instr, note, items: [{ key, label, before, after, adds, data, on }] }

  function picks() {
    const pid = current().id;
    if (aiPick.pid !== pid) Object.assign(aiPick, { pid, keys: [], focus: {}, last: null });
    // 지워진 장면·캐릭터는 고른 목록에서 뺀다
    const r = current().plan.result;
    aiPick.keys = aiPick.keys.filter((k) => r && partOf(r, k));
    return aiPick;
  }

  function dropCharPicks() {
    const a = picks();
    a.keys = a.keys.filter((k) => !k.startsWith("char:"));
    for (const k of Object.keys(a.focus)) if (k.startsWith("char:")) delete a.focus[k];
  }

  // key → 기획안 속 그 부분 (없으면 null)
  function partOf(r, key) {
    if (["title", "logline", "concept"].includes(key)) return { kind: "text", get: () => r[key], set: (v) => (r[key] = v) };
    if (key === "look") return { kind: "text", get: () => r.direction.look, set: (v) => (r.direction.look = v) };
    if (key === "palette") return { kind: "palette" };
    if (key.startsWith("scene:")) { const sc = r.scenario.find((s) => s.id === key.slice(6)); return sc ? { kind: "scene", sc } : null; }
    if (key.startsWith("char:")) { const c = r.characters[Number(key.slice(5))]; return c ? { kind: "char", c } : null; }
    return null;
  }

  function partLabel(r, key) {
    const fixed = { title: "제목", logline: "한 줄 요약", concept: "컨셉", look: "룩", palette: "키컬러" };
    if (fixed[key]) return fixed[key];
    const part = partOf(r, key);
    if (part?.kind === "scene") { const i = r.scenario.indexOf(part.sc); return `장면 ${i + 1}${part.sc.title ? ` · ${part.sc.title}` : ""}`; }
    if (part?.kind === "char") return `캐릭터 · ${part.c.name || "이름 없음"}`;
    return key;
  }

  function paintPicks() {
    const a = picks();
    const busy = new Set(partJob?.pid === a.pid ? partJob.keys : []);
    $$("#planResult [data-part]").forEach((el) => {
      const k = el.dataset.part;
      el.classList.toggle("ai-sel", a.keys.includes(k));
      el.classList.toggle("ai-working", busy.has(k));
    });
  }

  function togglePick(key, { range = false } = {}) {
    const a = picks(), r = current().plan.result;
    // Shift: 마지막으로 고른 장면부터 여기까지 장면을 모두 고른다
    if (range && key.startsWith("scene:") && a.last?.startsWith("scene:")) {
      const ids = r.scenario.map((s) => `scene:${s.id}`);
      const [i, j] = [ids.indexOf(a.last), ids.indexOf(key)].sort((x, y) => x - y);
      if (i >= 0) for (const k of ids.slice(i, j + 1)) if (!a.keys.includes(k)) a.keys.push(k);
    } else if (a.keys.includes(key)) {
      a.keys = a.keys.filter((k) => k !== key);
      delete a.focus[key];
    } else a.keys.push(key);
    a.last = key;
    paintPicks();
    renderDock();
    if (a.keys.length) $("#partInstr")?.focus();
  }

  function clearPicks() {
    Object.assign(picks(), { keys: [], focus: {}, last: null });
    paintPicks();
    renderDock();
  }

  // 기획안 아래 AI 패널: 아무것도 안 골랐으면 전체 다듬기, 골랐으면 그곳만, 결과가 오면 비교·적용
  function renderDock() {
    const dock = $("#planDock");
    if (!dock) return;
    const p = current(), r = p.plan.result, a = picks();
    if (!r) return (dock.innerHTML = "");
    dock.classList.toggle("on", !!(a.keys.length || proposal?.pid === p.id || partJob?.pid === p.id));
    if (proposal?.pid === p.id) {
      const n = proposal.items.filter((x) => x.on).length;
      dock.innerHTML = `
        <div class="dock-head"><b>AI 제안</b><span class="hint">“${esc(proposal.instr)}”${proposal.note ? ` — ${esc(proposal.note)}` : ""}</span></div>
        <div class="prop-list">${proposal.items.map((x, i) => `
          <label class="prop-item${x.on ? "" : " off"}">
            <input type="checkbox" data-prop-item="${i}" ${x.on ? "checked" : ""} />
            <span class="prop-label">${esc(x.label)}</span>
            <span class="prop-diff">
              ${x.before ? `<del>${esc(x.before)}</del>` : ""}
              <ins>${esc(x.after)}</ins>
              ${x.adds.map((s) => `<ins class="prop-add">＋ 새 장면 · ${esc(s)}</ins>`).join("")}
            </span>
          </label>`).join("")}</div>
        <div class="dock-actions">
          <button type="button" class="btn ghost small" data-prop-discard>버리기</button>
          <button type="button" class="btn ghost small" data-prop-retry title="같은 요청으로 다시 받기">↻ 다시</button>
          <button type="button" class="btn small" data-prop-apply ${n ? "" : "disabled"}>${n === proposal.items.length ? "적용" : `${n}곳 적용`}</button>
        </div>`;
      return;
    }
    if (partJob?.pid === p.id) {
      dock.innerHTML = `<div class="dock-busy"><span class="mini-spin"></span><span>고른 ${partJob.keys.length}곳을 고치는 중… <span class="hint">“${esc(partJob.instr)}”</span></span>
        <button type="button" class="btn ghost small" data-part-cancel>중지</button></div>`;
      return;
    }
    if (!a.keys.length) {
      dock.innerHTML = `
        <div class="refine">
          <input id="planFeedback" placeholder="기획안 전체를 AI로 다듬기 (예: 더 미니멀하게, 마지막은 제품 클로즈업)" aria-label="고칠 점" />
          <button type="button" class="btn ghost small" data-plan-refine>전체 다듬기</button>
        </div>
        <p class="hint dock-tip">일부만 고치려면 고칠 곳의 <b>✨</b>를 누르거나 글을 드래그해 보세요. 장면은 Shift로 여러 개를 한 번에 골라요.</p>`;
      return;
    }
    const prev = $("#partInstr")?.value || "";
    dock.innerHTML = `
      <div class="dock-head"><b>고른 곳 ${a.keys.length}</b>
        <div class="pick-chips">${a.keys.map((k) => `<span class="pick-chip">${esc(partLabel(r, k))}${a.focus[k] ? ` <q>${esc(a.focus[k].slice(0, 24))}${a.focus[k].length > 24 ? "…" : ""}</q>` : ""}<button type="button" data-unpick="${esc(k)}" aria-label="빼기">✕</button></span>`).join("")}</div>
        <button type="button" class="link-btn" data-pick-clear>선택 해제 (Esc)</button></div>
      <div class="refine">
        <input id="partInstr" value="${esc(prev)}" placeholder="고른 곳을 어떻게 바꿀까요? (예: 이 장면을 둘로 나눠 줘, 더 따뜻한 느낌으로)" aria-label="고를 곳 고칠 점" />
        <button type="button" class="btn small" data-part-run>✨ ${a.keys.length}곳 고치기</button>
      </div>
      <div class="preset-row">${K.planning.partPresets.map((t) => `<button type="button" class="chip-btn" data-part-preset="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
  }

  // 기획안을 AI에게 보여 줄 때 장면·캐릭터마다 key 를 붙인다
  function planForPart(r) {
    return {
      title: r.title, logline: r.logline, concept: r.concept,
      direction: { look: r.direction.look, palette: r.direction.palette },
      characters: r.characters.map((c, i) => ({ key: `char:${i}`, name: c.name, description: c.description })),
      scenario: r.scenario.map((s) => ({ key: `scene:${s.id}`, title: s.title, visual: s.visual, duration: sceneDur(s) }))
    };
  }

  const PART_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["parts", "note"],
    properties: {
      note: { type: "string", description: "무엇을 왜 바꿨는지 한 문장" },
      parts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key"],
          properties: {
            key: { type: "string", description: "[고칠 곳]의 key 그대로" },
            text: { type: "string", description: "title·logline·concept·look 의 새 글" },
            title: { type: "string", description: "장면 이름" },
            visual: { type: "string", description: "장면 화면 묘사" },
            duration: { type: "number", description: "장면 길이(초)" },
            name: { type: "string", description: "캐릭터 이름" },
            description: { type: "string", description: "캐릭터 설명" },
            palette: {
              type: "array",
              items: { type: "object", additionalProperties: false, required: ["name", "hex"], properties: { name: { type: "string" }, hex: { type: "string", description: "#RRGGBB" } } }
            },
            add_after: {
              type: "array",
              description: "이 장면 바로 뒤에 새로 넣을 장면 (나누기·끼워 넣기 요청일 때만)",
              items: {
                type: "object", additionalProperties: false, required: ["title", "visual", "duration"],
                properties: { title: { type: "string" }, visual: { type: "string" }, duration: { type: "number" } }
              }
            }
          }
        }
      }
    }
  };

  const clampDur = (v, d) => (Number(v) >= 0.5 ? Math.min(30, Math.round(Number(v) * 10) / 10) : d);
  const palText = (pal) => pal.map((c) => `${c.name || "색"} ${c.hex.toUpperCase()}`).join(" · ");

  async function runPartEdit(instr) {
    instr = str(instr).trim();
    const p = current(), r = p.plan.result, a = picks();
    if (!r || !a.keys.length) return;
    if (!instr) { $("#partInstr")?.focus(); return toast("고른 곳을 어떻게 바꿀지 적거나 아래 버튼을 눌러 주세요"); }
    if (aiBusy || planJob) return toast("다른 AI 작업이 진행 중이에요");
    if (!aiReady()) { toast("글 작업에 쓸 AI를 AI 연결에서 골라 주세요"); return openSettings(); }
    const keys = [...a.keys];
    const job = (partJob = { pid: p.id, keys, instr, stream: null });
    proposal = null;
    aiBusy = true;
    paintPicks();
    renderDock();
    try {
      const text = [
        planBrief(p.plan),
        `\n[지금 기획안]\n${JSON.stringify(planForPart(r))}`,
        `\n[고칠 곳]\n${keys.map((k) => `- ${k} (${partLabel(r, k)})${a.focus[k] ? ` — 특히 이 부분: “${a.focus[k]}”` : ""}`).join("\n")}`,
        `\n[요청]\n${instr}`
      ].join("\n");
      const out = await callClaude({
        system: K.planning.systemPrompt + "\n" + K.planning.partEditRules,
        content: [{ type: "text", text }],
        schema: PART_SCHEMA,
        maxTokens: 8000,
        onStream: (s) => { job.stream = s; }
      });
      if (partJob !== job) return; // 중지함
      const items = [];
      for (const part of arr(out?.parts)) {
        if (!isObj(part) || !keys.includes(part.key) || items.some((x) => x.key === part.key)) continue;
        const cur = partOf(r, part.key);
        if (!cur) continue;
        const base = { key: part.key, label: partLabel(r, part.key), adds: [], on: true };
        if (cur.kind === "text") {
          const after = str(part.text).trim();
          if (after && after !== str(cur.get())) items.push({ ...base, before: str(cur.get()), after, data: { text: after } });
        } else if (cur.kind === "palette") {
          const pal = arr(part.palette).filter((c) => isObj(c) && HEX.test(c.hex)).map((c) => ({ name: str(c.name), hex: c.hex.toUpperCase() })).slice(0, 8);
          if (pal.length && palText(pal) !== palText(r.direction.palette)) items.push({ ...base, before: palText(r.direction.palette), after: palText(pal), data: { palette: pal } });
        } else if (cur.kind === "scene") {
          const sc = cur.sc;
          const next = { title: str(part.title).trim() || sc.title, visual: str(part.visual).trim() || sc.visual, dur: clampDur(part.duration, sceneDur(sc)) };
          const adds = arr(part.add_after).filter((s) => isObj(s) && (str(s.title) || str(s.visual)))
            .map((s) => ({ title: str(s.title).trim(), visual: str(s.visual).trim(), dur: clampDur(s.duration, 3) }));
          const show = (s) => `${s.title}${s.title && s.visual ? " — " : ""}${s.visual} (${s.dur}초)`;
          const before = show({ title: sc.title, visual: sc.visual, dur: sceneDur(sc) });
          if (show(next) !== before || adds.length) items.push({ ...base, before, after: show(next), adds: adds.map(show), data: { ...next, adds } });
        } else if (cur.kind === "char") {
          const next = { name: str(part.name).trim() || cur.c.name, description: str(part.description).trim() || cur.c.description };
          const show = (c) => `${c.name} — ${c.description}`;
          if (show(next) !== show(cur.c)) items.push({ ...base, before: show(cur.c), after: show(next), data: next });
        }
      }
      if (!items.length) { toast("AI가 바꿀 곳을 찾지 못했어요. 요청을 조금 더 구체적으로 적어 보세요"); return; }
      proposal = { pid: p.id, instr, note: str(out.note), items };
    } catch (err) {
      if (partJob === job) toast(aiErrorText(err));
    } finally {
      if (partJob === job) { partJob = null; aiBusy = false; }
      if (current() === p) { paintPicks(); renderDock(); }
    }
  }

  function applyProposal() {
    const p = current(), r = p.plan.result;
    if (!proposal || proposal.pid !== p.id || !r) return;
    const chosen = proposal.items.filter((x) => x.on && partOf(r, x.key));
    if (!chosen.length) return;
    snapshotPlan(p, `AI로 일부 고치기 전 — “${proposal.instr.slice(0, 30)}”`);
    const touched = [];
    let newShots = 0;
    for (const x of chosen) {
      const part = partOf(r, x.key);
      if (part.kind === "text") part.set(x.data.text);
      else if (part.kind === "palette") r.direction.palette = x.data.palette;
      else if (part.kind === "char") {
        const prev = { name: part.c.name, description: part.c.description };
        Object.assign(part.c, x.data);
        // 기획에서 불러온 캐릭터가 그대로면 캐릭터 단계에도 따라 바꾼다
        const ch = p.characters.find((c) => c.name === prev.name);
        if (ch) {
          if (part.c.name) ch.name = part.c.name;
          if (ch.desc === prev.description || !ch.desc) ch.desc = part.c.description;
        }
      } else if (part.kind === "scene") {
        const sc = part.sc;
        sc.title = x.data.title;
        sc.visual = x.data.visual;
        sc.end = sc.start + x.data.dur;
        touched.push(sc);
        // 나누기·끼워 넣기: 바로 뒤에 장면을, 컷이 있으면 같은 자리에 컷도 넣는다
        let at = r.scenario.indexOf(sc), after = sceneShot(p, sc);
        for (const s of x.data.adds) {
          const ns = { id: newId(), start: 0, end: s.dur, title: s.title, visual: s.visual, shot_type: sc.shot_type, camera_move: "", sound: "" };
          r.scenario.splice(++at, 0, ns);
          touched.push(ns);
          if (p.shots.length) {
            const shot = normalizeShot({ duration: s.dur, description: sceneText(ns), descAuto: sceneText(ns), sceneId: ns.id });
            const pos = after ? p.shots.indexOf(after) + 1 : p.shots.length;
            p.shots.splice(pos, 0, shot);
            after = shot;
            newShots++;
          }
        }
      }
    }
    reflowScenes(r);
    const cuts = touched.filter((sc) => syncScene(p, sc, { dur: true })).length;
    if (newShots) p.boardAutoTried = false;
    p.plan.editSnapAt = 0;
    save();
    const keys = chosen.map((x) => x.key);
    proposal = null;
    clearPicks();
    renderPlanResult();
    // 바뀐 곳을 잠깐 반짝여 보여 준다
    for (const k of keys) $(`#planResult [data-part="${CSS.escape(k)}"]`)?.classList.add("ai-done");
    setTimeout(() => $$("#planResult .ai-done").forEach((el) => el.classList.remove("ai-done")), 1800);
    const bits = [`${chosen.length}곳을 고쳤어요`];
    if (cuts) bits.push(`컷 ${cuts}개에 반영`);
    if (newShots) bits.push(`새 컷 ${newShots}개 추가`);
    toast(`${bits.join(" · ")} — 🕘 기록에서 되돌릴 수 있어요`);
    queuePlanSync(p);
  }

  $("#planResult").addEventListener("click", (e) => {
    const t = e.target;
    const pk = t.closest("[data-ai-pick]");
    if (pk) return togglePick(pk.dataset.aiPick, { range: e.shiftKey });
    const un = t.closest("[data-unpick]");
    if (un) return togglePick(un.dataset.unpick);
    if (t.closest("[data-pick-clear]")) return clearPicks();
    if (t.closest("[data-part-run]")) return runPartEdit($("#partInstr")?.value);
    const pre = t.closest("[data-part-preset]");
    if (pre) { $("#partInstr").value = pre.dataset.partPreset; return runPartEdit(pre.dataset.partPreset); }
    if (t.closest("[data-part-cancel]")) {
      partJob?.stream?.abort();
      partJob = null;
      aiBusy = false;
      paintPicks();
      renderDock();
      return toast("멈췄어요");
    }
    if (t.closest("[data-prop-apply]")) return applyProposal();
    if (t.closest("[data-prop-discard]")) { proposal = null; return renderDock(); }
    if (t.closest("[data-prop-retry]")) { const instr = proposal?.instr; proposal = null; return runPartEdit(instr); }
    if (t.closest("[data-plan-refine]")) {
      const fb = $("#planFeedback").value.trim();
      return fb ? generatePlan(fb) : toast("어떻게 바꿀지 적어 주세요");
    }
  });

  $("#planResult").addEventListener("change", (e) => {
    const box = e.target.closest("[data-prop-item]");
    if (!box || !proposal) return;
    proposal.items[Number(box.dataset.propItem)].on = box.checked;
    renderDock();
  });

  $("#planResult").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      if (e.target.id === "partInstr") { e.preventDefault(); return runPartEdit(e.target.value); }
      if (e.target.id === "planFeedback" && e.target.value.trim()) { e.preventDefault(); return generatePlan(e.target.value.trim()); }
    }
    if (e.key === "Escape" && (picks().keys.length || proposal)) {
      if (proposal) { proposal = null; renderDock(); } else clearPicks();
    }
  });

  // 글을 드래그하면 그 표현을 콕 집어 AI로 고칠 수 있는 작은 버튼이 뜬다
  const selPop = document.createElement("button");
  selPop.type = "button";
  selPop.className = "sel-pop";
  selPop.hidden = true;
  selPop.textContent = "✨ 이 부분 AI로 고치기";
  document.body.appendChild(selPop);
  let selTarget = null;
  const hideSelPop = () => { selPop.hidden = true; selTarget = null; };
  $("#planResult").addEventListener("mouseup", (e) => {
    const el = e.target.closest("textarea.pe, input.pe");
    const part = el?.closest("[data-part]");
    setTimeout(() => {
      const txt = el && part ? el.value.slice(el.selectionStart, el.selectionEnd).trim() : "";
      if (txt.length < 2 || partJob) return hideSelPop();
      selTarget = { key: part.dataset.part, txt: txt.slice(0, 300) };
      selPop.hidden = false;
      const x = Math.min(e.clientX + 8, innerWidth - selPop.offsetWidth - 12);
      selPop.style.left = `${Math.max(12, x)}px`;
      selPop.style.top = `${Math.max(12, e.clientY - 44)}px`;
    });
  });
  selPop.addEventListener("mousedown", (e) => e.preventDefault()); // 글 선택을 유지
  selPop.addEventListener("click", () => {
    if (!selTarget) return;
    const a = picks();
    if (!a.keys.includes(selTarget.key)) a.keys.push(selTarget.key);
    a.focus[selTarget.key] = selTarget.txt;
    a.last = selTarget.key;
    hideSelPop();
    paintPicks();
    renderDock();
    $("#partInstr")?.focus();
  });
  document.addEventListener("mousedown", (e) => { if (e.target !== selPop) hideSelPop(); });
  document.addEventListener("keydown", hideSelPop);
  window.addEventListener("scroll", hideSelPop, true);

  // ── 2 스타일프레임 ───────────────────────────────
  function conceptSummary(p) {
    const r = p.plan.result;
    if (!r) return `<div class="card empty-inline"><p>기획안을 먼저 만들어 주세요.</p><button type="button" class="btn ghost small" data-goto="plan">기획으로</button></div>`;
    return `<div class="card soft-card concept-mini"><strong>${esc(r.title)}</strong><p>${esc(r.logline)}</p>${paletteHtml(r.direction.palette)}</div>`;
  }

  let styleBusy = false;

  function renderStyle() {
    const p = current();
    const wm = hfModelFor("style");
    const web = isWebModel(wm);
    const canAuto = aiReady() && (genReady(wm) || web);
    const enReady = p.style.en && !isStale({ obj: p.style, ko: "ko", en: "en" });
    const status = styleBusy ? `<span class="mini-spin"></span> ${web ? "프롬프트를 준비하는 중이에요…" : "스타일프레임을 만드는 중이에요… (1~2분)"}`
      : !p.plan.result ? "기획안이 있으면 그 컨셉대로 만들어요."
      : !canAuto ? `자동 생성하려면 <button type="button" class="link-btn" data-open-settings>AI 연결</button>에서 글 작업 AI와 스타일프레임 모델(Higgsfield · 내 API 키)을 확인해 주세요. 위에서 '웹에서 직접' 모델을 골라도 돼요.`
      : web ? `${esc(wm.name)}에서 만든 결과를 아래 칸에 Ctrl+V 로 붙여넣으세요.`
      : p.style.images.length ? "마음에 드는 한 장을 ★로 고르세요. 이 그림이 이후 모든 컷의 기준이 돼요." : "";
    const label = web ? (enReady ? `${esc(wm.name)} 열기 ↗` : `프롬프트 만들고 ${esc(wm.name)}`) : p.style.images.length ? "한 장 더 만들기" : "✨ 스타일프레임 만들기";
    $("#styleBody").innerHTML = `
      ${conceptSummary(p)}
      <div class="card stage-card">
        <div class="sheet-status ${styleBusy ? "busy" : ""}">${status}
          ${p.plan.result && canAuto && !styleBusy ? `${hfPicker("style")}
            <button type="button" class="btn small" data-auto-style>${label}</button>` : ""}</div>
        ${styleRefRow(p)}
        ${mediaGrid(p.style, "style", "images", { pickable: true, addLabel: "직접 올리기" })}
        <details class="char-more">
          <summary>세부 설정 — 프롬프트 직접 쓰기 · Higgsfield에서 만들기</summary>
          <div class="char-more-body">${promptCard("style", { placeholder: "작품을 대표하는 장면 하나 — 피사체, 배경, 구도, 빛, 팔레트, 스타일", hint: "영문 프롬프트를 채우면 자동 생성에도 그 프롬프트를 써요." })}</div>
        </details>
      </div>`;
    hydrateThumbs($("#styleBody"));
  }

  // Claude 가 기획을 보고 프롬프트를 쓰고(영문 프롬프트가 있으면 그대로), Higgsfield 가 그린다
  // 스타일프레임에 넣을 캐릭터 시트: 시트를 ★로 고른 캐릭터 중 빼지 않은 것
  function styleSheets(p) {
    const skip = arr(p.style.skipChars);
    const chars = p.characters.filter((c) => c.pick && !skip.includes(c.id));
    return { chars, sheets: chars.map((c) => c.pick) };
  }
  // 프롬프트를 쓸 때와 지금 넣을 캐릭터 시트가 다른가 / 프롬프트를 직접 고쳤나
  const styleSheetsChanged = (p) => (p.style.draftSheets ?? "") !== styleSheets(p).sheets.join(",");
  const stylePromptUntouched = (st) => !str(st.ko) || st.ko === st.koAuto;

  // promptOnly: 프롬프트만 다시 쓰고 이미지는 만들지 않는다 (Higgsfield 연결이 없을 때 등)
  async function autoStyleFrame({ promptOnly = false } = {}) {
    if (styleBusy || aiBusy) return toast("다른 AI 작업이 진행 중이에요");
    const p = current();
    const wm = hfModelFor("style");
    const styleRefs = () => { const { sheets } = styleSheets(p); return { sheets, ids: [...sheets, ...planRefsOrdered(p.plan)] }; };
    // 캐릭터 시트 구성이 바뀌었고 프롬프트를 직접 고치지 않았다면, 캐릭터를 넣어 프롬프트부터 다시 쓴다
    // forceRedraft: 스토리보드 수정을 스타일프레임에도 반영하기로 했을 때 (직접 고친 프롬프트도 다시 쓴다)
    const force = !!p.style.forceRedraft;
    const why = typeof p.style.forceRedraft === "string" ? p.style.forceRedraft : "스토리보드"; // 어디서 바뀌어 다시 쓰는지
    const redraft = aiReady() && (force || (styleSheetsChanged(p) && stylePromptUntouched(p.style)));
    if (isWebModel(wm) && !redraft && p.style.en && !isStale({ obj: p.style, ko: "ko", en: "en" })) return webHandoff(wm, p.style.en, styleRefs().ids, "ref");
    styleBusy = true;
    renderStyle();
    try {
      const st = p.style;
      if (redraft) {
        aiBusy = true;
        try {
          const before = { ko: st.ko, en: st.en };
          st.ko = await draftPrompt("style");
          if (force && str(before.ko)) st.koPrev = { ...before, at: Date.now() }; // ↶ 이전 프롬프트로 되돌릴 수 있게
          st.koAuto = st.ko;
          [st.en] = await translatePrompts([st.ko], "image");
          st.enSrc = st.ko;
        } finally { aiBusy = false; }
        delete st.forceRedraft;
        save();
        if (force) toast(promptOnly ? `${why} 내용을 반영해 스타일프레임 프롬프트를 다시 썼어요` : `${why} 내용을 반영해 프롬프트를 다시 썼어요. 이미지를 만드는 중…`);
        else if (styleSheets(p).sheets.length) toast(`캐릭터 시트 ${styleSheets(p).sheets.length}장을 넣어 프롬프트를 다시 썼어요`);
      } else if (!(st.en && !isStale({ obj: st, ko: "ko", en: "en" }))) {
        aiBusy = true;
        try {
          if (!str(st.ko)) { st.ko = await draftPrompt("style"); st.koAuto = st.ko; }
          [st.en] = await translatePrompts([st.ko], "image");
          st.enSrc = st.ko;
        } finally { aiBusy = false; }
        save();
      }
      if (promptOnly) return;
      if (isWebModel(wm)) { toast(`프롬프트가 준비됐어요. '${wm.name} 열기'를 누르세요`); return; }
      // 캐릭터 시트는 디자인 그대로 등장, 기획 레퍼런스는 무드보드로만 (스타일·분위기만, 내용 복사 금지)
      const { sheets, ids } = styleRefs();
      const note = refRoleNote(sheets.length, planRefsOrdered(p.plan).map((id) => refRole(p.plan, id)));
      const blob = await generateImage({ prompt: note ? `${st.en}\n\n${note}` : st.en, imageIds: ids, aspect: p.plan.ratio || "16:9", stage: "style" });
      const id = await storeMedia(blob, "styleframe.png");
      st.images.push(id);
      if (!st.pick) st.pick = id;
      save();
      toast("스타일프레임을 만들었어요");
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      styleBusy = false;
      if (activeTab() === "style") renderStyle();
      renderNav();
    }
  }

  $("#styleBody").addEventListener("click", (e) => {
    if (e.target.closest("[data-open-settings]")) return openSettings();
    if (e.target.closest("[data-auto-style]")) return autoStyleFrame();
    // 캐릭터 시트 넣기/빼기
    const ch = e.target.closest("[data-style-char]");
    if (ch) {
      const st = current().style;
      const id = ch.dataset.styleChar;
      const skip = arr(st.skipChars);
      st.skipChars = skip.includes(id) ? skip.filter((x) => x !== id) : [...skip, id];
      save();
      renderStyle();
    }
  });

  // 스타일프레임에 들어갈 레퍼런스 줄: 캐릭터 시트(누르면 넣기/빼기) + 기획 무드보드
  function styleRefRow(p) {
    const withSheet = p.characters.filter((c) => c.pick);
    const skip = arr(p.style.skipChars);
    if (!p.characters.length && !p.plan.images.length) return "";
    const changed = withSheet.length && styleSheetsChanged(p) && str(p.style.ko);
    return `<div class="ref-row style-refs">
      <span class="ref-label">반영할 레퍼런스</span>
      <div class="ref-chips">
        ${withSheet.map((c) => {
          const on = !skip.includes(c.id);
          return `<button type="button" class="char-ref ${on ? "on" : ""}" data-style-char="${esc(c.id)}" title="${on ? "빼기" : "넣기"}">
            <img data-img-id="${esc(c.pick)}" alt="" /><span>${esc(c.name || "캐릭터")}</span><i aria-hidden="true">${on ? "✓" : ""}</i></button>`;
        }).join("")}
        ${p.characters.some((c) => !c.pick) ? `<button type="button" class="link-btn" data-goto="chars">시트를 ★로 고르면 들어가요</button>` : ""}
        ${refCounts(p.plan).map((r) => `<span class="tag" title="${esc(r.desc)}">${r.icon} 기획 ${esc(r.ko)} ${r.n}장</span>`).join("")}
      </div>
      ${changed ? `<p class="hint ref-note">${stylePromptUntouched(p.style) ? "캐릭터 시트 구성이 바뀌어서, 만들 때 캐릭터를 넣어 프롬프트를 다시 써요." : "프롬프트를 직접 고치셔서 그대로 둬요. 캐릭터를 글에도 넣으려면 아래 세부 설정에서 ✨ AI 초안을 다시 누르세요."}</p>` : ""}
    </div>`;
  }

  // ── 3 캐릭터 시트 ────────────────────────────────
  function renderChars() {
    const p = current();
    const fromPlan = p.plan.result?.characters || [];
    const notYet = fromPlan.filter((c) => !p.characters.some((x) => x.name === c.name));
    $("#charsBody").innerHTML = `
      <div class="toolbar card">
        <button type="button" class="btn small" data-char-add>+ 캐릭터 추가</button>
        ${notYet.length ? `<button type="button" class="btn ghost small" data-char-from-plan>기획안의 캐릭터 ${notYet.length}명 불러오기</button>` : ""}
        <label class="inline"><input type="checkbox" data-no-chars ${p.noChars ? "checked" : ""} /> 캐릭터 없음</label>
        <span class="spacer"></span>
        ${hfPicker("chars")}
      </div>
      ${p.characters.length ? `<div class="char-grid">${p.characters.map((c) => {
        const busy = sheetBusyFor === c.id;
        const baseChanged = c.images.length && c.sheetBase && c.sheetBase !== baseOf(c);
        const status = busy ? `<span class="mini-spin"></span> ${sheetBusyText}`
          : !genReady("chars") && !isWebModel(hfModelFor("chars")) ? `${hfModelFor("chars").api ? "이 모델은 내 API 키가 필요해요." : "Higgsfield 자동 생성은 연결 프로그램(start.cmd)으로 열면 돼요."} 오른쪽에서 다른 모델을 고르거나 <button type="button" class="link-btn" data-open-settings>AI 연결</button>을 확인하세요.`
          : !c.refs.length ? "기준 이미지를 올리거나, 설명으로 만들 수 있어요."
          : baseChanged ? "기준 이미지를 바꿨어요. 새 기준으로 시트를 만들어 보세요."
          : c.images.length ? "마음에 드는 시트를 ★로 고르세요." : "아직 시트가 없어요.";
        return `
        <div class="card stage-card char-card" data-char="${esc(c.id)}">
          <div class="char-head">
            <input class="char-name" data-char-field="name" value="${esc(c.name)}" placeholder="캐릭터 이름" aria-label="캐릭터 이름" />
            <button type="button" class="char-handle" data-copy-handle="${esc(charTag(c))}" title="프롬프트에 이렇게 쓰면 이 캐릭터 시트가 레퍼런스로 붙어요 — 눌러서 복사" ${charTag(c) ? "" : "hidden"}>@${esc(charTag(c))}</button>
            <button type="button" class="icon-btn danger" data-char-del title="캐릭터 삭제" aria-label="캐릭터 삭제">
              <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
          </div>
          <div class="char-simple">
            <div class="char-base">
              <span class="pcard-label">① 기준 이미지 ${c.refs.length > 1 ? "<em>★ 고른 것으로 시트를 만들어요</em>" : ""}</span>
              ${mediaGrid(c, `char:${c.id}`, "refs", { pickable: c.refs.length > 1, max: 4, addLabel: c.refs.length ? "후보" : "기준 이미지" })}
              ${(genReady("chars") || isWebModel(hfModelFor("chars"))) && !busy && c.refs.length < 4 ? `<button type="button" class="btn ghost small base-ai-btn" data-auto-base-only
                title="기획의 컨셉·팔레트와 스타일프레임 화풍에 맞춰 AI가 기준 이미지를 그려요">${isWebModel(hfModelFor("chars")) ? (c.baseEn ? `${esc(hfModelFor("chars").name)} ↗` : `✨ 프롬프트 만들기`) : c.refs.length ? "✨ AI 후보 더" : "✨ AI로 만들기"}</button>` : ""}
            </div>
            <div class="char-arrow" aria-hidden="true">→</div>
            <div class="char-sheets">
              <span class="pcard-label">② 캐릭터 시트 <em>3면도 · 표정 · 소품</em></span>
              <div class="sheet-status ${busy ? "busy" : ""}">${status}
                ${!genReady("chars") || busy ? "" : c.refs.length ? `<button type="button" class="btn ${baseChanged ? "" : "ghost "}small" data-auto-sheet>${baseChanged ? "★ 이 기준으로 시트 만들기" : c.images.length ? "한 장 더 만들기" : "만들기"}</button>`
                  : `<button type="button" class="btn small" data-auto-base>✨ 기준 이미지 + 시트 한 번에 만들기</button>`}</div>
              ${c.images.length || busy ? mediaGrid(c, `char:${c.id}`, "images", { pickable: true, add: false }) : ""}
            </div>
          </div>
          <details class="char-more">
            <summary>세부 설정 (선택) — 특징 · 표정 · 소품 · 프롬프트</summary>
            <div class="char-more-body">
              <label>특징 <input data-char-field="desc" value="${esc(c.desc)}" placeholder="생김새·의상·색·성격" /></label>
              <div class="row">
                <label>표정 <input data-char-field="expressions" value="${esc(c.expressions)}" placeholder="예: 기쁨, 놀람, 화남, 슬픔" /></label>
                <label>소품 <input data-char-field="props" value="${esc(c.props)}" placeholder="예: 텀블러, 빨간 모자" /></label>
              </div>
              ${promptCard(`char:${c.id}`, { placeholder: "비워 두면 기본 레이아웃(3면도·표정·소품)으로 만들어요. Higgsfield에서 직접 만들 때도 써요.", hint: "영문 프롬프트를 채우면 자동 생성에도 그 프롬프트를 써요." })}
              <div class="row wrap">
                ${c.refs.length ? `<button type="button" class="btn ghost small" data-ref-dl="${esc(baseOf(c))}">⬇ 기준 이미지 저장</button>` : ""}
                <span class="hint">시트를 직접 올리려면: </span>${mediaGrid({ images: [] }, `char:${c.id}`, "images", { addLabel: "시트 올리기" }).replace("media-grid", "media-grid mini-add")}
              </div>
            </div>
          </details>
        </div>`;
      }).join("")}</div>` : `<div class="card empty-inline"><p>${p.noChars ? "캐릭터 없이 진행해요. 다음 단계로 넘어가세요." : "캐릭터를 추가하고 기준 이미지 한 장만 올리면 시트가 자동으로 만들어져요."}</p></div>`}`;
    hydrateThumbs($("#charsBody"));
  }

  $("#charsBody").addEventListener("click", (e) => {
    const p = current();
    const dl = e.target.closest("[data-ref-dl]");
    if (dl) return downloadMedia(dl.dataset.refDl);
    if (e.target.closest("[data-open-settings]")) return openSettings();
    const auto = e.target.closest("[data-auto-sheet], [data-auto-base], [data-auto-base-only]");
    if (auto) {
      const c = p.characters.find((x) => x.id === auto.closest("[data-char]").dataset.char);
      if (!c) return;
      if (auto.matches("[data-auto-base-only]")) return autoCharacterBase(c, { chain: false });
      return auto.matches("[data-auto-base]") ? autoCharacterBase(c) : autoCharacterSheet(c);
    }
    if (e.target.closest("[data-char-add]")) {
      p.characters.push(normalizeChar({}));
      p.noChars = false;
    } else if (e.target.closest("[data-char-from-plan]")) {
      importPlanChars(p);
      p.noChars = false;
    } else if (e.target.closest("[data-char-del]")) {
      const card = e.target.closest("[data-char]");
      const c = p.characters.find((x) => x.id === card.dataset.char);
      if (!c || !confirm(`'${c.name || "이름 없는 캐릭터"}'를 삭제할까요?`)) return;
      p.characters = p.characters.filter((x) => x !== c);
      save(); renderActive(); return cleanupMedia([...c.refs, ...c.images]);
    } else return;
    save();
    renderActive();
  });
  $("#charsBody").addEventListener("input", (e) => {
    const f = e.target.dataset.charField;
    if (!f) return;
    const c = current().characters.find((x) => x.id === e.target.closest("[data-char]").dataset.char);
    if (c) { c[f] = e.target.value; save(); }
    if (c && f === "name") {
      const h = $("[data-copy-handle]", e.target.closest("[data-char]"));
      h.dataset.copyHandle = charTag(c);
      h.textContent = `@${charTag(c)}`;
      h.hidden = !charTag(c);
    }
  });
  // 이름을 바꾸면 프롬프트 속 @옛이름 도 함께 바꾼다
  $("#charsBody").addEventListener("focusin", (e) => { if (e.target.dataset.charField === "name") e.target.dataset.oldTag = charTag({ name: e.target.value }); });
  $("#charsBody").addEventListener("change", (e) => {
    if (e.target.dataset.charField !== "name") return;
    const from = e.target.dataset.oldTag, to = charTag({ name: e.target.value }), p = current();
    e.target.dataset.oldTag = to;
    if (!from || !to || from === to) return;
    let n = 0;
    const objs = [[p.style, ["ko", "en"]], ...p.characters.map((c) => [c, ["ko", "en"]]), ...p.shots.map((s) => [s, ["ko", "en", "vko", "ven"]])];
    for (const [o, keys] of objs) {
      const ens = keys.filter((k) => k.endsWith("en"));
      const fresh = Object.fromEntries(ens.map((k) => [k, !!o[k] && o[`${k}Src`] === o[k.replace("en", "ko")]])); // 영문이 최신이었으면 계속 최신으로
      for (const k of keys) {
        if (!mentionRe(from).test(str(o[k]))) continue;
        o[k] = o[k].replace(mentionRe(from, "g"), `@${to}`);
        n++;
      }
      ens.forEach((k) => { if (fresh[k]) o[`${k}Src`] = o[k.replace("en", "ko")]; });
    }
    if (n) { save(); toast(`프롬프트 ${n}곳의 @${from} → @${to} 로 바꿨어요`); }
  });
  $("#charsBody").addEventListener("change", (e) => {
    if (!e.target.matches("[data-no-chars]")) return;
    current().noChars = e.target.checked;
    save();
    renderActive();
  });

  // ── 4 스토리보드 (시나리오대로 자동 생성, 컷마다 수정) ──
  const VIEWBOX = { "16:9": "0 0 160 90", "9:16": "0 0 90 160", "1:1": "0 0 120 120" };

  // 모델이 준 SVG 는 <img> 로만 보여 주지만(스크립트 실행 안 됨), 형식이 이상하거나 위험한 요소가 있으면 버린다
  function cleanSvg(svg) {
    const raw = str(svg);
    // 앞뒤의 <?xml?> 선언·주석·코드블록 표시는 잘라 내고 <svg>…</svg> 만 쓴다
    const start = raw.search(/<svg[\s>]/i), end = raw.toLowerCase().lastIndexOf("</svg>");
    const reject = (why) => { console.warn("[storyboard] SVG 버림:", why); return ""; };
    if (start < 0 || end < start) return reject("svg 태그 없음");
    const s = raw.slice(start, end + 6);
    if (s.length > 40000) return reject("너무 큼");
    if (/<script|<foreignObject|<iframe|\son[a-z]+\s*=/i.test(s)) return reject("스크립트·이벤트 속성");
    if (/(?:href|src)\s*=\s*["']?\s*(?!#)[^"'\s>]/i.test(s)) return reject("외부 링크");
    return s;
  }
  const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  let boardJob = null; // { projectId, chars, redrawId }

  function renderBoard() {
    const p = current();
    const shots = p.shots;
    const ratio = p.plan.ratio || "16:9";
    const busy = boardJob?.projectId === p.id;
    // 기획안이 있는데 컷이 없거나 아직 안 그린 컷이 있으면 들어오자마자 그린다
    if (!busy && !aiBusy && aiReady() && p.plan.result && (!shots.length || (shots.some((s) => !s.board?.svg || s.boardStale) && !p.boardAutoTried))) {
      if (!shots.length) scenarioToShots(p);
      autoBoard(p);
      return;
    }
    const outdated = p.plan.result && p.plan.generatedAt > (p.boardFrom || 0) && shots.length;
    $("#boardBody").innerHTML = `
      ${busy && !boardJob.redrawId ? `<div class="card busy-bar"><span class="mini-spin"></span><span id="boardProgress">시나리오대로 스토리보드를 그리는 중이에요…</span></div>` : ""}
      ${!shots.length && !busy ? `<div class="card empty-inline"><p>${p.plan.result ? "AI 연결에서 글 작업 AI를 고르면 스토리보드가 자동으로 그려져요." : "기획안을 만들면 시나리오대로 스토리보드가 자동으로 그려져요."}</p>
        <button type="button" class="btn ghost small" data-goto="plan">기획으로</button></div>` : ""}
      ${outdated && !busy ? `<div class="card notice"><p>기획안이 바뀌었어요.</p><button type="button" class="btn small" data-board-rescenario>새 시나리오로 다시 만들기</button></div>` : ""}
      ${!busy && shots.some((s) => !s.board?.svg) && aiReady() ? `<div class="card notice"><p>스케치가 없는 컷이 ${shots.filter((s) => !s.board?.svg).length}개 있어요.</p><button type="button" class="btn small" data-board-fill>✨ 그리기</button></div>` : ""}
      <div class="board-grid">${shots.map((s, i) => {
        const drawing = busy && (!boardJob.redrawId ? !s.board?.svg || s.boardStale : boardJob.redrawId === s.id);
        return `
        <article class="card board-card" data-shot-id="${esc(s.id)}">
          <div class="board-frame ${drawing ? "drawing" : ""}" style="aspect-ratio:${ratio.replace(":", " / ")}" data-drag-handle draggable="true" title="끌어서 순서 바꾸기">
            ${s.board?.svg && !drawing ? `<img src="${svgUrl(s.board.svg)}" alt="컷 ${i + 1} 스케치" draggable="false" />` : `<span>${drawing ? "그리는 중…" : "스케치 없음"}</span>`}
            <span class="board-no"><span class="grip" aria-hidden="true">⠿</span>${pad2(i + 1)}</span>
            <span class="board-dur"><input data-shot-field="duration" type="number" min="0.1" max="30" step="0.1" value="${s.duration}" aria-label="길이(초)" />초</span>
          </div>
          <textarea class="board-desc" data-shot-field="description" rows="3" aria-label="장면">${esc(s.description)}</textarea>
          <div class="board-redraw">
            <input data-board-note placeholder="고칠 점 (예: 더 가까이)" aria-label="고칠 점" />
            <button type="button" class="icon-btn" data-board-redraw title="다시 그리기" aria-label="다시 그리기" ${busy ? "disabled" : ""}>↻</button>
            <button type="button" class="icon-btn" data-shot-move="-1" title="앞으로" aria-label="앞으로" ${i === 0 ? "disabled" : ""}>←</button>
            <button type="button" class="icon-btn" data-shot-move="1" title="뒤로" aria-label="뒤로" ${i === shots.length - 1 ? "disabled" : ""}>→</button>
            <button type="button" class="icon-btn danger" data-shot-delete title="컷 삭제" aria-label="컷 삭제">✕</button>
          </div>
        </article>`;
      }).join("")}
      ${shots.length ? `<button type="button" class="board-add" data-board-add>＋ 컷 추가</button>` : ""}</div>`;
  }

  async function drawBoards(p, targets, note) {
    const ratio = p.plan.ratio || "16:9";
    const schema = {
      type: "object", additionalProperties: false, required: ["items"],
      properties: { items: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["cut", "svg", "action", "camera", "sound", "transition"],
        properties: { cut: { type: "integer" }, svg: { type: "string" }, action: { type: "string" }, camera: { type: "string" }, sound: { type: "string" }, transition: { type: "string" } }
      } } }
    };
    let text = `${projectContext(p)}\nSVG viewBox: ${VIEWBOX[ratio] || VIEWBOX["16:9"]}\n\n[전체 컷]\n${p.shots.map(shotLine).join("\n")}\n\n[그릴 컷]\n${targets.map(({ s, i }) => shotLine(s, i)).join("\n")}`;
    text += note
      ? `\n\n[고칠 점]\n${note}\n\n이 컷의 스케치와 연출 메모를 고칠 점대로 다시 만들어 주세요.`
      : "\n\n위 컷들의 스토리보드를 컷 번호(cut)와 함께 만들어 주세요. 컷끼리 시선·움직임 방향이 자연스럽게 이어지게 합니다.";
    const out = await callClaude({
      system: K.prompting.storyboard,
      content: [{ type: "text", text }],
      schema,
      maxTokens: Math.min(64000, 6000 + targets.length * 3000),
      onText: (d) => {
        if (!boardJob) return;
        boardJob.chars += d.length;
        const el = $("#boardProgress");
        if (el) el.textContent = `시나리오대로 스토리보드를 그리는 중이에요… ${boardJob.chars.toLocaleString()}자`;
      }
    });
    for (const item of arr(out.items)) {
      const shot = p.shots[Number(item.cut) - 1];
      if (!shot || !targets.some((t) => t.s === shot)) continue;
      shot.board = { svg: cleanSvg(item.svg), action: str(item.action), camera: str(item.camera), sound: str(item.sound), transition: str(item.transition) };
      shot.boardStale = false;
    }
    save();
  }

  // 안 그린 컷을 모두 그린다 (기획안 직후 · 스토리보드에 들어왔을 때 자동)
  async function autoBoard(p, { redraw = null, note = "" } = {}) {
    if (boardJob || aiBusy) return;
    if (!aiReady()) return;
    const targets = redraw ? [{ s: redraw, i: p.shots.indexOf(redraw) }] : p.shots.map((s, i) => ({ s, i })).filter(({ s }) => !s.board?.svg || s.boardStale);
    if (!targets.length) return;
    p.boardAutoTried = true;
    aiBusy = true;
    boardJob = { projectId: p.id, chars: 0, redrawId: redraw?.id || null };
    if (activeTab() === "board") renderBoard();
    try {
      await drawBoards(p, targets, note);
      if (!redraw) toast("스토리보드를 그렸어요. 컷마다 고치거나 다시 그릴 수 있어요");
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      boardJob = null;
      aiBusy = false;
      if (activeTab() === "board") renderBoard();
      renderNav();
    }
  }

  $("#boardBody").addEventListener("click", (e) => {
    const p = current();
    if (e.target.closest("[data-board-rescenario]")) {
      if (!confirm("지금 컷을 지우고 새 시나리오로 다시 만들까요? 올린 이미지·영상도 지워져요.")) return;
      scenarioToShots(p);
      p.boardAutoTried = false;
      return renderBoard();
    }
    if (e.target.closest("[data-board-fill]")) return autoBoard(p);
    if (e.target.closest("[data-board-add]")) {
      p.shots.push(normalizeShot({ duration: 3, description: "" }));
      save();
      return renderActive();
    }
    const redraw = e.target.closest("[data-board-redraw]");
    if (redraw) {
      const card = redraw.closest(".board-card");
      return autoBoard(p, { redraw: shotOf(card), note: $("[data-board-note]", card).value.trim() });
    }
    moveOrDeleteShot(e);
  });

  $("#boardBody").addEventListener("input", (e) => editShotField(e.target, shotOf(e.target)));
  $("#boardBody").addEventListener("change", (e) => {
    const f = e.target.dataset.shotField;
    if (f === "description" || f === "duration") queueBackSync(current(), shotOf(e.target));
    if (f === "duration") renderActive();
  });

  // ── 스토리보드 → 기획 · 스타일프레임 역반영 (물어보고 반영) ──
  // 컷 글·길이를 고치면 아래 막대에서 "기획 시나리오 / 스타일프레임에도 반영할까요?"를 묻는다. 여러 컷을 고치면 모아서 한 번에.
  const backSync = { pid: null, ids: new Set() };

  function queueBackSync(p, s) {
    if (!s || (!p.plan.result && !p.style.ko && !p.style.pick)) return;
    if (backSync.pid !== p.id) { backSync.pid = p.id; backSync.ids.clear(); }
    // 기획에서 자동으로 채운 글 그대로면(실제로 바뀐 게 없으면) 묻지 않는다
    const sc = p.plan.result?.scenario.find((x) => x.id === s.sceneId);
    if (sc && s.description === sceneText(sc) && s.duration === sceneDur(sc)) backSync.ids.delete(s.id);
    else backSync.ids.add(s.id);
    renderBackSync();
  }

  function renderBackSync() {
    const p = current();
    const shots = backSync.pid === p.id ? p.shots.filter((s) => backSync.ids.has(s.id)) : [];
    let bar = $("#syncBar");
    if (!shots.length) { bar?.remove(); return; }
    const r = p.plan.result;
    const linked = r ? shots.filter((s) => r.scenario.some((sc) => sc.id === s.sceneId)).length : 0;
    const added = r ? shots.length - linked : 0;
    const canStyle = aiReady() && (p.style.pick || p.style.ko);
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "syncBar";
      bar.className = "sync-bar";
      bar.setAttribute("role", "dialog");
      bar.setAttribute("aria-label", "다른 단계에도 반영");
      document.body.appendChild(bar);
    }
    const keep = (k, d) => $(`[data-sync="${k}"]`, bar)?.checked ?? d; // 다시 그려도 체크 상태 유지
    bar.innerHTML = `
      <p><b>컷 ${shots.map((s) => p.shots.indexOf(s) + 1).join(", ")}</b> 내용을 고쳤어요. 다른 단계에도 반영할까요?</p>
      ${r ? `<label class="inline"><input type="checkbox" data-sync="plan" ${keep("plan", true) ? "checked" : ""} /> 기획 시나리오
        <small>${[linked && `장면 ${linked}개 고치기`, added && `장면 ${added}개 추가`].filter(Boolean).join(" · ")}</small></label>` : ""}
      ${canStyle ? `<label class="inline"><input type="checkbox" data-sync="style" ${keep("style", false) ? "checked" : ""} /> 스타일프레임
        <small>${genReady("style") ? "프롬프트 다시 쓰고 새로 만들기 · 이미지 1장" : "프롬프트 다시 쓰기"}</small></label>` : ""}
      <div class="sync-actions">
        <button type="button" class="btn ghost small" data-sync-skip>그대로 두기</button>
        <button type="button" class="btn small" data-sync-apply>반영</button>
      </div>`;
  }

  // 컷 설명 "제목 — 내용" → 장면 제목·내용 (구분자가 없으면 내용만 바꾼다)
  function shotToScene(s, sc) {
    const i = s.description.indexOf(" — ");
    if (i >= 0) { sc.title = s.description.slice(0, i).trim(); sc.visual = s.description.slice(i + 3).trim(); }
    else sc.visual = s.description.trim();
    sc.end = sc.start + s.duration;
    s.description = sceneText(sc); // 이후 기획을 고쳐도 계속 이어지게 같은 형식으로
    s.descAuto = s.description;
  }

  async function applyBackSync({ plan, style }) {
    const p = current(), r = p.plan.result;
    const shots = p.shots.filter((s) => backSync.ids.has(s.id));
    backSync.ids.clear();
    renderBackSync();
    const done = [];
    if (plan && r) {
      snapshotPlan(p, "스토리보드 반영 전");
      p.plan.editSnapAt = 0;
      for (const s of shots) {
        let sc = r.scenario.find((x) => x.id === s.sceneId);
        if (!sc) {
          // 기획에 없는 컷(스토리보드에서 추가) → 앞 컷의 장면 바로 뒤에 새 장면
          sc = { id: newId(), start: 0, end: 0, title: "", visual: "", shot_type: s.type, camera_move: "", sound: "" };
          const before = p.shots.slice(0, p.shots.indexOf(s)).reverse().map((x) => r.scenario.findIndex((y) => y.id === x.sceneId)).find((k) => k >= 0);
          r.scenario.splice(before === undefined ? 0 : before + 1, 0, sc);
          s.sceneId = sc.id;
        }
        shotToScene(s, sc);
      }
      // 모든 장면이 컷과 이어져 있으면 장면 순서도 컷 순서에 맞춘다
      const order = new Map(p.shots.map((s, i) => [s.sceneId, i]));
      if (r.scenario.every((sc) => order.has(sc.id))) r.scenario.sort((a, b) => order.get(a.id) - order.get(b.id));
      reflowScenes(r);
      done.push(`기획 장면 ${shots.length}개`);
      // 스토리보드에서 온 변경이니, 기획 → 다른 단계 반영 기준도 여기에 맞춘다 (다시 묻지 않게)
      Object.assign(planSync, { pid: p.id, base: planCopy(r) });
    }
    save();
    renderActive();
    if (style) {
      p.style.forceRedraft = true;
      save();
      const gen = genReady("style");
      toast(`${done.length ? `${done.join(", ")}에 반영했어요. ` : ""}스타일프레임 ${gen ? "프롬프트를 다시 쓰고 새로 만드는 중…" : "프롬프트를 다시 쓰는 중…"}`);
      await autoStyleFrame({ promptOnly: !gen });
    } else if (done.length) toast(`${done.join(", ")}에 반영했어요`);
  }

  document.addEventListener("click", (e) => {
    const bar = e.target.closest("#syncBar");
    if (!bar) return;
    if (e.target.closest("[data-sync-skip]")) { backSync.ids.clear(); return renderBackSync(); }
    if (e.target.closest("[data-sync-apply]")) {
      const plan = !!$('[data-sync="plan"]', bar)?.checked, style = !!$('[data-sync="style"]', bar)?.checked;
      if (!plan && !style) { backSync.ids.clear(); return renderBackSync(); }
      applyBackSync({ plan, style });
    }
  });

  // ── 기획 → 스토리보드 · 스타일프레임 · 샷/영상 프롬프트 (물어보고 반영) ──
  // 기획을 고칠 때마다 '반영 기준'(마지막으로 반영했거나 넘긴 기획안)과 비교해, 바뀐 곳에 영향받는 단계만 골라 묻는다.
  const planSync = { pid: null, base: null, busy: null };
  const sceneSig = (sc) => `${sceneText(sc)}|${sceneDur(sc)}`;

  // 두 기획안의 차이: global = 작품 전체에 걸린 항목, scenes = 바뀌거나 새로 생긴 장면 id, lines = AI 에게 알려 줄 변경 내용
  function planDiff(a, b) {
    const d = { global: [], scenes: new Set(), lines: [] };
    if (!a || !b) return d;
    const q = (v) => `“${cutText(str(v).replace(/\s+/g, " "), 140)}”`;
    const field = (label, x, y) => { if (str(x) !== str(y)) { d.global.push(label); d.lines.push(`- ${label}: ${q(x)} → ${q(y)}`); } };
    field("제목", a.title, b.title);
    field("한 줄 요약", a.logline, b.logline);
    field("컨셉", a.concept, b.concept);
    field("룩", a.direction?.look, b.direction?.look);
    field("키컬러", palText(arr(a.direction?.palette)), palText(arr(b.direction?.palette)));
    field("등장 캐릭터", arr(a.characters).map((c) => `${c.name}: ${c.description}`).join(" / "), arr(b.characters).map((c) => `${c.name}: ${c.description}`).join(" / "));
    const old = new Map(arr(a.scenario).map((s) => [s.id, s]));
    b.scenario.forEach((sc, i) => {
      const o = old.get(sc.id);
      if (!o) { d.scenes.add(sc.id); d.lines.push(`- 장면 ${i + 1} 새로 추가: ${q(sceneText(sc))}`); }
      else if (sceneSig(o) !== sceneSig(sc)) { d.scenes.add(sc.id); d.lines.push(`- 장면 ${i + 1}: ${q(sceneText(o))} → ${q(sceneText(sc))}${sceneDur(o) !== sceneDur(sc) ? ` (${sceneDur(o)}초 → ${sceneDur(sc)}초)` : ""}`); }
    });
    const now = new Set(b.scenario.map((s) => s.id));
    arr(a.scenario).forEach((sc) => { if (!now.has(sc.id)) d.lines.push(`- 장면 삭제: ${q(sceneText(sc))}`); });
    return d;
  }

  // 바뀐 곳에 영향받는 것: 작품 전체가 바뀌면 모든 컷, 장면만 바뀌면 그 장면을 그대로 따르는 컷만
  function planSyncTargets(p, d) {
    const linked = (s) => d.scenes.has(s.sceneId) && s.description === s.descAuto;
    const hit = d.global.length ? p.shots : p.shots.filter(linked);
    return {
      board: p.shots.filter((s) => s.board?.svg && linked(s)),
      img: autoShotPrompts() ? [] : hit.filter((s) => str(s.ko) || str(s.en)), // 자동 반영이 켜져 있으면 묻지 않고 알아서
      autoImg: autoShotPrompts() ? hit.filter((s) => str(s.ko)).length : 0,
      vid: hit.filter((s) => str(s.vko) || str(s.ven)),
      style: aiReady() && !!(p.style.ko || p.style.pick)
    };
  }

  function queuePlanSync(p = current()) {
    if (!p.plan.result || !p.shots.length) return;
    if (planSync.pid !== p.id) Object.assign(planSync, { pid: p.id, base: null });
    // 처음 고칠 때의 기준: 이번에 고치기 직전 기록 (기획을 바꾸는 모든 곳에서 바꾸기 전에 기록을 남긴다)
    if (!planSync.base) planSync.base = arr(p.plan.history)[0]?.result || null;
    renderPlanSync();
  }

  function renderPlanSync() {
    const p = current();
    let bar = $("#planSyncBar");
    const r = p.plan.result;
    const d = planSync.pid === p.id && r ? planDiff(planSync.base, r) : null;
    const tg = d && (d.global.length || d.scenes.size) ? planSyncTargets(p, d) : null;
    const any = tg && (tg.board.length || tg.img.length || tg.vid.length || tg.style);
    if (!planSync.busy && !any) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "planSyncBar";
      bar.className = "sync-bar plan-sync";
      bar.setAttribute("role", "dialog");
      bar.setAttribute("aria-label", "기획 변경을 다른 단계에 반영");
      document.body.appendChild(bar);
    }
    if (planSync.busy) { bar.innerHTML = `<p class="sync-busy"><span class="mini-spin"></span>${esc(planSync.busy)}</p>`; return; }
    const keep = (k, def) => $(`[data-psync="${k}"]`, bar)?.checked ?? def;
    const cuts = (list) => `컷 ${list.map((s) => p.shots.indexOf(s) + 1).join(", ")}`;
    const what = [...d.global, ...(d.scenes.size ? [`장면 ${r.scenario.map((sc, i) => (d.scenes.has(sc.id) ? i + 1 : 0)).filter(Boolean).join(", ")}`] : [])];
    const gen = genReady("style");
    bar.innerHTML = `
      <p><b>기획이 바뀌었어요</b> <span class="sync-what">${esc(what.join(" · "))}</span><br>다른 단계에도 반영할까요?</p>
      ${tg.board.length ? `<label class="inline"><input type="checkbox" data-psync="board" ${keep("board", true) ? "checked" : ""} /> 스토리보드 스케치 <small>${cuts(tg.board)} 다시 그리기</small></label>` : ""}
      ${tg.img.length ? `<label class="inline"><input type="checkbox" data-psync="img" ${keep("img", true) ? "checked" : ""} /> 샷 이미지 프롬프트 <small>${cuts(tg.img)} 고쳐 쓰기</small></label>` : ""}
      ${tg.vid.length ? `<label class="inline"><input type="checkbox" data-psync="vid" ${keep("vid", true) ? "checked" : ""} /> 영상 프롬프트 <small>${cuts(tg.vid)} 고쳐 쓰기</small></label>` : ""}
      ${tg.style ? `<label class="inline"><input type="checkbox" data-psync="style" ${keep("style", d.global.length > 0) ? "checked" : ""} /> 스타일프레임 프롬프트 <small>바뀐 기획으로 다시 쓰기</small></label>
        ${gen ? `<label class="inline sub"><input type="checkbox" data-psync="styleGen" ${keep("styleGen", false) ? "checked" : ""} /> 새 스타일프레임도 만들기 <small>이미지 1장 (크레딧)</small></label>` : ""}` : ""}
      <p class="sync-note">${tg.autoImg ? `샷 이미지 프롬프트 ${tg.autoImg}컷은 자동으로 고쳐 써요. ` : ""}고쳐 쓴 프롬프트는 카드의 ↶ 이전 프롬프트로 되돌릴 수 있어요.</p>
      <div class="sync-actions">
        <button type="button" class="btn ghost small" data-psync-skip>그대로 두기</button>
        <button type="button" class="btn small" data-psync-apply>반영</button>
      </div>`;
  }

  // 바뀐 기획에 맞게 프롬프트를 '고쳐 쓴다' (바뀐 점과 관계없는 표현은 그대로) → 영문화까지
  async function redraftShots(p, shots, kind, why) {
    const isVideo = kind === "video", P = K.prompting;
    const [ko, en] = isVideo ? ["vko", "ven"] : ["ko", "en"];
    const schema = {
      type: "object", additionalProperties: false, required: ["items"],
      properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["cut", "ko"], properties: { cut: { type: "integer" }, ko: { type: "string" } } } } }
    };
    const list = shots.map((s) => `${shotLine(s, p.shots.indexOf(s))}\n  지금 프롬프트: ${str(s[ko]) || "(없음 — 새로 쓰기)"}${isVideo && s.ko ? `\n  이 컷의 이미지 프롬프트: ${s.ko}` : ""}`).join("\n");
    const text = `${projectContext(p)}\n\n[전체 컷]\n${p.shots.map(shotLine).join("\n")}\n\n[기획에서 바뀐 점]\n${why || "(전체적으로 다듬음)"}\n\n[고쳐 쓸 컷]\n${list}\n\n` +
      `바뀐 기획에 맞게 위 컷들의 ${isVideo ? "영상(이미지 투 비디오)" : "샷 이미지"} 한글 프롬프트를 고쳐 써 주세요. 바뀐 점과 관계없는 표현·디테일·금지 사항은 최대한 그대로 두고, 컷 번호(cut)와 함께 돌려주세요.`;
    const images = await imageBlocks([p.style.pick]);
    const out = await callClaude({ system: `${isVideo ? P.shotVideo : P.shotImage}\n\n${P.rules}`, content: [...images, { type: "text", text }], schema });
    const changed = [];
    if (!isVideo) shots.forEach((s) => { s.koSrc = shotPromptSrc(p, s); }); // 이 내용으로 썼다
    for (const item of arr(out.items)) {
      const s = p.shots[Number(item.cut) - 1];
      if (!s || !shots.includes(s) || !str(item.ko) || str(item.ko) === str(s[ko])) continue;
      s[`${ko}Prev`] = { ko: s[ko], en: s[en], at: Date.now() };
      s[ko] = str(item.ko);
      changed.push(s);
    }
    if (changed.length) {
      const ens = await translatePrompts(changed.map((s) => s[ko]), kind);
      changed.forEach((s, i) => { if (ens[i]) { s[en] = ens[i]; s[`${en}Src`] = s[ko]; } });
    }
    save({ undo: !promptSync.busy }); // 자동 반영은 되돌리기 단계로 남기지 않는다 (Ctrl+Z 하면 기획 수정 전으로 함께 돌아감)
    return changed.length;
  }

  // ── 샷 이미지 프롬프트 자동 반영 ──
  // 프롬프트를 쓸 때 바탕이 된 내용(컷 설명·스토리보드 연출 메모·기획 전체)을 기억해 두고(koSrc),
  // 그게 바뀌면 묻지 않고 바뀐 점만 반영해 고쳐 쓴다. 고치기 전 프롬프트는 ↶ 로 되돌릴 수 있다.
  const autoShotPrompts = () => state.autoShotPrompts !== false;

  function shotPromptSrc(p, s) {
    const r = p.plan.result, b = s.board || {};
    return {
      cut: { 설명: str(s.description), 샷: str(s.type), "스토리보드 화면": str(b.action), "스토리보드 카메라": str(b.camera) },
      glob: r ? {
        제목: str(r.title), 컨셉: str(r.concept), 룩: str(r.direction.look), 키컬러: palText(r.direction.palette),
        "등장 캐릭터": r.characters.map((c) => `${c.name}: ${c.description}`).join(" / "), "스타일 키워드": styleKeywordsOn(p.plan).map((k) => k.ko).join(", ")
      } : {}
    };
  }
  const srcChanges = (a, b) => Object.keys(b).filter((k) => str(a?.[k]) !== str(b[k])).map((k) => ({ k, from: str(a?.[k]), to: str(b[k]) }));

  // 바탕이 바뀐 컷 (처음 보는 프롬프트는 지금 내용으로 썼다고 보고 기준만 잡는다)
  function staleShotPrompts(p) {
    let init = false;
    const out = [];
    for (const s of p.shots) {
      if (!str(s.ko)) continue;
      const now = shotPromptSrc(p, s);
      if (!isObj(s.koSrc)) { s.koSrc = now; init = true; continue; }
      const cut = srcChanges(s.koSrc.cut, now.cut), glob = srcChanges(s.koSrc.glob, now.glob);
      if (cut.length || glob.length) out.push({ s, cut, glob });
    }
    if (init) save({ undo: false });
    return out;
  }

  let promptSync = { timer: 0, busy: null, failAt: 0 };
  function schedulePromptSync(delay = 2500) {
    if (!autoShotPrompts()) return;
    clearTimeout(promptSync.timer);
    promptSync.timer = setTimeout(runPromptSync, delay);
  }

  async function runPromptSync() {
    if (!autoShotPrompts() || !aiReady() || promptSync.busy || Date.now() - promptSync.failAt < 2 * 60e3) return;
    // 기획·스토리보드 글을 아직 쓰는 중이면 끝날 때까지 기다린다
    const ae = document.activeElement;
    if (ae?.matches?.("input, textarea") && ae.closest("#planResult, #boardBody, #planForm, [data-pkey]")) return schedulePromptSync();
    if (aiBusy || planJob || boardJob || planSync.busy) return schedulePromptSync(4000);
    const p = current(), stale = staleShotPrompts(p);
    if (!stale.length) return;
    const q = (v) => `“${cutText(v.replace(/\s+/g, " "), 140)}”`;
    const globLines = [...new Map(stale.flatMap((x) => x.glob).map((c) => [c.k, c])).values()].map((c) => `- 기획 ${c.k}: ${q(c.from)} → ${q(c.to)}`);
    const cutLines = stale.filter((x) => x.cut.length).map((x) => `- 컷 ${p.shots.indexOf(x.s) + 1} ${x.cut.map((c) => `${c.k}: ${q(c.from)} → ${q(c.to)}`).join(", ")}`);
    const srcs = new Map(stale.map((x) => [x.s, shotPromptSrc(p, x.s)])); // 지금 내용 기준 (쓰는 동안 또 바뀌면 다음에 다시)
    promptSync.busy = new Set(stale.map((x) => x.s.id));
    aiBusy = true;
    if (["shots", "video"].includes(activeTab())) renderActive();
    toast(`기획·스토리보드가 바뀌어 샷 이미지 프롬프트 ${stale.length}컷을 고쳐 쓰는 중…`);
    try {
      const n = await redraftShots(p, stale.map((x) => x.s), "image", [...globLines, ...cutLines].join("\n"));
      for (const [s, src] of srcs) s.koSrc = src;
      save({ undo: false });
      toast(n ? `샷 이미지 프롬프트 ${n}컷을 바뀐 내용에 맞게 고쳐 썼어요 (카드의 ↶ 이전 프롬프트로 되돌리기)` : "샷 이미지 프롬프트는 바꿀 곳이 없었어요");
    } catch (err) {
      promptSync.failAt = Date.now();
      toast(`샷 프롬프트 자동 반영 실패: ${aiErrorText(err)}`);
    } finally {
      aiBusy = false;
      promptSync.busy = null;
      if (current() === p) renderActive();
    }
  }

  // 카드에 보이는 상태: 고쳐 쓰는 중 / 곧 반영
  function shotPromptBadge(s) {
    if (!autoShotPrompts() || !str(s.ko)) return "";
    if (promptSync.busy?.has(s.id)) return `<em class="auto-tag busy"><span class="mini-spin"></span>바뀐 내용으로 고쳐 쓰는 중…</em>`;
    if (!isObj(s.koSrc)) return "";
    const now = shotPromptSrc(current(), s);
    return srcChanges(s.koSrc.cut, now.cut).length || srcChanges(s.koSrc.glob, now.glob).length ? `<em class="auto-tag">기획·스토리보드 변경 — 곧 자동 반영</em>` : "";
  }

  document.addEventListener("change", (e) => {
    const c = e.target.closest?.("[data-auto-shotprompt]");
    if (!c) return;
    state.autoShotPrompts = c.checked;
    save({ undo: false });
    toast(c.checked ? "기획·스토리보드가 바뀌면 샷 이미지 프롬프트를 자동으로 고쳐 써요" : "자동 반영을 껐어요. 기획을 바꾸면 아래 막대에서 물어봐요");
    if (c.checked) { staleShotPrompts(current()).length && schedulePromptSync(300); }
    renderActive();
  });

  async function applyPlanSync(o) {
    const p = current(), r = p.plan.result;
    if (aiBusy || planJob) return toast("다른 AI 작업이 끝난 뒤에 눌러 주세요");
    const d = planDiff(planSync.base, r), tg = planSyncTargets(p, d), why = d.lines.join("\n");
    planSync.base = planCopy(r); // 이제 이 기획안이 반영 기준
    const done = [];
    const step = (msg) => { planSync.busy = msg; renderPlanSync(); };
    try {
      aiBusy = true;
      if (o.img && tg.img.length) { step(`샷 이미지 프롬프트 ${tg.img.length}컷을 고쳐 쓰는 중…`); done.push(`샷 프롬프트 ${await redraftShots(p, tg.img, "image", why)}컷`); }
      if (o.vid && tg.vid.length) { step(`영상 프롬프트 ${tg.vid.length}컷을 고쳐 쓰는 중…`); done.push(`영상 프롬프트 ${await redraftShots(p, tg.vid, "video", why)}컷`); }
      aiBusy = false;
      if (o.board && tg.board.length) {
        tg.board.forEach((s) => { s.boardStale = true; });
        p.boardAutoTried = false;
        save();
        step(`스토리보드 스케치 ${tg.board.length}컷을 다시 그리는 중…`);
        await autoBoard(p);
        done.push(`스케치 ${tg.board.length}컷`);
      }
      if (o.style && tg.style) {
        p.style.forceRedraft = "기획";
        save();
        step(o.styleGen ? "스타일프레임 프롬프트를 다시 쓰고 새로 만드는 중…" : "스타일프레임 프롬프트를 다시 쓰는 중…");
        await autoStyleFrame({ promptOnly: !o.styleGen });
        done.push("스타일프레임");
      }
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      aiBusy = false;
      planSync.busy = null;
      renderActive();
    }
    if (done.length) toast(`기획 변경을 ${done.join(" · ")}에 반영했어요`);
  }

  document.addEventListener("click", (e) => {
    const bar = e.target.closest("#planSyncBar");
    if (!bar || planSync.busy) return;
    if (e.target.closest("[data-psync-skip]")) { planSync.base = planCopy(current().plan.result); return renderPlanSync(); }
    if (e.target.closest("[data-psync-apply]")) {
      const o = Object.fromEntries($$("[data-psync]", bar).map((c) => [c.dataset.psync, c.checked]));
      if (!o.img && !o.vid && !o.board && !o.style) { planSync.base = planCopy(current().plan.result); return renderPlanSync(); }
      applyPlanSync(o);
    }
  });
  // '새 스타일프레임도 만들기'는 프롬프트 다시 쓰기를 켜야 의미가 있다
  document.addEventListener("change", (e) => {
    const c = e.target.closest?.("#planSyncBar [data-psync]");
    if (!c) return;
    const bar = $("#planSyncBar");
    if (c.dataset.psync === "styleGen" && c.checked) $('[data-psync="style"]', bar).checked = true;
    if (c.dataset.psync === "style" && !c.checked && $('[data-psync="styleGen"]', bar)) $('[data-psync="styleGen"]', bar).checked = false;
  });

  // ── 5 샷 이미지 ──────────────────────────────────
  // 컷 편집(순서·길이·설명)은 스토리보드에서만 한다. 여기서는 프롬프트와 이미지에만 집중.
  function cutInfo(s, i) {
    return `<div class="cut-info">
      <div class="cut-sketch${useBoardRef(s) ? " as-ref" : ""}" data-drag-handle draggable="true" title="끌어서 순서 바꾸기">${s.board?.svg ? `<img src="${svgUrl(s.board.svg)}" alt="" draggable="false" />` : ""}<span class="board-no"><span class="grip" aria-hidden="true">⠿</span>${pad2(i + 1)}</span>
        ${s.board?.svg ? `<button type="button" class="sketch-ref${useBoardRef(s) ? " on" : ""}" data-board-ref draggable="false" aria-pressed="${useBoardRef(s)}" title="체크하면 이 스케치의 배치·샷 크기·앵글을 따라 그려요 (선 그림체는 안 따라요)"><i aria-hidden="true">${useBoardRef(s) ? "✓" : ""}</i>레퍼런스</button>` : ""}</div>
      ${cutBrief(s)}
    </div>`;
  }

  // ── 컷 요약: 긴 컷 설명 대신 화면에 꼭 보여야 할 핵심만 (AI가 요약, 기다리는 동안은 앞부분만) ──
  const needsBrief = (s) => str(s.description).trim().length > 40;
  const briefOf = (s) => (s.brief?.src === s.description ? s.brief : null);
  const cutText = (t, n) => (t.length > n ? `${t.slice(0, n).trim()}…` : t);

  function fallbackBrief(s) {
    const d = str(s.description).trim();
    const [head, ...rest] = d.split(" — ");
    return rest.length ? { title: head, points: [cutText(rest.join(" — "), 60)] } : { title: "", points: d ? [cutText(d, 60)] : [] };
  }

  function cutBrief(s) {
    const b = briefOf(s) || fallbackBrief(s);
    const waiting = needsBrief(s) && !briefOf(s);
    return `<div class="cut-brief${waiting ? " pending" : ""}" data-brief="${esc(s.id)}">
      <div class="brief-head"><span class="tag">${s.duration}초</span>${b.title ? `<b>${esc(b.title)}</b>` : ""}</div>
      ${b.points.length ? `<ul>${b.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="hint">컷 설명이 없어요</p>`}
      ${needsBrief(s) ? `<details class="brief-full"><summary>컷 설명 전체</summary><p>${esc(s.description)}</p></details>` : ""}
    </div>`;
  }

  const BRIEF_SCHEMA = {
    type: "object", additionalProperties: false, required: ["briefs"],
    properties: {
      briefs: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["id", "title", "points"],
          properties: { id: { type: "string" }, title: { type: "string" }, points: { type: "array", items: { type: "string" } } }
        }
      }
    }
  };
  let briefJob = false, briefFailAt = 0;

  // 요약이 없거나 컷 설명이 바뀐 컷만 한 번에 요약한다 (Claude 글 작업 — 크레딧 없음)
  async function autoBriefs(p = current()) {
    if (briefJob || !aiReady() || Date.now() - briefFailAt < 5 * 60e3) return;
    const todo = p.shots.filter((s) => needsBrief(s) && !briefOf(s)).map((s) => ({ s, src: s.description }));
    if (!todo.length) return;
    briefJob = true;
    try {
      const out = await callClaude({
        system: K.cutBrief.system,
        content: [{ type: "text", text: `[작품] ${p.plan.result?.title || p.name}\n\n[컷 설명]\n${JSON.stringify(todo.map(({ s, src }) => ({ id: s.id, description: src })))}` }],
        schema: BRIEF_SCHEMA,
        maxTokens: 4000
      });
      for (const b of arr(out?.briefs)) {
        const job = todo.find((x) => x.s.id === b.id);
        if (!job) continue;
        job.s.brief = { src: job.src, title: str(b.title).trim().slice(0, 24), points: arr(b.points).map((x) => str(x).trim()).filter(Boolean).slice(0, 3) };
        for (const el of $$(`[data-brief="${CSS.escape(job.s.id)}"]`)) el.outerHTML = cutBrief(job.s);
      }
      save({ undo: false }); // 자동 요약은 되돌리기 단계로 남기지 않는다
    } catch {
      briefFailAt = Date.now(); // 실패하면 잠시 쉬었다가 (그동안은 앞부분만 보여 준다)
    } finally {
      briefJob = false;
    }
  }

  function autoPromptBar(kind, shots) {
    const p = current();
    const isVideo = kind === "video";
    const missing = shots.filter((s) => (isVideo ? !s.videos.length && anchorOf(s) : !s.images.length)).length;
    const busy = isVideo ? videoGenBusy : shotGenBusy;
    return `<div class="toolbar card">
      <button type="button" class="btn small" data-auto-prompts="${kind}" ${shots.length ? "" : "disabled"}>✨ 프롬프트 자동 작성</button>
      ${!isVideo && isWebModel(hfModelFor("shots")) ? `<span class="hint">${esc(hfModelFor("shots").name)}는 컷마다 '열기'로 만들어요</span>` : genReady(isVideo ? "video" : "shots") ? `<button type="button" class="btn ghost small" data-gen-all="${kind}" ${missing && !busy.size ? "" : "disabled"}>
        ${busy.size ? `<span class="mini-spin"></span> Higgsfield 생성 중 ${busy.size}컷` : `${isVideo ? "영상" : "이미지"} 없는 ${missing}컷 만들기`}</button>` : ""}
      ${kind === "image" && (p.style.pick || p.characters.some((c) => c.pick)) ? `<button type="button" class="btn ghost small" data-refs-dl title="Higgsfield 웹에 함께 올릴 스타일프레임·캐릭터 시트">⬇ 레퍼런스</button>` : ""}
      ${!isVideo ? `<label class="inline small-check" title="기획(컨셉·룩·키컬러·캐릭터·장면)이나 스토리보드(컷 설명·연출)가 바뀌면, 바뀐 점만 반영해 이 컷들의 프롬프트를 알아서 고쳐 써요"><input type="checkbox" data-auto-shotprompt ${autoShotPrompts() ? "checked" : ""} /> 자동 반영</label>` : ""}
      <button type="button" class="btn ghost small${termUi.dock ? " on" : ""}" data-term-dock title="샷·카메라·연출·모션·디자인 용어를 옆에 띄워 클릭으로 넣기">📖 용어 사전</button>
      <span class="spacer"></span>
      ${true ? `<span class="picker-label">${isVideo ? "기본 영상 모델" : "이미지 모델"}</span>${hfPicker(isVideo ? "video" : "shots")}` : ""}
    </div>`;
  }

  // 샷 이미지: 영상화와 같은 구조 — 왼쪽 컷 목록, 오른쪽 고른 컷(스케치 → 고른 이미지 · 레퍼런스 · 프롬프트 · 결과 · 엔드 프레임)
  let sxSel = null;
  function sxPromptState(s) {
    if (str(s.en) && !isStale({ obj: s, ko: "ko", en: "en" })) return ["ok", "프롬프트"];
    if (str(s.ko)) return ["warn", "영문화 전"];
    return ["", "프롬프트 없음"];
  }

  function renderShotsStage() {
    const p = current();
    const shots = p.shots;
    if (!shots.length) {
      $("#shotsBody").innerHTML = `<div class="card empty-inline"><p>컷이 없어요. 스토리보드에서 컷을 먼저 만들어 주세요.</p><button type="button" class="btn ghost small" data-goto="board">스토리보드로</button></div>`;
      return;
    }
    if (!shots.some((x) => x.id === sxSel)) sxSel = (shots.find((x) => !x.images.length) || shots[0]).id;
    const i = shots.findIndex((x) => x.id === sxSel), s = shots[i], pick = anchorOf(s);
    const b = briefOf(s) || fallbackBrief(s), done = shots.filter((x) => x.images.length).length;
    const listScroll = $("#shotsBody .vx-list-body")?.scrollTop || 0;
    $("#shotsBody").innerHTML = `
      ${autoPromptBar("image", shots)}
      <div class="vx">
        <aside class="vx-list card" aria-label="컷 목록">
          <div class="vx-list-head"><b>컷 ${shots.length}</b><span class="vx-prog"><i style="width:${(done / shots.length) * 100}%"></i></span><small>이미지 ${done}/${shots.length}</small></div>
          <div class="vx-list-body">${shots.map((x, k) => {
            const an = anchorOf(x), [ps, pl] = sxPromptState(x);
            return `<button type="button" class="vx-row${x.id === sxSel ? " on" : ""}" data-sx-sel="${esc(x.id)}">
              <span class="vx-thumb">${an ? `<img data-img-id="${esc(an)}" alt="" draggable="false" />` : x.board?.svg ? `<img src="${svgUrl(x.board.svg)}" alt="" class="sketch" draggable="false" />` : `<i>스케치 없음</i>`}<b class="vx-num">${pad2(k + 1)}</b><s class="vx-dur">${x.duration}s</s>${shotGenBusy.has(x.id) ? `<span class="vx-busy"><span class="mini-spin"></span></span>` : ""}</span>
              <span class="vx-meta">
                <b><span>${pad2(k + 1)}</span>${esc((briefOf(x) || fallbackBrief(x)).title || x.type)}</b>
                <small>${x.duration}초 · ${esc(x.type)}</small>
                <span class="vx-tags"><i class="dot ${ps}"></i>${pl}${x.images.length ? ` · 이미지 ${x.images.length}` : ""}${shotPromptBadge(x) ? " · 곧 반영" : ""}</span>
              </span></button>`;
          }).join("")}</div>
        </aside>

        <section class="vx-detail card" data-shot-id="${esc(s.id)}" aria-label="컷 ${i + 1}">
          <header class="vx-head">
            <div class="vx-title"><span class="vx-no">CUT ${pad2(i + 1)} · ${s.duration}초</span><h2>${esc(b.title || s.type)}</h2>
              ${b.points.length ? `<p>${esc(b.points.join(" · "))}</p>` : ""}</div>
            <div class="vx-nav">
              <button type="button" class="ph-btn" data-sx-step="-1" ${i ? "" : "disabled"} aria-label="이전 컷">‹</button>
              <button type="button" class="ph-btn" data-sx-step="1" ${i < shots.length - 1 ? "" : "disabled"} aria-label="다음 컷">›</button>
            </div>
          </header>

          <div class="vx-frames">
            <figure class="vx-frame">
              <figcaption>스토리보드</figcaption>
              <div class="vx-img sketch-box${useBoardRef(s) ? " as-ref" : ""}">${s.board?.svg ? `<img src="${svgUrl(s.board.svg)}" alt="스케치" />
                <button type="button" class="sketch-ref${useBoardRef(s) ? " on" : ""}" data-board-ref aria-pressed="${useBoardRef(s)}" title="체크하면 이 스케치의 배치·샷 크기·앵글을 따라 그려요"><i aria-hidden="true">${useBoardRef(s) ? "✓" : ""}</i>레퍼런스</button>` : `<span class="vx-empty-in">스케치가 없어요</span>`}</div>
            </figure>
            <span class="vx-arrow" aria-hidden="true">→</span>
            <figure class="vx-frame">
              <figcaption>고른 이미지 <small>${s.images.length > 1 ? `★ ${s.images.length}장 중` : ""}</small></figcaption>
              ${pick ? `<div class="vx-img"><img data-img-id="${esc(pick)}" alt="고른 샷 이미지" title="크게 보기" /></div>` : `<div class="vx-img vx-empty">아직 이미지가 없어요</div>`}
            </figure>
          </div>

          ${refsRow(p, s)}
          ${promptCard(`shot:${s.id}:img`, { placeholder: "피사체, 배경, 구도, 빛, 팔레트, 스타일 + 필수·금지" })}

          <div class="vx-results">
            <div class="vx-sub"><b>결과</b><small>${s.images.length ? "★ 고른 이미지가 애니메틱·영상화의 시작 프레임이 돼요" : "만들거나, 다른 곳에서 만든 이미지를 올려요 (Ctrl+V)"}</small></div>
            <div class="cut-results">${mediaGrid(s, `shot:${s.id}`, "images", { pickable: true, addLabel: "이미지 올리기" })}${shotGenTile(s)}</div>
          </div>
          ${endFrameRow(s)}
        </section>
      </div>`;
    const lb = $("#shotsBody .vx-list-body");
    if (lb) lb.scrollTop = listScroll;
    hydrateThumbs($("#shotsBody"));
    if ($("#refDialog").open) renderRefDialog();
    autoBriefs(p);
    warmBoardRefs(p);
  }

  $("#shotsBody").addEventListener("click", (e) => {
    const row = e.target.closest("[data-sx-sel]");
    if (row) { sxSel = row.dataset.sxSel; return renderShotsStage(); }
    const step = e.target.closest("[data-sx-step]");
    if (step) {
      const shots = current().shots, k = shots.findIndex((x) => x.id === sxSel) + Number(step.dataset.sxStep);
      if (shots[k]) { sxSel = shots[k].id; renderShotsStage(); $(`#shotsBody [data-sx-sel="${CSS.escape(sxSel)}"]`)?.scrollIntoView({ block: "nearest" }); }
    }
  });
  // 스토리보드 구도 레퍼런스 넣기/빼기 (컷마다)
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-board-ref]");
    if (!b) return;
    const s = shotOf(b);
    if (!s) return;
    s.boardAsRef = !useBoardRef(s);
    save();
    renderActive();
    toast(s.boardAsRef ? "스토리보드 스케치의 구도(배치·샷 크기·앵글)를 따라 만들어요" : "이 컷은 스토리보드 구도를 참고하지 않아요");
  });

  function shotGenTile(s) {
    const m = hfModelFor("shots");
    const busy = shotGenBusy.has(s.id);
    if (isWebModel(m)) {
      const ready = str(s.en) && !isStale({ obj: s, ko: "ko", en: "en" });
      return `<button type="button" class="gen-tile web" data-gen-shot ${busy ? "disabled" : ""}>
        ${busy ? `<span class="mini-spin"></span>프롬프트 준비 중…` : `<b>↗</b>${ready ? `${esc(m.name)} 열기` : `프롬프트 만들고 ${esc(m.name)}`}`}</button>`;
    }
    if (!genReady(m)) return "";
    return `<button type="button" class="gen-tile" data-gen-shot ${busy ? "disabled" : ""}>
      ${busy ? `<span class="mini-spin"></span>생성 중…` : `<b>✨</b>${esc(m.name)}로 만들기`}</button>`;
  }

  // ── 엔드 프레임: 영상이 끝나는 장면 한 장 (선택) — 받는 모델이면 시작 → 끝 사이를 이어서 만든다 ──
  const endGenBusy = new Set();
  // 샷 이미지: 엔드 프레임 만들기 · 후보 고르기(★ 고른 것이 영상화에 들어간다). 시작 프레임(앵커)이 있어야 만들 수 있다
  function endFrameRow(s) {
    const im = hfModelFor("shots"), busy = endGenBusy.has(s.id), has = s.endImages.length, anchor = anchorOf(s);
    const tile = !anchor ? ""
      : busy ? `<button type="button" class="gen-tile" disabled><span class="mini-spin"></span>${isWebModel(im) ? "프롬프트 준비 중…" : "만드는 중…"}</button>`
      : isWebModel(im) ? `<button type="button" class="gen-tile web" data-gen-end><b>↗</b>${s.endEn ? `${esc(im.name)} 열기` : `프롬프트 만들고 ${esc(im.name)}`}</button>`
      : genReady(im) ? `<button type="button" class="gen-tile" data-gen-end><b>✨</b>${has ? "한 장 더" : "엔드 프레임 만들기"}</button>` : "";
    const note = !anchor ? "샷 이미지(시작 프레임)를 고르면 이어지는 끝 장면을 만들 수 있어요."
      : !has ? "선택 — 영상이 끝나는 장면. 시작 프레임을 보고 만들어요."
      : s.endPick ? "★ 고른 장면이 영상화의 엔드 프레임 칸에 들어가요." : "★로 고르면 영상화의 엔드 프레임 칸에 들어가요.";
    return `<div class="end-row${has ? " has" : ""}">
      <div class="end-head"><b>엔드 프레임</b><span class="hint">${note}</span></div>
      <div class="cut-results">${mediaGrid(s, `shot:${s.id}`, "endImages", { pickable: true, addLabel: "끝 장면 올리기", max: 6 })}${tile}</div>
    </div>`;
  }

  // 영상화: 엔드 프레임 칸 하나 (비워도 돼요). 샷 이미지에서 ★ 고른 장면이 들어와 있고, 여기서 바로 올리거나 뺄 수도 있다
  function endSlot(s) {
    const vm = hfModelFor("video", s), end = endOf(s);
    const note = !end ? "비워도 돼요"
      : vm.end ? "시작 → 끝을 이어서 만들어요"
      : isWebModel(vm) ? "시작·끝 프레임을 함께 저장해요"
      : `<b class="warn-text">${esc(vm.name)}는 못 받아요</b>`;
    return `<div class="end-slot" title="${end && !vm.end && !isWebModel(vm) ? "Seedance · Kling 3.0/4.0 · MiniMax · Cinema Studio 가 엔드 프레임을 받아요" : "영상이 이 장면으로 끝나게 (선택)"}">
      <div class="media-grid">${end
        ? `<span class="thumb end-thumb"><img data-img-id="${esc(end)}" alt="엔드 프레임" title="크게 보기" /><button type="button" class="thumb-del" data-end-clear aria-label="엔드 프레임 빼기">✕</button></span>`
        : `<button type="button" class="media-add end-add" data-media-add="shot:${esc(s.id)}|endImages"><span>＋</span>엔드 프레임<small>Ctrl+V · 끌어다 놓기</small></button>`}</div>
      <small class="end-note">${end ? "엔드 프레임 · " : ""}${note}</small>
    </div>`;
  }

  // 영상화 칸에서 빼기: 후보는 샷 이미지에 남겨 두고 고른 것만 푼다
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-end-clear]");
    if (!b) return;
    const s = shotOf(b);
    if (!s) return;
    s.endPick = null;
    save();
    renderActive();
    toast("엔드 프레임을 뺐어요 (후보는 샷 이미지에 남아 있어요)");
  });

  // 시작 프레임(앵커) + 영상 프롬프트로 끝 장면 프롬프트를 쓰고, 샷 이미지 모델로 만든다 (웹 모델이면 복사·열기)
  const END_SCHEMA = { type: "object", additionalProperties: false, required: ["en", "ko"], properties: { en: { type: "string" }, ko: { type: "string" } } };
  async function endFramePrompt(p, s) {
    const out = await callClaude({
      system: K.endFrame,
      content: [...(await imageBlocks([anchorOf(s)])), { type: "text", text: `${projectContext(p)}\n\n[이 컷]\n${shotLine(s, p.shots.indexOf(s))}\n영상 프롬프트: ${str(s.ven) || str(s.vko) || "(아직 없음 — 컷 설명대로 움직임이 끝난 상태)"}\n\n이 영상이 끝나는 순간의 엔드 프레임 프롬프트를 써 주세요.` }],
      schema: END_SCHEMA, maxTokens: 3000
    });
    s.endEn = str(out.en);
    s.endKo = str(out.ko);
    save({ undo: false });
    return s.endEn;
  }

  async function generateEndFrame(p, s) {
    const m = hfModelFor("shots");
    endGenBusy.add(s.id);
    rerenderGen();
    try {
      const prompt = await endFramePrompt(p, s);
      if (isWebModel(m)) { toast(`엔드 프레임 프롬프트가 준비됐어요. '${m.name} 열기'를 누르세요`); return; }
      const [r] = await higgsfieldGenerate("image", [{ prompt: `${prompt}\n\n${K.endFrameRefNote}`, aspect: p.plan.ratio || "16:9", refs: [anchorOf(s)] }], m, "shots");
      if (!r.blobs.length) throw new Error(r.error || "엔드 프레임을 받지 못했어요");
      const id = await storeMedia(r.blobs[0], `shot${pad2(p.shots.indexOf(s) + 1)}_end.png`);
      s.endImages.push(id);
      s.endPick = id;
      save();
      const vm = hfModelFor("video", s);
      toast(`엔드 프레임을 만들었어요${vm.end ? ` — ${vm.name}로 영상을 만들면 이 장면으로 끝나요` : ""}${s.endKo ? ` · ${s.endKo}` : ""}`);
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      endGenBusy.delete(s.id);
      rerenderGen();
    }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-gen-end]");
    if (!b) return;
    const p = current(), s = shotOf(b);
    if (!s || !anchorOf(s)) return;
    const m = hfModelFor("shots");
    if (isWebModel(m)) {
      if (s.endEn) return webHandoff(m, `${s.endEn}\n\n${K.endFrameRefNote}`, [anchorOf(s)], `shot${pad2(p.shots.indexOf(s) + 1)}_start`);
      if (!aiReady()) return toast("글 작업에 쓸 AI를 AI 연결에서 골라 주세요");
      endGenBusy.add(s.id);
      rerenderGen();
      return endFramePrompt(p, s).then(() => toast(`엔드 프레임 프롬프트가 준비됐어요. '${m.name} 열기'를 누르세요`), (err) => toast(aiErrorText(err))).finally(() => { endGenBusy.delete(s.id); rerenderGen(); });
    }
    if (!aiReady()) return toast("글 작업에 쓸 AI를 AI 연결에서 골라 주세요");
    if (!confirm(`엔드 프레임 — ${hfCostNote("image", 1, [m])} 만들까요?`)) return;
    generateEndFrame(p, s);
  });

  // ── 컷마다 영상 뽑기 설정: 길이 · 화질 · 비율 (비우면 컷 길이 · 모델 기본 화질 · 기획 비율) ──
  // 사이즈 = 비율 + 해상도. 해상도를 받는 모델(Seedance 등)은 화질도 이 사이즈에 맞춰 보낸다
  const VID_SIZES = [
    { w: 1920, h: 1080, a: "16:9", g: "가로 16:9" }, { w: 1280, h: 720, a: "16:9", g: "가로 16:9" }, { w: 854, h: 480, a: "16:9", g: "가로 16:9" },
    { w: 1080, h: 1920, a: "9:16", g: "세로 9:16" }, { w: 720, h: 1280, a: "9:16", g: "세로 9:16" }, { w: 480, h: 854, a: "9:16", g: "세로 9:16" },
    { w: 1080, h: 1080, a: "1:1", g: "정사각 1:1" }, { w: 720, h: 720, a: "1:1", g: "정사각 1:1" },
    { w: 1440, h: 1080, a: "4:3", g: "4:3 · 21:9" }, { w: 2560, h: 1080, a: "21:9", g: "4:3 · 21:9" }
  ];
  const sizeKey = (z) => `${z.w}x${z.h}`;
  const sizeLabel = (z) => `${z.w}×${z.h}`;
  const sizeP = (z) => Math.min(z.w, z.h);
  const isResModel = (m) => m.tier?.[0] === "resolution";
  // 사이즈의 높이(1080·720·480)에 가장 가까운 그 모델의 해상도 값
  function tierForSize(m, z) {
    if (!isResModel(m) || !z) return null;
    const opts = m.tier.slice(1).filter((t) => parseInt(t, 10) >= 100);
    return opts.length ? opts.reduce((b, t) => (Math.abs(parseInt(t, 10) - sizeP(z)) < Math.abs(parseInt(b, 10) - sizeP(z)) ? t : b)) : null;
  }
  const vidSizeOf = (s) => VID_SIZES.find((z) => sizeKey(z) === s.vidSize) || null;
  // 기본 사이즈: 기획 비율 + 모델 기본 해상도(없으면 1080)
  function defaultSize(m, ratio) {
    const p = isResModel(m) ? parseInt(hfTierOf(m) || m.tier[1], 10) || 1080 : 1080;
    const same = VID_SIZES.filter((z) => z.a === ratio);
    return same.reduce((b, z) => (Math.abs(sizeP(z) - p) < Math.abs(sizeP(b) - p) ? z : b), same[0] || VID_SIZES[0]);
  }
  function vidRange(m) {
    if (Array.isArray(m.duration)) return `${m.duration[0]}~${m.duration[1]}초`;
    if (m.duration?.options) return `${m.duration.options.join("/")}초`;
    return "";
  }
  // 이 길이를 더 길게 받는 영상 모델 (없으면 나눠 만들기 안내)
  function longerModels(want, got) {
    const maxOf = (x) => (Array.isArray(x.duration) ? x.duration[1] : x.duration?.options ? Math.max(...x.duration.options) : 0);
    const fit = K.higgsfield.videoModels.filter((x) => !x.web && maxOf(x) >= want).map((x) => `${x.name}(${maxOf(x)}초)`);
    const more = K.higgsfield.videoModels.filter((x) => !x.web && maxOf(x) > got && maxOf(x) < want).map((x) => `${x.name}(${maxOf(x)}초)`);
    return fit.length ? `${want}초는 ${fit.slice(0, 3).join(" · ")}로 바꾸면 돼요` : `${want}초를 한 번에 만드는 모델은 없어요 — ${more.length ? `${more.slice(0, 2).join(" · ")}까지 늘리거나 ` : ""}컷을 둘로 나눠 이어 붙이세요`;
  }
  function vidOpts(s) {
    const m = hfModelFor("video", s), p = current();
    const want = s.vidSec || s.duration, got = m.web ? Math.round(want) : fitDuration(m, want);
    // 해상도 모델은 사이즈가 화질까지 정하므로 화질 칸은 모드·품질 모델에만
    const tiers = m.tier && !isResModel(m) ? m.tier.slice(1) : [];
    const tierNow = tiers.includes(s.vidTier) ? s.vidTier : "";
    const label = TIER_LABEL[m.tier?.[0]] || "화질";
    const base = p.plan.ratio || "16:9", def = defaultSize(m, base), cur = vidSizeOf(s);
    const groups = [...new Set(VID_SIZES.map((z) => z.g))];
    return `<div class="vid-opts" title="이 컷만 따로 — 비우면 기본값">
      <label class="vo"><span>길이</span><span class="vo-num"><input type="number" data-vid-sec min="1" max="60" step="1" value="${s.vidSec || Math.round(s.duration)}" aria-label="뽑을 길이(초)" title="컷 길이(${s.duration}초)보다 길게도 뽑을 수 있어요" />초</span></label>
      ${tiers.length ? `<label class="vo"><span>${esc(label)}</span><select data-vid-tier aria-label="${esc(label)}">
        <option value="" title="모델 기본값">${esc(hfTierOf(m) || tiers[0])}</option>${tiers.map((t) => `<option ${t === tierNow ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>` : ""}
      <label class="vo vo-size"><span>사이즈</span><select data-vid-size aria-label="사이즈">
        <option value="" title="기획 비율 · 모델 기본 화질">${sizeLabel(def)} (기본)</option>
        ${groups.map((g) => `<optgroup label="${g}">${VID_SIZES.filter((z) => z.g === g).map((z) => `<option value="${sizeKey(z)}" ${cur && sizeKey(z) === sizeKey(cur) ? "selected" : ""}>${sizeLabel(z)}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <small class="vo-note">${m.web ? "웹에서 직접 만들 때 참고 값이에요" : got < want ? `<b class="warn-text">${esc(m.name)}는 최대 ${got}초까지</b> — ${longerModels(want, got)}` : `${got}초로 만들어요${got !== want ? ` (${esc(m.name)}: ${vidRange(m)})` : vidRange(m) ? ` · ${vidRange(m)}` : ""}${s.vidSec && s.vidSec !== s.duration ? ` · 컷은 ${s.duration}초` : ""}`}${!m.web && cur ? (isResModel(m) ? ` · ${sizeLabel(cur)} → ${esc(tierForSize(m, cur))}` : ` · ${esc(m.name)}는 비율(${cur.a})만 맞추고 해상도는 모델이 정해요`) : ""}</small>
    </div>`;
  }
  document.addEventListener("change", (e) => {
    const el = e.target.closest?.("[data-vid-sec], [data-vid-tier], [data-vid-size]");
    if (!el) return;
    const s = shotOf(el);
    if (!s) return;
    if (el.matches("[data-vid-sec]")) {
      const v = Math.round(Number(el.value));
      // 컷 길이와 같으면 \"컷 따라가기\"로 두고, 다르면 이 컷만의 길이로 (칸에는 늘 숫자가 보여서 화살표로 계속 올릴 수 있다)
      s.vidSec = v >= 1 && v <= 60 && v !== Math.round(s.duration) ? v : null;
    } else if (el.matches("[data-vid-tier]")) s.vidTier = el.value || null;
    else { s.vidSize = el.value || null; s.vidAspect = vidSizeOf(s)?.a || null; }
    save();
    renderActive();
  });

  // 영상 칸: 앱에서 바로(Higgsfield) 또는 웹에서 직접(프롬프트 복사 + 시작 프레임 + 사이트)
  function videoGenTile(s) {
    const m = hfModelFor("video", s), busy = videoGenBusy.has(s.id);
    if (isWebModel(m)) {
      const ready = str(s.ven) && !isStale({ obj: s, ko: "vko", en: "ven" });
      return `<button type="button" class="gen-tile web" data-gen-video ${busy ? "disabled" : ""}>
        ${busy ? `<span class="mini-spin"></span>프롬프트 준비 중…` : `<b>↗</b>${ready ? `${esc(m.name)} 열기` : `프롬프트 만들고 ${esc(m.name)}`}`}</button>`;
    }
    if (!genReady(m)) return "";
    return `<button type="button" class="gen-tile" data-gen-video ${busy ? "disabled" : ""}>
      ${busy ? `<span class="mini-spin"></span>생성 중…` : `<b>✨</b>${esc(m.name)}로 만들기`}</button>`;
  }

  // 빈 한글 프롬프트 초안 + 영문화를 한 번에
  async function autoPrompts(kind) {
    const drafted = await draftAllShots(kind);
    const translated = await translateAllShots(kind);
    toast(drafted || translated ? `초안 ${drafted}개 · 영문화 ${translated}개. 한글을 읽어 보고 고칠 곳은 고쳐 주세요` : "모든 컷에 프롬프트가 있어요");
  }

  const shotOf = (el) => current().shots.find((s) => s.id === el.closest("[data-shot-id]")?.dataset.shotId);

  // 컷 길이·설명 직접 수정 (스토리보드)
  function editShotField(el, s) {
    const f = el.dataset.shotField;
    if (!f || !s) return;
    if (f === "duration") {
      const v = Number(el.value);
      if (!(v > 0 && v <= 30)) return;
      s.duration = v;
    } else s[f] = el.value;
    save();
  }

  // 컷 이동·삭제 버튼 (스토리보드)
  function moveOrDeleteShot(e) {
    const btn = e.target.closest("[data-shot-move], [data-shot-delete]");
    if (!btn) return;
    const shots = current().shots;
    const s = shotOf(btn);
    const index = shots.indexOf(s);
    if (index < 0) return;
    if (btn.matches("[data-shot-delete]")) {
      if (!confirm(`컷 ${index + 1}을 삭제할까요? 올린 이미지·영상도 함께 지워져요.`)) return;
      shots.splice(index, 1);
      save();
      renderActive();
      return cleanupMedia([...s.images, ...s.videos, ...s.refFiles]);
    }
    const target = index + Number(btn.dataset.shotMove);
    if (target < 0 || target >= shots.length) return;
    [shots[index], shots[target]] = [shots[target], shots[index]];
    save();
    renderActive();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-auto-prompts]");
    if (btn) runAi(btn, "작성 중…", () => autoPrompts(btn.dataset.autoPrompts));
  });

  // ── Higgsfield 로 샷 이미지·영상 만들기 (여러 컷을 12개씩 묶어 한 번에) ──
  const shotGenBusy = new Set();   // 이미지 만드는 중인 컷
  const videoGenBusy = new Set();  // 영상 만드는 중인 컷

  const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
  const rerenderGen = () => { if (["shots", "video"].includes(activeTab())) renderActive(); else renderNav(); };

  // 컷의 레퍼런스: 직접 고른 게 없으면 스타일프레임 + 캐릭터 시트
  const shotRefs = (p, s) => [...new Set(Array.isArray(s.refs) ? s.refs : [p.style.pick, ...p.characters.map((c) => c.pick)].filter(Boolean))];

  // ── 스토리보드 스케치 = 구도 레퍼런스 (배치 · 샷 크기 · 앵글만 따른다) ──
  // 스케치(SVG)를 PNG 로 한 번 구워 미디어로 저장해 두고(s.boardRef), 스케치가 바뀌면 다시 굽는다
  const useBoardRef = (s) => s.boardAsRef !== false && !!s.board?.svg;
  const endOf = (s) => s.endPick || null; // 샷 이미지에서 ★ 고른 끝 장면 (영상화 칸에서 빼면 null)
  const svgSig = (svg) => { let h = 0; for (let i = 0; i < svg.length; i++) h = (h * 31 + svg.charCodeAt(i)) | 0; return `${svg.length}:${h}`; };
  const boardRefCached = (s) => (useBoardRef(s) && s.boardRef?.sig === svgSig(s.board.svg) ? s.boardRef.id : null);

  async function boardRefId(p, s) {
    if (!useBoardRef(s)) return null;
    const cached = boardRefCached(s);
    if (cached && (await getMedia(cached).catch(() => null))) return cached;
    const img = new Image();
    img.src = svgUrl(s.board.svg);
    await img.decode();
    const [w, h] = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [960, 960] }[p.plan.ratio || "16:9"] || [1280, 720];
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const old = s.boardRef?.id;
    const id = await storeMedia(blob, `shot${pad2(p.shots.indexOf(s) + 1)}_storyboard.png`);
    s.boardRef = { id, sig: svgSig(s.board.svg) };
    save({ undo: false });
    if (old) cleanupMedia([old]);
    return id;
  }
  // 샷 이미지 화면에 들어오면 미리 구워 둔다 ('웹에서 직접'은 클릭 즉시 내려받아야 해서)
  async function warmBoardRefs(p) {
    for (const s of p.shots) if (useBoardRef(s) && !boardRefCached(s)) { try { await boardRefId(p, s); } catch { /* 다음에 */ } }
  }
  // 생성할 때 쓸 레퍼런스: 스타일프레임 · 캐릭터(·직접 고른 것) + 맨 뒤에 스토리보드 스케치
  async function shotGenRefs(p, s) {
    const refs = shotRefs(p, s);
    const sketch = await boardRefId(p, s).catch(() => null);
    return { refs: sketch ? [...refs, sketch] : refs, sketch: !!sketch };
  }

  // 영문 프롬프트가 없거나 오래된 컷은 먼저 초안·영문화
  async function ensureEnglish(p, shots, kind) {
    const [ko, en] = kind === "video" ? ["vko", "ven"] : ["ko", "en"];
    const need = shots.filter((s) => !str(s[en]) || isStale({ obj: s, ko, en }));
    if (!need.length) return;
    const emptyKo = need.filter((s) => !str(s[ko]));
    if (emptyKo.length === 1 && need.length === 1) emptyKo[0][ko] = await draftPrompt(`shot:${emptyKo[0].id}:${kind === "video" ? "vid" : "img"}`);
    else if (emptyKo.length) await draftAllShots(kind);
    const results = await translatePrompts(need.map((s) => s[ko]), kind);
    need.forEach((s, i) => { if (results[i]) { s[en] = results[i]; s[`${en}Src`] = s[ko]; } });
    save();
  }

  // 컷 이미지: 컷마다 자기 레퍼런스로
  async function generateShotImages(p, shots) {
    const m = hfModelFor("shots");
    if (isWebModel(m)) { toast(`${m.name}는 컷마다 '열기'로 만들어요`); return 0; }
    shots = shots.filter((s) => !shotGenBusy.has(s.id));
    if (!shots.length) return 0;
    shots.forEach((s) => shotGenBusy.add(s.id));
    rerenderGen();
    let made = 0;
    try {
      await ensureEnglish(p, shots, "image");
      for (const group of chunks(shots, 12)) {
        const items = [];
        for (const s of group) {
          // 스토리보드 스케치를 맨 뒤 레퍼런스로 — 구도만 따르게 알려 준다
          const { refs, sketch } = await shotGenRefs(p, s);
          const notes = [refs.length > (sketch ? 1 : 0) ? K.shotRefNote : "", sketch ? K.boardRefNote : ""].filter(Boolean).join("\n");
          items.push({ prompt: `${s.en}${notes ? `\n\n${notes}` : ""}`, aspect: p.plan.ratio || "16:9", refs, keepLast: sketch });
        }
        const results = await higgsfieldGenerate("image", items, m, "shots");
        for (const [i, r] of results.entries()) {
          const s = group[i];
          for (const blob of r.blobs) {
            const id = await storeMedia(blob, `shot${pad2(p.shots.indexOf(s) + 1)}.png`);
            s.images.push(id);
            if (!s.pick) s.pick = id;
            made++;
          }
          if (r.error) toast(`컷 ${p.shots.indexOf(s) + 1}: ${r.error}`);
        }
        save();
        group.forEach((s) => shotGenBusy.delete(s.id));
        rerenderGen();
      }
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      shots.forEach((s) => shotGenBusy.delete(s.id));
      rerenderGen();
    }
    return made;
  }

  // 컷 영상: 앵커 이미지를 시작 프레임으로, 컷마다 고른 모델별로 묶어서 요청
  async function generateShotVideos(p, shots) {
    // 앱에서 바로 만들 수 있는 모델의 컷만 (웹 모델은 컷마다 '열기')
    shots = shots.filter((s) => anchorOf(s) && !videoGenBusy.has(s.id) && genReady("video", s));
    if (!shots.length) return 0;
    shots.forEach((s) => videoGenBusy.add(s.id));
    rerenderGen();
    let made = 0;
    try {
      await ensureEnglish(p, shots, "video");
      const byModel = new Map();
      shots.forEach((s) => {
        const m = hfModelFor("video", s);
        if (!byModel.has(m.id)) byModel.set(m.id, { m, list: [] });
        byModel.get(m.id).list.push(s);
      });
      for (const { m, list } of byModel.values()) {
        for (const group of chunks(list, 12)) {
          // 엔드 프레임이 있고 모델이 받으면 시작 → 끝 프레임 사이를 잇게
          const results = await higgsfieldGenerate("video", group.map((s) => {
            const end = m.end && endOf(s);
            // 컷마다: 뽑을 길이 · 화질 · 비율 (비우면 컷 길이 · 모델 기본 · 기획 비율)
            // 사이즈 → 비율 + (해상도 모델이면) 해상도
            const z = vidSizeOf(s);
            return { prompt: s.ven, aspect: z?.a || s.vidAspect || p.plan.ratio || "16:9", refs: end ? [anchorOf(s), end] : [anchorOf(s)], roles: end ? ["start_image", "end_image"] : null, seconds: s.vidSec || s.duration, tier: tierForSize(m, z) || s.vidTier || null };
          }), m, "video");
          for (const [i, r] of results.entries()) {
            const s = group[i];
            for (const blob of r.blobs) {
              const id = await storeMedia(blob, `shot${pad2(p.shots.indexOf(s) + 1)}_${m.id}.mp4`);
              s.videos.push(id);
              if (!s.take) s.take = id;
              made++;
            }
            if (r.error) toast(`컷 ${p.shots.indexOf(s) + 1}: ${r.error}`);
          }
          save();
          group.forEach((s) => videoGenBusy.delete(s.id));
          rerenderGen();
        }
      }
    } catch (err) {
      toast(aiErrorText(err));
    } finally {
      shots.forEach((s) => videoGenBusy.delete(s.id));
      rerenderGen();
    }
    return made;
  }

  // ── 샷 레퍼런스 고르기 ───────────────────────────
  let refDialogShotId = null;

  function refsRow(p, s) {
    const ids = shotRefs(p, s);
    const auto = !Array.isArray(s.refs);
    return `<div class="ref-row">
      <span class="ref-label">레퍼런스 <em>${auto ? "자동 · 스타일프레임 + 캐릭터" : `${ids.length}장`}</em></span>
      <div class="ref-chips">
        ${ids.map((id) => `<span class="ref-chip"><img data-img-id="${esc(id)}" alt="" title="크게 보기" />
          <button type="button" class="ref-x" data-ref-remove="${esc(id)}" aria-label="레퍼런스 빼기">✕</button></span>`).join("")}
        <button type="button" class="ref-add-btn" data-ref-open>＋ 추가</button>
        ${auto ? "" : `<button type="button" class="link-btn ref-reset" data-ref-auto>자동으로</button>`}
      </div>
    </div>`;
  }

  // 레퍼런스 후보: 스타일프레임 · 캐릭터 · 다른 컷 · 기획 레퍼런스 · 내가 올린 이미지
  function refGroups(p, s) {
    const groups = [];
    if (p.style.images.length) groups.push({ title: "스타일프레임", items: p.style.images.map((id) => ({ id, tag: id === p.style.pick ? "★" : "" })) });
    p.characters.forEach((c) => {
      const items = [...c.images.map((id) => ({ id, tag: id === c.pick ? "★ 시트" : "시트" })), ...c.refs.map((id) => ({ id, tag: id === baseOf(c) ? "★ 기준" : "기준" }))];
      if (items.length) groups.push({ title: `캐릭터 · ${c.name || "이름 없음"}`, items });
    });
    const shotItems = p.shots.flatMap((x, i) => x.images.map((id) => ({ id, tag: `${pad2(i + 1)}${id === anchorOf(x) ? " 앵커" : ""}${x === s ? " (이 컷)" : ""}` })));
    if (shotItems.length) groups.push({ title: "샷 이미지 · 앵커", items: shotItems });
    if (p.plan.images.length) groups.push({ title: "기획 레퍼런스", items: planRefsOrdered(p.plan).map((id) => ({ id, tag: `${REF_ROLE[refRole(p.plan, id)].icon} ${REF_ROLE[refRole(p.plan, id)].ko}` })) });
    if (s.refFiles.length) groups.push({ title: "이 컷에 올린 이미지", items: s.refFiles.map((id) => ({ id, tag: "" })) });
    return groups;
  }

  function renderRefDialog() {
    const p = current();
    const s = p.shots.find((x) => x.id === refDialogShotId);
    const box = $("#refDialog");
    if (!s) { if (box.open) box.close(); return; }
    const chosen = new Set(shotRefs(p, s));
    const groups = refGroups(p, s);
    $("#refDialogBody").innerHTML = `
      <p class="hint">컷 ${p.shots.indexOf(s) + 1} — 누르면 넣고 다시 누르면 빼요. 지금 ${chosen.size}장.</p>
      <div class="ref-upload" data-shot-id="${esc(s.id)}">
        <button type="button" class="media-add ref-upload-btn" data-media-add="shot:${esc(s.id)}|refFiles"><span>＋</span>내 이미지 올리기<small>끌어다 놓기 · Ctrl+V</small></button>
      </div>
      ${groups.map((g) => `
        <h3>${esc(g.title)}</h3>
        <div class="ref-options">${g.items.map((it) => `
          <button type="button" class="ref-option ${chosen.has(it.id) ? "on" : ""}" data-ref-toggle="${esc(it.id)}">
            <img data-img-id="${esc(it.id)}" alt="" />${it.tag ? `<span class="ref-tag">${esc(it.tag)}</span>` : ""}<i class="ref-check" aria-hidden="true">✓</i>
          </button>`).join("")}</div>`).join("") || `<p class="hint">아직 고를 이미지가 없어요. 스타일프레임·캐릭터 시트를 만들거나 직접 올려 주세요.</p>`}`;
    hydrateThumbs($("#refDialogBody"));
  }

  function openRefDialog(s) {
    refDialogShotId = s.id;
    renderRefDialog();
    $("#refDialog").showModal();
  }

  document.addEventListener("click", (e) => {
    const p = current();
    const open = e.target.closest("[data-ref-open]");
    const remove = e.target.closest("[data-ref-remove]");
    const auto = e.target.closest("[data-ref-auto]");
    const toggle = e.target.closest("[data-ref-toggle]");
    if (!open && !remove && !auto && !toggle) return;
    const s = toggle ? p.shots.find((x) => x.id === refDialogShotId) : shotOf(e.target);
    if (!s) return;
    if (open) return openRefDialog(s);
    const list = shotRefs(p, s);
    if (remove) s.refs = list.filter((id) => id !== remove.dataset.refRemove);
    if (auto) s.refs = null;
    if (toggle) {
      const id = toggle.dataset.refToggle;
      s.refs = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      renderRefDialog();
    }
    save();
    renderActive();
  });
  $("#refDialog").addEventListener("close", () => { refDialogShotId = null; });

  // Higgsfield 웹에 함께 올릴 레퍼런스(스타일프레임 · 캐릭터 시트) 내려받기
  function downloadRefs(p) {
    if (p.style.pick) downloadMedia(p.style.pick, "ref_styleframe");
    p.characters.forEach((c, i) => { if (c.pick) downloadMedia(c.pick, `ref_character_${c.name || i + 1}`); });
  }

  // 생성 전 확인 문구 — 모델이 섞여 있으면 모델별 개수를 보여 준다
  const hfCostNote = (kind, n, models) => {
    const list = models || [hfModelFor(kind === "video" ? "video" : "shots")];
    const counts = new Map();
    list.forEach((m) => counts.set(m.id, { m, n: (counts.get(m.id)?.n || 0) + 1 }));
    const desc = models ? [...counts.values()].map(({ m, n: c }) => `${m.name}${hfTierOf(m) ? ` ${hfTierOf(m)}` : ""} ${c}`).join(", ") : `${list[0].name}${hfTierOf(list[0]) ? ` · ${hfTierOf(list[0])}` : ""}`;
    const api = list.some((m) => m.api);
    return `${api ? "" : "Higgsfield "}${kind === "video" ? `영상 ${n}개` : `이미지 ${n}장`} (${desc}) — ${api ? "내 API 키 요금이 나가요" : "크레딧이 사용돼요"}.`;
  };

  document.addEventListener("click", async (e) => {
    const p = current();
    if (e.target.closest("[data-refs-dl]")) return downloadRefs(p);
    const one = e.target.closest("[data-gen-shot], [data-gen-video]");
    if (one) {
      const s = shotOf(one);
      if (!s) return;
      const isVideo = one.matches("[data-gen-video]");
      const m = hfModelFor(isVideo ? "video" : "shots", s);
      if (isVideo && isWebModel(m)) {
        // 웹 영상 모델: 영문 영상 프롬프트 복사 + 시작 프레임 저장 + 사이트 열기
        if (str(s.ven) && !isStale({ obj: s, ko: "vko", en: "ven" })) return webHandoff(m, s.ven, [anchorOf(s), endOf(s)].filter(Boolean), `shot${pad2(p.shots.indexOf(s) + 1)}_start_end`);
        if (!aiReady()) return toast("영상 프롬프트를 먼저 써 주세요");
        videoGenBusy.add(s.id);
        rerenderGen();
        try { await ensureEnglish(p, [s], "video"); toast(`프롬프트가 준비됐어요. '${m.name} 열기'를 누르세요`); }
        catch (err) { toast(aiErrorText(err)); }
        finally { videoGenBusy.delete(s.id); rerenderGen(); }
        return;
      }
      if (!isVideo && isWebModel(m)) {
        // 웹 모델: 영문 프롬프트가 준비돼 있으면 바로 열고, 아니면 먼저 준비 (다음 클릭에 열림)
        if (str(s.en) && !isStale({ obj: s, ko: "ko", en: "en" })) return webHandoff(m, `${s.en}${boardRefCached(s) ? `\n\n${K.boardRefNote}` : ""}`, [...shotRefs(p, s), boardRefCached(s)].filter(Boolean), `shot${pad2(p.shots.indexOf(s) + 1)}_ref`);
        if (!aiReady()) return toast("영문 프롬프트를 먼저 써 주세요");
        shotGenBusy.add(s.id);
        rerenderGen();
        try { await ensureEnglish(p, [s], "image"); toast(`프롬프트가 준비됐어요. '${m.name} 열기'를 누르세요`); }
        catch (err) { toast(aiErrorText(err)); }
        finally { shotGenBusy.delete(s.id); rerenderGen(); }
        return;
      }
      if (!confirm(`${hfCostNote(isVideo ? "video" : "image", 1, [m])} 만들까요?`)) return;
      return isVideo ? generateShotVideos(p, [s]) : generateShotImages(p, [s]);
    }
    const all = e.target.closest("[data-gen-all]");
    if (all) {
      const isVideo = all.dataset.genAll === "video";
      const targets = isVideo ? p.shots.filter((s) => !s.videos.length && anchorOf(s)) : p.shots.filter((s) => !s.images.length);
      if (!targets.length) return toast(isVideo ? "영상을 만들 컷이 없어요 (앵커 이미지가 있고 영상이 없는 컷)" : "이미지가 없는 컷이 없어요");
      if (!confirm(`${hfCostNote(isVideo ? "video" : "image", targets.length, targets.map((s) => hfModelFor(isVideo ? "video" : "shots", s)))} 만들까요?`)) return;
      const made = isVideo ? await generateShotVideos(p, targets) : await generateShotImages(p, targets);
      toast(`${isVideo ? "영상" : "이미지"} ${made}개를 받아왔어요`);
    }
  });

  // 복사한 이미지·영상을 Ctrl+V 로 바로 올리기 (마우스를 올려 둔 칸, 없으면 지금 화면의 첫 칸)
  let hoverZone = null;
  document.addEventListener("mouseover", (e) => {
    const z = e.target.closest?.(".media-grid, .ref-grid");
    if (z) hoverZone = z;
  });
  document.addEventListener("paste", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => /^(image|video)\//.test(f.type));
    if (!files.length) return;
    const zone = hoverZone?.isConnected && hoverZone.closest(".panel.active") ? hoverZone : $(".panel.active .media-grid");
    const add = zone && $("[data-media-add]", zone);
    if (!add) return toast("붙여넣을 칸 위에 마우스를 올려 주세요");
    e.preventDefault();
    const [ownerKey, field] = add.dataset.mediaAdd.split("|");
    attachMedia(ownerKey, field, files.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `pasted_${Date.now()}_${i}.${f.type.split("/")[1]}`, { type: f.type }))));
  });

  // ── 6 애니메틱 편집기 (8 편집에서는 같은 편집기로 최종 영상을 본다) ──
  // 편집 프로그램처럼: 위 = 뷰어 + 인스펙터(컷 · 메모), 아래 = 타임라인(메모 트랙 + 컷 트랙)
  // animatic: 앵커 이미지(없으면 스케치) + 카메라 무빙 · final: 채택한 영상(없으면 앵커 이미지) + 속도·리버스
  // 타임라인: 클립을 끌어 순서 · 오른쪽 끝을 끌어 길이 · 눈금자를 끌어 탐색 · Ctrl+휠 확대 · Space 재생 · M 메모
  const anchorOf = (s) => s.pick || s.images[0] || null;

  // ── 타임라인 클립: 기본은 컷마다 한 개(컷 그대로), 여기에 같은 컷의 다른 이미지·영상을 '추가 클립'으로 넣거나 컷을 뺄 수 있다 ──
  // 애니메틱(animatic)과 편집(final)은 따로: p.timeline[mode] = { order: [컷·클립 id], off: [뺀 컷 id] }, p.clips = 추가 클립
  // 추가 클립은 원래 컷을 그대로 따르는 '보기'(프로토타입)라 편집기 코드는 컷과 똑같이 다룬다 — 길이·전환·이미지만 클립 것
  const clipViews = new WeakMap();
  function clipView(c, s) {
    if (clipViews.get(c)?.shot === s) return clipViews.get(c);
    const v = Object.create(s);
    Object.defineProperties(v, {
      id: { value: c.id, enumerable: true },
      clip: { value: c },
      shot: { value: s },
      duration: { get: () => c.duration, set: (x) => { c.duration = x; }, enumerable: true },
      edit: { get: () => c.edit || null, set: (x) => { c.edit = x; }, enumerable: true },
      pick: { get: () => (c.kind === "image" ? c.media : null), set: (x) => { c.media = x; c.kind = "image"; } },
      take: { get: () => (c.kind === "video" ? c.media : null), set: (x) => { c.media = x; c.kind = "video"; } }
    });
    clipViews.set(c, v);
    return v;
  }
  const srcShot = (s) => s.shot || s; // 추가 클립이면 원래 컷
  const cutNo = (p, s) => p.shots.indexOf(srcShot(s)) + 1;

  function tlClips(p = current(), mode = ed.mode) {
    const T = p.timeline?.[mode];
    if (!T) return p.shots.slice();
    const byId = new Map(p.shots.map((s) => [s.id, s]));
    // 원래 컷에 아직 있는 이미지·영상을 가리키는 추가 클립만
    const extra = new Map(arr(p.clips).filter((c) => c.mode === mode && byId.has(c.shotId) && [...byId.get(c.shotId).images, ...byId.get(c.shotId).videos, ...byId.get(c.shotId).endImages].includes(c.media)).map((c) => [c.id, c]));
    const off = new Set(arr(T.off)), seen = new Set(), out = [];
    for (const id of arr(T.order)) {
      if (seen.has(id)) continue;
      if (byId.has(id) && !off.has(id)) out.push(byId.get(id));
      else if (extra.has(id)) out.push(clipView(extra.get(id), byId.get(extra.get(id).shotId)));
      else continue;
      seen.add(id);
    }
    // 스토리보드에서 새로 생긴 컷은 앞 컷 바로 뒤에 알아서 들어온다
    p.shots.forEach((s, i) => {
      if (seen.has(s.id) || off.has(s.id)) return;
      const prev = p.shots.slice(0, i).reverse().find((x) => seen.has(x.id));
      out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, s);
      seen.add(s.id);
    });
    return out;
  }

  // 처음 넣거나 뺄 때 지금 모습 그대로 순서를 굳힌다
  function ensureTimeline(p, mode = ed.mode) {
    p.timeline = isObj(p.timeline) ? p.timeline : {};
    p.clips = arr(p.clips);
    const T = p.timeline[mode], list = tlClips(p, mode).map((c) => c.id);
    // 있던 순서(뺀 컷 자리 포함)는 지키고, 새로 생긴 컷만 보이는 자리에 끼운다
    const order = T ? arr(T.order).filter((id) => p.shots.some((s) => s.id === id) || p.clips.some((c) => c.id === id)) : list.slice();
    list.forEach((id, i) => { if (!order.includes(id)) order.splice(i ? order.indexOf(list[i - 1]) + 1 : 0, 0, id); });
    p.timeline[mode] = { order, off: arr(T?.off) };
    return p.timeline[mode];
  }

  // 미디어를 타임라인에 넣기 (at = 들어갈 자리, 없으면 고른 클립 뒤). 뺐던 컷의 대표 이미지면 그 컷을 다시 넣는다
  function insertMedia(shotId, media, kind, at) {
    const p = current(), s = p.shots.find((x) => x.id === shotId);
    if (!s) return;
    const T = ensureTimeline(p), list = tlClips(p);
    const pos = at ?? (list.findIndex((c) => c.id === ed.sel) + 1 || list.length);
    const before = list[pos - 1]?.id, primaryMedia = isFinal() ? s.take || anchorOf(s) : anchorOf(s);
    let id;
    if (T.off.includes(s.id) && media === primaryMedia) {
      T.off = T.off.filter((x) => x !== s.id);
      id = s.id;
    } else {
      id = newId();
      p.clips.push({ id, shotId, mode: ed.mode, kind, media, duration: s.duration, edit: null });
    }
    T.order = T.order.filter((x) => x !== id);
    T.order.splice(before ? T.order.indexOf(before) + 1 : 0, 0, id);
    save();
    ed.sel = id;
    ed.insp = "cut";
    renderNle();
    renderNav();
    toast(`컷 ${pad2(p.shots.indexOf(s) + 1)}의 ${kind === "video" ? "영상" : "이미지"}을(를) 타임라인에 넣었어요`);
  }

  // 타임라인에서 빼기: 추가 클립은 지우고, 컷은 이 타임라인에서만 뺀다 (컷·이미지는 그대로)
  function removeClip(id) {
    const p = current(), list = tlClips(p), i = list.findIndex((c) => c.id === id);
    if (i < 0) return;
    if (list.length === 1) return toast("타임라인에 클립이 하나는 있어야 해요");
    const T = ensureTimeline(p), c = list[i];
    if (c.clip) {
      p.clips = p.clips.filter((x) => x !== c.clip);
      T.order = T.order.filter((x) => x !== id);
    } else T.off = [...new Set([...T.off, id])];
    save();
    ed.sel = (list[i + 1] || list[i - 1]).id;
    renderNle();
    renderNav();
    toast(`${c.clip ? "추가 클립" : `컷 ${pad2(cutNo(p, c))}`}을(를) 타임라인에서 뺐어요 — 오른쪽 '소스'에서 다시 넣을 수 있어요 (Ctrl+Z 되돌리기)`);
  }

  // 순서 바꾸기: 타임라인 순서 · 애니메틱이면 컷 순서(스토리보드)도 같이
  function moveClip(id, to) {
    const p = current(), list = tlClips(p), from = list.findIndex((c) => c.id === id);
    if (from < 0 || to === from) return false;
    const T = ensureTimeline(p);
    const ids = list.map((c) => c.id);
    const [m] = ids.splice(from, 1);
    ids.splice(to, 0, m);
    T.order = [...ids, ...T.order.filter((x) => !ids.includes(x))];
    if (!isFinal()) {
      // 빠지지 않은 컷들의 자리에 타임라인 순서대로 다시 채운다 (뺀 컷은 제자리)
      const onTl = ids.filter((x) => p.shots.some((s) => s.id === x)).map((x) => p.shots.find((s) => s.id === x));
      let k = 0;
      p.shots = p.shots.map((s) => (onTl.includes(s) ? onTl[k++] : s));
    }
    return true;
  }
  const ed = { pid: null, mode: "animatic", t: 0, playing: false, raf: 0, last: 0, sel: null, pps: 0, stopAt: null, loop: false, shown: -1, insp: "cut", note: null, liveId: null, used: null, noteShown: null };
  const frames = new Map(); // 뷰어용 이미지 (미디어 id · 스케치 → ImageBitmap/Image). 읽는 중이면 Promise
  const vids = new Map();   // 최종 편집 뷰어용 영상 (미디어 id → { el, ready })
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (x) => 0.5 - Math.cos(Math.PI * clamp01(x)) / 2;
  const animaticTotal = () => tlClips().reduce((sum, s) => sum + s.duration, 0);
  const shotStage = (s) => (s.take ? "video" : anchorOf(s) ? "picked" : s.board?.svg ? "sketch" : "none");
  const clipStart = (shots, i) => shots.slice(0, i).reduce((a, s) => a + s.duration, 0);
  const transName = (id) => K.editing.transitions.find((t) => t.id === id)?.ko || id;
  const edFps = () => Number(current().editOpts?.fps) || 24;
  const CANVAS = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [960, 960] };
  const PPS_MIN = 6, PPS_MAX = 400;
  const ppsFromSlider = (v) => PPS_MIN * Math.pow(PPS_MAX / PPS_MIN, v / 100);
  const sliderFromPps = (pps) => (Math.log(pps / PPS_MIN) / Math.log(PPS_MAX / PPS_MIN)) * 100;
  const isFinal = () => ed.mode === "final";
  const useVideo = (s) => isFinal() && !!s.take;
  const nleTab = () => ["select", "edit"].includes(activeTab()) && !!$("#nleCanvas");
  const fmtSpeed = (v) => `${Number(v.toFixed(2))}×`;

  // 00:00:00 (분:초:프레임)
  function timecode(t) {
    const fps = edFps(), f = Math.floor(Math.max(0, t) * fps + 1e-6);
    return `${pad2(Math.floor(f / fps / 60))}:${pad2(Math.floor(f / fps) % 60)}:${pad2(f % fps)}`;
  }

  function shotIndexAt(t) {
    const shots = tlClips();
    let end = 0;
    for (let i = 0; i < shots.length; i++) {
      end += shots[i].duration;
      if (t < end) return i;
    }
    return shots.length - 1;
  }

  function renderSelect() { renderNle("animatic"); }

  function renderNle(mode = ed.mode) {
    stopAnimatic();
    const p = current(), shots = tlClips(p);
    if (ed.mode !== mode) Object.assign(ed, { mode, pps: 0 });
    // 같은 편집기를 두 탭에서 쓰므로 안 보이는 쪽은 비운다 (id 가 겹치지 않게)
    const other = $(mode === "final" ? "#nle" : "#nleFinal");
    if (other) { other.innerHTML = ""; other.classList.remove("on"); }
    const root = $(mode === "final" ? "#nleFinal" : "#nle");
    if (!root) return;
    if (ed.pid !== p.id) Object.assign(ed, { pid: p.id, t: 0, sel: null, pps: 0, note: null });
    if (!shots.length) {
      root.classList.remove("on");
      root.innerHTML = `<div class="card empty-inline"><p>컷이 없어요. 스토리보드 단계에서 컷을 만들어 주세요.</p><button type="button" class="btn ghost small" data-goto="board">스토리보드로</button></div>`;
      return;
    }
    root.classList.add("on");
    if (!shots.some((s) => s.id === ed.sel)) ed.sel = shots[0].id;
    const total = animaticTotal();
    ed.t = Math.min(ed.t, Math.max(0, total - 0.001));
    ed.shown = -1;
    ed.noteShown = null;
    const ratio = p.plan.ratio || "16:9";
    const [cw, ch] = CANVAS[ratio] || CANVAS["16:9"];
    const picked = shots.filter((s) => anchorOf(s)).length, takes = shots.filter((s) => s.take).length;
    const open = p.notes.filter((n) => !n.done).length;
    const keepScroll = $("#tlScroll")?.scrollLeft || 0;
    root.innerHTML = `
      <div class="nle-top">
        <section class="nle-viewer" aria-label="미리보기">
          <div class="nle-bar"><span class="nle-title">${isFinal() ? "최종 영상 · 러프" : "애니메틱"}</span><span class="nle-cutlabel" id="nleCut"></span><span class="spacer"></span><span class="nle-pill">${esc(ratio)} · ${edFps()}fps</span></div>
          <div class="nle-screen" style="--ar:${cw / ch}"><canvas id="nleCanvas" width="${cw}" height="${ch}"></canvas><div class="nle-note" id="nleNote" hidden></div></div>
          <div class="nle-transport">
            <span class="tc" id="nleTc">${timecode(ed.t)}</span>
            <div class="transport-btns">
              <button type="button" class="tbtn" data-tp="start" title="처음으로 (Home)" aria-label="처음으로"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg></button>
              <button type="button" class="tbtn" data-tp="prev" title="이전 컷 (↑)" aria-label="이전 컷"><svg viewBox="0 0 24 24"><path d="M12 6l-8 6 8 6zM20 6l-8 6 8 6z"/></svg></button>
              <button type="button" class="tbtn play" data-tp="play" id="nlePlay" title="재생 / 정지 (Space)" aria-label="재생"><svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg></button>
              <button type="button" class="tbtn" data-tp="next" title="다음 컷 (↓)" aria-label="다음 컷"><svg viewBox="0 0 24 24"><path d="M4 6l8 6-8 6zM12 6l8 6-8 6z"/></svg></button>
              <button type="button" class="tbtn ${ed.loop ? "on" : ""}" data-tp="loop" title="반복 재생" aria-label="반복 재생"><svg viewBox="0 0 24 24"><path d="M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4"/></svg></button>
            </div>
            <span class="tc dim">${timecode(total)}</span>
          </div>
        </section>
        <aside class="nle-insp" id="nleInsp" aria-label="선택한 컷 · 메모"></aside>
      </div>
      <section class="nle-timeline" aria-label="타임라인">
        <div class="tl-toolbar">
          <span class="tl-stat"><b>${shots.length}</b>컷</span>
          <span class="tl-stat"><b>${fmtTime(total)}</b></span>
          ${isFinal() ? `<span class="tl-stat ${takes === shots.length ? "ok" : ""}">영상 <b>${takes}/${shots.length}</b></span>`
            : `<span class="tl-stat ${picked === shots.length ? "ok" : ""}">앵커 <b>${picked}/${shots.length}</b></span>${takes ? `<span class="tl-stat">영상 <b>${takes}</b></span>` : ""}`}
          <button type="button" class="tbtn sm text note-add" data-note-add title="재생헤드 위치에 메모 (M)">＋ 메모${p.notes.length ? ` <em>${open}</em>` : ""}</button>
          <span class="tl-undo"><button type="button" class="tbtn sm" data-undo="-1" title="되돌리기 (Ctrl+Z)" aria-label="되돌리기">↶</button><button type="button" class="tbtn sm" data-undo="1" title="다시 하기 (Ctrl+Shift+Z)" aria-label="다시 하기">↷</button></span>
          <span class="spacer"></span>
          <span class="tl-hint">끌어서 순서 · 끝을 끌어 길이 · M 메모 · Space 재생 · Ctrl+휠 확대</span>
          <div class="tl-zoom">
            <button type="button" class="tbtn sm" data-zoom="-1" title="축소 (−)" aria-label="축소">−</button>
            <input type="range" id="tlZoom" min="0" max="100" step="1" aria-label="타임라인 확대" />
            <button type="button" class="tbtn sm" data-zoom="1" title="확대 (+)" aria-label="확대">＋</button>
            <button type="button" class="tbtn sm text" data-zoom-fit title="전체가 보이게">맞춤</button>
          </div>
        </div>
        <div class="tl-body">
          <div class="tl-heads"><div class="tl-head-ruler"></div><div class="tl-head notes">메모</div><div class="tl-head">${isFinal() ? "영상" : "V1"}</div></div>
          <div class="tl-scroll" id="tlScroll">
            <div class="tl-canvas" id="tlCanvas">
              <div class="tl-ruler" id="tlRuler"></div>
              <div class="tl-notes" id="tlNotes"></div>
              <div class="tl-track" id="tlTrack"></div>
              <div class="tl-playhead" id="tlPlayhead"><i></i></div>
            </div>
          </div>
        </div>
      </section>`;
    if (!ed.pps) fitZoom();
    buildClips();
    $("#tlScroll").scrollLeft = keepScroll;
    renderInspector();
    drawViewer();
  }

  function fitZoom() {
    const w = $("#tlScroll")?.clientWidth || 800;
    ed.pps = Math.max(PPS_MIN, Math.min(PPS_MAX, (w - 40) / Math.max(1, animaticTotal())));
  }

  // 확대/축소: 기준점(마우스 위치·가운데) 아래의 시간이 그대로 있게 스크롤을 맞춘다
  function setZoom(pps, anchorX) {
    const sc = $("#tlScroll");
    if (!sc) return;
    const ax = anchorX ?? sc.clientWidth / 2;
    const tAt = (sc.scrollLeft + ax) / ed.pps;
    ed.pps = Math.max(PPS_MIN, Math.min(PPS_MAX, pps));
    layoutTimeline();
    sc.scrollLeft = tAt * ed.pps - ax;
  }

  function buildClips() {
    const shots = tlClips();
    $("#tlTrack").innerHTML = shots.map((s, i) => {
      const e = editOf(s), mv = K.editing.moves.find((m) => m.id === e.move), vid = useVideo(s);
      const badges = isFinal()
        ? `${vid && e.speed !== 1 ? `<span class="clip-badge">${fmtSpeed(e.speed)}</span>` : ""}${vid && e.reverse ? `<span class="clip-badge" title="거꾸로 재생">◀◀</span>` : ""}${vid ? "" : `<span class="clip-badge dim">이미지</span>`}`
        : s.take ? `<span class="clip-badge">영상</span>` : "";
      return `
      <div class="tl-clip st-${shotStage(s)} ${isFinal() && !vid ? "no-take" : ""} ${s.id === ed.sel ? "sel" : ""}" data-clip="${esc(s.id)}" title="컷 ${pad2(cutNo(current(), s))}${s.clip ? " 추가 클립" : ""} · ${esc((briefOf(s)?.title || s.description).slice(0, 90))}">
        <div class="clip-film"></div>
        <div class="clip-top"><b>${pad2(cutNo(current(), s))}${s.clip ? "<sup>+</sup>" : ""}</b><span>${esc(s.type)}</span></div>
        <div class="clip-bot">${!vid && e.move !== "none" ? `<span class="clip-move" title="${esc(mv.ko)}">${mv.icon}</span>` : ""}${badges}<span class="clip-dur"></span></div>
        <span class="clip-trim" data-trim title="끌어서 길이 조절"></span>
      </div>
      <button type="button" class="tl-trans t-${e.trans}" data-trans="${esc(s.id)}" title="${e.trans === "cut" ? "전환 넣기" : `${esc(transName(e.trans))} ${e.transDur}초`}"><span>${e.trans === "cut" ? "" : esc(transName(e.trans))}</span></button>`;
    }).join("") + `<div class="tl-insert" id="tlInsert" hidden></div>`;
    hydrateFilm();
    layoutTimeline();
  }

  // 클립 위치·폭, 전환 표시, 메모, 눈금자, 재생헤드를 지금 배율(pps)에 맞춘다
  function layoutTimeline() {
    const sc = $("#tlScroll");
    if (!sc) return;
    const shots = tlClips(), pps = ed.pps;
    const width = Math.max(sc.clientWidth, animaticTotal() * pps + 160);
    $("#tlCanvas").style.width = `${width}px`;
    const clips = $$("#tlTrack .tl-clip");
    const trans = new Map($$("#tlTrack .tl-trans").map((b) => [b.dataset.trans, b]));
    let t = 0;
    shots.forEach((s, i) => {
      const el = clips[i];
      if (!el) return;
      el.style.left = `${t * pps}px`;
      el.style.width = `${Math.max(3, s.duration * pps - 2)}px`;
      el.classList.toggle("narrow", s.duration * pps < 60);
      $(".clip-dur", el).textContent = `${s.duration.toFixed(1)}s`;
      const b = trans.get(s.id), e = editOf(s);
      if (b) {
        const cut = e.trans === "cut";
        b.hidden = i > 0 ? false : !(e.trans === "fade" || s.id === ed.sel);
        b.style.left = `${t * pps - (cut ? 7 : 0)}px`;
        b.style.width = `${cut ? 14 : Math.max(16, Math.min(e.transDur, s.duration) * pps - 2)}px`;
      }
      t += s.duration;
    });
    renderNotes();
    renderRuler(width);
    const z = $("#tlZoom");
    if (z) z.value = sliderFromPps(pps);
    placePlayhead();
  }

  function renderRuler(width) {
    const pps = ed.pps;
    const major = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pps >= 64) || 120;
    const minor = major / (major === 15 ? 3 : major <= 2 || major === 10 ? 5 : major === 5 ? 5 : 6);
    const ruler = $("#tlRuler");
    ruler.style.setProperty("--minor", `${minor * pps}px`);
    ruler.style.setProperty("--major", `${major * pps}px`);
    let html = "";
    for (let i = 0; i * major * pps < width; i++) {
      const t = i * major;
      html += `<span style="left:${t * pps}px">${t < 60 && major < 1 ? `${t.toFixed(1)}s` : `${Math.floor(t / 60)}:${pad2(Math.round(t % 60))}`}</span>`;
    }
    ruler.innerHTML = html;
  }

  function placePlayhead(follow) {
    const ph = $("#tlPlayhead");
    if (!ph) return;
    const x = ed.t * ed.pps;
    ph.style.transform = `translateX(${x}px)`;
    if (follow) {
      const sc = $("#tlScroll");
      if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - sc.clientWidth * 0.2;
    }
    const tc = $("#nleTc");
    if (tc) tc.textContent = timecode(ed.t);
  }

  // 클립 배경: 영상(최종 편집) · 앵커 이미지 · 스토리보드 스케치를 필름처럼 가로로 반복
  async function hydrateFilm() {
    for (const s of tlClips()) {
      const id = useVideo(s) ? s.take : anchorOf(s);
      const url = id ? await thumbUrl(id) : s.board?.svg ? svgUrl(s.board.svg) : "";
      const film = $(`#tlTrack .tl-clip[data-clip="${CSS.escape(s.id)}"] .clip-film`);
      if (film && url) film.style.backgroundImage = `url("${url}")`;
    }
  }

  // ── 타임라인 메모: 컷에 붙은 코멘트 · 고칠 점 ──
  function noteTime(p, n, mode = ed.mode) {
    const list = tlClips(p, mode), i = list.findIndex((s) => s.id === n.shotId);
    if (i < 0) return { t: Math.min(n.t, Math.max(0, list.reduce((a, s) => a + s.duration, 0) - 0.001)), i };
    return { t: clipStart(list, i) + Math.min(n.off, Math.max(0, list[i].duration - 0.001)), i, cut: cutNo(p, list[i]) };
  }

  function notesSorted(p = current(), mode = ed.mode) {
    return p.notes.map((n) => ({ n, ...noteTime(p, n, mode) })).sort((a, b) => a.t - b.t);
  }

  function renderNotes() {
    const lane = $("#tlNotes");
    if (!lane) return;
    const list = notesSorted();
    for (const x of list) if (x.i >= 0) x.n.t = x.t; // 컷이 지워져도 그 자리에 남도록 마지막 위치를 기억
    lane.innerHTML = list.map(({ n, t }, k) => `
      <button type="button" class="tl-note${n.done ? " done" : ""}${n.id === ed.note ? " sel" : ""}" data-note="${esc(n.id)}" style="left:${t * ed.pps}px" title="${timecode(t)} · ${esc(n.text || "빈 메모")}">
        <i>${k + 1}</i><span>${esc(cutText(n.text || "메모", 22))}</span></button>`).join("");
  }

  function addNote() {
    const p = current();
    if (!tlClips(p).length) return;
    stopAnimatic();
    const i = shotIndexAt(ed.t);
    const n = normalizeNote({ shotId: tlClips(p)[i].id, off: ed.t - clipStart(tlClips(p), i), t: ed.t });
    p.notes.push(n);
    save();
    Object.assign(ed, { insp: "notes", note: n.id });
    renderNotes();
    renderInspector();
    updateNoteCount();
    $(`#nleInsp [data-note-item="${n.id}"] textarea`)?.focus();
  }

  function focusNote(id, { seekTo = true } = {}) {
    const p = current(), n = p.notes.find((x) => x.id === id);
    if (!n) return;
    stopAnimatic();
    Object.assign(ed, { insp: "notes", note: id });
    if (seekTo) { seek(noteTime(p, n).t); placePlayhead(true); }
    renderNotes();
    renderInspector();
    $(`#nleInsp [data-note-item="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function updateNoteCount() {
    const notes = current().notes, open = notes.filter((n) => !n.done).length;
    const btn = $("#nle .note-add, #nleFinal .note-add");
    if (btn) btn.innerHTML = `＋ 메모${notes.length ? ` <em>${open}</em>` : ""}`;
    const tab = $(`#nleInsp [data-insp-tab="notes"]`);
    if (tab) tab.innerHTML = `메모${notes.length ? ` <em>${open}</em>` : ""}`;
  }

  // 재생 중 메모 위치를 지나면 화면 위에 잠깐 띄운다
  function showNoteAt(t) {
    const box = $("#nleNote");
    if (!box) return;
    let hit = null;
    for (const x of notesSorted()) if (!x.n.done && x.n.text && t >= x.t - 0.04 && t < x.t + 2) hit = x;
    const id = hit?.n.id || null;
    if (id === ed.noteShown && (!hit || box.dataset.text === hit.n.text)) return;
    ed.noteShown = id;
    box.hidden = !hit;
    if (hit) { box.textContent = hit.n.text; box.dataset.text = hit.n.text; }
  }

  // ── 뷰어 그리기 ──
  function frameKey(s) {
    const id = anchorOf(s);
    return id ? `m:${id}` : s.board?.svg ? `svg:${s.id}:${s.board.svg.length}` : "";
  }

  async function loadFrame(s, key) {
    if (key.startsWith("svg:")) {
      const img = new Image();
      img.src = svgUrl(s.board.svg);
      await img.decode();
      img.isSvg = true;
      return img;
    }
    const rec = await getMedia(key.slice(2));
    if (!rec || rec.kind === "video") return null;
    let bmp = await createImageBitmap(rec.blob);
    if (bmp.width > 1600) {
      const small = await createImageBitmap(rec.blob, { resizeWidth: 1600, resizeQuality: "high" });
      bmp.close();
      bmp = small;
    }
    return bmp;
  }

  function frameFor(s) {
    const key = frameKey(s);
    if (!key) return null;
    if (frames.has(key)) {
      const v = frames.get(key);
      return v instanceof Promise ? null : v;
    }
    frames.set(key, loadFrame(s, key)
      .then((f) => { frames.set(key, f); if (nleTab() && !ed.playing) drawViewer(); })
      .catch(() => frames.set(key, null)));
    return null;
  }

  // 최종 편집: 채택한 영상을 <video> 로 읽어 두고 뷰어 시간에 맞춰 그린다
  function videoFor(id) {
    let v = vids.get(id);
    if (v) return v;
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    v = { el, ready: false };
    vids.set(id, v);
    getMedia(id).then((rec) => {
      if (!rec || rec.kind !== "video") return;
      el.src = URL.createObjectURL(rec.blob);
      el.addEventListener("loadeddata", () => { v.ready = true; if (nleTab() && !ed.playing) { drawViewer(); fillTakeInfo(); } }, { once: true });
      el.addEventListener("seeked", () => { if (nleTab() && !ed.playing) drawViewer(); });
    }).catch(() => {});
    return v;
  }

  // 컷 안의 u초 → 영상 원본의 몇 초 (속도 · 리버스). 영상이 모자라면 끝 프레임에서 멈춘다
  function srcTime(s, u, len) {
    const e = editOf(s), span = Math.min(s.duration * e.speed, len);
    const t = e.reverse ? span - u * e.speed : Math.min(u * e.speed, span);
    return Math.max(0, Math.min(t, len - 0.04));
  }

  // 영상 길이 (메타데이터가 없는 webm 등은 모름 → 충분히 길다고 본다)
  const vidLen = (el) => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);

  function syncVideo(v, s, u) {
    const el = v.el, len = vidLen(el) || 1e6;
    const e = editOf(s), t = srcTime(s, u, len);
    // 정방향 재생은 영상 자체를 그 속도로 틀고, 멈춤·탐색·리버스는 그 시간으로 찾아간다
    const live = ed.playing && ed.liveId === s.id && !e.reverse && u * e.speed < len - 0.06;
    if (live) {
      if (el.playbackRate !== e.speed) el.playbackRate = e.speed;
      if (el.paused) el.play().catch(() => {});
      if (Math.abs(el.currentTime - t) > 0.3) el.currentTime = t;
    } else {
      if (!el.paused) el.pause();
      if (!el.seeking && Math.abs(el.currentTime - t) > 0.5 / edFps()) el.currentTime = t;
    }
  }

  // 카메라 무빙: q = 컷 안의 진행(0~1), secs = 컷 안의 초. s = 배율, x·y = 화면 폭·높이 대비 이동
  function camAt(e, q, secs) {
    const a = e.strength, k = 0.5 * clamp01(q) + 0.5 * smooth(q), sw = 1 - 2 * k;
    switch (e.move) {
      case "push": return { s: 1 + 0.15 * a * k, x: 0, y: 0 };
      case "pull": return { s: 1 + 0.15 * a * (1 - k), x: 0, y: 0 };
      case "panR": return { s: 1 + 0.12 * a, x: 0.05 * a * sw, y: 0 };
      case "panL": return { s: 1 + 0.12 * a, x: -0.05 * a * sw, y: 0 };
      case "up": return { s: 1 + 0.12 * a, x: 0, y: -0.05 * a * sw };
      case "down": return { s: 1 + 0.12 * a, x: 0, y: 0.05 * a * sw };
      case "kenburns": return { s: 1.04 + 0.12 * a * k, x: 0.025 * a * sw, y: -0.015 * a * sw };
      case "handheld": return { s: 1.05 + 0.02 * a, x: 0.006 * a * (Math.sin(secs * 1.9) + 0.6 * Math.sin(secs * 4.3)), y: 0.005 * a * (Math.sin(secs * 2.3 + 1) + 0.5 * Math.sin(secs * 5.1)) };
      default: return { s: 1, x: 0, y: 0 };
    }
  }

  function drawClip(ctx, W, H, s, u, { alpha = 1, scale = 1, dx = 0 } = {}) {
    if (!s || alpha <= 0) return;
    let src = null, cam = null;
    if (useVideo(s)) {
      const v = videoFor(s.take);
      ed.used?.add(s.take);
      // 영상 클립은 영상 자체의 움직임을 쓰고 카메라 무빙은 넣지 않는다
      if (v.ready) { syncVideo(v, s, u); src = v.el; cam = { s: 1, x: 0, y: 0 }; }
    }
    if (!src) { src = frameFor(s); cam = camAt(editOf(s), u / s.duration, u); }
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(W / 2 + (cam.x + dx) * W, H / 2 + cam.y * H);
    ctx.scale(cam.s * scale, cam.s * scale);
    if (src?.isSvg) {
      ctx.fillStyle = "#f4f4f5";
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.drawImage(src, -W / 2, -H / 2, W, H);
    } else if (src) {
      const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
      const r = Math.max(W / sw, H / sh);
      ctx.drawImage(src, (-sw * r) / 2, (-sh * r) / 2, sw * r, sh * r);
    } else {
      ctx.fillStyle = "#1a1a1e";
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.fillStyle = "#4a4a52";
      ctx.font = `600 ${Math.round(Math.min(W, H) * 0.045)}px Pretendard, "Malgun Gothic", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(frameKey(s) || useVideo(s) ? "불러오는 중…" : "이미지 없음", 0, 0);
    }
    ctx.restore();
  }

  // 전환: 이전 컷은 마지막 모습에서 멈춘 채, 이 컷의 앞부분(전환 시간)과 겹친다. k = 0→1
  function drawTransition(ctx, W, H, type, prev, next, k, u) {
    const pu = prev ? prev.duration - 0.001 : 0;
    if (type === "fade") {
      if (!prev) return drawClip(ctx, W, H, next, u, { alpha: k });
      if (k < 0.5) drawClip(ctx, W, H, prev, pu, { alpha: 1 - 2 * k });
      else drawClip(ctx, W, H, next, u, { alpha: 2 * k - 1 });
    } else if (type === "dissolve") {
      drawClip(ctx, W, H, prev, pu);
      drawClip(ctx, W, H, next, u, { alpha: k });
    } else if (type === "wipe") {
      drawClip(ctx, W, H, prev, pu);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W * k, H);
      ctx.clip();
      drawClip(ctx, W, H, next, u);
      ctx.restore();
    } else if (type === "slide") {
      drawClip(ctx, W, H, prev, pu, { dx: -k });
      drawClip(ctx, W, H, next, u, { dx: 1 - k });
    } else if (type === "zoom") {
      drawClip(ctx, W, H, prev, pu, { scale: 1 + 0.6 * k, alpha: 1 - k });
      drawClip(ctx, W, H, next, u, { scale: 1.3 - 0.3 * k, alpha: k });
    } else drawClip(ctx, W, H, next, u);
  }

  function drawViewer() {
    const cv = $("#nleCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    const shots = tlClips();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (!shots.length) return;
    const t = Math.min(ed.t, animaticTotal() - 1e-4);
    const i = shotIndexAt(t), s = shots[i], u = t - clipStart(shots, i), e = editOf(s);
    const d = Math.min(e.transDur, s.duration);
    ed.liveId = s.id;
    ed.used = new Set();
    if (e.trans !== "cut" && u < d && (i > 0 || e.trans === "fade")) drawTransition(ctx, W, H, e.trans, shots[i - 1], s, smooth(u / d), u);
    else drawClip(ctx, W, H, s, u);
    for (const [id, v] of vids) if (!ed.used.has(id) && !v.el.paused) v.el.pause();
    showNoteAt(t);
    if (ed.shown !== i) {
      ed.shown = i;
      const label = $("#nleCut");
      if (label) label.textContent = `${pad2(i + 1)} · ${briefOf(s)?.title || s.type}`;
      $$("#tlTrack .tl-clip").forEach((el, j) => el.classList.toggle("live", j === i));
    }
  }

  // ── 재생 ──
  function tick(now) {
    ed.t += (now - ed.last) / 1000;
    ed.last = now;
    const total = animaticTotal();
    if (ed.stopAt != null && ed.t >= ed.stopAt) {
      ed.t = Math.min(ed.stopAt, total - 0.001);
      stopAnimatic();
    } else if (ed.t >= total) {
      if (ed.loop) ed.t = 0;
      else { ed.t = total - 0.001; stopAnimatic(); }
    }
    drawViewer();
    placePlayhead(true);
    if (ed.playing) ed.raf = requestAnimationFrame(tick);
  }

  function play({ from, until } = {}) {
    const total = animaticTotal();
    if (!total || !$("#nleCanvas")) return;
    cancelAnimationFrame(ed.raf);
    if (from != null) ed.t = Math.max(0, from);
    else if (ed.t >= total - 0.01) ed.t = 0;
    ed.stopAt = until ?? null;
    ed.playing = true;
    ed.last = performance.now();
    $("#nlePlay")?.classList.add("playing");
    ed.raf = requestAnimationFrame(tick);
  }

  function stopAnimatic() {
    cancelAnimationFrame(ed.raf);
    ed.playing = false;
    ed.stopAt = null;
    for (const v of vids.values()) if (!v.el.paused) v.el.pause();
    $("#nlePlay")?.classList.remove("playing");
  }

  function seek(t) {
    ed.t = Math.max(0, Math.min(t, Math.max(0, animaticTotal() - 0.001)));
    drawViewer();
    placePlayhead();
  }

  // 컷 단위 이동. 뒤로 갈 때 컷 중간이면 그 컷의 처음으로
  function stepCut(dir) {
    const shots = tlClips();
    if (!shots.length) return;
    stopAnimatic();
    const i = shotIndexAt(ed.t);
    const start = clipStart(shots, i);
    const to = dir < 0 && ed.t - start > 0.25 ? i : Math.max(0, Math.min(shots.length - 1, i + dir));
    seek(clipStart(shots, to));
    placePlayhead(true);
    selectClip(shots[to].id, { seekTo: false });
  }

  function transport(cmd) {
    if (cmd === "play") return ed.playing ? stopAnimatic() : play();
    if (cmd === "start") { stopAnimatic(); seek(0); return placePlayhead(true); }
    if (cmd === "prev" || cmd === "next") return stepCut(cmd === "prev" ? -1 : 1);
    if (cmd === "loop") { ed.loop = !ed.loop; $(`[data-tp="loop"]`)?.classList.toggle("on", ed.loop); }
  }

  // 무빙·속도를 고르면 그 컷을, 전환을 고르면 전환 앞뒤를 한 번 재생해 보여 준다
  function previewClip(s) {
    const shots = tlClips(), i = shots.indexOf(s), st = clipStart(shots, i);
    play({ from: st, until: st + s.duration });
  }
  function previewTrans(s) {
    const shots = tlClips(), i = shots.indexOf(s), st = clipStart(shots, i), e = editOf(s);
    play({ from: Math.max(0, st - 0.8), until: st + Math.min(s.duration, e.transDur + 0.8) });
  }

  // ── 선택 · 인스펙터 ──
  function selectClip(id, { seekTo = true } = {}) {
    ed.sel = id;
    if (ed.insp !== "cut") ed.insp = "cut";
    $$("#tlTrack .tl-clip").forEach((el) => el.classList.toggle("sel", el.dataset.clip === id));
    const shots = tlClips(), i = shots.findIndex((s) => s.id === id);
    if (seekTo && i >= 0) {
      const st = clipStart(shots, i);
      if (ed.t < st || ed.t >= st + shots[i].duration) seek(st);
    }
    layoutTimeline();
    renderInspector();
  }

  function renderInspector() {
    const box = $("#nleInsp");
    if (!box) return;
    const notes = current().notes, open = notes.filter((n) => !n.done).length;
    box.innerHTML = `
      <div class="insp-tabs" role="tablist">
        <button type="button" role="tab" class="${ed.insp === "cut" ? "on" : ""}" data-insp-tab="cut">컷</button>
        <button type="button" role="tab" class="${ed.insp === "bin" ? "on" : ""}" data-insp-tab="bin" title="만든 ${isFinal() ? "영상·이미지" : "샷 이미지"}를 골라 넣기">소스</button>
        <button type="button" role="tab" class="${ed.insp === "notes" ? "on" : ""}" data-insp-tab="notes">메모${notes.length ? ` <em>${open}</em>` : ""}</button>
      </div>
      ${ed.insp === "notes" ? notesPanel() : ed.insp === "bin" ? binPanel() : cutPanel()}`;
    hydrateThumbs(box);
    fillTakeInfo();
  }

  // 소스: 만든 샷 이미지(편집에서는 영상도)를 컷별로 — 눌러서 고른 클립 뒤에 넣거나, 타임라인으로 끌어다 놓기
  function binPanel() {
    const p = current(), list = tlClips(p), off = new Set(arr(p.timeline?.[ed.mode]?.off));
    const used = new Map();
    list.forEach((c) => { const m = useVideo(c) ? c.take : anchorOf(c); if (m) used.set(m, (used.get(m) || 0) + 1); });
    return `<div class="insp-scroll bin">
      <p class="insp-note bin-tip">누르면 고른 클립 뒤에 들어가요. 타임라인으로 끌어다 놓아도 돼요. 숫자는 타임라인에 들어간 개수예요.</p>
      ${p.shots.map((s, i) => {
        // 영상(편집만) · 샷 이미지 · 엔드 프레임
        const media = [...(isFinal() ? s.videos.map((id) => ({ id, kind: "video" })) : []), ...s.images.map((id) => ({ id, kind: "image" })), ...s.endImages.map((id) => ({ id, kind: "image", end: true }))];
        return `<div class="bin-cut${off.has(s.id) ? " off" : ""}">
          <div class="bin-head"><b>CUT ${pad2(i + 1)}</b><span>${esc(briefOf(s)?.title || fallbackBrief(s).title || s.type)}</span>
            ${off.has(s.id) ? `<button type="button" class="link-btn" data-bin-restore="${esc(s.id)}">다시 넣기</button>` : ""}</div>
          <div class="bin-grid">${media.map((m) => `<button type="button" class="bin-item ${m.kind}${used.has(m.id) ? " used" : ""}" draggable="true" data-bin="${esc(s.id)}|${esc(m.id)}|${m.kind}"
              title="${m.end ? "엔드 프레임 · " : ""}${used.has(m.id) ? `타임라인에 ${used.get(m.id)}개 · ` : ""}눌러서 넣기 · 끌어서 원하는 자리에"><img data-img-id="${esc(m.id)}" alt="" draggable="false" />${m.kind === "video" ? "<i>▶</i>" : m.end ? "<i class=\"end\">끝</i>" : ""}${used.has(m.id) ? `<em>${used.get(m.id)}</em>` : ""}</button>`).join("")
            || `<span class="bin-empty">${isFinal() ? "영상·이미지가 없어요" : "샷 이미지·엔드 프레임이 없어요"}</span>`}</div>
        </div>`;
      }).join("")}
    </div>`;
  }

  function cutPanel() {
    const shots = tlClips(), i = shots.findIndex((s) => s.id === ed.sel), s = shots[i];
    if (!s) return "";
    const e = editOf(s), E = K.editing, anchor = anchorOf(s), vid = useVideo(s);
    const b = briefOf(s) || fallbackBrief(s);
    const transList = i === 0 ? E.transitions.filter((t) => t.id === "cut" || t.id === "fade") : E.transitions;
    const moveSec = `
        <div class="insp-sec">
          <div class="insp-label">카메라 무빙 ${!s.edit && e.move !== "none" ? "<small>스토리보드 메모에서 가져옴</small>" : ""}</div>
          <div class="chip-grid">${E.moves.map((m) => `<button type="button" class="chip ${m.id === e.move ? "on" : ""}" data-move="${m.id}"><i>${m.icon}</i>${esc(m.ko)}</button>`).join("")}</div>
          ${e.move !== "none" ? `<div class="seg" role="group" aria-label="강도"><span>강도</span>${E.strengths.map((x) => `<button type="button" class="${x.v === e.strength ? "on" : ""}" data-strength="${x.v}">${x.ko}</button>`).join("")}</div>` : ""}
        </div>`;
    const anchorSec = `
        <div class="insp-sec">
          <div class="insp-label">앵커 이미지 <small>${s.images.length > 1 ? `후보 ${s.images.length}개 중 하나` : "영상의 시작 프레임"}</small></div>
          <div class="media-grid insp-cands">
            ${s.images.map((id) => `<button type="button" class="cand ${id === anchor ? "on" : ""}" data-cand="${esc(id)}" title="${id === anchor ? "앵커 (더블클릭: 크게 보기)" : "이걸 앵커로"}"><img data-img-id="${esc(id)}" alt="" draggable="false" /><i>★</i></button>`).join("")}
            <button type="button" class="cand add" data-media-add="shot:${esc(srcShot(s).id)}|images" title="이미지 올리기 · 끌어다 놓기 · Ctrl+V">＋</button>
          </div>
          ${s.images.length ? "" : `<p class="insp-note">샷 이미지가 없어요. 지금은 스토리보드 스케치로 보여 줘요. <button type="button" class="link-btn" data-goto="shots">샷 이미지로</button></p>`}
        </div>`;
    const takeSec = `
        <div class="insp-sec">
          <div class="insp-label">영상 테이크 <small>${s.videos.length > 1 ? `${s.videos.length}개 중 하나` : ""}</small></div>
          <div class="media-grid insp-cands">
            ${s.videos.map((id) => `<button type="button" class="cand vid ${id === s.take ? "on" : ""}" data-take="${esc(id)}" title="${id === s.take ? "쓰는 영상" : "이 영상으로"}"><img data-img-id="${esc(id)}" alt="" draggable="false" /><i>▶</i></button>`).join("")}
            <button type="button" class="cand add" data-media-add="shot:${esc(srcShot(s).id)}|videos" title="영상 올리기 · 끌어다 놓기">＋</button>
          </div>
          ${vid ? `<p class="insp-note" id="takeInfo"></p>` : `<p class="insp-note">영상이 없어 앵커 이미지로 보여 줘요. <button type="button" class="link-btn" data-goto="video">영상화로</button></p>`}
        </div>`;
    const speedSec = `
        <div class="insp-sec">
          <div class="insp-label">속도 <small>바꾸면 같은 영상 구간을 쓰도록 컷 길이도 맞춰져요</small></div>
          <div class="chip-grid speed-grid">${E.speeds.map((v) => `<button type="button" class="chip ${v === e.speed ? "on" : ""}" data-speed="${v}">${fmtSpeed(v)}</button>`).join("")}
            <label class="speed-custom" title="직접 입력"><input type="number" id="inspSpeed" min="0.1" max="4" step="0.05" value="${e.speed}" aria-label="속도(배)" />×</label></div>
          <button type="button" class="chip wide ${e.reverse ? "on" : ""}" data-reverse aria-pressed="${e.reverse}"><i>◀◀</i>거꾸로 재생 (리버스)</button>
        </div>`;
    return `
      <div class="insp-head">
        <span class="insp-no">CUT ${pad2(cutNo(current(), s))}</span><span class="insp-type">${s.clip ? "추가 클립 · " : ""}${esc(s.type)}</span><span class="spacer"></span>
        <button type="button" class="tbtn sm text clip-out" data-clip-remove title="타임라인에서 빼기 (Delete) — 컷·이미지는 그대로">빼기</button>
        <button type="button" class="tbtn sm" data-cut-nav="-1" ${i === 0 ? "disabled" : ""} aria-label="이전 컷">‹</button>
        <button type="button" class="tbtn sm" data-cut-nav="1" ${i === shots.length - 1 ? "disabled" : ""} aria-label="다음 컷">›</button>
      </div>
      <div class="insp-scroll">
        ${s.description ? `<p class="insp-desc" data-expand title="눌러서 컷 설명 전체 보기"><span class="sum">${b.title ? `<b>${esc(b.title)}</b> ` : ""}${esc(b.points.join(" · "))}</span><span class="full">${esc(s.description)}</span></p>` : ""}
        ${isFinal() && !(s.clip && !vid) ? takeSec : anchorSec}
        <div class="insp-sec">
          <div class="insp-label">길이</div>
          <div class="stepper"><button type="button" data-dur-step="-0.5" aria-label="0.5초 줄이기">−</button><input type="number" id="inspDur" min="0.2" max="30" step="0.1" value="${s.duration}" aria-label="길이(초)" /><span>초</span><button type="button" data-dur-step="0.5" aria-label="0.5초 늘리기">＋</button></div>
        </div>
        ${vid ? speedSec : moveSec}
        <div class="insp-sec">
          <div class="insp-label">들어오는 전환 <small>${i === 0 ? "영상 시작" : `${pad2(i)} → ${pad2(i + 1)}`}</small></div>
          <div class="chip-grid">${transList.map((t) => `<button type="button" class="chip ${t.id === e.trans ? "on" : ""}" data-trans-pick="${t.id}">${esc(t.ko)}</button>`).join("")}</div>
          ${e.trans !== "cut" ? `<label class="range-row"><span>시간</span><input type="range" id="inspTransDur" min="0.1" max="${Math.min(2, s.duration)}" step="0.1" value="${Math.min(e.transDur, s.duration)}" /><output>${Math.min(e.transDur, s.duration).toFixed(1)}초</output></label>` : ""}
        </div>
        <p class="insp-note">${isFinal() ? "속도·리버스·전환·메모는 AE 패키지에 타임 리맵·키프레임·마커로 들어가요." : "무빙·전환은 AE 패키지에 키프레임으로 들어가요."}</p>
      </div>`;
  }

  function notesPanel() {
    const list = notesSorted();
    const open = list.filter((x) => !x.n.done).length;
    return `
      <div class="insp-scroll notes-panel">
        <div class="notes-top"><button type="button" class="btn small" data-note-add>＋ ${timecode(ed.t)}에 메모</button>
          <span class="hint">${list.length ? `남은 ${open} · 해결 ${list.length - open}` : "M 키로도 추가"}</span></div>
        ${list.length ? list.map(({ n, t, i, cut }, k) => `
          <div class="note-item${n.id === ed.note ? " sel" : ""}${n.done ? " done" : ""}" data-note-item="${esc(n.id)}">
            <div class="note-meta"><span class="note-no">${k + 1}</span><button type="button" class="note-tc" data-note-go title="이 위치로">${timecode(t)}</button><span class="note-cut">${i >= 0 ? `CUT ${pad2(cut)}` : "지운 컷"}</span><span class="spacer"></span>
              <button type="button" class="tbtn sm" data-note-done title="${n.done ? "다시 열기" : "해결로 표시"}">${n.done ? "↺" : "✓"}</button>
              <button type="button" class="tbtn sm" data-note-del title="지우기">✕</button></div>
            <textarea data-note-text rows="2" placeholder="코멘트 · 고칠 점 (예: 여기서 컷 더 빨리, 색이 너무 탁함)">${esc(n.text)}</textarea>
          </div>`).join("") : `<div class="notes-empty"><p>아직 메모가 없어요.</p><p>재생하다 고칠 곳에서 <b>M</b>을 누르거나 위 버튼을 누르면 그 위치에 메모가 꽂혀요. 메모는 컷에 붙어 있어 순서를 바꿔도 따라가요.</p></div>`}
      </div>`;
  }

  // 쓰는 영상의 길이 · 쓰는 구간 안내 (영상이 짧으면 길이 맞추기)
  function fillTakeInfo() {
    const el = $("#takeInfo");
    if (!el) return;
    const s = tlClips().find((x) => x.id === ed.sel);
    if (!s?.take) return;
    const v = videoFor(s.take), len = v.ready ? vidLen(v.el) : 0;
    if (!v.ready) { el.textContent = "영상을 불러오는 중…"; return; }
    if (!len) { el.textContent = `${fmtSpeed(editOf(s).speed)}${editOf(s).reverse ? " · 거꾸로" : ""} (영상 길이 정보가 없는 파일이에요)`; return; }
    const e = editOf(s), need = s.duration * e.speed, fit = Math.round((len / e.speed) * 10) / 10;
    el.innerHTML = `원본 ${len.toFixed(1)}초 중 ${Math.min(need, len).toFixed(1)}초 사용${e.speed !== 1 ? ` · ${fmtSpeed(e.speed)}` : ""}${e.reverse ? " · 거꾸로" : ""}
      ${need > len + 0.05 ? `<br>끝 ${(s.duration - len / e.speed).toFixed(1)}초는 마지막 프레임에서 멈춰요.` : ""}
      ${Math.abs(fit - s.duration) >= 0.1 && fit <= 30 ? ` <button type="button" class="link-btn" data-fit-take="${fit}">영상 길이에 맞추기 (${fit}초)</button>` : ""}`;
  }

  function setEdit(s, patch) {
    s.edit = normEdit({ ...editOf(s), ...patch });
    save();
    buildClips();
    renderInspector();
    drawViewer();
  }

  function setDuration(s, v) {
    if (!(v > 0)) return renderInspector();
    s.duration = Math.min(30, Math.max(0.2, Math.round(v * 10) / 10));
    save();
    renderNle();
    renderNav();
  }

  // 속도: 같은 영상 구간을 쓰도록 길이를 맞춘다 (2배속이면 길이 절반)
  function setSpeed(s, v) {
    const e = editOf(s);
    v = Math.min(4, Math.max(0.1, Math.round(v * 100) / 100));
    if (!(v > 0) || v === e.speed) return renderInspector();
    s.duration = Math.min(30, Math.max(0.2, Math.round(((s.duration * e.speed) / v) * 10) / 10));
    s.edit = normEdit({ ...e, speed: v });
    save();
    renderNle();
    renderNav();
    previewClip(s);
    toast(`${fmtSpeed(v)} · 컷 길이 ${s.duration}초`);
  }

  // 같은 편집기를 애니메틱(#nle)과 편집(#nleFinal) 두 탭에 띄우므로, 이벤트는 탭에서 받아 편집기 안의 것만 처리한다
  function nleOn(type, fn, opts) {
    for (const host of [$("#tab-select"), $("#tab-edit")]) host.addEventListener(type, (e) => { if (e.target.closest?.(".nle")) fn(e); }, opts);
  }

  nleOn("click", (e) => {
    const tp = e.target.closest("[data-tp]");
    if (tp) return transport(tp.dataset.tp);
    const z = e.target.closest("[data-zoom]");
    if (z) return setZoom(ed.pps * (Number(z.dataset.zoom) > 0 ? 1.4 : 1 / 1.4));
    if (e.target.closest("[data-zoom-fit]")) { fitZoom(); layoutTimeline(); $("#tlScroll").scrollLeft = 0; return; }
    const tab = e.target.closest("[data-insp-tab]");
    if (tab) { ed.insp = tab.dataset.inspTab; return renderInspector(); }
    // 소스 넣기 · 다시 넣기 · 빼기
    const bin = e.target.closest("[data-bin]");
    if (bin) { const [sid, mid, kind] = bin.dataset.bin.split("|"); return insertMedia(sid, mid, kind); }
    const back = e.target.closest("[data-bin-restore]");
    if (back) {
      const p = current(), T = ensureTimeline(p);
      T.off = T.off.filter((x) => x !== back.dataset.binRestore);
      save();
      ed.sel = back.dataset.binRestore;
      renderNle();
      return toast("컷을 원래 자리에 다시 넣었어요");
    }
    if (e.target.closest("[data-clip-remove]")) return removeClip(ed.sel);
    if (e.target.closest("[data-note-add]")) return addNote();
    const nav = e.target.closest("[data-cut-nav]");
    if (nav) return stepCut(Number(nav.dataset.cutNav));
    // 메모
    const item = e.target.closest("[data-note-item]");
    if (item) {
      const p = current(), n = p.notes.find((x) => x.id === item.dataset.noteItem);
      if (!n) return;
      if (e.target.closest("[data-note-go]")) return focusNote(n.id);
      if (e.target.closest("[data-note-done]")) { n.done = !n.done; save(); renderNotes(); renderInspector(); return updateNoteCount(); }
      if (e.target.closest("[data-note-del]")) {
        if (n.text && !confirm("이 메모를 지울까요?")) return;
        p.notes = p.notes.filter((x) => x !== n);
        save();
        renderNotes();
        renderInspector();
        return updateNoteCount();
      }
      if (ed.note !== n.id) { ed.note = n.id; $$("#nleInsp .note-item").forEach((el) => el.classList.toggle("sel", el === item)); renderNotes(); }
      return;
    }
    const s = tlClips().find((x) => x.id === ed.sel);
    if (!s) return;
    const cand = e.target.closest("[data-cand]");
    if (cand) {
      if (s.pick === cand.dataset.cand) return;
      s.pick = cand.dataset.cand;
      save();
      buildClips();
      renderInspector();
      drawViewer();
      return renderNav();
    }
    const take = e.target.closest("[data-take]");
    if (take) {
      if (s.take === take.dataset.take) return;
      s.take = take.dataset.take;
      save();
      buildClips();
      renderInspector();
      drawViewer();
      return renderNav();
    }
    const fit = e.target.closest("[data-fit-take]");
    if (fit) return setDuration(s, Number(fit.dataset.fitTake));
    const exp = e.target.closest("[data-expand]");
    if (exp) return exp.classList.toggle("open");
    const step = e.target.closest("[data-dur-step]");
    if (step) return setDuration(s, s.duration + Number(step.dataset.durStep));
    const sp = e.target.closest("[data-speed]");
    if (sp) return setSpeed(s, Number(sp.dataset.speed));
    if (e.target.closest("[data-reverse]")) { setEdit(s, { reverse: !editOf(s).reverse }); return previewClip(s); }
    const mv = e.target.closest("[data-move]");
    if (mv) { setEdit(s, { move: mv.dataset.move }); return mv.dataset.move !== "none" && previewClip(s); }
    const st = e.target.closest("[data-strength]");
    if (st) { setEdit(s, { strength: Number(st.dataset.strength) }); return previewClip(s); }
    const tr = e.target.closest("[data-trans-pick]");
    if (tr) { setEdit(s, { trans: tr.dataset.transPick }); return tr.dataset.transPick !== "cut" && previewTrans(s); }
  });

  nleOn("dblclick", (e) => {
    const cand = e.target.closest("[data-cand], [data-take]");
    if (cand) openLightbox(cand.dataset.cand || cand.dataset.take);
  });

  nleOn("input", (e) => {
    if (e.target.id === "tlZoom") return setZoom(ppsFromSlider(Number(e.target.value)));
    const nt = e.target.closest("[data-note-text]");
    if (nt) {
      const n = current().notes.find((x) => x.id === nt.closest("[data-note-item]").dataset.noteItem);
      if (!n) return;
      n.text = nt.value;
      save();
      renderNotes();
      ed.noteShown = null;
      return;
    }
    const s = tlClips().find((x) => x.id === ed.sel);
    if (e.target.id === "inspTransDur" && s) {
      const v = Number(e.target.value);
      s.edit = normEdit({ ...editOf(s), transDur: v });
      save();
      e.target.nextElementSibling.textContent = `${v.toFixed(1)}초`;
      layoutTimeline();
      drawViewer();
    }
  });

  nleOn("change", (e) => {
    const s = tlClips().find((x) => x.id === ed.sel);
    if (!s) return;
    if (e.target.id === "inspDur") setDuration(s, Number(e.target.value));
    if (e.target.id === "inspSpeed") setSpeed(s, Number(e.target.value));
    if (e.target.id === "inspTransDur") { buildClips(); previewTrans(s); }
  });

  // ── 타임라인 마우스 조작: 탐색(눈금자·빈 곳) · 클립 끌어 순서 · 클립 끝 끌어 길이 · 메모 끌어 옮기기 ──
  let tlDrag = null;
  nleOn("pointerdown", (e) => {
    const sc = e.target.closest("#tlScroll");
    if (!sc || e.button !== 0) return;
    const canvas = $("#tlCanvas");
    const xOf = (ev) => ev.clientX - canvas.getBoundingClientRect().left;
    const shots = tlClips();
    const trans = e.target.closest("[data-trans]");
    if (trans) {
      stopAnimatic();
      selectClip(trans.dataset.trans);
      const sec = $$("#nleInsp .insp-sec").at(-1);
      sec?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      sec?.classList.add("flash");
      setTimeout(() => sec?.classList.remove("flash"), 900);
      return;
    }
    const note = e.target.closest("[data-note]");
    const clip = e.target.closest(".tl-clip");
    e.preventDefault();
    if (note) {
      stopAnimatic();
      tlDrag = { mode: "note", id: note.dataset.note, x0: e.clientX, moved: false, xOf };
    } else if (clip && e.target.closest("[data-trim]")) {
      const s = shots.find((x) => x.id === clip.dataset.clip);
      stopAnimatic();
      tlDrag = { mode: "trim", s, x0: e.clientX, d0: s.duration };
      if (ed.sel !== s.id) selectClip(s.id, { seekTo: false });
      document.body.classList.add("tl-resizing");
    } else if (clip) {
      tlDrag = { mode: "clip", id: clip.dataset.clip, el: clip, x0: e.clientX, moved: false, xOf, sc0: sc.scrollLeft };
    } else {
      stopAnimatic();
      tlDrag = { mode: "scrub", xOf };
      seek(xOf(e) / ed.pps);
    }
    sc.setPointerCapture(e.pointerId);
  });

  nleOn("pointermove", (e) => {
    if (!tlDrag) return;
    if (tlDrag.mode === "scrub") return seek(tlDrag.xOf(e) / ed.pps);
    if (tlDrag.mode === "note") {
      if (!tlDrag.moved && Math.abs(e.clientX - tlDrag.x0) < 4) return;
      tlDrag.moved = true;
      // 놓는 자리의 컷에 다시 붙인다
      const p = current(), n = p.notes.find((x) => x.id === tlDrag.id);
      if (!n) return;
      const t = Math.max(0, Math.min(tlDrag.xOf(e) / ed.pps, animaticTotal() - 0.001));
      const i = shotIndexAt(t);
      Object.assign(n, { shotId: tlClips(p)[i].id, off: t - clipStart(tlClips(p), i), t });
      ed.note = n.id;
      renderNotes();
      seek(t);
      return;
    }
    if (tlDrag.mode === "trim") {
      let d = tlDrag.d0 + (e.clientX - tlDrag.x0) / ed.pps;
      d = Math.round(d * 10) / 10;
      if (Math.abs(d - Math.round(d)) * ed.pps < 6) d = Math.round(d); // 정수 초에 붙는다
      tlDrag.s.duration = Math.min(30, Math.max(0.2, d));
      layoutTimeline();
      drawViewer();
      return;
    }
    const sc = $("#tlScroll");
    const dx = e.clientX - tlDrag.x0 + (sc.scrollLeft - tlDrag.sc0);
    if (!tlDrag.moved && Math.abs(dx) < 5) return;
    if (!tlDrag.moved) { tlDrag.moved = true; tlDrag.el.classList.add("dragging"); stopAnimatic(); }
    tlDrag.el.style.transform = `translateX(${dx}px)`;
    // 끌고 있는 클립을 뺀 나머지 중, 가운데가 포인터보다 왼쪽인 클립 수 = 들어갈 자리
    const shots = tlClips(), from = shots.findIndex((s) => s.id === tlDrag.id);
    const x = tlDrag.xOf(e) / ed.pps;
    let t = 0, to = 0;
    for (const s of shots) {
      if (s.id === tlDrag.id) continue;
      if (t + s.duration / 2 < x) to++;
      t += s.duration;
    }
    tlDrag.to = to;
    const ins = $("#tlInsert");
    ins.hidden = to === from;
    ins.style.left = `${clipStart(shots, to < from ? to : to + 1) * ed.pps - 2}px`;
    const r = sc.getBoundingClientRect();
    if (e.clientX > r.right - 40) sc.scrollLeft += 14;
    else if (e.clientX < r.left + 40) sc.scrollLeft -= 14;
  });

  function endTlDrag() {
    if (!tlDrag) return;
    const d = tlDrag;
    tlDrag = null;
    document.body.classList.remove("tl-resizing");
    if (d.mode === "note") {
      if (d.moved) { save(); return renderInspector(); }
      return focusNote(d.id);
    }
    if (d.mode === "trim") { save(); renderNle(); return renderNav(); }
    if (d.mode !== "clip") return;
    if (!d.moved) { stopAnimatic(); return selectClip(d.id); }
    const from = tlClips().findIndex((s) => s.id === d.id);
    if (d.to == null || !moveClip(d.id, d.to)) return renderNle();
    save();
    renderNle();
    toast(`클립 ${from + 1} → ${d.to + 1}번째로 옮겼어요${isFinal() ? "" : " (컷 순서도 같이)"}`);
  }
  nleOn("pointerup", endTlDrag);
  nleOn("pointercancel", endTlDrag);

  // 소스 → 타임라인 끌어다 놓기: 놓는 자리(클립 가운데 기준)에 들어간다
  let binDrag = null;
  const binDropIndex = (e) => {
    const x = (e.clientX - $("#tlCanvas").getBoundingClientRect().left) / ed.pps, list = tlClips();
    let t = 0, to = 0;
    for (const c of list) { if (t + c.duration / 2 < x) to++; t += c.duration; }
    return to;
  };
  nleOn("dragstart", (e) => {
    const b = e.target.closest?.("[data-bin]");
    if (!b) return;
    binDrag = b.dataset.bin;
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", "ams-bin");
  });
  nleOn("dragend", () => { binDrag = null; const ins = $("#tlInsert"); if (ins) ins.hidden = true; });
  nleOn("dragover", (e) => {
    if (!binDrag || !e.target.closest("#tlScroll")) return;
    e.preventDefault();
    const to = binDropIndex(e), ins = $("#tlInsert");
    ins.hidden = false;
    ins.style.left = `${clipStart(tlClips(), to) * ed.pps - 2}px`;
  });
  nleOn("drop", (e) => {
    if (!binDrag || !e.target.closest("#tlScroll")) return;
    e.preventDefault();
    const [sid, mid, kind] = binDrag.split("|");
    binDrag = null;
    insertMedia(sid, mid, kind, binDropIndex(e));
  });

  // 휠: 타임라인 가로 스크롤, Ctrl+휠: 마우스 위치 기준 확대/축소
  nleOn("wheel", (e) => {
    const sc = e.target.closest("#tlScroll");
    if (!sc) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(ed.pps * Math.pow(1.0018, -e.deltaY), e.clientX - sc.getBoundingClientRect().left);
    } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      sc.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // 단축키 (애니메틱 · 편집 화면, 글 입력 중이 아닐 때)
  document.addEventListener("keydown", (e) => {
    if (!nleTab() || !tlClips().length) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]") || $("dialog[open]")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === " ") { e.preventDefault(); return transport("play"); }
    if (e.code === "KeyM") { e.preventDefault(); return addNote(); }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); return removeClip(ed.sel); }
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      stopAnimatic();
      seek(ed.t + (k === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / edFps()));
      return placePlayhead(true);
    }
    if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); return stepCut(k === "ArrowUp" ? -1 : 1); }
    if (k === "Home" || k === "End") { e.preventDefault(); stopAnimatic(); seek(k === "Home" ? 0 : animaticTotal()); return placePlayhead(true); }
    if (k === "+" || k === "=") return setZoom(ed.pps * 1.4);
    if (k === "-") return setZoom(ed.pps / 1.4);
  });

  window.addEventListener("resize", () => { if (nleTab()) layoutTimeline(); });

  // ── 7 영상화 ─────────────────────────────────────
  // 영상화: 왼쪽 = 컷 목록(상태 한눈에), 오른쪽 = 고른 컷 작업 공간(시작 → 끝 프레임 · 모델·길이·사이즈 · 프롬프트 · 결과)
  let vxSel = null;
  function vxPromptState(s) {
    if (str(s.ven) && !isStale({ obj: s, ko: "vko", en: "ven" })) return ["ok", "프롬프트"];
    if (str(s.vko)) return ["warn", "영문화 전"];
    return ["", "프롬프트 없음"];
  }

  function renderVideo() {
    const p = current();
    const shots = p.shots;
    const takes = shots.filter((s) => s.take).length;
    if (!shots.length) {
      $("#videoBody").innerHTML = `<div class="card empty-inline"><p>컷이 없어요. 스토리보드에서 컷을 먼저 만들어 주세요.</p><button type="button" class="btn ghost small" data-goto="board">스토리보드로</button></div>`;
      return;
    }
    if (!shots.some((s) => s.id === vxSel)) vxSel = (shots.find((s) => !s.take && anchorOf(s)) || shots[0]).id;
    const i = shots.findIndex((s) => s.id === vxSel), s = shots[i], anchor = anchorOf(s);
    const b = briefOf(s) || fallbackBrief(s), m = hfModelFor("video", s);
    const listScroll = $("#videoBody .vx-list-body")?.scrollTop || 0;
    $("#videoBody").innerHTML = `
      ${autoPromptBar("video", shots)}
      <div class="vx">
        <aside class="vx-list card" aria-label="컷 목록">
          <div class="vx-list-head"><b>컷 ${shots.length}</b><span class="vx-prog"><i style="width:${(takes / shots.length) * 100}%"></i></span><small>영상 ${takes}/${shots.length}</small></div>
          <div class="vx-list-body">${shots.map((x, k) => {
            const an = anchorOf(x), [ps, pl] = vxPromptState(x), xm = hfModelFor("video", x), z = vidSizeOf(x);
            return `<button type="button" class="vx-row${x.id === vxSel ? " on" : ""}" data-vx-sel="${esc(x.id)}">
              <span class="vx-thumb">${an ? `<img data-img-id="${esc(an)}" alt="" draggable="false" />` : `<i>앵커 없음</i>`}<b class="vx-num">${pad2(k + 1)}</b><s class="vx-dur">${x.vidSec || Math.round(x.duration)}s</s>${x.take ? `<em title="영상 있음">▶</em>` : ""}${videoGenBusy.has(x.id) ? `<span class="vx-busy"><span class="mini-spin"></span></span>` : ""}</span>
              <span class="vx-meta">
                <b><span>${pad2(k + 1)}</span>${esc((briefOf(x) || fallbackBrief(x)).title || x.type)}</b>
                <small>${esc(xm.name)} · ${x.vidSec || Math.round(x.duration)}초${z ? ` · ${sizeLabel(z)}` : ""}</small>
                <span class="vx-tags"><i class="dot ${ps}"></i>${pl}${x.videos.length ? ` · 영상 ${x.videos.length}` : ""}${endOf(x) ? " · 끝 프레임" : ""}</span>
              </span></button>`;
          }).join("")}</div>
          ${takes ? `<button type="button" class="btn small full vx-final" data-goto="edit">▶ 최종 영상 미리보기</button>` : ""}
        </aside>

        <section class="vx-detail card" data-shot-id="${esc(s.id)}" aria-label="컷 ${i + 1}">
          <header class="vx-head">
            <div class="vx-title"><span class="vx-no">CUT ${pad2(i + 1)}</span><h2>${esc(b.title || s.type)}</h2>
              ${b.points.length ? `<p>${esc(b.points.join(" · "))}</p>` : ""}</div>
            <div class="vx-nav">
              <button type="button" class="ph-btn" data-vx-step="-1" ${i ? "" : "disabled"} aria-label="이전 컷">‹</button>
              <button type="button" class="ph-btn" data-vx-step="1" ${i < shots.length - 1 ? "" : "disabled"} aria-label="다음 컷">›</button>
            </div>
          </header>

          <div class="vx-frames">
            <figure class="vx-frame">
              <figcaption>시작 프레임 ${anchor ? `<button type="button" class="link-btn" data-anchor-dl="${esc(anchor)}" data-n="${i + 1}">저장</button>` : ""}</figcaption>
              ${anchor ? `<div class="vx-img"><img data-img-id="${esc(anchor)}" alt="시작 프레임" title="크게 보기" /></div>`
                : `<button type="button" class="vx-img vx-empty" data-goto="select">앵커 이미지가 없어요<br><b>애니메틱에서 고르기 →</b></button>`}
            </figure>
            <span class="vx-arrow" aria-hidden="true">→</span>
            <figure class="vx-frame end">
              <figcaption>엔드 프레임 <small>선택</small></figcaption>
              ${anchor ? endSlot(s) : `<div class="vx-img vx-empty">시작 프레임이 있어야 해요</div>`}
            </figure>
          </div>

          <div class="vx-settings">
            <div class="cut-model">${hfPicker("video", s)}</div>
            ${vidOpts(s)}
          </div>

          ${promptCard(`shot:${s.id}:vid`, { placeholder: "시간 순서의 움직임 + 카메라 움직임 + 금지(스타일 변화 등)" })}

          <div class="vx-results">
            <div class="vx-sub"><b>결과</b><small>${s.videos.length ? `${s.videos.length}개 · ★ 고른 영상을 편집에 써요` : `${esc(m.name)}로 만들거나, 다른 곳에서 만든 영상을 올려요`}</small></div>
            <div class="cut-results">${mediaGrid(s, `shot:${s.id}`, "videos", { pickable: true, addLabel: "영상 올리기" })}${anchor ? videoGenTile(s) : ""}</div>
          </div>
        </section>
      </div>`;
    const lb = $("#videoBody .vx-list-body");
    if (lb) lb.scrollTop = listScroll;
    hydrateThumbs($("#videoBody"));
    autoBriefs(p);
  }

  $("#videoBody").addEventListener("click", (e) => {
    const dl = e.target.closest("[data-anchor-dl]");
    if (dl) return downloadMedia(dl.dataset.anchorDl, `shot${pad2(dl.dataset.n)}_start`);
    const row = e.target.closest("[data-vx-sel]");
    if (row) { vxSel = row.dataset.vxSel; return renderVideo(); }
    const step = e.target.closest("[data-vx-step]");
    if (step) {
      const shots = current().shots, k = shots.findIndex((x) => x.id === vxSel) + Number(step.dataset.vxStep);
      if (shots[k]) { vxSel = shots[k].id; renderVideo(); $(`#videoBody [data-vx-sel="${CSS.escape(vxSel)}"]`)?.scrollIntoView({ block: "nearest" }); }
    }
  });
  // ── 8 편집 · AE 패키지 ───────────────────────────
  const RES = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080] };
  const EXT = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

  function renderEdit() {
    const p = current();
    const ratio = p.plan.ratio || "16:9";
    const [w, h] = RES[ratio] || RES["16:9"];
    const opts = p.editOpts || {};
    let t = 0;
    const vids = p.shots.filter((s) => s.take).length, imgs = p.shots.filter((s) => !s.take && anchorOf(s)).length;
    p.shots.forEach((s) => { t += s.duration; });
    const openNotes = p.notes.filter((n) => !n.done).length;
    // 위: 최종 영상 편집기(러프) · 아래: AE 패키지 내보내기
    $("#editBody").innerHTML = p.shots.length ? `
      <div id="nleFinal" class="nle"></div>
      <div class="card export-card">
        <div class="export-head"><span class="export-icon" aria-hidden="true">⇩</span><div><b>After Effects 패키지</b><small>위 편집 타임라인 그대로 — 컴프 · 키프레임 · 타임 리맵 · 메모 마커까지</small></div></div>
        <p class="export-sum"><b>${p.shots.length}개 컷 · ${fmtTime(t)}</b> — 영상 ${vids} · 이미지 ${imgs}${p.shots.length - vids - imgs ? ` · 빈 컷 ${p.shots.length - vids - imgs}` : ""}${p.notes.length ? ` · 메모 ${p.notes.length}${openNotes ? ` (남은 ${openNotes})` : ""}` : ""}</p>
        <div class="row">
          <label>컴프 이름 <input id="compName" value="${esc(opts.compName || p.plan.result?.title || p.name)}" /></label>
          <label class="narrow">fps <select id="compFps">${[24, 25, 30, 60].map((f) => `<option ${Number(opts.fps || 24) === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>
        </div>
        <button type="button" id="exportAeBtn" class="btn primary-lg">AE 패키지 내보내기</button>
        <p class="hint">${w}×${h}. 압축을 풀고 AE에서 <b>파일 › 스크립트 › 스크립트 파일 실행</b>으로 <code>build_comp.jsx</code>를 열면 컷 순서대로 컴프가 만들어져요. 속도·리버스는 타임 리맵으로, 메모는 컴프 마커로 들어가요.</p>
      </div>`
      : `<div class="card empty-inline"><p>컷이 없어요.</p><button type="button" class="btn ghost small" data-goto="board">스토리보드로</button></div>`;
    if (p.shots.length) renderNle("final");
  }

  $("#editBody").addEventListener("change", (e) => {
    if (!e.target.matches("#compName, #compFps")) return;
    const p = current();
    p.editOpts = { compName: $("#compName").value, fps: Number($("#compFps").value) };
    save();
    if (e.target.id === "compFps") renderNle("final"); // 타임코드 프레임 수
  });
  $("#editBody").addEventListener("click", (e) => { if (e.target.closest("#exportAeBtn")) exportAePackage(e.target.closest("#exportAeBtn")); });

  // ExtendScript(ES3) 문자열 리터럴: 한글은 \uXXXX 로 바꿔 인코딩 문제를 피한다
  const jsx = (s) => JSON.stringify(String(s ?? "")).replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error("script"));
      document.head.appendChild(el);
    });
  }

  async function exportAePackage(btn) {
    const p = current();
    if (!p.shots.length) return;
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="mini-spin"></span>패키지 만드는 중…`;
    try {
      if (!window.JSZip) await loadScript(K.editing.jszipUrl);
      const zip = new window.JSZip();
      const ratio = p.plan.ratio || "16:9";
      const [W, H] = RES[ratio] || RES["16:9"];
      const fps = Number($("#compFps")?.value || 24);
      const compName = ($("#compName")?.value || p.name).trim() || "AI Motion";
      const items = [];
      const csv = [["cut", "start", "duration", "shot", "file", "speed", "reverse", "camera_move", "transition_in", "description", "image_prompt_en", "video_prompt_en"]];
      let t = 0;
      // 편집 타임라인 그대로 (추가 클립 포함 · 뺀 컷 제외)
      for (const [i, s] of tlClips(p, "final").entries()) {
        const id = s.take || anchorOf(s);
        let file = "", isVid = false;
        if (id) {
          const rec = await getMedia(id).catch(() => null);
          if (rec) {
            isVid = rec.kind === "video";
            file = `media/shot${pad2(i + 1)}_${isVid ? "take" : "anchor"}.${EXT[rec.type] || (isVid ? "mp4" : "png")}`;
            zip.file(file, rec.blob);
          }
        }
        const name = `${pad2(i + 1)} ${briefOf(s)?.title || s.description.split(" — ")[0] || s.type}`.slice(0, 60);
        const e = editOf(s);
        const trans = i > 0 || e.trans === "fade" ? e.trans : "cut";
        // 영상 컷: 영상 자체의 움직임을 쓰므로 카메라 무빙 대신 속도·리버스 (최종 편집 화면과 같게)
        const move = isVid ? "none" : e.move, speed = isVid ? e.speed : 1, reverse = isVid && e.reverse;
        items.push({ file, dur: s.duration, name, note: s.description, ...e, move, speed, reverse, trans });
        csv.push([i + 1, t.toFixed(2), s.duration, s.type, file, speed, reverse ? "yes" : "", move, trans === "cut" ? "cut" : `${trans} ${e.transDur}s`, s.description, s.en, s.ven]);
        t += s.duration;
      }
      // 타임라인 메모 → 컴프 마커 + notes.txt
      const notes = notesSorted(p, "final");
      const noteLines = notes.map(({ n, t: nt, i, cut }, k) => `${k + 1}. [${timecode(nt)}] ${i >= 0 ? `CUT ${pad2(cut)}` : "지운 컷"}${n.done ? " (해결)" : ""} — ${n.text || "(빈 메모)"}`);
      const script = `// AI Motion Studio - build_comp.jsx
// After Effects: 파일 > 스크립트 > 스크립트 파일 실행 으로 이 파일을 실행하세요.
(function () {
  var base = File($.fileName).parent;
  var W = ${W}, H = ${H}, FPS = ${fps}, TOTAL = ${Math.max(t, 1 / fps).toFixed(3)};
  var shots = [
${items.map((x) => `    { file: ${jsx(x.file)}, dur: ${x.dur}, name: ${jsx(x.name)}, note: ${jsx(x.note)}, move: ${jsx(x.move)}, str: ${x.strength}, trans: ${jsx(x.trans)}, td: ${x.transDur}, sp: ${x.speed}, rev: ${x.reverse} }`).join(",\n")}
  ];
  var notes = [
${notes.map(({ n, t: nt }, k) => `    { t: ${nt.toFixed(3)}, text: ${jsx(`${k + 1}. ${n.done ? "(해결) " : ""}${n.text || "메모"}`)} }`).join(",\n")}
  ];
  // 속도·리버스: 타임 리맵. 영상이 모자라면 마지막 프레임에서 멈춘다
  function applySpeed(layer, len, t0, dur, sp, rev) {
    if (sp == 1 && !rev) return;
    layer.timeRemapEnabled = true;
    var R = layer.property("Time Remap");
    var span = Math.min(dur * sp, len - 1 / FPS), t1 = t0 + span / sp;
    R.setValueAtTime(t0, rev ? span : 0);
    R.setValueAtTime(t1, rev ? 0 : span);
    if (t1 < t0 + dur - 0.001) R.setValueAtTime(t0 + dur, rev ? 0 : span);
    for (var k = R.numKeys; k >= 1; k--) {
      var kt = R.keyTime(k);
      if (Math.abs(kt - t0) > 0.001 && Math.abs(kt - t1) > 0.001 && Math.abs(kt - (t0 + dur)) > 0.001) R.removeKey(k);
    }
    layer.outPoint = Math.min(t0 + dur, TOTAL);
  }
  // 부드럽게 시작·끝나는 키프레임 (속성 차원 수에 맞춰 시도)
  function ease(prop) {
    var e = new KeyframeEase(0, 50);
    for (var k = 1; k <= prop.numKeys; k++) {
      try { prop.setTemporalEaseAtKey(k, [e], [e]); } catch (a) {
        try { prop.setTemporalEaseAtKey(k, [e, e], [e, e]); } catch (b) {
          try { prop.setTemporalEaseAtKey(k, [e, e, e], [e, e, e]); } catch (c) { /* 그대로 */ } } }
    }
  }
  // 카메라 무빙: 확대는 Scale, 팬·틸트는 Anchor Point 로 (Position 은 전환에 쓴다)
  function applyMove(layer, m, a, t0, dur, sc) {
    if (!m || m == "none") return;
    var S = layer.property("Scale"), A = layer.property("Anchor Point");
    var w = layer.source.width, h = layer.source.height, k = sc / 100, t1 = t0 + dur;
    function pan(z, fx0, fy0, fx1, fy1) {
      var ks = k * z;
      S.setValue([sc * z, sc * z]);
      A.setValueAtTime(t0, [w / 2 - fx0 * W / ks, h / 2 - fy0 * H / ks]);
      A.setValueAtTime(t1, [w / 2 - fx1 * W / ks, h / 2 - fy1 * H / ks]);
      ease(A);
    }
    var d = 0.05 * a, z = 1 + 0.12 * a;
    if (m == "push" || m == "pull") {
      var big = sc * (1 + 0.15 * a);
      S.setValueAtTime(t0, m == "push" ? [sc, sc] : [big, big]);
      S.setValueAtTime(t1, m == "push" ? [big, big] : [sc, sc]);
      ease(S);
    } else if (m == "panR") pan(z, d, 0, -d, 0);
    else if (m == "panL") pan(z, -d, 0, d, 0);
    else if (m == "up") pan(z, 0, -d, 0, d);
    else if (m == "down") pan(z, 0, d, 0, -d);
    else if (m == "kenburns") {
      S.setValueAtTime(t0, [sc * 1.04, sc * 1.04]);
      S.setValueAtTime(t1, [sc * (1.04 + 0.12 * a), sc * (1.04 + 0.12 * a)]);
      ease(S);
      var kb = k * 1.1;
      A.setValueAtTime(t0, [w / 2 - 0.025 * a * W / kb, h / 2 + 0.015 * a * H / kb]);
      A.setValueAtTime(t1, [w / 2 + 0.025 * a * W / kb, h / 2 - 0.015 * a * H / kb]);
      ease(A);
    } else if (m == "handheld") {
      var hz = sc * (1.05 + 0.02 * a);
      S.setValue([hz, hz]);
      layer.property("Position").expression = "wiggle(1.5, " + (W * 0.006 * a).toFixed(1) + ")";
    }
  }
  // 들어오는 전환: 이전 컷 레이어를 전환 시간만큼 늘려 이 컷과 겹친다
  function applyTrans(layer, prev, type, t0, d) {
    var O = layer.property("Opacity");
    if (type == "dissolve" || type == "zoom") { O.setValueAtTime(t0, 0); O.setValueAtTime(t0 + d, 100); }
    else if (type == "fade") {
      if (prev) {
        var PO = prev.property("Opacity");
        PO.setValueAtTime(t0, 100); PO.setValueAtTime(t0 + d / 2, 0);
        O.setValueAtTime(t0 + d / 2, 0); O.setValueAtTime(t0 + d, 100);
      } else { O.setValueAtTime(t0, 0); O.setValueAtTime(t0 + d, 100); }
    } else if (type == "wipe") {
      var fx = layer.property("Effects").addProperty("ADBE Linear Wipe");
      fx.property(2).setValue(270); // 왼쪽 → 오른쪽 (반대로 보이면 Wipe Angle 을 90 으로)
      fx.property(1).setValueAtTime(t0, 100); fx.property(1).setValueAtTime(t0 + d, 0);
      ease(fx.property(1));
    } else if (type == "slide") {
      var P = layer.property("Position");
      P.setValueAtTime(t0, [W * 1.5, H / 2]); P.setValueAtTime(t0 + d, [W / 2, H / 2]); ease(P);
      if (prev) { var PP = prev.property("Position"); PP.setValueAtTime(t0, [W / 2, H / 2]); PP.setValueAtTime(t0 + d, [-W / 2, H / 2]); ease(PP); }
    }
  }
  app.beginUndoGroup("AI Motion Studio");
  var proj = app.project;
  var folder = proj.items.addFolder(${jsx(`AI Motion Studio - ${compName}`)});
  var comp = proj.items.addComp(${jsx(compName)}, W, H, 1, TOTAL, FPS);
  comp.parentFolder = folder;
  var t = 0, missing = [], prev = null;
  for (var i = 0; i < shots.length; i++) {
    var s = shots[i], layer = null, sc = 100;
    if (s.file) {
      var f = new File(base.fsName + "/" + s.file);
      if (f.exists) {
        var item = proj.importFile(new ImportOptions(f));
        item.parentFolder = folder;
        layer = comp.layers.add(item);
        layer.startTime = t;
        try { layer.outPoint = Math.min(t + s.dur, TOTAL); } catch (e) { /* 영상이 컷보다 짧으면 원본 길이까지만 */ }
        sc = Math.max(W / item.width, H / item.height) * 100;
        layer.property("Scale").setValue([sc, sc]);
        if (item.duration > 0 && (s.sp != 1 || s.rev)) { try { applySpeed(layer, item.duration, t, s.dur, s.sp, s.rev); } catch (e5) { /* 속도 실패 시 원래 속도 */ } }
      } else { missing.push(s.file); }
    }
    if (!layer) {
      layer = comp.layers.addSolid([0.12, 0.12, 0.14], s.name, W, H, 1, s.dur);
      layer.startTime = t;
    }
    var td = Math.min(s.td, s.dur);
    if (s.trans != "cut" && (prev || s.trans == "fade")) {
      if (prev) { try { prev.outPoint = Math.min(t + td, TOTAL); } catch (e2) { /* 영상 원본이 짧으면 그대로 */ } }
      try { applyTrans(layer, prev, s.trans, t, td); } catch (e3) { /* 전환 실패 시 컷 */ }
    }
    try { applyMove(layer, s.move, s.str, t, s.dur, sc); } catch (e4) { /* 무빙 실패 시 고정 */ }
    prev = layer;
    layer.name = s.name;
    var mv = new MarkerValue(s.name);
    mv.comment = s.note;
    comp.markerProperty.setValueAtTime(t, mv);
    t += s.dur;
  }
  for (var n = 0; n < notes.length; n++) {
    var nm = new MarkerValue("\\uBA54\\uBAA8 " + (n + 1));
    nm.comment = notes[n].text;
    try { nm.label = 1; } catch (e6) { /* 이전 버전 AE */ }
    comp.markerProperty.setValueAtTime(Math.min(notes[n].t, TOTAL - 1 / FPS), nm);
  }
  comp.openInViewer();
  app.endUndoGroup();
  if (missing.length) alert("\\uCC3E\\uC9C0 \\uBABB\\uD55C \\uD30C\\uC77C:\\n" + missing.join("\\n"));
})();
`;
      zip.file("build_comp.jsx", "﻿" + script); // BOM: ExtendScript 가 UTF-8 로 읽게
      zip.file("shotlist.csv", "\ufeff" + csv.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n"));
      zip.file("README.txt", [
        "AI Motion Studio - After Effects 패키지",
        "",
        "1. 이 폴더의 압축을 그대로 풀어 두세요 (media 폴더와 build_comp.jsx 가 같은 위치에 있어야 해요).",
        "2. After Effects > 파일 > 스크립트 > 스크립트 파일 실행... 에서 build_comp.jsx 를 고르세요.",
        "3. 컷 순서대로 레이어와 장면 마커가 놓인 컴프가 열립니다.",
        "   애니메틱·편집에서 고른 카메라 무빙(Scale·Anchor Point)과 전환(Opacity·Position·Linear Wipe)이 키프레임으로 들어가 있어요.",
        "   영상 컷의 속도·리버스는 Time Remap 키프레임으로, 타임라인 메모는 '메모 n' 컴프 마커로 들어가 있어요.",
        "",
        "shotlist.csv: 컷별 시작 시간, 길이, 파일, 속도, 설명, 영문 프롬프트",
        notes.length ? "notes.txt: 타임라인 메모 (시간 · 컷 · 내용)" : ""
      ].join("\r\n"));
      if (notes.length) zip.file("notes.txt", "﻿" + [`${compName} — 타임라인 메모 ${notes.length}개`, "", ...noteLines].join("\r\n"));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${compName.replace(/[\\/:*?"<>|]/g, "_")}_AE.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      p.exportedAt = Date.now();
      p.editOpts = { compName, fps };
      save();
      toast("AE 패키지를 내려받았어요");
    } catch {
      toast("패키지를 만들지 못했어요. 인터넷 연결을 확인해 주세요");
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
      renderNav();
      if (activeTab() === "edit") renderEdit();
    }
  }

  // ── 남은 작업 자동 진행 ──────────────────────────
  // 기획 → 스토리보드 → 스타일프레임 → 캐릭터 시트 → 샷 프롬프트 → (샷 이미지) → 영상 프롬프트
  // 이미 된 단계는 건너뛰고, 사람이 고를 일(★)은 첫 결과를 자동 선택해 둔다.
  const AUTO_IMAGES_PREF = "ai-motion-studio:auto-images";
  const autoImagesOn = () => readLocal(AUTO_IMAGES_PREF) !== "off";
  const enFresh = (s, ko, en) => str(s[en]) && !isStale({ obj: s, ko, en });

  function importPlanChars(p) {
    (p.plan.result?.characters || []).filter((c) => !p.characters.some((x) => x.name === c.name))
      .forEach((c) => p.characters.push(normalizeChar({ name: c.name, desc: c.description })));
    save();
  }

  const AUTO_STEPS = [
    { id: "plan", label: "기획안", claude: true, done: (p) => !!p.plan.result,
      run: async (p) => {
        if (!str(p.plan.topic)) throw new Error("기획에 주제를 먼저 적어 주세요");
        if (!(await generatePlan())) throw new Error("기획안을 만들지 못했어요");
      } },
    { id: "board", label: "스토리보드", claude: true, done: (p) => p.shots.length > 0 && p.shots.every((s) => s.board?.svg),
      run: async (p) => { if (!p.shots.length) scenarioToShots(p); p.boardAutoTried = false; await autoBoard(p); } },
    // 캐릭터 시트 → 스타일프레임 순서 (스타일프레임에 고른 캐릭터 시트가 레퍼런스로 들어간다)
    { id: "chars", label: "캐릭터 시트", hf: true, stage: "chars",
      done: (p) => !!p.plan.result && (p.noChars || (p.characters.length ? p.characters.every((c) => c.pick) : !p.plan.result.characters.length)),
      run: async (p) => {
        importPlanChars(p);
        for (const c of p.characters) {
          if (autoJob?.stop) return;
          if (c.pick) continue;
          if (c.refs.length) await autoCharacterSheet(c); else await autoCharacterBase(c);
        }
      } },
    { id: "style", label: "스타일프레임", claude: true, hf: true, stage: "style", done: (p) => !!p.style.pick, run: () => autoStyleFrame() },
    { id: "prompts", label: "샷 프롬프트", claude: true, done: (p) => p.shots.length > 0 && p.shots.every((s) => enFresh(s, "ko", "en")), run: () => autoPrompts("image") },
    { id: "images", label: "샷 이미지", hf: true, optional: true, stage: "shots", done: (p) => p.shots.length > 0 && p.shots.every((s) => s.images.length),
      run: (p) => generateShotImages(p, p.shots.filter((s) => !s.images.length)) },
    { id: "vprompts", label: "영상 프롬프트", claude: true, done: (p) => p.shots.length > 0 && p.shots.every((s) => !anchorOf(s) || enFresh(s, "vko", "ven")), run: () => autoPrompts("video") }
  ];

  let autoJob = null; // { pid, steps: [{ id, label, status }], stop }

  function renderJobPanel() {
    let panel = $("#jobPanel");
    if (!autoJob) { panel?.remove(); return; }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "jobPanel";
      panel.className = "job-panel";
      document.body.appendChild(panel);
    }
    const icon = { wait: "", run: `<span class="mini-spin"></span>`, done: "✓", skip: "–", fail: "!" };
    const running = autoJob.steps.some((s) => s.status === "run" || s.status === "wait");
    panel.innerHTML = `
      <div class="job-head"><strong>${running ? "자동 진행 중" : "자동 진행 완료"}</strong>
        <button type="button" class="btn ghost small" data-job-${running ? "stop" : "close"}>${running ? (autoJob.stop ? "멈추는 중…" : "중지") : "닫기"}</button></div>
      <ol>${autoJob.steps.map((s) => `<li class="job-${s.status}"><i>${icon[s.status]}</i>${esc(s.label)}${s.note ? `<small>${esc(s.note)}</small>` : ""}</li>`).join("")}</ol>`;
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-job-stop]") && autoJob) { autoJob.stop = true; planJob?.stream?.abort(); renderJobPanel(); }
    if (e.target.closest("[data-job-close]")) { autoJob = null; renderJobPanel(); }
    if (e.target.closest("[data-autopilot]")) runAutopilot();
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-auto-images]")) writeLocal(AUTO_IMAGES_PREF, e.target.checked ? "on" : "off");
  });

  async function runAutopilot() {
    if (autoJob && autoJob.steps.some((s) => s.status === "run" || s.status === "wait")) return toast("이미 자동 진행 중이에요");
    if (aiBusy || styleBusy || sheetBusyFor || shotGenBusy.size || videoGenBusy.size) return toast("다른 AI 작업이 끝난 뒤에 눌러 주세요");
    const p = current();
    if (!aiReady()) { toast("글 작업에 쓸 AI를 AI 연결에서 골라 주세요"); return openSettings(); }
    const withImages = autoImagesOn();
    const steps = AUTO_STEPS.filter((s) => !s.optional || withImages);
    const todo = steps.filter((s) => !s.done(p));
    if (!todo.length) return toast("자동으로 할 수 있는 작업은 모두 끝났어요");
    const noHf = !["style", "chars", "shots"].some((st) => genReady(st));
    // 대략의 이미지 생성 장수 (요금 안내)
    const cuts = p.shots.length || p.plan.result?.scenario.length || 0;
    const imgs = noHf ? 0 : (todo.some((s) => s.id === "style") ? 1 : 0)
      + (todo.some((s) => s.id === "chars") ? (p.characters.length || p.plan.result?.characters.length || 0) * 2 : 0)
      + (todo.some((s) => s.id === "images") ? (p.shots.filter((s) => !s.images.length).length || cuts) : 0);
    const msg = `남은 작업 ${todo.length}단계를 자동으로 진행할까요?\n\n${todo.map((s) => `· ${s.label}`).join("\n")}` +
      (noHf ? "\n\n(이미지를 자동으로 만들 연결이 없어 이미지 단계는 건너뛰어요 — AI 연결에서 Higgsfield 또는 내 API 키 모델을 고르세요)" : imgs ? `\n\n${hfCostNote("image", imgs)}` : "") +
      `${!p.plan.result ? "" : ""}\n\n중간에 언제든 멈출 수 있어요.`;
    if (!confirm(msg)) return;

    // 앞 단계 결과에 따라 할 일이 바뀌므로(예: 기획안이 나와야 캐릭터가 생김) 실행 직전에 다시 판정한다
    autoJob = { pid: p.id, stop: false, steps: steps.map((s) => ({ id: s.id, label: s.label, status: s.done(p) ? "skip" : "wait", note: s.done(p) ? "이미 됨" : "" })) };
    $("#projectSelect").disabled = $("#newProjectBtn").disabled = true;
    renderJobPanel();
    for (const step of steps) {
      const js = autoJob.steps.find((x) => x.id === step.id);
      if (autoJob.stop) { if (js.status === "wait") { js.status = "skip"; js.note = "중지됨"; } continue; }
      if (step.hf && (step.stage ? !genReady(step.stage) && !isWebModel(hfModelFor(step.stage)) : noHf)) { js.status = "skip"; js.note = "자동 생성 연결 없음"; renderJobPanel(); continue; }
      if (step.stage && isWebModel(hfModelFor(step.stage))) { js.status = "skip"; js.note = `${hfModelFor(step.stage).name} — 직접`; renderJobPanel(); continue; }
      if (step.done(p)) { js.status = "skip"; js.note = "이미 됨"; renderJobPanel(); continue; }
      js.status = "run";
      renderJobPanel();
      try {
        await step.run(p);
        js.status = step.done(p) ? "done" : "fail";
        if (js.status === "fail") js.note = "일부만 됨";
      } catch (err) {
        js.status = "fail";
        js.note = aiErrorText(err);
        if (step.id === "plan" || step.id === "board") autoJob.stop = true; // 기획·컷이 없으면 뒤 단계는 의미 없음
      }
      renderJobPanel();
      renderActive();
    }
    $("#projectSelect").disabled = $("#newProjectBtn").disabled = false;
    renderJobPanel();
    renderActive();
    const [nextId] = nextAction(p, stageStatus(p));
    toast(autoJob.stop ? "자동 진행을 멈췄어요" : `자동 진행을 마쳤어요. 다음: ${K.steps[stepIndex(nextId)].title}`);
  }

  // ── 컷 순서 드래그 앤 드롭 (스토리보드 · 샷 이미지 · 애니메틱 · 영상화 공통) ──
  // [data-drag-handle] 을 잡고 다른 컷 카드([data-shot-id]) 위에 놓으면 그 앞/뒤로 옮긴다.
  let dragShot = null; // { id, horizontal }
  const clearDropMarks = () => $$(".drop-before, .drop-after").forEach((el) => el.classList.remove("drop-before", "drop-after"));
  // 카드가 가로로 나열된 곳(스토리보드 그리드)은 좌우, 세로 목록은 위아래로 판단
  const dropSide = (card, e) => {
    const r = card.getBoundingClientRect();
    return dragShot.horizontal ? (e.clientX > r.left + r.width / 2 ? "after" : "before") : (e.clientY > r.top + r.height / 2 ? "after" : "before");
  };

  document.addEventListener("dragstart", (e) => {
    const handle = e.target.closest?.("[data-drag-handle]");
    const card = handle?.closest("[data-shot-id]");
    if (!card) return;
    dragShot = { id: card.dataset.shotId, horizontal: !!card.closest(".board-grid") };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-shot", dragShot.id);
    const r = card.getBoundingClientRect();
    e.dataTransfer.setDragImage(card, Math.min(60, r.width / 2), 24);
    requestAnimationFrame(() => card.classList.add("dragging"));
  });

  document.addEventListener("dragover", (e) => {
    if (!dragShot) return;
    const card = e.target.closest?.(".panel.active [data-shot-id]");
    clearDropMarks();
    if (!card || card.dataset.shotId === dragShot.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    card.classList.add(`drop-${dropSide(card, e)}`);
  });

  document.addEventListener("drop", (e) => {
    if (!dragShot) return;
    const card = e.target.closest?.(".panel.active [data-shot-id]");
    if (!card || card.dataset.shotId === dragShot.id) return;
    e.preventDefault();
    const shots = current().shots;
    const from = shots.findIndex((s) => s.id === dragShot.id);
    if (from < 0) return;
    const [moved] = shots.splice(from, 1);
    let to = shots.findIndex((s) => s.id === card.dataset.shotId);
    if (dropSide(card, e) === "after") to++;
    shots.splice(to, 0, moved);
    save();
    clearDropMarks();
    renderActive();
    toast(`컷 ${from + 1} → ${to + 1}번으로 옮겼어요`);
  });

  document.addEventListener("dragend", () => {
    dragShot = null;
    clearDropMarks();
    $$(".dragging").forEach((el) => el.classList.remove("dragging"));
  });

  // ── 렌더링 진입점 ────────────────────────────────
  const RENDER = {
    home: renderHome, plan: renderPlan, style: renderStyle, chars: renderChars, board: renderBoard, shots: renderShotsStage,
    select: renderSelect, video: renderVideo, edit: renderEdit
  };

  function renderActive() {
    if (undo.pid !== current().id) {
      staleShotPrompts(current()); // 프로젝트를 열면 샷 프롬프트 자동 반영 기준을 잡는다 (바뀌기 전에)
      trackUndo(); // 되돌리기 기준
    }
    RENDER[activeTab()]?.();
    renderNav();
    renderBackSync();
    renderPlanSync();
    renderTermDock();
    refreshFocus();
  }

  function renderAll() {
    renderProjects();
    renderActive();
  }

  initPlanForm();
  renderStageNext();
  setPageHead($(".tab.active"));
  renderAll();
  renderAiStatus();
  checkBridge(); // start.cmd 로 열었으면 연결 프로그램(구독 Claude + Higgsfield)을 쓴다
})();
