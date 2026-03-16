import { type ReactNode } from "react";
import { createPortal } from "react-dom";

const tooltipStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  pointerEvents: "none",
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  color: "var(--popover-foreground)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 12,
};

interface TooltipPortalProps {
  active?: boolean;
  coordinate?: { x: number; y: number };
  chartElement: HTMLDivElement | null;
  children: ReactNode;
}

export function TooltipPortal({ active, coordinate, chartElement, children }: TooltipPortalProps) {
  if (!active || !coordinate || !chartElement) return null;

  const rect = chartElement.getBoundingClientRect();
  const left = rect.left + coordinate.x + 15;
  const top = rect.top + coordinate.y - 10;

  return createPortal(<div style={{ ...tooltipStyle, left, top }}>{children}</div>, document.body);
}
