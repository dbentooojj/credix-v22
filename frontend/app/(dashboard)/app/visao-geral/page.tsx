import type { Metadata } from "next";
import { OverviewPageClient } from "../../../../components/overview-page-client";

export const metadata: Metadata = {
  title: "Visao geral",
};

export default function VisaoGeralPage() {
  return <OverviewPageClient />;
}
