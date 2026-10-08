import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-07",
  track: "sql",
  title: `Joining three or more tables`,
  body: `You can chain joins: each new \`JOIN\` hangs off a table already in the query.

Revenue questions usually need three tables. \`order_items\` holds quantities and prices, \`orders\` holds the status and date, and \`products\` holds the category. The line revenue is quantity × price × (1 − discount).

- Filter early with \`WHERE\`: \`WHERE o.status = 'Delivered'\` stops cancelled orders inflating revenue.
- Then \`GROUP BY\` the thing you want to compare — category, region, month.
- If a result looks far too big, a join has probably multiplied rows. Check by counting rows before and after each join.

Always ask: what does one row represent after this join? If you can't say, stop and look at the keys.`,
  example: `SELECT p.category,
       ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount)), 2) AS revenue
FROM order_items oi
JOIN orders o   ON o.order_id = oi.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.status = 'Delivered'
GROUP BY p.category;`,
  exercises: [
    {
      id: "sql-07-e1",
      prompt: `Revenue per category from Delivered orders only: category and revenue (rounded to 2 decimals), where revenue = SUM(quantity * unit_price * (1 - discount)) using the unit_price from order_items.`,
      starter: ``,
      solution: `SELECT p.category, ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount)), 2) AS revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'Delivered' GROUP BY p.category;`,
    },
    {
      id: "sql-07-e2",
      prompt: `Revenue per region_name from Delivered orders (rounded to 2 decimals, column revenue). Use orders.region_id.`,
      starter: ``,
      solution: `SELECT r.region_name, ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount)), 2) AS revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN regions r ON r.region_id = o.region_id WHERE o.status = 'Delivered' GROUP BY r.region_name;`,
    },
    {
      id: "sql-07-e3",
      prompt: `Total quantity sold (column units) for each Electronics product: product_name and units, across all orders.`,
      starter: ``,
      solution: `SELECT p.product_name, SUM(oi.quantity) AS units FROM order_items oi JOIN products p ON p.product_id = oi.product_id WHERE p.category = 'Electronics' GROUP BY p.product_id, p.product_name;`,
    },
  ],
};
