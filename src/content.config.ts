import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Portfolio projects.
 *
 * One MDX file per project lives in /src/content/projects/<slug>.mdx
 * and references images in /src/content/projects/images/<slug>/...
 *
 * The body is MDX so Moritz (or the developer) can drop <Gallery id={n} />
 * inline between paragraphs to break up long descriptions with imagery.
 */
const projects = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/projects",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      location: z.string(),
      summary: z.string(),
      coverImage: image(),
      // Free-form tag list ("Residential", "Commercial", "Multi-family", etc.)
      categories: z.array(z.string()).default([]),
      // One entry per <Gallery id={n} /> block in the MDX body. Each entry
      // is a list of images that the carousel should rotate through.
      galleries: z
        .array(
          z.object({
            images: z.array(image()).min(1),
            caption: z.string().optional(),
          })
        )
        .default([]),
      // Optional ordering — lower numbers appear first on /portfolio.
      // If omitted, falls back to date desc.
      order: z.number().optional(),
      // Hides project from /portfolio while keeping the URL live.
      draft: z.boolean().default(false),
    }),
});

export const collections = { projects };
