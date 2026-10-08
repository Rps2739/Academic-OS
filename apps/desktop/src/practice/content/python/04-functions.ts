import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-04",
  track: "python",
  title: `Functions`,
  body: `A function packages steps under a name so you can reuse them.

\`\`\`
def net_price(price, discount):
    return price * (1 - discount)
\`\`\`

- \`def\` starts it, the names in brackets are the inputs (parameters), and \`return\` hands back the answer.
- A function without \`return\` gives back \`None\`.
- You can give a parameter a default: \`def greet(name="there")\`.
- Variables made inside a function stay inside it.

Small, single-purpose functions are easier to test — and in interviews, to explain.`,
  example: `def net_price(price, discount=0):
    return price * (1 - discount)

print(net_price(1000, 0.1))
net_price(500)`,
  exercises: [
    {
      id: "py-04-e1",
      prompt: `Write a function \`net_price(price, discount)\` that returns the price after the discount (discount is a fraction, e.g. 0.1 = 10%).`,
      starter: `def net_price(price, discount):
    `,
      solution: `def net_price(price, discount):
    return price * (1 - discount)`,
      tests: `assert abs(net_price(1000, 0.1) - 900) < 1e-9, "net_price(1000, 0.1) should be 900"
assert abs(net_price(250, 0) - 250) < 1e-9, "no discount should leave the price unchanged"`,
    },
    {
      id: "py-04-e2",
      prompt: `Write \`grade(score)\` returning "A" for 75 and above, "B" for 50 to 74, and "C" below 50.`,
      starter: `def grade(score):
    `,
      solution: `def grade(score):
    if score >= 75:
        return "A"
    if score >= 50:
        return "B"
    return "C"`,
      tests: `assert [grade(s) for s in (90, 75, 74, 50, 49, 0)] == ["A", "A", "B", "B", "C", "C"], "check the boundaries 75 and 50"`,
    },
  ],
};
