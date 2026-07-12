import { describe, expect, test } from "bun:test";

import { COMMENT_CSV_HEADERS, parseCommentsCsv } from "./csv";

describe("parseCommentsCsv", () => {
  test("parses the fixed legacy field order and quoted values", () => {
    const csv = [
      COMMENT_CSV_HEADERS.join(","),
      'comment-1,0,"first line,\nsecond ""line""",2025-01-02T03:04:05Z,false,'
        + '"[""down-1""]",1,ja,5058077,8,2025-01-03T03:04:05Z,'
        + 'up-1|up-2,2,"{""username"":""legacy-user""}",user-1',
    ].join("\n");

    expect(parseCommentsCsv(csv)).toEqual([
      {
        _id: "comment-1",
        __v: 0,
        content: 'first line,\nsecond "line"',
        createdAt: "2025-01-02T03:04:05Z",
        disabled: false,
        downvoteUsers: ["down-1"],
        downvotes: 1,
        language: "ja",
        productId: "5058077",
        score: 8,
        updatedAt: "2025-01-03T03:04:05Z",
        upvoteUsers: ["up-1", "up-2"],
        upvotes: 2,
        user: { username: "legacy-user" },
        userId: "user-1",
      },
    ]);
  });

  test("rejects a different header order", () => {
    const headers = [...COMMENT_CSV_HEADERS];
    [headers[0], headers[1]] = [headers[1], headers[0]];

    expect(() => parseCommentsCsv(`${headers.join(",")}\n${",".repeat(14)}`)).toThrow(
      "CSV 헤더 순서가 올바르지 않습니다.",
    );
  });
});
