"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const twilio_1 = require("twilio");
const logger_1 = require("./storage/logger");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use(body_parser_1.default.urlencoded({ extended: false }));
const PROMPTS = {
    introOrder: "Bună! Ați sunat la centrul de comenzi pentru fabrica de canapele. Acest apel este gestionat de un asistent AI. Vă pot ajuta să înregistrați o cerere de comandă pentru o canapea. Vă rog să îmi spuneți ce doriți să comandați: tipul canapelei, dimensiunea aproximativă, culoarea sau materialul dorit și cantitatea.",
    customerDelivery: "Mulțumesc. Acum vă rog să îmi spuneți numele dumneavoastră, localitatea pentru livrare și dacă aveți un termen preferat de livrare.",
    fallbackOrder: "Nu am înțeles detaliile comenzii. Vă rog să repetați ce canapea doriți să comandați, inclusiv tipul, dimensiunea, culoarea sau materialul și cantitatea.",
    fallbackCustomerDelivery: "Nu am înțeles detaliile pentru client și livrare. Vă rog să repetați numele dumneavoastră, localitatea pentru livrare și termenul preferat.",
    finalSuffix: "Un consultant vă va suna pentru confirmarea detaliilor, estimarea prețului și termenul final de producție. Vă mulțumim și o zi bună!"
};
const say = (vr, text) => {
    vr.say({ language: "ro-RO" }, text);
};
const gather = (vr, action, prompt, opts) => {
    const g = vr.gather({
        input: ["speech"],
        language: "ro-RO",
        action,
        method: "POST",
        speechTimeout: "auto",
        actionOnEmptyResult: true,
        ...opts
    });
    g.say({ language: "ro-RO" }, prompt);
};
function cleanSpeech(value) {
    return String(value || "").trim();
}
function getConfidence(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}
// Health check
app.get("/health", (_req, res) => {
    res.status(200).send("ok");
});
/**
 * STEP 1
 * Incoming call → ask for sofa order details.
 */
app.post("/voice", async (req, res) => {
    const { CallSid, From, To } = req.body || {};
    await (0, logger_1.initSession)(CallSid, From, To);
    await (0, logger_1.setData)(CallSid, {
        callerPhone: From
    });
    await (0, logger_1.appendTurn)(CallSid, {
        state: "call_started",
        note: `Incoming call from ${From || "unknown"} to ${To || "unknown"}`
    });
    const vr = new twilio_1.twiml.VoiceResponse();
    gather(vr, "/step/order_details", PROMPTS.introOrder);
    res.type("text/xml").send(vr.toString());
});
/**
 * STEP 2
 * Store sofa order details → ask for customer + delivery details.
 */
app.post("/step/order_details", async (req, res) => {
    const { CallSid } = req.body || {};
    const speech = cleanSpeech(req.body.SpeechResult);
    const confidence = getConfidence(req.body.Confidence);
    await (0, logger_1.appendTurn)(CallSid, {
        state: "order_details",
        speech,
        confidence
    });
    const vr = new twilio_1.twiml.VoiceResponse();
    if (!speech || speech.length < 3) {
        gather(vr, "/step/order_details", PROMPTS.fallbackOrder);
        return res.type("text/xml").send(vr.toString());
    }
    await (0, logger_1.setData)(CallSid, {
        orderDetails: speech
    });
    gather(vr, "/step/customer_delivery", PROMPTS.customerDelivery);
    res.type("text/xml").send(vr.toString());
});
/**
 * STEP 3
 * Store customer + delivery details → read summary → hang up.
 */
app.post("/step/customer_delivery", async (req, res) => {
    const { CallSid } = req.body || {};
    const speech = cleanSpeech(req.body.SpeechResult);
    const confidence = getConfidence(req.body.Confidence);
    await (0, logger_1.appendTurn)(CallSid, {
        state: "customer_delivery",
        speech,
        confidence
    });
    const vr = new twilio_1.twiml.VoiceResponse();
    if (!speech || speech.length < 3) {
        gather(vr, "/step/customer_delivery", PROMPTS.fallbackCustomerDelivery);
        return res.type("text/xml").send(vr.toString());
    }
    await (0, logger_1.setData)(CallSid, {
        customerAndDeliveryDetails: speech,
        confirmed: true
    });
    const session = await (0, logger_1.getSession)(CallSid);
    const orderDetails = session.data.orderDetails || "detalii comandă nespecificate";
    const customerAndDeliveryDetails = speech || "detalii client și livrare nespecificate";
    say(vr, `Am înregistrat cererea dumneavoastră. Pe scurt, doriți: ${orderDetails}. Datele pentru client și livrare sunt: ${customerAndDeliveryDetails}. ${PROMPTS.finalSuffix}`);
    vr.hangup();
    res.type("text/xml").send(vr.toString());
});
app.listen(port, () => {
    console.log(`Sofa order voice POC listening on :${port}`);
});
//# sourceMappingURL=index.js.map