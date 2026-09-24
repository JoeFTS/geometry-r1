// storage.mjs — persistence over window.creationStorage.plain (R1 SDK), which wants
// Base64 values. Falls back to localStorage in a normal browser. Same shape as the
// Forge / pitch-tracker Creations.
const hasCreation = () => typeof window !== 'undefined' && window.creationStorage && window.creationStorage.plain;
const b64encode = (s) => btoa(unescape(encodeURIComponent(s)));
const b64decode = (s) => decodeURIComponent(escape(atob(s)));

const KEY = 'geometryRabbit';
export const DEFAULTS = { best: [0, 0, 0], attempts: [0, 0, 0], diff: 0, volume: 0.5, sideLag: 120 };

export async function load() {
  try {
    let raw;
    if (hasCreation()) { const v = await window.creationStorage.plain.getItem(KEY); raw = v == null ? null : b64decode(v); }
    else raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}

let pending = null;
export function save(data) {
  // coalesce bursts (e.g. wheel volume changes) into one write
  clearTimeout(pending);
  pending = setTimeout(async () => {
    const raw = JSON.stringify(data);
    try {
      if (hasCreation()) await window.creationStorage.plain.setItem(KEY, b64encode(raw));
      else localStorage.setItem(KEY, raw);
    } catch { /* storage unavailable: play on without saving */ }
  }, 150);
}
export const storageMode = () => hasCreation() ? 'creationStorage' : 'localStorage';
