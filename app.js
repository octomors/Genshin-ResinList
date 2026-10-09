(() => {
  "use strict";
  const API_ROOT = "https://gi.yatta.moe/api/v2/en";
  const IMAGE_ROOT = "https://gi.yatta.moe/assets/UI";
  const ENKA_IMAGE_ROOT = "https://enka.network/ui";
  const CATALOG_KEY = "genshin-notes.catalog.v1";
  const NOTES_KEY = "genshin-notes.notes.v1";
  const THEME_KEY = "genshin-notes.theme.v1";
  const state = { catalog: [], notes: loadNotes(), draggedId: null };
  const form = document.querySelector("#note-form");
  const input = document.querySelector("#note-input");
  const status = document.querySelector("#status");
  const notesElement = document.querySelector("#notes");
  const settingsButton = document.querySelector("#settings-button");
  const settingsDialog = document.querySelector("#settings-dialog");
  const themeSelect = document.querySelector("#theme-select");
  const infoButton = document.querySelector("#info-button");
  const infoDialog = document.querySelector("#info-dialog");

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeSelect.value = theme;
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  }
  function loadTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (!stored) return "dark";
      const theme = JSON.parse(stored);
      return typeof theme === "string" ? theme : "dark";
    } catch (error) {
      const legacyTheme = localStorage.getItem(THEME_KEY);
      if (legacyTheme) {
        localStorage.setItem(THEME_KEY, JSON.stringify(legacyTheme));
        return legacyTheme;
      }
      console.warn("Could not read the saved theme.", error);
      return "dark";
    }
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = `status${kind ? ` ${kind}` : ""}`;
  }
  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(`Could not read ${key} from localStorage.`, error);
      return fallback;
    }
  }
  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      setStatus("Changes could not be saved in this browser.", "error");
      console.warn(`Could not write ${key} to localStorage.`, error);
    }
  }
  function migrateImageUrl(image) {
    return image?.replace("https://gi.yatta.moe/images/avatar/", `${IMAGE_ROOT}/`)
      .replace("https://gi.yatta.moe/images/weapon/", `${IMAGE_ROOT}/`)
      .replace(`${IMAGE_ROOT}/avatar/`, `${IMAGE_ROOT}/`)
      .replace(`${IMAGE_ROOT}/weapon/`, `${IMAGE_ROOT}/`);
  }
  function loadNotes() {
    const notes = readStorage(NOTES_KEY, []);
    return Array.isArray(notes) ? notes.filter(note => note && note.id && note.title).map(note => ({
      ...note, image: migrateImageUrl(note.image)
    })) : [];
  }
  function normalize(value) {
    return value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
  }
  function imageFor(item) {
    return `${IMAGE_ROOT}/${encodeURIComponent(item.icon)}.png`;
  }
  function toCatalog(kind, payload) {
    return Object.values(payload?.data?.items || {}).filter(item => item?.name && item?.icon).map(item => ({
      id: `${kind}-${item.id}`, kind, name: item.name, icon: item.icon, image: imageFor(item)
    }));
  }
  async function fetchCatalog() {
    const [avatarResponse, weaponResponse] = await Promise.all([
      fetch(`${API_ROOT}/avatar`), fetch(`${API_ROOT}/weapon`)
    ]);
    if (!avatarResponse.ok || !weaponResponse.ok) throw new Error("The catalog request failed.");
    const [avatars, weapons] = await Promise.all([avatarResponse.json(), weaponResponse.json()]);
    const catalog = [...toCatalog("character", avatars), ...toCatalog("weapon", weapons)];
    if (!catalog.length) throw new Error("The API returned an empty catalog.");
    return catalog;
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const saved = previous[j];
        previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = saved;
      }
    }
    return 1 - previous[b.length] / Math.max(a.length, b.length);
  }
  function bestMatch(word) {
    const target = normalize(word);
    if (!target) return null;
    let best = null;
    for (const item of state.catalog) {
      const candidate = normalize(item.name);
      const score = candidate === target ? 1 : candidate.startsWith(target) ? .9 : candidate.includes(target) ? .78 : similarity(target, candidate);
      if (!best || score > best.score) best = { item, score };
    }
    return best && (best.score >= .36 || best.item.name.toLocaleLowerCase("en").startsWith(word.toLocaleLowerCase("en"))) ? best.item : null;
  }
  function isTalentsWord(word) {
    const target = normalize(word);
    return target === "talent" || target === "talents" || target.startsWith("tal") || similarity(target, "talents") >= .58;
  }
  function sortDays(days) {
    const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  function todayName() {
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date().getDay()];
  }
  function daysLabel(days) {
    const labels = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
    return days.map(day => labels[day] || day).join(", ");
  }
  async function fetchMaterialDays(materialIds) {
    const materialDetails = await Promise.all([...materialIds].map(async id => {
      const response = await fetch(`${API_ROOT}/material/${encodeURIComponent(id)}`);
      if (!response.ok) return null;
      return (await response.json())?.data;
    }));
    const days = new Set();
    materialDetails.filter(Boolean).forEach(material => (material.source || [])
      .filter(source => source.type === "domain")
      .forEach(source => (source.days || []).forEach(day => days.add(day.toLowerCase()))));
    return sortDays(days);
  }
  async function fetchTalentDays(characterId) {
    const response = await fetch(`${API_ROOT}/avatar/${encodeURIComponent(characterId)}`);
    if (!response.ok) throw new Error("The character talent request failed.");
    const character = (await response.json())?.data;
    const materialIds = new Set();
    Object.values(character?.talent || {}).forEach(talent => Object.values(talent?.promote || {})
      .forEach(level => Object.keys(level?.costItems || {}).forEach(id => materialIds.add(id))));
    return fetchMaterialDays(materialIds);
  }
  async function fetchWeaponDays(weaponId) {
    const response = await fetch(`${API_ROOT}/weapon/${encodeURIComponent(weaponId)}`);
    if (!response.ok) throw new Error("The weapon upgrade request failed.");
    const weapon = (await response.json())?.data;
    const materialIds = new Set();
    (weapon?.upgrade?.promote || []).forEach(level => Object.keys(level?.costItems || {}).forEach(id => materialIds.add(id)));
    return fetchMaterialDays(materialIds);
  }
  function animateBurn(row, note) {
    row.classList.add("burning");
    const canvas = document.createElement("canvas");
    canvas.className = "burn-canvas";
    row.append(canvas);
    const bounds = row.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      setStatus("WebGL is unavailable, so the note will be removed without the fire effect.", "error");
      window.setTimeout(() => {
        state.notes = state.notes.filter(item => item.id !== note.id);
        writeStorage(NOTES_KEY, state.notes);
        render();
      }, 920);
      return;
    }
    canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
    const vertexSource = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * .5 + .5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision mediump float;
      varying vec2 vUv;
      uniform float u_ratio;
      uniform float u_time;
      uniform float u_shape_offset;
      uniform float u_power;
      uniform float u_addition;

      vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
      float snoise(vec2 v) {
        const vec4 C = vec4(.2113248654, .3660254038, -.5773502692, .0243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
        m = m * m * m * m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - .5;
        vec3 ox = floor(x + .5);
        vec3 a0 = x - ox;
        m *= 1.7928427 - .8537347 * (a0 * a0 + h * h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      float flameNoise(vec2 uv, float t) {
        float noise = snoise(vec2(uv.x * 8.0, uv.y * 2.0 - t));
        noise += .2 * snoise(vec2(uv.x * 10.0 + 1.5 * t, uv.y * 3.0));
        return min(1.0, .5 * noise + u_addition);
      }
      void main() {
        vec2 uv = vUv;
        uv.y /= u_ratio;
        float noise = flameNoise(uv, u_time * 2.0);
        float shape = pow(.8 * uv.y * u_ratio, .5);
        shape += 3.0 * pow(abs(uv.x - .5), 2.0);
        shape *= u_shape_offset;
        float stepped = floor(noise * 4.0) / 4.0;
        float d = pow(max(stepped, 0.0), u_power) * (1.2 - shape);
        vec3 color = hsv2rgb(vec3(d * .15, .8 - .2 * d, d + .5 + .1 * uv.y));
        float alpha = smoothstep(shape, shape + .2, noise) * step(shape, noise);
        gl_FragColor = vec4(color, alpha * .9);
      }
    `;
    function createShader(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Fire shader compilation failed: ${message}`);
      }
      return shader;
    }
    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (error) {
      console.error("Fire effect could not start.", error);
      setStatus("The fire effect could not start, so the note will be removed.", "error");
      window.setTimeout(() => {
        state.notes = state.notes.filter(item => item.id !== note.id);
        writeStorage(NOTES_KEY, state.notes);
        render();
      }, 920);
      return;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {
      ratio: gl.getUniformLocation(program, "u_ratio"),
      time: gl.getUniformLocation(program, "u_time"),
      shape: gl.getUniformLocation(program, "u_shape_offset"),
      power: gl.getUniformLocation(program, "u_power"),
      addition: gl.getUniformLocation(program, "u_addition")
    };
    const started = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - started) / 900);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.ratio, bounds.width / bounds.height);
      gl.uniform1f(uniforms.time, (now - started) / 1000);
      gl.uniform1f(uniforms.shape, 1.0 - progress * .6);
      gl.uniform1f(uniforms.power, .7 - progress * .3);
      gl.uniform1f(uniforms.addition, .5 + progress * .5);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.setTimeout(() => {
      state.notes = state.notes.filter(item => item.id !== note.id);
      writeStorage(NOTES_KEY, state.notes);
      render();
    }, 920);
  }
  function render() {
    notesElement.replaceChildren();
    if (!state.notes.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No notes yet. Add your first upgrade priority above.";
      notesElement.append(empty);
      return;
    }
    state.notes.forEach(note => {
      const row = document.createElement("article");
      row.className = `note${note.availableDays?.length && !note.availableDays.includes(todayName()) ? " not-today" : ""}`;
      row.dataset.id = note.id;
      const complete = document.createElement("button");
      complete.className = "complete";
      complete.type = "button";
      complete.title = "Complete note";
      complete.setAttribute("aria-label", complete.title);
      complete.textContent = "🔥";
      complete.addEventListener("click", () => {
        if (!row.classList.contains("burning")) animateBurn(row, note);
      });
      const image = document.createElement("img");
      image.className = "avatar";
      image.src = note.image;
      image.alt = `${note.title} icon`;
      image.loading = "lazy";
      const imageCandidates = [image.src, image.src.replace(IMAGE_ROOT, ENKA_IMAGE_ROOT)];
      let imageIndex = 0;
      image.addEventListener("error", () => {
        imageIndex += 1;
        if (imageIndex < imageCandidates.length) image.src = imageCandidates[imageIndex];
        else { image.removeAttribute("src"); image.alt = `${note.title} image unavailable`; }
      });
      const title = document.createElement("strong");
      title.className = "note-title";
      title.textContent = note.title;
      title.title = note.title;
      const text = document.createElement("span");
      text.className = "note-text";
      text.textContent = note.rest || (note.kind === "weapon" ? "lvl" : note.talentNote ? "talents" : "Upgrade priority");
      const days = document.createElement("span");
      days.className = "note-days";
      days.textContent = note.availableDays?.length ? `Materials: ${daysLabel(note.availableDays)}` : "";
      days.title = "Talent materials are available on these days";
      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⠿";
      handle.title = "Drag to reorder";
      handle.setAttribute("aria-label", "Drag to reorder");
      handle.draggable = true;
      handle.addEventListener("dragstart", event => { state.draggedId = note.id; row.classList.add("dragging"); event.dataTransfer.effectAllowed = "move"; });
      handle.addEventListener("dragend", () => { state.draggedId = null; row.classList.remove("dragging"); });
      row.addEventListener("dragover", event => { event.preventDefault(); });
      row.addEventListener("drop", event => {
        event.preventDefault();
        const from = state.notes.findIndex(item => item.id === state.draggedId);
        const to = state.notes.findIndex(item => item.id === note.id);
        if (from >= 0 && to >= 0 && from !== to) {
          const [moved] = state.notes.splice(from, 1);
          state.notes.splice(to, 0, moved);
          writeStorage(NOTES_KEY, state.notes);
          render();
        }
      });
      row.append(complete, image, title, text, days, handle);
      notesElement.append(row);
    });
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    const words = raw.split(/\s+/);
    const match = bestMatch(words[0].replace(/[.,!?;:]+$/, ""));
    const talentRequest = match?.kind === "character" && words[1] && isTalentsWord(words[1]);
    const weaponRequest = match?.kind === "weapon";
    let availableDays = [];
    if (talentRequest || weaponRequest) {
      setStatus(`Loading ${weaponRequest ? "weapon" : "talent"} materials for ${match.name}…`);
      try {
        availableDays = weaponRequest ? await fetchWeaponDays(match.id.replace("weapon-", "")) : await fetchTalentDays(match.id.replace("character-", ""));
      } catch (error) {
        setStatus(`The note was added, but ${weaponRequest ? "weapon" : "talent"} material days could not be loaded.`, "error");
        console.error(`${weaponRequest ? "Weapon" : "Talent"} material loading failed.`, error);
      }
    }
    const first = words.shift();
    if (talentRequest) words.shift();
    if (weaponRequest) words.splice(0, Math.max(0, match.name.split(/\s+/).length - 1));
    const note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: match ? match.name : first,
      rest: words.join(" ") || (talentRequest ? "talents" : weaponRequest ? "lvl" : "Upgrade priority"),
      image: match ? match.image : "",
      availableDays, kind: match?.kind || "", talentNote: talentRequest, done: false
    };
    state.notes.unshift(note);
    writeStorage(NOTES_KEY, state.notes);
    if (talentRequest || weaponRequest) setStatus(availableDays.length ? `Added ${match.name} material days: ${daysLabel(availableDays)}.` : `Added ${match.name}, but no material schedule was found.`, availableDays.length ? "ready" : "error");
    else setStatus("Note added.", "ready");
    input.value = "";
    render();
    input.focus();
  });
  async function init() {
    applyTheme(loadTheme());
    const cached = readStorage(CATALOG_KEY, []);
    if (Array.isArray(cached) && cached.length) {
      state.catalog = cached.map(item => ({ ...item, image: migrateImageUrl(item.image) }));
      setStatus(`Ready with ${cached.length} cached characters and weapons.`, "ready");
    }
    try {
      const catalog = await fetchCatalog();
      state.catalog = catalog;
      writeStorage(CATALOG_KEY, catalog);
      setStatus(`Ready: ${catalog.length} characters and weapons loaded.`, "ready");
    } catch (error) {
      if (state.catalog.length) setStatus("Using cached characters and weapons. Live refresh failed.", "error");
      else setStatus("Could not load the catalog. Connect to the internet and reload this file.", "error");
      console.error("Catalog loading failed.", error);
    }
    render();
  }
  render();
  settingsButton.addEventListener("click", () => settingsDialog.showModal());
  infoButton.addEventListener("click", () => infoDialog.showModal());
  themeSelect.addEventListener("change", event => applyTheme(event.target.value));
  init();
})();
