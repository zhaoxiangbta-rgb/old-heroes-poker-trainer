import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MobileApp } from "./MobileApp";
import "../styles.css";
import "../gameplay.css";
import "../actions.css";
import "../turn-status.css";
import "../card-action-layout.css";
import "../showdown.css";
import "../history.css";
import "../workspace.css";
import "../table-themes.css";
import "../deal-animation.css";
import "./mobile.css";

createRoot(document.getElementById("root")!).render(<StrictMode><MobileApp /></StrictMode>);
