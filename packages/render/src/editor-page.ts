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
