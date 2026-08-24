"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { MediaPicker } from "./media-picker";
import {
  deleteMediaAction,
  updateMediaAction,
} from "@/lib/actions/business/media";
import { formatDateTime } from "@/lib/format/date";

export type MediaAssetView = {
  id: string;
  url: string;
  path: string;
  altText: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  createdAt: string;
};

export function MediaLibrary({
  assets,
  canManage,
  maxBytes,
}: {
  assets: MediaAssetView[];
  canManage: boolean;
  maxBytes: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [altEdits, setAltEdits] = useState<Record<string, string>>({});

  function saveAlt(asset: MediaAssetView) {
    const altText = altEdits[asset.id];
    if (altText === undefined || altText === asset.altText) return;

    startTransition(async () => {
      const result = await updateMediaAction({ mediaId: asset.id, altText });
      if (result.ok) {
        toast.success("Alt text saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(asset: MediaAssetView) {
    startTransition(async () => {
      const result = await deleteMediaAction(asset.id);
      if (result.ok) {
        toast.success(result.message ?? "Removed");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <div className="surface-card p-5">
          <MediaPicker
            label="Upload an image"
            value={null}
            maxBytes={maxBytes}
            onChange={() => router.refresh()}
          />
        </div>
      ) : null}

      {assets.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No media yet"
          description="Upload images here and reuse them across your catalog. Files are stored in a folder that only this business can reach."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <li key={asset.id} className="surface-card overflow-hidden">
              <div className="aspect-[4/3] bg-[var(--surface-inset)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt={asset.altText}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </div>

              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-[var(--foreground-muted)]">
                    {asset.originalFilename || asset.path.split("/").pop()}
                  </p>
                  <Badge tone="neutral">
                    {Math.round(asset.sizeBytes / 1024)} KB
                  </Badge>
                </div>

                <Input
                  value={altEdits[asset.id] ?? asset.altText}
                  onChange={(e) =>
                    setAltEdits((prev) => ({
                      ...prev,
                      [asset.id]: e.target.value,
                    }))
                  }
                  onBlur={() => saveAlt(asset)}
                  placeholder="Alt text"
                  disabled={!canManage || pending}
                  aria-label={`Alt text for ${asset.originalFilename}`}
                  className="h-8 text-xs"
                />

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--foreground-subtle)]">
                    {formatDateTime(asset.createdAt)}
                  </span>
                  <div className="flex items-center gap-1">
                    <CopyButton value={asset.url} label="Copy URL" />
                    {canManage ? (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label="Delete image"
                          >
                            <Trash2 className="text-[var(--danger)]" />
                          </Button>
                        }
                        title="Delete this image?"
                        description="The file is removed from storage. Anything still pointing at it will lose its picture."
                        confirmLabel="Delete"
                        onConfirm={() => remove(asset)}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
