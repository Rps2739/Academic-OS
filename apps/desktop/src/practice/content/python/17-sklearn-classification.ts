import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-17",
  track: "python",
  title: `scikit-learn — classification`,
  body: `Classification predicts a *category* instead of a number — will this customer buy, is this email spam, which flower is this.

The recipe is the same as for regression: split, create, \`fit\`, then \`predict\` and measure.

- \`LogisticRegression(max_iter=500)\` is a simple, strong first classifier (despite the name, it classifies).
- **Accuracy** = share of correct predictions: \`accuracy_score(y_test, predictions)\`. It misleads when one class is rare — a model that always says "no fraud" is 99% accurate and useless.
- A **confusion matrix** shows which classes get mixed up: rows are the truth, columns the prediction.

This lesson uses the classic iris flower dataset that ships with scikit-learn, so it runs offline.`,
  example: `from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=1)
clf = LogisticRegression(max_iter=500).fit(X_train, y_train)
accuracy_score(y_test, clf.predict(X_test))`,
  exercises: [
    {
      id: "py-17-e1",
      prompt: `Train a LogisticRegression (max_iter=500) on the iris training data and store its accuracy on the test data in \`acc\`.`,
      starter: `from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=1)
`,
      solution: `from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=1)
clf = LogisticRegression(max_iter=500).fit(X_train, y_train)
acc = accuracy_score(y_test, clf.predict(X_test))`,
      tests: `assert acc > 0.85, f"accuracy should be above 0.85, got {acc}"`,
    },
    {
      id: "py-17-e2",
      prompt: `Compute the confusion matrix of the test predictions into \`cm\` (sklearn.metrics.confusion_matrix).`,
      starter: `from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=1)
clf = LogisticRegression(max_iter=500).fit(X_train, y_train)
`,
      solution: `from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=1)
clf = LogisticRegression(max_iter=500).fit(X_train, y_train)
cm = confusion_matrix(y_test, clf.predict(X_test))`,
      tests: `assert cm.shape == (3, 3), "iris has 3 classes, so the matrix should be 3x3"
assert int(cm.sum()) == len(y_test), "every test row should be counted once"`,
    },
  ],
};
