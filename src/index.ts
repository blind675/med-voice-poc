import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { twiml } from "twilio";
import { appendTurn, initSession, setData, getSession } from "./storage/logger";
import { normalizeRomanianEmailSpoken, looksLikeEmail } from "./util/roEmail";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

const SAY = (vr: twiml.VoiceResponse, text: string) =>
    vr.say({ language: "ro-RO" }, text);

const GATHER = (
    vr: twiml.VoiceResponse,
    action: string,
    prompt: string,
    opts?: Partial<twiml.GatherAttributes>
) => {
    const gather = vr.gather({
        input: "speech",
        language: "ro-RO",
        action,
        method: "POST",
        speechTimeout: "auto",
        actionOnEmptyResult: true,
        ...opts
    });
    gather.say({ language: "ro-RO" }, prompt);
};

// Health
app.get("/health", (_req, res) => res.status(200).send("ok"));

// Entry point
app.post("/voice", async (req, res) => {
    const { CallSid, From, To } = req.body || {};
    await initSession(CallSid, From, To);
    const vr = new twiml.VoiceResponse();
    vr.say(
        { language: "ro-RO", voice: "Google.ro-RO-Wavenet-B" },
        "Bună! Ați sunat la un numar special. Acest apel este gestionat de un asistent A.I. si nu este o linie pentru urgențe medicale. Va rog să-mi spuneți numele dumneavoastră."
    );

    vr.gather({
        input: ["speech"],
        action: "/step/name",
        method: "POST",
        language: "ro-RO",
        speechTimeout: "auto",
        actionOnEmptyResult: true
    });

    res.type("text/xml").send(vr.toString());
});

// Consent
app.post("/step/consent", async (req, res) => {
    const { CallSid } = req.body || {};
    const saidRaw = (req.body.SpeechResult || "").trim();
    const said = saidRaw.toLowerCase();
    const conf = Number(req.body.Confidence || 0);

    await appendTurn(CallSid, { state: "consent", speech: saidRaw, confidence: conf });

    const yesWords = ["da", "ok", "sigur", "continua", "continuă", "desigur", "bine"];
    const noWords = ["nu", "nu vreau", "nu doresc", "inchide", "închide"];

    const isYes = yesWords.some(w => said.includes(w));
    const isNo = noWords.some(w => said.includes(w));

    const vr = new twiml.VoiceResponse();

    if (isNo) {
        SAY(vr, "Am înțeles. O zi bună!");
        vr.hangup();
        return res.type("text/xml").send(vr.toString());
    }
    if (!isYes) {
        GATHER(vr, "/step/consent", "Nu am înțeles. Doriți să continuăm?");
        return res.type("text/xml").send(vr.toString());
    }

    // Next: Name
    GATHER(vr, "/step/name", "Mulțumesc. Care este numele complet?");
    res.type("text/xml").send(vr.toString());
});

// Name → confirm
app.post("/step/name", async (req, res) => {
    const { CallSid } = req.body || {};
    const saidRaw = (req.body.SpeechResult || "").trim();
    const conf = Number(req.body.Confidence || 0);
    await appendTurn(CallSid, { state: "name", speech: saidRaw, confidence: conf });

    const vr = new twiml.VoiceResponse();
    GATHER(vr, "/step/name_confirm", `Am înțeles: ${saidRaw}. Este corect?`);
    res.type("text/xml").send(vr.toString());
});

app.post("/step/name_confirm", async (req, res) => {
    const { CallSid } = req.body || {};
    const said = (req.body.SpeechResult || "").trim().toLowerCase();
    await appendTurn(CallSid, { state: "name_confirm", speech: said });

    const yes = ["da", "corect", "este corect", "așa este"].some(w => said.includes(w));
    const vr = new twiml.VoiceResponse();

    if (!yes) {
        GATHER(vr, "/step/name", "Vă rog repetați numele complet.");
        return res.type("text/xml").send(vr.toString());
    }

    // Persist confirmed name (use the last name turn to fetch original)
    const sess = await getSession(CallSid);
    const lastNameTurn = [...sess.turns].reverse().find(t => t.state === "name");
    const nameText = lastNameTurn?.speech || "";
    await setData(CallSid, { name: nameText });

    // Next: optional email
    GATHER(
        vr,
        "/step/email",
        "Doriți să primiți invitație pe email? Dacă da, spuneți adresa. Dacă nu, spuneți 'nu'."
    );
    res.type("text/xml").send(vr.toString());
});

// Email (optional) → confirm or skip
app.post("/step/email", async (req, res) => {
    const { CallSid } = req.body || {};
    const saidRaw = (req.body.SpeechResult || "").trim();
    const conf = Number(req.body.Confidence || 0);
    await appendTurn(CallSid, { state: "email", speech: saidRaw, confidence: conf });

    const said = saidRaw.toLowerCase();
    const vr = new twiml.VoiceResponse();

    if (["nu", "nu vreau", "nu doresc"].some(w => said.includes(w))) {
        // skip email
        GATHER(vr, "/step/reason", "Am înțeles. Care este motivul vizitei?");
        return res.type("text/xml").send(vr.toString());
    }

    const normalized = normalizeRomanianEmailSpoken(saidRaw);
    const maybe = looksLikeEmail(normalized) ? normalized : saidRaw;

    GATHER(vr, "/step/email_confirm", `Am înțeles: ${maybe}. Este corect?`);
    res.type("text/xml").send(vr.toString());
});

app.post("/step/email_confirm", async (req, res) => {
    const { CallSid } = req.body || {};
    const said = (req.body.SpeechResult || "").trim().toLowerCase();
    await appendTurn(CallSid, { state: "email_confirm", speech: said });

    const yes = ["da", "corect", "este corect", "așa este"].some(w => said.includes(w));
    const vr = new twiml.VoiceResponse();

    if (!yes) {
        GATHER(vr, "/step/email", "Vă rog repetați adresa de email sau spuneți 'nu' pentru a sări peste.");
        return res.type("text/xml").send(vr.toString());
    }

    // Save normalized email (from prior turn)
    // We re-derive it from the previous email turn for safety.
    const sess = await getSession(CallSid);
    const lastEmailTurn = [...sess.turns].reverse().find(t => t.state === "email");
    const orig = lastEmailTurn?.speech || "";
    const normalized = normalizeRomanianEmailSpoken(orig);
    await setData(CallSid, { email: looksLikeEmail(normalized) ? normalized : orig });

    // Next: reason
    GATHER(vr, "/step/reason", "Mulțumesc. Care este motivul vizitei?");
    res.type("text/xml").send(vr.toString());
});

// Reason → confirm (keeps it simple)
app.post("/step/reason", async (req, res) => {
    const { CallSid } = req.body || {};
    const saidRaw = (req.body.SpeechResult || "").trim();
    const conf = Number(req.body.Confidence || 0);
    await appendTurn(CallSid, { state: "reason", speech: saidRaw, confidence: conf });

    const vr = new twiml.VoiceResponse();
    GATHER(vr, "/step/reason_confirm", `Am înțeles: ${saidRaw}. Este corect?`);
    res.type("text/xml").send(vr.toString());
});

app.post("/step/reason_confirm", async (req, res) => {
    const { CallSid } = req.body || {};
    const said = (req.body.SpeechResult || "").trim().toLowerCase();
    await appendTurn(CallSid, { state: "reason_confirm", speech: said });

    const yes = ["da", "corect", "este corect", "așa este"].some(w => said.includes(w));
    const vr = new twiml.VoiceResponse();

    if (!yes) {
        GATHER(vr, "/step/reason", "Vă rog repetați pe scurt motivul vizitei.");
        return res.type("text/xml").send(vr.toString());
    }

    // Save reason
    const sess = await getSession(CallSid);
    const lastTurn = [...sess.turns].reverse().find(t => t.state === "reason");
    await setData(CallSid, { reason: lastTurn?.speech || "" });

    // Next: date
    GATHER(
        vr,
        "/step/date",
        "În ce zi preferați programarea? De exemplu, 'joi' sau '25 august'."
    );
    res.type("text/xml").send(vr.toString());
});

// Date (text only for now) → confirm
app.post("/step/date", async (req, res) => {
    const { CallSid } = req.body || {};
    const saidRaw = (req.body.SpeechResult || "").trim();
    const conf = Number(req.body.Confidence || 0);
    await appendTurn(CallSid, { state: "date", speech: saidRaw, confidence: conf });

    const vr = new twiml.VoiceResponse();
    GATHER(vr, "/step/date_confirm", `Ați spus: ${saidRaw}. Este corect?`);
    res.type("text/xml").send(vr.toString());
});

app.post("/step/date_confirm", async (req, res) => {
    const { CallSid } = req.body || {};
    const said = (req.body.SpeechResult || "").trim().toLowerCase();
    await appendTurn(CallSid, { state: "date_confirm", speech: said });

    const yes = ["da", "corect", "este corect", "așa este"].some(w => said.includes(w));
    const vr = new twiml.VoiceResponse();

    if (!yes) {
        GATHER(vr, "/step/date", "Vă rog repetați ziua preferată.");
        return res.type("text/xml").send(vr.toString());
    }

    // Save raw date text (we'll parse later)
    const sess = await getSession(CallSid);
    const lastTurn = [...sess.turns].reverse().find(t => t.state === "date");
    await setData(CallSid, { dateText: lastTurn?.speech || "" });

    // Next: time window
    GATHER(
        vr,
        "/step/time_window",
        "Ce interval orar preferați? De exemplu, 'între 10 și 14' sau 'după 16'."
    );
    res.type("text/xml").send(vr.toString());
});

// Time window → confirm
app.post("/step/time_window", async (req, res) => {
    const { CallSid } = req.body || {};
    const saidRaw = (req.body.SpeechResult || "").trim();
    const conf = Number(req.body.Confidence || 0);
    await appendTurn(CallSid, { state: "time_window", speech: saidRaw, confidence: conf });

    const vr = new twiml.VoiceResponse();
    GATHER(vr, "/step/time_window_confirm", `Ați spus: ${saidRaw}. Este corect?`);
    res.type("text/xml").send(vr.toString());
});

app.post("/step/time_window_confirm", async (req, res) => {
    const { CallSid } = req.body || {};
    const said = (req.body.SpeechResult || "").trim().toLowerCase();
    await appendTurn(CallSid, { state: "time_window_confirm", speech: said });

    const yes = ["da", "corect", "este corect", "așa este"].some(w => said.includes(w));
    const vr = new twiml.VoiceResponse();

    if (!yes) {
        GATHER(vr, "/step/time_window", "Vă rog repetați intervalul orar preferat.");
        return res.type("text/xml").send(vr.toString());
    }

    // Save raw time window text
    const sess = await getSession(CallSid);
    const lastTurn = [...sess.turns].reverse().find(t => t.state === "time_window");
    await setData(CallSid, { timeWindowText: lastTurn?.speech || "" });

    // Summary (placeholder; slot search + booking in later steps)
    const s = await getSession(CallSid);
    const name = s.data.name || "nespecificat";
    const email = s.data.email ? `, email ${s.data.email}` : "";
    const reason = s.data.reason || "nespecificat";
    const dateText = s.data.dateText || "nespecificat";
    const twText = s.data.timeWindowText || "nespecificat";

    SAY(
        vr,
        `Mulțumesc. Am notat: ${name}${email}. Motivul vizitei: ${reason}. Ziua: ${dateText}. Intervalul orar: ${twText}. În pasul următor vom verifica disponibilitatea și vom propune două variante.`
    );
    vr.hangup();
    res.type("text/xml").send(vr.toString());
});

app.listen(port, () => {
    console.log(`Voice POC listening on :${port}`);
});
