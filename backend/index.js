import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// --------------------------------------------------
// In-memory stores (cleared on restart)
// --------------------------------------------------
// codes: email -> { code, exp }
const codes = new Map();
// sessions: token -> { email, premium }
const sessions = new Map();

// Dev flags (set as env vars on Render if needed)
const DEV_LEAK_CODE = process.env.DEV_LEAK_CODE === '1';      // respond with code for easier testing
const DEV_BYPASS_VERIFY = process.env.DEV_BYPASS_VERIFY === '1'; // allow any 6-digit code if true
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function genCode(){
  return ("" + Math.floor(100000 + Math.random() * 900000)).slice(-6);
}
function genToken(){
  return 't_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// Clean up expired codes occasionally
setInterval(()=>{
  const now=Date.now();
  for(const [email, rec] of codes){ if(rec.exp < now) codes.delete(email); }
}, 60_000).unref?.();

app.post("/auth/start", (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  if(!email) return res.status(400).json({ error: "email_required" });
  const code = genCode();
  codes.set(email, { code, exp: Date.now() + CODE_TTL_MS });
  console.log("[LOGIN CODE]", email, code);
  return res.json(DEV_LEAK_CODE ? { ok:true, code } : { ok:true });
});

app.post("/auth/verify", (req, res) => {
  const rawEmail = (req.body?.email || "").trim();
  const email = rawEmail.toLowerCase();
  const code = (req.body?.code || "").trim();
  // Relaxed email check: must contain '@' and at least 3 chars total
  if(!email || email.length < 3 || !email.includes('@')) return res.status(400).json({ error:'bad_email' });
  if(!/^[0-9]{6}$/.test(code)) return res.status(400).json({ error:'bad_code' });

  const rec = codes.get(email);
  if(process.env.DEV_LOG_VERIFY==='1'){
    console.log('[VERIFY ATTEMPT]', { email, code, hasRecord: !!rec, bypass: DEV_BYPASS_VERIFY });
  }
  if(!rec){
    if(!DEV_BYPASS_VERIFY) return res.status(400).json({ error:'no_code' });
  } else {
    if(rec.exp < Date.now()){ codes.delete(email); return res.status(400).json({ error:'expired' }); }
    if(!DEV_BYPASS_VERIFY && rec.code !== code) return res.status(400).json({ error:'bad_code' });
    codes.delete(email); // prevent reuse
  }

  const token = genToken();
  sessions.set(token, { email, premium:false });
  return res.json({ token, premium:false });
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
