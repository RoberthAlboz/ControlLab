import { useState } from "react";
import {
  Archive,
  Box,
  Download,
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderUp,
  Link2,
  LoaderCircle,
  Paperclip,
  Presentation,
  Ruler,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_KIND_LABEL,
  ATTACHMENT_UPLOAD_PATH,
  attachmentFolder,
  attachmentKind,
  formatAttachmentSize,
  isAllowedAttachmentName,
  isHttpsUrl,
  isLinkAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  type AttachmentKind,
  type ContentAttachment,
} from "@shared/attachments";

const KIND_ICON: Record<AttachmentKind, typeof File> = {
  pdf: FileText,
  image: FileImage,
  model: Box,
  cad: Ruler,
  document: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: Archive,
  video: FileVideo,
  text: FileText,
  link: Link2,
};

type Group = { folder: string; items: ContentAttachment[] };

function groupByFolder(attachments: ContentAttachment[]): Group[] {
  const groups: Group[] = [];
  for (const attachment of attachments) {
    const folder = isLinkAttachment(attachment) ? "" : attachmentFolder(attachment.name);
    const group = groups.find(item => item.folder === folder);
    if (group) group.items.push(attachment);
    else groups.push({ folder, items: [attachment] });
  }
  // Arquivos soltos primeiro, depois as pastas.
  return groups.sort((a, b) => Number(Boolean(a.folder)) - Number(Boolean(b.folder)));
}

function displayName(attachment: ContentAttachment, insideFolder: boolean) {
  return insideFolder ? attachment.name.slice(attachment.name.indexOf("/") + 1) : attachment.name;
}

async function uploadAttachment(file: File, name: string): Promise<ContentAttachment> {
  const response = await fetch(ATTACHMENT_UPLOAD_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(name),
    },
    body: file,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `Falha ao enviar ${name}.`);
  return payload as ContentAttachment;
}

function AttachmentRow({
  attachment,
  insideFolder,
  onRemove,
}: {
  attachment: ContentAttachment;
  insideFolder: boolean;
  onRemove?: () => void;
}) {
  const kind = attachmentKind(attachment);
  const Icon = KIND_ICON[kind];
  const link = isLinkAttachment(attachment);
  const name = displayName(attachment, insideFolder);
  const meta = [ATTACHMENT_KIND_LABEL[kind], formatAttachmentSize(attachment.size)].filter(Boolean).join(" · ");
  return (
    <li className={`att-row is-${kind}`}>
      <span className="att-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <a
        className="att-name"
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        download={link ? undefined : name.split("/").pop()}
        title={attachment.name}
      >
        <strong>{name}</strong>
        <small>{link ? new URL(attachment.url).hostname : meta}</small>
      </a>
      {onRemove ? (
        <button type="button" className="att-remove" onClick={onRemove} aria-label={`Remover ${name}`} title="Remover anexo">
          <X size={14} aria-hidden="true" />
        </button>
      ) : (
        <span className="att-action" aria-hidden="true">
          {link ? <ExternalLink size={14} /> : <Download size={14} />}
        </span>
      )}
    </li>
  );
}

function AttachmentGroups({
  attachments,
  onRemove,
  onRemoveFolder,
}: {
  attachments: ContentAttachment[];
  onRemove?: (id: string) => void;
  onRemoveFolder?: (folder: string) => void;
}) {
  return (
    <div className="att-groups">
      {groupByFolder(attachments).map(group => (
        <div className="att-group" key={group.folder || "_root"}>
          {group.folder && (
            <div className="att-folder">
              <Folder size={15} aria-hidden="true" />
              <strong>{group.folder}</strong>
              <small>
                {group.items.length} {group.items.length === 1 ? "arquivo" : "arquivos"}
              </small>
              {onRemoveFolder && (
                <button
                  type="button"
                  className="att-remove"
                  onClick={() => onRemoveFolder(group.folder)}
                  aria-label={`Remover a pasta ${group.folder}`}
                  title="Remover pasta"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          <ul className={group.folder ? "att-list is-nested" : "att-list"}>
            {group.items.map(attachment => (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                insideFolder={Boolean(group.folder)}
                onRemove={onRemove ? () => onRemove(attachment.id) : undefined}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Lista somente leitura usada pelo aluno (e pelo docente na visualização). */
export function AttachmentList({ attachments, title = "Materiais de apoio" }: { attachments: ContentAttachment[]; title?: string }) {
  if (!attachments.length) return null;
  return (
    <section className="att-viewer" aria-label={title}>
      <span className="eyebrow">
        <Paperclip size={12} aria-hidden="true" /> {title.toUpperCase()} · {attachments.length}
      </span>
      <AttachmentGroups attachments={attachments} />
    </section>
  );
}

/** Editor de anexos: arquivos, pasta inteira ou link externo. */
export function AttachmentEditor({
  attachments,
  onChange,
  label = "Anexos",
  hint = "PDF, planilhas, desenhos CAD, modelos 3D, vídeos ou .zip — até 50 MB por arquivo.",
}: {
  attachments: ContentAttachment[];
  onChange: (attachments: ContentAttachment[]) => void;
  label?: string;
  hint?: string;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const remaining = MAX_ATTACHMENTS_PER_ITEM - attachments.length;

  const uploadFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const problems: string[] = [];
    const accepted = files.filter(file => {
      const name = file.webkitRelativePath || file.name;
      if (!isAllowedAttachmentName(name)) {
        problems.push(`${name}: tipo de arquivo não permitido.`);
        return false;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        problems.push(`${name}: maior que 50 MB.`);
        return false;
      }
      return true;
    });
    if (accepted.length > remaining) {
      problems.push(`Limite de ${MAX_ATTACHMENTS_PER_ITEM} anexos: ${accepted.length - remaining} arquivo(s) ficaram de fora.`);
      accepted.splice(Math.max(0, remaining));
    }
    setErrors(problems);
    if (!accepted.length) return;
    setProgress({ done: 0, total: accepted.length });
    const uploaded: ContentAttachment[] = [];
    for (const file of accepted) {
      const name = file.webkitRelativePath || file.name;
      try {
        uploaded.push(await uploadAttachment(file, name));
      } catch (error) {
        problems.push(error instanceof Error ? error.message : `Falha ao enviar ${name}.`);
      }
      setProgress(current => (current ? { ...current, done: current.done + 1 } : current));
    }
    setProgress(null);
    setErrors([...problems]);
    if (uploaded.length) onChange([...attachments, ...uploaded]);
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!isHttpsUrl(url)) {
      setErrors(["Use um link HTTPS completo, ex.: https://drive.google.com/…"]);
      return;
    }
    onChange([
      ...attachments,
      {
        id: `att-${crypto.randomUUID()}`,
        name: linkName.trim() || new URL(url).hostname,
        url,
        size: 0,
        mimeType: "text/uri-list",
      },
    ]);
    setLinkUrl("");
    setLinkName("");
    setLinkOpen(false);
    setErrors([]);
  };

  const busy = progress !== null;
  const full = remaining <= 0;
  return (
    <div className="att-editor">
      <div className="att-editor-head">
        <span>
          <Paperclip size={13} aria-hidden="true" /> {label}
          {attachments.length > 0 && <b>{attachments.length}</b>}
        </span>
        <div className="att-editor-actions">
          <label className={`me-btn me-btn-ghost${busy || full ? " is-disabled" : ""}`}>
            <Upload size={14} aria-hidden="true" /> Arquivos
            <input
              type="file"
              multiple
              hidden
              accept={ATTACHMENT_ACCEPT}
              disabled={busy || full}
              onChange={event => {
                void uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <label className={`me-btn me-btn-ghost${busy || full ? " is-disabled" : ""}`}>
            <FolderUp size={14} aria-hidden="true" /> Pasta
            <input
              type="file"
              multiple
              hidden
              disabled={busy || full}
              ref={element => element?.setAttribute("webkitdirectory", "")}
              onChange={event => {
                void uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="me-btn me-btn-ghost"
            onClick={() => setLinkOpen(open => !open)}
            disabled={busy || full}
            aria-expanded={linkOpen}
          >
            <Link2 size={14} aria-hidden="true" /> Link
          </button>
        </div>
      </div>

      {linkOpen && (
        <div className="att-link-form">
          <input
            className="me-input"
            value={linkUrl}
            onChange={event => setLinkUrl(event.target.value)}
            placeholder="https://drive.google.com/… (pasta, vídeo, site)"
            aria-label="Endereço do link"
            autoFocus
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLink();
              }
            }}
          />
          <input
            className="me-input"
            value={linkName}
            onChange={event => setLinkName(event.target.value)}
            placeholder="Nome exibido (opcional)"
            aria-label="Nome do link"
            maxLength={120}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLink();
              }
            }}
          />
          <button type="button" className="me-btn me-btn-soft" onClick={addLink}>
            Adicionar
          </button>
        </div>
      )}

      {busy && (
        <p className="att-status" role="status">
          <LoaderCircle size={14} className="me-spin" aria-hidden="true" /> Enviando {progress.done + 1 > progress.total ? progress.total : progress.done + 1} de {progress.total}…
        </p>
      )}
      {errors.length > 0 && (
        <ul className="att-errors" role="alert">
          {errors.map(error => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {attachments.length > 0 ? (
        <AttachmentGroups
          attachments={attachments}
          onRemove={id => onChange(attachments.filter(item => item.id !== id))}
          onRemoveFolder={folder =>
            onChange(attachments.filter(item => isLinkAttachment(item) || attachmentFolder(item.name) !== folder))
          }
        />
      ) : (
        !busy && <small className="att-hint">{hint}</small>
      )}
    </div>
  );
}
