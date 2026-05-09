<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import emblaCarouselVue from "embla-carousel-vue";

/**
 * Full-bleed hero carousel for the home page.
 *
 * Each slide is a project's pre-optimised hero image (passed in from
 * Astro's image pipeline) with the project name + a "View project" link
 * overlaid bottom-left. Auto-advances every 6s, pauses on hover, and
 * exposes prev/next + bullet pagination.
 */
interface HeroSlide {
  /** Fallback <img src> — the WebP single URL. */
  src: string;
  /** AVIF srcset (preferred when supported). */
  avifSrcset?: string;
  /** WebP srcset (universal modern fallback). */
  webpSrcset?: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  location: string;
  href: string;
}

const props = withDefaults(
  defineProps<{
    slides: HeroSlide[];
    intervalMs?: number;
  }>(),
  { intervalMs: 6000 }
);

const [emblaRef, emblaApi] = emblaCarouselVue({
  loop: true,
  align: "start",
  duration: 32,
});

const selectedIndex = ref(0);
let autoplayHandle: ReturnType<typeof setInterval> | null = null;
let paused = false;

const onSelect = () => {
  if (!emblaApi.value) return;
  selectedIndex.value = emblaApi.value.selectedScrollSnap();
};

const startAutoplay = () => {
  if (autoplayHandle || props.slides.length <= 1) return;
  autoplayHandle = setInterval(() => {
    if (!paused && document.visibilityState === "visible") {
      emblaApi.value?.scrollNext();
    }
  }, props.intervalMs);
};

const stopAutoplay = () => {
  if (autoplayHandle) {
    clearInterval(autoplayHandle);
    autoplayHandle = null;
  }
};

const scrollTo = (i: number) => emblaApi.value?.scrollTo(i);
const next = () => emblaApi.value?.scrollNext();
const prev = () => emblaApi.value?.scrollPrev();

const onPointerEnter = () => {
  paused = true;
};
const onPointerLeave = () => {
  paused = false;
};

onMounted(() => {
  if (!emblaApi.value) return;
  onSelect();
  emblaApi.value.on("select", onSelect);
  emblaApi.value.on("reInit", onSelect);
  startAutoplay();
});

onBeforeUnmount(() => {
  stopAutoplay();
  if (emblaApi.value) {
    emblaApi.value.off("select", onSelect);
    emblaApi.value.off("reInit", onSelect);
  }
});
</script>

<template>
  <section
    class="relative w-full overflow-hidden bg-near-black"
    aria-roledescription="carousel"
    aria-label="Featured projects"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <!-- Fixed-height stage so the page doesn't reflow as images load -->
    <div class="relative h-[60vh] sm:h-[72vh] lg:h-[82vh] min-h-[420px] max-h-[920px]">
      <div ref="emblaRef" class="overflow-hidden h-full">
        <div class="flex h-full">
          <a
            v-for="(slide, i) in slides"
            :key="i"
            :href="slide.href"
            :aria-label="`${slide.title} — view project`"
            :aria-roledescription="'slide'"
            :aria-hidden="selectedIndex !== i"
            :tabindex="selectedIndex === i ? 0 : -1"
            class="relative shrink-0 grow-0 basis-full h-full focus:outline-none"
          >
            <picture>
              <source
                v-if="slide.avifSrcset"
                type="image/avif"
                :srcset="slide.avifSrcset"
                sizes="100vw"
              />
              <source
                v-if="slide.webpSrcset"
                type="image/webp"
                :srcset="slide.webpSrcset"
                sizes="100vw"
              />
              <img
                :src="slide.src"
                :width="slide.width"
                :height="slide.height"
                :alt="slide.alt"
                sizes="100vw"
                :loading="i === 0 ? 'eager' : 'lazy'"
                :fetchpriority="i === 0 ? 'high' : 'auto'"
                :decoding="i === 0 ? 'sync' : 'async'"
                class="absolute inset-0 size-full object-cover select-none"
                draggable="false"
              />
            </picture>

            <!--
              Two-layer overlay:
                1. Uniform dim across the whole image (~30%) so white text
                   stays legible even where the photo is bright.
                2. Stronger gradient at the bottom under the caption.
            -->
            <div
              class="absolute inset-0 bg-near-black/35 pointer-events-none"
            />
            <div
              class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-near-black/70 via-near-black/30 to-transparent pointer-events-none"
            />

            <!-- Slide caption — bottom-left, all text in off-white. -->
            <div
              class="absolute inset-x-0 bottom-0 px-6 sm:px-10 pb-14 sm:pb-20 text-off-white"
            >
              <p
                class="text-[11px] uppercase tracking-[0.22em] text-off-white"
              >
                {{ slide.location }}
              </p>
              <h2
                class="mt-3 text-3xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] text-off-white"
                style="font-family: var(--font-display);"
              >
                {{ slide.title }}
              </h2>
              <span
                class="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-off-white border-b border-off-white/70 pb-1"
              >
                View project
                <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M5 12h14M13 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </div>
          </a>
        </div>
      </div>

      <!-- Prev / next -->
      <button
        v-if="slides.length > 1"
        type="button"
        class="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-full bg-near-black/40 hover:bg-near-black/65 text-off-white backdrop-blur-sm transition"
        aria-label="Previous slide"
        @click="prev"
      >
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        v-if="slides.length > 1"
        type="button"
        class="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-full bg-near-black/40 hover:bg-near-black/65 text-off-white backdrop-blur-sm transition"
        aria-label="Next slide"
        @click="next"
      >
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <!-- Bullet pagination -->
      <div
        v-if="slides.length > 1"
        class="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2"
        role="tablist"
        aria-label="Slide selector"
      >
        <button
          v-for="(_, i) in slides"
          :key="i"
          type="button"
          role="tab"
          :aria-selected="selectedIndex === i"
          :aria-label="`Go to slide ${i + 1}`"
          class="h-1 transition-all rounded-full"
          :class="
            selectedIndex === i
              ? 'w-8 bg-off-white'
              : 'w-3 bg-off-white/45 hover:bg-off-white/75'
          "
          @click="scrollTo(i)"
        />
      </div>
    </div>
  </section>
</template>
