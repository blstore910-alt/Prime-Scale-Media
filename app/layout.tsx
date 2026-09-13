import type { Metadata, Viewport } from "next";
import { Sora, Outfit } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "PSM - Dashboard",
  description: "",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PSM",
  },
  // Declaring `icons.apple` alone suppressed the app/icon.svg file
  // convention, so the page emitted no <link rel="icon"> and desktop tabs
  // showed no favicon. Declare the favicon explicitly: SVG for modern
  // browsers, a PNG fallback for those that don't render SVG favicons.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/icon-192.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};
export const viewport: Viewport = {
  // Light app chrome by default (the dashboard is light); the dark auth
  // pages override this to a dark bar via their own viewport export.
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

const sora = Sora({
  variable: "--font-sora",
  display: "swap",
  subsets: ["latin"],
});
const outfit = Outfit({
  variable: "--font-outfit",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={` ${sora.variable} ${outfit.variable} font-sans antialiased`}
      >
        <PwaRegister />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
