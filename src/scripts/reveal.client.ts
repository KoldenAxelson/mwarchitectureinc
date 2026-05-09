/**
 * Reveal-on-scroll bootstrap.
 *
 * Watches all `[data-reveal]` elements and adds `.is-revealed` the first
 * time they enter the viewport. Honors `data-reveal-delay="<ms>"` so the
 * elementor-style staggered entrances work with no per-element JS.
 *
 * Loaded once from BaseLayout via `<script src="..." />` and re-runs on
 * Astro view transitions (page navigations) so dynamically-mounted nodes
 * still animate.
 */

const REVEALED = "is-revealed";

function reveal(el: Element) {
  const delay = Number(
    (el as HTMLElement).dataset.revealDelay ?? "0"
  );
  if (delay > 0) {
    window.setTimeout(() => el.classList.add(REVEALED), delay);
  } else {
    el.classList.add(REVEALED);
  }
}

function init() {
  const targets = document.querySelectorAll<HTMLElement>(
    "[data-reveal]:not(." + REVEALED + ")"
  );
  if (targets.length === 0) return;

  // If the user prefers reduced motion, the CSS makes elements visible
  // immediately — skip the observer entirely.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach((el) => el.classList.add(REVEALED));
    return;
  }

  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target);
        obs.unobserve(entry.target);
      }
    },
    {
      // No bottom trim — elements near the page bottom (e.g. footer
      // copyright) that only ever land in the lower edge of the viewport
      // would otherwise never satisfy the intersection. Threshold 0
      // means: any sliver of the element counts.
      rootMargin: "0px",
      threshold: 0,
    }
  );

  targets.forEach((el) => io.observe(el));

  // Safety net for the very bottom of the page: if the user is already
  // (or scrolls) within ~80px of the document bottom, reveal anything
  // that hasn't fired yet. Catches edge cases where the footer enters
  // the viewport in chunks too small for the observer to catch reliably.
  const flushNearBottom = () => {
    const remaining = document.querySelectorAll<HTMLElement>(
      "[data-reveal]:not(." + REVEALED + ")"
    );
    if (remaining.length === 0) {
      window.removeEventListener("scroll", flushNearBottom);
      return;
    }
    const distFromBottom =
      document.documentElement.scrollHeight -
      (window.scrollY + window.innerHeight);
    if (distFromBottom <= 80) {
      remaining.forEach((el) => el.classList.add(REVEALED));
      window.removeEventListener("scroll", flushNearBottom);
    }
  };
  window.addEventListener("scroll", flushNearBottom, { passive: true });
  flushNearBottom();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

// Re-run after Astro client-side navigations.
document.addEventListener("astro:page-load", init);
