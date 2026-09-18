import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Resolved when it is called, never when the module loads.
 *
 * `const run = promisify(execFile)` at the top of this file is what broke the editor: a
 * bundler targeting the browser stubs `node:child_process` to an empty object, so
 * `promisify(undefined)` threw during module evaluation — before any code could run, and
 * before anything could catch it. The page sat on "Loading…" saying nothing.
 */
async function git(root: string, args: string[]): Promise<string> {
    const { stdout } = await promisify(execFile)("git", args, {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
    });
    return String(stdout);
}

/**
 * When a document was first written and last changed, read from the repository.
 *
 * These were frontmatter fields until it became clear they cannot survive being one. In
 * a repository four days old with eight documents, three already disagreed with git, and
 * one of them had been made wrong an hour earlier by the person maintaining it. A copy
 * of a fact that version control already owns has exactly one possible future.
 *
 * So the file no longer carries them and the history answers instead (F-7). Nothing is
 * derived that git cannot state: a document not yet committed has no dates, and neither
 * does one in a repository this cannot read.
 */

export interface DocumentHistory {
    /** Author date of the oldest commit touching the file, as YYYY-MM-DD. */
    created?: string;
    /** Author date of the newest. */
    updated?: string;
}

/** Marks a date line, so a filename can never be mistaken for one. */
const RECORD = "";

export async function readHistory(
    root: string,
    onWarning: (message: string) => void = () => {},
): Promise<Map<string, DocumentHistory>> {
    const history = new Map<string, DocumentHistory>();

    // A shallow clone answers `git log` without complaint and with the wrong answer: the
    // oldest commit it can see is the bottom of the truncation, not the one that added
    // the file. Reporting nothing is the only honest option, and saying so is what tells
    // an adopter their workflow needs `fetch-depth: 0`.
    try {
        const shallow = await git(root, ["rev-parse", "--is-shallow-repository"]);
        if (shallow.trim() === "true") {
            onWarning(
                "the checkout is shallow, so no document can be dated from its history — " +
                    "set `fetch-depth: 0` on actions/checkout to restore the dates",
            );
            return history;
        }
    } catch {
        // Not a git repository, or no git. Neither is an error: a directory of Markdown
        // is still a site, it just has nothing to say about when it changed.
        return history;
    }

    let stdout: string;
    try {
        // One pass over the whole history rather than two calls per document. Author date
        // rather than commit date, so a rebase does not restate when the work was done.
        stdout = await git(root, [
            "log",
            `--format=${RECORD}%aI`,
            "--name-only",
            "--diff-filter=AMR",
            "--no-renames",
        ]);
    } catch {
        return history;
    }

    let date: string | undefined;
    for (const line of stdout.split("\n")) {
        if (line.startsWith(RECORD)) {
            date = line.slice(1, 11);
            continue;
        }
        const path = line.trim();
        if (!path || !date) continue;

        const entry = history.get(path);
        if (entry) {
            // Newest first, so the first sighting is the last change and every later one
            // is older than what is already recorded.
            entry.created = date;
        } else {
            history.set(path, { created: date, updated: date });
        }
    }

    return history;
}
