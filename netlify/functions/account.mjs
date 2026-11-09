import crypto from "node:crypto";
import { makeToken, readToken, emailKey, json, validEmail, normName } from "./lib/payfast.mjs";
import { store } from "./lib/store.mjs";

// Accounts: email + password. A password is set (or reset) either right after paying
// (the pass token proves it) or with the email plus a payment reference from a receipt.
const MIN_PW = 8, MAX_FAILS = 8, LOCK_MS = 15 * 60 * 1000;

const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString("hex");
const checkPw = (pw, u) => {
  if (!u || !u.hash) return false;
  const a = Buffer.from(hashPw(pw, u.salt), "hex"), b = Buffer.from(u.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const newHash = (pw) => { const salt = crypto.randomBytes(16).toString("hex"); return { salt, hash: hashPw(pw, salt) }; };
const pwError = (pw) => (typeof pw !== "string" || pw.length < MIN_PW) ? `Use a password of at least ${MIN_PW} characters.` : (pw.length > 200 ? "That password is too long." : null);

async function limited(s, ek) {
  const r = await s.get("rl:" + ek, { type: "json" });
  return r && r.until > Date.now();
}
async function fail(s, ek) {
  const r = (await s.get("rl:" + ek, { type: "json" })) || { n: 0 };
  r.n = (r.until && r.until < Date.now()) ? 1 : r.n + 1;
  r.until = r.n >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
  await s.setJSON("rl:" + ek, r);
}
const clearFails = (s, ek) => s.setJSON("rl:" + ek, { n: 0, until: 0 });

async function viewFor(s, lic) {
  const u = await s.get("user:" + emailKey(lic.email), { type: "json" });
  return { status: lic.exp > Date.now() ? "active" : "expired", token: makeToken(lic), kids: lic.kids, exp: lic.exp, names: lic.names || [], email: lic.email, hasPassword: !!(u && u.hash) };
}

async function paidOrders(s, lic) {
  const out = [];
  for (const id of lic.orders || []) {
    const o = await s.get("order:" + id, { type: "json" });
    if (o && o.status === "paid") out.push({ id: o.id, type: o.type, kids: o.kids, extra: o.extra || 0, amount: o.amount, paid: o.paid, ref: o.pf_payment_id || "" });
  }
  return out.sort((a, b) => String(b.paid).localeCompare(String(a.paid)));
}

const LOCKED = { error: "Too many attempts. Please wait 15 minutes and try again." };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const s = store();
  const act = String(b.action || "");

  if (act === "login" || act === "setup") {
    const email = String(b.email || "").trim();
    if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
    const ek = emailKey(email);
    if (await limited(s, ek)) return json(LOCKED, 429);
    const lic = await s.get("lic:" + ek, { type: "json" });
    const u = await s.get("user:" + ek, { type: "json" });

    if (act === "login") {
      if (!lic || !checkPw(b.password, u)) {
        await fail(s, ek);
        if (lic && !(u && u.hash)) return json({ error: "No password has been set for this email yet. Choose “Set or reset password” below.", needSetup: true }, 401);
        return json({ error: "That email and password don't match." }, 401);
      }
      await clearFails(s, ek);
      return json(await viewFor(s, lic));
    }

    // setup / forgot password: prove ownership with a payment reference
    const err = pwError(b.password); if (err) return json({ error: err }, 400);
    const ref = String(b.ref || "").trim().toUpperCase();
    if (!lic || !ref) { await fail(s, ek); return json({ error: "We couldn't match that email and payment reference." }, 401); }
    const orders = await paidOrders(s, lic);
    const ok = orders.some(o => o.id.toUpperCase() === ref || (o.ref && String(o.ref).toUpperCase() === ref));
    if (!ok) { await fail(s, ek); return json({ error: "We couldn't match that email and payment reference." }, 401); }
    await s.setJSON("user:" + ek, { ...(u || {}), ...newHash(b.password), updated: new Date().toISOString() });
    await clearFails(s, ek);
    return json(await viewFor(s, lic));
  }

  // Everything below needs a valid pass token.
  const t = readToken(b.token);
  if (!t) return json({ error: "Please sign in again." }, 401);
  const lic = await s.get("lic:" + t.e, { type: "json" });
  if (!lic) return json({ error: "Please sign in again." }, 401);
  const ek = t.e;

  if (act === "setpw") {
    const err = pwError(b.password); if (err) return json({ error: err }, 400);
    const u = await s.get("user:" + ek, { type: "json" });
    if (u && u.hash && !checkPw(b.current, u)) {
      if (await limited(s, ek)) return json(LOCKED, 429);
      await fail(s, ek); return json({ error: "Your current password is not right." }, 401);
    }
    await s.setJSON("user:" + ek, { ...(u || {}), ...newHash(b.password), updated: new Date().toISOString() });
    return json(await viewFor(s, lic));
  }

  if (act === "history") {
    const downloads = (await s.get("dl:" + ek, { type: "json" })) || [];
    return json({ ...(await viewFor(s, lic)), orders: await paidOrders(s, lic), downloads: downloads.slice(-50).reverse() });
  }

  if (act === "logdl") {
    const list = (await s.get("dl:" + ek, { type: "json" })) || [];
    list.push({ at: new Date().toISOString(), name: normName(b.name).slice(0, 40), theme: String(b.theme || "").slice(0, 30), covers: Math.max(0, Math.min(99, Math.round(Number(b.covers) || 0))) });
    await s.setJSON("dl:" + ek, list.slice(-200));
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/account" };
