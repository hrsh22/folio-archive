import { ReadingRoom } from "@/components/reading-room";
import { REFERENCE } from "@/lib/archive-format";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  if (!REFERENCE.test(reference)) notFound();
  return <ReadingRoom reference={reference.toLowerCase()} />;
}
