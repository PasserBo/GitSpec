import { chainCommands, exitCode, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import {
    InputRule,
    inputRules,
    textblockTypeInputRule,
    wrappingInputRule,
    smartQuotes,
} from "prosemirror-inputrules";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import type { Command } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import { schema } from "./schema.ts";

/**
 * Typing Markdown, and having it become what it means.
 *
 * This is the half of a rich editor that people actually notice. Someone who already
 * knows Markdown types `## ` and expects a heading; someone who does not reaches for the
 * toolbar. Both have to work, or the editor is for one of them and not the other — which
 * is the whole reason for building it.
 *
 * Smart quotes are deliberately absent. They rewrite characters the author typed into
 * different characters, in a file that is read as source as often as it is read as a
 * page, and a diff full of U+2019 is exactly the churn W-1 exists to prevent.
 */

void smartQuotes;

/** `**bold**` and friends, applied as the closing delimiter is typed. */
function markRule(pattern: RegExp, markType: MarkType): InputRule {
    return new InputRule(pattern, (state, match, start, end) => {
        const text = match[1];
        if (!text) return null;
        const transaction = state.tr;
        transaction.delete(start, end);
        transaction.insertText(text, start);
        transaction.addMark(start, start + text.length, markType.create());
        // Removed from the stored set so the next character typed is not also bold.
        transaction.removeStoredMark(markType);
        return transaction;
    });
}

export const rules = inputRules({
    rules: [
        textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading!, (match) => ({
            level: match[1]!.length,
        })),
        textblockTypeInputRule(/^```([a-zA-Z0-9+-]*)[\s\n]$/, schema.nodes.code_block!, (match) => ({
            language: match[1] ?? "",
        })),
        wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote!),
        wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list!),
        wrappingInputRule(
            /^(\d+)\.\s$/,
            schema.nodes.ordered_list!,
            (match) => ({ start: Number(match[1]) }),
            (match, node) => node.childCount + (node.attrs.start as number) === Number(match[1]),
        ),
        new InputRule(/^(?:---|___|\*\*\*)\n$/, (state, _match, start, end) =>
            state.tr.replaceWith(start - 1, end, schema.nodes.horizontal_rule!.create()),
        ),
        markRule(/(?:\*\*)([^*]+)(?:\*\*)$/, schema.marks.strong!),
        markRule(/(?:^|[^*])\*([^*]+)\*$/, schema.marks.em!),
        markRule(/(?:^|[^_])_([^_]+)_$/, schema.marks.em!),
        markRule(/(?:~~)([^~]+)(?:~~)$/, schema.marks.strikethrough!),
        markRule(/(?:`)([^`]+)(?:`)$/, schema.marks.code!),
    ],
});

/** Heading level n, or back to a paragraph if it is already that level. */
export function toggleHeading(level: number): Command {
    return (state, dispatch) => {
        const { $from } = state.selection;
        const current = $from.parent;
        const target =
            current.type === schema.nodes.heading && current.attrs.level === level
                ? setBlockType(schema.nodes.paragraph!)
                : setBlockType(schema.nodes.heading!, { level });
        return target(state, dispatch);
    };
}

export function toggleList(type: "bullet_list" | "ordered_list"): Command {
    return (state, dispatch, view) => {
        const { $from } = state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type === schema.nodes[type]) {
                return liftListItem(schema.nodes.list_item!)(state, dispatch, view);
            }
        }
        return wrapInList(schema.nodes[type]!, {})(state, dispatch, view);
    };
}

export const toggleQuote: Command = (state, dispatch, view) => {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === schema.nodes.blockquote) {
            // No lift command for a plain wrapper, so the content is pulled out by
            // replacing the quote with its own children.
            if (!dispatch) return true;
            const start = $from.before(depth);
            const node = $from.node(depth);
            dispatch(state.tr.replaceWith(start, start + node.nodeSize, node.content));
            return true;
        }
    }
    return wrapIn(schema.nodes.blockquote!)(state, dispatch, view);
};

export const toggleCodeBlock: Command = (state, dispatch) => {
    const type = state.selection.$from.parent.type === schema.nodes.code_block
        ? schema.nodes.paragraph!
        : schema.nodes.code_block!;
    return setBlockType(type)(state, dispatch);
};

export const insertRule: Command = (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule!.create()));
    return true;
};

export function insertTable(rows = 3, columns = 3): Command {
    return (state, dispatch) => {
        if (!dispatch) return true;
        const header = Array.from({ length: columns }, () => schema.nodes.table_header!.create());
        const body = Array.from({ length: rows - 1 }, () =>
            schema.nodes.table_row!.create(
                null,
                Array.from({ length: columns }, () => schema.nodes.table_cell!.create()),
            ),
        );
        const table = schema.nodes.table!.create({ align: Array(columns).fill(null) }, [
            schema.nodes.table_row!.create(null, header),
            ...body,
        ]);
        dispatch(state.tr.replaceSelectionWith(table).scrollIntoView());
        return true;
    };
}

const hardBreak: Command = chainCommands(exitCode, (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break!.create()).scrollIntoView());
    return true;
});

export const keys: Record<string, Command> = {
    "Mod-b": toggleMark(schema.marks.strong!),
    "Mod-i": toggleMark(schema.marks.em!),
    "Mod-`": toggleMark(schema.marks.code!),
    "Shift-Mod-x": toggleMark(schema.marks.strikethrough!),
    "Mod-z": undo,
    "Shift-Mod-z": redo,
    "Mod-y": redo,
    "Mod-Alt-0": setBlockType(schema.nodes.paragraph!),
    "Mod-Alt-1": toggleHeading(1),
    "Mod-Alt-2": toggleHeading(2),
    "Mod-Alt-3": toggleHeading(3),
    "Mod-Alt-4": toggleHeading(4),
    "Shift-Mod-8": toggleList("bullet_list"),
    "Shift-Mod-9": toggleList("ordered_list"),
    "Mod-Shift-.": toggleQuote,
    Enter: splitListItem(schema.nodes.list_item!),
    Tab: sinkListItem(schema.nodes.list_item!),
    "Shift-Tab": liftListItem(schema.nodes.list_item!),
    "Shift-Enter": hardBreak,
    "Mod-Enter": hardBreak,
};
