interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  rows?: number;
  label: string;
}

/** Plain textarea editor: Tab inserts 4 spaces, Ctrl+Enter runs. No editor dependency. */
export function CodeEditor({ value, onChange, onRun, rows = 8, label }: CodeEditorProps) {
  return (
    <textarea
      className="practice-editor"
      aria-label={label}
      spellCheck={false}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();
          onRun();
        } else if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: s, selectionEnd: end } = el;
          const next = value.slice(0, s) + "    " + value.slice(end);
          onChange(next);
          requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
        }
      }}
    />
  );
}
