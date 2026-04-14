import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PSM Dashboard",
    short_name: "PSM",
    start_url: "/pwa",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2b7fff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
