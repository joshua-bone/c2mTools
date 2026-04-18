import { describe, expect, it } from "vitest";

import {
  createMinimalC2gText,
  normalizeC2gRelativePath,
  parseC2gText,
  rewriteC2gTextDocument,
  serializeC2gText,
} from "../src/c2g/index.js";

describe("c2g text parser", () => {
  it("preserves untouched text exactly when parsed and reserialized", () => {
    const raw = [
      'game "Example Set"',
      "ktools flags | flags =",
      "",
      "; comment attached to next map",
      "script ; intro text",
      '"Have fun!"',
      'music "+..\\music\\track.mp3" map "01\\First.c2m" ; lead-in',
      'map "02\\Second.c2m"',
      "",
    ].join("\r\n");

    const parsed = parseC2gText(raw);

    expect(parsed.lineEnding).toBe("\r\n");
    expect(parsed.gameName).toBe("Example Set");
    expect(parsed.entries).toHaveLength(2);
    expect(serializeC2gText(parsed)).toBe(raw);
  });

  it("extracts bare map lines as entry blocks", () => {
    const parsed = parseC2gText('game "Set"\nmap "first.c2m"\nmap "second.c2m"\n');

    expect(parsed.entries.map((entry) => entry.relativePath)).toEqual(["first.c2m", "second.c2m"]);
    expect(parsed.entries[0]?.leadingText).toBe("");
  });

  it("extracts map paths from music lines and preserves comments", () => {
    const raw =
      'music "+..\\music\\DeletingLife.mp3" map "21-40\\IntenseDodging.c2m" ; intense music\n';

    const parsed = parseC2gText(raw);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.relativePath).toBe("21-40\\IntenseDodging.c2m");
    expect(parsed.entries[0]?.statementPrefix).toBe('music "+..\\music\\DeletingLife.mp3" map "');
    expect(parsed.entries[0]?.statementSuffix).toBe('" ; intense music\n');
    expect(serializeC2gText(parsed)).toBe(raw);
  });

  it("attaches comments and script lines immediately above a map to the entry block", () => {
    const raw = [
      'game "Set"',
      "ktools flags | flags =",
      "",
      "; comment for upcoming level",
      "script",
      '"The following level"',
      '"is tricky"',
      'map "AwesomeLevel.c2m"',
      "",
    ].join("\n");

    const parsed = parseC2gText(raw);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.leadingText).toBe(
      '\n; comment for upcoming level\nscript\n"The following level"\n"is tricky"\n',
    );
    expect(parsed.segments[1]).toEqual({
      type: "text",
      text: "ktools flags | flags =\n",
    });
    expect(parsed.segments[2]).toEqual({
      type: "entry",
      rawText:
        '\n; comment for upcoming level\nscript\n"The following level"\n"is tricky"\nmap "AwesomeLevel.c2m"\n',
      leadingText: '\n; comment for upcoming level\nscript\n"The following level"\n"is tricky"\n',
      statementPrefix: 'map "',
      relativePath: "AwesomeLevel.c2m",
      statementSuffix: '"\n',
    });
  });

  it("treats advanced script and control lines as opaque text", () => {
    const raw = [
      'game "Set"',
      "#intro",
      "if flags",
      'chain "branch.c2g"',
      'map "play.c2m"',
      "endif",
      "",
    ].join("\n");

    const parsed = parseC2gText(raw);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.leadingText).toBe("");
    expect(parsed.segments[1]).toEqual({
      type: "text",
      text: '#intro\nif flags\nchain "branch.c2g"\n',
    });
    expect(parsed.segments[3]).toEqual({
      type: "text",
      text: "endif\n",
    });
    expect(serializeC2gText(parsed)).toBe(raw);
  });
});

describe("c2g helpers", () => {
  it("normalizes relative map paths", () => {
    expect(normalizeC2gRelativePath(".\\levels\\01\\first.c2m")).toBe("levels/01/first.c2m");
    expect(normalizeC2gRelativePath("levels//two/../02.c2m")).toBe("levels/02.c2m");
  });

  it("builds a minimal c2g manifest", () => {
    expect(createMinimalC2gText("Example", ["001_first.c2m", "002_second.c2m"])).toBe(
      'game "Example"\nmap "001_first.c2m"\nmap "002_second.c2m"\n',
    );
  });

  it("rewrites game name and entry order while preserving opaque text", () => {
    const parsed = parseC2gText(
      [
        'game "Old Name"',
        "script",
        '"opaque intro"',
        'music "theme.ogg" map "002_second.c2m"',
        "if flags",
        'map "001_first.c2m"',
        "endif",
        "",
      ].join("\n"),
    );

    const rewritten = rewriteC2gTextDocument(parsed, {
      gameName: "New Name",
      entryRelativePaths: ["001_first.c2m", "003_third.c2m", "002_second.c2m"],
    });

    expect(serializeC2gText(rewritten)).toBe(
      [
        'game "New Name"',
        'map "001_first.c2m"',
        "if flags",
        'map "003_third.c2m"',
        "script",
        '"opaque intro"',
        'music "theme.ogg" map "002_second.c2m"',
        "endif",
        "",
      ].join("\n"),
    );
  });
});
