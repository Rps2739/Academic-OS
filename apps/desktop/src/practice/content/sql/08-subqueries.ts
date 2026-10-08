import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-08",
  track: "sql",
  title: `Subqueries`,
  body: `A subquery is a query inside brackets that produces a value or a list for the outer query to use.

- A **single-value** subquery can sit in a comparison: \`WHERE unit_price > (SELECT AVG(unit_price) FROM products)\`.
- A **list** subquery works with \`IN\` and \`NOT IN\`: "customers who are in this list".
- A **correlated** subquery refers to the outer row, so it re-runs for each row: \`WHERE salary > (SELECT AVG(salary) FROM employees WHERE department = e.department)\`.

Prefer \`NOT EXISTS\` over \`NOT IN\` when the inner column might contain NULLs — a single NULL makes \`NOT IN\` return nothing, a classic interview trap.`,
  example: `SELECT product_name, unit_price
FROM products
WHERE unit_price > (SELECT AVG(unit_price) FROM products)
ORDER BY unit_price DESC;`,
  exercises: [
    {
      id: "sql-08-e1",
      prompt: `Show product_name and unit_price of products priced above the average product price.`,
      starter: ``,
      solution: `SELECT product_name, unit_price FROM products WHERE unit_price > (SELECT AVG(unit_price) FROM products);`,
    },
    {
      id: "sql-08-e2",
      prompt: `Show the full_name of employees who have never handled an order.`,
      starter: ``,
      solution: `SELECT full_name FROM employees WHERE employee_id NOT IN (SELECT employee_id FROM orders);`,
      hint: `Orders have an employee_id. Which employee_ids never appear there?`,
    },
    {
      id: "sql-08-e3",
      prompt: `Show full_name, department and salary of employees who earn more than the average salary of their own department.`,
      starter: ``,
      solution: `SELECT e.full_name, e.department, e.salary FROM employees e WHERE e.salary > (SELECT AVG(salary) FROM employees WHERE department = e.department);`,
      hint: `The inner query needs to refer to the outer row's department.`,
    },
  ],
};
