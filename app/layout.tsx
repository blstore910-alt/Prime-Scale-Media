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
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};
export const viewport: Viewport = {
  themeColor: "#2b7fff",
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
