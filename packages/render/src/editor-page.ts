import { SITE_STYLE } from "./layout.ts";

const APP_STYLE = `
body { margin:0; height:100vh; display:flex; flex-direction:column; }
/* The app mounts inside a wrapper, so the wrapper has to carry the height down to it:
   without this the panes below never flex and the body of a document gets whatever
   height its own content asks for. */
#app { flex:1; display:flex; flex-direction:column; min-height:0; }
.bar { display:flex; gap:12px; align-items:center; padding:10px 16px; border-bottom:1px solid var(--rule); flex:none; }
footer.bar { border-bottom:0; border-top:1px solid var(--rule); }
.bar > div:first-child { flex:1; min-width:0; }
.split { flex:1; display:grid; grid-template-columns:1fr 1fr; min-height:0; }
.pane { display:flex; flex-direction:column; min-height:0; border-right:1px solid var(--rule); }
.pane > textarea { flex:1; min-height:0; }
textarea {
  border:0; resize:none; padding:20px 22px;
  font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;
  background:var(--bg); color:var(--fg); outline:none; tab-size:2;
}
.preview { overflow:auto; padding:20px 26px; }
.preview :first-child { margin-top:0; }
input { flex:1; padding:7px 11px; border:1px solid var(--rule); border-radius:6px; background:var(--bg); color:var(--fg); font:inherit; font-size:14px; }
button, .button { padding:7px 15px; border-radius:6px; border:1px solid var(--rule); background:var(--bg); color:var(--fg); font:inherit; font-size:14px; cursor:pointer; text-decoration:none; display:inline-block; }
button.primary, .button.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
button:disabled { opacity:.55; cursor:default; }
.panel { max-width:56ch; margin:12vh auto; padding:0 24px; }
.panel.wide { max-width:76ch; margin-top:7vh; }
.panel h1 { font-size:20px; margin-top:0; }
.panel input { width:100%; margin:8px 0 12px; }
.panel details { margin:10px 0; border:1px solid var(--rule); border-radius:8px; }
.panel summary { padding:8px 12px; cursor:pointer; }
.panel details pre { margin:0; border-top:1px solid var(--rule); border-radius:0 0 8px 8px; max-height:40vh; }
.repos { list-style:none; padding:0; margin:16px 0; }
.repos li + li { margin-top:6px; }
.repos button { width:100%; text-align:left; display:flex; flex-direction:column; gap:2px; padding:10px 14px; }
.repos button:not([disabled]):hover { border-color:var(--accent); }
.repos li.disabled button { opacity:.5; cursor:default; }
.note { color:var(--muted); font-size:13px; }
.provisional { border-left:3px solid var(--rule); padding-left:12px; }
.result { padding:12px 16px; border-top:1px solid var(--rule); font-size:14px; flex:none; margin-top:14px; }
.result.ok { background:color-mix(in srgb, var(--accent) 10%, transparent); }
.result.bad { background:color-mix(in srgb, #d33 12%, transparent); }


/* ---------------------------------------------------------------- the surfaces */

.modes { display:flex; border:1px solid var(--rule); border-radius:7px; overflow:hidden; flex:none; }
.mode { border:0; border-radius:0; padding:5px 13px; font-size:13px; background:transparent; color:var(--muted); }
.mode + .mode { border-left:1px solid var(--rule); }
.mode.on { background:var(--accent); color:#fff; font-weight:600; }

.body { flex:1; min-height:0; display:flex; flex-direction:column; position:relative; overflow:auto; }
.body > textarea { flex:1; min-height:0; }

/* Rich editing gets the whole width: a preview of what you are already looking at is
   noise, and a document editor that shows a document reads better wide. */
.split[data-mode="rich"] { grid-template-columns:1fr; }
.split[data-mode="rich"] .preview { display:none; }
.split[data-mode="rich"] .pane { border-right:0; }

/* ------------------------------------------------------- ProseMirror essentials */

.ProseMirror {
  position:relative; word-wrap:break-word; white-space:pre-wrap; white-space:break-spaces;
  font-variant-ligatures:none; outline:none;
}
.ProseMirror pre { white-space:pre-wrap; }
.ProseMirror li { position:relative; }
.ProseMirror [contenteditable="false"] { white-space:normal; }
.ProseMirror-hideselection *::selection { background:transparent; }
.ProseMirror-hideselection { caret-color:transparent; }
.ProseMirror-selectednode { outline:2px solid var(--accent); border-radius:4px; }
li.ProseMirror-selectednode { outline:none; }
.ProseMirror-gapcursor { display:none; pointer-events:none; position:absolute; }
.ProseMirror-gapcursor:after {
  content:""; display:block; position:absolute; top:-2px; width:22px;
  border-top:1px solid var(--fg); animation:pm-blink 1.1s steps(2, start) infinite;
}
.ProseMirror-focused .ProseMirror-gapcursor { display:block; }
@keyframes pm-blink { to { visibility:hidden; } }

/* ------------------------------------------------------------- document typography */

.rich {
  flex:1; min-height:0; padding:34px 28px 45vh 58px; max-width:84ch; width:100%;
  margin:0 auto; font-size:15.5px; line-height:1.72; box-sizing:border-box;
}
.rich > * { margin:0 0 14px; }
.rich > :first-child { margin-top:0; }
.rich h1 { font-size:27px; line-height:1.25; margin:26px 0 12px; font-weight:650; letter-spacing:-.01em; }
.rich h2 { font-size:20px; line-height:1.3; margin:28px 0 10px; font-weight:650; }
.rich h3 { font-size:16.5px; margin:22px 0 8px; font-weight:650; }
.rich h4, .rich h5, .rich h6 { font-size:15px; margin:18px 0 6px; font-weight:650; }
.rich ul, .rich ol { padding-left:26px; }
.rich li > p { margin:0 0 4px; }
.rich li + li { margin-top:3px; }
.rich blockquote {
  margin-left:0; padding:2px 0 2px 16px; border-left:3px solid var(--accent);
  color:var(--muted);
}
.rich pre {
  background:color-mix(in srgb, var(--fg) 7%, transparent); padding:13px 15px;
  border-radius:8px; font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;
  overflow-x:auto;
}
.rich code { font:.88em/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
.rich :not(pre) > code {
  background:color-mix(in srgb, var(--fg) 9%, transparent); padding:.1em .34em;
  border-radius:4px;
}
.rich hr { border:0; border-top:1px solid var(--rule); margin:26px 0; }
.rich img { max-width:100%; border-radius:6px; display:block; }
.rich a { color:var(--accent); }
.rich table { border-collapse:collapse; width:100%; font-size:14px; }
.rich th, .rich td { border:1px solid var(--rule); padding:7px 10px; text-align:left; vertical-align:top; }
.rich th { background:color-mix(in srgb, var(--fg) 5%, transparent); font-weight:600; }
.rich .selectedCell { background:color-mix(in srgb, var(--accent) 16%, transparent); }

/* The placeholder only appears on the empty block the cursor is in, so a long document
   is not littered with hints. */
.rich .is-empty::before {
  content:attr(data-placeholder); color:var(--muted); opacity:.65;
  position:absolute; pointer-events:none; height:0;
}

/* Something Markdown can hold and this editor will not pretend to understand. Shown as
   it was written, and written back the same way (W-11). */
.rich .verbatim {
  border:1px solid var(--rule); border-radius:8px; overflow:hidden;
  background:color-mix(in srgb, var(--fg) 4%, transparent);
}
.rich .verbatim-label {
  font:11px/1 ui-monospace,Menlo,monospace; text-transform:uppercase; letter-spacing:.06em;
  color:var(--muted); padding:7px 12px; border-bottom:1px solid var(--rule);
}
.rich .verbatim pre { background:transparent; margin:0; padding:11px 13px; font-size:12.5px; }

/* ------------------------------------------------------------------ slash menu */

.slash {
  position:absolute; z-index:40; width:268px; max-height:290px; overflow:auto;
  background:var(--bg); border:1px solid var(--rule); border-radius:10px; padding:5px;
  box-shadow:0 10px 34px rgba(0,0,0,.34);
}
.slash-item {
  display:flex; flex-direction:column; gap:1px; width:100%; text-align:left;
  border:0; border-radius:6px; padding:7px 10px; background:transparent; cursor:pointer;
}
.slash-item:hover, .slash-item.active { background:color-mix(in srgb, var(--accent) 17%, transparent); }
.slash-label { font-size:13.5px; font-weight:600; }
.slash-hint { font-size:11.5px; color:var(--muted); }

/* --------------------------------------------------------------- selection toolbar */

.bubble {
  position:absolute; z-index:40; display:flex; gap:2px; padding:4px;
  background:var(--bg); border:1px solid var(--rule); border-radius:9px;
  box-shadow:0 7px 24px rgba(0,0,0,.3);
}
.bubble-button {
  border:0; border-radius:6px; padding:5px 10px; font-size:13px; min-width:30px;
  background:transparent; color:var(--fg);
}
.bubble-button:hover { background:color-mix(in srgb, var(--fg) 11%, transparent); }
.bubble-button.active { background:var(--accent); color:#fff; }
.bubble-button:nth-child(1) { font-weight:700; }
.bubble-button:nth-child(2) { font-style:italic; }
.bubble-button:nth-child(3) { text-decoration:line-through; }
.bubble-button:nth-child(4) { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; }

/* ---------------------------------------------------------------- block handles */

.handle {
  position:absolute; z-index:30; display:flex; gap:1px;
  opacity:0; transition:opacity .12s;
}
.body:hover .handle { opacity:1; }
.handle-button {
  border:0; border-radius:5px; padding:1px 4px; font-size:14px; line-height:1.5;
  background:transparent; color:var(--muted); cursor:pointer;
}
.handle-button:hover { background:color-mix(in srgb, var(--fg) 12%, transparent); color:var(--fg); }

.block-menu {
  position:absolute; z-index:45; width:188px; max-height:min(430px, 60vh); overflow:auto;
  background:var(--bg); border:1px solid var(--rule); border-radius:10px; padding:5px;
  box-shadow:0 10px 34px rgba(0,0,0,.34);
}
.block-menu-head {
  font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted);
  padding:7px 9px 4px;
}
.block-menu-item {
  display:block; width:100%; text-align:left; border:0; border-radius:6px;
  padding:6px 9px; font-size:13px; background:transparent; color:var(--fg); cursor:pointer;
}
.block-menu-item:hover { background:color-mix(in srgb, var(--accent) 17%, transparent); }

@media (max-width:860px) { .rich { padding:22px 16px 40vh 40px; } }

/* The generated frontmatter form. Compact by construction: nine fields above a body is
   already a lot of screen, and the body is what most edits are about. */
/* The body is what most edits are about, so the fields never take more than a third
   of the height; nine of them scroll rather than pushing the text off screen. */
.meta { flex:none; border-bottom:1px solid var(--rule); max-height:32vh; overflow:auto; }
.meta > summary { padding:9px 16px; cursor:pointer; font-size:13px; font-weight:600; }
.meta > summary #issues { font-weight:400; margin-left:6px; }
p.meta.none { margin:0; padding:10px 16px; border-bottom:1px solid var(--rule); font-size:13px; }
#fields { display:grid; grid-template-columns:1fr 1fr; gap:11px 14px; padding:2px 16px 14px; }
.field { display:flex; flex-direction:column; gap:3px; min-width:0; }
.field.wide { grid-column:1 / -1; }
.field label { font-size:12px; font-weight:600; }
.field .rule { font-weight:400; color:var(--muted); font-size:11px; }
.field .help { display:block; font-size:11px; color:var(--muted); line-height:1.45; }
.field input, .field select, .field textarea {
  flex:none; width:100%; padding:5px 8px; margin:0; border:1px solid var(--rule);
  border-radius:5px; background:var(--bg); color:var(--fg); font:inherit; font-size:13px;
}
.field textarea { font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; resize:vertical; }
.field .issue { margin:0; font-size:11px; color:#d33; }
.field .issue:empty { display:none; }

@media (max-width:860px) {
  .split { grid-template-columns:1fr; grid-template-rows:1fr 1fr; }
  .pane { border-right:0; border-bottom:1px solid var(--rule); }
  #fields { grid-template-columns:1fr; }
}
`;

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * The shell a browser app mounts into. Everything it needs beyond this arrives at runtime
 * — the manifest as a file, the document text from the repository — so one page serves
 * every document, and the same shell serves setup.
 */
export function appPage(args: { title: string; bundlePath: string }): string {
    return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(args.title)}</title>
<style>${SITE_STYLE}${APP_STYLE}</style>
<div id="app"><div class="panel"><p class="note">Loading…</p></div></div>
<script type="module" src="${escapeHtml(args.bundlePath)}"></script>
`;
}

export function editorPage(args: { siteTitle: string; bundlePath: string }): string {
    return appPage({ title: `Edit · ${args.siteTitle}`, bundlePath: args.bundlePath });
}
