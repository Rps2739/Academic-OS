import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-02",
  track: "python",
  title: `Lists and dictionaries`,
  body: `Two containers do most of the work in everyday Python.

- A **list** keeps items in order: \`prices = [499, 1299, 250]\`. Get one with \`prices[0]\` (counting starts at 0), add with \`prices.append(75)\`, and loop with \`for p in prices:\`.
- A **dictionary** maps keys to values: \`stock = {"pen": 40, "bag": 7}\`. Read with \`stock["pen"]\`, or \`stock.get("pen", 0)\` to get 0 instead of an error when the key is missing.
- \`len(x)\` is the size of either; \`sum(prices)\` adds a list of numbers.
- A **list comprehension** builds a new list in one line: \`[p * 2 for p in prices]\`.

Counting things with a dictionary (\`counts[k] = counts.get(k, 0) + 1\`) is a pattern you will reuse constantly.`,
  example: `prices = [499, 1299, 250, 899]
with_gst = [round(p * 1.18, 2) for p in prices]
stock = {"pen": 40, "bag": 7}
stock["pen"] += 10
print(with_gst)
stock`,
  exercises: [
    {
      id: "py-02-e1",
      prompt: `Make a list \`with_gst\` holding each price in \`prices\` plus 18% GST, rounded to 2 decimals.`,
      starter: `prices = [499, 1299, 250, 899]
with_gst = `,
      solution: `prices = [499, 1299, 250, 899]
with_gst = [round(p * 1.18, 2) for p in prices]`,
      tests: `expected = [588.82, 1532.82, 295.0, 1060.82]
assert len(with_gst) == 4, "with_gst should have 4 items"
assert all(abs(a - b) < 0.01 for a, b in zip(with_gst, expected)), f"expected {expected}, got {with_gst}"`,
    },
    {
      id: "py-02-e2",
      prompt: `Fill the dictionary \`counts\` so it maps each city in \`cities\` to how many times it appears.`,
      starter: `cities = ["Pune", "Delhi", "Pune", "Chennai", "Delhi", "Pune"]
counts = {}
`,
      solution: `cities = ["Pune", "Delhi", "Pune", "Chennai", "Delhi", "Pune"]
counts = {}
for c in cities:
    counts[c] = counts.get(c, 0) + 1`,
      tests: `assert counts == {"Pune": 3, "Delhi": 2, "Chennai": 1}, f"got {counts}"`,
      hint: `Use counts.get(c, 0) + 1 inside a for loop.`,
    },
  ],
};
