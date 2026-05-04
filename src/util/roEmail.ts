// VERY simple normalizer for voiced emails like "ion punct popescu arond gmail punct com"
export function normalizeRomanianEmailSpoken(s: string): string {
    if (!s) return s;
    let t = s.trim().toLowerCase();

    // common Romanian words → symbols
    t = t.replace(/\barond\b/g, "@");
    t = t.replace(/\bat\b/g, "@");
    t = t.replace(/\bpunct\b/g, ".");
    t = t.replace(/\bdot\b/g, ".");

    // remove spaces around @ and .
    t = t.replace(/\s*@\s*/g, "@");
    t = t.replace(/\s*\.\s*/g, ".");

    // kill spaces altogether if they remain
    t = t.replace(/\s+/g, "");

    return t;
}

export function looksLikeEmail(s: string): boolean {
    if (!s) return false;
    // lightweight check only (we’ll re-confirm with caller anyway)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
