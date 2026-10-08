import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-09",
  track: "python",
  title: `pandas — groupby and agg`,
  body: `\`groupby\` is pandas' version of SQL's \`GROUP BY\`.

\`df.groupby("category")["unit_price"].mean()\` — split by category, take the price column, average each group.

- Common summaries: \`.mean()\`, \`.sum()\`, \`.count()\`, \`.min()\`, \`.max()\`, \`.size()\` (rows per group).
- Several at once: \`.agg(["mean", "max"])\`, or named outputs: \`.agg(avg=("unit_price", "mean"))\`.
- The group labels become the index. \`.reset_index()\` turns them back into a normal column.
- \`.round(2)\` tidies decimals.

Think "split, apply, combine" — that is the whole idea.`,
  example: `products = load("products")
products.groupby("category")["unit_price"].agg(["count", "mean"]).round(2)`,
  exercises: [
    {
      id: "py-09-e1",
      prompt: `Compute the average unit_price of products per category, rounded to 2 decimals, into \`avg_price\`.`,
      starter: `products = load("products")
avg_price = `,
      solution: `products = load("products")
avg_price = products.groupby("category")["unit_price"].mean().round(2)`,
      tests: `exp = dict(conn.execute("SELECT category, ROUND(AVG(unit_price), 2) FROM products GROUP BY category").fetchall())
got = avg_price.to_dict()
assert set(got) == set(exp), "one value per category expected"
assert all(abs(got[k] - exp[k]) < 0.011 for k in exp), f"values differ: {got}"`,
    },
    {
      id: "py-09-e2",
      prompt: `Compute the average salary per department into \`avg_salary\` (no rounding needed).`,
      starter: `employees = load("employees")
avg_salary = `,
      solution: `employees = load("employees")
avg_salary = employees.groupby("department")["salary"].mean()`,
      tests: `exp = dict(conn.execute("SELECT department, AVG(salary) FROM employees GROUP BY department").fetchall())
got = avg_salary.to_dict()
assert set(got) == set(exp)
assert all(abs(got[k] - exp[k]) < 1e-6 for k in exp), f"values differ: {got}"`,
    },
  ],
};
