import { CircleDashed, Download, Maximize2, Minimize2, Rotate3d, RotateCcw, Tag } from "lucide-react";
import { SHORTCUTS } from "../lib/shortcuts";
import type { ViewerSettings, ViewerStyle } from "../types";
import { Menu } from "./ui/Menu";
import { SegmentedControl, type SegmentOption } from "./ui/SegmentedControl";
import { ToolButton } from "./ui/ToolButton";
import { Tooltip } from "./ui/Tooltip";

export const STYLE_LABELS: Record<ViewerStyle, string> = {
  ballstick: "Ball & stick",
  stick: "Stick",
  sphere: "Spacefill",
  line: "Wireframe",
};

/** Order used by the segmented control and by the S shortcut. */
export const STYLE_ORDER: readonly ViewerStyle[] = ["ballstick", "stick", "sphere", "line"];

const STYLE_OPTIONS: ReadonlyArray<SegmentOption<ViewerStyle>> = STYLE_ORDER.map((value) => ({
  value,
  label: STYLE_LABELS[value],
  tooltip: `${STYLE_LABELS[value]} · ${SHORTCUTS.style.key} cycles styles`,
}));

interface ViewerControlsProps {
  settings: ViewerSettings;
  onSettingsChange: (patch: Partial<ViewerSettings>) => void;
  hasMolecule: boolean;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  onReset: () => void;
  onToggleFullscreen: () => void;
  onExportPng: () => void;
  onExportSdf: () => void;
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

/** Flat toolbar docked to the top edge of the canvas. Scrolls horizontally on narrow screens. */
export function ViewerControls({
  settings,
  onSettingsChange,
  hasMolecule,
  isFullscreen,
  fullscreenSupported,
  onReset,
  onToggleFullscreen,
  onExportPng,
  onExportSdf,
}: ViewerControlsProps) {
  const toggles = [
    { id: "labels", text: "Labels", name: "Atom labels", icon: Tag, shortcut: SHORTCUTS.labels.key },
    { id: "surface", text: "Surface", name: "Van der Waals surface", icon: CircleDashed, shortcut: SHORTCUTS.surface.key },
    { id: "spin", text: "Spin", name: "Auto-rotate", icon: Rotate3d, shortcut: SHORTCUTS.spin.key },
  ] as const;

  return (
    <div
      role="toolbar"
      aria-label="Viewer controls"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2 py-1.5"
    >
      <SegmentedControl
        label="Display style"
        options={STYLE_OPTIONS}
        value={settings.style}
        onChange={(style) => onSettingsChange({ style })}
      />

      <Divider />

      {toggles.map(({ id, text, name, icon: Icon, shortcut }) => (
        <Tooltip key={id} label={`${name} · ${shortcut}`}>
          <ToolButton
            icon={<Icon aria-hidden size={16} />}
            text={text}
            compactText
            pressed={settings[id]}
            aria-label={`${name} (${shortcut})`}
            aria-keyshortcuts={shortcut}
            onClick={() => onSettingsChange({ [id]: !settings[id] })}
          />
        </Tooltip>
      ))}

      <span className="min-w-2 flex-1" />

      <Tooltip label={`Reset view · ${SHORTCUTS.reset.key}`}>
        <ToolButton
          icon={<RotateCcw aria-hidden size={16} />}
          aria-label={`Reset view (${SHORTCUTS.reset.key})`}
          aria-keyshortcuts={SHORTCUTS.reset.key}
          disabled={!hasMolecule}
          onClick={onReset}
        />
      </Tooltip>

      {fullscreenSupported && (
        <Tooltip label={`${isFullscreen ? "Exit fullscreen" : "Fullscreen"} · ${SHORTCUTS.fullscreen.key}`}>
          <ToolButton
            icon={isFullscreen ? <Minimize2 aria-hidden size={16} /> : <Maximize2 aria-hidden size={16} />}
            aria-label={`${isFullscreen ? "Exit fullscreen" : "Fullscreen"} (${SHORTCUTS.fullscreen.key})`}
            aria-keyshortcuts={SHORTCUTS.fullscreen.key}
            onClick={onToggleFullscreen}
          />
        </Tooltip>
      )}

      <Menu
        text="Export"
        icon={<Download aria-hidden size={16} />}
        tooltip="Download image or structure file"
        compactText
        disabled={!hasMolecule}
        items={[
          { label: "PNG image", hint: ".png", onSelect: onExportPng },
          { label: "SDF file", hint: ".sdf", onSelect: onExportSdf },
        ]}
      />
    </div>
  );
}
