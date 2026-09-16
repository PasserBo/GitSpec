/**
 * A failure attributable to one claim in the sync-architecture spec.
 *
 * Carrying the rule rather than only a message matters most for C-2: a caller has to be
 * able to tell "your branch moved, nothing was written" apart from a transport failure,
 * because the first is a normal outcome the editor shows to the author and the second is
 * a bug.
 */
export class SubmitError extends Error {
    readonly rule: string;

    constructor(rule: string, message: string) {
        super(`[${rule}] ${message}`);
        this.name = "SubmitError";
        this.rule = rule;
    }
}
