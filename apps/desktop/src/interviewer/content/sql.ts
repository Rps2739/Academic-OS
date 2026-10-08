import type { CodeQuestion } from "./types";

export const SQL_Q: CodeQuestion[] = [
  {
    kind: "code",
    id: "iq-sql-01",
    section: "sql",
    prompt: "Find the second-highest salary among employees. Return a single column.",
    starter: ``,
    solution: `SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);`,
  },
  {
    kind: "code",
    id: "iq-sql-02",
    section: "sql",
    prompt: "For each product category, list the top 3 products by delivered revenue (quantity × unit_price × (1 − discount) on order lines of Delivered orders). Return category, product_name and revenue rounded to 0 decimals, sorted by category then revenue descending.",
    starter: `-- hint: aggregate first, then rank with ROW_NUMBER() OVER (PARTITION BY category ...)
`,
    solution: `WITH rev AS (
  SELECT p.category, p.product_name, ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount)), 0) AS revenue
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id AND o.status = 'Delivered'
  JOIN products p ON p.product_id = oi.product_id
  GROUP BY p.category, p.product_name
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC, product_name) AS rn FROM rev
)
SELECT category, product_name, revenue FROM ranked WHERE rn <= 3 ORDER BY category, revenue DESC, product_name;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-03",
    section: "sql",
    prompt: "Month-over-month change in delivered revenue (same revenue definition, by order month). Return month (YYYY-MM), revenue rounded to 0 decimals and change vs the previous month rounded to 0 decimals (NULL for the first month), sorted by month.",
    starter: ``,
    solution: `WITH m AS (
  SELECT strftime('%Y-%m', o.order_date) AS month, ROUND(SUM(oi.quantity * oi.unit_price * (1 - oi.discount)), 0) AS revenue
  FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
  WHERE o.status = 'Delivered'
  GROUP BY 1
)
SELECT month, revenue, revenue - LAG(revenue) OVER (ORDER BY month) AS change
FROM m ORDER BY month;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-04",
    section: "sql",
    prompt: "List the customers who placed an order in 2024 but none in 2025. Return customer_id, sorted by customer_id.",
    starter: ``,
    solution: `SELECT DISTINCT customer_id FROM orders
WHERE strftime('%Y', order_date) = '2024'
  AND customer_id NOT IN (SELECT customer_id FROM orders WHERE strftime('%Y', order_date) = '2025')
ORDER BY customer_id;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-05",
    section: "sql",
    prompt: "Running total of delivered revenue by month. Return month (YYYY-MM), monthly revenue rounded to 0 decimals, and running_total rounded to 0 decimals, sorted by month.",
    starter: ``,
    solution: `WITH m AS (
  SELECT strftime('%Y-%m', o.order_date) AS month, SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS revenue
  FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
  WHERE o.status = 'Delivered'
  GROUP BY 1
)
SELECT month, ROUND(revenue, 0), ROUND(SUM(revenue) OVER (ORDER BY month), 0) FROM m ORDER BY month;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-06",
    section: "sql",
    prompt: "Which department has the highest average salary? Return department and the average salary rounded to 0 decimals (one row).",
    starter: ``,
    solution: `SELECT department, ROUND(AVG(salary), 0) AS avg_salary FROM employees GROUP BY department ORDER BY AVG(salary) DESC LIMIT 1;`,
  },
  {
    kind: "code",
    id: "iq-sql-07",
    section: "sql",
    prompt: "List employees who earn more than the average salary of their own department. Return full_name, department and salary.",
    starter: ``,
    solution: `SELECT e.full_name, e.department, e.salary
FROM employees e
WHERE e.salary > (SELECT AVG(salary) FROM employees WHERE department = e.department);`,
  },
  {
    kind: "code",
    id: "iq-sql-08",
    section: "sql",
    prompt: "Find customer names that appear more than once when you ignore upper/lower case and leading/trailing spaces. Return the cleaned lower-case name and how many times it appears.",
    starter: ``,
    solution: `SELECT LOWER(TRIM(full_name)) AS name, COUNT(*) AS n
FROM customers GROUP BY LOWER(TRIM(full_name)) HAVING COUNT(*) > 1;`,
  },
  {
    kind: "code",
    id: "iq-sql-09",
    section: "sql",
    prompt: "Repeat-customer rate: among customers who have placed at least one order, what percentage placed two or more? Return one number rounded to 2 decimals.",
    starter: ``,
    solution: `WITH c AS (SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id)
SELECT ROUND(100.0 * SUM(CASE WHEN n >= 2 THEN 1 ELSE 0 END) / COUNT(*), 2) FROM c;`,
  },
  {
    kind: "code",
    id: "iq-sql-10",
    section: "sql",
    prompt: "Revenue share per region: for delivered orders, return region_name and its percentage of total delivered revenue (rounded to 2 decimals), sorted by share descending.",
    starter: ``,
    solution: `WITH r AS (
  SELECT rg.region_name, SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.order_id
  JOIN regions rg ON rg.region_id = o.region_id
  WHERE o.status = 'Delivered'
  GROUP BY rg.region_name
)
SELECT region_name, ROUND(100.0 * revenue / SUM(revenue) OVER (), 2) AS share_pct FROM r ORDER BY share_pct DESC;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-11",
    section: "sql",
    prompt: "First order date for every customer who has ordered. Return customer_id and first_order_date.",
    starter: ``,
    solution: `SELECT customer_id, MIN(order_date) FROM orders GROUP BY customer_id;`,
  },
  {
    kind: "code",
    id: "iq-sql-12",
    section: "sql",
    prompt: "Average number of days between consecutive orders, per customer (only customers with at least two orders). Return customer_id and avg_gap_days rounded to 1 decimal.",
    starter: ``,
    solution: `WITH g AS (
  SELECT customer_id,
         julianday(order_date) - julianday(LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date, order_id)) AS gap
  FROM orders
)
SELECT customer_id, ROUND(AVG(gap), 1) FROM g WHERE gap IS NOT NULL GROUP BY customer_id;`,
  },
  {
    kind: "code",
    id: "iq-sql-13",
    section: "sql",
    prompt: "Cancelled-order rate per payment method: return payment_method and the percentage of its orders with status 'Cancelled', rounded to 2 decimals. Leave out orders with an empty payment_method.",
    starter: ``,
    solution: `SELECT payment_method, ROUND(100.0 * SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) / COUNT(*), 2)
FROM orders WHERE payment_method <> '' GROUP BY payment_method;`,
  },
  {
    kind: "code",
    id: "iq-sql-14",
    section: "sql",
    prompt: "Customers who have never had an order Cancelled or Returned (an anti-join). Return customer_id, sorted by customer_id.",
    starter: ``,
    solution: `SELECT c.customer_id FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.customer_id = c.customer_id AND o.status IN ('Cancelled', 'Returned')
)
ORDER BY c.customer_id;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-15",
    section: "sql",
    prompt: "What is the 5th-highest distinct product unit_price? Return one number.",
    starter: ``,
    solution: `SELECT DISTINCT unit_price FROM products ORDER BY unit_price DESC LIMIT 1 OFFSET 4;`,
  },
  {
    kind: "code",
    id: "iq-sql-16",
    section: "sql",
    prompt: "7-day rolling order count: for every date that has at least one order, return the date and the number of orders placed in the 7 days ending on that date (including it). Sort by date.",
    starter: ``,
    solution: `WITH d AS (SELECT order_date, COUNT(*) AS n FROM orders GROUP BY order_date)
SELECT a.order_date,
       (SELECT SUM(b.n) FROM d b WHERE julianday(b.order_date) BETWEEN julianday(a.order_date) - 6 AND julianday(a.order_date)) AS orders_7d
FROM d a ORDER BY a.order_date;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-17",
    section: "sql",
    prompt: "Signup cohorts: for each signup month (YYYY-MM) return how many customers signed up and how many of them placed an order within 30 days of their signup date (a customer counts once). Sort by month.",
    starter: ``,
    solution: `SELECT strftime('%Y-%m', c.signup_date) AS signup_month,
       COUNT(*) AS customers,
       SUM(CASE WHEN EXISTS (
             SELECT 1 FROM orders o
             WHERE o.customer_id = c.customer_id
               AND julianday(o.order_date) - julianday(c.signup_date) BETWEEN 0 AND 30
           ) THEN 1 ELSE 0 END) AS ordered_within_30d
FROM customers c GROUP BY 1 ORDER BY 1;`,
    ordered: true,
  },
  {
    kind: "code",
    id: "iq-sql-18",
    section: "sql",
    prompt: "Pivot: for each region_name return one row with the number of Delivered, Cancelled and Returned orders as three columns (in that order after the region name).",
    starter: ``,
    solution: `SELECT rg.region_name,
       SUM(CASE WHEN o.status = 'Delivered' THEN 1 ELSE 0 END),
       SUM(CASE WHEN o.status = 'Cancelled' THEN 1 ELSE 0 END),
       SUM(CASE WHEN o.status = 'Returned' THEN 1 ELSE 0 END)
FROM orders o JOIN regions rg ON rg.region_id = o.region_id
GROUP BY rg.region_name;`,
  },
  {
    kind: "code",
    id: "iq-sql-19",
    section: "sql",
    prompt: "Median product unit_price (SQLite has no MEDIAN). Return one number; for an even number of products, average the two middle values.",
    starter: ``,
    solution: `SELECT AVG(unit_price) FROM (
  SELECT unit_price FROM products ORDER BY unit_price
  LIMIT 2 - (SELECT COUNT(*) FROM products) % 2
  OFFSET (SELECT (COUNT(*) - 1) / 2 FROM products)
);`,
  },
  {
    kind: "code",
    id: "iq-sql-20",
    section: "sql",
    prompt: "Top customer per region by delivered spend (same revenue definition). Return region_name, the customer's full_name and total spend rounded to 0 decimals. Use the customer's order region (orders.region_id).",
    starter: ``,
    solution: `WITH s AS (
  SELECT o.region_id, o.customer_id, SUM(oi.quantity * oi.unit_price * (1 - oi.discount)) AS spend
  FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
  WHERE o.status = 'Delivered'
  GROUP BY o.region_id, o.customer_id
), r AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY region_id ORDER BY spend DESC, customer_id) AS rn FROM s
)
SELECT rg.region_name, c.full_name, ROUND(r.spend, 0)
FROM r JOIN regions rg ON rg.region_id = r.region_id JOIN customers c ON c.customer_id = r.customer_id
WHERE r.rn = 1;`,
  },
];
