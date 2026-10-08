import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-10",
  track: "sql",
  title: `CASE WHEN — if/else inside SQL`,
  body: `\`CASE\` lets a query make decisions, exactly like if / else-if / else.

\`CASE WHEN unit_price < 1000 THEN 'Budget' WHEN unit_price < 10000 THEN 'Mid' ELSE 'Premium' END\`

- Conditions are tested top to bottom; the first true one wins.
- Without \`ELSE\`, anything unmatched becomes NULL.
- Put a \`CASE\` inside an aggregate to count or add only some rows: \`SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END)\`. This "conditional aggregation" is how you build a pivot-style table in plain SQL.

Give the result a name with \`AS\` so the column is readable.`,
  example: `SELECT product_name,
       unit_price,
       CASE WHEN unit_price < 1000 THEN 'Budget'
            WHEN unit_price < 10000 THEN 'Mid'
            ELSE 'Premium' END AS tier
FROM products
ORDER BY unit_price;`,
  exercises: [
    {
      id: "sql-10-e1",
      prompt: `Label each product: Budget if unit_price < 1000, Mid if < 10000, otherwise Premium. Return product_name and a column named tier.`,
      starter: ``,
      solution: `SELECT product_name, CASE WHEN unit_price < 1000 THEN 'Budget' WHEN unit_price < 10000 THEN 'Mid' ELSE 'Premium' END AS tier FROM products;`,
    },
    {
      id: "sql-10-e2",
      prompt: `Using the same tiers, show how many products fall in each tier: columns tier and n.`,
      starter: ``,
      solution: `SELECT CASE WHEN unit_price < 1000 THEN 'Budget' WHEN unit_price < 10000 THEN 'Mid' ELSE 'Premium' END AS tier, COUNT(*) AS n FROM products GROUP BY tier;`,
    },
    {
      id: "sql-10-e3",
      prompt: `In ONE row, show the number of Delivered orders (column delivered) and Cancelled orders (column cancelled).`,
      starter: ``,
      solution: `SELECT SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) AS delivered, SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled FROM orders;`,
    },
  ],
};
