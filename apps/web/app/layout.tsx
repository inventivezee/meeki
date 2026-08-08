import "./globals.css";

import type { Metadata } from "next";

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
  structuredData,
} from "./site";

const title = "Meeki — Your private meeting notekeeper";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "meeting notekeeper",
    "private meeting notes",
    "open-source meeting note-taker",
    "local AI transcription",
    "self-hosted meeting notes",
    "Meeki",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48 32x32 16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: SITE_ORIGIN,
    siteName: SITE_NAME,
    title,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: title,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          type="application/ld+json"
          // Server-rendered from a literal we control, so there is no user
          // input in this string.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
        />
      </body>
    </html>
  );
}
