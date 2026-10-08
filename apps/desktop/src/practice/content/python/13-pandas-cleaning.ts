import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-13",
  track: "python",
  title: `pandas — cleaning data`,
  body: `Most analysis time goes on cleaning. A few methods cover the basics.

- Text columns: \`.str.strip()\` removes stray spaces, \`.str.title()\` capitalises each word, \`.str.lower()\`.
- Missing values: \`df["city"].isna().sum()\` counts them; \`.fillna("Unknown")\` fills; \`df.dropna(subset=["email"])\` drops rows.
- Duplicates: \`df.duplicated().sum()\` counts; \`df.drop_duplicates()\` removes.
- Types: \`.astype(int)\` or \`pd.to_numeric(col, errors="coerce")\` for numbers stored as text.

Make cleaning steps explicit and in order — you want to be able to re-run them on next month's data.`,
  example: `customers = load("customers")
print(customers["city"].isna().sum(), "missing cities")
customers["full_name"].str.strip().str.title().head()`,
  exercises: [
    {
      id: "py-13-e1",
      prompt: `Clean \`customers['full_name']\` in place: strip stray spaces and make every name Title Case.`,
      starter: `customers = load("customers")
`,
      solution: `customers = load("customers")
customers["full_name"] = customers["full_name"].str.strip().str.title()`,
      tests: `s = customers["full_name"]
assert (s == s.str.strip()).all(), "some names still have stray spaces"
assert s.str.istitle().all(), "some names are not Title Case"`,
    },
    {
      id: "py-13-e2",
      prompt: `Replace missing values in \`customers['city']\` with the text Unknown (in place).`,
      starter: `customers = load("customers")
`,
      solution: `customers = load("customers")
customers["city"] = customers["city"].fillna("Unknown")`,
      tests: `n = conn.execute("SELECT COUNT(*) FROM customers WHERE city IS NULL").fetchone()[0]
assert customers["city"].isna().sum() == 0, "there are still missing cities"
assert (customers["city"] == "Unknown").sum() == n, "the number of Unknown cities should equal the number that were missing"`,
    },
    {
      id: "py-13-e3",
      prompt: `Remove duplicate rows from \`df\` into \`clean\`.`,
      starter: `import pandas as pd
df = pd.DataFrame({"id": [1, 2, 2, 3, 3, 3], "v": ["a", "b", "b", "c", "c", "c"]})
clean = `,
      solution: `import pandas as pd
df = pd.DataFrame({"id": [1, 2, 2, 3, 3, 3], "v": ["a", "b", "b", "c", "c", "c"]})
clean = df.drop_duplicates()`,
      tests: `assert len(clean) == 3, f"expected 3 unique rows, got {len(clean)}"`,
    },
  ],
};
