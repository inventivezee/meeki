import type { Metadata } from "next";

import NotekeeperLanding from "./NotekeeperLanding";

const title = "Meeki — Your private meeting notekeeper";
const description =
  "A fully private, open-source meeting note-taker that runs locally, works with your own AI, and can be self-hosted.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Meeki",
    title,
    description,
    images: [
      {
        url: "/og.png",
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
    images: ["/og.png"],
  },
};

export default function Home() {
  return <NotekeeperLanding variant="private" />;
}
