import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { PasswordGate } from "./PasswordGate.tsx";

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <PasswordGate>
    <App />
  </PasswordGate>
);
