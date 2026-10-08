import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-06",
  track: "sql",
  title: `INNER JOIN and LEFT JOIN`,
  body: `Real data is spread over tables. A join lines rows up using a shared column — usually an id.

- \`INNER JOIN\` keeps only rows that have a match on both sides.
- \`LEFT JOIN\` keeps *every* row from the left table; where there is no match, the right-hand columns are NULL.
- Give tables short nicknames (aliases) so you can say which table a column comes from: \`FROM orders o JOIN customers c ON c.customer_id = o.customer_id\`.
- To count matches including zero, \`LEFT JOIN\` and then \`COUNT(right_table.id)\` — counting a right-side column skips the NULLs.

Use \`LEFT JOIN\` whenever the question contains "including those with none".`,
  example: `SELECT o.order_id, c.full_name, o.status
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LIMIT 10;`,
  exercises: [
    {
      id: "sql-06-e1",
      prompt: `Show each order_id with the full_name of the customer who placed it.`,
      starter: ``,
      solution: `SELECT o.order_id, c.full_name FROM orders o INNER JOIN customers c ON c.customer_id = o.customer_id;`,
    },
    {
      id: "sql-06-e2",
      prompt: `Show every employee_id with the number of orders they handled (column orders), including employees who handled none.`,
      starter: ``,
      solution: `SELECT e.employee_id, COUNT(o.order_id) AS orders FROM employees e LEFT JOIN orders o ON o.employee_id = e.employee_id GROUP BY e.employee_id;`,
      hint: `LEFT JOIN, then COUNT a column from the orders side.`,
    },
    {
      id: "sql-06-e3",
      prompt: `Show each order_id with the region_name of its region.`,
      starter: ``,
      solution: `SELECT o.order_id, r.region_name FROM orders o JOIN regions r ON r.region_id = o.region_id;`,
    },
  ],
};
