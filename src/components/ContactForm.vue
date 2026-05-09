<script setup lang="ts">
import { ref, computed } from "vue";

/**
 * Contact form. POSTs JSON to a Cloudflare Worker that forwards via
 * Resend to both principals.
 *
 * The endpoint URL is supplied at build time through PUBLIC_CONTACT_ENDPOINT
 * (an Astro env var). In dev with no endpoint configured we surface a
 * sensible "config missing" state instead of silently failing.
 */
const ENDPOINT = import.meta.env.PUBLIC_CONTACT_ENDPOINT as string | undefined;

const name = ref("");
const email = ref("");
const phone = ref("");
const projectType = ref("Residential");
const message = ref("");
// honeypot — bots auto-fill, humans don't see it
const company = ref("");

type Status = "idle" | "submitting" | "success" | "error";
const status = ref<Status>("idle");
const errorMessage = ref<string | null>(null);

const projectTypes = [
  "Residential",
  "Commercial",
  "Multi-family",
  "Other",
];

const isValid = computed(() => {
  return (
    name.value.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) &&
    message.value.trim().length >= 10
  );
});

async function submit(e: Event) {
  e.preventDefault();
  if (!isValid.value || status.value === "submitting") return;

  if (company.value) {
    // honeypot triggered — pretend success, drop silently
    status.value = "success";
    return;
  }

  if (!ENDPOINT) {
    errorMessage.value =
      "Contact endpoint not configured. Email hello@mwarchitectureinc.com directly.";
    status.value = "error";
    return;
  }

  status.value = "submitting";
  errorMessage.value = null;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.value.trim(),
        email: email.value.trim(),
        phone: phone.value.trim() || undefined,
        projectType: projectType.value,
        message: message.value.trim(),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Server returned ${res.status}`);
    }
    status.value = "success";
    name.value = "";
    email.value = "";
    phone.value = "";
    message.value = "";
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Something went wrong.";
    status.value = "error";
  }
}
</script>

<template>
  <form
    v-if="status !== 'success'"
    @submit="submit"
    class="space-y-5"
    novalidate
  >
    <!-- honeypot — hidden from humans + screen readers; bots tend to fill it -->
    <div aria-hidden="true" class="absolute -left-[9999px]">
      <label>
        Company
        <input
          v-model="company"
          type="text"
          tabindex="-1"
          autocomplete="off"
        />
      </label>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div>
        <label for="cf-name" class="block text-xs uppercase tracking-wide text-mid-grey mb-2">
          Name <span class="text-terracotta">*</span>
        </label>
        <input
          id="cf-name"
          v-model="name"
          type="text"
          required
          autocomplete="name"
          class="w-full bg-transparent border-b border-warm-grey focus:border-near-black focus:outline-none py-2 text-body"
        />
      </div>
      <div>
        <label for="cf-email" class="block text-xs uppercase tracking-wide text-mid-grey mb-2">
          Email <span class="text-terracotta">*</span>
        </label>
        <input
          id="cf-email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="w-full bg-transparent border-b border-warm-grey focus:border-near-black focus:outline-none py-2 text-body"
        />
      </div>
      <div>
        <label for="cf-phone" class="block text-xs uppercase tracking-wide text-mid-grey mb-2">
          Phone
        </label>
        <input
          id="cf-phone"
          v-model="phone"
          type="tel"
          autocomplete="tel"
          class="w-full bg-transparent border-b border-warm-grey focus:border-near-black focus:outline-none py-2 text-body"
        />
      </div>
      <div>
        <label
          for="cf-type"
          class="block text-xs uppercase tracking-wide text-mid-grey mb-2"
        >
          Project type
        </label>
        <!--
          Native <select> with appearance stripped + custom chevron, so it
          reads as part of the same editorial input language as the
          underlined text fields above it. The dropdown panel itself is
          OS-rendered (browsers don't allow styling it), but the field
          state matches the rest of the form.
        -->
        <div class="relative">
          <select
            id="cf-type"
            v-model="projectType"
            class="appearance-none w-full bg-transparent border-b border-warm-grey focus:border-near-black focus:outline-none py-2 pr-8 text-body cursor-pointer transition-colors font-display font-medium tracking-wide"
          >
            <option
              v-for="t in projectTypes"
              :key="t"
              :value="t"
              class="bg-off-white text-body"
            >
              {{ t }}
            </option>
          </select>
          <svg
            viewBox="0 0 24 24"
            class="pointer-events-none absolute right-1 bottom-3 size-4 text-mid-grey"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>

    <div>
      <label for="cf-message" class="block text-xs uppercase tracking-wide text-mid-grey mb-2">
        Tell us about your project <span class="text-terracotta">*</span>
      </label>
      <textarea
        id="cf-message"
        v-model="message"
        required
        rows="6"
        class="w-full bg-transparent border-b border-warm-grey focus:border-near-black focus:outline-none py-2 text-body resize-y"
      />
    </div>

    <p
      v-if="status === 'error' && errorMessage"
      class="text-sm text-terracotta"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <button
      type="submit"
      :disabled="!isValid || status === 'submitting'"
      class="inline-flex items-center px-6 py-3 bg-near-black text-off-white text-sm tracking-wide hover:bg-terracotta transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {{ status === "submitting" ? "Sending…" : "Send message" }}
    </button>
  </form>

  <div
    v-else
    class="border border-sage bg-sage/15 p-6 text-body"
    role="status"
  >
    <p class="text-lg font-semibold text-near-black">Thanks — your message is on its way.</p>
    <p class="mt-2 text-sm text-body/80">
      We&rsquo;ll get back to you within a few business days. If it&rsquo;s
      urgent, you can also email
      <a class="underline hover:text-terracotta" href="mailto:hello@mwarchitectureinc.com">hello@mwarchitectureinc.com</a>.
    </p>
  </div>
</template>
