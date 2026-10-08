import { Fragment } from "react";

function inline(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((b) => b.trim())
        .filter(Boolean)
        .map((block, i) => {
          const lines = block.split("\n");
          if (lines.every((l) => l.trim().startsWith("- "))) {
            return (
              <ul key={i}>
                {lines.map((l, j) => (
                  <li key={j}>{inline(l.trim().slice(2))}</li>
                ))}
              </ul>
            );
          }
          return <p key={i}>{inline(block)}</p>;
        })}
    </>
  );
}

/** Blank line = paragraph, "- " = bullet, `x` = inline code, ``` fences = code block.
 * Plain React text only — lesson content is never treated as HTML. */
export function LessonText({ text }: { text: string }) {
  return (
    <div className="lesson-text">
      {text.split(/(```[\s\S]*?```)/g).map((part, i) =>
        part.startsWith("```") ? (
          <pre key={i} className="lesson-text__code">
            {part.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "")}
          </pre>
        ) : (
          <Prose key={i} text={part} />
        )
      )}
    </div>
  );
}
