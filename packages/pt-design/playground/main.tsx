import { createRoot } from "react-dom/client";
import { PtDesignApp } from "../src/index";

const root = document.getElementById("root");
if (!root) {
  throw new Error("PT Design playground missing #root");
}

createRoot(root).render(<PtDesignApp className="pt-design-playground" />);
