import "./polyfills";
import "./styles.css";

import React from "react";
import ReactDOM from "react-dom/client";
import IceMazeApp from "./IceMazeApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <IceMazeApp />
  </React.StrictMode>,
);
