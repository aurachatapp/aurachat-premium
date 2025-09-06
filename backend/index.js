// Email OTP + on-demand premium check backend
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import { Resend } from "resend";

const app = express();
app.use(express.json());
app.use(cors({ origin: [/^chrome-extension:\/\//, /github\.io$/] }));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY || "dummy");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// simple in-memory stores
const users = new Map(); // email -> { id, email, premium, stripeCustomerId }
const codes = new Map(); // email -> { hash, expiresAt }
let uid = 1;
const upsertUser = (email) => {
  let u = users.get(email);
  if (!u) { u = { id: uid++, email, premium: false, stripeCustomerId: null }; users.set(email, u); }
  return u;
};

app.post("/auth/start", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email_required" });
  const u = upsertUser(email);
  const code = ("" + Math.floor(100000 + Math.random()*900000)).slice(-6);
  const hash = bcrypt.hashSync(code, 10);
  const expiresAt = Date.now() + 10*60*1000;
  codes.set(email, { hash, expiresAt });
  try {
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({ from: "AuraChat <login@aurachat.app>", to: email, subject: "Your AuraChat code", text: `Your code is ${code} (10 min).` });
    } else {
      console.log("LOGIN CODE for", email, "=", code);
    }
  } catch (e) { console.error(e); return res.status(500).json({ error: "email_failed" }); }
  res.json({ ok: true });
});

app.post("/auth/verify", (req, res) => {
  const { email, code } = req.body || {};
  const rec = codes.get(email);
  const u = users.get(email);
  if (!rec || !u) return res.status(400).json({ error: "no_pending_code" });
  if (Date.now() > rec.expiresAt) return res.status(400).json({ error: "expired" });
  if (!bcrypt.compareSync(code, rec.hash)) return res.status(400).json({ error: "bad_code" });
  codes.delete(email);
  const token = jwt.sign({ uid: u.id, email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, premium: !!u.premium });
});

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: "no_token" });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: "bad_token" }); }
}

async function computePremiumByEmail(email) {
  let u = upsertUser(email);
  if (!u.stripeCustomerId) {
    const custs = await stripe.customers.list({ email, limit: 1 });
    const c = custs.data[0];
    if (c) u.stripeCustomerId = c.id;
  }
  if (!u.stripeCustomerId) return false;
  const subs = await stripe.subscriptions.list({ customer: u.stripeCustomerId, status: "all", limit: 1 });
  const sub = subs.data[0];
  const active = !!sub && ["active", "trialing"].includes(sub.status);
  u.premium = active;
  return active;
}

app.get("/me", auth, async (req, res) => {
  const email = req.user.email;
  const u = upsertUser(email);
  let premium = !!u.premium;
  try { premium = await computePremiumByEmail(email); } catch(e) { console.error(e); }
  res.json({ email, premium });
});

app.get("/", (_, res) => res.send("AuraChat backend ok"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server on", PORT));
