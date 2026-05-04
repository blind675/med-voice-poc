"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSession = initSession;
exports.appendTurn = appendTurn;
exports.setData = setData;
exports.getSession = getSession;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const slugify_1 = __importDefault(require("slugify"));
const mailgun_1 = require("../util/mailgun");
const BASE_DIR = path_1.default.join(process.cwd(), "data", "calls");
async function ensureDir(dir) {
    await fs_1.promises.mkdir(dir, { recursive: true });
}
function filePath(callSid) {
    const safe = (0, slugify_1.default)(callSid, { lower: true, strict: true });
    return path_1.default.join(BASE_DIR, `${safe}.json`);
}
async function initSession(callSid, from, to) {
    await ensureDir(BASE_DIR);
    const f = filePath(callSid);
    try {
        const raw = await fs_1.promises.readFile(f, "utf8");
        return JSON.parse(raw);
    }
    catch {
        const now = new Date().toISOString();
        const sess = {
            callSid,
            from,
            to,
            createdAt: now,
            lastUpdatedAt: now,
            data: {},
            turns: []
        };
        await fs_1.promises.writeFile(f, JSON.stringify(sess, null, 2), "utf8");
        return sess;
    }
}
async function writeSession(sess) {
    sess.lastUpdatedAt = new Date().toISOString();
    await fs_1.promises.writeFile(filePath(sess.callSid), JSON.stringify(sess, null, 2), "utf8");
}
async function appendTurn(callSid, turn) {
    const sess = await initSession(callSid);
    sess.turns.push({ ...turn, ts: new Date().toISOString() });
    await writeSession(sess);
}
async function setData(callSid, patch) {
    const sess = await initSession(callSid);
    sess.data = { ...sess.data, ...patch };
    // If session is confirmed, send email and skip file storage
    if (patch.confirmed === true) {
        const sessionData = {
            callSid: sess.callSid,
            from: sess.from,
            to: sess.to,
            createdAt: sess.createdAt,
            orderDetails: sess.data.orderDetails,
            customerAndDeliveryDetails: sess.data.customerAndDeliveryDetails,
            turns: sess.turns
        };
        await (0, mailgun_1.sendSessionEmail)(sessionData);
        return;
    }
    await writeSession(sess);
}
async function getSession(callSid) {
    return initSession(callSid);
}
//# sourceMappingURL=logger.js.map