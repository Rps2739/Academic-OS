import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-05",
  track: "sql",
  title: `GROUP BY and HAVING`,
  body: `\`GROUP BY\` splits rows into piles by a column and runs the aggregate on each pile separately.

- \`SELECT status, COUNT(*) FROM orders GROUP BY status\` gives one row per status.
- Every column in \`SELECT\` must either be in \`GROUP BY\` or be wrapped in an aggregate.
- \`HAVING\` filters the *piles* after they are built — it can use \`COUNT(*)\` or \`SUM(...)\`, which \`WHERE\` cannot.

Order of work in the database: \`WHERE\` filters rows, \`GROUP BY\` builds piles, \`HAVING\` filters piles, then \`ORDER BY\` and \`LIMIT\` tidy the output. Remembering that order explains most beginner errors.`,
  example: `SELECT category, COUNT(*) AS products, ROUND(AVG(unit_price), 2) AS avg_price
FROM products
GROUP BY category
ORDER BY products DESC;`,
  exercises: [
    {
      id: "sql-05-e1",
      prompt: `Count the orders for each status. Return status and a column named orders.`,
      starter: ``,
      solution: `SELECT status, COUNT(*) AS orders FROM orders GROUP BY status;`,
    },
    {
      id: "sql-05-e2",
      prompt: `Show each department with its average salary (rounded to a whole number) in a column named avg_salary.`,
      starter: ``,
      solution: `SELECT department, ROUND(AVG(salary)) AS avg_salary FROM employees GROUP BY department;`,
    },
    {
      id: "sql-05-e3",
      prompt: `Show the categories that have more than 8 products, with the count in a column named n.`,
      starter: ``,
      solution: `SELECT category, COUNT(*) AS n FROM products GROUP BY category HAVING COUNT(*) > 8;`,
      hint: `You can't use WHERE on a count — use HAVING.`,
    },
  ],
};
