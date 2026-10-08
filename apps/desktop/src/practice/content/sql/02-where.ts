import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-02",
  track: "sql",
  title: `WHERE — filtering rows`,
  body: `\`WHERE\` keeps only the rows that pass a test. It comes after \`FROM\`.

- Compare with \`=\`, \`<>\` (not equal), \`>\`, \`<\`, \`>=\`, \`<=\`. Text goes in single quotes: \`WHERE state = 'Kerala'\`.
- Combine tests with \`AND\` (both must hold) and \`OR\` (either may hold). Use brackets when you mix them.
- \`IN ('UPI', 'Card')\` is a tidy way to write several \`OR\` tests on one column.
- \`BETWEEN 500 AND 2000\` is inclusive of both ends.
- \`LIKE 'S%'\` matches text starting with S; \`%\` stands for any run of characters.

Rows are filtered *before* anything is grouped or counted, which is why \`WHERE\` can't use totals — that is the job of \`HAVING\`, coming up shortly.`,
  example: `SELECT full_name, city, state
FROM customers
WHERE state = 'Tamil Nadu' AND segment = 'Consumer'
LIMIT 10;`,
  exercises: [
    {
      id: "sql-02-e1",
      prompt: `List the full_name and city of every customer in Karnataka.`,
      starter: `SELECT 
FROM customers
WHERE `,
      solution: `SELECT full_name, city FROM customers WHERE state = 'Karnataka';`,
      hint: `Text values go in single quotes.`,
    },
    {
      id: "sql-02-e2",
      prompt: `Show product_name and unit_price for products priced from 500 to 2000 (both ends included).`,
      starter: ``,
      solution: `SELECT product_name, unit_price FROM products WHERE unit_price BETWEEN 500 AND 2000;`,
      hint: `BETWEEN is inclusive.`,
    },
    {
      id: "sql-02-e3",
      prompt: `Show order_id and payment_method for orders paid by UPI or Card.`,
      starter: ``,
      solution: `SELECT order_id, payment_method FROM orders WHERE payment_method IN ('UPI', 'Card');`,
    },
  ],
};
