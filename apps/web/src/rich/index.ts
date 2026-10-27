import { baseKeymap, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema.ts";
import { keys, rules } from "./input.ts";
import { blockHandles, placeholder, selectionToolbar, slashMenu } from "./chrome.ts";
import { parseDocument, type ParsedDocument } from "./parse.ts";
import { serializeDocument } from "./serialize.ts";

/**
 * The rich editor, assembled.
 *
 * It is handed the Markdown body and hands it back on request. Everything between is
 * ProseMirror's, except the one thing that matters most: `serializeDocument` quotes the
 * source for every block the author left alone, so opening a document and saving it
 * produces no diff at all (W-10).
 */

export interface RichEditor {
    /** The body as Markdown, quoting the original wherever nothing changed. */
    getMarkdown(): string;
    focus(): void;
    destroy(): void;
}

export interface RichEditorOptions {
    /** A reference as written in the document to a URL that will load in this page. */
    resolveAsset?: (reference: string) => string | undefined;
    /** Files dropped or pasted in. Returns the reference to write, or undefined to refuse. */
    onFiles?: (files: File[]) => Promise<string[]>;
    onChange?: () => void;
}

export function mountRichEditor(
    mount: HTMLElement,
    body: string,
    options: RichEditorOptions = {},
): RichEditor {
    const parsed: ParsedDocument = parseDocument(body);

    const promptLink = (view: EditorView) => {
        const { from, to } = view.state.selection;
        if (from === to) return;
        const existing = view.state.doc
            .resolve(from)
            .marks()
            .find((m) => m.type === schema.marks.link);
        // A browser prompt rather than a bespoke popover: it is keyboard accessible,
        // it cannot drift out of position, and the editor has enough surface already.
        const href = window.prompt("Link to", existing ? String(existing.attrs.href) : "https://");
        if (href === null) return;
        if (href === "") {
            toggleMark(schema.marks.link!)(view.state, view.dispatch, view);
            return;
        }
        view.dispatch(
            view.state.tr.addMark(from, to, schema.marks.link!.create({ href, title: null })),
        );
    };

    const state = EditorState.create({
        doc: parsed.doc,
        plugins: [
            // Before the keymaps on purpose: ProseMirror offers a key to each plugin in
            // order, and `baseKeymap` answers Enter unconditionally. The menu has to see
            // it first or choosing an item just splits the paragraph.
            slashMenu(),
            rules,
            keymap({ ...keys, "Mod-k": (_s, _d, view) => (view && promptLink(view), true) }),
            keymap(baseKeymap),
            history(),
            dropCursor({ width: 2 }),
            gapCursor(),
            placeholder(),
            selectionToolbar(promptLink),
            blockHandles(),
        ],
    });

    const view = new EditorView(mount, {
        state,
        attributes: { class: "rich" },
        nodeViews: {
            // The document stores the reference the author wrote; the page has to show
            // something a browser can load, which for an uncommitted paste is a blob.
            image: (node) => {
                const img = document.createElement("img");
                const apply = (n: PMNode) => {
                    const reference = String(n.attrs.src);
                    img.src = options.resolveAsset?.(reference) ?? reference;
                    img.alt = String(n.attrs.alt ?? "");
                    if (n.attrs.title) img.title = String(n.attrs.title);
                };
                apply(node);
                return {
                    dom: img,
                    update: (updated) => {
                        if (updated.type !== node.type) return false;
                        apply(updated);
                        return true;
                    },
                };
            },
        },
        handlePaste: (editorView, event) => {
            const files = [...(event.clipboardData?.files ?? [])];
            if (files.length === 0 || !options.onFiles) return false;
            event.preventDefault();
            void options.onFiles(files).then((references) => {
                for (const reference of references) {
                    const alt = reference.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
                    editorView.dispatch(
                        editorView.state.tr.replaceSelectionWith(
                            schema.nodes.image!.create({ src: reference, alt, title: null }),
                        ),
                    );
                }
            });
            return true;
        },
        handleDrop: (editorView, event) => {
            const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
            if (files.length === 0 || !options.onFiles) return false;
            event.preventDefault();
            void options.onFiles(files).then((references) => {
                for (const reference of references) {
                    const alt = reference.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
                    editorView.dispatch(
                        editorView.state.tr.replaceSelectionWith(
                            schema.nodes.image!.create({ src: reference, alt, title: null }),
                        ),
                    );
                }
            });
            return true;
        },
        dispatchTransaction(transaction) {
            view.updateState(view.state.apply(transaction));
            if (transaction.docChanged) options.onChange?.();
        },
    });

    return {
        getMarkdown: () => serializeDocument(view.state.doc, parsed),
        focus: () => view.focus(),
        destroy: () => view.destroy(),
    };
}
