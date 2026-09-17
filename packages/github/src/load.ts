import { SubmitError } from "./errors.ts";
import type { PullRef, RepoApi } from "./repo.ts";
import { branchNameFor } from "./branch.ts";

export interface LoadForEditArgs {
    documentId: string;
    path: string;
    base: string;
}

export interface LoadedDocument {
    contents: string;
    /** The branch the text came from: the open pull request's, or the base. */
    ref: string;
    /** Present when an edit for this document is already open. */
    pull?: PullRef;
}

/**
 * Read a document for editing, from wherever the next edit will be written.
 *
 * This has to agree with `submitEdit` about which branch a document belongs to, or an
 * author opens the editor, sees the state of `main`, and unknowingly reverts the edits
 * already sitting on the open pull request. E-3 says the next commit appends to that
 * branch; this is the same rule applied to the read.
 */
export async function loadForEdit(repo: RepoApi, args: LoadForEditArgs): Promise<LoadedDocument> {
    for (let attempt = 1; attempt <= 50; attempt++) {
        const branch = branchNameFor(args.documentId, attempt);
        const pull = await repo.findOpenPull(branch);
        if (pull) {
            const onBranch = await repo.getFile(args.path, branch);
            if (onBranch) return { contents: onBranch.text, ref: branch, pull };
            // The pull request exists but not this file: the edit is a deletion, or the
            // branch predates the document. Fall through to base rather than guess.
            break;
        }
        if ((await repo.getBranchSha(branch)) === undefined) break;
    }

    const onBase = await repo.getFile(args.path, args.base);
    if (!onBase) {
        throw new SubmitError("E-1", `\`${args.path}\` does not exist on \`${args.base}\``);
    }
    return { contents: onBase.text, ref: args.base };
}
