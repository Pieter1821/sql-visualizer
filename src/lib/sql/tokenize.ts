export type Token = {
  text: string;
  cls: string;
};

const KEYWORDS = new Set(
  `select from where group by having order asc desc join inner left right full outer cross on
   with as union all distinct insert into values update set delete create alter drop table view
   procedure function begin end if else while return declare exec execute case when then top
   limit offset and or not in exists between like is null primary key foreign references index
   cte partition over row_number rank dense_rank count sum avg min max cast convert coalesce
   isnull nullif inner_join output merge using apply pivot unpivot`
    .split(/\s+/)
    .filter(Boolean),
);

const PATTERN =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:''|[^'])*'|"(?:""|[^"])*"|\[[^\]]*\])|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([(),;.*=<>+\-/%|]+)/g;

/** Minimal SQL tokenizer for the editor overlay — highlighting only, no parsing. */
export function tokenizeSql(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;

  for (const m of text.matchAll(PATTERN)) {
    const index = m.index ?? 0;
    if (index > last) tokens.push({ text: text.slice(last, index), cls: "" });

    const [raw, comment, str, num, word, op] = m;
    if (comment) tokens.push({ text: raw, cls: "tok-comment" });
    else if (str) tokens.push({ text: raw, cls: "tok-string" });
    else if (num) tokens.push({ text: raw, cls: "tok-number" });
    else if (word) {
      tokens.push({
        text: raw,
        cls: KEYWORDS.has(raw.toLowerCase()) ? "tok-keyword" : "tok-ident",
      });
    } else if (op) tokens.push({ text: raw, cls: "tok-op" });

    last = index + raw.length;
  }

  if (last < text.length) tokens.push({ text: text.slice(last), cls: "" });
  return tokens;
}
