import { notFound } from "next/navigation";
import { getTorInsight } from "../../../_lib/api";
import { TorDetail } from "../../../_components/tor-detail";

export default async function TorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch real normalized TOR insight directly from database API
  const apiRes = await getTorInsight(id);
  if (apiRes.ok) {
    return <TorDetail insight={apiRes.data} />;
  }

  notFound();
}
