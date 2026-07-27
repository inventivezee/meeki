import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Meeki — Your private meeting note-taker";
  const description =
    "Open-source meeting notes that stay on your device. Run local models, bring your own AI, self-host, or use Meeki managed.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: "Meeki",
    keywords: [
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
          width: 1731,
          height: 909,
          alt: "Meeki — private, open-source meeting notes",
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
