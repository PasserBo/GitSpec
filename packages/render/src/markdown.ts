import { posix } from "node:path";
import rehypeRaw from "rehype-raw";
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

/** Leaves the site entirely: a scheme, a protocol-relative host, or a mail/tel target. */
function isExternal(url: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

interface Element {
    type: string;
    tagName?: string;
    properties?: Record<string, unknown>;
}

const URL_ATTRIBUTE: Record<string, string> = { a: "href", img: "src" };

/**
 * Two jobs, done in one pass over the final element tree so that raw HTML in the source
 * is covered as well as Markdown links.
 *
 * First, a link written as a relative path — which is how it has to be written for the
 * link to work when the file is read in the repository — becomes the target's address.
 * That address comes from the target's id, and for a home document is the space path
 * (A-6), so neither is derivable from the file path.
 *
 * Second, every remaining in-site URL is forced under the deployment prefix. A document
 * that writes `/foo` means the root of *this* site; without this it resolves against the
 * domain, which on a GitHub Pages project site lands on a different site belonging to
 * the same account. R-5 makes the prefix a boundary rather than a convenience.
 */
function rewriteUrls(fromPath: string, lookup: AddressLookup, base: string) {
    const dir = posix.dirname(fromPath);

    return () => (tree: unknown) => {
        visit(tree as never, "element", (node: Element) => {
            const attribute = URL_ATTRIBUTE[node.tagName ?? ""];
            if (!attribute) return;

            const value = node.properties?.[attribute];
            if (typeof value !== "string" || value === "") return;
            if (isExternal(value) || value.startsWith("#")) return;

            const [pathPart = "", hash] = value.split("#");
            if (!pathPart) return; // a bare fragment stays put

            let href: string;
            if (pathPart.startsWith("/")) {
                // Already site-absolute: it needs the prefix, nothing else.
                href = withBase(base, pathPart);
            } else {
                const target = posix.normalize(posix.join(dir, pathPart));
                const address = lookup(target);
                // A relative link resolving to no known document is left as written
                // rather than rewritten to a guess, which would 404 while looking
                // deliberate. Being relative, it cannot escape the site on its own.
                if (!address) return;
                href = withBase(base, address);
            }

            node.properties![attribute] = hash ? `${href}#${hash}` : href;
        });
    };
}

export async function renderMarkdown(
    document: Document,
    source: string,
    lookup: AddressLookup,
    base = "",
): Promise<string> {
    const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        // Raw HTML in a source document is kept rather than escaped: these are
        // repositories whose Markdown predates GitSpec, and dropping their HTML would
        // silently change what the file says. `rehype-raw` parses it into real elements
        // so its links are rewritten like any other.
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeRaw)
        .use(rewriteUrls(document.path, lookup, base))
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(source);

    return String(file);
}

/** Strip the frontmatter block before rendering; it is metadata, not content. */
export function stripFrontmatter(source: string): string {
    return source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}
