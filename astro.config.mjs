// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: 'https://mwarchitectureinc.com',

  // SSR mode is required by the Cloudflare adapter so /api/contact can
  // run server-side. Each *page* opts back into static rendering with
  // `export const prerender = true;` so the marketing site is still
  // entirely pre-built — only API endpoints hit the Worker at runtime.
  output: 'server',

  integrations: [
    vue(),
    mdx(),
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  image: {
    // Use Astro's built-in sharp service for image optimisation.
    service: { entrypoint: 'astro/assets/services/sharp' },
  },

  build: {
    inlineStylesheets: 'auto',
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },

  adapter: cloudflare()
});