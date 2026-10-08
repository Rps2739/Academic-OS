import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-08",
  track: "python",
  title: `pandas — filtering and selecting`,
  body: `Filtering in pandas uses a True/False mask.

- \`orders["status"] == "Delivered"\` makes a mask; \`orders[mask]\` keeps the True rows.
- Combine masks with \`&\` (and), \`|\` (or), \`~\` (not) — and put each test in brackets: \`(a == 1) & (b == 2)\`.
- \`df["col"].isin(["Books", "Home"])\` is the pandas version of SQL's \`IN\`.
- Pick columns with a list: \`df[["order_id", "status"]]\`.
- \`df.sort_values("unit_price", ascending=False)\` sorts; \`.head(5)\` then gives a top 5.

If you see "truth value of a Series is ambiguous", you used \`and\` instead of \`&\`.`,
  example: `orders = load("orders")
upi = orders[orders["payment_method"] == "UPI"]
upi[["order_id", "status"]].head()`,
  exercises: [
    {
      id: "py-08-e1",
      prompt: `From orders, keep the rows that are Delivered AND paid by UPI into \`upi\`.`,
      starter: `orders = load("orders")
upi = `,
      solution: `orders = load("orders")
upi = orders[(orders["status"] == "Delivered") & (orders["payment_method"] == "UPI")]`,
      tests: `n = conn.execute("SELECT COUNT(*) FROM orders WHERE status = 'Delivered' AND payment_method = 'UPI'").fetchone()[0]
assert len(upi) == n, f"expected {n} rows, got {len(upi)}"`,
    },
    {
      id: "py-08-e2",
      prompt: `From products, keep the rows whose category is Books or Home into \`books_home\`.`,
      starter: `products = load("products")
books_home = `,
      solution: `products = load("products")
books_home = products[products["category"].isin(["Books", "Home"])]`,
      tests: `n = conn.execute("SELECT COUNT(*) FROM products WHERE category IN ('Books', 'Home')").fetchone()[0]
assert len(books_home) == n, f"expected {n} rows, got {len(books_home)}"`,
    },
  ],
};
