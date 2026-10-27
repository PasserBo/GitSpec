import { visit } from "unist-util-visit";

/**
 * A stable address for every heading and every claim.
 *
 * Until now a rendered page carried no `id` at all, which meant the most specific thing
 * this format has — a claim with a permanent identifier that C-2 promises never moves —
 * could not be linked to. A review comment had to say "the third bullet under
 * Frontmatter"; an agent asked to check one had no way to point at what it checked.
 *
 * Page-level addressing is what every other documentation tool offers. Statement-level
 * addressing is the thing this format already paid for by making authors identify their
 * claims, and it was being thrown away at render time.
 *
 * The identifier is used verbatim as the anchor, so `#F-3` is the address of F-3 for as
 * long as F-3 exists — which C-2 says is forever, including after it is withdrawn.
 */

interface Node {
    type: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: Node[];
    value?: string;
}

const CLAIM_ID = /^[A-Z][A-Z0-9]*-\d+$/;

/** The text of a subtree, for slugging a heading. */
function textOf(node: Node): string {
    if (node.type === "text") return node.value ?? "";
    return (node.children ?? []).map(textOf).join("");
}

export function slugFor(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9À-￿]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function anchorLink(id: string, label: string): Node {
    return {
        type: "element",
        tagName: "a",
        properties: {
            href: `#${id}`,
            className: ["anchor"],
            ariaLabel: `Link to ${label}`,
        },
        children: [{ type: "text", value: "#" }],
    };
}

/** The first element in a subtree, skipping whitespace-only text. */
function firstElement(node: Node): Node | undefined {
    for (const child of node.children ?? []) {
        if (child.type === "text" && (child.value ?? "").trim() === "") continue;
        if (child.type === "element") {
            // A tight list item holds the bold identifier directly; a loose one wraps it
            // in a paragraph first.
            return child.tagName === "p" ? firstElement(child) : child;
        }
        return undefined;
    }
    return undefined;
}

export function anchors() {
    return () => (tree: unknown) => {
        const used = new Set<string>();

        visit(tree as never, "element", (node: Node) => {
            if (!node.tagName) return;

            if (/^h[1-6]$/.test(node.tagName)) {
                const base = slugFor(textOf(node));
                if (!base) return;
                // Two sections may share a name across a long document; the first keeps
                // the plain address, which is the one anybody would have written by hand.
                let id = base;
                for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
                used.add(id);
                node.properties = { ...node.properties, id };
                node.children = [...(node.children ?? []), anchorLink(id, textOf(node))];
                return;
            }

            if (node.tagName !== "li") return;
            const strong = firstElement(node);
            if (!strong || strong.tagName !== "strong") return;
            const id = textOf(strong).trim();
            if (!CLAIM_ID.test(id) || used.has(id)) return;

            // The identifier itself becomes the link, so the thing a reader would click
            // is the thing they would quote.
            used.add(id);
            node.properties = { ...node.properties, id, className: ["claim"] };
            strong.children = [
                {
                    type: "element",
                    tagName: "a",
                    properties: { href: `#${id}`, className: ["claim-anchor"] },
                    children: strong.children ?? [],
                },
            ];
        });
    };
}
