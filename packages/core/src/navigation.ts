import { posix } from "node:path";
import type { SpaceConfig } from "./config.ts";

export interface SummaryEntry {
    /** Link text, or the page link title when one is given. */
    title: string;
    /** Repository-root-relative path of the linked document. */
    target: string;
    /** Nesting depth within its group, from the list indentation. */
    depth: number;
    /** The `##` heading this entry sits under, when there is one. */
    group?: string;
}

export type Navigation =
    | { source: "summary"; summaryPath: string; entries: SummaryEntry[]; targets: string[] }
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

const HEADING = /^#{2,}\s+(.+?)\s*$/;
const ENTRY = /^(\s*)[*+-]\s+\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/;

function isExternal(href: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("//");
}

/**
 * N-1: entries resolve against the `SUMMARY.md` file's own location, not the repository
 * root, so the same links work when the file is read in the repository. Returned targets
 * are repository-root-relative, which is the form everything else here speaks.
 */
export function parseSummary(summaryPath: string, source: string): SummaryEntry[] {
    const base = posix.dirname(summaryPath);
    const entries: SummaryEntry[] = [];
    let group: string | undefined;

    for (const line of source.split(/\r?\n/)) {
        const heading = HEADING.exec(line);
        if (heading?.[1]) {
            group = heading[1];
            continue;
        }

        const entry = ENTRY.exec(line);
        if (!entry) continue;
        const [, indent = "", text = "", href = "", linkTitle] = entry;
        if (isExternal(href)) continue;

        const [pathPart] = href.split("#");
        if (!pathPart) continue;

        entries.push({
            title: linkTitle || text,
            target: posix.normalize(base === "." ? pathPart : posix.join(base, pathPart)),
            depth: Math.floor(indent.replace(/\t/g, "  ").length / 2),
            group,
        });
    }

    return entries;
}
