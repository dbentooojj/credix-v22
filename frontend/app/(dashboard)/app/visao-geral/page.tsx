import type { Metadata } from "next";
import { OverviewPageClient } from "../../../../components/overview-page-client";

export const metadata: Metadata = {
  title: "Visão geral",
};

export default function VisaoGeralPage() {
  return <OverviewPageClient />;
}
