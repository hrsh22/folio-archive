"use client";

import { useRef, useState } from "react";
import type { ArchiveFile } from "@/lib/archive-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function FileDetailsDialog({
  file,
  onClose,
  onSave,
}: {
  file: ArchiveFile;
  onClose: () => void;
  onSave: (
    details: Pick<ArchiveFile, "name" | "caption" | "source">,
  ) => Promise<void>;
}) {
  const [name, setName] = useState(file.name);
  const [caption, setCaption] = useState(file.caption);
  const [source, setSource] = useState(file.source);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>A note for this item.</DialogTitle>
          <DialogDescription>
            Give a future reader the context you would share in person. These
            details become public when you publish the collection.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            const publicName = name.normalize("NFC").trim();
            const invalidName = !publicName
              ? "Enter a public filename."
              : publicName.length > 240
                ? "Keep the public filename to 240 characters or fewer."
                : /[\/\\\x00-\x1f\x7f]/.test(publicName) ||
                    publicName === "." ||
                    publicName === ".."
                  ? "Use a filename without folder separators, control characters, or a name made only of one or two dots."
                  : "";
            setNameError(invalidName);
            setError("");
            if (invalidName) {
              nameInput.current?.focus();
              return;
            }
            setSaving(true);
            try {
              await onSave({ name: publicName, caption, source });
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not save the item details.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="form-field">
            <Label htmlFor="file-public-name">Public filename</Label>
            <Input
              id="file-public-name"
              ref={nameInput}
              value={name}
              required
              maxLength={240}
              aria-invalid={!!nameError}
              aria-describedby={`file-name-help${nameError ? " file-name-error" : ""}`}
              onChange={(event) => {
                setName(event.target.value);
                setNameError("");
              }}
              disabled={saving}
            />
            <small id="file-name-help" className="field-help">
              Keep its extension, such as .jpg or .pdf, so downloaded copies
              open normally. The original file bytes do not change.
            </small>
            {nameError && (
              <p id="file-name-error" className="metadata-error" role="alert">
                {nameError}
              </p>
            )}
          </div>
          <div className="form-field">
            <Label htmlFor="file-caption">
              Description <span>(optional)</span>
            </Label>
            <Textarea
              id="file-caption"
              value={caption}
              maxLength={2000}
              rows={3}
              placeholder="What does this show? Include the date, language or page order if known."
              onChange={(event) => setCaption(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="file-source">
              Source and credit <span>(optional)</span>
            </Label>
            <Textarea
              id="file-source"
              value={source}
              maxLength={2000}
              rows={3}
              placeholder="Who made or supplied it? Add a collection reference and reuse terms if known."
              onChange={(event) => setSource(event.target.value)}
              disabled={saving}
            />
          </div>
          <p className="fine-print">
            Leave out private contact details. Editing this note does not remove
            names, locations or other metadata embedded inside the original
            file.
          </p>
          {error && (
            <p className="metadata-error" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving details…" : "Save item details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
