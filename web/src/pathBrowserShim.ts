// @notcc/logic re-exports its C2G parser from the package root. The parser only
// needs Node's `path.join`, but that single import otherwise prevents Vite from
// bundling the replay validator for the browser.
export function join(...segments: ReadonlyArray<string>): string {
  const absolute = segments.some((segment) => segment.startsWith("/"));
  const parts: string[] = [];

  for (const segment of segments) {
    for (const part of segment.replace(/\\/g, "/").split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (parts.length > 0 && parts.at(-1) !== "..") parts.pop();
        else if (!absolute) parts.push(part);
        continue;
      }
      parts.push(part);
    }
  }

  const result = parts.join("/");
  if (absolute) return `/${result}`;
  return result || ".";
}
