import { sortDays } from "./matching.js";

export const API_ROOT = "https://gi.yatta.moe/api/v2/en";
export const IMAGE_ROOT = "https://gi.yatta.moe/assets/UI";

export function imageFor(item) {
  return `${IMAGE_ROOT}/${encodeURIComponent(item.icon)}.png`;
}

export function toCatalog(kind, payload) {
  return Object.values(payload?.data?.items || {}).filter(item => item?.name && item?.icon).map(item => ({
    id: `${kind}-${item.id}`, kind, name: item.name, icon: item.icon, image: imageFor(item)
  }));
}

async function getJson(path, errorMessage) {
  const response = await fetch(`${API_ROOT}/${path}`);
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

export async function fetchCatalog() {
  const [avatars, weapons] = await Promise.all([
    getJson("avatar", "The catalog request failed."),
    getJson("weapon", "The catalog request failed.")
  ]);
  const catalog = [...toCatalog("character", avatars), ...toCatalog("weapon", weapons)];
  if (!catalog.length) throw new Error("The API returned an empty catalog.");
  return catalog;
}

export async function fetchMaterialDays(materialIds) {
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

export async function fetchTalentDays(characterId) {
  const character = (await getJson(`avatar/${encodeURIComponent(characterId)}`, "The character talent request failed.")).data;
  const materialIds = new Set();
  Object.values(character?.talent || {}).forEach(talent => Object.values(talent?.promote || {})
    .forEach(level => Object.keys(level?.costItems || {}).forEach(id => materialIds.add(id))));
  return fetchMaterialDays(materialIds);
}

export async function fetchWeaponDays(weaponId) {
  const weapon = (await getJson(`weapon/${encodeURIComponent(weaponId)}`, "The weapon upgrade request failed.")).data;
  const materialIds = new Set();
  (weapon?.upgrade?.promote || []).forEach(level => Object.keys(level?.costItems || {}).forEach(id => materialIds.add(id)));
  return fetchMaterialDays(materialIds);
}
