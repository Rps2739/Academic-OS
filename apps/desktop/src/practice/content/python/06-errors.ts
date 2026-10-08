import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-06",
  track: "python",
  title: `Errors and try/except`,
  body: `Things go wrong: bad input, missing files, dividing by zero. Python reports this with an *exception*, and \`try\` / \`except\` lets your program react instead of crashing.

\`\`\`
try:
    value = int(text)
except ValueError:
    value = None
\`\`\`

- Catch the *specific* error you expect (\`ValueError\`, \`ZeroDivisionError\`, \`KeyError\`) rather than everything.
- \`raise ValueError("message")\` signals a problem yourself.
- \`finally:\` runs whether or not an error happened.

Reading the last line of a traceback first tells you the error type and message — usually enough to find the fix.`,
  example: `def safe_int(text):
    try:
        return int(text)
    except ValueError:
        return None

[safe_int(t) for t in ["12", " 7", "x", "3"]]`,
  exercises: [
    {
      id: "py-06-e1",
      prompt: `Write \`safe_div(a, b)\` that returns a / b, or None when b is zero.`,
      starter: `def safe_div(a, b):
    `,
      solution: `def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None`,
      tests: `assert safe_div(10, 4) == 2.5
assert safe_div(1, 0) is None, "dividing by zero should return None"`,
    },
    {
      id: "py-06-e2",
      prompt: `Write \`to_ints(values)\` that converts each string to an int and silently skips the ones that aren't numbers.`,
      starter: `def to_ints(values):
    `,
      solution: `def to_ints(values):
    out = []
    for v in values:
        try:
            out.append(int(v))
        except ValueError:
            pass
    return out`,
      tests: `assert to_ints(["12", " 7", "x", "3", ""]) == [12, 7, 3], "expected [12, 7, 3]"`,
    },
  ],
};
