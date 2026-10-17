export function normalize(value) {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
}

export function similarity(a, b) {
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

export function bestMatch(word, catalog) {
  const target = normalize(word);
  if (!target) return null;
  let best = null;
  for (const item of catalog) {
    const candidate = normalize(item.name);
    const score = candidate === target ? 1 : candidate.startsWith(target) ? .9 : candidate.includes(target) ? .78 : similarity(target, candidate);
    if (!best || score > best.score) best = { item, score };
  }
  return best && (best.score >= .36 || best.item.name.toLocaleLowerCase("en").startsWith(word.toLocaleLowerCase("en"))) ? best.item : null;
}

export function isTalentsWord(word) {
  const target = normalize(word);
  return target === "talent" || target === "talents" || target.startsWith("tal") || similarity(target, "talents") >= .58;
}

export function sortDays(days) {
  const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function daysLabel(days) {
  const labels = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
  return days.map(day => labels[day] || day).join(", ");
}
