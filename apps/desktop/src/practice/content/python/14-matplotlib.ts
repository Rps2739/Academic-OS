import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-14",
  track: "python",
  title: `Charts with matplotlib`,
  body: `matplotlib draws the chart; you describe it step by step.

\`\`\`
fig, ax = plt.subplots()
ax.bar(names, values)
ax.set_title("Average price by category")
ax.set_ylabel("₹")
\`\`\`

- \`ax.bar\` (vertical bars), \`ax.barh\` (horizontal), \`ax.plot\` (line), \`ax.scatter\` (dots), \`ax.hist\` (distribution).
- Always set a **title** and label the **axes** with units — a chart without them is unfinished.
- Sort bars so the biggest is first (or last) unless the order means something, like time.
- Charts appear below the code after you run it. Each run starts with a fresh canvas.

Choose the chart for the question: trend → line, comparison → bar, spread → histogram, relationship → scatter.`,
  example: `import matplotlib.pyplot as plt
products = load("products")
avg = products.groupby("category")["unit_price"].mean().sort_values()
fig, ax = plt.subplots()
ax.barh(avg.index, avg.values)
ax.set_title("Average unit price by category")
ax.set_xlabel("₹")`,
  exercises: [
    {
      id: "py-14-e1",
      prompt: `Draw a bar chart of the average unit_price per category (5 bars) and give it a title.`,
      starter: `import matplotlib.pyplot as plt
products = load("products")
avg = products.groupby("category")["unit_price"].mean()
fig, ax = plt.subplots()
`,
      solution: `import matplotlib.pyplot as plt
products = load("products")
avg = products.groupby("category")["unit_price"].mean()
fig, ax = plt.subplots()
ax.bar(avg.index, avg.values)
ax.set_title("Average unit price by category")`,
      tests: `import matplotlib.pyplot as plt
ax = plt.gcf().axes[0]
assert len(ax.patches) == 5, f"expected 5 bars, found {len(ax.patches)}"
assert ax.get_title(), "add a title with ax.set_title(...)"`,
    },
    {
      id: "py-14-e2",
      prompt: `Draw a line chart of total revenue per month from monthly_sales, with a title and a y-axis label.`,
      starter: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
monthly = ms.groupby("month")["revenue"].sum()
fig, ax = plt.subplots()
`,
      solution: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
monthly = ms.groupby("month")["revenue"].sum()
fig, ax = plt.subplots()
ax.plot(monthly.index, monthly.values)
ax.set_title("Monthly delivered revenue")
ax.set_ylabel("Revenue (₹)")`,
      tests: `import matplotlib.pyplot as plt
ax = plt.gcf().axes[0]
assert len(ax.lines) == 1, "draw one line with ax.plot(...)"
assert ax.get_title(), "add a title"
assert ax.get_ylabel(), "label the y-axis with ax.set_ylabel(...)"`,
    },
  ],
};
