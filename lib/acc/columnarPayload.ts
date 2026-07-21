/**
 * columnar.ts — Phase-37 raw typed-array columnar payload codec (SCALE-01 track b).
 *
 * Layout (all little-endian):
 *   [u32 headerByteLength][UTF-8 JSON header][zero-padding to 4-byte alignment][column buffers]
 * Header: { count, columns: [{ name, dtype, byteOffset, byteLength }] } with
 * byteOffset relative to the start of the whole buffer.
 *
 * Zero dependencies by owner decision (37-CONTEXT decision 4 — Apache Arrow
 * rejected unless raw buffers prove painful). Decode returns zero-copy views.
 */

export type ColumnDtype = "f32" | "u8" | "u16" | "u32";
export type ColumnArray = Float32Array | Uint8Array | Uint16Array | Uint32Array;

interface ColumnMeta {
  name: string;
  dtype: ColumnDtype;
  byteOffset: number;
  byteLength: number;
}

interface PayloadHeader {
  count: number;
  columns: ColumnMeta[];
}

function dtypeOf(a: ColumnArray): ColumnDtype {
  if (a instanceof Float32Array) return "f32";
  if (a instanceof Uint8Array) return "u8";
  if (a instanceof Uint16Array) return "u16";
  return "u32";
}

const CTORS = {
  f32: Float32Array,
  u8: Uint8Array,
  u16: Uint16Array,
  u32: Uint32Array,
} as const;

const align4 = (n: number): number => (n + 3) & ~3;

/** Encode named columns into one ArrayBuffer. `count` = logical row count. */
export function encodeColumnarPayload(
  count: number,
  columns: Record<string, ColumnArray>,
): ArrayBuffer {
  const names = Object.keys(columns);
  // Two-pass: sizes depend on the header, whose offsets depend on sizes — the
  // header length is stable once offsets are computed against a fixed-width
  // estimate, so compute with placeholder offsets then patch.
  const metas: ColumnMeta[] = names.map((name) => ({
    name,
    dtype: dtypeOf(columns[name]),
    byteOffset: 0,
    byteLength: columns[name].byteLength,
  }));
  // Iterate until the header size stabilizes (offset digit growth can bump it).
  let headerBytes = 0;
  for (let pass = 0; pass < 4; pass++) {
    let offset = align4(4 + headerBytes);
    for (const m of metas) {
      m.byteOffset = offset;
      offset = align4(offset + m.byteLength);
    }
    const encoded = new TextEncoder().encode(
      JSON.stringify({ count, columns: metas } satisfies PayloadHeader),
    );
    if (encoded.byteLength === headerBytes) break;
    headerBytes = encoded.byteLength;
  }
  const headerJson = new TextEncoder().encode(
    JSON.stringify({ count, columns: metas } satisfies PayloadHeader),
  );
  const last = metas[metas.length - 1];
  const total = last ? align4(last.byteOffset + last.byteLength) : align4(4 + headerBytes);
  const buf = new ArrayBuffer(total);
  new DataView(buf).setUint32(0, headerJson.byteLength, true);
  new Uint8Array(buf, 4, headerJson.byteLength).set(headerJson);
  for (const m of metas) {
    new Uint8Array(buf, m.byteOffset, m.byteLength).set(
      new Uint8Array(columns[m.name].buffer, columns[m.name].byteOffset, m.byteLength),
    );
  }
  return buf;
}

export interface DecodedPayload {
  count: number;
  columns: Record<string, ColumnArray>;
}

/** Decode into zero-copy typed-array views over the input buffer. Throws on truncation. */
export function decodeColumnarPayload(buf: ArrayBuffer): DecodedPayload {
  if (buf.byteLength < 4) throw new Error("columnar: buffer too small for header length");
  const headerLen = new DataView(buf).getUint32(0, true);
  if (4 + headerLen > buf.byteLength) throw new Error("columnar: truncated header");
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)),
  ) as PayloadHeader;
  const columns: Record<string, ColumnArray> = {};
  for (const m of header.columns) {
    if (m.byteOffset + m.byteLength > buf.byteLength) {
      throw new Error(`columnar: truncated column "${m.name}"`);
    }
    const Ctor = CTORS[m.dtype];
    columns[m.name] = new Ctor(buf, m.byteOffset, m.byteLength / Ctor.BYTES_PER_ELEMENT);
  }
  return { count: header.count, columns };
}
