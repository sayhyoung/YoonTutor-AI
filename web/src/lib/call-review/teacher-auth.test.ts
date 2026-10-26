import { describe, expect, it } from "vitest";

import { parseCustomerNos } from "./teacher-auth";

describe("batch customer numbers", () => {
  it("accepts a de-duplicated list of member numbers", () => {
    expect(parseCustomerNos(["A1", "B2", "A1"])).toEqual(["A1", "B2"]);
  });

  it("rejects empty, oversized or malformed lists", () => {
    expect(parseCustomerNos([])).toBeNull();
    expect(parseCustomerNos("A1")).toBeNull();
    expect(parseCustomerNos(["../x"])).toBeNull();
    expect(parseCustomerNos(Array.from({ length: 101 }, (_, index) => `S${index}`))).toBeNull();
  });
});
