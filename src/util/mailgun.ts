import formData from "form-data";
import Mailgun from "mailgun.js";

const mailgun = new Mailgun(formData);

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const TO_EMAIL = process.env.TO_EMAIL;

const mg = mailgun.client({
    username: "api",
    key: MAILGUN_API_KEY || ""
});

export interface SessionData {
    callSid: string;
    from?: string | undefined;
    to?: string | undefined;
    createdAt: string;
    orderDetails?: string | undefined;
    customerAndDeliveryDetails?: string | undefined;
    turns: Array<{
        ts?: string;
        state: string;
        speech?: string;
        confidence?: number;
        note?: string;
    }>;
}

export async function sendSessionEmail(session: SessionData): Promise<void> {
    const subject = `Canapea - Comanda noua - ${session.from || "Numar necunoscut"}`;

    const orderDetails = session.orderDetails || "Nu au fost furnizate";
    const customerDetails = session.customerAndDeliveryDetails || "Nu au fost furnizate";

    const text = `
Comanda noua primita prin telefon
================================

Numar apelant: ${session.from || "Necunoscut"}
Data apelului: ${session.createdAt}
Call SID: ${session.callSid}

--- DETALII COMANDA ---
${orderDetails}

--- DATE CLIENT SI LIVRARE ---
${customerDetails}

--- ISTORIC CONVERSATIE ---
${session.turns.map(t => `[${t.ts}] ${t.state}: ${t.speech || t.note || ""}`).join("\n")}
`.trim();

    const html = `
<h2>Comanda noua primita prin telefon</h2>
<hr>
<p><strong>Numar apelant:</strong> ${session.from || "Necunoscut"}</p>
<p><strong>Data apelului:</strong> ${session.createdAt}</p>
<p><strong>Call SID:</strong> ${session.callSid}</p>

<h3>Detalii Comanda</h3>
<p>${orderDetails.replace(/\n/g, "<br>")}</p>

<h3>Date Client si Livrare</h3>
<p>${customerDetails.replace(/\n/g, "<br>")}</p>

<h3>Istoric Conversatie</h3>
<ul>
${session.turns.map(t => `<li>[${t.ts}] <strong>${t.state}:</strong> ${t.speech || t.note || ""}</li>`).join("\n")}
</ul>
`.trim();

    await mg.messages.create(MAILGUN_DOMAIN || "", {
        from: `Canapele Voice POC <voice-poc@${MAILGUN_DOMAIN || ""}>`,
        to: [TO_EMAIL || ""],
        subject,
        text,
        html
    });

    console.log(`[Email sent] Call ${session.callSid} delivered to ${TO_EMAIL}`);
}
