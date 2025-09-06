import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory code store (email -> code) purely for demo; cleared each restart
const codes = new Map();

app.post("/auth/start", (req, res) => {
  // expect { email }
  // generate 6-digit code, log it, store in memory
  const email = (req.body?.email || "").trim().toLowerCase();
  if(!email) return res.status(400).json({ error: "email_required" });
  const code = ("" + Math.floor(100000 + Math.random() * 900000)).slice(-6);
  codes.set(email, code);
  console.log("[LOGIN CODE]", email, code);
  res.json({ ok: true });
});

app.post("/auth/verify", (req, res) => {
  // expect { email, code }
  // check code, if correct issue JWT
  const email = (req.body?.email || "").trim().toLowerCase();
  const code = (req.body?.code || "").trim();
  const stored = codes.get(email);
  if(!stored) return res.status(400).json({ error: "no_code" });
  if(stored !== code) return res.status(400).json({ error: "bad_code" });
  codes.delete(email);
  res.json({ token: "fake-jwt-for-now", premium: false });
});

app.get("/me", (req, res) => {
  // require Authorization: Bearer <token>
  const auth = req.headers.authorization || "";
  if(!auth.startsWith("Bearer ")) return res.status(401).json({ error: "no_token" });
  // In the stub we don't validate; a real version would verify JWT
  res.json({ email: "demo@example.com", premium: false });
});

// Optional health route (not requested but useful)
app.get('/health', (_req,res)=> res.json({ ok:true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AuraChat minimal backend listening on", PORT));
