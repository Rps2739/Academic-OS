import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-13",
  track: "sql",
  title: `NULLs — the missing value`,
  body: `NULL means "unknown or missing", not zero and not an empty string. It behaves unlike normal values.

- \`city = NULL\` never works. Use \`city IS NULL\` and \`city IS NOT NULL\`.
- Any arithmetic with NULL gives NULL, and NULL is never equal to anything — even another NULL.
- \`COUNT(column)\` skips NULLs while \`COUNT(*)\` does not: their difference is the number of missing values.
- \`COALESCE(payment_method, 'Unknown')\` replaces NULL with a default, handy before grouping.
- \`NOT IN\` against a list that contains a NULL returns no rows at all — another reason to prefer \`NOT EXISTS\`.

Whenever a result looks suspiciously short, ask whether NULLs are quietly dropping rows.`,
  example: `SELECT COUNT(*) AS customers,
       COUNT(city) AS with_city,
       COUNT(*) - COUNT(city) AS missing_city
FROM customers;`,
  exercises: [
    {
      id: "sql-13-e1",
      prompt: `Show the customer_id of every customer whose city is missing.`,
      starter: ``,
      solution: `SELECT customer_id FROM customers WHERE city IS NULL;`,
    },
    {
      id: "sql-13-e2",
      prompt: `Count orders per payment method, showing missing methods as 'Unknown': columns method and n.`,
      starter: ``,
      solution: `SELECT COALESCE(payment_method, 'Unknown') AS method, COUNT(*) AS n FROM orders GROUP BY method;`,
    },
    {
      id: "sql-13-e3",
      prompt: `In one row, show how many customers have an email (column with_email) and how many customers there are in total (column total).`,
      starter: ``,
      solution: `SELECT COUNT(email) AS with_email, COUNT(*) AS total FROM customers;`,
    },
  ],
};
