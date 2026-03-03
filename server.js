require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { createClient } = require("@supabase/supabase-js");
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

// ── CLIENTS ──────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── HELPER: Strip sensitive info before sending to AI ────────────
function sanitizeSMS(smsBody) {
  return smsBody
    .replace(/Bal(ance)?:?\s*Rs\.?\s*[\d,]+/gi, "") // remove balance
    .replace(/Avl\.?\s*Bal\.?:?\s*Rs\.?\s*[\d,]+/gi, "") // remove available balance
    .replace(/A\/c\s*[X\d]+/gi, "A/c XXXX") // mask account number
    .trim();
}

// ── HELPER: Parse SMS using Groq AI ─────────────────────────────
async function parseSMS(smsBody) {
  const sanitized = sanitizeSMS(smsBody);

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      
        {
        role: "system",
        content: `You are a financial SMS parser for Indian banks. Extract transaction details from ANY Indian bank SMS format.

Indian banks and their SMS formats you must handle:
- BOB: "Rs.80.00 Dr. from A/C XXXXXXXX1234"
- HDFC: "Rs.500 debited from a/c **1234"
- SBI: "Your A/c XX1234 debited Rs 1000"
- ICICI: "ICICI Bank Acct XX1234 debited INR 200"
- Axis: "INR 300.00 debited from Axis Bank Acct"
- PhonePe SMS: "PhonePe transaction of Rs.80"
- GPay: "Google Pay: Rs 150 paid to"
- Paytm: "Paytm payment of Rs.250"

Rules:
1. "Dr." or "debited" or "paid" = money going OUT (capture this)
2. "Cr." or "credited" or "received" = money coming IN (skip unless salary)
3. Extract: amount (number only), merchant (UPI ID or merchant name), category
4. For UPI IDs like "omkarne789@ybl" → merchant = the name before @
5. ALWAYS strip: account balance, account numbers, OTP
6. If "AvlBal" or "Available Balance" appears → remove it completely

Categories:
- Food Delivery: Swiggy, Zomato, Dunzo
- Shopping: Amazon, Flipkart, Myntra, Meesho
- Subscriptions: Netflix, Spotify, Hotstar, Prime
- Groceries: Blinkit, Zepto, BigBasket, DMart
- Investments: SIP, MF, mutual fund, stocks
- Transport: Uber, Ola, Metro, IRCTC
- Others: everything else including UPI transfers

Respond ONLY in this exact JSON format, no explanation, no markdown:
{"isTransaction":true,"amount":80,"merchant":"Omkar (UPI)","category":"Others","type":"debit"}`,
      },
      {
        role: "user",
        content: `Parse this SMS: ${sanitized}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 150,
  });

  const text = response.choices[0]?.message?.content || "{}";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── ROUTE: Health check ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "MoneyX backend running ✅", version: "1.0.0" });
});

// ── ROUTE: Receive SMS from Android app ─────────────────────────
app.post("/api/sms", async (req, res) => {
  try {
    const { body, timestamp, userId } = req.body;

    // Skip non-transaction SMS
    const isTransaction = /debited|credited|Rs\.|INR|UPI|payment/i.test(body);
    if (!isTransaction) {
      return res.json({ skipped: true, reason: "Not a transaction SMS" });
    }

    // Parse with Groq AI
    const parsed = await parseSMS(body);
    if (!parsed.amount) {
      return res.json({ skipped: true, reason: "Could not extract amount" });
    }

    // Get month name
    const date = timestamp ? new Date(timestamp) : new Date();
    const month = date.toLocaleString("en", { month: "short" });

    // Save to Supabase
    const txn = {
      user_id: userId || null,
      merchant: parsed.merchant || "Unknown",
      amount: parsed.amount,
      category: parsed.category || "Others",
      type: parsed.type || "debit",
      raw_sms: body,
      month,
      created_at: date.toISOString(),
    };

    const { data, error } = await supabase
      .from("transactions")
      .insert(txn)
      .select()
      .single();

    if (error) throw error;

    // Check budget and send WhatsApp alert if needed
    if (userId) {
      await checkBudgetAlert(userId, parsed.category, parsed.amount);
    }

    res.json({ success: true, transaction: data });
  } catch (err) {
    console.error("SMS parse error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE: Get all transactions ──────────────────────────────────
app.get("/api/transactions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { month } = req.query;

    let query = supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (month) query = query.eq("month", month);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, transactions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE: Get insights ──────────────────────────────────────────
app.get("/api/insights/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Get last 3 months of transactions
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: txns, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", threeMonthsAgo.toISOString());

    if (error) throw error;

    // Group by month and category
    const byMonth = {};
    txns.forEach((t) => {
      if (!byMonth[t.month]) byMonth[t.month] = {};
      byMonth[t.month][t.category] =
        (byMonth[t.month][t.category] || 0) + t.amount;
    });

    // Generate insights
    const insights = [];
    const months = Object.keys(byMonth);

    if (months.length >= 2) {
      const first = byMonth[months[0]];
      const last = byMonth[months[months.length - 1]];

      Object.keys(last).forEach((cat) => {
        if (!first[cat]) return;
        const pct = Math.round(((last[cat] - first[cat]) / first[cat]) * 100);
        if (Math.abs(pct) >= 20) {
          const isInvest = cat === "Investments";
          const isBad = isInvest ? pct < 0 : pct > 0;
          insights.push({
            type: isBad ? "danger" : "success",
            icon: isBad ? "🚨" : "✅",
            title: `${cat} ${pct > 0 ? "up" : "down"} ${Math.abs(pct)}%`,
            desc: `₹${first[cat].toLocaleString("en-IN")} → ₹${last[cat].toLocaleString("en-IN")} from ${months[0]} to ${months[months.length - 1]}`,
          });
        }
      });
    }

    res.json({ success: true, insights, byMonth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE: Save user preferences ─────────────────────────────────
app.post("/api/user", async (req, res) => {
  try {
    const { whatsapp, budgets, alert_day, alert_time } = req.body;

    const { data, error } = await supabase
      .from("users")
      .insert({ whatsapp, budgets, alert_day, alert_time })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HELPER: Check budget and alert via WhatsApp ──────────────────
async function checkBudgetAlert(userId, category, newAmount) {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (!user?.budgets?.[category] || !user?.whatsapp) return;

    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    const { data: txns } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("category", category)
      .gte("created_at", monthStart);

    const totalSpent =
      (txns || []).reduce((s, t) => s + t.amount, 0) + newAmount;
    const budget = user.budgets[category];

    if (totalSpent > budget * 0.9 && process.env.TWILIO_SID !== "fill_later") {
      const twilio = require("twilio")(
        process.env.TWILIO_SID,
        process.env.TWILIO_TOKEN
      );
      await twilio.messages.create({
        from: "whatsapp:+14155238886",
        to: `whatsapp:${user.whatsapp}`,
        body: `⚠️ MoneyX Alert\n\n${category} budget ${totalSpent > budget ? "exceeded" : "90% used"}!\n\nSpent: ₹${totalSpent.toLocaleString("en-IN")}\nBudget: ₹${budget.toLocaleString("en-IN")}\n\nOpen MoneyX to review your spending.`,
      });
    }
  } catch (err) {
    console.error("Alert error:", err.message);
  }
}

// ── CRON: Weekly WhatsApp digest every Monday 9am ────────────────
cron.schedule("0 9 * * MON", async () => {
  if (process.env.TWILIO_SID === "fill_later") return;

  try {
    const { data: users } = await supabase
      .from("users")
      .select("*")
      .not("whatsapp", "is", null);

    const twilio = require("twilio")(
      process.env.TWILIO_SID,
      process.env.TWILIO_TOKEN
    );

    for (const user of users || []) {
      const weekAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data: txns } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", weekAgo);

      const byCategory = {};
      (txns || []).forEach((t) => {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      });

      const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
      const lines = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `• ${cat}: ₹${amt.toLocaleString("en-IN")}`)
        .join("\n");

      await twilio.messages.create({
        from: "whatsapp:+14155238886",
        to: `whatsapp:${user.whatsapp}`,
        body: `💸 MoneyX Weekly Digest\n\nTotal spent: ₹${total.toLocaleString("en-IN")}\n\n${lines}\n\n💡 Check your full dashboard for insights!`,
      });
    }
  } catch (err) {
    console.error("Weekly digest error:", err.message);
  }
});

// ── START SERVER ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ MoneyX backend running on port ${PORT}`);
  console.log(`📡 SMS endpoint: http://localhost:${PORT}/api/sms`);
  console.log(`🗄️  Database: Supabase connected`);
  console.log(`🤖 AI: Groq (llama-3.3-70b-versatile)`);
});