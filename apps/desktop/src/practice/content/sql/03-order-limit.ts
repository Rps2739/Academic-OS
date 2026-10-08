import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-03",
  track: "sql",
  title: `ORDER BY and LIMIT`,
  body: `A table has no built-in order, so results can come back in any sequence until you ask for one.

- \`ORDER BY unit_price\` sorts smallest to largest. Add \`DESC\` for largest first.
- Sort by several columns by separating them with commas: \`ORDER BY category, unit_price DESC\`.
- \`LIMIT 5\` keeps only the first five rows *after* sorting. Together they answer "top N" questions.
- When two rows tie on the sort column, the database may order them either way. Add a second column as a tie-breaker whenever the order matters.

This is the pattern behind "five best-selling products" or "the ten newest orders".`,
  example: `SELECT product_name, category, unit_price
FROM products
ORDER BY unit_price DESC
LIMIT 5;`,
  exercises: [
    {
      id: "sql-03-e1",
      prompt: `Show product_name and unit_price of the 5 most expensive products, most expensive first.`,
      starter: ``,
      solution: `SELECT product_name, unit_price FROM products ORDER BY unit_price DESC LIMIT 5;`,
      ordered: true,
    },
    {
      id: "sql-03-e2",
      prompt: `Show order_id and order_date of the 10 newest orders. Newest first; if two orders share a date, the higher order_id comes first.`,
      starter: ``,
      solution: `SELECT order_id, order_date FROM orders ORDER BY order_date DESC, order_id DESC LIMIT 10;`,
      ordered: true,
      hint: `Two columns in ORDER BY, both DESC.`,
    },
    {
      id: "sql-03-e3",
      prompt: `Show product_name and unit_price of the 3 cheapest products in the Books category, cheapest first.`,
      starter: ``,
      solution: `SELECT product_name, unit_price FROM products WHERE category = 'Books' ORDER BY unit_price LIMIT 3;`,
      ordered: true,
    },
  ],
};
