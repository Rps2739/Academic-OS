import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { getCurrentWindow, currentMonitor, LogicalPosition } from "@tauri-apps/api/window";

const MARGIN = 16;

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

async function snapTo(corner: Corner) {
  const win = getCurrentWindow();
  const monitor = await currentMonitor();
  if (!monitor) return;
  const screen = monitor.size.toLogical(monitor.scaleFactor);
  const winSize = (await win.outerSize()).toLogical(monitor.scaleFactor);

  const positions: Record<Corner, [number, number]> = {
    "top-left": [MARGIN, MARGIN],
    "top-right": [screen.width - winSize.width - MARGIN, MARGIN],
    "bottom-left": [MARGIN, screen.height - winSize.height - MARGIN],
    "bottom-right": [screen.width - winSize.width - MARGIN, screen.height - winSize.height - MARGIN],
    center: [(screen.width - winSize.width) / 2, (screen.height - winSize.height) / 2],
  };
  const [x, y] = positions[corner];
  await win.setPosition(new LogicalPosition(x, y));
}

interface WidgetHeaderProps {
  icon: ReactNode;
  label: string;
}

/**
 * Shared chrome for the desktop widget panels: the drag handle, a close
 * (hide — the panel comes back via the tray's "Open"/"Toggle panels", or
 * the main window's widget toggle), and a right-click menu to snap to a
 * screen corner. There's no OS-level "pin to Widgets Board" for a
 * third-party app on Windows (that API is MSIX/Adaptive-Cards only —
 * design manual §2 already made this call) — this is the closest
 * practical equivalent: quick, reliable positioning without a fiddly drag.
 */
export function WidgetHeader({ icon, label }: WidgetHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="widget-panel__header"
      data-tauri-drag-region
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      {icon}
      <span data-tauri-drag-region className="widget-panel__header-label">
        {label}
      </span>
      <button
        className="widget-panel__close"
        title="Hide (right-click header to reposition, or bring back from the tray icon)"
        onClick={() => void getCurrentWindow().hide()}
      >
        <X size={12} strokeWidth={2} />
      </button>
      {menuOpen && (
        <>
          <div className="widget-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="widget-menu">
            {(["top-left", "top-right", "bottom-left", "bottom-right", "center"] as Corner[]).map((c) => (
              <button
                key={c}
                className="widget-menu__item"
                onClick={() => {
                  void snapTo(c);
                  setMenuOpen(false);
                }}
              >
                {c.replace("-", " ")}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
