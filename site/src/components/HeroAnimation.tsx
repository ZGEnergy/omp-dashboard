import { useEffect, useRef, useState } from "preact/hooks";
import { animate } from "motion";

/**
 * Storytelling hero animation.
 *
 * Four pre-rendered dashboard states cycle every 6 seconds with a crossfade,
 * subtle upward translation and scale. Pauses while the mockup is hovered or
 * touched. Honors `prefers-reduced-motion` by freezing on state 0.
 */
const STATES = [
  { src: "sessions.png", label: "Sessions overview" },
  { src: "chat.png", label: "Live chat" },
  { src: "flows.png", label: "Flow in motion" },
  { src: "diff.png", label: "Diff review" },
];

const BASE_DARK = "/pi-agent-dashboard/screenshots/desktop";
const BASE_LIGHT = "/pi-agent-dashboard/screenshots/desktop-light";
const INTERVAL = 6000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HeroAnimation() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
  }, []);

  useEffect(() => {
    if (reduced.current || paused) return;
    const t = setInterval(() => {
      setActive((i) => (i + 1) % STATES.length);
    }, INTERVAL);
    return () => clearInterval(t);
  }, [paused]);

  useEffect(() => {
    if (reduced.current) return;
    layerRefs.current.forEach((el, i) => {
      if (!el) return;
      const isActive = i === active;
      // motion's TS types for DOM targets vary by version; use a typed-loose
      // wrapper so both v11 and v12 work without churn.
      (animate as unknown as (
        target: Element,
        values: Record<string, number | string>,
        options?: Record<string, unknown>,
      ) => unknown)(
        el,
        {
          opacity: isActive ? 1 : 0,
          y: isActive ? 0 : 6,
          scale: isActive ? 1 : 0.995,
        },
        { duration: 0.9, easing: [0.22, 1, 0.36, 1] },
      );
    });
  }, [active]);

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {STATES.map((s, i) => (
        <div
          key={s.src}
          ref={(el) => {
            layerRefs.current[i] = el;
          }}
          className="absolute inset-0"
          style={{
            opacity: i === 0 ? 1 : 0,
            willChange: "opacity, transform",
          }}
          aria-hidden={i !== active}
        >
          {/* Dark variant — visible when html.dark is set */}
          <img
            src={`${BASE_DARK}/${s.src}`}
            alt={s.label}
            className="absolute inset-0 h-full w-full object-cover object-top hidden dark:block"
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
          />
          {/* Light variant */}
          <img
            src={`${BASE_LIGHT}/${s.src}`}
            alt={s.label}
            className="absolute inset-0 h-full w-full object-cover object-top block dark:hidden"
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
          />
        </div>
      ))}

      {/* State indicator pips */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-2 py-1.5 border border-white/10"
        aria-hidden="true"
      >
        {STATES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
              i === active ? "bg-pi-accent w-4" : "bg-pi-muted/50"
            }`}
          />
        ))}
      </div>

      <span className="sr-only" aria-live="polite">
        {STATES[active]?.label}
      </span>
    </div>
  );
}
