import { parseMarkdown } from "@gitspec/render/browser";
import { Mark, Node as PMNode } from "prosemirror-model";
import type { Nodes as MdNode, Root, RootContent, PhrasingContent } from "mdast";
import { schema } from "./schema.ts";

/**
 * Markdown into a ProseMirror document, remembering where every top-level block came
 * from.
 *
 * The spans are the whole trick behind W-10. ProseMirror's document is persistent: editing
 * one paragraph produces a new node for that paragraph and reuses the objects for every
 * other one. So a map keyed by node identity, filled in here, still answers after an
 * arbitrary number of edits — and whatever it still answers for is a block nobody
 * touched, which can be written back as the bytes it arrived as rather than re-serialised
 * into whatever this year's formatter prefers.
 */

export interface ParsedDocument {
    doc: PMNode;
    /** Top-level block to its `[start, end)` offsets in the source it was parsed from. */
    spans: Map<PMNode, [number, number]>;
    /** The source those offsets index, kept so the serializer can quote from it. */
    source: string;
}

export function parseDocument(source: string): ParsedDocument {
    const tree = parseMarkdown(source) as Root;
    const spans = new Map<PMNode, [number, number]>();

    const blocks: PMNode[] = [];
    for (const child of tree.children) {
        const node = blockFrom(child, source);
        if (!node) continue;
        blocks.push(node);
        const start = child.position?.start.offset;
        const end = child.position?.end.offset;
        // A node without position cannot be quoted from, so it is simply not recorded and
        // will be serialised like an edited one. remark gives positions for everything it
        // parses; this guards the case where one day it does not.
        if (typeof start === "number" && typeof end === "number") spans.set(node, [start, end]);
    }

    if (blocks.length === 0) blocks.push(schema.nodes.paragraph!.create());
    return { doc: schema.nodes.doc!.create(null, blocks), spans, source };
}

/** The original text of a node, for anything this schema will not model. */
function verbatim(node: MdNode, source: string, label: string): PMNode {
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? source.length;
    return schema.nodes.verbatim!.create({ text: source.slice(start, end), label });
}

function blockFrom(node: RootContent, source: string): PMNode | undefined {
    switch (node.type) {
        case "paragraph":
            return schema.nodes.paragraph!.create(null, inlineFrom(node.children, source));

        case "heading":
            return schema.nodes.heading!.create(
                { level: node.depth },
                inlineFrom(node.children, source),
            );

        case "blockquote": {
            const children = node.children.map((c) => blockFrom(c, source)).filter(isNode);
            return schema.nodes.blockquote!.create(
                null,
                children.length > 0 ? children : schema.nodes.paragraph!.create(),
            );
        }

        case "code":
            return schema.nodes.code_block!.create(
                { language: node.lang ?? "" },
                node.value ? schema.text(node.value) : null,
            );

        case "thematicBreak":
            return schema.nodes.horizontal_rule!.create();

        case "list": {
            const items = node.children.map((item) => listItemFrom(item, source)).filter(isNode);
            if (items.length === 0) return undefined;
            // mdast marks a list loose when any item is spread; the distinction decides
            // whether blank lines separate items when it is written back.
            const tight = !node.spread && !node.children.some((i) => i.spread);
            return node.ordered
                ? schema.nodes.ordered_list!.create({ start: node.start ?? 1, tight }, items)
                : schema.nodes.bullet_list!.create({ tight }, items);
        }

        case "table":
            return tableFrom(node, source);

        // Raw HTML is kept exactly as written, which is also what the renderer does with
        // it. A rich editor that silently reformatted someone's `<details>` block would
        // be the churn this project exists to avoid.
        case "html":
            return verbatim(node, source, "HTML");

        default:
            return verbatim(node, source, node.type);
    }
}

function listItemFrom(item: RootContent, source: string): PMNode | undefined {
    if (item.type !== "listItem") return undefined;
    const children = item.children.map((c) => blockFrom(c, source)).filter(isNode);
    const content =
        children.length > 0 && children[0]!.type.name === "paragraph"
            ? children
            : [schema.nodes.paragraph!.create(), ...children];
    return schema.nodes.list_item!.create(null, content);
}

function tableFrom(node: Extract<RootContent, { type: "table" }>, source: string): PMNode {
    const align = (node.align ?? []).map((a) => a ?? null);
    const rows = node.children.map((row, index) => {
        const cells = row.children.map((cell) => {
            const type = index === 0 ? schema.nodes.table_header! : schema.nodes.table_cell!;
            return type.create(null, inlineFrom(cell.children, source));
        });
        return schema.nodes.table_row!.create(null, cells);
    });
    return schema.nodes.table!.create({ align }, rows);
}

function inlineFrom(children: PhrasingContent[], source: string, marks: readonly Mark[] = []): PMNode[] {
    const out: PMNode[] = [];

    const withMark = (name: string, attrs: Record<string, unknown> | null, kids: PhrasingContent[]) => {
        const mark = schema.marks[name]!.create(attrs ?? undefined);
        out.push(...inlineFrom(kids, source, mark.addToSet(marks as Mark[])));
    };

    for (const child of children) {
        switch (child.type) {
            case "text":
                if (child.value) out.push(schema.text(child.value, marks as Mark[]));
                break;
            case "strong":
                withMark("strong", null, child.children);
                break;
            case "emphasis":
                withMark("em", null, child.children);
                break;
            case "delete":
                withMark("strikethrough", null, child.children);
                break;
            case "link":
                withMark("link", { href: child.url, title: child.title ?? null }, child.children);
                break;
            case "inlineCode":
                out.push(schema.text(child.value, schema.marks.code!.create().addToSet(marks as Mark[])));
                break;
            case "image":
                out.push(
                    schema.nodes.image!.create({
                        src: child.url,
                        alt: child.alt ?? "",
                        title: child.title ?? null,
                    }),
                );
                break;
            case "break":
                out.push(schema.nodes.hard_break!.create());
                break;
            default: {
                // An inline construct this schema does not model — raw inline HTML, a
                // footnote reference. Kept as its own source text so the bytes survive,
                // even though it will read as literal text while being edited.
                const start = child.position?.start.offset;
                const end = child.position?.end.offset;
                const text = typeof start === "number" && typeof end === "number" ? source.slice(start, end) : "";
                if (text) out.push(schema.text(text, marks as Mark[]));
            }
        }
    }

    return out;
}

function isNode(node: PMNode | undefined): node is PMNode {
    return node !== undefined;
}
