// AuraChat backend (ESM) – OTP login minimal implementation
// Routes: POST /auth/start, POST /auth/verify, GET /me, GET /health

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe'; // reserved for future premium checks
// import { Resend } from 'resend'; // optional email provider

const app = express();

// (Webhook would go here first if added)
// app.post('/webhook', express.raw({ type:'application/json' }), (req,res)=> res.json({ received:true }));

// JSON & CORS middleware BEFORE routes
app.use(express.json());
app.use(cors({
  origin: [/^chrome-extension:\/\//, /github\.io$/],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// In-memory stores
const users = new Map(); // email -> { id, email, premium, stripeCustomerId }
const codes = new Map(); // email -> { hash, expiresAt }
let uid = 1;
function upsertUser(email){
  let u = users.get(email);
  if(!u){ u = { id: uid++, email, premium:false, stripeCustomerId:null }; users.set(email,u); }
  return u;
}

// POST /auth/start – send code (logged)
app.post('/auth/start', (req,res)=>{
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if(!email) return res.status(400).json({ error:'email_required' });
    upsertUser(email);
    const code = ('' + Math.floor(100000 + Math.random()*900000)).slice(-6);
    const hash = bcrypt.hashSync(code, 10);
    const expiresAt = Date.now() + 10*60*1000;
    codes.set(email, { hash, expiresAt });
    console.log('[LOGIN CODE]', email, code); // TODO: send via email provider
    return res.json({ ok:true });
  } catch(e){
    console.error(e); return res.status(500).json({ error:'server_error' });
  }
});

// POST /auth/verify – verify code -> token
app.post('/auth/verify', (req,res)=>{
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const code = (req.body?.code || '').trim();
    const rec = codes.get(email);
    const u = users.get(email);
    if(!u || !rec) return res.status(400).json({ error:'no_pending_code' });
    if(Date.now() > rec.expiresAt) return res.status(400).json({ error:'expired' });
    if(!bcrypt.compareSync(code, rec.hash)) return res.status(400).json({ error:'bad_code' });
    codes.delete(email);
    const token = jwt.sign({ uid: u.id, email }, process.env.JWT_SECRET || 'dev_secret', { expiresIn:'30d' });
    return res.json({ token, premium: !!u.premium });
  } catch(e){
    console.error(e); return res.status(500).json({ error:'server_error' });
  }
});

// GET /me – validate token
app.get('/me', (req,res)=>{
  try {
    const auth = req.headers.authorization || '';
    if(!auth.startsWith('Bearer ')) return res.status(401).json({ error:'no_token' });
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'dev_secret');
    const u = [...users.values()].find(x=> x.id === payload.uid) || upsertUser(payload.email);
    return res.json({ email: u.email, premium: !!u.premium });
  } catch(e){
    return res.status(401).json({ error:'bad_token' });
  }
});

// GET /health – basic readiness
app.get('/health', (_req,res)=> res.json({ ok:true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('AuraChat backend listening on', PORT));
