import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";

/**
 * The document model, which is Markdown's model and not one of its own.
 *
 * A rich editor usually gets to invent its schema and then worry about export. Here the
 * schema is the constraint: every node has to be something Markdown can say, or the
 * round trip W-10 promises cannot hold. So there is no node here that `mdast-util-to-
 * markdown` cannot write, and anything the parser produces that is not on this list
 * becomes a `verbatim` block, which is never re-serialised at all.
 *
 * That last node is what makes the rest safe. Raw HTML, a mermaid fence, a footnote
 * definition, a construct added to Markdown next year — each arrives as opaque text,
 * shows as an uneditable card, and leaves as exactly the bytes it came in as.
 */

const nodes: Record<string, NodeSpec> = {
    doc: { content: "block+" },

    paragraph: {
        content: "inline*",
        group: "block",
        parseDOM: [{ tag: "p" }],
        toDOM: () => ["p", 0],
    },

    heading: {
        attrs: { level: { default: 1 } },
        content: "inline*",
        group: "block",
        defining: true,
        parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
        toDOM: (node) => [`h${node.attrs.level}`, 0],
    },

    blockquote: {
        content: "block+",
        group: "block",
        defining: true,
        parseDOM: [{ tag: "blockquote" }],
        toDOM: () => ["blockquote", 0],
    },

    code_block: {
        attrs: { language: { default: "" } },
        content: "text*",
        marks: "",
        group: "block",
        code: true,
        defining: true,
        parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
        toDOM: (node) => [
            "pre",
            { "data-language": node.attrs.language || null },
            ["code", 0],
        ],
    },

    bullet_list: {
        attrs: { tight: { default: true } },
        content: "list_item+",
        group: "block",
        parseDOM: [{ tag: "ul" }],
        toDOM: () => ["ul", 0],
    },

    ordered_list: {
        attrs: { start: { default: 1 }, tight: { default: true } },
        content: "list_item+",
        group: "block",
        parseDOM: [{ tag: "ol" }],
        toDOM: (node) => ["ol", node.attrs.start === 1 ? {} : { start: node.attrs.start }, 0],
    },

    list_item: {
        // A list item holding a bare paragraph is the tight case; Markdown's distinction
        // between tight and loose lists is a property of the list, not of the item.
        content: "paragraph block*",
        defining: true,
        parseDOM: [{ tag: "li" }],
        toDOM: () => ["li", 0],
    },

    horizontal_rule: {
        group: "block",
        parseDOM: [{ tag: "hr" }],
        toDOM: () => ["hr"],
    },

    table: {
        attrs: { align: { default: [] as (string | null)[] } },
        content: "table_row+",
        group: "block",
        tableRole: "table",
        isolating: true,
        parseDOM: [{ tag: "table" }],
        toDOM: () => ["table", ["tbody", 0]],
    },
    table_row: {
        content: "(table_cell | table_header)*",
        tableRole: "row",
        parseDOM: [{ tag: "tr" }],
        toDOM: () => ["tr", 0],
    },
    table_cell: {
        content: "inline*",
        attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } },
        tableRole: "cell",
        isolating: true,
        parseDOM: [{ tag: "td" }],
        toDOM: () => ["td", 0],
    },
    table_header: {
        content: "inline*",
        attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } },
        tableRole: "header_cell",
        isolating: true,
        parseDOM: [{ tag: "th" }],
        toDOM: () => ["th", 0],
    },

    /**
     * Anything Markdown can say and this schema cannot: raw HTML, an unknown fence, a
     * footnote definition. Held as text and written back untouched (W-11).
     */
    verbatim: {
        attrs: { text: { default: "" }, label: { default: "block" } },
        group: "block",
        atom: true,
        selectable: true,
        isolating: true,
        toDOM: (node) => [
            "div",
            { class: "verbatim", "data-label": node.attrs.label },
            ["div", { class: "verbatim-label" }, node.attrs.label],
            ["pre", node.attrs.text],
        ],
    },

    image: {
        inline: true,
        attrs: { src: {}, alt: { default: "" }, title: { default: null } },
        group: "inline",
        draggable: true,
        parseDOM: [
            {
                tag: "img[src]",
                getAttrs: (dom) => ({
                    src: (dom as HTMLElement).getAttribute("src"),
                    alt: (dom as HTMLElement).getAttribute("alt") ?? "",
                    title: (dom as HTMLElement).getAttribute("title"),
                }),
            },
        ],
        toDOM: (node) => ["img", node.attrs],
    },

    hard_break: {
        inline: true,
        group: "inline",
        selectable: false,
        parseDOM: [{ tag: "br" }],
        toDOM: () => ["br"],
    },

    text: { group: "inline" },
};

const marks: Record<string, MarkSpec> = {
    strong: {
        parseDOM: [{ tag: "strong" }, { tag: "b" }, { style: "font-weight=bold" }],
        toDOM: () => ["strong", 0],
    },
    em: {
        parseDOM: [{ tag: "em" }, { tag: "i" }],
        toDOM: () => ["em", 0],
    },
    strikethrough: {
        parseDOM: [{ tag: "del" }, { tag: "s" }],
        toDOM: () => ["del", 0],
    },
    code: {
        // Excluded from the others because Markdown has no way to write a bold span
        // inside a code span, and offering it would make a document that cannot be saved.
        excludes: "_",
        parseDOM: [{ tag: "code" }],
        toDOM: () => ["code", 0],
    },
    link: {
        attrs: { href: {}, title: { default: null } },
        inclusive: false,
        parseDOM: [
            {
                tag: "a[href]",
                getAttrs: (dom) => ({
                    href: (dom as HTMLElement).getAttribute("href"),
                    title: (dom as HTMLElement).getAttribute("title"),
                }),
            },
        ],
        toDOM: (mark) => ["a", { href: mark.attrs.href, title: mark.attrs.title }, 0],
    },
};

export const schema = new Schema({ nodes, marks });
