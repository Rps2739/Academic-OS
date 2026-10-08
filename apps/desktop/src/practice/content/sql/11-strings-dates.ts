import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-11",
  track: "sql",
  title: `Text and date functions`,
  body: `Real data is messy, and a few functions clean most of it.

- \`TRIM(x)\` removes stray spaces at both ends; \`LOWER(x)\` / \`UPPER(x)\` change case.
- \`SUBSTR(x, start, length)\` cuts out part of a text (positions start at 1); \`INSTR(x, ' ')\` finds where a space is.
- \`||\` joins text: \`first || ' ' || last\`.
- Dates here are text like \`2025-11-04\`, so they sort correctly. \`strftime('%Y-%m', order_date)\` turns a date into a year-month label; \`%Y\` is the year, \`%m\` the month.

Grouping by \`strftime('%Y-%m', date)\` is the quickest way to get a monthly trend.`,
  example: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS orders
FROM orders
GROUP BY month
ORDER BY month
LIMIT 12;`,
  exercises: [
    {
      id: "sql-11-e1",
      prompt: `Some customer names have stray spaces. Show customer_id and the trimmed name (column name) for only those customers whose full_name differs from its trimmed version.`,
      starter: ``,
      solution: `SELECT customer_id, TRIM(full_name) AS name FROM customers WHERE full_name <> TRIM(full_name);`,
    },
    {
      id: "sql-11-e2",
      prompt: `Count orders per month: columns month (like 2025-11) and orders.`,
      starter: ``,
      solution: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS orders FROM orders GROUP BY month;`,
    },
    {
      id: "sql-11-e3",
      prompt: `Show customer_id and signup_date of customers who signed up during 2025.`,
      starter: ``,
      solution: `SELECT customer_id, signup_date FROM customers WHERE strftime('%Y', signup_date) = '2025';`,
    },
  ],
};
