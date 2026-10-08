import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-04",
  track: "sql",
  title: `COUNT, SUM, AVG, MIN, MAX`,
  body: `Aggregate functions squash many rows into one answer.

- \`COUNT(*)\` counts rows. \`COUNT(column)\` counts only rows where that column is not empty (not NULL).
- \`SUM(x)\`, \`AVG(x)\`, \`MIN(x)\`, \`MAX(x)\` do what they say.
- \`ROUND(AVG(unit_price), 2)\` tidies a long decimal to two places.
- \`COUNT(DISTINCT city)\` counts different cities rather than rows.

Without \`GROUP BY\`, an aggregate query returns exactly one row. Combine them with \`WHERE\` to answer "how many of these?" — for example, how many orders were cancelled.`,
  example: `SELECT COUNT(*) AS orders,
       COUNT(DISTINCT customer_id) AS customers
FROM orders
WHERE status = 'Delivered';`,
  exercises: [
    {
      id: "sql-04-e1",
      prompt: `How many orders are there in total? Return one number.`,
      starter: ``,
      solution: `SELECT COUNT(*) FROM orders;`,
    },
    {
      id: "sql-04-e2",
      prompt: `What is the average unit_price of all products, rounded to 2 decimal places?`,
      starter: ``,
      solution: `SELECT ROUND(AVG(unit_price), 2) FROM products;`,
    },
    {
      id: "sql-04-e3",
      prompt: `Show the highest and lowest employee salary in one row (highest first).`,
      starter: ``,
      solution: `SELECT MAX(salary), MIN(salary) FROM employees;`,
    },
  ],
};
