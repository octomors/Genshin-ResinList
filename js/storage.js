export const CATALOG_KEY = "genshin-notes.catalog.v1";
export const NOTES_KEY = "genshin-notes.notes.v1";
export const THEME_KEY = "genshin-notes.theme.v1";
export const SERVER_KEY = "genshin-notes.server.v1";

export function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key} from localStorage.`, error);
    return fallback;
  }
}

export function writeStorage(key, value, onError) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    onError?.("Changes could not be saved in this browser.");
    console.warn(`Could not write ${key} to localStorage.`, error);
  }
}

export function migrateImageUrl(image, imageRoot) {
  return image?.replace("https://gi.yatta.moe/images/avatar/", `${imageRoot}/`)
    .replace("https://gi.yatta.moe/images/weapon/", `${imageRoot}/`)
    .replace(`${imageRoot}/avatar/`, `${imageRoot}/`)
    .replace(`${imageRoot}/weapon/`, `${imageRoot}/`);
}

export function loadNotes(imageRoot) {
  const notes = readStorage(NOTES_KEY, []);
  return Array.isArray(notes) ? notes.filter(note => note && note.id && note.title).map(note => ({
    ...note,
    image: migrateImageUrl(note.image, imageRoot)
  })) : [];
}
