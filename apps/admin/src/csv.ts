export const COMMENT_CSV_HEADERS = [
  "_id",
  "__v",
  "content",
  "createdAt",
  "disabled",
  "downvoteUsers",
  "downvotes",
  "language",
  "productId",
  "score",
  "updatedAt",
  "upvoteUsers",
  "upvotes",
  "user",
  "userId",
] as const;
const JSON_FIELDS = new Set(["user", "upvoteUsers", "downvoteUsers"]);
const BOOLEAN_FIELDS = new Set(["disabled"]);
const NUMBER_FIELDS = new Set(["__v", "score", "upvotes", "downvotes"]);

const parseRows = (source: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV의 따옴표가 닫히지 않았습니다.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const parseBoolean = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no", ""].includes(normalized)) return false;
  throw new Error(`boolean 값이 올바르지 않습니다: ${value}`);
};

const parseCell = (header: string, value: string): unknown => {
  const trimmed = value.trim();
  if (JSON_FIELDS.has(header)) {
    if (!trimmed) return header === "user" ? "" : [];
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      if (header === "user") return value;
      return trimmed.split(/[|;]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  if (BOOLEAN_FIELDS.has(header)) return parseBoolean(value);
  if (NUMBER_FIELDS.has(header) && trimmed) {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) throw new Error(`숫자 값이 올바르지 않습니다: ${value}`);
    return parsed;
  }
  return value;
};

export const parseCommentsCsv = (source: string): Record<string, unknown>[] => {
  const rows = parseRows(source.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV 헤더와 댓글 데이터가 필요합니다.");

  const headers = rows[0].map((header) => header.trim());
  const duplicate = headers.find((header, index) => headers.indexOf(header) !== index);
  if (duplicate) throw new Error(`중복된 CSV 필드가 있습니다: ${duplicate}`);
  const invalidIndex = COMMENT_CSV_HEADERS.findIndex((header, index) => headers[index] !== header);
  if (headers.length !== COMMENT_CSV_HEADERS.length || invalidIndex !== -1) {
    const position = invalidIndex === -1 ? COMMENT_CSV_HEADERS.length + 1 : invalidIndex + 1;
    throw new Error(
      `CSV 헤더 순서가 올바르지 않습니다. ${position}번째 필드부터 확인해 주세요. `
      + `필수 순서: ${COMMENT_CSV_HEADERS.join(", ")}`,
    );
  }

  return rows.slice(1).flatMap((values, rowIndex) => {
    if (values.every((value) => !value.trim())) return [];
    if (values.length > headers.length) {
      throw new Error(`CSV ${rowIndex + 2}행의 열 개수가 헤더보다 많습니다.`);
    }
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      try {
        record[header] = parseCell(header, values[index] ?? "");
      } catch (error) {
        const message = error instanceof Error ? error.message : "값을 읽지 못했습니다.";
        throw new Error(`CSV ${rowIndex + 2}행 ${header}: ${message}`);
      }
    });
    return [record];
  });
};
