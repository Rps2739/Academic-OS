import type { Lesson } from "../types";

export const lesson: Lesson = {
  id: "py-01",
  track: "python",
  title: "Python basics — values, variables and print",
  body: `Python runs top to bottom. A variable is a name for a value: \`price = 499\`.

- Numbers: \`499\`, \`12.5\`. Text (strings): \`"Bengaluru"\`. True/False: \`True\`.
- \`print(...)\` shows something in the output.
- f-strings put values inside text: \`f"Total: {qty * price}"\`.
- The last line of a cell, if it's a value, is shown automatically — just like a notebook.

Try changing the numbers in the example and run it again (Ctrl+Enter).`,
  example: `price = 499
qty = 3
total = price * qty
print(f"{qty} items at ₹{price} = ₹{total}")
total`,
  exercises: [
    {
      id: "py-01-e1",
      prompt: "Create a variable `gst` equal to 18% of 1,250 (use 0.18).",
      starter: "gst = ",
      solution: "gst = 1250 * 0.18",
      tests: `assert "gst" in dir(), "Create a variable called gst."
assert abs(gst - 225) < 1e-9, f"gst should be 225, got {gst}"`,
    },
    {
      id: "py-01-e2",
      prompt: "Make `greeting` equal to the text Hello, Bengaluru! using an f-string and the variable city.",
      starter: 'city = "Bengaluru"\ngreeting = ',
      solution: 'city = "Bengaluru"\ngreeting = f"Hello, {city}!"',
      tests: `assert greeting == "Hello, Bengaluru!", f"got {greeting!r}"`,
    },
  ],
};
