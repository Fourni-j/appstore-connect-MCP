import { describe, it, expect } from "vitest";
import { parseTSV } from "../utils/tsv.js";

describe("parseTSV", () => {
  it("parses standard TSV with headers", () => {
    const tsv = "Name\tAge\tCity\nAlice\t30\tParis\nBob\t25\tLondon";
    const result = parseTSV(tsv);
    expect(result).toEqual([
      { Name: "Alice", Age: "30", City: "Paris" },
      { Name: "Bob", Age: "25", City: "London" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseTSV("")).toEqual([]);
    expect(parseTSV("  ")).toEqual([]);
  });

  it("returns empty array for header-only input", () => {
    expect(parseTSV("Name\tAge\tCity")).toEqual([]);
  });

  it("handles rows with missing columns", () => {
    const tsv = "A\tB\tC\n1\t2";
    const result = parseTSV(tsv);
    expect(result).toEqual([{ A: "1", B: "2", C: "" }]);
  });

  it("trims whitespace from headers and values", () => {
    const tsv = " Name \t Age \n Alice \t 30 ";
    const result = parseTSV(tsv);
    expect(result).toEqual([{ Name: "Alice", Age: "30" }]);
  });

  it("skips empty rows", () => {
    const tsv = "Name\tAge\nAlice\t30\n\nBob\t25";
    const result = parseTSV(tsv);
    expect(result).toEqual([
      { Name: "Alice", Age: "30" },
      { Name: "Bob", Age: "25" },
    ]);
  });
});
