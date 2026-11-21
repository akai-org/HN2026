// Podgląd pliku przed wysłaniem (zdjęcie albo PDF) w oknie dialogowym.
import { formatSize } from "../lib/text.js";
import { Button, Modal } from "./primitives.jsx";
import { SourceViewer } from "./viewers.jsx";

function sourceOf(item) {
  if (!item) return null;
  if (item.type?.kind === "image") return { kind: "image", url: item.previewUrl, name: item.name };
  if (item.type?.kind === "pdf") return { kind: "pdf", file: item.file, name: item.name };
  return { kind: "none", name: item.name };
}

export default function PreviewDialog({ item, onClose }) {
  const source = sourceOf(item);
  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      size="xl"
      title={item?.name ?? "Podgląd"}
      description={item ? `${item.type?.label ?? "Plik"} · ${formatSize(item.size)}` : undefined}
      footer={
        <Button variant="primary" onClick={onClose}>
          Zamknij podgląd
        </Button>
      }
    >
      <div className="-mx-6 -my-5 h-[min(70dvh,760px)]">{source && <SourceViewer source={source} />}</div>
    </Modal>
  );
}
