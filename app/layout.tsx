import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { THEME_STORAGE_KEY } from "./theme";
import { PwaLifecycle } from "./components/PwaLifecycle";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/forms.css";
import "./styles/views.css";
import "./styles/today.css";
import "./styles/ledgers.css";
import "./styles/claims-settings.css";
import "./styles/intake.css";
import "./styles/international.css";
import "./styles/itinerary.css";
import "./styles/calendar.css";
import "./styles/statistics.css";
import "./styles/statistics-allowance.css";
import "./styles/statistics-map-responsive.css";
import "./styles/responsive.css";
import "maplibre-gl/dist/maplibre-gl.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const base = host ? new URL(`${protocol}://${host}`) : undefined;
  const description =
    "Private receipt capture, expense review and claim preparation.";

  return {
    metadataBase: base,
    title: {
      default: "ExpenseTracker",
      template: "%s · ExpenseTracker",
    },
    description,
    applicationName: "ExpenseTracker",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Expenses",
    },
    formatDetection: { telephone: false },
    icons: {
      icon: "/expensetracker-logo.png",
      apple: "/expensetracker-logo.png",
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      type: "website",
      title: "ExpenseTracker",
      description,
      images: [{ url: "/og-v2.png", width: 1536, height: 1024 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ExpenseTracker",
      description,
      images: ["/og-v2.png"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#07101f" },
    { media: "(prefers-color-scheme: dark)", color: "#02050d" },
  ],
};

const themeBootstrap = `
try {
  var savedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
  if (savedTheme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else if (savedTheme === "light" || savedTheme === "dark") {
    document.documentElement.dataset.theme = savedTheme;
  } else {
    document.documentElement.dataset.theme = "dark";
  }
} catch (_) {
  document.documentElement.dataset.theme = "dark";
}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <PwaLifecycle />
        {children}
      </body>
    </html>
  );
}
