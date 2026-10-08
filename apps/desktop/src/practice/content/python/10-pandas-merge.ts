import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-10",
  track: "python",
  title: `pandas — merge (joins)`,
  body: `\`merge\` is pandas' \`JOIN\`.

\`orders.merge(customers, on="customer_id")\` — rows are matched where \`customer_id\` is equal in both tables.

- \`how="inner"\` (the default) keeps matches only; \`how="left"\` keeps every row of the left table.
- If both tables have a column with the same name (other than the key), pandas adds \`_x\` / \`_y\`. Avoid that by selecting only the columns you need: \`products[["product_id", "category"]]\`.
- New columns are just assignments: \`df["revenue"] = df["quantity"] * df["unit_price"]\`.

After a merge, always check \`len()\` against what you expected — a wrong key multiplies rows silently.`,
  example: `orders = load("orders")
customers = load("customers")
merged = orders.merge(customers[["customer_id", "full_name", "segment"]], on="customer_id")
merged.head()`,
  exercises: [
    {
      id: "py-10-e1",
      prompt: `Merge orders with customers on customer_id into \`merged\`.`,
      starter: `orders = load("orders")
customers = load("customers")
merged = `,
      solution: `orders = load("orders")
customers = load("customers")
merged = orders.merge(customers, on="customer_id")`,
      tests: `assert len(merged) == 2500, f"expected 2500 rows, got {len(merged)}"
assert "full_name" in merged.columns, "customer columns should be present"`,
    },
    {
      id: "py-10-e2",
      prompt: `Join order_items with each product's category, add a revenue column (quantity * unit_price * (1 - discount)) and store total revenue per category in \`rev_by_cat\`.`,
      starter: `items = load("order_items")
products = load("products")
`,
      solution: `items = load("order_items")
products = load("products")
m = items.merge(products[["product_id", "category"]], on="product_id")
m["revenue"] = m["quantity"] * m["unit_price"] * (1 - m["discount"])
rev_by_cat = m.groupby("category")["revenue"].sum()`,
      tests: `exp = dict(conn.execute("SELECT p.category, SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) FROM order_items oi JOIN products p ON p.product_id = oi.product_id GROUP BY p.category").fetchall())
got = rev_by_cat.to_dict()
assert set(got) == set(exp), "one value per category expected"
assert all(abs(got[k] - exp[k]) < 0.01 for k in exp), "revenue values differ"`,
    },
  ],
};
