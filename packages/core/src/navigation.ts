import { posix } from "node:path";
import type { SpaceConfig } from "./config.ts";

export type Navigation =
    | { source: "summary"; summaryPath: string; targets: string[] }
    | { source: "inferred" };

/**
 * N-5: a `directory` space has an implied navigation file; a glob-defined space does not,
 * and must name one. Guessing a location for the second case would mean picking one of
 * several unrelated trees for no reason.
 */
export function summaryPathFor(space: SpaceConfig): string | undefined {
    if (space.summary) return space.summary.replace(/^\.\//, "");
    if (space.directory) {
        const dir = space.directory.replace(/^\.\//, "").replace(/\/$/, "");
        return dir ? `${dir}/SUMMARY.md` : "SUMMARY.md";
    }
    return undefined;
}

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * N-1: entries resolve against the `SUMMARY.md` file's own location, not the repository
 * root, so the same links work when the file is read in the repository. Returned targets
 * are repository-root-relative, which is the form everything else here speaks.
 */
export function parseSummary(summaryPath: string, source: string): string[] {
    const base = posix.dirname(summaryPath);
    const targets: string[] = [];
    for (const match of source.matchAll(LINK)) {
        const href = match[1];
        if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
        const [pathPart] = href.split("#");
        if (!pathPart) continue;
        targets.push(posix.normalize(base === "." ? pathPart : posix.join(base, pathPart)));
    }
    return targets;
}
