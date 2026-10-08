import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-12",
  track: "sql",
  title: `Window functions`,
  body: `A window function does a calculation across related rows *without collapsing them*, so you keep every row and add a new column.

\`function() OVER (PARTITION BY group ORDER BY sort)\`

- \`PARTITION BY\` restarts the calculation for each group (like \`GROUP BY\`, but rows stay).
- \`ROW_NUMBER()\` numbers rows 1, 2, 3…; \`RANK()\` gives ties the same number and skips ahead.
- \`LAG(x)\` looks at the previous row's value — perfect for "change from last month".
- \`SUM(x) OVER (ORDER BY month)\` gives a running total.

You can apply a window function to an aggregate: \`LAG(SUM(revenue)) OVER (ORDER BY month)\` after a \`GROUP BY month\`. This family of questions appears in nearly every analytics interview.`,
  example: `SELECT full_name, department, salary,
       RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank_in_dept
FROM employees
ORDER BY department, rank_in_dept;`,
  exercises: [
    {
      id: "sql-12-e1",
      prompt: `Show full_name, department, salary and rnk — the RANK() of each employee's salary within their department, highest salary = 1.`,
      starter: ``,
      solution: `SELECT full_name, department, salary, RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rnk FROM employees;`,
    },
    {
      id: "sql-12-e2",
      prompt: `From monthly_sales, show each month, total revenue (column revenue, rounded to 2 decimals) and the change from the previous month (column change, rounded to 2 decimals; the first month's change is NULL). Oldest month first.`,
      starter: ``,
      solution: `SELECT month, ROUND(SUM(revenue), 2) AS revenue, ROUND(SUM(revenue) - LAG(SUM(revenue)) OVER (ORDER BY month), 2) AS change FROM monthly_sales GROUP BY month ORDER BY month;`,
      ordered: true,
      hint: `GROUP BY month first; LAG can wrap the SUM.`,
    },
    {
      id: "sql-12-e3",
      prompt: `From monthly_sales, show each month and the running total of revenue up to that month (column running_total, rounded to 2 decimals). Oldest month first.`,
      starter: ``,
      solution: `SELECT month, ROUND(SUM(SUM(revenue)) OVER (ORDER BY month), 2) AS running_total FROM monthly_sales GROUP BY month ORDER BY month;`,
      ordered: true,
    },
  ],
};
