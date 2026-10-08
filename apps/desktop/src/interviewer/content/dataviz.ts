import type { SelfQuestion, VizQuestion } from "./types";

export const DATAVIZ: (SelfQuestion | VizQuestion)[] = [
  {
    kind: "self",
    id: "dv-01",
    section: "dataviz",
    prompt: "A regional head wants to see how monthly revenue has moved over the last 24 months for each of 5 regions. Which chart, and why?",
    keyPoints: ["Line chart (time on x-axis, revenue on y)", "One line per region, max ~5 lines, direct labels or a clear legend", "Consistent y-axis starting point / no misleading truncation", "Highlight the region or period that matters to the head", "Mention an alternative (small multiples) if lines overlap"],
    modelAnswer: "A line chart with months on the x-axis and revenue on the y-axis, one line per region. Five lines is readable; I'd label each line at its end instead of a legend and use one accent colour for the region the head cares most about, greying the rest. If the lines tangle, I'd switch to small multiples — five mini line charts sharing the same y-axis — so each region's trend is clear and still comparable.",
    mistakes: ["Pie or bar chart for a trend over time", "Separate y-axes per region that hide scale differences", "Rainbow colours with a far-away legend"],
  },
  {
    kind: "self",
    id: "dv-03",
    section: "dataviz",
    prompt: "Pie vs bar: which would you use to show each category's share of sales?",
    keyPoints: ["Bar chart is usually better for comparing shares", "Pie only works for 2–4 parts that add to a whole", "Human eyes compare lengths better than angles", "Sort bars; label values directly", "Mention a stacked 100% bar or treemap as alternatives"],
    modelAnswer: "For comparing categories, I'd use a sorted horizontal bar chart: people compare lengths accurately, but compare angles and areas poorly. A pie is acceptable only when there are two to four parts and the point is 'this is about half'. If I need part-to-whole across several groups, a 100% stacked bar works. I'd label the values directly and sort from biggest to smallest.",
    mistakes: ["Defending a pie for eight categories", "Unsorted bars", "3-D effects", "Too many colours"],
  },
  {
    kind: "self",
    id: "dv-04",
    section: "dataviz",
    prompt: "What is wrong with a pie chart that has twelve slices?",
    keyPoints: ["Too many slices to compare", "Small slices are unreadable and colours repeat", "Legend lookup makes the reader work", "Can't see order or small differences", "Better: sorted bar, or group small items into 'Other'"],
    modelAnswer: "Twelve slices defeat the purpose of a pie. The reader can't tell similar slices apart, the colours start repeating, and the legend forces constant look-up. Small slices are almost invisible. I'd switch to a sorted bar chart with direct labels, or keep the top five and group the rest as 'Other'.",
    mistakes: ["Adding more colours to fix it", "Using exploded or 3-D pies", "Keeping the legend as the only labels"],
  },
  {
    kind: "self",
    id: "dv-05",
    section: "dataviz",
    prompt: "When would you use a histogram instead of a bar chart?",
    keyPoints: ["Histogram = distribution of one numeric variable in bins", "Bar chart = comparing categories", "Bars touch in a histogram because the x-axis is continuous", "Bin width matters and can change the story", "Example: salary distribution vs revenue by region"],
    modelAnswer: "A histogram shows how a single numeric variable is distributed — for example, how many employees fall into each salary band. The x-axis is continuous, so the bars touch. A bar chart compares separate categories such as revenue by region, with gaps between bars. For a histogram I'd try a few bin widths, since too wide hides the shape and too narrow adds noise.",
    mistakes: ["Calling both 'bar charts'", "Using a histogram for categories", "Not thinking about bin width", "Leaving bins unlabeled"],
  },
  {
    kind: "self",
    id: "dv-06",
    section: "dataviz",
    prompt: "How would you show the relationship between price and quantity sold?",
    keyPoints: ["Scatter plot with price on x, quantity on y", "Consider log scale or transparency for overplotting", "Add a trend line, but warn about correlation vs causation", "Colour or facet by category if needed", "Mention correlation coefficient with caution"],
    modelAnswer: "A scatter plot, price on the x-axis and quantity on the y-axis, one point per product or per order line. If there are many points, I'd use transparency or hexbin to avoid overplotting, and a log scale if prices vary widely. A trend line helps, and I'd colour by category to see if the pattern differs. I'd be careful to say correlation isn't causation: other factors, like seasonality or promotions, could be driving both.",
    mistakes: ["A line chart for unordered points", "No mention of overplotting", "Claiming price causes the change", "Dual axes"],
  },
  {
    kind: "self",
    id: "dv-07",
    section: "dataviz",
    prompt: "A chart has a truncated y-axis starting at 95 instead of 0. Is that misleading or acceptable?",
    keyPoints: ["Bar charts must start at zero because length encodes value", "Line charts can truncate if the change itself is the point", "Truncation exaggerates differences", "Label the axis clearly or show a break", "Ask what decision the viewer must make"],
    modelAnswer: "It depends on the chart type. For bars, the length of the bar represents the value, so a truncated axis exaggerates differences and is misleading; start at zero. For a line chart where the question is about small changes — say a share moving between 95% and 99% — a truncated axis can be fine if it is clearly labelled, because position, not length, encodes the value. In either case I'd make the axis range obvious and avoid using it to make a trivial change look dramatic.",
    mistakes: ["Saying 'always start at zero' without nuance", "Saying 'never mind the axis'", "Not labeling the axis", "Using truncation to dramatise"],
  },
  {
    kind: "self",
    id: "dv-08",
    section: "dataviz",
    prompt: "When do dual-axis charts mislead?",
    keyPoints: ["Two scales can be set to imply a relationship", "Different units invite false correlation", "Viewers read crossing lines as meaning", "Alternative: two stacked panels with a shared x-axis", "If used, label axes with colours and keep zero baselines"],
    modelAnswer: "A dual-axis chart lets the author pick two scales independently, so any two lines can be made to look correlated or to cross at a meaningful-looking point. That invites false conclusions. I prefer two small charts stacked with the same x-axis, so the reader can compare timing without scale tricks. If a dual axis is truly needed, I'd colour-code each axis to its series and keep both baselines honest.",
    mistakes: ["Using dual axes by default", "Not labeling which axis belongs to which series", "Implying causation from crossing lines"],
  },
  {
    kind: "self",
    id: "dv-09",
    section: "dataviz",
    prompt: "How do you choose colours so the chart works for colour-blind readers?",
    keyPoints: ["Avoid red–green as the only distinction", "Use colour-blind-safe palettes (blue/orange, viridis)", "Add a second cue: labels, shape, pattern, position", "Check contrast against the background", "Test with a simulator"],
    modelAnswer: "About 1 in 12 men have some colour-vision deficiency, so red versus green alone fails. I use a blue–orange pair or a perceptually uniform palette such as viridis, and I add a second cue: direct labels, different markers or line styles, or position. I also check contrast against the background and preview the chart with a colour-blind simulator. Colour should highlight, not carry all the information.",
    mistakes: ["Red/green traffic lights only", "Too many colours", "Low contrast text", "Assuming everyone sees colour the same"],
  },
  {
    kind: "self",
    id: "dv-10",
    section: "dataviz",
    prompt: "How would you show the distribution of salaries across regions?",
    keyPoints: ["Box plot or violin plot per region", "Shows median, spread and outliers", "Alternative: ridgeline or overlapping histograms", "Sort by median", "Label n per group"],
    modelAnswer: "A box plot per region, sorted by median salary, shows the median, the spread and the outliers in one compact view. If the shape matters, a violin plot or a strip plot overlaid with the box helps. I'd put the region on the x-axis, salary on the y-axis, and mention the number of people in each group so no one reads too much into a tiny group.",
    mistakes: ["A bar chart of averages hiding the spread", "Pie chart", "Unsorted categories", "Ignoring group sizes"],
  },
  {
    kind: "self",
    id: "dv-11",
    section: "dataviz",
    prompt: "How would you show target vs actual performance?",
    keyPoints: ["Bullet chart or bar with a target marker", "Variance shown explicitly (colour for ahead/behind)", "Consistent scale across items", "Avoid gauges/speedometers", "Add the time trend if needed"],
    modelAnswer: "A bullet chart: a bar for the actual, a line marker for the target, and shaded bands for poor/ok/good ranges. For many items, a bar chart with a target line and a variance column works well. I avoid gauges — they waste space and show a single number. I'd colour only the exceptions, and keep the same scale across items so they can be compared.",
    mistakes: ["Gauge or speedometer charts", "Different scales per item", "Colour used on every bar", "No variance number"],
  },
  {
    kind: "self",
    id: "dv-12",
    section: "dataviz",
    prompt: "How would you lay out a dashboard for a CXO?",
    keyPoints: ["Most important KPIs at top-left (reading pattern: F / Z)", "3–5 KPIs, each with a comparison", "Progressive detail: summary → drill-down", "Consistent colours and alignment", "Whitespace and no clutter; one message per visual"],
    modelAnswer: "Executives read top-left first, then scan across and down. So the headline KPIs go top-left with a comparison (target, last year), followed by two or three supporting charts that explain the 'why', and detail on a drill-through page. I'd keep a consistent colour for a metric across the page, limit the number of visuals, leave whitespace, and give every chart a title that states the message, such as 'Delivered revenue is 8% below target in the West'.",
    mistakes: ["Twenty KPIs", "Decorative visuals", "Different colours for the same metric", "No comparison or context"],
  },
  {
    kind: "self",
    id: "dv-13",
    section: "dataviz",
    prompt: "How do you turn a chart into a headline for storytelling?",
    keyPoints: ["Title states the insight, not just the topic", "Highlight the key data point and grey the rest", "Annotate the change or event", "Keep one message per chart", "End with the implication or action"],
    modelAnswer: "I replace a topic title like 'Monthly revenue' with the insight: 'Revenue fell 12% after the July price rise'. Then I highlight the relevant data point in a strong colour, grey everything else, and add a short annotation marking the event. One chart, one message. Finally I add the so-what: what the audience should do or decide next.",
    mistakes: ["Descriptive titles only", "Highlighting everything", "No annotation of events", "Explaining the chart but not the implication"],
  },
  {
    kind: "self",
    id: "dv-14",
    section: "dataviz",
    prompt: "Heatmap vs table for a region × month view — how do you choose?",
    keyPoints: ["Heatmap shows patterns and outliers quickly", "Table supports exact lookup", "Colour scale: sequential for magnitude, diverging for above/below a midpoint", "Show values in cells if the matrix is small", "Sort rows/columns meaningfully"],
    modelAnswer: "If the audience wants to spot patterns — which regions are weak in which months — a heatmap does it at a glance, using a sequential colour scale (or a diverging one around a target). If they need exact numbers to copy, a table is better. A good compromise is a table with conditional colour and the values still visible. I'd sort regions by total so the pattern is easier to see.",
    mistakes: ["Rainbow scales", "Heatmap with no legend", "No values when precision is needed", "Unsorted rows"],
  },
  {
    kind: "self",
    id: "dv-15",
    section: "dataviz",
    prompt: "A dashboard has 25 KPIs. How do you cut it down?",
    keyPoints: ["Start from the decisions the audience makes", "Group by theme and rank by importance", "Keep a handful of top-level KPIs, put the rest in drill-through", "Remove duplicates and vanity metrics", "Test with the users"],
    modelAnswer: "I'd ask what decisions this audience takes and which KPIs change those decisions. I'd group the 25 into themes — sales, margin, customers, operations — and keep one or two headline KPIs per theme on the front page. The others move to drill-through pages or a detail table. I'd drop vanity metrics and duplicates, then test the new design with a few users to check they find what they need quickly.",
    mistakes: ["Keeping everything for 'completeness'", "Cutting by what is easy to build", "No user test", "Leaving related metrics scattered"],
  },
  {
    kind: "viz",
    id: "dv-02",
    section: "dataviz",
    prompt: "Recreate this chart: total delivered revenue by product category, as a horizontal bar chart sorted from highest to lowest, with a title and axis label.",
    referenceCode: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
rev = ms.groupby("category")["revenue"].sum().sort_values()
fig, ax = plt.subplots(figsize=(7, 3.5))
ax.barh(rev.index, rev.values / 1e7, color="#4c72b0")
ax.set_title("Delivered revenue by category (Jul 2024 – Jun 2026)")
ax.set_xlabel("Revenue (₹ crore)")
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
`,
    checklist: ["Horizontal bars, one per category", "Sorted so the biggest category is at the top", "Correct aggregation (sum of revenue per category)", "Readable units (₹ crore or lakh), labelled axis", "Clear title; no 3D, no rainbow colours"],
  },
  {
    kind: "viz",
    id: "dv-16",
    section: "dataviz",
    prompt: "Recreate this chart: total monthly revenue as a line chart across all regions and categories, with the months on the x-axis.",
    referenceCode: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
m = ms.groupby("month")["revenue"].sum()
fig, ax = plt.subplots(figsize=(8, 3.5))
ax.plot(m.index, m.values / 1e7, marker="o", color="#4c72b0")
ax.set_title("Monthly revenue, all regions")
ax.set_ylabel("Revenue (₹ crore)")
ax.set_xticks(range(0, len(m), 3))
ax.set_xticklabels(m.index[::3], rotation=45, ha="right")
ax.grid(axis="y", alpha=0.3)
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
ms = load("monthly_sales")
`,
    checklist: ["Line chart with months in time order on the x-axis", "Revenue aggregated across regions and categories", "Readable x labels (rotated or thinned)", "Y-axis labelled with units", "Title says what is shown"],
  },
  {
    kind: "viz",
    id: "dv-17",
    section: "dataviz",
    prompt: "Recreate this chart: number of orders by payment method, as a bar chart sorted from highest to lowest.",
    referenceCode: `import matplotlib.pyplot as plt
orders = load("orders")
c = orders["payment_method"].value_counts()
fig, ax = plt.subplots(figsize=(6, 3.5))
ax.bar(c.index, c.values, color="#55a868")
ax.set_title("Orders by payment method")
ax.set_ylabel("Orders")
for i, v in enumerate(c.values):
    ax.text(i, v, str(v), ha="center", va="bottom", fontsize=8)
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
orders = load("orders")
`,
    checklist: ["One bar per payment method", "Sorted from highest to lowest", "Counts are correct (one row = one order)", "Value labels or a clear y-axis", "Title and axis label present"],
  },
  {
    kind: "viz",
    id: "dv-18",
    section: "dataviz",
    prompt: "Recreate this chart: a histogram of employee salaries, in lakh rupees, with about 10 bins.",
    referenceCode: `import matplotlib.pyplot as plt
emp = load("employees")
fig, ax = plt.subplots(figsize=(6, 3.5))
ax.hist(emp["salary"] / 1e5, bins=10, color="#8172b2", edgecolor="white")
ax.set_title("Salary distribution")
ax.set_xlabel("Salary (₹ lakh)")
ax.set_ylabel("Employees")
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
emp = load("employees")
`,
    checklist: ["Histogram (touching bars), not a bar chart", "About 10 bins", "Salary converted to lakh with a labelled x-axis", "Y-axis shows count of employees", "Title present"],
  },
  {
    kind: "viz",
    id: "dv-19",
    section: "dataviz",
    prompt: "Recreate this chart: a heatmap of total revenue by region (rows) and category (columns), using seaborn.",
    referenceCode: `import matplotlib.pyplot as plt
import seaborn as sns
ms = load("monthly_sales")
reg = load("regions")
d = ms.merge(reg, on="region_id")
pv = (d.pivot_table(index="region_name", columns="category", values="revenue", aggfunc="sum") / 1e7).round(1)
fig, ax = plt.subplots(figsize=(8, 3.8))
sns.heatmap(pv, annot=True, fmt=".1f", cmap="Blues", ax=ax, cbar_kws={"label": "₹ crore"})
ax.set_title("Revenue by region and category")
ax.set_xlabel("")
ax.set_ylabel("")
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
import seaborn as sns
ms = load("monthly_sales")
reg = load("regions")
`,
    checklist: ["Region names (not ids) on the rows, categories on the columns", "Values are the sum of revenue", "Sequential colour scale with a legend", "Values written in the cells or clearly readable", "Title and tidy axis labels"],
  },
  {
    kind: "viz",
    id: "dv-20",
    section: "dataviz",
    prompt: "Recreate this chart: scatter plot of unit_price (x) against quantity per order line (y). Join order_items with products to use the product list price if you prefer, but plain order_items is fine.",
    referenceCode: `import matplotlib.pyplot as plt
oi = load("order_items")
fig, ax = plt.subplots(figsize=(6.5, 3.8))
ax.scatter(oi["unit_price"], oi["quantity"], alpha=0.3, s=12, color="#c44e52")
ax.set_xscale("log")
ax.set_title("Price vs quantity per order line")
ax.set_xlabel("Unit price (₹, log scale)")
ax.set_ylabel("Quantity")
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
oi = load("order_items")
`,
    checklist: ["Scatter with price on x and quantity on y", "Transparency to handle overlapping points", "Log scale or another way to handle the wide price range", "Axes labelled with units", "Title present"],
  },
  {
    kind: "viz",
    id: "dv-21",
    section: "dataviz",
    prompt: "Recreate this chart: a seaborn box plot of salary by department.",
    referenceCode: `import matplotlib.pyplot as plt
import seaborn as sns
emp = load("employees")
order = emp.groupby("department")["salary"].median().sort_values(ascending=False).index
fig, ax = plt.subplots(figsize=(7, 3.8))
sns.boxplot(data=emp, x="department", y="salary", order=order, ax=ax, color="#9ecae1")
ax.set_title("Salary by department (sorted by median)")
ax.set_ylabel("Salary (₹)")
ax.set_xlabel("")
fig.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
import seaborn as sns
emp = load("employees")
`,
    checklist: ["One box per department", "Departments sorted by median salary", "Y-axis shows salary with a unit", "Readable labels, no overlap", "Title present"],
  },
  {
    kind: "viz",
    id: "dv-22",
    section: "dataviz",
    prompt: "Recreate this chart: stacked bar of order status counts for each region (region names on the x-axis).",
    referenceCode: `import matplotlib.pyplot as plt
orders = load("orders")
reg = load("regions")
d = orders.merge(reg, on="region_id")
ct = d.groupby(["region_name", "status"]).size().unstack(fill_value=0)
ax = ct.plot(kind="bar", stacked=True, figsize=(7.5, 3.8), colormap="tab20c")
ax.set_title("Order status by region")
ax.set_ylabel("Orders")
ax.set_xlabel("")
ax.legend(title="Status", bbox_to_anchor=(1.02, 1), loc="upper left")
plt.xticks(rotation=0)
plt.tight_layout()`,
    starter: `import matplotlib.pyplot as plt
orders = load("orders")
reg = load("regions")
`,
    checklist: ["Stacked bars, one per region", "Segments are order status counts", "Region names on the x-axis", "Legend identifies the statuses", "Title and axis labels present"],
  },
];
