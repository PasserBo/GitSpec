---
kind: spec
id: assets
title: Assets
status: active
owner: "@PasserBo"
governs:
  - packages/render/src/assets.ts
  - apps/web/src/attach.ts
verified_against: null
---

# Assets

## Intent

Until now a document could say `![](./shot.png)` and GitSpec would serve a broken image.
The renderer rewrote the URL as faithfully as it rewrote everything else, and nothing
ever copied the file, so the page looked right in the repository and 404'd on the site.
That is the worst shape a defect can take: invisible to the person who caused it.

Pasting a screenshot is also the first thing a designer reaches for, which makes this
less a missing feature than a missing half of the one the editor already offers.

The design question is what counts as an asset. A configured directory means every
adopter has something to configure before an image works, and it invites copying files
nobody reads. Globbing a whole tree is worse: it drags in whatever happens to sit beside
the documents. So an asset is here for exactly one reason — a document points at it. That
needs no configuration, cannot copy what nothing uses, and keeps an images directory from
tripping D-6, which refuses a space that matches no documents.

Reference-based discovery has one sharp edge, and it is the reason for the allow-list
below: the specs in this repository link to source files constantly, and a rule of "copy
whatever the reference resolves to" would publish `packages/core/src/schema.ts` as part
of the site. What may be copied is therefore a fixed list of kinds, and a reference to
anything else is left exactly as written.

Built URLs carry a hash of the file's own bytes. That is not about caching alone: it
makes the path a function of the content, so two documents pointing at one image produce
one file, and the same screenshot pasted twice is the same commit rather than two.

## Behaviour

### Discovery

- **I-1** — An asset is copied because a document refers to it. Nothing is matched by
  glob or by directory, so a file nothing points at is never published.
- **I-2** — Only a fixed list of file kinds may become an asset. A reference to anything
  else — a source file, another document — is left exactly as the author wrote it.
- **I-3** — A reference that resolves to no file in the repository is reported by the
  build, naming the document and the reference. It is never silently dropped and never
  rewritten to a guess.

### Addressing

- **I-4** — An asset's built URL contains a hash of its contents, so a changed image is
  never served from a cache holding the old one.
- **I-5** — Two documents referring to one file produce one file in the built site.
- **I-6** — An asset is served from under the deployment prefix, like every other URL the
  renderer emits. R-5 admits no exception for it.

### Editing

- **I-7** — A file pasted into a document is committed to the branch and pull request of
  the document that refers to it. An image and the paragraph about it are merged together
  or not at all.
- **I-8** — A pasted file is written to the branch before the document that refers to it,
  so the branch never holds a reference to a file that is not there.
- **I-9** — A file larger than 1 MB is refused when it is pasted, and the limit is named.
- **I-10** — A file pasted and then removed from the document before it was proposed is
  not committed.

## Open questions

**1 MB is GitHub's limit, not a considered one.** Past it the Contents API returns no
content, so a larger file is one GitSpec could write and never read back (R-6). That
makes the ceiling honest rather than arbitrary, but it is well below what a designer's
screenshot tool produces on a retina display, and the answer — resizing in the browser
before upload — changes the bytes the author chose. Nothing does it yet.

**Nothing ever deletes an asset.** Content-addressed paths mean an edited image leaves
the old file in the repository forever, referenced by nothing. Git keeps it in history
regardless, so deleting it reclaims nothing that matters, but the working tree
accumulates. No rule says who cleans it up.

**An asset has no identity of its own.** A document has an id that survives being moved
(A-2); an asset is addressed by path, so moving a document breaks every relative
reference in it. This was acceptable while assets did not exist. It is now a real gap,
and the obvious fix — giving assets ids too — costs more than the problem is currently
worth.

**Pasting is the only way in.** There is no browsing an existing image, no reuse of one
already in the repository, and no way to see what a document already refers to. The
manifest now carries the map that would make all three cheap.
