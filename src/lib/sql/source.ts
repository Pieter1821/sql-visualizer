export type SqlSource = {
  kind: "empty" | "typed" | "file" | "paste";
  label: string;
  bytes?: number;
  edited?: boolean;
  encoding?: string;
};

export const MAX_SQL_BYTES = 2 * 1024 * 1024;

const EXT = [".sql", ".txt", ".pgsql", ".mysql", ".tsql", ".ddl", ".view", ".prc"];

export function isSqlFilename(name: string) {
  const lower = name.toLowerCase();
  return EXT.some((ext) => lower.endsWith(ext));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function sourceStatus(source: SqlSource) {
  if (source.kind === "empty") return "This tab only";
  const edited = source.edited ? " · edited" : "";
  if (source.kind === "file") return `${source.label}${edited}`;
  if (source.kind === "paste") return `Pasted${edited}`;
  return "Editor";
}

/**
 * SSMS and Azure Data Studio commonly write UTF-16 LE with a BOM, so decoding
 * everything as UTF-8 turns a whole script into replacement characters.
 */
export function decodeSqlBytes(bytes: Uint8Array): {
  text: string;
  encoding: string;
} {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      encoding: "UTF-16 LE",
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      encoding: "UTF-16 BE",
    };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      encoding: "UTF-8",
    };
  }

  // No BOM: UTF-16 still shows as NUL bytes in one parity of the stream.
  const probe = Math.min(bytes.length, 4096);
  let evenNuls = 0;
  let oddNuls = 0;
  for (let i = 0; i < probe; i += 1) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 0) evenNuls += 1;
    else oddNuls += 1;
  }
  const threshold = probe / 8;
  if (oddNuls > threshold && evenNuls <= oddNuls / 4) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes),
      encoding: "UTF-16 LE",
    };
  }
  if (evenNuls > threshold && oddNuls <= evenNuls / 4) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes),
      encoding: "UTF-16 BE",
    };
  }

  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad > 0 && bad > utf8.length / 100) {
    // Legacy single-byte export — Windows-1252 keeps the ASCII core readable.
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "Windows-1252",
    };
  }
  return { text: utf8, encoding: "UTF-8" };
}

function looksBinary(text: string) {
  const probe = text.slice(0, 4096);
  if (!probe.length) return false;
  let control = 0;
  for (const ch of probe) {
    const code = ch.codePointAt(0) ?? 0;
    const printable = code === 9 || code === 10 || code === 13 || code >= 32;
    if (!printable || ch === "\uFFFD" || code === 0) control += 1;
  }
  return control > probe.length / 20;
}

export async function readLocalSqlFile(file: File) {
  if (file.size > MAX_SQL_BYTES) {
    throw new Error(`Keep it under 2 MB. This file is ${formatBytes(file.size)}.`);
  }

  const named = isSqlFilename(file.name);
  const typed =
    !file.type ||
    file.type.startsWith("text/") ||
    file.type === "application/sql" ||
    file.type === "application/octet-stream";

  if (!named && !typed) {
    throw new Error("Use a .sql or .txt file.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { text, encoding } = decodeSqlBytes(bytes);

  if (looksBinary(text)) {
    throw new Error("That file does not decode as text. Re-save it as UTF-8 SQL.");
  }
  if (!text.trim()) {
    throw new Error("That file is empty.");
  }

  return {
    text,
    name: file.name,
    bytes: file.size,
    encoding,
  };
}
