import { useEffect, useReducer } from "react";
import { PaintbrushVertical } from "lucide-react";
import { useBlockNoteEditor, useComponentsContext } from "@blocknote/react";
import { copyFormat, disarm, getCopiedFormat, getStylesAtSelectionStart, isArmed, subscribe } from "../lib/format-painter";

/**
 * Word/Docs-style format painter: click once with text selected to copy its
 * character formatting (bold/italic/underline/strike/text color/highlight —
 * the inline "styles" in BlockNote's schema, not block-level props like
 * alignment), then select any other text and click again to replace its
 * formatting with the copied set. Not a built-in BlockNote feature.
 */
export function FormatPainterButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const [, forceRender] = useReducer((c: number) => c + 1, 0);

  useEffect(() => subscribe(forceRender), []);

  function handleClick() {
    editor.focus();
    if (isArmed()) {
      const format = getCopiedFormat();
      if (format) {
        // Replace, don't merge: clear every style the schema knows about
        // on the target selection first, then apply only the copied ones —
        // otherwise "painting" plain text onto bold text would leave it bold.
        const allStyleKeys = Object.keys(editor.schema.styleSchema);
        editor.removeStyles(Object.fromEntries(allStyleKeys.map((k) => [k, true])) as never);
        if (Object.keys(format.styles).length > 0) {
          editor.addStyles(format.styles as never);
        }
      }
      disarm();
    } else {
      copyFormat({ styles: getStylesAtSelectionStart(editor) });
    }
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      onClick={handleClick}
      isSelected={isArmed()}
      label="Format painter"
      mainTooltip={isArmed() ? "Apply copied formatting to this selection" : "Copy formatting (format painter)"}
      icon={<PaintbrushVertical size={16} strokeWidth={2} />}
    />
  );
}
