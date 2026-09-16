import { SubmitError } from "./errors.ts";
import type { PullRef, RepoApi } from "./repo.ts";

export interface EditSubmission {
    /** Identity of the document being edited. Decides the branch, which is what makes E-2 hold. */
    documentId: string;
    /** Repository-root-relative path of the file to write. */
    path: string;
    /** Full new text of the file. */
    contents: string;
    /** Branch the change is proposed against, normally the repository default. */
    base: string;
    /** Shown on the pull request. Falls back to the document id. */
    title?: string;
    /** Free text from the author, placed in the pull request body. */
    summary?: string;
    /** Commit trailers. E-5 uses these to mark an edit as an agent's without changing its author. */
    trailers?: Record<string, string>;
}

export interface SubmitResult {
    branch: string;
    pull: PullRef;
    /** True when this call opened the pull request, false when it appended to an open one. */
    created: boolean;
}

/** Git refs disallow a fair amount; ids are already slug-shaped, so this is a guard, not a transform. */
export function branchNameFor(documentId: string, attempt = 1): string {
    const slug =
        documentId
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^[-.]+|[-.]+$/g, "")
            .replace(/\.lock$/, "") || "document";
    return attempt === 1 ? `gitspec/${slug}` : `gitspec/${slug}-${attempt}`;
}

function commitMessage(submission: EditSubmission): string {
    const subject = `docs: update ${submission.title ?? submission.documentId}`;
    const trailers = Object.entries(submission.trailers ?? {}).map(([k, v]) => `${k}: ${v}`);
    return trailers.length > 0 ? `${subject}\n\n${trailers.join("\n")}` : subject;
}

/**
 * Turn an edit into a branch and a pull request.
 *
 * The shape of this function is the whole of the sync design. An edit never reaches the
 * default branch (E-1). The branch is derived from the document, so a second edit to the
 * same document finds the same open pull request and appends to it rather than opening a
 * rival one (E-2, E-3). Nothing here merges (A-3) or forces (A-4), and when the write is
 * refused because the branch moved underneath it, the edit is reported and abandoned
 * rather than retried harder (C-2).
 */
export async function submitEdit(repo: RepoApi, submission: EditSubmission): Promise<SubmitResult> {
    if (!submission.path) {
        throw new SubmitError("E-1", "an edit must name the file it changes");
    }

    // E-2/E-3: the open pull request for this document, if there is one, decides
    // everything. Its branch is reused; a second pull request is never opened.
    let branch = "";
    let pull: PullRef | undefined;
    for (let attempt = 1; attempt <= 50; attempt++) {
        const candidate = branchNameFor(submission.documentId, attempt);
        if (candidate === submission.base) {
            throw new SubmitError("E-1", `the branch for \`${submission.documentId}\` collides with the base branch`);
        }

        const open = await repo.findOpenPull(candidate);
        if (open) {
            branch = candidate;
            pull = open;
            break;
        }

        // A branch with no open pull request is spent — its pull request was merged or
        // closed. A-4 forbids forcing it back to base, so the next edit gets the next
        // name instead. Nothing is destroyed and E-2 still holds, because only one pull
        // request for this document is open at a time.
        if ((await repo.getBranchSha(candidate)) === undefined) {
            branch = candidate;
            break;
        }
    }

    if (!branch) {
        throw new SubmitError("E-2", `no free branch name for \`${submission.documentId}\` after 50 attempts`);
    }

    const baseSha = await repo.getBranchSha(submission.base);
    if (!baseSha) {
        throw new SubmitError("E-1", `base branch \`${submission.base}\` does not exist`);
    }

    if (!pull) {
        await repo.createBranch(branch, baseSha);
    }

    // The blob sha comes from the branch being written to, so an append builds on the
    // edits already on it rather than on whatever base looked like.
    const existing = await repo.getFile(submission.path, branch);
    if (existing?.text === submission.contents) {
        if (pull) return { branch, pull, created: false };
        throw new SubmitError("E-1", `\`${submission.path}\` is unchanged; there is nothing to propose`);
    }

    await repo.putFile({
        path: submission.path,
        branch,
        message: commitMessage(submission),
        contents: submission.contents,
        sha: existing?.sha,
    });

    if (pull) return { branch, pull, created: false };

    const body = [
        submission.summary?.trim(),
        `Edited in GitSpec. Merging this pull request is what makes the change authoritative.`,
    ]
        .filter(Boolean)
        .join("\n\n");

    return {
        branch,
        pull: await repo.createPull({
            head: branch,
            base: submission.base,
            title: `docs: update ${submission.title ?? submission.documentId}`,
            body,
        }),
        created: true,
    };
}
