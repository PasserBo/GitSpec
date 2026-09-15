import { posix } from "node:path";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Document } from "@gitspec/core";
import { withBase } from "./base.ts";

/** Repository-root-relative path → the address that document answers at. */
export type AddressLookup = (repoPath: string) => string | undefined;

function isExternal(href: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#");
}

/**
 * Links between documents are written as relative paths so they resolve when the files
 * are read in the repository. On the rendered site the same link has to point at the
 * target's address instead — which is derived from its id, and for the home document is
 * the space path (A-6), so neither can be computed from the path alone.
 *
 * A link that resolves to no known document is left exactly as written. Rewriting it to
 * a guess would produce a URL that looks deliberate and 404s.
 */
function rewriteLinks(fromPath: string, lookup: AddressLookup, base: string) {
    const dir = posix.dirname(fromPath);
    return () => (tree: unknown) => {
        visit(tree as never, "link", (node: { url?: string }) => {
            const url = node.url;
            if (!url || isExternal(url)) return;

            const [pathPart = "", hash] = url.split("#");
            if (!pathPart) return; // a bare fragment stays put

            const target = posix.normalize(dir === "." ? pathPart : posix.join(dir, pathPart));
            const address = lookup(target);
            if (!address) return;

            const href = withBase(base, address);
            node.url = hash ? `${href}#${hash}` : href;
        });
    };
}

const BASE = unified().use(remarkParse).use(remarkGfm);

export async function renderMarkdown(
    document: Document,
    source: string,
    lookup: AddressLookup,
    base = "",
): Promise<string> {
    const file = await BASE()
        .use(rewriteLinks(document.path, lookup, base))
        // Raw HTML in a source document is passed through rather than escaped: these are
        // repositories whose Markdown predates GitSpec, and dropping their HTML would
        // silently change what the file says.
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(source);

    return String(file);
}

/** Strip the frontmatter block before rendering; it is metadata, not content. */
export function stripFrontmatter(source: string): string {
    return source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}
