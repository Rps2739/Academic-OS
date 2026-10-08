import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-09",
  track: "sql",
  title: `WITH (common table expressions)`,
  body: `A CTE gives a name to a query so you can use it like a temporary table. It reads top to bottom, like steps in a recipe.

\`WITH spend AS (SELECT customer_id, SUM(...) AS total FROM ... GROUP BY customer_id) SELECT ... FROM spend WHERE total > 1000;\`

- Define several steps by separating them with commas, each able to use the ones before it.
- A CTE is just a readable subquery — it is not saved anywhere.
- Use one when the same intermediate result is needed twice (for example, a total and then the average of those totals).

Interviewers like CTEs because they show you can break a hard question into small, checkable parts.`,
  example: `WITH per_customer AS (
  SELECT customer_id, COUNT(*) AS delivered
  FROM orders
  WHERE status = 'Delivered'
  GROUP BY customer_id
)
SELECT delivered, COUNT(*) AS customers
FROM per_customer
GROUP BY delivered
ORDER BY delivered;`,
  exercises: [
    {
      id: "sql-09-e1",
      prompt: `Using a CTE, show customer_id and n (delivered-order count) for customers with 10 or more Delivered orders.`,
      starter: `WITH c AS (
  
)
SELECT customer_id, n FROM c WHERE n >= 10;`,
      solution: `WITH c AS (SELECT customer_id, COUNT(*) AS n FROM orders WHERE status = 'Delivered' GROUP BY customer_id) SELECT customer_id, n FROM c WHERE n >= 10;`,
    },
    {
      id: "sql-09-e2",
      prompt: `Show the customer_id of customers whose total Delivered spend is above the average Delivered spend per customer. Spend = SUM(quantity * unit_price * (1 - discount)) from order_items.`,
      starter: ``,
      solution: `WITH spend AS (SELECT o.customer_id, SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS total FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = 'Delivered' GROUP BY o.customer_id) SELECT customer_id FROM spend WHERE total > (SELECT AVG(total) FROM spend);`,
    },
    {
      id: "sql-09-e3",
      prompt: `For each region_id, show the category with the highest Delivered revenue (revenue as in the previous exercise). Return region_id and category.`,
      starter: ``,
      solution: `WITH rc AS (SELECT o.region_id, p.category, SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id WHERE o.status = 'Delivered' GROUP BY o.region_id, p.category) SELECT region_id, category FROM rc WHERE revenue = (SELECT MAX(revenue) FROM rc rc2 WHERE rc2.region_id = rc.region_id);`,
      hint: `Build revenue per region+category first, then keep each region's maximum.`,
    },
  ],
};
