import { trpc } from "@/lib/trpc";
import { STOCK_HEALTH_LABELS } from "@shared/inventory";
import { AttachmentEditor } from "@/components/ModuleAttachments";
import StepQuizEditor from "@/components/StepQuizEditor";
import type { StepQuiz } from "@shared/quiz";
import type { StepQuizData } from "./shared";

/** O docente recebe o quiz completo; um quiz sem gabarito (não deveria chegar aqui) começa marcado na 1ª. */
function toEditableQuiz(quiz: StepQuizData | null | undefined): StepQuiz | null {
  if (!quiz) return null;
  return { question: quiz.question, options: quiz.options, correctIndex: quiz.correctIndex ?? 0, explanation: quiz.explanation ?? "" };
}
import {
  ArrowLeft,
  Box,
  Check,
  Target,
  Lightbulb,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  type Category,
  MODULE_KIND_SUGGESTIONS,
  sameKind,
  type Resource,
  type Step,
  type DidacticModule,
  newContentId,
  iconByCategory,
  toDataUrl,
} from "./shared";

export function Editor({
  module,
  onChange,
  onClose,
  onSave,
  onDelete,
  canDelete,
  saving,
}: {
  module: DidacticModule;
  onChange: (module: DidacticModule) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  canDelete: boolean;
  saving: boolean;
}) {
  const update = (patch: Partial<DidacticModule>) =>
    onChange({ ...module, ...patch });
  // Itens ativos do estoque para vincular aos recursos (consulta exclusiva de docentes).
  const linkableQuery = trpc.inventory.items.linkable.useQuery(undefined, {
    staleTime: 30_000,
  });
  const updateResource = (index: number, patch: Partial<Resource>) => {
    const resources = [...module.resources];
    resources[index] = { ...resources[index], ...patch };
    update({ resources });
  };
  const updateStep = (index: number, patch: Partial<Step>) => {
    const steps = [...module.steps];
    steps[index] = { ...steps[index], ...patch };
    update({ steps });
  };
  const addStep = () =>
    update({
      steps: [
        ...module.steps,
        {
          id: newContentId("step"),
          title: "Nova etapa",
          description: "Descreva o procedimento desta etapa.",
          tip: "Adicione uma dica do instrutor.",
        },
      ],
    });
  const addResource = () =>
    update({
      resources: [
        ...module.resources,
        {
          id: newContentId("resource"),
          category: "tools",
          label: "Novo recurso",
          title: "Novo recurso técnico",
          detail: "Adicione uma descrição",
          status: "Novo",
          progress: 0,
          modelUrl: "",
          icon: Wrench,
          color: "#991b1b",
          inventoryItemId: null,
        },
      ],
    });
  const coverPresets = [
    "#e4e8f0",
    "#fde6e6",
    "#f3e8d8",
    "#e2efe6",
    "#2b2323",
    "#8e0707",
  ];
  return (
    <div className="me-shell">
      <header className="me-topbar">
        <button
          className="me-back"
          onClick={onClose}
          aria-label="Fechar editor"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="me-topbar-title">
          <span>Área docente · Editor de conteúdo</span>
          <h1>
            {module.title || "Módulo sem nome"}
            <em className={module.published ? "is-live" : ""}>
              {module.published ? "Publicado" : "Rascunho"}
            </em>
          </h1>
        </div>
        <div className="me-topbar-actions">
          {canDelete && (
            <button className="me-btn me-btn-danger" onClick={onDelete}>
              <Trash2 size={15} />
              <span>Excluir</span>
            </button>
          )}
          <button
            className="me-btn me-btn-primary"
            onClick={onSave}
            disabled={saving || !module.kind.trim()}
            title={module.kind.trim() ? undefined : "Informe o tipo do módulo"}
          >
            {saving ? (
              <>
                <LoaderCircle size={15} className="me-spin" /> Salvando…
              </>
            ) : (
              <>
                <Save size={15} /> Salvar alterações
              </>
            )}
          </button>
        </div>
      </header>

      <div className="me-body">
        <main className="me-main">
          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>Informações gerais</h2>
                <p>O que o aluno vê no card e na abertura do módulo.</p>
              </div>
            </div>
            <div className="me-fields">
              <label className="me-field me-span-2">
                <span>Nome do módulo</span>
                <input
                  className="me-input"
                  value={module.title}
                  placeholder="Ex.: Ajuste e acabamento"
                  onChange={e => update({ title: e.target.value })}
                />
              </label>
              <div className="me-field me-span-2">
                <label htmlFor="module-kind-input">Tipo</label>
                <input
                  id="module-kind-input"
                  className="me-input"
                  value={module.kind}
                  maxLength={40}
                  placeholder="Ex.: Ferramenta, Montagem, Processo, Segurança…"
                  aria-invalid={!module.kind.trim()}
                  aria-describedby="module-kind-hint"
                  onChange={e => update({ kind: e.target.value })}
                />
                <div
                  className="me-kind-suggestions"
                  role="group"
                  aria-label="Exemplos de tipo"
                >
                  {MODULE_KIND_SUGGESTIONS.map(kind => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={sameKind(module.kind, kind)}
                      className={sameKind(module.kind, kind) ? "is-active" : ""}
                      onClick={() => update({ kind })}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                <small id="module-kind-hint" className="me-kind-hint">
                  {module.kind.trim()
                    ? "Escreva o tipo que fizer sentido para a turma ou use um exemplo."
                    : "Informe o tipo do módulo para poder salvar."}
                </small>
              </div>
              <label className="me-field">
                <span>Descrição</span>
                <textarea
                  className="me-input"
                  value={module.description}
                  placeholder="Resumo do que será trabalhado."
                  onChange={e => update({ description: e.target.value })}
                />
              </label>
              <label className="me-field">
                <span>
                  <Target size={13} /> Objetivo pedagógico
                </span>
                <textarea
                  className="me-input"
                  value={module.objective}
                  placeholder="Ao final, o aluno será capaz de…"
                  onChange={e => update({ objective: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>
                  Etapas do tutorial <b>{module.steps.length}</b>
                </h2>
                <p>A sequência que o aluno segue durante a aula.</p>
              </div>
              {module.steps.length > 0 && (
                <button className="me-btn me-btn-soft" onClick={addStep}>
                  <Plus size={15} /> Etapa
                </button>
              )}
            </div>
            {module.steps.length === 0 ? (
              <div className="me-empty">
                <div className="me-empty-icon">
                  <Layers3 size={22} />
                </div>
                <strong>Nenhuma etapa ainda</strong>
                <p>
                  Divida o tutorial em passos curtos, com descrição, dica do
                  instrutor e uma imagem de apoio.
                </p>
                <button className="me-btn me-btn-primary" onClick={addStep}>
                  <Plus size={15} /> Adicionar primeira etapa
                </button>
              </div>
            ) : (
              <ol className="me-steps">
                {module.steps.map((step, index) => (
                  <li className="me-step" key={step.id}>
                    <div className="me-step-num">{index + 1}</div>
                    <div className="me-step-body">
                      <div className="me-step-top">
                        <input
                          className="me-input me-step-title"
                          aria-label={`Título da etapa ${index + 1}`}
                          value={step.title}
                          onChange={e =>
                            updateStep(index, { title: e.target.value })
                          }
                        />
                        <button
                          className="me-icon-btn"
                          onClick={() =>
                            update({
                              steps: module.steps.filter(
                                item => item.id !== step.id
                              ),
                            })
                          }
                          aria-label={`Excluir etapa ${index + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <textarea
                        className="me-input"
                        aria-label={`Descrição da etapa ${index + 1}`}
                        value={step.description}
                        onChange={e =>
                          updateStep(index, { description: e.target.value })
                        }
                      />
                      <label className="me-tip">
                        <Lightbulb size={15} />
                        <input
                          aria-label={`Dica da etapa ${index + 1}`}
                          value={step.tip}
                          placeholder="Dica do instrutor"
                          onChange={e =>
                            updateStep(index, { tip: e.target.value })
                          }
                        />
                      </label>
                      <div className="me-step-media">
                        {step.image && (
                          <img
                            src={step.image}
                            alt={`Imagem da etapa ${index + 1}`}
                          />
                        )}
                        <label className="me-btn me-btn-ghost">
                          <ImagePlus size={15} />
                          {step.image ? "Trocar imagem" : "Adicionar imagem"}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file)
                                toDataUrl(file, image =>
                                  updateStep(index, { image })
                                );
                            }}
                          />
                        </label>
                        {step.image && (
                          <button
                            className="me-link"
                            onClick={() =>
                              updateStep(index, { image: undefined })
                            }
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <AttachmentEditor
                        label="Arquivos da etapa"
                        attachments={step.attachments ?? []}
                        onChange={attachments =>
                          updateStep(index, { attachments })
                        }
                      />
                      <StepQuizEditor
                        stepNumber={index + 1}
                        quiz={toEditableQuiz(step.quiz)}
                        onChange={quiz => updateStep(index, { quiz })}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {module.steps.length > 0 && (
              <button className="me-add-row" onClick={addStep}>
                <Plus size={15} /> Adicionar etapa
              </button>
            )}
          </section>

          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>
                  Recursos técnicos <b>{module.resources.length}</b>
                </h2>
                <p>Ferramentas, máquinas e materiais usados no capítulo.</p>
              </div>
              {module.resources.length > 0 && (
                <button className="me-btn me-btn-soft" onClick={addResource}>
                  <Plus size={15} /> Recurso
                </button>
              )}
            </div>
            {module.resources.length === 0 ? (
              <div className="me-empty">
                <div className="me-empty-icon">
                  <Wrench size={22} />
                </div>
                <strong>Nenhum recurso técnico</strong>
                <p>
                  Vincule itens do estoque para conferir a disponibilidade ao
                  preparar a aula.
                </p>
                <button className="me-btn me-btn-soft" onClick={addResource}>
                  <Plus size={15} /> Adicionar recurso
                </button>
              </div>
            ) : (
              <div className="me-resources">
                {module.resources.map((resource, index) => (
                  <div className="me-resource" key={resource.id}>
                    <div className="me-resource-head">
                      <span className="me-resource-icon">
                        <resource.icon size={16} />
                      </span>
                      <strong>{resource.title || "Recurso sem nome"}</strong>
                      <button
                        className="me-icon-btn"
                        onClick={() =>
                          update({
                            resources: module.resources.filter(
                              item => item.id !== resource.id
                            ),
                          })
                        }
                        aria-label={`Excluir ${resource.title}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="me-fields">
                      <label className="me-field">
                        <span>Nome do recurso</span>
                        <input
                          className="me-input"
                          value={resource.title}
                          onChange={e =>
                            updateResource(index, { title: e.target.value })
                          }
                        />
                      </label>
                      <label className="me-field">
                        <span>Categoria</span>
                        <select
                          className="me-input"
                          value={resource.category}
                          onChange={e =>
                            updateResource(index, {
                              category: e.target.value as Exclude<
                                Category,
                                "all"
                              >,
                              icon: iconByCategory[e.target.value] || Box,
                            })
                          }
                        >
                          <option value="materials">Material</option>
                          <option value="machines">Máquina</option>
                          <option value="tools">Ferramenta</option>
                          <option value="parts">Mini peça</option>
                        </select>
                      </label>
                      <label className="me-field me-span-2">
                        <span>Descrição</span>
                        <input
                          className="me-input"
                          value={resource.detail}
                          onChange={e =>
                            updateResource(index, { detail: e.target.value })
                          }
                        />
                      </label>
                      <label className="me-field">
                        <span>Item do estoque vinculado</span>
                        <select
                          className="me-input"
                          value={resource.inventoryItemId ?? ""}
                          disabled={linkableQuery.isLoading}
                          onChange={e => {
                            const id = e.target.value
                              ? Number(e.target.value)
                              : null;
                            updateResource(index, {
                              inventoryItemId: id,
                              inventory: null,
                            });
                          }}
                        >
                          <option value="">
                            {linkableQuery.isLoading
                              ? "Carregando itens do estoque…"
                              : "Sem vínculo com o estoque"}
                          </option>
                          {resource.inventory?.archived &&
                            resource.inventoryItemId != null && (
                              <option value={resource.inventoryItemId}>
                                {resource.inventory.code} ·{" "}
                                {resource.inventory.name} (arquivado)
                              </option>
                            )}
                          {(linkableQuery.data ?? []).map(item => (
                            <option key={item.id} value={item.id}>
                              {item.code} · {item.name} — {item.available}{" "}
                              {item.unit} disp.
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="me-field">
                        <span>Link do modelo 3D (.glb ou .gltf)</span>
                        <input
                          className="me-input"
                          value={resource.modelUrl}
                          onChange={e =>
                            updateResource(index, { modelUrl: e.target.value })
                          }
                          placeholder="https://.../modelo.glb"
                        />
                      </label>
                    </div>
                    <AttachmentEditor
                      label="Arquivos do recurso"
                      hint="Fichas técnicas em PDF, manuais, desenhos CAD (STEP, DWG…), modelos 3D (STL, GLB…), vídeos ou uma pasta inteira — até 50 MB por arquivo."
                      attachments={resource.attachments ?? []}
                      onChange={attachments =>
                        updateResource(index, { attachments })
                      }
                    />
                    <small className="me-help">
                      {linkableQuery.isError
                        ? "Não foi possível carregar o estoque agora; o vínculo atual é mantido ao salvar."
                        : resource.inventory
                          ? `Estoque: ${resource.inventory.available} ${resource.inventory.unit} disponíveis · ${STOCK_HEALTH_LABELS[resource.inventory.health]}. O título do recurso continua visível mesmo se o item for arquivado.`
                          : "Vincule a um item para ver a disponibilidade ao preparar a aula. Alunos não veem dados do estoque."}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="me-aside">
          <section className="me-card">
            <div className="me-card-head">
              <div>
                <h2>Capa</h2>
                <p>Prévia do card na biblioteca.</p>
              </div>
            </div>
            <div
              className="me-cover"
              style={{
                backgroundColor: module.cover,
                backgroundImage: module.coverImage
                  ? `url(${module.coverImage})`
                  : undefined,
              }}
            >
              <span>{module.kind}</span>
              <strong>{module.title || "Módulo sem nome"}</strong>
            </div>
            <div className="me-field">
              <span>Cor de fundo</span>
              <div className="me-swatches">
                {coverPresets.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={
                      module.cover.toLowerCase() === color ? "is-active" : ""
                    }
                    style={{ background: color }}
                    onClick={() => update({ cover: color })}
                    aria-label={`Usar cor ${color}`}
                  >
                    {module.cover.toLowerCase() === color && (
                      <Check size={13} />
                    )}
                  </button>
                ))}
                <label className="me-swatch-custom" title="Cor personalizada">
                  <Plus size={14} />
                  <input
                    type="color"
                    value={module.cover}
                    onChange={e => update({ cover: e.target.value })}
                    aria-label="Cor personalizada"
                  />
                </label>
              </div>
            </div>
            <div className="me-cover-actions">
              <label className="me-btn me-btn-ghost">
                <ImagePlus size={15} />
                {module.coverImage ? "Trocar imagem" : "Enviar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file)
                      toDataUrl(file, coverImage => update({ coverImage }));
                  }}
                />
              </label>
              {module.coverImage && (
                <button
                  className="me-link"
                  onClick={() => update({ coverImage: undefined })}
                >
                  Remover
                </button>
              )}
            </div>
          </section>

          <section className="me-card">
            <label className="me-switch">
              <span>
                <strong>Publicar para alunos</strong>
                <small>
                  {module.published
                    ? "Visível na biblioteca dos alunos."
                    : "Rascunho — só docentes veem este módulo."}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={module.published}
                onChange={e => update({ published: e.target.checked })}
              />
              <i aria-hidden="true" />
            </label>
          </section>

          <dl className="me-summary">
            <div>
              <dt>Etapas</dt>
              <dd>{module.steps.length}</dd>
            </div>
            <div>
              <dt>Recursos</dt>
              <dd>{module.resources.length}</dd>
            </div>
            <div>
              <dt>Imagens</dt>
              <dd>
                {module.steps.filter(step => step.image).length +
                  (module.coverImage ? 1 : 0)}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

