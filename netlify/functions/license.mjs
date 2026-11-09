import { makeToken, readToken, emailKey, normName, json, validEmail } from "./lib/payfast.mjs";
import { store } from "./lib/store.mjs";

const view = (lic, u) => ({ status: lic.exp > Date.now() ? "active" : "expired", token: makeToken(lic), kids: lic.kids, exp: lic.exp, names: lic.names || [], email: lic.email, hasPassword: !!(u && u.hash) });
const userOf = (s, lic) => s.get("user:" + emailKey(lic.email), { type: "json" });

export default async (req) => {
  const s = store();
  const url = new URL(req.url);
  if (req.method === "GET") {
    const order = url.searchParams.get("order");
    const email = url.searchParams.get("email");
    if (order) {
      const o = await s.get("order:" + order, { type: "json" });
      if (!o) return json({ status: "unknown" }, 404);
      if (o.status !== "paid") return json({ status: o.status });
      const lic = await s.get("lic:" + emailKey(o.email), { type: "json" });
      return lic ? json(view(lic, await userOf(s, lic))) : json({ status: "pending" });
    }
    if (email) {
      if (!validEmail(email)) return json({ status: "invalid" }, 400);
      const lic = await s.get("lic:" + emailKey(email), { type: "json" });
      // No pass details by email alone: the person has to sign in with their password.
      return json({ status: lic ? "exists" : "none" }, lic ? 200 : 404);
    }
    return json({ error: "Missing order or email" }, 400);
  }
  if (req.method === "POST") {
    let body; try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
    const t = readToken(body.token);
    if (!t) return json({ status: "invalid" }, 401);
    const key = "lic:" + t.e;
    const lic = await s.get(key, { type: "json" });
    if (!lic || lic.exp < Date.now()) return json({ status: "expired" }, 403);
    const name = normName(body.name);
    if (!name) return json({ error: "Missing name" }, 400);
    const names = lic.names || [];
    if (!names.includes(name)) {
      if (names.length >= lic.kids) return json({ status: "full", kids: lic.kids, names }, 409);
      names.push(name); lic.names = names; await s.setJSON(key, lic);
    }
    return json(view(lic, await userOf(s, lic)));
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/license" };
