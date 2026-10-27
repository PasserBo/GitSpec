import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough";
import type { Node as PMNode, Mark } from "prosemirror-model";
import type { BlockContent, PhrasingContent, RootContent } from "mdast";
import type { ParsedDocument } from "./parse.ts";

/**
 * A ProseMirror document back into Markdown, quoting the source wherever it can.
 *
 * The rule W-10 states is that a block the author did not touch comes out as the bytes it
 * went in as. That is not achieved by a careful serializer — no serializer is careful
 * enough, because Markdown has many spellings of the same tree and only the author knows
 * which one they meant. It is achieved by not serialising those blocks at all.
 *
 * ProseMirror makes this nearly free. Its documents are persistent, so an untouched
 * block is the *same object* after any number of edits, and the map built at parse time
 * still answers for it. Everything the map answers for is quoted; everything else — a
 * block that was edited, or one that did not exist before — goes through the serializer
 * below, and only that block pays for its formatting choices.
 */

const OPTIONS = {
    // Chosen to match what the documents in this repository already look like, so an
    // edited block does not stand out from its neighbours in a diff.
    bullet: "-" as const,
    emphasis: "*" as const,
    strong: "*" as const,
    fence: "`" as const,
    fences: true,
    rule: "-" as const,
    listItemIndent: "one" as const,
    incrementListMarker: false,
    resourceLink: false,
    extensions: [gfmTableToMarkdown(), gfmStrikethroughToMarkdown()],
};

export function serializeDocument(doc: PMNode, parsed: ParsedDocument): string {
    const { spans, source } = parsed;

    // The original blocks in source order, so adjacency can be recognised.
    const order = new Map<PMNode, number>();
    const ordered = [...spans.entries()].sort((a, b) => a[1][0] - b[1][0]);
    ordered.forEach(([node], index) => order.set(node, index));

    const parts: { index?: number; text: string }[] = [];
    doc.forEach((node) => {
        const index = order.get(node);
        if (index !== undefined) parts.push({ index, text: source.slice(...ordered[index]![1]) });
        else parts.push({ text: serializeBlock(node) });
    });

    // Nothing moved and nothing changed: hand back exactly what came in, including the
    // blank lines, the trailing newline, and whatever else lives between the blocks.
    const untouched =
        parts.length === ordered.length && parts.every((part, i) => part.index === i);
    if (untouched) return source;

    let out = "";
    let previous: number | undefined;
    for (const [i, part] of parts.entries()) {
        if (i > 0) {
            // Two originals that were neighbours keep whatever separated them. Anything
            // else gets one blank line, which is what every document here uses.
            const adjacent =
                previous !== undefined && part.index !== undefined && part.index === previous + 1;
            out += adjacent
                ? source.slice(ordered[previous!]![1][1], ordered[part.index!]![1][0])
                : "\n\n";
        }
        out += part.text;
        previous = part.index;
    }

    // The body of a document begins after the frontmatter and conventionally starts with
    // a blank line; preserve whatever the original had on both ends.
    const lead = ordered.length > 0 ? source.slice(0, ordered[0]![1][0]) : "";
    const tail = ordered.length > 0 ? source.slice(ordered[ordered.length - 1]![1][1]) : "\n";
    const leading = parts[0]?.index === 0 ? lead : lead.replace(/[^\n]*$/, "");
    const trailing = parts[parts.length - 1]?.index === ordered.length - 1 ? tail : "\n";

    return leading + out + trailing;
}

/** One block, for the blocks that actually changed. */
export function serializeBlock(node: PMNode): string {
    if (node.type.name === "verbatim") return String(node.attrs.text);
    const tree = blockToMdast(node);
    if (!tree) return "";
    return toMarkdown({ type: "root", children: [tree] }, OPTIONS).replace(/\n+$/, "");
}

function blockToMdast(node: PMNode): RootContent | undefined {
    switch (node.type.name) {
        case "paragraph":
            return { type: "paragraph", children: inlineToMdast(node) };
        case "heading":
            return { type: "heading", depth: node.attrs.level, children: inlineToMdast(node) };
        case "code_block":
            return { type: "code", lang: node.attrs.language || null, value: node.textContent };
        case "horizontal_rule":
            return { type: "thematicBreak" };
        case "blockquote":
            return { type: "blockquote", children: childBlocks(node) };
        case "bullet_list":
            return { type: "list", ordered: false, spread: !node.attrs.tight, children: listItems(node) };
        case "ordered_list":
            return {
                type: "list",
                ordered: true,
                start: node.attrs.start,
                spread: !node.attrs.tight,
                children: listItems(node),
            };
        case "table":
            return tableToMdast(node);
        case "verbatim":
            // Reached only through a parent; a top-level one is quoted before this runs.
            return { type: "html", value: String(node.attrs.text) };
        default:
            return undefined;
    }
}

function childBlocks(node: PMNode): BlockContent[] {
    const out: BlockContent[] = [];
    node.forEach((child) => {
        const block = blockToMdast(child);
        if (block) out.push(block as BlockContent);
    });
    return out;
}

function listItems(node: PMNode): Extract<RootContent, { type: "listItem" }>[] {
    const items: Extract<RootContent, { type: "listItem" }>[] = [];
    node.forEach((item) => {
        items.push({ type: "listItem", spread: !node.attrs.tight, children: childBlocks(item) });
    });
    return items;
}

function tableToMdast(node: PMNode): RootContent {
    const align = (node.attrs.align as (string | null)[]) ?? [];
    const rows: Extract<RootContent, { type: "table" }>["children"] = [];
    node.forEach((row) => {
        const cells: { type: "tableCell"; children: PhrasingContent[] }[] = [];
        row.forEach((cell) => cells.push({ type: "tableCell", children: inlineToMdast(cell) }));
        rows.push({ type: "tableRow", children: cells });
    });
    return { type: "table", align: align as never, children: rows };
}

/**
 * Inline content, marks folded back into nesting.
 *
 * ProseMirror stores marks as a set on each text node; Markdown nests them. Runs of text
 * sharing a mark have to be gathered back up, outermost first, or `**a** **b**` comes
 * back as two separate bold spans where the author wrote one.
 */
function inlineToMdast(parent: PMNode): PhrasingContent[] {
    const pieces: { node: PMNode; marks: readonly Mark[] }[] = [];
    parent.forEach((child) => pieces.push({ node: child, marks: child.marks }));
    return foldMarks(pieces, 0);
}

const NESTING = ["link", "strong", "em", "strikethrough", "code"];

function foldMarks(pieces: { node: PMNode; marks: readonly Mark[] }[], depth: number): PhrasingContent[] {
    const out: PhrasingContent[] = [];
    let i = 0;

    while (i < pieces.length) {
        const piece = pieces[i]!;
        const mark = NESTING.slice(depth).find((name) => piece.marks.some((m) => m.type.name === name));

        if (!mark) {
            out.push(leaf(piece.node));
            i += 1;
            continue;
        }

        // Everything that carries the same mark instance belongs in one span.
        const instance = piece.marks.find((m) => m.type.name === mark)!;
        let end = i;
        while (end < pieces.length && pieces[end]!.marks.some((m) => m.eq(instance))) end += 1;

        const inner = pieces.slice(i, end).map((p) => ({
            node: p.node,
            marks: p.marks.filter((m) => !m.eq(instance)),
        }));
        const at = NESTING.indexOf(mark);

        if (mark === "code") {
            out.push({ type: "inlineCode", value: inner.map((p) => p.node.textContent).join("") });
        } else if (mark === "link") {
            out.push({
                type: "link",
                url: String(instance.attrs.href),
                title: (instance.attrs.title as string | null) ?? null,
                children: foldMarks(inner, at + 1),
            });
        } else {
            const type = mark === "strong" ? "strong" : mark === "em" ? "emphasis" : "delete";
            out.push({ type, children: foldMarks(inner, at + 1) } as PhrasingContent);
        }
        i = end;
    }

    return out;
}

function leaf(node: PMNode): PhrasingContent {
    if (node.type.name === "image") {
        return {
            type: "image",
            url: String(node.attrs.src),
            alt: String(node.attrs.alt ?? ""),
            title: (node.attrs.title as string | null) ?? null,
        };
    }
    if (node.type.name === "hard_break") return { type: "break" };
    return { type: "text", value: node.textContent };
}
