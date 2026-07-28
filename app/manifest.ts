import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ExpenseTracker",
    short_name: "Expenses",
    description: "Private receipt evidence and UK claim preparation.",
    start_url: "/",
    display: "standalone",
    background_color: "#152a2b",
    theme_color: "#152a2b",
    icons: [
      {
        src: "/expensetracker-logo.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
