<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import emblaCarouselVue from "embla-carousel-vue";

/**
 * One column on the Services page.
 *
 * Owns its own auto-rotating mini carousel of "recent work" project covers.
 * Hovering a project name in the list snaps the carousel to that slide
 * and pauses autoplay; mouse-leaving the column resumes it.
 */
interface Slide {
  slug: string;
  label: string;
  src: string;
  srcset?: string;
  width: number;
  height: number;
  alt: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    blurb: string;
    slides: Slide[];
    intervalMs?: number;
  }>(),
  { intervalMs: 4500 }
);

const [emblaRef, emblaApi] = emblaCarouselVue({
  loop: true,
  align: "start",
  duration: 28,
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
  if (autoplayHandle) clearInterval(autoplayHandle);
  autoplayHandle = null;
};

const onItemEnter = (i: number) => {
  paused = true;
  emblaApi.value?.scrollTo(i);
};

const onColumnLeave = () => {
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
  <li @mouseleave="onColumnLeave">
    <!-- Mini carousel above the service content. Whole tile clicks
         through to the currently-shown project's page. -->
    <a
      :href="`/portfolio/${slides[selectedIndex]?.slug ?? ''}`"
      class="block group"
      :aria-label="`View ${slides[selectedIndex]?.label ?? ''}`"
    >
      <div
        class="relative aspect-[4/3] overflow-hidden bg-warm-grey/15 mb-6"
        aria-roledescription="carousel"
      >
        <div ref="emblaRef" class="overflow-hidden h-full">
          <div class="flex h-full">
            <div
              v-for="(s, i) in slides"
              :key="s.slug"
              class="shrink-0 grow-0 basis-full h-full"
              :aria-roledescription="'slide'"
              :aria-label="`${i + 1} of ${slides.length}: ${s.label}`"
            >
              <img
                :src="s.src"
                :srcset="s.srcset"
                :width="s.width"
                :height="s.height"
                :alt="s.alt"
                sizes="(min-width: 1024px) 33vw, 100vw"
                :loading="i === 0 ? 'eager' : 'lazy'"
                :decoding="i === 0 ? 'sync' : 'async'"
                class="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
            </div>
          </div>
        </div>

        <!-- Pagination ticks at the bottom edge -->
        <div
          v-if="slides.length > 1"
          class="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5"
          aria-hidden="true"
        >
          <span
            v-for="(_, i) in slides"
            :key="i"
            class="h-1 transition-all rounded-full"
            :class="
              selectedIndex === i
                ? 'w-6 bg-off-white'
                : 'w-1.5 bg-off-white/55'
            "
          />
        </div>
      </div>
    </a>

    <h2 class="text-2xl text-near-black">{{ title }}</h2>
    <p class="mt-4 text-body/85 leading-relaxed">{{ blurb }}</p>

    <p class="mt-6 text-[11px] uppercase tracking-[0.16em] text-mid-grey">
      Recent work
    </p>
    <ul class="mt-2 text-sm text-body/80">
      <li
        v-for="(s, i) in slides"
        :key="s.slug"
        class="py-1"
      >
        <!--
          Active state is driven purely by the user's own hover/focus —
          we deliberately do NOT highlight the list item just because the
          carousel happens to be auto-rotating to that project's image,
          since that effect read as disorienting "phantom hover".
        -->
        <a
          :href="`/portfolio/${s.slug}`"
          class="inline-flex items-center gap-2 transition-colors group/link hover:text-terracotta"
          @mouseenter="onItemEnter(i)"
          @focus="onItemEnter(i)"
        >
          {{ s.label }}
          <svg
            viewBox="0 0 24 24"
            class="size-3 opacity-0 -translate-x-1 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              d="M5 12h14M13 5l7 7-7 7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </a>
      </li>
    </ul>
  </li>
</template>
