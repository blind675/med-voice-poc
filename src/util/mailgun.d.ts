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
export declare function sendSessionEmail(session: SessionData): Promise<void>;
//# sourceMappingURL=mailgun.d.ts.map