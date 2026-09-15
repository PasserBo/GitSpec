import { parse as parseYaml } from "yaml";
import { addressFor } from "./address.ts";

export type DocumentKind = "spec" | "page";

export interface Document {
    /** F-6: `page` unless the document says otherwise. Only a `spec` is ever drift-checked (E-6). */
    kind: DocumentKind;
    /** Where this document answers, per A-1 and A-6. */
    address: string;
    /** Address-bearing identity (A-1). Read from frontmatter, or derived from the path (A-4). */
    id: string;
    /** True when the id came from the path rather than from frontmatter, so A-2 does not hold for it. */
    idDerived: boolean;
    /** Repository-root-relative (D-1). */
    path: string;
    spaceKey: string;
    frontmatter: Record<string, unknown>;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseFrontmatter(source: string): Record<string, unknown> {
    const match = FRONTMATTER.exec(source);
    if (!match?.[1]) return {};
    try {
        const data = parseYaml(match[1]) as unknown;
        return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    } catch {
        // A malformed block is treated as absent rather than fatal: A-4 already commits
        // to serving a file whose frontmatter tells us nothing, and refusing to discover
        // a repository because one file has a stray colon would defeat the point of it.
        return {};
    }
}

/**
 * A-4: a matched file with no usable `id` still gets served, under an id taken from its
 * path. This is what lets GitSpec be pointed at a repository it did not write, and it is
 * also why A-2 carries an exception — this id moves when the file moves.
 */
export function deriveId(path: string): string {
    return path
        .replace(/\.[^./]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function documentFrom(args: {
    path: string;
    spaceKey: string;
    spacePath: string;
    source: string;
    isHome: boolean;
}): Document {
    const frontmatter = parseFrontmatter(args.source);
    const declared = frontmatter.id;
    const hasDeclared = typeof declared === "string" && declared.length > 0;
    const id = hasDeclared ? declared : deriveId(args.path);
    return {
        // F-6: anything that does not say `spec` is a page. Defaulting the other way
        // would turn adopting a repository into a wall of format violations.
        kind: frontmatter.kind === "spec" ? "spec" : "page",
        address: addressFor(args.spacePath, id, args.isHome),
        id,
        idDerived: !hasDeclared,
        path: args.path,
        spaceKey: args.spaceKey,
        frontmatter,
    };
}
