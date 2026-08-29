import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { prerender } from "./prerender";

export default defineConfig({
  plugins: [tailwindcss(), prerender()],
});
