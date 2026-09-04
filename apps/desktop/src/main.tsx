import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { TasksWidget } from "./widgets/TasksWidget";
import { ClassesWidget } from "./widgets/ClassesWidget";
import { QuickCapture } from "./widgets/QuickCapture";
import "./App.css";

const WIDGET_LABELS = ["widget-tasks", "widget-classes", "quick-capture"];
const label = getCurrentWindow().label;

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
