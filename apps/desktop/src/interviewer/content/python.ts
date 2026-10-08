import type { CodeQuestion } from "./types";

export const PY_Q: CodeQuestion[] = [
  {
    kind: "code",
    id: "iq-py-01",
    section: "python",
    prompt: "Using load('orders'), create a DataFrame `by_status` with one row per status and a column `orders` holding the count, sorted by orders descending.",
    starter: `orders = load('orders')
by_status = `,
    solution: `orders = load('orders')
by_status = orders.groupby('status').size().reset_index(name='orders').sort_values('orders', ascending=False)`,
    tests: `import pandas as pd
assert isinstance(by_status, pd.DataFrame), "by_status should be a DataFrame"
assert list(by_status.columns) == ["status", "orders"], f"columns should be ['status','orders'], got {list(by_status.columns)}"
assert by_status["orders"].is_monotonic_decreasing, "sort by orders, highest first"
assert int(by_status["orders"].sum()) == len(load('orders')), "counts should add up to all orders"`,
  },
  {
    kind: "code",
    id: "iq-py-02",
    section: "python",
    prompt: "Write `reverse_words(s)` that reverses the order of the words in a sentence: 'data is fun' becomes 'fun is data'. Extra spaces between words should collapse to one.",
    starter: `def reverse_words(s):
    `,
    solution: `def reverse_words(s):
    return ' '.join(reversed(s.split()))`,
    tests: `assert reverse_words("data is fun") == "fun is data"
assert reverse_words("  one   two ") == "two one"
assert reverse_words("single") == "single"
assert reverse_words("") == ""`,
  },
  {
    kind: "code",
    id: "iq-py-03",
    section: "python",
    prompt: "Write `is_palindrome(s)` that returns True if the text reads the same forwards and backwards, ignoring case, spaces and punctuation.",
    starter: `def is_palindrome(s):
    `,
    solution: `def is_palindrome(s):
    t = [c.lower() for c in s if c.isalnum()]
    return t == t[::-1]`,
    tests: `assert is_palindrome("A man, a plan, a canal: Panama") is True
assert is_palindrome("Was it a car or a cat I saw?") is True
assert is_palindrome("hello") is False
assert is_palindrome("") is True`,
  },
  {
    kind: "code",
    id: "iq-py-04",
    section: "python",
    prompt: "Write `fizzbuzz(n)` returning a list for 1..n: 'Fizz' for multiples of 3, 'Buzz' for multiples of 5, 'FizzBuzz' for both, otherwise the number as a string.",
    starter: `def fizzbuzz(n):
    `,
    solution: `def fizzbuzz(n):
    out = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            out.append('FizzBuzz')
        elif i % 3 == 0:
            out.append('Fizz')
        elif i % 5 == 0:
            out.append('Buzz')
        else:
            out.append(str(i))
    return out`,
    tests: `assert fizzbuzz(5) == ["1", "2", "Fizz", "4", "Buzz"]
r = fizzbuzz(15)
assert r[14] == "FizzBuzz" and r[2] == "Fizz" and r[9] == "Buzz"
assert fizzbuzz(0) == []`,
  },
  {
    kind: "code",
    id: "iq-py-05",
    section: "python",
    prompt: "Write `char_freq(s)` returning a dict of how many times each character appears (case-sensitive, spaces ignored).",
    starter: `def char_freq(s):
    `,
    solution: `def char_freq(s):
    d = {}
    for c in s:
        if c != ' ':
            d[c] = d.get(c, 0) + 1
    return d`,
    tests: `assert char_freq("aab b") == {"a": 2, "b": 2}
assert char_freq("Aa") == {"A": 1, "a": 1}
assert char_freq("") == {}`,
  },
  {
    kind: "code",
    id: "iq-py-06",
    section: "python",
    prompt: "Write `flatten(nested)` that turns an arbitrarily nested list such as [1, [2, [3, 4]], 5] into the flat list [1, 2, 3, 4, 5].",
    starter: `def flatten(nested):
    `,
    solution: `def flatten(nested):
    out = []
    for x in nested:
        if isinstance(x, list):
            out.extend(flatten(x))
        else:
            out.append(x)
    return out`,
    tests: `assert flatten([1, [2, [3, 4]], 5]) == [1, 2, 3, 4, 5]
assert flatten([]) == []
assert flatten([[], [[]], 7]) == [7]
assert flatten([["a"], "b"]) == ["a", "b"]`,
  },
  {
    kind: "code",
    id: "iq-py-07",
    section: "python",
    prompt: "Write `two_sum(nums, target)` returning the indices [i, j] (i < j) of the two numbers that add up to target. Assume exactly one solution exists. Aim for a single pass.",
    starter: `def two_sum(nums, target):
    `,
    solution: `def two_sum(nums, target):
    seen = {}
    for j, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], j]
        seen[x] = j`,
    tests: `assert two_sum([2, 7, 11, 15], 9) == [0, 1]
assert two_sum([3, 2, 4], 6) == [1, 2]
assert two_sum([3, 3], 6) == [0, 1]`,
  },
  {
    kind: "code",
    id: "iq-py-08",
    section: "python",
    prompt: "Write `dedupe(seq)` that removes duplicates from a list while keeping the first occurrence of each item in its original order.",
    starter: `def dedupe(seq):
    `,
    solution: `def dedupe(seq):
    seen = set()
    out = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out`,
    tests: `assert dedupe([3, 1, 3, 2, 1]) == [3, 1, 2]
assert dedupe([]) == []
assert dedupe(["b", "a", "b"]) == ["b", "a"]`,
  },
  {
    kind: "code",
    id: "iq-py-09",
    section: "python",
    prompt: "Write `valid_pin(s)` that returns True only for a valid Indian PIN code: exactly 6 digits and not starting with 0.",
    starter: `def valid_pin(s):
    `,
    solution: `def valid_pin(s):
    return len(s) == 6 and s.isdigit() and s[0] != '0'`,
    tests: `assert valid_pin("560001") is True
assert valid_pin("060001") is False
assert valid_pin("56001") is False
assert valid_pin("5600011") is False
assert valid_pin("56000a") is False`,
  },
  {
    kind: "code",
    id: "iq-py-10",
    section: "python",
    prompt: "Create a DataFrame `region_rev` with columns region_name and revenue: delivered revenue per region (quantity × unit_price × (1 − discount) for order lines of Delivered orders), sorted by revenue descending. Use load('orders'), load('order_items') and load('regions').",
    starter: `orders = load('orders')
items = load('order_items')
regions = load('regions')
region_rev = `,
    solution: `orders = load('orders')
items = load('order_items')
regions = load('regions')
d = orders[orders['status'] == 'Delivered'].merge(items, on='order_id').merge(regions, on='region_id')
d['revenue'] = d['quantity'] * d['unit_price'] * (1 - d['discount'])
region_rev = d.groupby('region_name', as_index=False)['revenue'].sum().sort_values('revenue', ascending=False)`,
    tests: `import pandas as pd
assert list(region_rev.columns) == ["region_name", "revenue"], list(region_rev.columns)
assert len(region_rev) == 5, "one row per region"
assert region_rev["revenue"].is_monotonic_decreasing, "sort by revenue, highest first"
o, i = load("orders"), load("order_items")
ids = set(o.loc[o["status"] == "Delivered", "order_id"])
tot = sum(q * p * (1 - dsc) for oid, q, p, dsc in zip(i["order_id"], i["quantity"], i["unit_price"], i["discount"]) if oid in ids)
assert abs(region_rev["revenue"].sum() - tot) < 1, "revenue total does not match"`,
  },
  {
    kind: "code",
    id: "iq-py-11",
    section: "python",
    prompt: "Create `top5`, a DataFrame with the five customers who spent most on Delivered orders (same revenue definition), with columns customer_id and spend, highest first.",
    starter: `orders = load('orders')
items = load('order_items')
top5 = `,
    solution: `orders = load('orders')
items = load('order_items')
d = orders[orders['status'] == 'Delivered'].merge(items, on='order_id')
d['spend'] = d['quantity'] * d['unit_price'] * (1 - d['discount'])
top5 = d.groupby('customer_id', as_index=False)['spend'].sum().sort_values('spend', ascending=False).head(5)`,
    tests: `assert list(top5.columns) == ["customer_id", "spend"], list(top5.columns)
assert len(top5) == 5
assert top5["spend"].is_monotonic_decreasing
o, i = load("orders"), load("order_items")
d = o[o["status"] == "Delivered"].merge(i, on="order_id")
d["s"] = d["quantity"] * d["unit_price"] * (1 - d["discount"])
best = d.groupby("customer_id")["s"].sum().idxmax()
assert int(top5.iloc[0]["customer_id"]) == int(best), "the biggest spender should be first"`,
  },
  {
    kind: "code",
    id: "iq-py-12",
    section: "python",
    prompt: "Some customers have a missing city. Create `cust` (a copy of load('customers')) where missing cities are filled with 'Unknown', and `unknown_count`, the number of customers whose city is 'Unknown' after filling.",
    starter: `cust = load('customers')
unknown_count = `,
    solution: `import pandas as pd
cust = load('customers').copy()
cust['city'] = cust['city'].replace('', pd.NA).fillna('Unknown')
unknown_count = int((cust['city'] == 'Unknown').sum())`,
    tests: `raw = load("customers")
expected = int(raw["city"].isna().sum() + (raw["city"].astype(str).str.strip() == "").sum())
assert cust["city"].isna().sum() == 0, "no missing cities should remain"
assert unknown_count == (cust["city"] == "Unknown").sum(), "unknown_count should match the filled rows"
assert unknown_count >= expected, f"expected at least {expected} Unknown cities"`,
  },
  {
    kind: "code",
    id: "iq-py-13",
    section: "python",
    prompt: "Create `monthly`, a DataFrame with columns month (text like '2025-03') and orders, giving the number of orders per month in date order. Convert order_date with pd.to_datetime.",
    starter: `import pandas as pd
orders = load('orders')
monthly = `,
    solution: `import pandas as pd
orders = load('orders')
orders['order_date'] = pd.to_datetime(orders['order_date'])
monthly = orders.groupby(orders['order_date'].dt.strftime('%Y-%m')).size().reset_index(name='orders')
monthly.columns = ['month', 'orders']`,
    tests: `assert list(monthly.columns) == ["month", "orders"], list(monthly.columns)
assert monthly["month"].is_monotonic_increasing, "months should be in date order"
assert monthly["month"].iloc[0] == "2024-07" and monthly["month"].iloc[-1] == "2026-06"
assert int(monthly["orders"].sum()) == len(load("orders"))`,
  },
  {
    kind: "code",
    id: "iq-py-14",
    section: "python",
    prompt: "Merge order_items with products and compute `margin_pct`: overall margin percentage on all order lines = (revenue − cost) / revenue × 100, where revenue = quantity × order-line unit_price × (1 − discount) and cost = quantity × products.cost_price. Round to 2 decimals.",
    starter: `items = load('order_items')
products = load('products')
margin_pct = `,
    solution: `items = load('order_items')
products = load('products')
d = items.merge(products[['product_id', 'cost_price']], on='product_id')
rev = (d['quantity'] * d['unit_price'] * (1 - d['discount'])).sum()
cost = (d['quantity'] * d['cost_price']).sum()
margin_pct = round((rev - cost) / rev * 100, 2)`,
    tests: `i, p = load("order_items"), load("products")
cp = dict(zip(p["product_id"], p["cost_price"]))
rev = cost = 0.0
for pid, q, up, dsc in zip(i["product_id"], i["quantity"], i["unit_price"], i["discount"]):
    rev += q * up * (1 - dsc)
    cost += q * cp[pid]
assert abs(margin_pct - round((rev - cost) / rev * 100, 2)) < 0.01, f"expected about {round((rev - cost) / rev * 100, 2)}"`,
  },
  {
    kind: "code",
    id: "iq-py-15",
    section: "python",
    prompt: "Build a pivot table `pv` of total monthly_sales revenue with region names as the index, categories as the columns, and summed revenue as the values. (Use load('monthly_sales') and load('regions').)",
    starter: `ms = load('monthly_sales')
regions = load('regions')
pv = `,
    solution: `ms = load('monthly_sales')
regions = load('regions')
pv = ms.merge(regions, on='region_id').pivot_table(index='region_name', columns='category', values='revenue', aggfunc='sum')`,
    tests: `assert pv.index.name == "region_name", pv.index.name
assert pv.shape[0] == 5, "five regions"
assert "Electronics" in pv.columns
assert abs(pv.sum().sum() - load("monthly_sales")["revenue"].sum()) < 1, "totals should match"`,
  },
  {
    kind: "code",
    id: "iq-py-16",
    section: "python",
    prompt: "Add a column `rank_in_dept` to a copy of load('employees') called `emp`, ranking each employee's salary within their department, 1 = highest salary (ties share the lowest rank number, method='min').",
    starter: `emp = load('employees').copy()
`,
    solution: `emp = load('employees').copy()
emp['rank_in_dept'] = emp.groupby('department')['salary'].rank(ascending=False, method='min').astype(int)`,
    tests: `assert "rank_in_dept" in emp.columns
top = emp[emp["rank_in_dept"] == 1]
assert set(top["department"]) == set(emp["department"]), "every department needs a rank 1"
for dept, g in emp.groupby("department"):
    assert g.loc[g["salary"].idxmax(), "rank_in_dept"] == 1, dept`,
  },
  {
    kind: "code",
    id: "iq-py-17",
    section: "python",
    prompt: "Compute `cancel_pct`: the percentage of orders with status 'Cancelled', rounded to 2 decimals.",
    starter: `orders = load('orders')
cancel_pct = `,
    solution: `orders = load('orders')
cancel_pct = round((orders['status'] == 'Cancelled').mean() * 100, 2)`,
    tests: `o = load("orders")
exp = round(100 * sum(1 for s in o["status"] if s == "Cancelled") / len(o), 2)
assert abs(cancel_pct - exp) < 0.01, f"expected {exp}"`,
  },
  {
    kind: "code",
    id: "iq-py-18",
    section: "python",
    prompt: "Write `normalize(arr)` using numpy that rescales an array to the range 0 to 1: (x − min) / (max − min). If all values are equal, return an array of zeros.",
    starter: `import numpy as np

def normalize(arr):
    `,
    solution: `import numpy as np

def normalize(arr):
    a = np.asarray(arr, dtype=float)
    span = a.max() - a.min()
    if span == 0:
        return np.zeros_like(a)
    return (a - a.min()) / span`,
    tests: `import numpy as np
r = normalize([10, 20, 30])
assert np.allclose(r, [0, 0.5, 1]), r
assert np.allclose(normalize([5, 5, 5]), [0, 0, 0])
assert np.allclose(normalize(np.array([-1.0, 1.0])), [0, 1])`,
  },
  {
    kind: "code",
    id: "iq-py-19",
    section: "python",
    prompt: "Write `moving_average(values, k)` returning a list of the average of each window of k consecutive values (length len(values) − k + 1).",
    starter: `def moving_average(values, k):
    `,
    solution: `def moving_average(values, k):
    return [sum(values[i:i + k]) / k for i in range(len(values) - k + 1)]`,
    tests: `assert moving_average([1, 2, 3, 4, 5], 3) == [2.0, 3.0, 4.0]
assert moving_average([4, 6], 2) == [5.0]
assert moving_average([1, 2], 3) == []`,
  },
  {
    kind: "code",
    id: "iq-py-20",
    section: "python",
    prompt: "Write `group_anagrams(words)` returning a list of groups (lists) where each group contains words that are anagrams of each other.",
    starter: `def group_anagrams(words):
    `,
    solution: `def group_anagrams(words):
    groups = {}
    for w in words:
        groups.setdefault(''.join(sorted(w)), []).append(w)
    return list(groups.values())`,
    tests: `r = group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"])
norm = sorted(sorted(g) for g in r)
assert norm == [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]], norm
assert group_anagrams([]) == []`,
  },
  {
    kind: "code",
    id: "iq-py-21",
    section: "python",
    prompt: "Create `clean_names`: the full_name column of load('customers') with leading/trailing spaces removed and each name in Title Case (e.g. '  deepak bose ' becomes 'Deepak Bose').",
    starter: `cust = load('customers')
clean_names = `,
    solution: `cust = load('customers')
clean_names = cust['full_name'].str.strip().str.title()`,
    tests: `assert len(clean_names) == len(load("customers"))
assert all(n == n.strip() for n in clean_names), "still has spaces at the ends"
assert all(n == n.title() for n in clean_names), "not all Title Case"`,
  },
];
