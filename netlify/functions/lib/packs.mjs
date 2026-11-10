import { makeToken, MAX_KIDS } from "./payfast.mjs";

// An account holds packs. A pack has up to MAX_KIDS sets (one learner each) and its own
// 4-month expiry. First set in a pack R50, each extra set in that pack R25.
// A further set when every active pack is full starts a new pack at R50.

export function packsOf(lic, now = Date.now()) {
  if (!lic) return [];
  if (!Array.isArray(lic.packs)) {
    // older single-pass records
    lic.packs = lic.kids ? [{ id: "P1", kids: lic.kids, exp: lic.exp, names: lic.names || [], start: null }] : [];
  }
  return lic.packs.map(p => ({ ...p, names: p.names || [], active: p.exp > now }));
}
export const activePacks = (lic, now = Date.now()) => packsOf(lic, now).filter(p => p.active);

// The most recent active pack that still has room for extra sets (top-up target).
export function topupPack(lic, now = Date.now()) {
  const a = activePacks(lic, now).filter(p => p.kids < MAX_KIDS);
  return a.sort((x, y) => y.exp - x.exp)[0] || null;
}

export function summary(lic, now = Date.now()) {
  const act = activePacks(lic, now);
  const kids = act.reduce((n, p) => n + p.kids, 0);
  const names = act.flatMap(p => p.names);
  const exp = act.length ? Math.max(...act.map(p => p.exp)) : Math.max(0, ...packsOf(lic, now).map(p => p.exp || 0));
  const tp = topupPack(lic, now);
  return { kids, names, exp, room: tp ? MAX_KIDS - tp.kids : 0, active: act.length > 0 };
}

export const THEMES_PER_SET = 2;
const cleanMeta = (m = {}) => ({ grade: String(m.grade || "").trim().toUpperCase().slice(0, 4), school: String(m.school || "").trim().slice(0, 60), year: String(m.year || "").trim().slice(0, 4) });
// How many active sets a learner name holds (a learner can take more than one set to unlock more themes)
export const setCount = (lic, name, now = Date.now()) => activePacks(lic, now).reduce((n, p) => n + p.names.filter(x => x === name).length, 0);

export function view(lic, u, now = Date.now()) {
  const sm = summary(lic, now);
  const learners = {};
  [...new Set(sm.names)].forEach(n => { learners[n] = { ...(lic.meta && lic.meta[n] || {}), themes: (lic.themes && lic.themes[n]) || [], sets: setCount(lic, n, now) }; });
  return {
    status: sm.active ? "active" : "expired",
    token: makeToken({ email: lic.email, kids: sm.kids, exp: sm.exp }),
    kids: sm.kids, exp: sm.exp, names: sm.names, room: sm.room, email: lic.email,
    packs: packsOf(lic, now).map(p => ({ id: p.id, kids: p.kids, exp: p.exp, names: p.names, active: p.active })),
    hasPassword: !!(u && u.hash), hasPin: !!(u && u.pinHash), learners, themesPerSet: THEMES_PER_SET,
  };
}

// Put a learner on the account. Their name, grade, school and year are locked from the first claim.
// extra=true takes another set for a learner already on the account (2 more themes).
export function claim(lic, name, meta, theme, now = Date.now(), extra = false) {
  packsOf(lic, now);
  const act = lic.packs.filter(p => p.exp > now);
  const has = act.some(p => (p.names || []).includes(name));
  if (has && !extra) { recordFirst(lic, name, meta, theme); return "ok"; }
  const free = act.filter(p => (p.names || []).length < p.kids).sort((a, b) => a.exp - b.exp)[0];
  if (!free) return "full";
  free.names = [...(free.names || []), name];
  recordFirst(lic, name, meta, theme);
  return "added";
}
function recordFirst(lic, name, meta, theme) {
  lic.meta = lic.meta || {}; lic.themes = lic.themes || {};
  if (!lic.meta[name]) lic.meta[name] = cleanMeta(meta);
  const t = lic.themes[name] || [];
  if (theme && !t.length) t.push(theme); // first theme comes with the first claim
  lic.themes[name] = t;
}

// Use a theme for a learner: free if already used, allowed while under 2 themes per set they hold.
export function useTheme(lic, name, theme, now = Date.now(), meta = null) {
  const n = setCount(lic, name, now);
  if (!n) return "noset";
  lic.themes = lic.themes || {}; lic.meta = lic.meta || {};
  if (!lic.meta[name] && meta) lic.meta[name] = cleanMeta(meta); // older sets lock on their next download
  const t = lic.themes[name] || [];
  if (t.includes(theme)) return "ok";
  if (t.length >= THEMES_PER_SET * n) return "limit";
  lic.themes[name] = [...t, theme];
  return "added";
}
