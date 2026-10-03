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

  const result = await getTorInsight(id);
  if (result.ok) {
    return <TorDetail insight={result.data} />;
  }

  // Mockup TORs (BMA-…) are never in the API, but other screens still link them
  const fixtureTor = getTor(id);
  if (fixtureTor) {
    return <TorDetail tor={fixtureTor} />;
  }

  // Only the API saying so means there is no such TOR. Anything else (the API
  // down, unreachable, or failing) is an error and shows as one, in error.tsx,
  // rather than as a "not found" that sends the reader looking in the wrong place
  if (result.error.status === 404) {
    notFound();
  }
  throw new Error(
    `TOR ${id}: the API ${result.error.status ? `answered ${result.error.status}` : "did not answer"} (${result.error.message})`,
  );
}
