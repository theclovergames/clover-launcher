import { type ComponentProps, useLayoutEffect, useRef, useState } from "react";

import { segmentBar } from "@/lib/buttons";
import { cn } from "@/lib/utils";

type Box = { x: number; y: number; width: number; height: number; moved: boolean };

/**
 * Barre de choix exclusifs (onglets, filtres, réglages) : le bloc du choix retenu glisse d'une
 * option à l'autre. Les options sont des `slidingSegment`, celle retenue marquée `aria-checked`,
 * `aria-selected` ou `aria-pressed` ; `value` suit le choix.
 */
export function SegmentBar({ value, className, children, ...props }: ComponentProps<"div"> & { value: string | number }) {
  const bar = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  // Remesuré aussi quand la barre change de taille (retour à la ligne des onglets, zoom).
  useLayoutEffect(() => {
    const node = bar.current;
    if (!node) return;
    const place = () => {
      const active = node.querySelector<HTMLElement>(':scope > [aria-checked="true"], :scope > [aria-selected="true"], :scope > [aria-pressed="true"]');
      setBox((previous) => (active ? { x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight, moved: previous !== null } : null));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={bar} className={cn(segmentBar, className)} {...props}>
      {box && (
        <span
          aria-hidden
          className="mc-bevel pointer-events-none absolute top-0 left-0 bg-secondary"
          // En ligne : la transition de `mc-bevel` ne doit pas l'emporter. Pas de glissement à la première pose.
          style={{ width: box.width, height: box.height, translate: `${box.x}px ${box.y}px`, transition: box.moved ? "translate 220ms ease-out, width 220ms ease-out, height 220ms ease-out" : "none" }}
        />
      )}
      {children}
    </div>
  );
}
