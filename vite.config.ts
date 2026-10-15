import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // 3Dmol.js is a single ~800 kB UMD bundle that cannot be split further;
    // raise the limit so the expected size doesn't produce a warning on every build.
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        // 3Dmol's autoload helper uses a direct eval() for inline HTML callbacks, which this
        // app never uses. Nothing to fix on our side, so keep the build output clean.
        if (warning.code === "EVAL" && warning.id?.includes("3dmol")) return;
        defaultHandler(warning);
      },
    },
  },
});
