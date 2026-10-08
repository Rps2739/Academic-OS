import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-03",
  track: "python",
  title: `Loops and if`,
  body: `Programs make decisions with \`if\` and repeat work with loops.

- \`if score >= 50:\` runs the indented block only when true; add \`elif\` for more cases and \`else\` for the rest. The indentation *is* the structure.
- \`for x in items:\` repeats once per item. \`range(1, 21)\` gives the numbers 1 to 20 (the end is excluded).
- \`%\` is the remainder: \`n % 2 == 0\` means "n is even".
- \`break\` leaves a loop early; \`continue\` skips to the next round.
- \`and\`, \`or\`, \`not\` combine conditions.

A good habit: write the loop for one item first, then wrap it.`,
  example: `for n in range(1, 11):
    if n % 2 == 0:
        print(n, "even")
    else:
        print(n, "odd")`,
  exercises: [
    {
      id: "py-03-e1",
      prompt: `Set \`total\` to the sum of all even numbers from 1 to 20 (inclusive).`,
      starter: `total = 0
`,
      solution: `total = 0
for n in range(1, 21):
    if n % 2 == 0:
        total += n`,
      tests: `assert total == 110, f"expected 110, got {total}"`,
    },
    {
      id: "py-03-e2",
      prompt: `For each amount in \`amounts\`, append a discount to \`discounts\`: 0 if the amount is under 1000, 0.05 if under 10000, otherwise 0.1.`,
      starter: `amounts = [800, 2500, 12000]
discounts = []
`,
      solution: `amounts = [800, 2500, 12000]
discounts = []
for a in amounts:
    if a < 1000:
        discounts.append(0)
    elif a < 10000:
        discounts.append(0.05)
    else:
        discounts.append(0.1)`,
      tests: `assert discounts == [0, 0.05, 0.1], f"got {discounts}"`,
    },
  ],
};
