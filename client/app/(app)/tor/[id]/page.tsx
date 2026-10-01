import { notFound } from "next/navigation";
import { getTor } from "../../../_data/tors";
import { getTorInsight } from "../../../_lib/api";
import { TorDetail } from "../../../_components/tor-detail";

export default async function TorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 1. Try real API from MongoDB first
  const apiRes = await getTorInsight(id);
  if (apiRes.ok) {
    return <TorDetail insight={apiRes.data} />;
  }

  // 2. Fallback to fixture data if ID matches existing fixture
  const fixtureTor = getTor(id);
  if (fixtureTor) {
    return <TorDetail tor={fixtureTor} />;
  }

  notFound();
}
