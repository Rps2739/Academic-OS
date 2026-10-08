import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-14",
  track: "sql",
  title: `Interview patterns`,
  body: `A handful of question shapes cover most SQL interviews. Practise saying the plan out loud before you type.

- **Second-highest value**: \`MAX(x)\` where \`x\` is below the overall \`MAX(x)\` — or use a window rank and pick rank 2.
- **Top N per group**: rank rows with \`ROW_NUMBER() OVER (PARTITION BY group ORDER BY value DESC)\` inside a CTE, then keep rank ≤ N.
- **Rates and shares**: divide a conditional count by a total — remember \`1.0 *\` to avoid whole-number division.
- **Duplicates**: \`GROUP BY\` the columns that should be unique and keep \`HAVING COUNT(*) > 1\`.
- **Year-on-year or month-on-month**: \`LAG\` over a time-ordered aggregate.

State your assumptions (do ties count? are cancelled orders included?) — interviewers listen for that as much as for the query.`,
  example: `SELECT MAX(salary) AS second_highest
FROM employees
WHERE salary < (SELECT MAX(salary) FROM employees);`,
  exercises: [
    {
      id: "sql-14-e1",
      prompt: `Return the second-highest distinct salary in employees as a single value.`,
      starter: ``,
      solution: `SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);`,
    },
    {
      id: "sql-14-e2",
      prompt: `For each category, show the 3 products with the highest total revenue across all orders (revenue = SUM(quantity * unit_price * (1 - discount)) from order_items). Return category and product_name.`,
      starter: ``,
      solution: `WITH rev AS (SELECT p.category, p.product_name, SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS revenue FROM order_items oi JOIN products p ON p.product_id = oi.product_id GROUP BY p.product_id, p.category, p.product_name), ranked AS (SELECT category, product_name, ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC) AS rn FROM rev) SELECT category, product_name FROM ranked WHERE rn <= 3;`,
      hint: `Rank inside a CTE, then filter rn <= 3.`,
    },
    {
      id: "sql-14-e3",
      prompt: `What share of customers who ordered at least once ordered at least twice? Return one number rounded to 4 decimals (for example 0.9876).`,
      starter: ``,
      solution: `SELECT ROUND(1.0 * SUM(CASE WHEN n >= 2 THEN 1 ELSE 0 END) / COUNT(*), 4) FROM (SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id);`,
    },
  ],
};
