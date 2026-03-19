

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const OpenAI = require("openai");
const nodemailer = require("nodemailer");
const cors = require("cors");
const path = require("path");
const db = require("./database");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Serve React admin UI (production build)
app.use("/admin", express.static(path.join(__dirname, "admin", "dist")));
app.get("/admin/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "dist", "index.html"));
});

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// 🔗 Microsoft Bookings link
const BOOKING_LINK = "https://outlook.office.com/bookwithme/user/985f08ed6d654b27b6c3fa6b3daacbc0@rentinottawa.com/meetingtype/h-nWjNZgGUWvAos0C6uVPw2?anonymous&ismsaljsauthenabled&ep=mlink";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "missing"
});

/* ---------------- In-memory contexts ---------------- */

const userContext = {};
// senderId -> propertyCode

const bookingContext = {};
// senderId -> { step: "ask_name", propertyCode }

const conversationHistory = {};
// senderId -> Array<{ role: "user"|"assistant", content: string }>

const MAX_HISTORY = 12; // messages kept per user

function pushHistory(senderId, role, content) {
  if (!conversationHistory[senderId]) conversationHistory[senderId] = [];
  conversationHistory[senderId].push({ role, content });
  if (conversationHistory[senderId].length > MAX_HISTORY) {
    conversationHistory[senderId].splice(0, conversationHistory[senderId].length - MAX_HISTORY);
  }
}

/* ---------------- Email setup ---------------- */

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASSWORD
  }
});

async function notifyAdmin(lead) {
  await transporter.sendMail({
    from: `"Rent In Ottawa Bot" <${process.env.ADMIN_EMAIL}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `New Viewing Interest – ${lead.propertyCode}`,
    text: `
New viewing interest received.

Name: ${lead.name}
Property: ${lead.propertyCode}
Status: Booking link sent via Messenger
Source: Facebook Messenger
Time: ${new Date().toLocaleString()}
    `
  });
}

/* ---------------- Facebook user name ---------------- */

async function getFacebookUserName(psid) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v18.0/${psid}`,
      {
        params: {
          fields: "first_name,last_name",
          access_token: PAGE_TOKEN
        }
      }
    );

    const first = res.data.first_name;
    const last = res.data.last_name;

    if (first || last) {
      return `${first || ""} ${last || ""}`.trim();
    }
  } catch (e) {}

  return null;
}

/* ---------------- WEBHOOK VERIFY ---------------- */

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ---------------- MESSAGE HANDLER ---------------- */

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.entry?.[0]?.messaging?.[0];
    if (!event || !event.message || event.sender.id === event.recipient.id) {
      return res.sendStatus(200);
    }

    const senderId = event.sender.id;
    const userText = event.message.text?.trim() || "";

    /* -------- Handle name capture -------- */

    const booking = bookingContext[senderId];

    if (booking?.step === "ask_name") {
      const name = userText;

      await notifyAdmin({
        name,
        propertyCode: booking.propertyCode
      });

      const reply = `Thanks ${name}. You can book a showing using the link below:\n\n${BOOKING_LINK}`;
      await sendMessage(senderId, reply);
      pushHistory(senderId, "user", userText);
      pushHistory(senderId, "assistant", reply);

      delete bookingContext[senderId];
      return res.sendStatus(200);
    }

    /* -------- Detect property code -------- */

    const codeMatch = userText.match(/prop[\s-]?\d+/i);
    if (codeMatch) {
      const num = codeMatch[0].match(/\d+/)[0];
      const newCode = `PROP-${num.padStart(3, "0")}`;
      // Reset history when user switches to a different property
      if (userContext[senderId] !== newCode) {
        conversationHistory[senderId] = [];
      }
      userContext[senderId] = newCode;
    }

    const activeCode = userContext[senderId];
    const property = activeCode
      ? db.getPropertyByCode(activeCode)
      : null;

    /* -------- No property yet -------- */

    if (!property) {
      pushHistory(senderId, "user", userText);
      const greeting = await getGreetingReply(userText, conversationHistory[senderId] || []);
      pushHistory(senderId, "assistant", greeting);
      await sendMessage(senderId, greeting);
      return res.sendStatus(200);
    }

    /* -------- Inactive property check -------- */

    if (property.status === "inactive") {
      const reply = `Sorry, ${property.code} is currently not available. Please reach out for other listings.`;
      await sendMessage(senderId, reply);
      return res.sendStatus(200);
    }

    /* -------- Booking intent detection -------- */

    const bookingIntent = /schedule|book|view|visit|see\s(the\s)?(place|unit|apartment|condo|house|property|it)|viewing|showing|tour|come by|check it out|i('m| am) interested|want to see|can i see|when can i|arrange a visit|set up a (time|meeting)|how do i (arrange|book|schedule)|i'd like to (see|visit)/i;

    if (bookingIntent.test(userText)) {
      const name = await getFacebookUserName(senderId);

      if (!name) {
        bookingContext[senderId] = {
          step: "ask_name",
          propertyCode: property.code
        };

        const reply = "Sure! Before booking, may I have your name?";
        pushHistory(senderId, "user", userText);
        pushHistory(senderId, "assistant", reply);
        await sendMessage(senderId, reply);

        return res.sendStatus(200);
      }

      await notifyAdmin({
        name,
        propertyCode: property.code
      });

      const reply = `Great ${name}! You can book a showing using the link below:\n\n${BOOKING_LINK}`;
      pushHistory(senderId, "user", userText);
      pushHistory(senderId, "assistant", reply);
      await sendMessage(senderId, reply);

      return res.sendStatus(200);
    }

    /* -------- AI property response -------- */

    pushHistory(senderId, "user", userText);
    const aiReply = await getPropertyReply(senderId, property, conversationHistory[senderId]);
    pushHistory(senderId, "assistant", aiReply);
    await sendMessage(senderId, aiReply);

    return res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

/* ---------------- AI GREETING ---------------- */

async function getGreetingReply(userText, history) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a friendly leasing assistant for Rent In Ottawa. Greet the user warmly and ask them to share the property code (e.g. PROP-001) they are interested in so you can help them."
      },
      // history already contains the current user message as last item
      ...history
    ],
    temperature: 0.4
  });

  return completion.choices[0].message.content;
}

/* ---------------- AI PROPERTY RESPONSE ---------------- */

async function getPropertyReply(senderId, property, history) {
  const descriptionSection = property.description
    ? `\nFULL LISTING DESCRIPTION:\n${property.description}`
    : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a knowledgeable and friendly leasing assistant for Rent In Ottawa.
Your job is to answer questions about the property listed below.

GUIDELINES:
- Answer ONLY what the user asked. Keep responses short and conversational (1–3 sentences).
- Understand paraphrased, casual, or indirect questions. For example:
    • "is it pet-friendly?" / "can I bring my dog?" → pets/restrictions policy
    • "what's included?" / "what do I get?" → what's covered (parking, locker, laundry, utilities)
    • "how much?" / "what's the price?" / "what's the rent?" → rent amount
    • "when can I move in?" / "when is it available?" → availability
    • "is it near transit?" / "how's the commute?" / "is it walkable?" → location & transit
    • "any restrictions?" / "house rules?" / "any rules?" → restrictions/policies
    • "is parking available?" / "do you have parking?" / "what about parking?" → parking details
    • "what floor?" / "how high up?" → floor/view info if available
    • "is there laundry?" / "washer and dryer?" → laundry details
    • "what amenities?" / "what does the building offer?" → building features
- Do NOT repeat information already covered in the conversation above.
- Do NOT end every message with a scheduling prompt. Only suggest scheduling a viewing if:
    (a) the user seems genuinely interested and a scheduling offer has NOT been made recently in the conversation, OR
    (b) the user has finished asking questions and the conversation feels like a natural conclusion.
- If the user wants more detail on something, provide it from the listing description.
- Never make up details not present in the property data or description below.

PROPERTY DETAILS:
${JSON.stringify(property, null, 2)}${descriptionSection}
        `.trim()
      },
      // history already contains the current user message as the last item
      ...history
    ],
    temperature: 0.3
  });

  return completion.choices[0].message.content;
}



/* ---------------- SEND MESSAGE ---------------- */

async function sendMessage(psid, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`,
    {
      recipient: { id: psid },
      message: { text }
    }
  );
}

/* ---------------- ADMIN API ROUTES ---------------- */

// GET /api/properties — list all properties
app.get("/api/properties", (req, res) => {
  res.json(db.getAllProperties());
});

// POST /api/parse — parse raw text into structured property fields via OpenAI
app.post("/api/parse", async (req, res) => {
  const { rawText } = req.body;
  if (!rawText || rawText.trim().length === 0) {
    return res.status(400).json({ error: "rawText is required" });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
You are a data extraction assistant. Extract property listing details from the text and return ONLY a JSON object with exactly these keys:
  code         (string, e.g. "PROP-003" — generate a placeholder like PROP-NEW if not present)
  title        (string, full property title)
  location     (string, address or neighborhood)
  rent         (string, e.g. "$1,500/month + utilities")
  availability (string, e.g. "Available now" or "March 1st")
  bedrooms     (number, e.g. 2 or 3)
  bathrooms    (number, e.g. 1 or 2.5)
  parking      (string, e.g. "1 outdoor spot" or "garage")
  restrictions (string, e.g. "no pets, no smoking, minimum lease 12 months")
  link         (string, URL or empty string if none)
  description  (string, the full original listing description including amenities, building features, location highlights, and any other details — preserve as much detail as possible)
Return nothing else. No commentary, no markdown — only the JSON object.
        `.trim()
      },
      { role: "user", content: rawText }
    ],
    temperature: 0.1
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  res.json(parsed);
});

// POST /api/properties — save a property to the database
app.post("/api/properties", (req, res) => {
  const property = req.body;
  const required = ["code", "title"];
  for (const field of required) {
    if (!property[field]) {
      return res.status(400).json({ error: `Field "${field}" is required` });
    }
  }
  property.bedrooms = Number(property.bedrooms) || 0;
  property.bathrooms = Number(property.bathrooms) || 0;
  db.insertProperty(property);
  res.status(201).json({ ok: true, code: property.code });
});

// DELETE /api/properties/:code — remove a property
app.delete("/api/properties/:code", (req, res) => {
  const { code } = req.params;
  const result = db.deleteProperty(code);
  if (result.changes === 0) {
    return res.status(404).json({ error: `Property ${code} not found` });
  }
  res.json({ ok: true });
});

// PUT /api/properties/:code — update an existing property
app.put("/api/properties/:code", (req, res) => {
  const { code } = req.params;
  const existing = db.getPropertyByCode(code);
  if (!existing) {
    return res.status(404).json({ error: `Property ${code} not found` });
  }
  const updated = { ...existing, ...req.body, code };
  updated.bedrooms = Number(updated.bedrooms) || 0;
  updated.bathrooms = Number(updated.bathrooms) || 0;
  db.insertProperty(updated);
  res.json({ ok: true, code });
});

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RIO Messenger bot running on port ${PORT}`);
});
