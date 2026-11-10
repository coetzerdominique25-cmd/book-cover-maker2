import crypto from "node:crypto";
import { emailKey, json, validEmail, addMonths, MONTHS } from "./lib/payfast.mjs";
import { store } from "./lib/store.mjs";
import { view } from "./lib/packs.mjs";

// Launch promo: a free set (1 learner, 1 theme) for the first LIMIT people, one per email.
const CODE = (process.env.PROMO_CODE || "BOOK27").toUpperCase();
const LIMIT = Number(process.env.PROMO_LIMIT || 10);

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const code = String(b.code || "").trim().toUpperCase();
  const email = String(b.email || "").trim();
  if (code !== CODE) return json({ error: "That promo code isn't valid.", status: "invalid" }, 400);
  if (!validEmail(email)) return json({ error: "Please enter your email first. It becomes your login.", status: "email" }, 400);
  const s = store(), ek = emailKey(email), key = "promo:" + CODE;
  const p = (await s.get(key, { type: "json" })) || { used: 0, emails: [] };
  if (p.emails.includes(ek)) return json({ status: "already", error: "You've already claimed this promo." }, 409);
  if (p.used >= LIMIT) return json({ status: "soldout", error: "All the free sets have been claimed." }, 409);
  p.used += 1; p.emails.push(ek);
  await s.setJSON(key, p);
  const lic = (await s.get("lic:" + ek, { type: "json" })) || { email, packs: [], orders: [] };
  if (!Array.isArray(lic.packs)) lic.packs = [];
  const now = new Date();
  lic.packs.push({ id: "PROMO-" + crypto.randomBytes(4).toString("hex").toUpperCase(), kids: 1, themes: 1, promo: CODE, exp: addMonths(now, MONTHS).getTime(), start: now.getTime(), names: [] });
  lic.email = lic.email || email;
  await s.setJSON("lic:" + ek, lic);
  const u = await s.get("user:" + ek, { type: "json" });
  return json({ ...view(lic, u), promoLeft: Math.max(0, LIMIT - p.used) });
};

export const config = { path: "/api/promo" };
