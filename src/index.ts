import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { twiml } from "twilio";
import { appendTurn, initSession, setData, getSession } from "./storage/logger";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

const PROMPTS = {
    introOrder:
        "Bună! Ați sunat la centrul de comenzi pentru fabrica de canapele. Acest apel este gestionat de un asistent AI. Vă pot ajuta să înregistrați o cerere de comandă pentru o canapea. Vă rog să îmi spuneți ce doriți să comandați: tipul canapelei, dimensiunea aproximativă, culoarea sau materialul dorit și cantitatea.",

    customerDelivery:
        "Mulțumesc. Acum vă rog să îmi spuneți numele dumneavoastră, localitatea pentru livrare și dacă aveți un termen preferat de livrare.",

    fallbackOrder:
        "Nu am înțeles detaliile comenzii. Vă rog să repetați ce canapea doriți să comandați, inclusiv tipul, dimensiunea, culoarea sau materialul și cantitatea.",

    fallbackCustomerDelivery:
        "Nu am înțeles detaliile pentru client și livrare. Vă rog să repetați numele dumneavoastră, localitatea pentru livrare și termenul preferat.",

    finalSuffix:
        "Un consultant vă va suna pentru confirmarea detaliilor, estimarea prețului și termenul final de producție. Vă mulțumim și o zi bună!"
};

const say = (vr: twiml.VoiceResponse, text: string) => {
    vr.say({ language: "ro-RO" }, text);
};

interface GatherOptions {
    speechTimeout?: string;
    actionOnEmptyResult?: boolean;
    numDigits?: number;
    finishOnKey?: string;
}

const gather = (
    vr: twiml.VoiceResponse,
    action: string,
    prompt: string,
    opts?: Partial<GatherOptions>
) => {
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

function cleanSpeech(value: unknown): string {
    return String(value || "").trim();
}

function getConfidence(value: unknown): number {
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

    await initSession(CallSid, From, To);
    await setData(CallSid, {
        callerPhone: From
    } as any);

    await appendTurn(CallSid, {
        state: "call_started",
        note: `Incoming call from ${From || "unknown"} to ${To || "unknown"}`
    });

    const vr = new twiml.VoiceResponse();

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

    await appendTurn(CallSid, {
        state: "order_details",
        speech,
        confidence
    });

    const vr = new twiml.VoiceResponse();

    if (!speech || speech.length < 3) {
        gather(vr, "/step/order_details", PROMPTS.fallbackOrder);
        return res.type("text/xml").send(vr.toString());
    }

    await setData(CallSid, {
        orderDetails: speech
    } as any);

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

    await appendTurn(CallSid, {
        state: "customer_delivery",
        speech,
        confidence
    });

    const vr = new twiml.VoiceResponse();

    if (!speech || speech.length < 3) {
        gather(vr, "/step/customer_delivery", PROMPTS.fallbackCustomerDelivery);
        return res.type("text/xml").send(vr.toString());
    }

    await setData(CallSid, {
        customerAndDeliveryDetails: speech,
        confirmed: true
    } as any);

    const session = await getSession(CallSid);

    const orderDetails =
        (session.data as any).orderDetails || "detalii comandă nespecificate";

    const customerAndDeliveryDetails =
        speech || "detalii client și livrare nespecificate";

    say(
        vr,
        `Am înregistrat cererea dumneavoastră. Pe scurt, doriți: ${orderDetails}. Datele pentru client și livrare sunt: ${customerAndDeliveryDetails}. ${PROMPTS.finalSuffix}`
    );

    vr.hangup();

    res.type("text/xml").send(vr.toString());
});

app.listen(port, () => {
    console.log(`Sofa order voice POC listening on :${port}`);
});