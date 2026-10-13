import type { MetadataRoute } from "next";

/** Lets staff add Wagbook to their phone's home screen so it opens like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wagbook",
    short_name: "Wagbook",
    description: "Run your pet boarding kennel from your phone.",
    start_url: "/app",
    display: "standalone",
    background_color: "#edf0f5",
    theme_color: "#14213d",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
