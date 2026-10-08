import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-12",
  track: "python",
  title: `pandas — dates`,
  body: `Dates arrive as text. Convert them once and a lot opens up.

- \`pd.to_datetime(df["order_date"])\` converts text to real dates.
- After that, \`.dt\` gives parts: \`.dt.year\`, \`.dt.month\`, \`.dt.day_name()\`, \`.dt.to_period("M")\` (a year-month).
- Group by a period for trends: \`df.groupby(df["order_date"].dt.to_period("M")).size()\`.
- \`Series.idxmax()\` returns the label of the biggest value — "which month was busiest?".
- Subtracting dates gives a time difference: \`(a - b).dt.days\`.

Convert first, then group. Grouping on text dates still works only if they happen to sort correctly.`,
  example: `import pandas as pd
orders = load("orders")
orders["order_date"] = pd.to_datetime(orders["order_date"])
orders.groupby(orders["order_date"].dt.to_period("M")).size().tail(6)`,
  exercises: [
    {
      id: "py-12-e1",
      prompt: `Convert the order_date column of \`orders\` to real dates (replace the column).`,
      starter: `import pandas as pd
orders = load("orders")
`,
      solution: `import pandas as pd
orders = load("orders")
orders["order_date"] = pd.to_datetime(orders["order_date"])`,
      tests: `assert str(orders["order_date"].dtype).startswith("datetime64"), "order_date should be a datetime column"`,
    },
    {
      id: "py-12-e2",
      prompt: `Count orders per month into \`monthly\` (indexed by month) and store the busiest month as text like 2025-11 in \`busiest\`.`,
      starter: `import pandas as pd
orders = load("orders")
orders["order_date"] = pd.to_datetime(orders["order_date"])
`,
      solution: `import pandas as pd
orders = load("orders")
orders["order_date"] = pd.to_datetime(orders["order_date"])
monthly = orders.groupby(orders["order_date"].dt.to_period("M")).size()
busiest = str(monthly.idxmax())`,
      tests: `rows = conn.execute("SELECT strftime('%Y-%m', order_date) m, COUNT(*) c FROM orders GROUP BY m").fetchall()
top = max(c for _, c in rows)
assert busiest in [m for m, c in rows if c == top], f"{busiest} is not the busiest month"`,
    },
  ],
};
