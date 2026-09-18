import { loadForEdit, restRepo, submitEdit, SubmitError, type PullRef } from "@gitspec/github";
import { beginSignIn, completeSignIn, currentToken, signOut } from "./auth.ts";
import { $, escape, panel } from "./ui.ts";
import { renderMarkdown, withBase } from "@gitspec/render/browser";
import type { SiteManifest } from "@gitspec/render/browser";
import { schemaFor, validateFrontmatter, type Field } from "@gitspec/core/browser";
import { assemble, fieldControl, planForm, readBody, valuesFrom } from "./form.ts";
import { checkAsset, markdownFor, prepareAsset, referenced, type PendingAsset } from "./attach.ts";

/**
 * The editor. A static page that talks to GitHub with the reader's own token and to
 * nothing else — there is no GitSpec service in this path, which is what lets a private
 * repository use it (B-1).
 *
 * A document is two things here: a form over its frontmatter, generated from the schema
 * in `@gitspec/core`, and a body. Splitting them is what makes W-1 affordable — the form
 * writes one key at a time through a splice that leaves the rest of the block byte for
 * byte as the author left it, and the body is submitted whole because nothing here
 * reformats it yet.
 *
 * The body is still Markdown source with a live preview. A rich surface is the next
 * step, and it inherits W-1 rather than being allowed to renegotiate it: an editor that
 * rewrites files it did not need to touch produces exactly the churn that makes a
 * repository hostile to review and to agents.
 */

const TOKEN_KEY = "gitspec:token";

async function loadManifest(): Promise<SiteManifest> {
    // The editor page lives at <base>/_edit/, so the manifest is one level up.
    const response = await fetch("../_gitspec/manifest.json");
    if (!response.ok) throw new Error(`manifest unavailable (${response.status})`);
    return response.json();
}

function pasteScreen(onToken: (token: string) => void): void {
    $("app").innerHTML = `
<div class="panel">
  <h1>Sign in to edit</h1>
  <p class="note">
    GitSpec commits as you, so it needs a token that belongs to you. Paste a GitHub
    personal access token with <code>repo</code> access. It is kept in this browser's
    local storage and sent only to github.com — never to any GitSpec service.
  </p>
  <p class="note provisional">
    Pasting a token is temporary scaffolding. Sign-in will replace it, at which point
    this screen goes away and no token is ever handled by hand.
  </p>
  <input id="token" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false">
  <button id="save" class="primary">Continue</button>
</div>`;

    const input = $<HTMLInputElement>("token");
    const submit = () => {
        const value = input.value.trim();
        if (!value) return;
        localStorage.setItem(TOKEN_KEY, value);
        onToken(value);
    };
    $("save").addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key === "Enter") submit();
    });
    input.focus();
}

function editorScreen(args: {
    manifest: SiteManifest;
    document: SiteManifest["documents"][number];
    source: string;
    ref: string;
    pull?: PullRef;
    onSubmit: (contents: string, summary: string, attachments: PendingAsset[]) => Promise<void>;
}): void {
    const { manifest, document: doc, source, ref, pull } = args;

    const where = pull
        ? `continuing <a href="${escape(pull.url)}" target="_blank" rel="noopener">pull request #${pull.number}</a>`
        : `proposing against <code>${escape(ref)}</code>`;

    const plan = planForm(source, doc.kind);
    const schema = schemaFor(doc.kind);

    // W-7: no form is a state with a reason, not a failure. W-8: the body is editable
    // either way, so the document never becomes unreachable.
    const meta =
        plan.kind === "fields"
            ? `<details id="meta" class="meta" open>
  <summary>Fields <span id="issues" class="note"></span></summary>
  <div id="fields">${plan.fields.map(fieldControl).join("")}</div>
</details>`
            : `<p class="meta none note">No fields: ${escape(plan.reason)}. The text below is editable as it stands.</p>`;

    $("app").innerHTML = `
<header class="bar">
  <div>
    <strong>${escape(doc.title)}</strong>
    <span class="note"> &middot; ${escape(doc.path)}</span>
  </div>
  <div class="note">${where}</div>
</header>
<div class="split">
  <div class="pane">
    ${meta}
    <textarea id="source" spellcheck="false"></textarea>
  </div>
  <article id="preview" class="preview"></article>
</div>
<footer class="bar">
  <input id="summary" placeholder="What changed, and why (optional)">
  <button id="submit" class="primary">Propose change</button>
  <a class="note" href="${escape(withBase(manifest.base, doc.address))}">Cancel</a>
</footer>
<div id="result"></div>`;

    const textarea = $<HTMLTextAreaElement>("source");
    const preview = $("preview");
    textarea.value = readBody(source);

    const lookup = (path: string) => manifest.documents.find((d) => d.path === path)?.address;

    const pasted: PendingAsset[] = [];
    const blobUrls = new Map<string, string>();
    const resolveAsset = async (repoPath: string): Promise<string | undefined> =>
        blobUrls.get(repoPath) ?? manifest.assets?.[repoPath];

    let pending = 0;
    const refresh = async () => {
        const mine = ++pending;
        const html = await renderMarkdown(
            { kind: doc.kind, address: doc.address, id: doc.id, idDerived: false, path: doc.path, spaceKey: doc.spaceKey, frontmatter: {} },
            textarea.value,
            lookup,
            manifest.base,
            resolveAsset,
        );
        if (mine === pending) preview.innerHTML = html;
    };

    textarea.addEventListener("input", () => void refresh());
    void refresh();

    /** Put text where the cursor is, and leave the cursor after it. */
    const insert = (text: string) => {
        const { selectionStart: from, selectionEnd: to, value } = textarea;
        textarea.value = value.slice(0, from) + text + value.slice(to);
        textarea.selectionStart = textarea.selectionEnd = from + text.length;
        void refresh();
    };

    textarea.addEventListener("paste", (event) => {
        const files = [...((event as ClipboardEvent).clipboardData?.files ?? [])];
        // Pasting text is the normal case and must keep behaving exactly as it did.
        if (files.length === 0) return;
        event.preventDefault();

        void (async () => {
            for (const file of files) {
                const refusal = checkAsset(file.name || "pasted-image.png", file.size);
                if (refusal) {
                    report(escape(refusal), "bad");
                    continue;
                }
                const name = file.name || "pasted-image.png";
                const bytes = new Uint8Array(await file.arrayBuffer());
                const asset = await prepareAsset(doc.path, name, bytes);
                // The path carries the hash, so the same image pasted twice is the same
                // file and there is nothing to add a second time.
                if (!pasted.some((a) => a.repoPath === asset.repoPath)) {
                    pasted.push(asset);
                    blobUrls.set(asset.repoPath, URL.createObjectURL(new Blob([bytes as BlobPart])));
                }
                insert(markdownFor(asset, name));
            }
        })();
    });

    const readFields = (): Record<string, string> =>
        Object.fromEntries(schema.map((f: Field) => [f.key, $<HTMLInputElement>(`f-${f.key}`)?.value ?? ""]));

    // W-6: every problem at once. Fixing one field must not reveal the next.
    const revalidate = () => {
        if (plan.kind !== "fields") return;
        const issues = validateFrontmatter(schema, valuesFrom(schema, readFields()));
        for (const field of schema) {
            const box = document.querySelector(`.field[data-key="${field.key}"] .issue`);
            const mine = issues.find((i) => i.key === field.key);
            // W-5: the rule, not just the complaint, so it can be looked up.
            if (box) box.textContent = mine ? `${mine.rule}: ${mine.message.replace(/`/g, "")}` : "";
        }
        const unknown = issues.filter((i) => !schema.some((f) => f.key === i.key));
        $("issues").textContent = issues.length === 0 ? "" : `${issues.length} to fix${unknown.length ? ` (${unknown.map((i) => i.key).join(", ")} not in the format)` : ""}`;
    };

    if (plan.kind === "fields") {
        $("fields").addEventListener("input", revalidate);
        $("fields").addEventListener("change", revalidate);
        revalidate();
    }

    $("submit").addEventListener("click", async () => {
        const button = $<HTMLButtonElement>("submit");
        const values = plan.kind === "fields" ? valuesFrom(schema, readFields()) : {};
        const next = assemble(source, values, textarea.value);

        // W-2. The same check exists behind submitEdit, but only after two round trips to
        // GitHub; saying so here costs nothing and explains itself better.
        if (next === source) {
            report("Nothing changed, so there is nothing to propose.", "bad");
            return;
        }

        button.disabled = true;
        button.textContent = "Proposing…";
        try {
            await args.onSubmit(next, $<HTMLInputElement>("summary").value, referenced(pasted, textarea.value));
        } finally {
            button.disabled = false;
            button.textContent = "Propose change";
        }
    });
}

function report(html: string, kind: "ok" | "bad"): void {
    $("result").innerHTML = `<div class="result ${kind}">${html}</div>`;
}

function signInScreen(auth: { clientId: string; broker: string }, docId: string): void {
    $("app").innerHTML = `
<div class="panel">
  <h1>Sign in to edit</h1>
  <p class="note">
    GitSpec commits as you, so an edit carries your name and goes through review like
    any other change. It can only reach repositories this app is installed on, and only
    where you already have access.
  </p>
  <button id="signin" class="primary">Sign in with GitHub</button>
</div>`;
    $("signin").addEventListener("click", () => beginSignIn(auth, `?doc=${encodeURIComponent(docId)}`));
}

async function main(): Promise<void> {
    const manifest = await loadManifest();

    // A redirect back from GitHub carries the code in the address bar, and completing it
    // restores the query the editor was on. Read `doc` only after that has happened.
    if (manifest.auth) {
        try {
            await completeSignIn(manifest.auth);
        } catch (error) {
            panel("Sign-in did not complete", String(error), true);
            return;
        }
    }

    const id = new URLSearchParams(location.search).get("doc");
    const doc = manifest.documents.find((d) => d.id === id);

    if (!doc) {
        panel("Nothing to edit", `No document with id "${id ?? ""}" is part of this site.`);
        return;
    }
    if (!manifest.repository) {
        panel(
            "Editing is not configured",
            "This site was built without repository details, so an edit has nowhere to go. Set `repository` in gitspec.yaml, or pass it to the action.",
        );
        return;
    }

    const start = async (token: string) => {
        const repository = manifest.repository!;
        const repo = restRepo({ owner: repository.owner, repo: repository.name, token });

        let loaded;
        try {
            loaded = await loadForEdit(repo, { documentId: doc.id, path: doc.path, base: repository.branch });
        } catch (error) {
            // A rejected token is the overwhelmingly likely cause, and leaving it in
            // storage would lock the editor into a loop it cannot explain.
            if (manifest.auth) signOut();
            else localStorage.removeItem(TOKEN_KEY);
            panel("Could not open the document", String(error), true);
            return;
        }

        editorScreen({
            manifest,
            document: doc,
            source: loaded.contents,
            ref: loaded.ref,
            pull: loaded.pull,
            onSubmit: async (contents, summary, attachments) => {
                try {
                    const result = await submitEdit(repo, {
                        documentId: doc.id,
                        path: doc.path,
                        contents,
                        base: repository.branch,
                        title: doc.title,
                        summary,
                        // I-3: the image and the paragraph referring to it ride one branch.
                        attachments: attachments.map((a) => ({ path: a.repoPath, contents: a.bytes })),
                    });
                    report(
                        `${result.created ? "Opened" : "Added to"} <a href="${escape(result.pull.url)}" target="_blank" rel="noopener">pull request #${result.pull.number}</a>. ` +
                            `It becomes part of the document when it is merged.`,
                        "ok",
                    );
                } catch (error) {
                    const message = error instanceof SubmitError ? error.message : String(error);
                    report(escape(message), "bad");
                }
            },
        });
    };

    if (manifest.auth) {
        const token = await currentToken(manifest.auth);
        if (token) await start(token);
        else signInScreen(manifest.auth, doc.id);
        return;
    }

    // No app configured: local development, where the paste screen is the only way in.
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing) await start(existing);
    else pasteScreen((token) => void start(token));
}

void main().catch((error) => {
    panel("Editor failed to start", String(error));
});
