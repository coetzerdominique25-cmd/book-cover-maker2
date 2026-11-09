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

export function view(lic, u, now = Date.now()) {
  const sm = summary(lic, now);
  return {
    status: sm.active ? "active" : "expired",
    token: makeToken({ email: lic.email, kids: sm.kids, exp: sm.exp }),
    kids: sm.kids, exp: sm.exp, names: sm.names, room: sm.room, email: lic.email,
    packs: packsOf(lic, now).map(p => ({ id: p.id, kids: p.kids, exp: p.exp, names: p.names, active: p.active })),
    hasPassword: !!(u && u.hash),
  };
}

// Put a learner on the account: already on an active pack, or into the earliest-expiring active pack with a free place.
export function claim(lic, name, now = Date.now()) {
  packsOf(lic, now);
  const act = lic.packs.filter(p => p.exp > now);
  if (act.some(p => (p.names || []).includes(name))) return "ok";
  const free = act.filter(p => (p.names || []).length < p.kids).sort((a, b) => a.exp - b.exp)[0];
  if (!free) return "full";
  free.names = [...(free.names || []), name];
  return "added";
}
