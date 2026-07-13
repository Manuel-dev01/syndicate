import { useEffect, useState } from "react";

// True when the viewport is at or below `breakpoint`px. Starts `false` so SSR + first client render
// agree (desktop), then resolves on mount — avoiding a hydration mismatch. Used to switch the dense
// desktop layouts to a stacked, fully-reachable mobile layout.
export function useIsMobile(breakpoint = 900): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}
