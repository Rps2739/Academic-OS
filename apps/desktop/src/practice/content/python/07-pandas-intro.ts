import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-07",
  track: "python",
  title: `pandas — load and inspect`,
  body: `pandas is the standard Python tool for tables. A table is a **DataFrame**; one column is a **Series**.

In this lab \`load("orders")\` returns a table as a DataFrame (the Datasets page lists the tables).

- \`df.head()\` shows the first rows; \`df.shape\` is (rows, columns); \`len(df)\` is the row count.
- \`df.dtypes\` lists column types; \`df.describe()\` summarises the numbers.
- \`df["status"]\` picks a column; \`df["status"].unique()\` lists its distinct values; \`.value_counts()\` counts them.
- \`df.isna().sum()\` counts missing values per column.

Always run \`head()\`, \`shape\` and \`describe()\` first — five seconds that prevent embarrassing assumptions.`,
  example: `orders = load("orders")
print(orders.shape)
orders["status"].value_counts()`,
  exercises: [
    {
      id: "py-07-e1",
      prompt: `Load the orders table and store its number of rows in \`n_rows\`.`,
      starter: `orders = load("orders")
n_rows = `,
      solution: `orders = load("orders")
n_rows = len(orders)`,
      tests: `assert n_rows == 2500, f"expected 2500, got {n_rows}"`,
    },
    {
      id: "py-07-e2",
      prompt: `Store the distinct order statuses, in alphabetical order, as a list in \`statuses\`.`,
      starter: `orders = load("orders")
statuses = `,
      solution: `orders = load("orders")
statuses = sorted(orders["status"].unique())`,
      tests: `assert list(statuses) == ["Cancelled", "Delivered", "Returned", "Shipped"], f"got {list(statuses)}"`,
    },
  ],
};
