import express from "express";
import cors from "cors";
import { Resend } from "resend";

const app = express();
app.use(cors());
app.use(express.json());

// normalize helper (final unified version)
const normalizeEmail = (e) => String(e || "").trim().toLowerCase();

// --------------------------------------------------
// In-memory stores (cleared on restart)
// --------------------------------------------------
// codes: email -> { hash, exp }
const codes = new Map();
// sessions: token -> { email, premium }
const sessions = new Map();

// Dev flags (set as env vars on Render if needed)
const DEV_LEAK_CODE = process.env.DEV_LEAK_CODE === '1';      // respond with code for easier testing
const DEV_BYPASS_VERIFY = process.env.DEV_BYPASS_VERIFY === '1'; // allow any 6-digit code if true
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Resend setup
const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const FROM_EMAIL = process.env.RESEND_FROM || 'onboarding@resend.dev';

import bcrypt from 'bcryptjs';
function genCode(){ return ("" + Math.floor(100000 + Math.random() * 900000)).slice(-6); }
function genToken(){ return 't_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
function cryptoRandom(){ return genToken(); }

// Clean up expired codes occasionally
setInterval(()=>{
  const now=Date.now();
  for(const [email, rec] of codes){ if(rec.exp < now) codes.delete(email); }
}, 60_000).unref?.();

app.post("/auth/start", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "email_required" });
    const code = genCode();
    const hash = bcrypt.hashSync(code, 8);
    codes.set(email, { hash, exp: Date.now() + CODE_TTL_MS });
    if(!resend){
      console.warn('[RESEND] missing key; code not emailed');
      return res.json(DEV_LEAK_CODE ? { ok:true, code } : { ok:true });
    }
    const subject = 'Your AuraChat verification code';
    const text = `Your AuraChat code is ${code}. It expires in 10 minutes.`;
    const html = `<p>Your AuraChat code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`;
    const sendResp = await resend.emails.send({ from: FROM_EMAIL, to: email, subject, text, html });
    if(sendResp.error){
      console.error('[RESEND] send error', sendResp.error);
      return res.status(500).json({ error:'server_error' });
    }
    return res.json(DEV_LEAK_CODE ? { ok:true, code } : { ok:true });
  } catch(e){
    console.error(e); return res.status(500).json({ error:'server_error' });
  }
});

app.post("/auth/verify", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code  = String(req.body?.code || "").trim();
  const rec = codes.get(email);
  console.log("VERIFY ATTEMPT", { email, hasCode: !!rec });
  if (!rec) return res.status(400).json({ error: "no_pending_code" });
  if (Date.now() > rec.exp) { codes.delete(email); return res.status(400).json({ error: "expired" }); }
  if (!bcrypt.compareSync(code, rec.hash)) return res.status(400).json({ error: "bad_code" });
  codes.delete(email);
  const token = cryptoRandom();
  sessions.set(token, { email, premium: false });
  return res.json({ token, premium: false });
});

app.get("/me", (req, res) => {
  const auth = req.headers.authorization || '';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({ error:'no_token' });
  const token = auth.slice(7).trim();
  const session = sessions.get(token);
  if(!session) return res.status(401).json({ error:'bad_token' });
  return res.json({ email: session.email, premium: !!session.premium });
});

app.get('/health', (_req,res)=> res.json({ ok:true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AuraChat backend listening on", PORT));
