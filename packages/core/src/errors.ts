/**
 * A failure attributable to one claim in the content-discovery spec.
 *
 * The rule identifier is carried rather than only formatted into the message, so a
 * caller can act on it. Discovery fails loudly by design (D-4, D-6, A-3), and a
 * failure that does not name the file, glob or space responsible is most of the way
 * to being useless — so every throw site names them.
 */
export class DiscoveryError extends Error {
    readonly rule: string;

    constructor(rule: string, message: string) {
        super(`[${rule}] ${message}`);
        this.name = "DiscoveryError";
        this.rule = rule;
    }
}
