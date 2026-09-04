import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { TasksWidget } from "./widgets/TasksWidget";
import { ClassesWidget } from "./widgets/ClassesWidget";
import { QuickCapture } from "./widgets/QuickCapture";
import "./App.css";

const WIDGET_LABELS = ["widget-tasks", "widget-classes", "quick-capture"];

// getCurrentWindow() reads Tauri's IPC-injected window metadata, which
// can occasionally not be fully populated yet the instant this module
// evaluates (a startup race, not something under our control) — every
// window shares this one entry point, so if this throws uncaught,
// NOTHING renders anywhere, in any window. Default to "main" or the
// window's own DOM title, so a rare timing miss shows the main app
// instead of a blank screen.
let label = "main";
try {
  label = getCurrentWindow().label;
} catch (err) {
  console.error("getCurrentWindow() failed at startup, defaulting to main:", err);
}

// The main window is opaque (App.css paints --bg on body); widget windows
// are OS-level transparent + frameless, so the page background must be
// see-through too, or the transparency is defeated by a solid rectangle
// showing behind the panel's own rounded corners.
if (WIDGET_LABELS.includes(label)) {
  document.body.classList.add("widget-window");
}

/** Every Tauri window loads the same bundle; the window's label picks which root renders. */
function Root() {
  switch (label) {
    case "widget-tasks":
      return <TasksWidget />;
    case "widget-classes":
      return <ClassesWidget />;
    case "quick-capture":
      return <QuickCapture />;
    default:
      return <App />;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
