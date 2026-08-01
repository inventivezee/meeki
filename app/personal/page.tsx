import type { Metadata } from "next";

import NotekeeperLanding from "../NotekeeperLanding";

const title = "Meeki — Your personal meeting notekeeper";
const description =
  "A personal, fully private, open-source meeting note-taker that keeps decisions and next steps under your control.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/personal" },
  openGraph: {
    type: "website",
    url: "/personal",
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

export default function PersonalNotekeeperPage() {
  return <NotekeeperLanding variant="personal" />;
}
