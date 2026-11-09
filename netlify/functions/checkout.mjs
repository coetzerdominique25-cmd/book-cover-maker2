import crypto from "node:crypto";
import { HOST, creds, price, MIN_KIDS, MAX_KIDS, checkoutSignature, json, validEmail } from "./lib/payfast.mjs";
import { store } from "./lib/store.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const kids = Math.round(Number(body.kids));
  const email = String(body.email || "").trim();
  if (!(kids >= MIN_KIDS && kids <= MAX_KIDS)) return json({ error: `Choose between ${MIN_KIDS} and ${MAX_KIDS} children.` }, 400);
  if (!validEmail(email)) return json({ error: "Please enter a valid email address." }, 400);

  const site = (process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
  const id = "BCM-" + crypto.randomBytes(6).toString("hex").toUpperCase();
  const amount = price(kids).toFixed(2);
  await store().setJSON("order:" + id, { id, kids, email, amount, status: "pending", created: new Date().toISOString() });

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
    ["item_name", `Book Cover Maker - ${kids} children, 4 months`],
  ];
  const signature = checkoutSignature(pairs, c.pass);
  return json({ action: `${HOST}/eng/process`, fields: [...pairs, ["signature", signature]], order: id });
};

export const config = { path: "/api/checkout" };
