import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-05",
  track: "python",
  title: `Comprehensions and sorting`,
  body: `Comprehensions build collections in one readable line.

- List: \`[len(n) for n in names]\`. Add a filter at the end: \`[p for p in prices if p > 500]\`.
- Dictionary: \`{n: len(n) for n in names}\`.
- \`sorted(items)\` returns a new sorted list. \`key=\` says what to sort by and \`reverse=True\` flips it: \`sorted(items, key=lambda x: x[1], reverse=True)\`.
- \`lambda x: x[1]\` is a tiny unnamed function — here "take the second element".
- \`zip(a, b)\` walks two lists together and \`enumerate(a)\` gives (index, item) pairs.

If a comprehension is hard to read, a normal loop is perfectly fine.`,
  example: `items = [("Pen", 10), ("Bag", 899), ("Book", 250)]
sorted(items, key=lambda x: x[1], reverse=True)`,
  exercises: [
    {
      id: "py-05-e1",
      prompt: `Sort \`items\` by price, highest first, into \`by_price\`.`,
      starter: `items = [("Pen", 10), ("Bag", 899), ("Book", 250)]
by_price = `,
      solution: `items = [("Pen", 10), ("Bag", 899), ("Book", 250)]
by_price = sorted(items, key=lambda x: x[1], reverse=True)`,
      tests: `assert [n for n, _ in by_price] == ["Bag", "Book", "Pen"], f"got {by_price}"`,
    },
    {
      id: "py-05-e2",
      prompt: `Build a dictionary \`lengths\` mapping each name in \`names\` to its number of letters, using a dict comprehension.`,
      starter: `names = ["Delhi", "Pune", "Kochi"]
lengths = `,
      solution: `names = ["Delhi", "Pune", "Kochi"]
lengths = {n: len(n) for n in names}`,
      tests: `assert lengths == {"Delhi": 5, "Pune": 4, "Kochi": 5}, f"got {lengths}"`,
    },
  ],
};
