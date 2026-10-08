import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "sql-01",
  track: "sql",
  title: "SELECT — reading columns from a table",
  body: `A database stores data in tables: rows are records, columns are fields. \`SELECT\` is how you ask for data.

The shape is always \`SELECT columns FROM table\`. Use \`*\` for every column, or list the ones you need separated by commas.

- \`SELECT * FROM products\` returns every column of every product.
- \`SELECT product_name, unit_price FROM products\` returns just two columns.
- \`AS\` renames a column in the result: \`SELECT unit_price AS price FROM products\`.
- \`DISTINCT\` removes duplicate rows: \`SELECT DISTINCT category FROM products\`.

In interviews, list columns explicitly rather than using \`*\` — it shows you know what you need, and it's faster on big tables.`,
  example: `SELECT product_name, category, unit_price
FROM products
LIMIT 10;`,
  exercises: [
    {
      id: "sql-01-e1",
      prompt: "List the full_name and city of every customer.",
      starter: "SELECT \nFROM customers;",
      solution: "SELECT full_name, city FROM customers;",
      hint: "Put the two column names after SELECT, separated by a comma.",
    },
    {
      id: "sql-01-e2",
      prompt: "Show each distinct product category once.",
      starter: "",
      solution: "SELECT DISTINCT category FROM products;",
      hint: "DISTINCT goes right after SELECT.",
    },
    {
      id: "sql-01-e3",
      prompt: "Show product_name and unit_price, but name the second column price.",
      starter: "",
      solution: "SELECT product_name, unit_price AS price FROM products;",
    },
  ],
};
