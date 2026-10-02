import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./router";
import { AppStoreProvider } from "./store/AppStore";
import "./styles.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <AppStoreProvider>
      <AppRouter />
    </AppStoreProvider>
  </StrictMode>,
);
