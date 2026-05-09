<script setup lang="ts">
import { ref, computed } from "vue";

/**
 * Contact form — posts same-origin to /api/contact, an Astro server
 * endpoint that runs on the same Cloudflare Worker as the rest of the
 * site. No CORS, no env var to wire up; secrets live on the Worker.
 */
const ENDPOINT = "/api/contact";

const name = ref("");
const email = ref("");
const phone = ref("");
const projectType = ref("Residential");
const message = ref("");
// honeypot — bots auto-fill, humans don't see it
const company = ref("");

/**
 * Auto-formats a US-style phone number as the user types:
 *   ""           → ""
 *   "8"          → "(8"
 *   "818"        → "(818"
 *   "8184"       → "(818) 4"
 *   "818414"     → "(818) 414"
 *   "8184147101" → "(818) 414-7101"
 * Anything past 10 digits is ignored. Non-digit chars are stripped before
 * re-formatting, so paste-and-tweak works naturally.
 */
function formatUsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function onPhoneInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const formatted = formatUsPhone(target.value);
  phone.value = formatted;
  // Mirror the canonical formatted string back into the field so the
  // caret position lines up with the formatted view (Vue would otherwise
  // hold the raw input until the next render).
  target.value = formatted;
}

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
          :value="phone"
          @input="onPhoneInput"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          maxlength="14"
          placeholder="(805) 555-0100"
          class="w-full bg-transparent border-b border-warm-grey focus:border-near-black focus:outline-none py-2 text-body placeholder:text-warm-grey/70"
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
      urgent, you can also just give us a call directly!
    </p>
  </div>
</template>
