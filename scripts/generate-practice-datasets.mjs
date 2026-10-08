// Generates the Practice lab's synthetic "Bharat Retail" dataset — an
// invented Indian e-commerce company. Seeded + deterministic: rerunning
// produces byte-identical files. Output is committed (small). No real
// people or companies; names are combined from common Indian first/last
// names. Run: node scripts/generate-practice-datasets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "desktop", "public", "practice-datasets");

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260928);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p) => rand() < p;
const round2 = (n) => Math.round(n * 100) / 100;
const addDays = (iso, days) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Rohan", "Karthik", "Ishaan", "Rahul", "Vikram", "Ananya", "Diya", "Priya", "Kavya", "Meera", "Sneha", "Aishwarya", "Pooja", "Nisha", "Lakshmi", "Harish", "Suresh", "Deepak", "Farhan", "Imran", "Zoya", "Sana", "Gurpreet", "Simran", "Tenzin", "Anjali", "Rekha", "Manoj", "Nikhil", "Divya", "Sruthi", "Varun", "Neha", "Ritu", "Abhishek"];
const LAST = ["Sharma", "Verma", "Iyer", "Reddy", "Nair", "Menon", "Patel", "Shah", "Gupta", "Das", "Banerjee", "Chatterjee", "Rao", "Pillai", "Kulkarni", "Deshpande", "Singh", "Khan", "Joshi", "Mehta", "Bose", "Mishra", "Agarwal", "Naidu", "Gowda", "Fernandes", "Dsouza", "Kapoor", "Malhotra", "Sinha"];
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;

const REGIONS = [
  { region_id: 1, region_name: "North", cities: [["Delhi", "Delhi"], ["Chandigarh", "Chandigarh"], ["Jaipur", "Rajasthan"], ["Lucknow", "Uttar Pradesh"]] },
  { region_id: 2, region_name: "South", cities: [["Bengaluru", "Karnataka"], ["Chennai", "Tamil Nadu"], ["Hyderabad", "Telangana"], ["Kochi", "Kerala"]] },
  { region_id: 3, region_name: "West", cities: [["Mumbai", "Maharashtra"], ["Pune", "Maharashtra"], ["Ahmedabad", "Gujarat"], ["Panaji", "Goa"]] },
  { region_id: 4, region_name: "East", cities: [["Kolkata", "West Bengal"], ["Bhubaneswar", "Odisha"], ["Patna", "Bihar"], ["Guwahati", "Assam"]] },
  { region_id: 5, region_name: "Central", cities: [["Bhopal", "Madhya Pradesh"], ["Indore", "Madhya Pradesh"], ["Nagpur", "Maharashtra"], ["Raipur", "Chhattisgarh"]] },
];

const CATALOG = [
  ["Electronics", [["Mobiles", ["Smartphone 5G", "Smartphone Lite", "Feature Phone"], 7999, 49999], ["Laptops", ["Ultrabook 14", "Gaming Laptop 15", "Student Laptop"], 32999, 119999], ["Accessories", ["Wireless Earbuds", "Power Bank 20000mAh", "USB-C Charger", "Bluetooth Speaker"], 499, 4999]]],
  ["Home", [["Kitchen", ["Mixer Grinder", "Pressure Cooker 5L", "Non-stick Tawa"], 799, 5999], ["Furniture", ["Study Table", "Office Chair", "Bookshelf"], 2999, 14999], ["Decor", ["Wall Clock", "Table Lamp", "Cushion Covers (Set of 5)"], 299, 2499]]],
  ["Fashion", [["Men", ["Cotton Kurta", "Formal Shirt", "Denim Jeans"], 599, 2999], ["Women", ["Silk Saree", "Kurti Set", "Handbag"], 799, 8999], ["Footwear", ["Running Shoes", "Leather Sandals", "Sneakers"], 699, 4999]]],
  ["Grocery", [["Staples", ["Basmati Rice 5kg", "Toor Dal 1kg", "Atta 10kg"], 120, 899], ["Snacks", ["Masala Chips", "Roasted Makhana", "Dry Fruit Mix"], 40, 699], ["Beverages", ["Assam Tea 500g", "Filter Coffee 500g", "Mango Drink 1L"], 60, 599]]],
  ["Books", [["Fiction", ["Monsoon Letters (Novel)", "The Last Train (Novel)"], 199, 599], ["Business", ["Strategy Essentials", "Marketing Management"], 399, 1299], ["Exam Prep", ["CAT Quant Guide", "UPSC GS Manual"], 299, 999]]],
];
const BRANDS = { Electronics: ["Nova", "Zentek", "Orbit"], Home: ["Griha", "Casa", "Tulsi"], Fashion: ["Rangoli", "Urban Loom", "Stride"], Grocery: ["Annapurna", "Desi Farm", "Kaveri"], Books: ["Pustak Press", "Sahitya"] };

// ---- regions
const regions = REGIONS.map((r) => ({ region_id: r.region_id, region_name: r.region_name, head_city: r.cities[0][0] }));

// ---- products
const products = [];
for (const [category, subs] of CATALOG) {
  for (const [sub, items, lo, hi] of subs) {
    for (const item of items) {
      const unit = round2(lo + rand() * (hi - lo));
      products.push({
        product_id: products.length + 1,
        product_name: category === "Books" ? item : `${pick(BRANDS[category])} ${item}`,
        category,
        sub_category: sub,
        brand: category === "Books" ? pick(BRANDS.Books) : null,
        unit_price: unit,
        cost_price: round2(unit * (0.55 + rand() * 0.25)),
      });
    }
  }
}
for (const p of products) if (p.brand === null) p.brand = p.product_name.split(" ")[0];

// ---- customers (with a little deliberate mess for cleaning exercises)
const customers = [];
for (let i = 1; i <= 300; i++) {
  const region = pick(REGIONS);
  const [city, state] = pick(region.cities);
  let name = fullName();
  if (chance(0.02)) name = `  ${name.toLowerCase()} `;
  customers.push({
    customer_id: i,
    full_name: name,
    email: chance(0.01) ? null : `${name.trim().toLowerCase().replace(/\s+/g, ".")}${i}@example.com`,
    city: chance(0.03) ? null : city,
    state,
    region_id: region.region_id,
    segment: pick(["Consumer", "Consumer", "Consumer", "Corporate", "Small Business"]),
    signup_date: addDays("2024-01-01", int(0, 900)),
  });
}

// ---- employees (department heads have no manager)
const DEPTS = [["Sales", 15, 450000, 1400000], ["Operations", 8, 400000, 1100000], ["Marketing", 6, 500000, 1600000], ["Finance", 4, 600000, 1800000], ["HR", 3, 450000, 1200000], ["Analytics", 4, 700000, 2200000]];
const employees = [];
for (const [dept, count, lo, hi] of DEPTS) {
  const headId = employees.length + 1;
  for (let k = 0; k < count; k++) {
    const region = pick(REGIONS);
    employees.push({
      employee_id: employees.length + 1,
      full_name: fullName(),
      department: dept,
      manager_id: k === 0 ? null : headId,
      city: pick(region.cities)[0],
      hire_date: addDays("2018-04-01", int(0, 2900)),
      salary: Math.round((k === 0 ? hi : lo + rand() * (hi - lo) * 0.8) / 1000) * 1000,
    });
  }
}
const salesStaff = employees.filter((e) => e.department === "Sales").map((e) => e.employee_id);

// ---- orders + order_items (festive season Oct–Nov is busier)
const orders = [];
const orderItems = [];
while (orders.length < 2500) {
  const date = addDays("2024-07-01", int(0, 729));
  const month = Number(date.slice(5, 7));
  if (month !== 10 && month !== 11 && !chance(0.75)) continue;
  const customer = pick(customers);
  const r = rand();
  const status = r < 0.85 ? "Delivered" : r < 0.92 ? "Cancelled" : r < 0.97 ? "Returned" : "Shipped";
  const order = {
    order_id: orders.length + 1,
    customer_id: customer.customer_id,
    employee_id: pick(salesStaff),
    order_date: date,
    status,
    payment_method: chance(0.02) ? null : pick(["UPI", "UPI", "UPI", "Card", "Card", "COD", "NetBanking"]),
    region_id: customer.region_id,
  };
  orders.push(order);
  const used = new Set();
  const lines = int(1, 4);
  for (let k = 0; k < lines; k++) {
    const product = pick(products);
    if (used.has(product.product_id)) continue;
    used.add(product.product_id);
    orderItems.push({
      order_item_id: orderItems.length + 1,
      order_id: order.order_id,
      product_id: product.product_id,
      quantity: product.category === "Grocery" ? int(1, 5) : int(1, 2),
      unit_price: round2(product.unit_price * (0.95 + rand() * 0.1)),
      discount: pick([0, 0, 0, 0.05, 0.1, 0.15]),
    });
  }
}

// ---- monthly_sales (delivered orders only)
const byKey = new Map();
const productById = new Map(products.map((p) => [p.product_id, p]));
const orderById = new Map(orders.map((o) => [o.order_id, o]));
for (const it of orderItems) {
  const o = orderById.get(it.order_id);
  if (o.status !== "Delivered") continue;
  const cat = productById.get(it.product_id).category;
  const key = `${o.order_date.slice(0, 7)}|${o.region_id}|${cat}`;
  const agg = byKey.get(key) ?? { month: o.order_date.slice(0, 7), region_id: o.region_id, category: cat, revenue: 0, units: 0 };
  agg.revenue += it.quantity * it.unit_price * (1 - it.discount);
  agg.units += it.quantity;
  byKey.set(key, agg);
}
const monthlySales = [...byKey.values()]
  .map((a) => ({ ...a, revenue: round2(a.revenue) }))
  .sort((a, b) => a.month.localeCompare(b.month) || a.region_id - b.region_id || a.category.localeCompare(b.category));

// ---- write
const TABLES = [
  ["regions", "Five sales regions of Bharat Retail.", regions, { region_id: "INTEGER", region_name: "TEXT", head_city: "TEXT" }],
  ["customers", "300 customers. A few names have stray spaces/lowercase and a few cities/emails are missing — on purpose, for cleaning practice.", customers, { customer_id: "INTEGER", full_name: "TEXT", email: "TEXT", city: "TEXT", state: "TEXT", region_id: "INTEGER", segment: "TEXT", signup_date: "TEXT" }],
  ["products", "Product catalogue across five categories. Prices in INR.", products, { product_id: "INTEGER", product_name: "TEXT", category: "TEXT", sub_category: "TEXT", brand: "TEXT", unit_price: "REAL", cost_price: "REAL" }],
  ["employees", "40 employees; department heads have no manager_id. Salary is annual, INR.", employees, { employee_id: "INTEGER", full_name: "TEXT", department: "TEXT", manager_id: "INTEGER", city: "TEXT", hire_date: "TEXT", salary: "INTEGER" }],
  ["orders", "2,500 orders, Jul 2024 – Jun 2026. Oct–Nov (festive season) is busier.", orders, { order_id: "INTEGER", customer_id: "INTEGER", employee_id: "INTEGER", order_date: "TEXT", status: "TEXT", payment_method: "TEXT", region_id: "INTEGER" }],
  ["order_items", "Line items: quantity, price actually charged, and discount (0–0.15).", orderItems, { order_item_id: "INTEGER", order_id: "INTEGER", product_id: "INTEGER", quantity: "INTEGER", unit_price: "REAL", discount: "REAL" }],
  ["monthly_sales", "Delivered revenue and units per month × region × category (net of discount).", monthlySales, { month: "TEXT", region_id: "INTEGER", category: "TEXT", revenue: "REAL", units: "INTEGER" }],
];

const cell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
mkdirSync(OUT, { recursive: true });
const manifest = { tables: [] };
for (const [name, description, rows, types] of TABLES) {
  const cols = Object.keys(types);
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
  writeFileSync(join(OUT, `${name}.csv`), csv);
  manifest.tables.push({ name, file: `${name}.csv`, description, columns: cols.map((c) => ({ name: c, type: types[c] })) });
  console.log(`${name}: ${rows.length} rows`);
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
