import express from "express";
import cors from "cors";
import Stripe from "stripe";
import bodyParser from "body-parser";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());

// JSON for normal routes
app.use(express.json());

// Health check
app.get("/", (_, res) => res.send("AuraChat billing backend OK"));

// Subscription status endpoint
app.get("/subscription-status", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "missing email" });

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (!customers.data.length) return res.json({ premium: false });

    const customerId = customers.data[0].id;
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      expand: ["data.latest_invoice.payment_intent"]
    });

    const premium = subs.data.some(sub =>
      ["trialing", "active"].includes(sub.status)
    );

    res.json({ premium });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  }
});

// Webhook route (raw body only here)
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    let event;
    try {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "checkout.session.completed"
      ].includes(event.type)
    ) {
      console.log("Stripe event:", event.type);
    }

    res.json({ received: true });
  }
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
