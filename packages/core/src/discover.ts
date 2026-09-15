import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import picomatch from "picomatch";
import { defaultHomeFor, normalizeSpacePath } from "./address.ts";
import { BUILT_IN_EXCLUDE_DIRS, includeGlobsFor, type Config, type SpaceConfig } from "./config.ts";
import { documentFrom, type Document } from "./document.ts";
import { DiscoveryError } from "./errors.ts";
import { parseSummary, summaryPathFor, type Navigation } from "./navigation.ts";

export interface SpaceResult {
    key: string;
    title: string;
    path: string;
    documents: Document[];
    navigation: Navigation;
    /** Repository-root-relative path of the document answering at `path` (A-5, A-6). */
    homePath: string;
}

export interface DiscoveryResult {
    spaces: SpaceResult[];
}

/** The filesystem stand-in for D-5: one walk, so a build cannot mix files read at different times. */
async function walk(root: string): Promise<string[]> {
    const excluded = new Set(BUILT_IN_EXCLUDE_DIRS);
    const files: string[] = [];

    async function recurse(rel: string): Promise<void> {
        const entries = await readdir(join(root, rel), { withFileTypes: true });
        for (const entry of entries) {
            const child = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                // D-3 is enforced here rather than as a post-filter so that a dependency
                // tree is never walked at all. The rule is the same either way; this is
                // the difference between discovery taking milliseconds and taking minutes.
                if (excluded.has(entry.name)) continue;
                await recurse(child);
            } else if (entry.isFile()) {
                files.push(child);
            }
        }
    }

    await recurse("");
    return files.sort();
}

function selectFor(space: SpaceConfig, files: string[]): string[] {
    const includes = includeGlobsFor(space);
    const isExcluded = space.exclude?.length ? picomatch(space.exclude, { dot: true }) : () => false;

    const selected = new Set<string>();
    for (const glob of includes) {
        const matches = picomatch(glob, { dot: true });
        const hits = files.filter((f) => matches(f));

        // D-6: a glob that matches nothing is almost always a directory that was renamed
        // or moved. Silently producing a smaller space turns that into a page that
        // vanished for no visible reason, discovered much later.
        if (hits.length === 0) {
            throw new DiscoveryError(
                "D-6",
                `space \`${space.key}\`: the pattern \`${glob}\` matches no file`,
            );
        }
        for (const hit of hits) {
            if (!isExcluded(hit)) selected.add(hit);
        }
    }
    return [...selected].sort();
}

export async function discover(root: string, config: Config): Promise<DiscoveryResult> {
    const files = await walk(root);

    const selections = new Map<string, string[]>();
    for (const space of config.spaces) {
        selections.set(space.key, selectFor(space, files));
    }

    // D-4: ambiguity is reported rather than resolved. Any tie-break rule would make a
    // document's address depend on the order spaces happen to be written in, so editing
    // an unrelated glob could silently move a published URL.
    const claimants = new Map<string, string[]>();
    for (const [key, paths] of selections) {
        for (const path of paths) {
            const list = claimants.get(path);
            if (list) list.push(key);
            else claimants.set(path, [key]);
        }
    }
    for (const [path, keys] of claimants) {
        if (keys.length > 1) {
            throw new DiscoveryError(
                "D-4",
                `\`${path}\` is claimed by more than one space: ${keys.map((k) => `\`${k}\``).join(", ")}`,
            );
        }
    }

    const spaces: SpaceResult[] = [];
    for (const space of config.spaces) {
        const paths = selections.get(space.key)!;
        const summaryPath = summaryPathFor(space);

        // A-7: a space that cannot answer at its own path is misconfigured, not merely
        // missing a page. Reported before anything is rendered, naming the space and
        // what was looked for, since the default is implicit and easy to miss.
        const homePath = defaultHomeFor(space);
        if (!homePath) {
            throw new DiscoveryError(
                "A-7",
                `space \`${space.key}\` names no \`home\`, and defines its content with \`include\`, which implies no default`,
            );
        }
        if (!paths.includes(homePath)) {
            throw new DiscoveryError(
                "A-7",
                `space \`${space.key}\`: home document \`${homePath}\` is not among the files the space selects`,
            );
        }

        const documents: Document[] = [];
        for (const path of paths) {
            if (path === summaryPath) continue; // the navigation file is not itself a page
            const source = await readFile(join(root, path), "utf8");
            documents.push(
                documentFrom({
                    path,
                    spaceKey: space.key,
                    spacePath: space.path,
                    source,
                    isHome: path === homePath,
                }),
            );
        }

        // A-3: two documents cannot share an address. Reported with both paths, because
        // knowing only the id leaves the reader grepping for it.
        const byId = new Map<string, string>();
        for (const doc of documents) {
            const existing = byId.get(doc.id);
            if (existing) {
                throw new DiscoveryError(
                    "A-3",
                    `space \`${space.key}\`: \`${existing}\` and \`${doc.path}\` both use the id \`${doc.id}\``,
                );
            }
            byId.set(doc.id, doc.path);
        }

        let navigation: Navigation = { source: "inferred" };
        if (summaryPath && files.includes(summaryPath)) {
            const source = await readFile(join(root, summaryPath), "utf8");
            const entries = parseSummary(summaryPath, source);
            navigation = {
                source: "summary",
                summaryPath,
                entries,
                targets: entries.map((e) => e.target),
            };
        }

        spaces.push({
            key: space.key,
            title: space.title,
            path: normalizeSpacePath(space.path),
            documents,
            navigation,
            homePath,
        });
    }

    return { spaces };
}
