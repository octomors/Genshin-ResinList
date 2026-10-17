import * as storage from "./storage.js";
import * as api from "./api.js";
import * as matching from "./matching.js";
import { burnNote } from "./fire-effect.js";

(() => {
  "use strict";
  const IMAGE_ROOT = api.IMAGE_ROOT;
  const ENKA_IMAGE_ROOT = "https://enka.network/ui";
  const SERVER_OFFSETS = { europe: 1, america: -5, asia: 8 };
  const state = { catalog: [], notes: storage.loadNotes(IMAGE_ROOT), server: loadServer(), draggedId: null };
  const form = document.querySelector("#note-form");
  const input = document.querySelector("#note-input");
  const status = document.querySelector("#status");
  const notesElement = document.querySelector("#notes");
  const settingsButton = document.querySelector("#settings-button");
  const settingsDialog = document.querySelector("#settings-dialog");
  const themeSelect = document.querySelector("#theme-select");
  const serverSelect = document.querySelector("#server-select");
  const infoButton = document.querySelector("#info-button");
  const infoDialog = document.querySelector("#info-dialog");

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeSelect.value = theme;
    storage.writeStorage(storage.THEME_KEY, theme, message => setStatus(message, "error"));
  }
  function loadTheme() {
    try {
      const stored = localStorage.getItem(storage.THEME_KEY);
      if (!stored) return "dark";
      const theme = JSON.parse(stored);
      return typeof theme === "string" ? theme : "dark";
    } catch (error) {
      const legacyTheme = localStorage.getItem(storage.THEME_KEY);
      if (legacyTheme) {
        localStorage.setItem(storage.THEME_KEY, JSON.stringify(legacyTheme));
        return legacyTheme;
      }
      console.warn("Could not read the saved theme.", error);
      return "dark";
    }
  }
  function loadServer() {
    const server = storage.readStorage(storage.SERVER_KEY, "europe");
    return Object.prototype.hasOwnProperty.call(SERVER_OFFSETS, server) ? server : "europe";
  }
  function applyServer(server) {
    const selectedServer = Object.prototype.hasOwnProperty.call(SERVER_OFFSETS, server) ? server : "europe";
    state.server = selectedServer;
    serverSelect.value = selectedServer;
    storage.writeStorage(storage.SERVER_KEY, selectedServer, message => setStatus(message, "error"));
    render();
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = `status${kind ? ` ${kind}` : ""}`;
  }
  function todayName() {
    const now = new Date(Date.now() + SERVER_OFFSETS[state.server] * 60 * 60 * 1000);
    if (now.getUTCHours() < 4) now.setUTCDate(now.getUTCDate() - 1);
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getUTCDay()];
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
      complete.textContent = "\uD83D\uDD25";
      complete.addEventListener("click", () => {
        if (!row.classList.contains("burning")) {
          burnNote(row, note, {
            onComplete: () => {
              state.notes = state.notes.filter(item => item.id !== note.id);
              storage.writeStorage(storage.NOTES_KEY, state.notes, message => setStatus(message, "error"));
              render();
            },
            onError: message => setStatus(message, "error")
          });
        }
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
      days.textContent = note.availableDays?.length ? `Materials: ${matching.daysLabel(note.availableDays)}` : "";
      days.title = "Materials are available on these days";
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
          storage.writeStorage(storage.NOTES_KEY, state.notes, message => setStatus(message, "error"));
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
    const match = matching.bestMatch(words[0].replace(/[.,!?;:]+$/, ""), state.catalog);
    const talentRequest = match?.kind === "character" && words[1] && matching.isTalentsWord(words[1]);
    const weaponRequest = match?.kind === "weapon";
    let availableDays = [];
    if (talentRequest || weaponRequest) {
      setStatus(`Loading ${weaponRequest ? "weapon" : "talent"} materials for ${match.name}\u2026`);
      try {
        availableDays = weaponRequest ? await api.fetchWeaponDays(match.id.replace("weapon-", "")) : await api.fetchTalentDays(match.id.replace("character-", ""));
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
    storage.writeStorage(storage.NOTES_KEY, state.notes, message => setStatus(message, "error"));
    if (talentRequest || weaponRequest) setStatus(availableDays.length ? `Added ${match.name} material days: ${matching.daysLabel(availableDays)}.` : `Added ${match.name}, but no material schedule was found.`, availableDays.length ? "ready" : "error");
    else setStatus("Note added.", "ready");
    input.value = "";
    render();
    input.focus();
  });
  async function init() {
    applyTheme(loadTheme());
    state.server = loadServer();
    serverSelect.value = state.server;
    const cached = storage.readStorage(storage.CATALOG_KEY, []);
    if (Array.isArray(cached) && cached.length) {
      state.catalog = cached.map(item => ({ ...item, image: storage.migrateImageUrl(item.image, IMAGE_ROOT) }));
      setStatus(`Ready with ${cached.length} cached characters and weapons.`, "ready");
    }
    try {
      const catalog = await api.fetchCatalog();
      state.catalog = catalog;
      storage.writeStorage(storage.CATALOG_KEY, catalog, message => setStatus(message, "error"));
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
  serverSelect.addEventListener("change", event => applyServer(event.target.value));
  window.setInterval(render, 60 * 1000);
  init();
})();
