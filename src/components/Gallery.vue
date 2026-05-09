<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import emblaCarouselVue from "embla-carousel-vue";

/**
 * Minimal Embla-powered image carousel.
 *
 * Pre-renders the <picture>/<img> markup that Astro's <Image /> component
 * produced on the server, so the gallery is fully visible (and SEO-friendly)
 * before the JS hydrates. JS only takes over to enable swipe + dot nav.
 */
interface ImageItem {
  /** Final src URL (already optimised by Astro). */
  src: string;
  /** Optional srcset for responsive delivery. */
  srcset?: string;
  /** Width / height as emitted by Astro's <Image />. */
  width: number;
  height: number;
  /** Required descriptive alt text. */
  alt: string;
}

const props = withDefaults(
  defineProps<{
    images: ImageItem[];
    caption?: string;
    /** sizes attribute passed through to <img> for responsive selection. */
    sizes?: string;
    /** When true, advances slides automatically every `intervalMs`. */
    autoplay?: boolean;
    intervalMs?: number;
    /**
     * How many slides to show side-by-side at md+ breakpoints.
     * Mobile is always 1-up. Defaults to 2 to match the old site.
     */
    perView?: 1 | 2;
  }>(),
  {
    sizes: "(min-width: 1024px) 50vw, 100vw",
    autoplay: false,
    intervalMs: 6000,
    perView: 2,
  }
);

const [emblaRef, emblaApi] = emblaCarouselVue({
  loop: true,
  align: "start",
  containScroll: "trimSnaps",
  dragFree: false,
  slidesToScroll: 1,
});

const selectedIndex = ref(0);
const canPrev = ref(false);
const canNext = ref(false);

let autoplayHandle: ReturnType<typeof setInterval> | null = null;

const onSelect = () => {
  if (!emblaApi.value) return;
  selectedIndex.value = emblaApi.value.selectedScrollSnap();
  canPrev.value = emblaApi.value.canScrollPrev();
  canNext.value = emblaApi.value.canScrollNext();
};

const scrollPrev = () => emblaApi.value?.scrollPrev();
const scrollNext = () => emblaApi.value?.scrollNext();
const scrollTo = (i: number) => emblaApi.value?.scrollTo(i);

onMounted(() => {
  if (!emblaApi.value) return;
  onSelect();
  emblaApi.value.on("select", onSelect);
  emblaApi.value.on("reInit", onSelect);

  if (props.autoplay && props.images.length > 1) {
    autoplayHandle = setInterval(() => {
      emblaApi.value?.scrollNext();
    }, props.intervalMs);
  }
});

onBeforeUnmount(() => {
  if (autoplayHandle) clearInterval(autoplayHandle);
  if (emblaApi.value) {
    emblaApi.value.off("select", onSelect);
    emblaApi.value.off("reInit", onSelect);
  }
});

const showControls = computed(() => props.images.length > 1);
</script>

<template>
  <figure class="my-14">
    <div
      class="relative bg-warm-grey/10"
      :aria-roledescription="showControls ? 'carousel' : undefined"
    >
      <div ref="emblaRef" class="overflow-hidden">
        <div class="flex gap-3 sm:gap-4">
          <div
            v-for="(img, i) in images"
            :key="i"
            class="min-w-0 shrink-0 grow-0 basis-full aspect-[3/2] overflow-hidden"
            :class="
              perView === 2
                ? 'md:basis-[calc(50%-0.5rem)]'
                : ''
            "
            :aria-roledescription="showControls ? 'slide' : undefined"
            :aria-label="
              showControls ? `${i + 1} of ${images.length}` : undefined
            "
          >
            <img
              :src="img.src"
              :srcset="img.srcset"
              :sizes="sizes"
              :width="img.width"
              :height="img.height"
              :alt="img.alt"
              :loading="i < perView ? 'eager' : 'lazy'"
              :decoding="i < perView ? 'sync' : 'async'"
              :fetchpriority="i === 0 ? 'high' : 'auto'"
              class="block w-full h-full object-cover select-none"
              draggable="false"
            />
          </div>
        </div>
      </div>

      <template v-if="showControls">
        <button
          type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full bg-off-white/80 text-near-black hover:bg-off-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          :disabled="!canPrev"
          aria-label="Previous image"
          @click="scrollPrev"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full bg-off-white/80 text-near-black hover:bg-off-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          :disabled="!canNext"
          aria-label="Next image"
          @click="scrollNext"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </template>
    </div>

    <div
      v-if="showControls"
      class="mt-3 flex items-center justify-center gap-2"
      role="tablist"
      aria-label="Image selector"
    >
      <button
        v-for="(_, i) in images"
        :key="i"
        type="button"
        role="tab"
        :aria-selected="selectedIndex === i"
        :aria-label="`Go to image ${i + 1}`"
        class="size-2 rounded-full transition"
        :class="
          selectedIndex === i
            ? 'bg-near-black scale-125'
            : 'bg-warm-grey hover:bg-mid-grey'
        "
        @click="scrollTo(i)"
      />
    </div>

    <figcaption
      v-if="caption"
      class="mt-3 px-6 sm:px-0 text-sm text-mid-grey italic"
    >
      {{ caption }}
    </figcaption>
  </figure>
</template>
