import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-11",
  track: "python",
  title: `pandas — pivot_table and crosstab`,
  body: `A pivot table turns long data into a grid, like Excel's PivotTable.

\`df.pivot_table(index="region_name", columns="category", values="revenue", aggfunc="sum")\` — one row per region, one column per category, sums in the cells.

- \`index\` = row labels, \`columns\` = column labels, \`values\` = what to aggregate, \`aggfunc\` = how.
- \`fill_value=0\` replaces empty cells.
- \`pd.crosstab(a, b)\` is the quick way to count combinations: \`pd.crosstab(orders["status"], orders["payment_method"])\`.
- \`margins=True\` adds totals.

Pivots are excellent for spotting patterns before you decide what to chart.`,
  example: `import pandas as pd
orders = load("orders")
pd.crosstab(orders["status"], orders["payment_method"])`,
  exercises: [
    {
      id: "py-11-e1",
      prompt: `Merge monthly_sales with regions, then pivot total revenue with region_name as rows and category as columns into \`pivot\`.`,
      starter: `import pandas as pd
ms = load("monthly_sales")
regions = load("regions")
`,
      solution: `import pandas as pd
ms = load("monthly_sales")
regions = load("regions")
j = ms.merge(regions, on="region_id")
pivot = j.pivot_table(index="region_name", columns="category", values="revenue", aggfunc="sum")`,
      tests: `assert pivot.shape == (5, 5), f"expected 5 regions x 5 categories, got {pivot.shape}"
exp = conn.execute("SELECT SUM(revenue) FROM monthly_sales WHERE region_id = 1 AND category = 'Books'").fetchone()[0]
r = conn.execute("SELECT region_name FROM regions WHERE region_id = 1").fetchone()[0]
assert abs(pivot.loc[r, "Books"] - exp) < 0.01, "a cell does not match the total"`,
    },
    {
      id: "py-11-e2",
      prompt: `Count orders for each combination of status and payment method into \`table\` using pd.crosstab.`,
      starter: `import pandas as pd
orders = load("orders")
table = `,
      solution: `import pandas as pd
orders = load("orders")
table = pd.crosstab(orders["status"], orders["payment_method"])`,
      tests: `assert table.shape[0] == 4, "one row per status expected"
assert int(table.values.sum()) == int(orders["payment_method"].notna().sum()), "counts should add up to orders with a payment method"`,
    },
  ],
};
