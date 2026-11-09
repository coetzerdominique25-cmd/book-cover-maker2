import crypto from "node:crypto";

export const MODE = (process.env.PAYFAST_MODE || "sandbox").toLowerCase() === "live" ? "live" : "sandbox";
export const HOST = MODE === "live" ? "https://www.payfast.co.za" : "https://sandbox.payfast.co.za";

// Sandbox falls back to Payfast's public test merchant so the flow works before go-live.
export function creds() {
  if (MODE === "live") {
    return { id: process.env.PAYFAST_MERCHANT_ID, key: process.env.PAYFAST_MERCHANT_KEY, pass: process.env.PAYFAST_PASSPHRASE || "" };
  }
  return {
    id: process.env.PAYFAST_MERCHANT_ID || "10000100",
    key: process.env.PAYFAST_MERCHANT_KEY || "46f0cd694581a",
    pass: process.env.PAYFAST_PASSPHRASE ?? "jt7NOE43FZPn",
  };
}

export const MIN_KIDS = 1, MAX_KIDS = 8, MONTHS = 4;
// R50 for the first child, R25 for each extra child.
export const price = (kids) => 50 + 25 * (kids - 1);

// PHP urlencode() semantics, which Payfast signs against: spaces as +, uppercase hex, only A-Z a-z 0-9 - _ . left as-is.
export function pfEncode(v) {
  return encodeURIComponent(String(v)).replace(/%20/g, "+").replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// Checkout signature: fields in the order sent, empty values skipped, values trimmed.
export function checkoutSignature(pairs, pass) {
  let s = pairs.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `${k}=${pfEncode(String(v).trim())}`).join("&");
  if (pass) s += `&passphrase=${pfEncode(pass.trim())}`;
  return crypto.createHash("md5").update(s).digest("hex");
}

// ITN: every field in received order up to (not including) signature, empties kept.
export function itnParamString(pairs) {
  const out = [];
  for (const [k, v] of pairs) { if (k === "signature") break; out.push(`${k}=${pfEncode(v)}`); }
  return out.join("&");
}
export function itnSignature(pairs, pass) {
  let s = itnParamString(pairs);
  if (pass) s += `&passphrase=${pfEncode(pass.trim())}`;
  return crypto.createHash("md5").update(s).digest("hex");
}

export function addMonths(date, n) {
  const d = new Date(date.getTime()); const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

const secret = () => process.env.TOKEN_SECRET || ("bcm:" + (creds().pass || "dev"));
export const emailKey = (email) => crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 32);
export function makeToken(lic) {
  const body = Buffer.from(JSON.stringify({ e: emailKey(lic.email), k: lic.kids, x: lic.exp })).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + mac;
}
export function readToken(tok) {
  if (typeof tok !== "string" || !tok.includes(".")) return null;
  const [body, mac] = tok.split(".");
  const good = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}

export const normName = (n) => String(n || "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 60);
export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const validEmail = (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.length <= 120;
