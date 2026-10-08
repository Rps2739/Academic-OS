import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-15",
  track: "python",
  title: `Charts with seaborn`,
  body: `seaborn sits on top of matplotlib and makes good-looking statistical charts from a DataFrame in one line.

\`sns.barplot(data=products, x="category", y="unit_price")\` — averages \`y\` for each \`x\` and draws bars with error lines.

- Pass the table with \`data=\` and column *names* for \`x\`, \`y\`, and \`hue\` (colour by another column).
- \`sns.histplot(data=df, x="salary", bins=10)\` shows a distribution; \`sns.boxplot\` shows spread and outliers; \`sns.heatmap(pivot)\` colours a grid.
- Since it draws with matplotlib, \`plt.title(...)\` and \`ax.set_xlabel(...)\` still work.
- \`sns.set_theme()\` gives a clean default style.

Use seaborn to explore quickly, matplotlib when you need fine control.`,
  example: `import seaborn as sns
import matplotlib.pyplot as plt
employees = load("employees")
sns.histplot(data=employees, x="salary", bins=10)
plt.title("Salary distribution")`,
  exercises: [
    {
      id: "py-15-e1",
      prompt: `With seaborn, draw a bar plot of unit_price by category from products, with a title.`,
      starter: `import seaborn as sns
import matplotlib.pyplot as plt
products = load("products")
`,
      solution: `import seaborn as sns
import matplotlib.pyplot as plt
products = load("products")
sns.barplot(data=products, x="category", y="unit_price")
plt.title("Average unit price by category")`,
      tests: `import matplotlib.pyplot as plt
ax = plt.gcf().axes[0]
assert len(ax.patches) >= 5, "expected at least 5 bars"
assert ax.get_title(), "add a title with plt.title(...)"`,
    },
    {
      id: "py-15-e2",
      prompt: `Draw a histogram of employee salary with 8 bins using sns.histplot.`,
      starter: `import seaborn as sns
import matplotlib.pyplot as plt
employees = load("employees")
`,
      solution: `import seaborn as sns
import matplotlib.pyplot as plt
employees = load("employees")
sns.histplot(data=employees, x="salary", bins=8)`,
      tests: `import matplotlib.pyplot as plt
ax = plt.gcf().axes[0]
assert len(ax.patches) >= 5, "a histogram with 8 bins should draw several bars"`,
    },
  ],
};
