import crypto from "node:crypto";
import { makeToken, readToken, emailKey, json, validEmail, normName } from "./lib/payfast.mjs";
import { store } from "./lib/store.mjs";
import { sendMail, mailReady } from "./lib/mail.mjs";
import { view } from "./lib/packs.mjs";

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
  const now = Date.now();
  const r = (await s.get("rl:" + ek, { type: "json" })) || { n: 0 };
  if (!r.day || now - r.day > 864e5) { r.day = now; r.total = 0; }
  r.total = (r.total || 0) + 1;
  r.n = (r.until && r.until < now) ? 1 : r.n + 1;
  r.until = r.total >= 20 ? now + 864e5 : (r.n >= MAX_FAILS ? now + LOCK_MS : 0);
  await s.setJSON("rl:" + ek, r);
}
const clearFails = (s, ek) => s.setJSON("rl:" + ek, { n: 0, until: 0 });
// Recovery PIN: at least 4 characters, hashed like a password
const pinError = (p) => (typeof p !== "string" || p.trim().length < 4) ? "Choose a recovery PIN of at least 4 characters." : (p.length > 40 ? "That PIN is too long." : null);
const pinHashOf = (pin) => { const pinSalt = crypto.randomBytes(16).toString("hex"); return { pinSalt, pinHash: hashPw(String(pin).trim(), pinSalt) }; };
const checkPin = (pin, u) => { if (!u || !u.pinHash) return false; const a = Buffer.from(hashPw(String(pin || "").trim(), u.pinSalt), "hex"), b = Buffer.from(u.pinHash, "hex"); return a.length === b.length && crypto.timingSafeEqual(a, b); };

async function viewFor(s, lic) {
  const u = await s.get("user:" + emailKey(lic.email), { type: "json" });
  return view(lic, u);
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

  if (act === "pinreset") {
    const email = String(b.email || "").trim();
    if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
    const err = pwError(b.password); if (err) return json({ error: err }, 400);
    const ek = emailKey(email);
    if (await limited(s, ek)) return json(LOCKED, 429);
    const lic = await s.get("lic:" + ek, { type: "json" });
    const u = await s.get("user:" + ek, { type: "json" });
    if (!lic || !checkPin(b.pin, u)) {
      await fail(s, ek);
      if (lic && !(u && u.pinHash)) return json({ error: "This account has no recovery PIN yet. Use your payment reference below, or contact us to unlock it.", noPin: true }, 401);
      return json({ error: "That email and PIN don't match. Forgot your PIN? Contact us to unlock your account." }, 401);
    }
    await s.setJSON("user:" + ek, { ...u, ...newHash(b.password), updated: new Date().toISOString() });
    await clearFails(s, ek);
    return json(await viewFor(s, lic));
  }

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

  if (act === "forgot") {
    const email = String(b.email || "").trim();
    if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
    if (!mailReady()) return json({ error: "Email reset isn't available right now. Use your payment reference below instead.", noMail: true }, 503);
    const ek = emailKey(email);
    if (await limited(s, ek)) return json(LOCKED, 429);
    const lic = await s.get("lic:" + ek, { type: "json" });
    if (lic) {
      const rt = crypto.randomBytes(24).toString("base64url");
      const hk = crypto.createHash("sha256").update(rt).digest("hex");
      await s.setJSON("reset:" + hk, { ek, exp: Date.now() + 60 * 60 * 1000 });
      await fail(s, ek); // counts towards the rate limit so the inbox can't be flooded
      const site = (process.env.SITE_URL || "https://schoolbookcover.co.za").replace(/\/$/, "");
      const link = `${site}/?reset=${rt}`;
      try {
        await sendMail({ to: lic.email, subject: "Reset your School Book Covers password",
          text: `Hi,\n\nSomeone asked to reset the password for your School Book Covers account.\n\nChoose a new password here (the link works for 1 hour):\n${link}\n\nIf this wasn't you, ignore this email. Your password stays the same.\n\nSchool Book Covers · Velvik (Pty) Ltd`,
          html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14161a;max-width:520px"><h2 style="margin:0 0 12px">Reset your password</h2><p>Someone asked to reset the password for your School Book Covers account.</p><p><a href="${link}" style="display:inline-block;background:#2F55D4;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a></p><p style="color:#5b6270;font-size:13px">The link works for 1 hour. If this wasn't you, ignore this email. Your password stays the same.</p><p style="color:#5b6270;font-size:12px">School Book Covers · Velvik (Pty) Ltd</p></div>` });
      } catch (e) { console.log("mail error", e && e.message); return json({ error: "We couldn't send the email just now. Please try again, or use your payment reference." }, 502); }
    }
    return json({ ok: true, message: "If that email has a pass, a reset link is on its way. Check your inbox (and spam)." });
  }

  if (act === "reset") {
    const err = pwError(b.password); if (err) return json({ error: err }, 400);
    const hk = crypto.createHash("sha256").update(String(b.rt || "")).digest("hex");
    const r = await s.get("reset:" + hk, { type: "json" });
    if (!r || r.used || r.exp < Date.now()) return json({ error: "This reset link has expired or was already used. Ask for a new one." }, 400);
    const lic = await s.get("lic:" + r.ek, { type: "json" });
    if (!lic) return json({ error: "We couldn't find that account." }, 400);
    const u = await s.get("user:" + r.ek, { type: "json" });
    await s.setJSON("user:" + r.ek, { ...(u || {}), ...newHash(b.password), updated: new Date().toISOString() });
    await s.setJSON("reset:" + hk, { ...r, used: true });
    await clearFails(s, r.ek);
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
    const needPin = !(u && u.pinHash);
    if (needPin || b.pin) { const pe = pinError(b.pin); if (pe) return json({ error: pe }, 400); }
    await s.setJSON("user:" + ek, { ...(u || {}), ...newHash(b.password), ...(b.pin ? pinHashOf(b.pin) : {}), updated: new Date().toISOString() });
    return json(await viewFor(s, lic));
  }

  if (act === "setpin") {
    const pe = pinError(b.pin); if (pe) return json({ error: pe }, 400);
    const u = await s.get("user:" + ek, { type: "json" });
    if (u && u.hash && !checkPw(b.current, u)) {
      if (await limited(s, ek)) return json(LOCKED, 429);
      await fail(s, ek); return json({ error: "Your password is not right." }, 401);
    }
    await s.setJSON("user:" + ek, { ...(u || {}), ...pinHashOf(b.pin), updated: new Date().toISOString() });
    return json(await viewFor(s, lic));
  }

  if (act === "history") {
    const downloads = (await s.get("dl:" + ek, { type: "json" })) || [];
    return json({ ...(await viewFor(s, lic)), orders: await paidOrders(s, lic), downloads: downloads.slice(-50).reverse() });
  }

  if (act === "logdl") {
    const list = (await s.get("dl:" + ek, { type: "json" })) || [];
    // keep the design so the covers can be downloaded again later (deduplicated by content)
    let did = "";
    if (b.design && typeof b.design === "object") {
      const raw = JSON.stringify(b.design);
      if (raw.length <= 600000) {
        did = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 20);
        await s.setJSON(`dsg:${ek}:${did}`, b.design);
      }
    }
    list.push({ at: new Date().toISOString(), name: normName(b.name).slice(0, 40), theme: String(b.theme || "").slice(0, 30), covers: Math.max(0, Math.min(99, Math.round(Number(b.covers) || 0))), did });
    await s.setJSON("dl:" + ek, list.slice(-200));
    return json({ ok: true });
  }

  if (act === "design") {
    const id = String(b.id || "").replace(/[^a-f0-9]/g, "").slice(0, 20);
    const d = id && await s.get(`dsg:${ek}:${id}`, { type: "json" });
    return d ? json({ design: d }) : json({ error: "That download isn't available any more." }, 404);
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/account" };
