import type { ArchiveFile, Draft } from "@/lib/archive-format";
import { formatBytes } from "@/lib/archive-format";
import { displayText } from "@/lib/display-text";

export function PublicationReview({
  draft,
  onEditFile,
  onEditCollection,
}: {
  draft: Draft;
  onEditFile: (file: ArchiveFile) => void;
  onEditCollection: () => void;
}) {
  return (
    <section
      className="publication-review"
      aria-labelledby="publication-review-title"
    >
      <div className="publication-review-heading">
        <h3 id="publication-review-title">What your readers will receive</h3>
        <button className="text-button" onClick={onEditCollection}>
          Edit collection note
        </button>
      </div>
      <p className="publication-note">
        {displayText(draft.description) ||
          "No collection note yet. A little context can help someone understand this archive years from now."}
      </p>
      <ol className="publication-file-list">
        {draft.files.map((file) => (
          <li key={file.id}>
            <div className="publication-file-heading">
              <strong>{displayText(file.name)}</strong>
              <button
                className="text-button"
                onClick={() => onEditFile(file)}
                aria-label={`Edit details for ${displayText(file.name)}`}
              >
                Edit details
              </button>
            </div>
            <span className="publication-file-size">
              {formatBytes(file.size)} · {file.type}
            </span>
            <dl>
              <dt>Description</dt>
              <dd>{displayText(file.caption) || "Not supplied"}</dd>
              <dt>Source and credit</dt>
              <dd>{displayText(file.source) || "Not supplied"}</dd>
            </dl>
          </li>
        ))}
      </ol>
      <div className="publication-disclosure">
        <strong>A public edition, including the originals.</strong>
        <p>
          These names, notes, sources and complete files will be readable by
          anyone with the address. Files keep their embedded metadata. The
          public inventory also includes checksums, the publication date, the
          previous edition and a timestamped storage estimate.
        </p>
        <p>
          Removing or changing an item later creates a new edition. It cannot
          erase earlier published copies. Remove anything unsuitable from this
          draft before publishing.
        </p>
      </div>
    </section>
  );
}
