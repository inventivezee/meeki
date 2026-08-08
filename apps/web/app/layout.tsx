import "./globals.css";

import type { Metadata } from "next";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Meeki — Your private meeting notekeeper";
  const description =
    "A fully private, open-source meeting note-taker that runs locally, works with your own AI, and can be self-hosted.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: "Meeki",
    keywords: [
      "meeting notekeeper",
      "private meeting notes",
      "open-source meeting note-taker",
      "local AI transcription",
      "self-hosted meeting notes",
      "Meeki",
    ],
    openGraph: {
      type: "website",
      url: origin,
      siteName: "Meeki",
      title,
      description,
      images: [
        {
          url: `${origin}/og.png`,
          width: 1536,
          height: 1024,
          alt: "Meeki — Your private meeting notekeeper",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
