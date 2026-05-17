import { useEffect, type RefObject } from "react";

type OutsideClickRef = RefObject<HTMLElement | null>;

export function useOutsideClick(
  refs: OutsideClickRef | OutsideClickRef[],
  onOutsideClick: () => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const refList = Array.isArray(refs) ? refs : [refs];
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedInside = refList.some((ref) => {
        const el = ref.current;
        return el ? el.contains(target) : false;
      });

      if (!clickedInside) {
        onOutsideClick();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [enabled, onOutsideClick, refs]);
}
