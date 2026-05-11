import type { Metadata } from "next";
import { Syne, DM_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GeoStock AI — Geopolitical Stock Intelligence",
  description:
    "Live stock watchlist + 3D rotatable globe + AI-powered geopolitical event analysis.",
};

// Inline script that runs before paint to apply the persisted theme and avoid
// a flash of incorrect theme.
const themeBootstrapScript = `
(function() {
  try {
    var t = 'dark';
    var raw = localStorage.getItem('geostock-settings-v1');
    if (raw) {
      var parsed = JSON.parse(raw);
      var mode = parsed && parsed.state && parsed.state.theme;
      if (mode === 'light' || mode === 'dark') {
        t = mode;
      } else if (mode === 'auto' && window.matchMedia) {
        t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
    } else {
      var legacy = localStorage.getItem('geostock-theme');
      if (legacy === 'light' || legacy === 'dark') t = legacy;
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
