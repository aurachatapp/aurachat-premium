// backend/index.js
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// CORS + JSON for normal routes
app.use(cors());
app.use(express.json());

// Health
app.get("/", (_, res) => res.send("AuraChat billing backend OK"));

// Exchange a Stripe Checkout session_id for a signed JWT
app.get("/exchange-session", async (req, res) => {
  try {
    const session_id = String(req.query.session_id || "");
    if (!session_id) return res.status(400).json({ error: "missing session_id" });

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer", "subscription"]
    });

    const paid = session.payment_status === "paid";
    const complete = session.status === "complete"; // Checkout Session completed
    const sub = session.subscription;
    const subOk = sub && ["active", "trialing"].includes(sub.status);
    if (!paid && !complete && !subOk) {
      return res.status(402).json({ error: "not_paid_or_complete" });
    }

    const email =
      session.customer_details?.email ||
      (typeof session.customer === "object" ? session.customer?.email : "") ||
      "";

    const cid =
      (typeof session.customer === "string" && session.customer) ||
      (typeof session.customer === "object" && session.customer?.id) ||
      "";

    if (!email) return res.status(400).json({ error: "missing_email" });

    const token = jwt.sign({ cid, email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    return res.json({ session: token });
  } catch (err) {
    console.error("exchange-session error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// Validate a stored token and re-check Stripe
app.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer (.+)$/);
    if (!m) return res.status(401).json({ error: "missing_token" });

    const payload = jwt.verify(m[1], process.env.JWT_SECRET); // { cid?, email }
    let customerId = payload.cid || "";

    if (!customerId) {
      const customers = await stripe.customers.list({ email: payload.email, limit: 1 });
      if (!customers.data.length) return res.json({ premium: false });
      customerId = customers.data[0].id;
    }

    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all" });
    const premium = subs.data.some(s => ["active", "trialing"].includes(s.status));
    return res.json({ premium, email: payload.email });
  } catch (err) {
    console.error("me error:", err);
    return res.status(401).json({ error: "invalid_token" });
  }
});

// Stripe webhook (raw body ONLY here)
app.post("/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  try {
    // If you’ve set STRIPE_WEBHOOK_SECRET, verify; otherwise just log and accept.
    const sig = req.headers["stripe-signature"];
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      console.log("Stripe event:", event.type);
    } else {
      console.log("Webhook received (no verification configured).");
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
