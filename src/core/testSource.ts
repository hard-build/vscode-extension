export interface GoogleTestSourceLocation {
  name: string;
  start: number;
  end: number;
}

function maskRange(
  characters: string[],
  source: string,
  start: number,
  end: number,
): void {
  for (let index = start; index < end; index += 1) {
    if (source[index] !== "\n" && source[index] !== "\r") {
      characters[index] = " ";
    }
  }
}

function quotedEnd(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
    } else if (source[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function rawStringEnd(source: string, start: number): number | undefined {
  if (!source.startsWith('R"', start)) {
    return undefined;
  }
  const delimiterStart = start + 2;
  const opening = source.indexOf("(", delimiterStart);
  if (opening < 0 || opening - delimiterStart > 16) {
    return undefined;
  }
  const delimiter = source.slice(delimiterStart, opening);
  if (/[\s\\()]/u.test(delimiter)) {
    return undefined;
  }
  const terminator = ")" + delimiter + '"';
  const closing = source.indexOf(terminator, opening + 1);
  return closing < 0 ? source.length : closing + terminator.length;
}

function maskNonCode(source: string): string {
  const characters = source.split("");
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      const end = newline < 0 ? source.length : newline;
      maskRange(characters, source, index, end);
      index = end;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const closing = source.indexOf("*/", index + 2);
      const end = closing < 0 ? source.length : closing + 2;
      maskRange(characters, source, index, end);
      index = end;
      continue;
    }
    const rawEnd = rawStringEnd(source, index);
    if (rawEnd !== undefined) {
      maskRange(characters, source, index, rawEnd);
      index = rawEnd;
      continue;
    }
    const character = source[index];
    if (character === '"' || character === "'") {
      const end = quotedEnd(source, index, character);
      maskRange(characters, source, index, end);
      index = end;
      continue;
    }
    index += 1;
  }
  return characters.join("");
}

function bodyEnd(masked: string, declarationEnd: number): number {
  let opening = declarationEnd;
  while (opening < masked.length && /\s/u.test(masked[opening] ?? "")) {
    opening += 1;
  }
  if (masked[opening] !== "{") {
    return declarationEnd;
  }

  let depth = 0;
  for (let index = opening; index < masked.length; index += 1) {
    if (masked[index] === "{") {
      depth += 1;
    } else if (masked[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return masked.length;
}

export function parseGoogleTestSource(source: string): GoogleTestSourceLocation[] {
  const masked = maskNonCode(source);
  const declarationPattern =
    /\b(?:TEST|TEST_F)\s*\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\)/gu;
  const locations: GoogleTestSourceLocation[] = [];

  for (const match of masked.matchAll(declarationPattern)) {
    const suite = match[1];
    const testCase = match[2];
    if (suite === undefined || testCase === undefined || match.index === undefined) {
      continue;
    }
    const declarationEnd = match.index + match[0].length;
    locations.push({
      name: suite + "." + testCase,
      start: match.index,
      end: bodyEnd(masked, declarationEnd),
    });
  }
  return locations;
}
