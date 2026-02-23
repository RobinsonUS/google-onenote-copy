import { useRef, useEffect, useCallback } from "react";

interface JoystickState {
  dx: number;
  dz: number;
}

interface TouchJoystickProps {
  onMove: (state: JoystickState) => void;
  size?: number;
}

export function TouchJoystick({ onMove, size = 100 }: TouchJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const activeTouch = useRef<number | null>(null);
  const basePos = useRef({ x: 0, y: 0 });

  const thumbSize = size * 0.4;
  const maxRadius = size * 0.35;

  const resetThumb = useCallback(() => {
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translate(0px, 0px)`;
    }
    activeTouch.current = null;
    onMove({ dx: 0, dz: 0 });
  }, [onMove]);

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (activeTouch.current !== null) return;
      const touch = e.changedTouches[0];
      activeTouch.current = touch.identifier;
      const rect = base.getBoundingClientRect();
      basePos.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier !== activeTouch.current) continue;

        const dx = touch.clientX - basePos.current.x;
        const dy = touch.clientY - basePos.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);

        const tx = Math.cos(angle) * clampedDist;
        const ty = Math.sin(angle) * clampedDist;

        if (thumbRef.current) {
          thumbRef.current.style.transform = `translate(${tx}px, ${ty}px)`;
        }

        // dx = left/right (x axis), dy = forward/backward (z axis)
        const norm = clampedDist / maxRadius;
        onMove({
          dx: -Math.cos(angle) * norm,  // inversion corrigée
          dz: Math.sin(angle) * norm,
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouch.current) {
          resetThumb();
        }
      }
    };

    base.addEventListener('touchstart', handleTouchStart, { passive: false });
    base.addEventListener('touchmove', handleTouchMove, { passive: false });
    base.addEventListener('touchend', handleTouchEnd, { passive: false });
    base.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      base.removeEventListener('touchstart', handleTouchStart);
      base.removeEventListener('touchmove', handleTouchMove);
      base.removeEventListener('touchend', handleTouchEnd);
      base.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [maxRadius, onMove, resetThumb]);

  return (
    <div
      ref={baseRef}
      className="joystick-base"
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      <div
        ref={thumbRef}
        className="joystick-thumb"
        style={{
          width: thumbSize,
          height: thumbSize,
          position: 'absolute',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
