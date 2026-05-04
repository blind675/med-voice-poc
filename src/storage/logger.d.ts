export type TurnLog = {
    ts: string;
    state: string;
    speech?: string;
    confidence?: number;
    note?: string;
};
export type SessionLog = {
    callSid: string;
    from?: string | undefined;
    to?: string | undefined;
    providerId?: string | undefined;
    createdAt: string;
    lastUpdatedAt: string;
    data: {
        name?: string;
        email?: string;
        reason?: string;
        dateText?: string;
        timeWindowText?: string;
    };
    turns: TurnLog[];
};
export declare function initSession(callSid: string, from?: string, to?: string): Promise<SessionLog>;
export declare function appendTurn(callSid: string, turn: TurnLog): Promise<void>;
export declare function setData(callSid: string, patch: Partial<SessionLog["data"]>): Promise<void>;
export declare function getSession(callSid: string): Promise<SessionLog>;
//# sourceMappingURL=logger.d.ts.map