/**
 * fileExtension.ts — the file FORMAT an activity row touched.
 *
 * The payload's object type says "a File was acted on"; it never says whether
 * that file was a drawing, a model or a photo. The format is only recoverable
 * from `AccActivityAccds.objectName` (the display filename, 100% populated on
 * File rows — measured 2026-07-24), so it is derived once at payload-build time
 * into its own dict column rather than looked up per hover.
 *
 * Rows whose object is not a file at all (folders, issues, users, and the whole
 * DC-sourced slice that has no object) resolve to null — the caller maps that to
 * the dict's slot-0 sentinel, so "not a file" never masquerades as a format.
 *
 * Pure — no React/DOM/IO.
 */

/** Dict slot 0: the row's object is not a file, or carried no name. */
export const NOT_A_FILE = "Not a file";

/**
 * A trailing dotted segment of ≤6 chars that contains AT LEAST ONE LETTER.
 *
 * Both guards are load-bearing, learned from a real build: ACC filenames carry
 * dotted revision and date codes ("PLANO-A.01.2024", "MEMORIA.REV.3"), so a
 * length bound alone still minted 233 numeric "formats" ("3", "15", "2024") out
 * of 624 categories. Requiring a letter kills all of them while keeping the
 * digit-leading CAD formats that matter (3ds, 3dm, 7z).
 */
const EXT_RE = /\.(?=[A-Za-z0-9]{1,6}$)([A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*)$/;

/**
 * Extension of a filename, lowercased and without the dot, or null when the name
 * has none (extension-less uploads are real and stay honestly uncategorised).
 */
export function fileExtensionOf(objectName: string | null | undefined): string | null {
  if (!objectName) return null;
  const m = EXT_RE.exec(objectName.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Display label for a format. Uppercased because these are format names, not
 * words ("PDF", "DWG", "RVT") — and it keeps the legend readable next to the
 * Title Case object types.
 */
export function fileExtensionLabel(ext: string): string {
  return ext.toUpperCase();
}
