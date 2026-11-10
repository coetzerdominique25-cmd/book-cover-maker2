import crypto from "node:crypto";
import { HOST, creds, price, packSizes, MIN_KIDS, MAX_KIDS, MAX_ORDER_SETS, checkoutSignature, json, validEmail, readToken, emailKey } from "./lib/payfast.mjs";
import { store } from "./lib/store.mjs";
import { activePacks, topupPack } from "./lib/packs.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  let kids = Math.round(Number(body.kids));
  let email = String(body.email || "").trim();
  let type = "pass", extra = 0, amountNum, packId = null;
  if (body.topup) {
    // Add children to an existing, active pass: R25 each, expiry unchanged.
    const t = readToken(body.token);
    const lic = t && await store().get("lic:" + t.e, { type: "json" });
    if (!lic || !activePacks(lic).length) return json({ error: "Your pass has expired. Buy a new pack instead." }, 403);
    const tp = topupPack(lic);
    extra = Math.round(Number(body.extra));
    if (!tp) return json({ error: `Your active packs are full (${MAX_KIDS} sets each). Your next set starts a new pack at R50 with its own 4-month expiry.`, newPack: true }, 400);
    if (!(extra >= 1 && tp.kids + extra <= MAX_KIDS)) return json({ error: `You can add up to ${MAX_KIDS - tp.kids} more ${MAX_KIDS - tp.kids === 1 ? "set" : "sets"} to this pack (maximum ${MAX_KIDS} per pack).` }, 400);
    packId = tp.id;
    type = "topup"; email = lic.email; kids = extra; amountNum = 25 * extra;
  } else {
    if (!(kids >= MIN_KIDS && kids <= MAX_ORDER_SETS)) return json({ error: `Choose between ${MIN_KIDS} and ${MAX_ORDER_SETS} sets.` }, 400);
    if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
    amountNum = price(kids);
  }

  const site = (process.env.SITE_URL || "https://schoolbookcover.co.za").replace(/\/$/, "");
  const id = "BCM-" + crypto.randomBytes(6).toString("hex").toUpperCase();
  const amount = amountNum.toFixed(2);
  await store().setJSON("order:" + id, { id, type, kids, extra, packId, email, amount, status: "pending", created: new Date().toISOString() });

  const c = creds();
  const pairs = [
    ["merchant_id", c.id],
    ["merchant_key", c.key],
    ["return_url", `${site}/?paid=${id}`],
    ["cancel_url", `${site}/?cancelled=1`],
    ["notify_url", `${site}/api/itn`],
    ["email_address", email],
    ["m_payment_id", id],
    ["amount", amount],
    ["item_name", type === "topup" ? `School Book Covers - ${extra} extra ${extra === 1 ? "set" : "sets"}` : `School Book Covers - ${kids} ${kids === 1 ? "set" : "sets"} (${packSizes(kids).length} ${packSizes(kids).length === 1 ? "pack" : "packs"}), 4 months`],
  ];
  const signature = checkoutSignature(pairs, c.pass);
  return json({ action: `${HOST}/eng/process`, fields: [...pairs, ["signature", signature]], order: id });
};

export const config = { path: "/api/checkout" };
