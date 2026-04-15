const CHUNK_LOAD_PATTERNS = [
  /chunkloaderror/i,
  /loading (?:css )?chunk [^\s]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /failed to load script/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const text = `${error.name} ${error.message}`;
  return CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(text));
}
