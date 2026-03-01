import { memo } from "react";

interface MiningOverlayProps {
  progress: number; // 0 to 1
  visible: boolean;
  x?: number;
  y?: number;
}

export const MiningOverlay = memo(function MiningOverlay({ progress, visible, x, y }: MiningOverlayProps) {
  if (!visible || progress <= 0) return null;

  const size = 96;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const posStyle = x !== undefined && y !== undefined
    ? { position: "fixed" as const, left: x, top: y, transform: "translate(-50%, -50%)", zIndex: 50, pointerEvents: "none" as const }
    : { position: "fixed" as const, top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 50, pointerEvents: "none" as const };

  return (
    <div style={posStyle}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
});
