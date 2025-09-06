import express from "express";
import cors from "cors";
import { Resend } from "resend";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]:)/, '$1');
const DB_PATH = path.join(__dirname, 'db.json');

function readDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading DB:", e);
  }
  return { codes: {}, sessions: {} };
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error writing DB:", e);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// normalize helper (final unified version)
const normalizeEmail = (e) => String(e || "").trim().toLowerCase();

// --------------------------------------------------
// In-memory stores (cleared on restart)
// --------------------------------------------------
// codes: email -> { hash, exp }
// const codes = new Map();
// sessions: token -> { email, premium }
// const sessions = new Map();

// Dev flags (set as env vars on Render if needed)
const DEV_LEAK_CODE = process.env.DEV_LEAK_CODE === '1';
const DEV_BYPASS_VERIFY = process.env.DEV_BYPASS_VERIFY === '1';
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret'; // legacy pending token secret
const JWT_SECRET = process.env.JWT_SECRET || 'dev_dev_dev_change_me';
const APP_NAME = 'AuraChat';
const nowSec = () => Math.floor(Date.now()/1000);
const minutes = (m) => m*60;
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
setInterval(() => {
  const now = Date.now();
  const db = readDb();
  let changed = false;
  for (const email in db.codes) {
    if (db.codes[email].exp < now) {
      delete db.codes[email];
      changed = true;
    }
  }
  if (changed) writeDb(db);
}, 60 * 1000); // every minute

// Legacy stateful endpoint (kept for backward compat) ---------------------------------
app.post("/auth/start", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "email_required" });
    const code = genCode();
    const hash = bcrypt.hashSync(code, 8);
    const db = readDb();
    db.codes[email] = { hash, exp: Date.now() + CODE_TTL_MS };
    writeDb(db);
    // create stateless pending token (so verify works even if db entry lost)
    const pendingPayload = { email, hash, exp: Date.now() + CODE_TTL_MS };
    const pendingData = Buffer.from(JSON.stringify(pendingPayload)).toString('base64url');
    const pendingSig = crypto.createHmac('sha256', AUTH_SECRET).update(pendingData).digest('base64url');
    const pendingToken = `${pendingData}.${pendingSig}`;
    if(!resend){
      console.warn('[RESEND] missing key; code not emailed');
      return res.json(DEV_LEAK_CODE ? { ok:true, code, pendingToken } : { ok:true, pendingToken });
    }
    const subject = 'Your AuraChat verification code';
    const text = `Your AuraChat code is ${code}. It expires in 10 minutes.`;
    const html = `<p>Your AuraChat code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`;
    const sendResp = await resend.emails.send({ from: FROM_EMAIL, to: email, subject, text, html });
    if(sendResp.error){
      console.error('[RESEND] send error', sendResp.error);
      return res.status(500).json({ error:'server_error' });
    }
    return res.json(DEV_LEAK_CODE ? { ok:true, code, pendingToken } : { ok:true, pendingToken });
  } catch(e){
    console.error(e); return res.status(500).json({ error:'server_error' });
  }
});

// New stateless code sender ------------------------------------------------------------
// POST /auth/send-code { email }
app.post('/auth/send-code', async (req,res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if(!email) return res.status(400).json({ error:'missing_email' });
    const code = (''+Math.floor(100000 + Math.random()*900000));
    const payload = { email, code, iat: nowSec(), exp: nowSec() + minutes(10), typ:'verify_code' };
    const token = jwt.sign(payload, JWT_SECRET);
    if(!resend){
      console.warn('[RESEND] missing key; code not emailed');
      return res.json({ token, leak: DEV_LEAK_CODE ? code : undefined });
    }
    await resend.emails.send({
      from: `${APP_NAME} <onboarding@resend.dev>`,
      to: email,
      subject: `Your ${APP_NAME} verification code`,
      text: `Your ${APP_NAME} code is ${code}. It expires in 10 minutes.`
    });
    return res.json({ token });
  } catch(e){
    console.error('send-code error', e);
    return res.status(500).json({ error:'send_code_failed' });
  }
});

app.post('/auth/verify', (req,res) => {
  // New stateless path: expects { token, code } OR legacy { email, code, pendingToken }
  const verToken = req.body?.token || req.query?.token || null; // stateless verification JWT
  const multiCode = req.body?.code ?? req.body?.sixDigitCode ?? req.body?.otp ?? req.body?.pin ?? req.query?.code ?? '';
  let email = normalizeEmail(req.body?.email);
  let code = String(multiCode || '').trim();
  if(verToken){
    if(!code) return res.status(400).json({ error:'missing_code' });
    let data;
    try { data = jwt.verify(verToken, JWT_SECRET); } catch { return res.status(401).json({ error:'invalid_or_expired_token' }); }
    if(data?.typ !== 'verify_code') return res.status(400).json({ error:'bad_token_type' });
    if(!email) email = normalizeEmail(data.email);
    if(!email) return res.status(400).json({ error:'invalid_email' });
    if(!DEV_BYPASS_VERIFY && code !== data.code) return res.status(401).json({ error:'wrong_code' });
    // issue session JWT (30 days)
    const session = jwt.sign({ sub: email, scope:['premium:check'], iat: nowSec(), exp: nowSec()+minutes(60*24*30) }, JWT_SECRET);
    return res.json({ ok:true, email, session, token: session, premium:false });
  }
  // Legacy fallback (pendingToken/email stored in file DB)
  const pendingToken = req.body?.pendingToken ? String(req.body.pendingToken) : null;
  const db = readDb();
  const rec = db.codes[email];
  let hash = rec?.hash; let exp = rec?.exp;
  if((!rec || !hash) && pendingToken){
    try {
      const [dataB64, sig] = pendingToken.split('.');
      const expectSig = crypto.createHmac('sha256', AUTH_SECRET).update(dataB64).digest('base64url');
      if(sig === expectSig){
        const payload = JSON.parse(Buffer.from(dataB64,'base64url').toString('utf8'));
        if(payload.email === email){ hash = payload.hash; exp = payload.exp; }
      }
    } catch(e){ console.warn('pending token parse failed', e.message); }
  }
  console.log('VERIFY ATTEMPT (legacy)', { email, hasCode: !!rec });
  if(!hash) return res.status(400).json({ error:'no_pending_code' });
  if(Date.now() > exp){ if(rec){ delete db.codes[email]; writeDb(db); } return res.status(400).json({ error:'expired' }); }
  if(!bcrypt.compareSync(code, hash) && !DEV_BYPASS_VERIFY) return res.status(400).json({ error:'bad_code' });
  if(rec){ delete db.codes[email]; }
  const legacySession = cryptoRandom();
  db.sessions[legacySession] = { email, premium:false }; writeDb(db);
  return res.json({ token: legacySession, premium:false, email, ok:true });
});

app.get('/me', (req,res) => {
  const auth = req.headers.authorization || '';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({ error:'no_token' });
  const token = auth.slice(7).trim();
  // Try stateless session first
  try {
    const data = jwt.verify(token, JWT_SECRET);
    if(data?.sub){ return res.json({ email:data.sub, premium:false }); }
  } catch { /* fall back */ }
  // Legacy fallback
  const db = readDb();
  const sess = db.sessions[token];
  if(!sess) return res.status(401).json({ error:'unauthorized' });
  return res.json({ email: sess.email, premium: sess.premium });
});

app.get('/health', (_req,res)=> res.json({ ok:true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AuraChat backend listening on", PORT));
