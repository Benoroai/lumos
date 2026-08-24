"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  uploadMediaAction,
  type UploadedMedia,
} from "@/lib/actions/business/media";
import { ALLOWED_IMAGE_TYPES } from "@/lib/validation/catalog";
import { cn } from "@/lib/utils";

/**
 * Single-image picker with upload.
 *
 * Type and size are checked before the request is made so an obviously-wrong
 * file fails instantly, and again on the server (which is the check that
 * actually matters). Alt text is prompted for because an image with no
 * description is unusable on a menu read by a screen reader.
 */
export function MediaPicker({
  label,
  value,
  onChange,
  kind = "image",
  disabled = false,
  maxBytes = 5 * 1024 * 1024,
}: {
  label: string;
  value: string | null;
  onChange: (asset: UploadedMedia | null) => void;
  kind?: "image" | "logo" | "icon" | "gallery";
  disabled?: boolean;
  maxBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [altText, setAltText] = useState("");
  const [progress, setProgress] = useState(false);

  function upload(file: File) {
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP, AVIF and SVG images are accepted.");
      return;
    }
    if (file.size > maxBytes) {
      toast.error(
        `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`,
      );
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("kind", kind);
    formData.set("altText", altText);

    setProgress(true);
    startTransition(async () => {
      const result = await uploadMediaAction(formData);
      setProgress(false);

      if (result.ok) {
        onChange(result.data);
        toast.success("Image uploaded");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      {value ? (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="size-20 rounded-lg object-cover" />
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Alt text — describe the image"
              aria-label="Alt text"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={disabled || pending}
                onClick={() => inputRef.current?.click()}
              >
                <Upload /> Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || pending}
                onClick={() => onChange(null)}
              >
                <Trash2 className="text-[var(--danger)]" /> Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file && !disabled) upload(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver
              ? "border-[var(--primary)] bg-[var(--primary-soft)]"
              : "border-[var(--border-strong)] bg-[var(--surface-muted)]",
            disabled && "opacity-60",
          )}
        >
          {progress ? (
            <>
              <Loader2 className="size-5 animate-spin text-[var(--primary)]" />
              <p className="text-sm text-[var(--foreground-muted)]">
                Uploading…
              </p>
            </>
          ) : (
            <>
              <ImagePlus className="size-6 text-[var(--foreground-subtle)]" />
              <p className="text-sm text-[var(--foreground-muted)]">
                Drop an image here, or
                <button
                  type="button"
                  className="ms-1 font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                >
                  browse
                </button>
              </p>
              <p className="text-xs text-[var(--foreground-subtle)]">
                JPEG, PNG, WebP, AVIF or SVG · up to{" "}
                {Math.round(maxBytes / 1024 / 1024)} MB
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
