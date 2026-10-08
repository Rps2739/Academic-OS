import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-18",
  track: "python",
  title: `Statistics with scipy`,
  body: `scipy.stats answers "is this difference real or just noise?".

- **t-test**: \`stats.ttest_ind(a, b, equal_var=False)\` compares the averages of two groups. It returns a statistic and a **p-value**.
- **p-value**: the chance of seeing a difference this big if there were really none. Small (conventionally below 0.05) suggests the difference is unlikely to be pure luck. It does **not** tell you the difference is large or important.
- **Correlation**: \`stats.pearsonr(x, y)\` gives r between −1 and 1 — how tightly two numbers move together. Correlation is not causation.

Always report the size of the effect (the averages, or r) alongside the p-value.`,
  example: `from scipy import stats
items = load("order_items")
items["revenue"] = items["quantity"] * items["unit_price"] * (1 - items["discount"])
r, p = stats.pearsonr(items["unit_price"], items["quantity"])
round(r, 3), round(p, 3)`,
  exercises: [
    {
      id: "py-18-e1",
      prompt: `Run Welch's t-test (equal_var=False) comparing \`a\` and \`b\`, and store the p-value in \`p_value\`.`,
      starter: `from scipy import stats
items = load("order_items")
products = load("products")
m = items.merge(products[["product_id", "category"]], on="product_id")
m["revenue"] = m["quantity"] * m["unit_price"] * (1 - m["discount"])
a = m[m["category"] == "Electronics"]["revenue"]
b = m[m["category"] == "Fashion"]["revenue"]
`,
      solution: `from scipy import stats
items = load("order_items")
products = load("products")
m = items.merge(products[["product_id", "category"]], on="product_id")
m["revenue"] = m["quantity"] * m["unit_price"] * (1 - m["discount"])
a = m[m["category"] == "Electronics"]["revenue"]
b = m[m["category"] == "Fashion"]["revenue"]
p_value = stats.ttest_ind(a, b, equal_var=False).pvalue`,
      tests: `assert 0 <= p_value <= 1, "a p-value is between 0 and 1"
assert abs(p_value - stats.ttest_ind(a, b, equal_var=False).pvalue) < 1e-9, "use equal_var=False (Welch)"`,
    },
    {
      id: "py-18-e2",
      prompt: `Compute the Pearson correlation between order_items unit_price and quantity and store it in \`r\`.`,
      starter: `from scipy import stats
items = load("order_items")
`,
      solution: `from scipy import stats
items = load("order_items")
r, _ = stats.pearsonr(items["unit_price"], items["quantity"])`,
      tests: `import numpy as np
assert -1 <= r <= 1, "r is between -1 and 1"
assert abs(r - np.corrcoef(items["unit_price"], items["quantity"])[0, 1]) < 1e-9, "r should be the Pearson correlation"`,
    },
  ],
};
