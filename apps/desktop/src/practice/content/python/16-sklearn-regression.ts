import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-16",
  track: "python",
  title: `scikit-learn — linear regression`,
  body: `scikit-learn trains models with the same four steps every time.

1. Split data into training and test sets: \`train_test_split(X, y, test_size=0.25, random_state=0)\` — the test set is kept hidden to check honestly how the model does on new data.
2. Create the model: \`LinearRegression()\`.
3. Train it: \`model.fit(X_train, y_train)\`.
4. Judge it: \`model.score(X_test, y_test)\` — for regression this is R², where 1 is perfect and 0 is no better than guessing the average.

\`random_state\` makes the split repeatable. The data here is scikit-learn's own built-in diabetes dataset, so it works offline.

A model that scores well on training data but badly on test data has memorised rather than learned — "overfitting".`,
  example: `from sklearn.datasets import load_diabetes
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression

X, y = load_diabetes(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
model = LinearRegression().fit(X_train, y_train)
round(model.score(X_test, y_test), 3)`,
  exercises: [
    {
      id: "py-16-e1",
      prompt: `Train a LinearRegression on the training data and store its R² on the test data in \`r2\`.`,
      starter: `from sklearn.datasets import load_diabetes
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression

X, y = load_diabetes(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
`,
      solution: `from sklearn.datasets import load_diabetes
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression

X, y = load_diabetes(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
model = LinearRegression().fit(X_train, y_train)
r2 = model.score(X_test, y_test)`,
      tests: `assert 0.3 < r2 < 0.9, f"r2 should be a sensible score between 0.3 and 0.9, got {r2}"`,
    },
    {
      id: "py-16-e2",
      prompt: `Using the trained \`model\`, compute the mean absolute error on the test data into \`mae\` (sklearn.metrics.mean_absolute_error).`,
      starter: `from sklearn.datasets import load_diabetes
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

X, y = load_diabetes(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
model = LinearRegression().fit(X_train, y_train)
`,
      solution: `from sklearn.datasets import load_diabetes
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error

X, y = load_diabetes(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)
model = LinearRegression().fit(X_train, y_train)
mae = mean_absolute_error(y_test, model.predict(X_test))`,
      tests: `assert 20 < mae < 70, f"mae should be around 40-50, got {mae}"`,
    },
  ],
};
