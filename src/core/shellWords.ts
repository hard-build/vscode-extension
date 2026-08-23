export function parseShellWords(value: string): string[] {
  const words: string[] = [];
  let current = "";
  let tokenStarted = false;
  let quote: "'" | '"' | undefined;

  const finish = (): void => {
    if (tokenStarted) {
      words.push(current);
      current = "";
      tokenStarted = false;
    }
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) {
      continue;
    }

    if (quote === "'") {
      if (character === "'") {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = undefined;
        continue;
      }
      if (character === "\\") {
        index += 1;
        const escaped = value[index];
        if (escaped === undefined) {
          throw new Error("unfinished escape in double-quoted value");
        }
        current += escaped;
        continue;
      }
      current += character;
      continue;
    }

    if (/\s/u.test(character)) {
      finish();
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (character === "\\") {
      index += 1;
      const escaped = value[index];
      if (escaped === undefined) {
        throw new Error("unfinished escape");
      }
      current += escaped;
      tokenStarted = true;
      continue;
    }
    current += character;
    tokenStarted = true;
  }

  if (quote !== undefined) {
    throw new Error("unclosed quote");
  }
  finish();
  return words;
}
