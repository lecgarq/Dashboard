// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { downloadCsv } from "./csvExport";

/**
 * Vitest coverage of csvExport.downloadCsv.
 *
 * Strategy: monkey-patch URL.createObjectURL to capture the Blob payload, read it
 * back as text, then assert the CSV body. Click is stubbed so jsdom does not navigate.
 */

async function blobToText(blob: Blob): Promise<string> {
  // Read as ArrayBuffer + decode manually so the BOM byte is preserved.
  // (Both Blob.text() and FileReader.readAsText strip the leading UTF-8 BOM.)
  const buf = await blob.arrayBuffer();
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
}

describe("downloadCsv", () => {
  let capturedBlob: Blob | null;
  let createSpy: ReturnType<typeof vi.fn>;
  let revokeSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedBlob = null;
    createSpy = vi.fn((b: Blob) => {
      capturedBlob = b;
      return "blob:mock-url";
    });
    revokeSpy = vi.fn();
    // jsdom URL doesn't implement createObjectURL by default
    (URL as unknown as { createObjectURL: typeof createSpy }).createObjectURL = createSpy;
    (URL as unknown as { revokeObjectURL: typeof revokeSpy }).revokeObjectURL = revokeSpy;
    clickSpy = vi.fn();
    // Stub HTMLAnchorElement.click so it does not navigate the jsdom window
    HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void;
  });

  it("prepends UTF-8 BOM so Excel auto-detects encoding", async () => {
    downloadCsv("out.csv", [{ name: "alice", role: "admin" }]);
    expect(createSpy).toHaveBeenCalledOnce();
    expect(capturedBlob).not.toBeNull();
    const text = await blobToText(capturedBlob!);
    expect(text.charCodeAt(0)).toBe(0xfeff);
  });

  it("RFC4180-escapes commas, quotes, newlines (no raw unescaped quote inside a field)", async () => {
    downloadCsv("out.csv", [
      {
        // value contains a comma, a literal apostrophe, an embedded double-quote, and a newline
        title: 'O\'Brien, "VP" of\nEngineering',
      },
    ]);
    const text = (await blobToText(capturedBlob!)).slice(1); // strip BOM

    // Header
    const lines = text.split("\n");
    expect(lines[0]).toBe("title");

    // Field MUST be wrapped in quotes (because it contains comma/quote/newline) and
    // the embedded " must be doubled to "" per RFC4180.
    // Joined remainder represents one logical row that spans physical lines due to embedded \n.
    const remainder = lines.slice(1).join("\n").replace(/\n$/, "");
    expect(remainder.startsWith('"')).toBe(true);
    expect(remainder.endsWith('"')).toBe(true);
    // The escaped doubled-quote sequence is present
    expect(remainder).toContain('""VP""');
    // The embedded comma is preserved inside the quoted field
    expect(remainder).toContain("O'Brien,");
    // The embedded newline is preserved inside the quoted field
    expect(remainder).toContain("of\nEngineering");
  });

  it("preserves unicode (Japanese) round-trip via UTF-8 BOM", async () => {
    downloadCsv("out.csv", [{ label: "日本語" }]);
    const text = (await blobToText(capturedBlob!)).slice(1); // strip BOM
    expect(text).toContain("日本語");
  });

  it("empty rows array produces just the BOM (no crash)", async () => {
    downloadCsv("out.csv", []);
    expect(createSpy).toHaveBeenCalledOnce();
    expect(capturedBlob).not.toBeNull();
    const text = await blobToText(capturedBlob!);
    // Body after BOM is empty (or possibly a trailing newline) but no thrown error.
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.length).toBeLessThanOrEqual(2);
  });

  it("triggers anchor click and revokes the object URL", async () => {
    downloadCsv("out.csv", [{ a: 1 }]);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
  });
});
