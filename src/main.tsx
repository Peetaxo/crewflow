import { createRoot } from "react-dom/client";
import QueryProvider from "./app/providers/QueryProvider";
import App from "./App.tsx";
import "./index.css";
import "./styles/mobile-events.css";
import "./styles/mobile-timelogs.css";

createRoot(document.getElementById("root")!).render(
  <QueryProvider>
    <App />
  </QueryProvider>,
);
