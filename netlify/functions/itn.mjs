import { HOST, creds, itnParamString, itnSignature, addMonths, MONTHS, MAX_KIDS, emailKey } from "./lib/payfast.mjs";
import { store } from "./lib/store.mjs";
import { packsOf } from "./lib/packs.mjs";

// Payfast calls this server-to-server after a payment. Always answer 200 so Payfast stops retrying.
export async function handleItn(rawBody, { validate = defaultValidate } = {}) {
  const pairs = [...new URLSearchParams(rawBody)];
  const data = Object.fromEntries(pairs);
  const c = creds();
  if (!data.signature || data.signature !== itnSignature(pairs, c.pass)) return { ok: false, reason: "signature" };
  if (data.merchant_id !== String(c.id)) return { ok: false, reason: "merchant" };
  if (!(await validate(itnParamString(pairs)))) return { ok: false, reason: "validate" };

  const s = store();
  const order = await s.get("order:" + data.m_payment_id, { type: "json" });
  if (!order) return { ok: false, reason: "order" };
  if (Math.abs(parseFloat(data.amount_gross) - parseFloat(order.amount)) > 0.01) return { ok: false, reason: "amount" };
  if (data.payment_status !== "COMPLETE") { await s.setJSON("order:" + order.id, { ...order, status: String(data.payment_status || "unknown").toLowerCase() }); return { ok: false, reason: "status" }; }
  if (order.status === "paid") return { ok: true, repeat: true };

  const key = "lic:" + emailKey(order.email);
  const lic = (await s.get(key, { type: "json" })) || { email: order.email, packs: [], orders: [] };
  packsOf(lic); // normalises older records
  const now = new Date();
  const target = order.type === "topup" ? lic.packs.find(p => p.id === order.packId && p.exp > now.getTime()) : null;
  if (target) {
    target.kids = Math.min(MAX_KIDS, target.kids + order.extra); // same expiry as that pack
  } else {
    // a new pack: its own 4 months from today
    lic.packs.push({ id: order.id, kids: Math.min(MAX_KIDS, order.type === "topup" ? order.extra : order.kids), exp: addMonths(now, MONTHS).getTime(), start: now.getTime(), names: [] });
  }
  lic.email = order.email;
  lic.orders = [...(lic.orders || []), order.id];
  delete lic.kids; delete lic.exp; delete lic.names;
  await s.setJSON(key, lic);
  await s.setJSON("order:" + order.id, { ...order, status: "paid", pf_payment_id: data.pf_payment_id, paid: now.toISOString() });
  return { ok: true };
}

async function defaultValidate(paramString) {
  try {
    const r = await fetch(`${HOST}/eng/query/validate`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: paramString });
    return (await r.text()).trim() === "VALID";
  } catch { return false; }
}

export default async (req) => {
  if (req.method !== "POST") return new Response("OK");
  try { const r = await handleItn(await req.text()); if (!r.ok) console.log("ITN rejected:", r.reason); }
  catch (e) { console.log("ITN error", e); }
  return new Response("OK");
};

export const config = { path: "/api/itn" };
