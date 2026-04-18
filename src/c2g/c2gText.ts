export type C2gGameStatement = Readonly<{
  type: "game";
  rawText: string;
  statementPrefix: string;
  name: string;
  statementSuffix: string;
}>;

export type C2gEntryBlock = Readonly<{
  type: "entry";
  rawText: string;
  leadingText: string;
  statementPrefix: string;
  relativePath: string;
  statementSuffix: string;
}>;

export type C2gTextSegment = Readonly<
  | {
      type: "text";
      text: string;
    }
  | C2gGameStatement
  | C2gEntryBlock
>;

export type C2gTextDocument = Readonly<{
  rawText: string;
  lineEnding: "\r\n" | "\n" | "\r";
  segments: ReadonlyArray<C2gTextSegment>;
  gameName: string | null;
  entries: ReadonlyArray<C2gEntryBlock>;
}>;

type QuotedDirectiveMatch = Readonly<{
  statementPrefix: string;
  value: string;
  statementSuffix: string;
}>;

function detectLineEnding(text: string): "\r\n" | "\n" | "\r" {
  const crlfIndex = text.indexOf("\r\n");
  const lfIndex = text.indexOf("\n");
  const crIndex = text.indexOf("\r");

  if (
    crlfIndex >= 0 &&
    (lfIndex === -1 || crlfIndex <= lfIndex) &&
    (crIndex === -1 || crlfIndex <= crIndex)
  ) {
    return "\r\n";
  }
  if (lfIndex >= 0) return "\n";
  if (crIndex >= 0) return "\r";
  return "\n";
}

function splitLinesPreservingEndings(text: string): string[] {
  if (text.length === 0) return [];

  const lines: string[] = [];
  let lineStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\r") {
      if (text[index + 1] === "\n") {
        lines.push(text.slice(lineStart, index + 2));
        index += 1;
      } else {
        lines.push(text.slice(lineStart, index + 1));
      }
      lineStart = index + 1;
      continue;
    }
    if (char === "\n") {
      lines.push(text.slice(lineStart, index + 1));
      lineStart = index + 1;
    }
  }

  if (lineStart < text.length) {
    lines.push(text.slice(lineStart));
  }

  return lines;
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function findLineCommentStart(line: string): number {
  let inString = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === ";") return index;
    if (char === "/" && line[index + 1] === "/") return index;
  }

  return -1;
}

function codePartWithoutComment(line: string): string {
  const commentStart = findLineCommentStart(line);
  return commentStart >= 0 ? line.slice(0, commentStart) : line;
}

function trimTrailingLineEnding(line: string): string {
  if (line.endsWith("\r\n")) return line.slice(0, -2);
  if (line.endsWith("\n") || line.endsWith("\r")) return line.slice(0, -1);
  return line;
}

function parseQuotedDirective(line: string, keyword: "game" | "map"): QuotedDirectiveMatch | null {
  const searchable = trimTrailingLineEnding(codePartWithoutComment(line));
  const lower = searchable.toLowerCase();

  for (let index = 0; index < lower.length; index += 1) {
    if (lower.slice(index, index + keyword.length) !== keyword) continue;
    if (isWordChar(lower[index - 1])) continue;
    if (isWordChar(lower[index + keyword.length])) continue;

    let cursor = index + keyword.length;
    while (cursor < searchable.length && /\s/.test(searchable[cursor]!)) cursor += 1;
    if (searchable[cursor] !== '"') continue;

    const quoteStart = cursor;
    cursor += 1;
    while (cursor < searchable.length && searchable[cursor] !== '"') cursor += 1;
    if (cursor >= searchable.length) return null;

    return {
      statementPrefix: line.slice(0, quoteStart + 1),
      value: searchable.slice(quoteStart + 1, cursor),
      statementSuffix: line.slice(cursor),
    };
  }

  return null;
}

function isAttachableStandaloneLine(line: string): boolean {
  const code = codePartWithoutComment(line).trim();
  if (code.length === 0) return true;
  if (code.toLowerCase() === "script") return true;
  return code.startsWith('"');
}

function splitAttachableSuffix(text: string): Readonly<{ keepText: string; attachText: string }> {
  const lines = splitLinesPreservingEndings(text);
  let splitIndex = lines.length;

  while (splitIndex > 0 && isAttachableStandaloneLine(lines[splitIndex - 1]!)) {
    splitIndex -= 1;
  }

  return {
    keepText: lines.slice(0, splitIndex).join(""),
    attachText: lines.slice(splitIndex).join(""),
  };
}

function escapeC2gQuotedValue(value: string): string {
  if (value.includes('"')) {
    throw new Error('C2G strings cannot contain a double quote character (").');
  }
  return value;
}

function serializeSegment(segment: C2gTextSegment): string {
  switch (segment.type) {
    case "text":
      return segment.text;
    case "game":
      return segment.statementPrefix + escapeC2gQuotedValue(segment.name) + segment.statementSuffix;
    case "entry":
      return (
        segment.leadingText +
        segment.statementPrefix +
        escapeC2gQuotedValue(segment.relativePath) +
        segment.statementSuffix
      );
  }
}

export function normalizeC2gRelativePath(value: string): string {
  const trimmed = value.replaceAll("\\", "/").trim();
  if (trimmed.startsWith("/") || /^[A-Za-z]:\//.test(trimmed)) {
    throw new Error("C2G map path must be relative.");
  }
  const parts = trimmed.split("/");
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      if (normalizedParts.length > 0 && normalizedParts[normalizedParts.length - 1] !== "..") {
        normalizedParts.pop();
      } else {
        normalizedParts.push(part);
      }
      continue;
    }
    normalizedParts.push(part);
  }

  const normalized = normalizedParts.join("/");
  if (normalized === "." || normalized.length === 0) {
    throw new Error("C2G map path must not be empty.");
  }
  return normalized.replace(/^(\.\/)+/, "");
}

export function createMinimalC2gText(
  gameName: string,
  relativePaths: ReadonlyArray<string>,
): string {
  const lines = [`game "${escapeC2gQuotedValue(gameName)}"`];
  for (const relativePath of relativePaths) {
    lines.push(`map "${escapeC2gQuotedValue(relativePath)}"`);
  }
  return `${lines.join("\n")}\n`;
}

export function parseC2gText(rawText: string): C2gTextDocument {
  const segments: C2gTextSegment[] = [];
  const entries: C2gEntryBlock[] = [];
  let gameName: string | null = null;
  let pendingText = "";

  for (const line of splitLinesPreservingEndings(rawText)) {
    const gameMatch: QuotedDirectiveMatch | null =
      gameName === null ? parseQuotedDirective(line, "game") : null;
    if (gameMatch) {
      if (pendingText.length > 0) {
        segments.push({ type: "text", text: pendingText });
        pendingText = "";
      }
      const gameSegment: C2gGameStatement = {
        type: "game",
        rawText: line,
        statementPrefix: gameMatch.statementPrefix,
        name: gameMatch.value,
        statementSuffix: gameMatch.statementSuffix,
      };
      segments.push(gameSegment);
      gameName = gameMatch.value;
      continue;
    }

    const mapMatch: QuotedDirectiveMatch | null = parseQuotedDirective(line, "map");
    if (mapMatch) {
      const { keepText, attachText } = splitAttachableSuffix(pendingText);
      if (keepText.length > 0) {
        segments.push({ type: "text", text: keepText });
      }
      const entrySegment: C2gEntryBlock = {
        type: "entry",
        rawText: attachText + line,
        leadingText: attachText,
        statementPrefix: mapMatch.statementPrefix,
        relativePath: mapMatch.value,
        statementSuffix: mapMatch.statementSuffix,
      };
      segments.push(entrySegment);
      entries.push(entrySegment);
      pendingText = "";
      continue;
    }

    pendingText += line;
  }

  if (pendingText.length > 0) {
    segments.push({ type: "text", text: pendingText });
  }

  return {
    rawText,
    lineEnding: detectLineEnding(rawText),
    segments,
    gameName,
    entries,
  };
}

export function serializeC2gText(doc: C2gTextDocument): string {
  return doc.segments.map(serializeSegment).join("");
}
