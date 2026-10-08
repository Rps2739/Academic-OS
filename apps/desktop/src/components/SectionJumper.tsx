import { useEffect, useState } from "react";
import { ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { isLongNote, jumpToSection, jumpToTop, scrollParentOf } from "../lib/section-nav";

interface SectionJumperProps {
  container: HTMLElement | null;
  sectionIds: string[];
}

/** Floating ↑ Top · ‹ Prev · Next › for long notes (reading spec §2). */
export function SectionJumper({ container, sectionIds }: SectionJumperProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!container) return;
    const parent = scrollParentOf(container);
    const update = () => setVisible(isLongNote(container));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    parent.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      parent.removeEventListener("scroll", update);
    };
  }, [container, sectionIds]);

  if (!container || !visible) return null;
  const hasSections = sectionIds.length > 0;

  return (
    <div className="section-jumper" data-section-count={sectionIds.length}>
      <button className="section-jumper__btn" title="Back to top (Ctrl+Home)" onClick={() => jumpToTop(container)}>
        <ArrowUp size={13} strokeWidth={2} /> Top
      </button>
      <button
        className="section-jumper__btn"
        title="Previous section (Alt+↑)"
        disabled={!hasSections}
        onClick={() => jumpToSection(container, sectionIds, -1)}
      >
        <ChevronLeft size={13} strokeWidth={2} /> Prev
      </button>
      <button
        className="section-jumper__btn"
        title="Next section (Alt+↓)"
        disabled={!hasSections}
        onClick={() => jumpToSection(container, sectionIds, 1)}
      >
        Next <ChevronRight size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
