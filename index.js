

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
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------------- In-memory contexts ---------------- */

const userContext = {};     
// senderId -> propertyCode

const bookingContext = {};  
// senderId -> { step: "ask_name", propertyCode }

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

      await sendMessage(
        senderId,
        `Thanks ${name}. You can book a showing using the link below:\n\n${BOOKING_LINK}`
      );

      delete bookingContext[senderId];
      return res.sendStatus(200);
    }

    /* -------- Detect property code -------- */

    const codeMatch = userText.match(/prop[\s-]?\d+/i);
    if (codeMatch) {
      const num = codeMatch[0].match(/\d+/)[0];
      userContext[senderId] = `PROP-${num.padStart(3, "0")}`;
    }

    const activeCode = userContext[senderId];
    const property = activeCode
      ? db.getPropertyByCode(activeCode)
      : null;

    /* -------- No property yet -------- */

    if (!property) {
      const greeting = await getGreetingReply(userText);
      await sendMessage(senderId, greeting);
      return res.sendStatus(200);
    }

    /* -------- Booking intent detection -------- */

    if (/schedule|book|view|visit|see the place|viewing/i.test(userText)) {
      const name = await getFacebookUserName(senderId);

      if (!name) {
        bookingContext[senderId] = {
          step: "ask_name",
          propertyCode: property.code
        };

        await sendMessage(
          senderId,
          "Sure. Before booking, may I have your name?"
        );

        return res.sendStatus(200);
      }

      await notifyAdmin({
        name,
        propertyCode: property.code
      });

      await sendMessage(
        senderId,
        `Great ${name}. You can book a showing using the link below:\n\n${BOOKING_LINK}`
      );

      return res.sendStatus(200);
    }

    /* -------- AI property response -------- */

    const aiReply = await getPropertyReply(userText, property);
    await sendMessage(senderId, aiReply);

    return res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

/* ---------------- AI GREETING ---------------- */

async function getGreetingReply(userText) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a friendly leasing assistant. Ask for a property code like PROP-001."
      },
      {
        role: "user",
        content: userText || "User started chat"
      }
    ],
    temperature: 0.4
  });

  return completion.choices[0].message.content;
}

/* ---------------- AI PROPERTY RESPONSE ---------------- */

async function getPropertyReply(userMessage, property) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a leasing assistant.

Rules:
- Short answers only
- Do not repeat full title unless asked
- Use general Ottawa knowledge for location
- Do not give exact distances
- End with: "Would you like to schedule a viewing?"
        `.trim()
      },
      {
        role: "user",
        content: `
User message:
"${userMessage}"

Property data:
${JSON.stringify(property, null, 2)}
        `.trim()
      }
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
  restrictions (string, e.g. "no pets" or "no smoking")
  link         (string, URL or empty string if none)
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

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RIO Messenger bot running on port ${PORT}`);
});
