import { setBlockType, toggleMark } from "prosemirror-commands";
import { Plugin, PluginKey, TextSelection, type Command, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema.ts";
import {
    insertRule,
    insertTable,
    toggleCodeBlock,
    toggleHeading,
    toggleList,
    toggleQuote,
} from "./input.ts";

/**
 * The parts of a document editor ProseMirror does not have an opinion about.
 *
 * It ships a document model, a transaction system and a view, and stops there — on the
 * reasonable grounds that every product wants a different surface. So a slash menu, a
 * selection toolbar, block handles and a link editor are all written here, against the
 * same commands the keyboard shortcuts use. Nothing in this file can produce a document
 * the schema does not allow, which is what keeps the surface from quietly outgrowing
 * what Markdown can hold.
 */

function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

// ---------------------------------------------------------------- placeholder

export function placeholder(): Plugin {
    return new Plugin({
        props: {
            decorations(state) {
                const { $from, empty } = state.selection;
                const parent = $from.parent;
                if (!empty || parent.content.size > 0 || parent.type !== schema.nodes.paragraph) {
                    return null;
                }
                return DecorationSet.create(state.doc, [
                    Decoration.node($from.before(), $from.after(), {
                        class: "is-empty",
                        "data-placeholder": "Type / for commands",
                    }),
                ]);
            },
        },
    });
}

// ------------------------------------------------------------------ commands

export interface Entry {
    label: string;
    hint: string;
    keywords: string;
    command: Command;
}

export const ENTRIES: Entry[] = [
    { label: "Text", hint: "Plain paragraph", keywords: "text paragraph body p", command: setBlockType(schema.nodes.paragraph!) },
    { label: "Heading 1", hint: "Section title", keywords: "heading h1 title", command: toggleHeading(1) },
    { label: "Heading 2", hint: "Subsection", keywords: "heading h2 subtitle", command: toggleHeading(2) },
    { label: "Heading 3", hint: "Minor heading", keywords: "heading h3", command: toggleHeading(3) },
    { label: "Bulleted list", hint: "A list of items", keywords: "bullet list unordered ul", command: toggleList("bullet_list") },
    { label: "Numbered list", hint: "A list in order", keywords: "number ordered list ol", command: toggleList("ordered_list") },
    { label: "Quote", hint: "Set a passage apart", keywords: "quote blockquote", command: toggleQuote },
    { label: "Code", hint: "A fenced code block", keywords: "code fence pre snippet", command: toggleCodeBlock },
    { label: "Table", hint: "Rows and columns", keywords: "table grid", command: insertTable() },
    { label: "Divider", hint: "A horizontal rule", keywords: "divider rule hr line break", command: insertRule },
];

// ------------------------------------------------------------------ slash menu

const SLASH = new PluginKey<{ from: number; query: string } | null>("slash");

/** The query being typed, when the cursor sits in a textblock that starts with a slash. */
function slashQuery(state: EditorState): { from: number; query: string } | null {
    const { $from, empty } = state.selection;
    if (!empty || $from.parent.type === schema.nodes.code_block) return null;
    const start = $from.start();
    const before = state.doc.textBetween(start, $from.pos, "\n", "\0");
    const match = /^\/([a-zA-Z]*)$/.exec(before);
    return match ? { from: start, query: match[1]!.toLowerCase() } : null;
}

export function matching(query: string): Entry[] {
    if (!query) return ENTRIES;
    return ENTRIES.filter((entry) => entry.keywords.includes(query) || entry.label.toLowerCase().includes(query));
}

export function slashMenu(): Plugin {
    return new Plugin<{ from: number; query: string } | null>({
        key: SLASH,
        state: {
            init: () => null,
            apply: (_tr, _value, _old, state) => slashQuery(state),
        },
        props: {
            handleKeyDown(view, event) {
                const open = SLASH.getState(view.state);
                if (!open) return false;
                const items = matching(open.query);
                if (items.length === 0) return false;

                const menu = (view.dom.parentElement?.querySelector(".slash") ?? null) as HTMLElement | null;
                if (!menu) return false;
                const active = Number(menu.dataset.active ?? "0");

                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    const next = event.key === "ArrowDown" ? active + 1 : active - 1;
                    menu.dataset.active = String((next + items.length) % items.length);
                    menu.dispatchEvent(new CustomEvent("rerender"));
                    return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                    runEntry(view, items[active] ?? items[0]!, open.from);
                    return true;
                }
                if (event.key === "Escape") {
                    // Leaving the slash in place would reopen the menu on the next
                    // keystroke; removing it is what "never mind" has to mean.
                    view.dispatch(view.state.tr.delete(open.from, open.from + 1));
                    return true;
                }
                return false;
            },
        },
        view: (view) => menuView(view),
    });
}

function runEntry(view: EditorView, entry: Entry, from: number): void {
    const { state } = view;
    // The typed `/query` is removed first, so the command acts on an empty block and the
    // text never survives into the document.
    const to = state.selection.$from.pos;
    view.dispatch(state.tr.delete(from, to));
    entry.command(view.state, view.dispatch, view);
    view.focus();
}

function menuView(view: EditorView) {
    const menu = element("div", "slash");
    menu.dataset.active = "0";
    menu.style.display = "none";
    view.dom.parentElement?.appendChild(menu);

    const render = () => {
        const open = SLASH.getState(view.state);
        const items = open ? matching(open.query) : [];
        if (!open || items.length === 0) {
            menu.style.display = "none";
            return;
        }
        const active = Math.min(Number(menu.dataset.active ?? "0"), items.length - 1);
        menu.dataset.active = String(active);
        menu.replaceChildren(
            ...items.map((entry, index) => {
                const row = element("button", index === active ? "slash-item active" : "slash-item");
                row.type = "button";
                row.append(element("span", "slash-label", entry.label), element("span", "slash-hint", entry.hint));
                row.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    runEntry(view, entry, open.from);
                });
                return row;
            }),
        );

        const coords = view.coordsAtPos(open.from);
        const box = view.dom.parentElement!.getBoundingClientRect();
        menu.style.display = "block";
        menu.style.left = `${coords.left - box.left}px`;
        menu.style.top = `${coords.bottom - box.top + 6}px`;
    };

    menu.addEventListener("rerender", render);
    render();
    return {
        update: () => {
            const open = SLASH.getState(view.state);
            if (!open) menu.dataset.active = "0";
            render();
        },
        destroy: () => menu.remove(),
    };
}

// -------------------------------------------------------------- selection toolbar

const MARK_BUTTONS: { label: string; title: string; mark: string }[] = [
    { label: "B", title: "Bold  ⌘B", mark: "strong" },
    { label: "I", title: "Italic  ⌘I", mark: "em" },
    { label: "S", title: "Strikethrough  ⇧⌘X", mark: "strikethrough" },
    { label: "<>", title: "Code  ⌘`", mark: "code" },
];

export function selectionToolbar(onLink: (view: EditorView) => void): Plugin {
    return new Plugin({
        view: (view) => {
            const bar = element("div", "bubble");
            bar.style.display = "none";
            view.dom.parentElement?.appendChild(bar);

            const build = () => {
                bar.replaceChildren();
                for (const { label, title, mark } of MARK_BUTTONS) {
                    const button = element("button", "bubble-button", label);
                    button.type = "button";
                    button.title = title;
                    const type = schema.marks[mark]!;
                    const active = view.state.doc.rangeHasMark(
                        view.state.selection.from,
                        view.state.selection.to,
                        type,
                    );
                    if (active) button.classList.add("active");
                    button.addEventListener("mousedown", (event) => {
                        event.preventDefault();
                        toggleMark(type)(view.state, view.dispatch, view);
                    });
                    bar.appendChild(button);
                }
                const link = element("button", "bubble-button", "Link");
                link.type = "button";
                link.title = "Link  ⌘K";
                link.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    onLink(view);
                });
                bar.appendChild(link);
            };

            const render = () => {
                const { from, to, empty } = view.state.selection;
                // A toolbar over a code block would offer formatting Markdown cannot put
                // there, so it simply does not appear.
                if (empty || view.state.selection.$from.parent.type === schema.nodes.code_block) {
                    bar.style.display = "none";
                    return;
                }
                build();
                const start = view.coordsAtPos(from);
                const end = view.coordsAtPos(to);
                const box = view.dom.parentElement!.getBoundingClientRect();
                bar.style.display = "flex";
                bar.style.left = `${Math.max(4, (start.left + end.left) / 2 - box.left - bar.offsetWidth / 2)}px`;
                bar.style.top = `${start.top - box.top - bar.offsetHeight - 8}px`;
            };

            render();
            return { update: render, destroy: () => bar.remove() };
        },
    });
}

// ------------------------------------------------------------------ block handles

const TURN_INTO: { label: string; command: Command }[] = [
    { label: "Text", command: setBlockType(schema.nodes.paragraph!) },
    { label: "Heading 1", command: toggleHeading(1) },
    { label: "Heading 2", command: toggleHeading(2) },
    { label: "Heading 3", command: toggleHeading(3) },
    { label: "Bulleted list", command: toggleList("bullet_list") },
    { label: "Numbered list", command: toggleList("ordered_list") },
    { label: "Quote", command: toggleQuote },
    { label: "Code", command: toggleCodeBlock },
];

/** The top-level block under a point, and where it starts. */
function blockAt(view: EditorView, clientY: number): { node: PMNode; pos: number; dom: HTMLElement } | null {
    const box = view.dom.getBoundingClientRect();
    const found = view.posAtCoords({ left: box.left + 24, top: clientY });
    if (!found) return null;
    const $pos = view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos);
    const depth = Math.min(1, $pos.depth);
    const pos = $pos.before(depth === 0 ? 1 : 1);
    const node = view.state.doc.nodeAt(pos);
    if (!node) return null;
    const dom = view.nodeDOM(pos);
    return dom instanceof HTMLElement ? { node, pos, dom } : null;
}

export function blockHandles(): Plugin {
    return new Plugin({
        view: (view) => {
            const parent = view.dom.parentElement!;
            const handle = element("div", "handle");
            handle.style.display = "none";
            handle.append(
                Object.assign(element("button", "handle-button", "+"), { type: "button", title: "Insert a block below" }),
                Object.assign(element("button", "handle-button drag", "⠿"), { type: "button", title: "Block actions" }),
            );
            parent.appendChild(handle);

            let current: { node: PMNode; pos: number } | null = null;

            const place = (event: MouseEvent) => {
                if (parent.querySelector(".block-menu")) return;
                const found = blockAt(view, event.clientY);
                if (!found) {
                    handle.style.display = "none";
                    current = null;
                    return;
                }
                current = { node: found.node, pos: found.pos };
                const box = parent.getBoundingClientRect();
                const rect = found.dom.getBoundingClientRect();
                handle.style.display = "flex";
                handle.style.top = `${rect.top - box.top + parent.scrollTop}px`;
                handle.style.left = `${Math.max(2, rect.left - box.left - 46)}px`;
            };

            const hide = () => {
                if (!parent.querySelector(".block-menu")) handle.style.display = "none";
            };

            parent.addEventListener("mousemove", place);
            parent.addEventListener("mouseleave", hide);

            handle.children[0]!.addEventListener("mousedown", (event) => {
                event.preventDefault();
                if (!current) return;
                const after = current.pos + current.node.nodeSize;
                const tr = view.state.tr.insert(after, schema.nodes.paragraph!.create());
                tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
                view.dispatch(tr.scrollIntoView());
                view.focus();
            });

            handle.children[1]!.addEventListener("mousedown", (event) => {
                event.preventDefault();
                if (current) openBlockMenu(view, parent, handle, current);
            });

            return {
                destroy: () => {
                    parent.removeEventListener("mousemove", place);
                    parent.removeEventListener("mouseleave", hide);
                    handle.remove();
                },
            };
        },
    });
}

function openBlockMenu(
    view: EditorView,
    parent: HTMLElement,
    handle: HTMLElement,
    target: { node: PMNode; pos: number },
): void {
    parent.querySelector(".block-menu")?.remove();
    const menu = element("div", "block-menu");
    menu.style.top = `${handle.offsetTop}px`;
    menu.style.left = `${handle.offsetLeft + handle.offsetWidth + 6}px`;

    const close = () => {
        menu.remove();
        document.removeEventListener("mousedown", onAway, true);
    };
    const onAway = (event: MouseEvent) => {
        if (!menu.contains(event.target as Node)) close();
    };

    const act = (label: string, run: () => void) => {
        const button = element("button", "block-menu-item", label);
        button.type = "button";
        button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            run();
            close();
            view.focus();
        });
        return button;
    };

    const select = () => {
        const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target.pos + 1)));
        view.dispatch(tr);
    };

    menu.append(element("div", "block-menu-head", "Turn into"));
    for (const option of TURN_INTO) {
        menu.append(
            act(option.label, () => {
                select();
                option.command(view.state, view.dispatch, view);
            }),
        );
    }

    menu.append(element("div", "block-menu-head", "Block"));
    menu.append(
        act("Move up", () => {
            const index = indexOf(view, target.pos);
            if (index > 0) move(view, index, index - 1);
        }),
        act("Move down", () => {
            const index = indexOf(view, target.pos);
            if (index < view.state.doc.childCount - 1) move(view, index, index + 1);
        }),
        act("Duplicate", () => {
            const after = target.pos + target.node.nodeSize;
            view.dispatch(view.state.tr.insert(after, target.node.copy(target.node.content)));
        }),
        act("Delete", () => {
            view.dispatch(view.state.tr.delete(target.pos, target.pos + target.node.nodeSize));
        }),
    );

    parent.appendChild(menu);
    setTimeout(() => document.addEventListener("mousedown", onAway, true), 0);
}

function indexOf(view: EditorView, pos: number): number {
    let index = 0;
    let offset = 0;
    view.state.doc.forEach((node, nodeOffset, i) => {
        if (nodeOffset === pos) {
            index = i;
            offset = nodeOffset;
        }
    });
    void offset;
    return index;
}

/** Reorder by removing a top-level block and putting it back somewhere else. */
function move(view: EditorView, from: number, to: number): void {
    const doc = view.state.doc;
    const blocks: PMNode[] = [];
    doc.forEach((node) => blocks.push(node));
    const [moved] = blocks.splice(from, 1);
    if (!moved) return;
    blocks.splice(to, 0, moved);
    const tr = view.state.tr.replaceWith(0, doc.content.size, blocks);
    view.dispatch(tr);
}
