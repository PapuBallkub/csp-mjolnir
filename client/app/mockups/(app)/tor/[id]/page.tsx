import { notFound } from "next/navigation";
import { getTor, tors } from "../../../_data/tors";
import { TorDetail } from "../../../_components/tor-detail";

export function generateStaticParams() {
  return tors.map((tor) => ({ id: tor.id }));
}

export default async function TorDetailPage({ params }: PageProps<"/mockups/tor/[id]">) {
  const { id } = await params;
  const tor = getTor(id);
  if (!tor) notFound();

  return <TorDetail tor={tor} />;
}
