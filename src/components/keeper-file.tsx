"use client";
import { useEffect, useState } from "react";
import type { ArchiveFile } from "@/lib/archive-format";
import { sha256 } from "@/lib/browser-recovery";

export async function readKeeperFile(
  draftId: string,
  file: ArchiveFile,
  signal?: AbortSignal,
) {
  const bytes = new Uint8Array(file.size),
    chunk = 2 * 1024 * 1024;
  for (let part = 0; part < Math.max(1, Math.ceil(file.size / chunk)); part++) {
    const response = await fetch(
      `/api/drafts/${draftId}/files/${file.id}?part=${part}`,
      { signal, cache: "no-store" },
    );
    if (!response.ok)
      throw new Error("The keeper could not retrieve this file. Please retry.");
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== Math.min(chunk, file.size - part * chunk))
      throw new Error("File part is incomplete.");
    bytes.set(data, part * chunk);
  }
  if ((await sha256(bytes)) !== file.sha256)
    throw new Error("File checksum mismatch.");
  return bytes;
}
export function KeeperImage({
  draftId,
  file,
  ...props
}: {
  draftId: string;
  file: ArchiveFile;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "",
      alive = true;
    readKeeperFile(draftId, file, controller.signal)
      .then((bytes) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: file.type }),
        );
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draftId, file.id, file.sha256]);
  return url ? (
    <img src={url} {...props} />
  ) : (
    <div className="image-placeholder" aria-label="Loading preview">
      Loading…
    </div>
  );
}
