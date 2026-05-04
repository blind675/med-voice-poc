"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const twilio_1 = require("twilio");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Twilio posts form-encoded by default
app.use(body_parser_1.default.urlencoded({ extended: false }));
/**
 * GET /health
 */
app.get("/health", (_req, res) => res.status(200).send("ok"));
/**
 * GET /test
 * Test endpoint to verify server is running correctly
 */
app.get("/test", (_req, res) => {
    const testResponse = {
        status: "success",
        message: "Med Voice POC server is running correctly",
        timestamp: new Date().toISOString(),
        port: port,
        environment: process.env.NODE_ENV || "development",
        endpoints: {
            health: "GET /health",
            test: "GET /test",
            voice: "POST /voice",
            consent: "POST /step/consent",
            name: "POST /step/name"
        }
    };
    res.status(200).json(testResponse);
});
/**
 * POST /voice
 * First prompt: Romanian consent, turn-based via <Gather input="speech">
 */
app.post("/voice", (req, res) => {
    const vr = new twilio_1.twiml.VoiceResponse();
    vr.say({ language: "ro-RO", voice: "Google.ro-RO-Wavenet-B", }, "Bună! Ați sunat la un numar special. Acest apel este gestionat de un asistent A.I. si nu este o linie pentru urgențe medicale. Va rog să-mi spuneți numele dumneavoastră.");
    // If nothing is captured, Twilio will hit /step/consent with empty SpeechResult because of actionOnEmptyResult
    res.type("text/xml").send(vr.toString());
});
app.listen(port, () => {
    console.log(`Voice POC listening on :${port}`);
});
//# sourceMappingURL=index.js.map