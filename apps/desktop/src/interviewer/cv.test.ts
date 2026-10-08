import { cvPrompts } from "./cv.ts";

describe("cvPrompts", () => {
  it("keeps substantial lines, strips bullets, drops short and duplicate lines", () => {
    const text = `RAHUL SHARMA
• Led a 4-member team to redesign the college fest sponsorship deck, raising ₹3.2L
- Led a 4-member team to redesign the college fest sponsorship deck, raising ₹3.2L
1. Built a Power BI dashboard tracking weekly sales for 12 stores
Skills: Excel, SQL`;
    const out = cvPrompts(text);
    expect(out.map((p) => p.line)).toEqual([
      "Led a 4-member team to redesign the college fest sponsorship deck, raising ₹3.2L",
      "Built a Power BI dashboard tracking weekly sales for 12 stores",
    ]);
  });
  it("gives stable ids for the same line", () => {
    expect(cvPrompts("Built a dashboard for twelve retail stores")[0]!.id).toBe(cvPrompts("  - Built a dashboard for twelve retail stores ")[0]!.id);
  });
});
