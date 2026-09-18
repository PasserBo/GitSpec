import { resolveBranch } from "./branch.ts";
import { SubmitError } from "./errors.ts";
import type { PullRef, RepoApi } from "./repo.ts";

export interface FileToWrite {
    /** Repository-root-relative. */
    path: string;
    /** Text, or raw bytes for a file that is not text — an image, say. */
    contents: string | Uint8Array;
}

export interface FilesSubmission {
    /** Names the branch (`gitspec/<branchId>`) and, through it, the one open pull request. */
    branchId: string;
    files: FileToWrite[];
    base: string;
    title: string;
    body: string;
    /**
     * Refuse if any target already exists on the base branch. Setup uses this: it adds
     * files to a repository it did not write and must never overwrite one it finds there.
     */
    addOnly?: boolean;
    trailers?: Record<string, string>;
}

export interface FilesResult {
    branch: string;
    pull: PullRef;
    /** True when this call opened the pull request. */
    created: boolean;
    /** Paths actually committed, in order. */
    written: string[];
}

function message(subject: string, trailers?: Record<string, string>): string {
    const lines = Object.entries(trailers ?? {}).map(([k, v]) => `${k}: ${v}`);
    return lines.length ? `${subject}\n\n${lines.join("\n")}` : subject;
}

/**
 * Propose several files as one pull request.
 *
 * One commit per file, sequentially on the same branch. The Contents API writes one file
 * per commit and that is the whole of `RepoApi`'s write surface; adding Git Data calls
 * for a single atomic commit would widen a port whose narrowness is deliberate, for the
 * cosmetic gain of one commit rather than three in the same review.
 *
 * Everything else is `submitEdit`'s rules applied to a set: never the default branch
 * (E-1), one open pull request per id (E-2), append when one exists (E-3), authored as
 * the token's owner (E-4), and a refused write is reported and abandoned (C-2).
 */
export async function submitFiles(repo: RepoApi, submission: FilesSubmission): Promise<FilesResult> {
    if (submission.files.length === 0) {
        throw new SubmitError("E-1", "nothing to propose: the submission names no files");
    }
    const seen = new Set<string>();
    for (const file of submission.files) {
        if (!file.path) throw new SubmitError("E-1", "a file to write must have a path");
        if (seen.has(file.path)) throw new SubmitError("E-1", `\`${file.path}\` is listed twice`);
        seen.add(file.path);
    }

    const baseSha = await repo.getBranchSha(submission.base);
    if (!baseSha) {
        throw new SubmitError("E-1", `base branch \`${submission.base}\` does not exist`);
    }

    // Checked against base before anything is created, so a refusal leaves no branch
    // behind. C-3 in spirit: a file we did not expect is a conflict to surface, never a
    // thing to write around.
    if (submission.addOnly) {
        for (const file of submission.files) {
            if (await repo.getFile(file.path, submission.base)) {
                throw new SubmitError(
                    "C-3",
                    `\`${file.path}\` already exists on \`${submission.base}\`; setup only adds files and will not replace one`,
                );
            }
        }
    }

    const { branch, pull } = await resolveBranch(repo, submission.branchId, submission.base);
    if (!pull) await repo.createBranch(branch, baseSha);

    const written: string[] = [];
    for (const file of submission.files) {
        // Read from the branch being written to, so a rerun onto an open pull request
        // updates what is already there rather than colliding with it.
        const existing = await repo.getFile(file.path, branch);
        if (existing?.text === file.contents) continue;
        await repo.putFile({
            path: file.path,
            branch,
            message: message(`${submission.title}: ${file.path}`, submission.trailers),
            contents: file.contents,
            sha: existing?.sha,
        });
        written.push(file.path);
    }

    if (pull) return { branch, pull, created: false, written };

    if (written.length === 0) {
        throw new SubmitError("E-1", "every file already has the proposed contents; there is nothing to propose");
    }

    return {
        branch,
        pull: await repo.createPull({
            head: branch,
            base: submission.base,
            title: submission.title,
            body: submission.body,
        }),
        created: true,
        written,
    };
}
