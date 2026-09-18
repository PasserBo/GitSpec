/**
 * What a browser may import from core.
 *
 * The barrel next to this one reaches `discover.ts` and `navigation.ts`, which read the
 * filesystem. A bundler targeting the browser does not refuse those — it stubs them and
 * builds successfully — so the only thing standing between a build-time module and the
 * editor is tree shaking, and tree shaking stops at a module-level side effect. One such
 * line shipped a bundle that threw before it rendered anything.
 *
 * So the browser gets its own door, and what is behind it is checked by a test rather
 * than by whoever last added an export.
 */

export { addressFor, defaultHomeFor, normalizeSpacePath } from "./address.ts";
export { deriveId, documentFrom, parseFrontmatter } from "./document.ts";
export type { Document, DocumentKind } from "./document.ts";
export {
    FRONTMATTER_FENCE,
    locateFrontmatter,
    readBody,
    replaceBody,
    spliceFrontmatter,
} from "./frontmatter.ts";
export type { FrontmatterBlock, FrontmatterValue, Located } from "./frontmatter.ts";
export { PAGE_SCHEMA, SPEC_SCHEMA, schemaFor, validateFrontmatter } from "./schema.ts";
export type { Field, FieldType, Issue } from "./schema.ts";
