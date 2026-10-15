import { Moon, Sun } from "lucide-react";
import type { Theme } from "../types";
import { ToolButton } from "./ui/ToolButton";
import { Tooltip } from "./ui/Tooltip";

/** Switches between the dark (default) and light themes. Shows the theme it switches to. */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`;
  return (
    <Tooltip label={label}>
      <ToolButton
        icon={next === "light" ? <Sun aria-hidden size={16} /> : <Moon aria-hidden size={16} />}
        aria-label={label}
        onClick={onToggle}
      />
    </Tooltip>
  );
}
