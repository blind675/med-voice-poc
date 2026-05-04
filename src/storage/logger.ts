import { promises as fs } from "fs";
import path from "path";
import slugify from "slugify";
import { sendSessionEmail, SessionData } from "../util/mailgun";

const BASE_DIR = path.join(process.cwd(), "data", "calls");

export type TurnLog = {
    ts?: string;               // ISO timestamp (added by appendTurn)
    state: string;             // which step handler
    speech?: string;           // Twilio SpeechResult
    confidence?: number;       // Twilio Confidence
    note?: string;             // any extra info
};

export type SessionLog = {
    callSid: string;
    from?: string | undefined;
    to?: string | undefined;
    providerId?: string | undefined;       // we'll set later when we map numbers → providers
    createdAt: string;         // ISO
    lastUpdatedAt: string;     // ISO
    data: {
        name?: string;
        email?: string;
        reason?: string;
        dateText?: string;
        timeWindowText?: string;
    };
    turns: TurnLog[];
};

async function ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
}

function filePath(callSid: string) {
    const safe = slugify(callSid, { lower: true, strict: true });
    return path.join(BASE_DIR, `${safe}.json`);
}

export async function initSession(callSid: string, from?: string, to?: string): Promise<SessionLog> {
    await ensureDir(BASE_DIR);
    const f = filePath(callSid);
    try {
        const raw = await fs.readFile(f, "utf8");
        return JSON.parse(raw);
    } catch {
        const now = new Date().toISOString();
        const sess: SessionLog = {
            callSid,
            from,
            to,
            createdAt: now,
            lastUpdatedAt: now,
            data: {},
            turns: []
        };
        await fs.writeFile(f, JSON.stringify(sess, null, 2), "utf8");
        return sess;
    }
}

async function writeSession(sess: SessionLog) {
    sess.lastUpdatedAt = new Date().toISOString();
    await fs.writeFile(filePath(sess.callSid), JSON.stringify(sess, null, 2), "utf8");
}

export async function appendTurn(callSid: string, turn: TurnLog) {
    const sess = await initSession(callSid);
    sess.turns.push({ ...turn, ts: new Date().toISOString() });
    await writeSession(sess);
}

export async function setData(callSid: string, patch: Partial<SessionLog["data"]>) {
    const sess = await initSession(callSid);
    sess.data = { ...sess.data, ...patch };

    // If session is confirmed, send email and skip file storage
    if ((patch as any).confirmed === true) {
        const sessionData: SessionData = {
            callSid: sess.callSid,
            from: sess.from,
            to: sess.to,
            createdAt: sess.createdAt,
            orderDetails: (sess.data as any).orderDetails,
            customerAndDeliveryDetails: (sess.data as any).customerAndDeliveryDetails,
            turns: sess.turns
        };

        await sendSessionEmail(sessionData);
        return;
    }

    await writeSession(sess);
}

export async function getSession(callSid: string) {
    return initSession(callSid);
}
