import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wai",
    short_name: "Wai",
    description: "A fitness tracker for your farm's water",
    start_url: "/app",
    display: "standalone",
    background_color: "#f4f6ef",
    theme_color: "#f4f6ef",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
