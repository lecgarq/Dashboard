import { describe, expect, it } from "vitest";
import { decodeColumnarPayload, encodeColumnarPayload } from "./columnar";

describe("columnar payload codec (Phase 37 SCALE-01 track b)", () => {
  it("roundtrips mixed-dtype columns with odd lengths byte-identically", () => {
    const positions = new Float32Array([1.5, -2.25, 3.125, 0.0625, -350]);
    const verbId = new Uint8Array([0, 56, 13, 7, 1, 2, 3]); // odd length → padding
    const projectId = new Uint16Array([0, 955, 500]);
    const buf = encodeColumnarPayload(5, { positions, verbId, projectId });

    const decoded = decodeColumnarPayload(buf);
    expect(decoded.count).toBe(5);
    expect(Array.from(decoded.columns.positions as Float32Array)).toEqual(
      Array.from(positions),
    );
    expect(Array.from(decoded.columns.verbId as Uint8Array)).toEqual(Array.from(verbId));
    expect(Array.from(decoded.columns.projectId as Uint16Array)).toEqual(
      Array.from(projectId),
    );
    expect(decoded.columns.positions).toBeInstanceOf(Float32Array);
    expect(decoded.columns.verbId).toBeInstanceOf(Uint8Array);
    expect(decoded.columns.projectId).toBeInstanceOf(Uint16Array);
  });

  it("decode is zero-copy (views share the input buffer)", () => {
    const buf = encodeColumnarPayload(2, { a: new Float32Array([1, 2]) });
    const decoded = decodeColumnarPayload(buf);
    expect((decoded.columns.a as Float32Array).buffer).toBe(buf);
  });

  it("throws on truncated buffers instead of silently partial-decoding", () => {
    const buf = encodeColumnarPayload(3, {
      a: new Float32Array([1, 2, 3]),
      b: new Uint16Array([4, 5, 6]),
    });
    expect(() => decodeColumnarPayload(buf.slice(0, 2))).toThrow(/too small/);
    expect(() => decodeColumnarPayload(buf.slice(0, 8))).toThrow(/truncated/);
    expect(() => decodeColumnarPayload(buf.slice(0, buf.byteLength - 4))).toThrow(
      /truncated column/,
    );
  });
});
