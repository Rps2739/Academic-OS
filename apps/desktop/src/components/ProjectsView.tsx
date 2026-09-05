import { useEffect, useState } from "react";
import type { LocalRow } from "@academic-os/core";
import type { SqliteLocalDb } from "../lib/sqlite-local-db";
import { Briefcase, Plus, Trash2, Users, Calendar, Check } from "lucide-react";

interface ProjectsViewProps {
  localDb: SqliteLocalDb;
  userId: string;
  onChanged: () => void;
  onNotify: (message: string, undo: () => void) => void;
}

type Filter = "active" | "done" | "all";
interface TeamMember {
  name: string;
  role: string | null;
}

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "case_comp", label: "Case competition" },
  { value: "group_project", label: "Group project" },
  { value: "assignment", label: "Assignment" },
  { value: "exam", label: "Exam prep" },
  { value: "other", label: "Other" },
];

function kindLabel(kind: string): string {
  return KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind;
}

function isOverdue(deadline: string | null, status: string): boolean {
  if (!deadline || status !== "active") return false;
  return new Date(deadline).getTime() < Date.now();
}

/**
 * Projects/deadlines — case competitions, group projects, etc. Kept
 * separate from Tasks deliberately: these carry structure ad-hoc tasks
 * don't (a deadline, a team, a stage), and mixing the two would mean
 * either bloating Tasks with fields most tasks never use, or losing
 * that structure. `projects` (schema + sync) already existed with no
 * UI, same story as Subjects.
 */
export function ProjectsView({ localDb, userId, onChanged, onNotify }: ProjectsViewProps) {
  const [projects, setProjects] = useState<LocalRow[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState(KIND_OPTIONS[0]!.value);
  const [draftStage, setDraftStage] = useState("");
  const [draftDeadline, setDraftDeadline] = useState("");
  const [draftMemberName, setDraftMemberName] = useState("");
  const [draftTeam, setDraftTeam] = useState<TeamMember[]>([]);

  async function refresh() {
    const rows = await localDb.raw.select<Record<string, unknown>[]>(
      "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY (deadline IS NULL), deadline ASC, name ASC"
    );
    setProjects(rows as LocalRow[]);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addTeamMember() {
    const name = draftMemberName.trim();
    if (!name) return;
    setDraftTeam((prev) => [...prev, { name, role: null }]);
    setDraftMemberName("");
  }

  async function createProject() {
    const name = draftName.trim();
    if (!name) return;
    await localDb.put("projects", {
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      kind: draftKind,
      stage: draftStage.trim() || null,
      deadline: draftDeadline ? new Date(draftDeadline).toISOString() : null,
      team: draftTeam,
      node_id: null,
      status: "active",
    });
    setDraftName("");
    setDraftStage("");
    setDraftDeadline("");
    setDraftTeam([]);
    setAdding(false);
    await refresh();
    onChanged();
  }

  async function updateProject(project: LocalRow, patch: Record<string, unknown>) {
    await localDb.put("projects", { id: project.id as string, user_id: userId, ...patch });
    await refresh();
    onChanged();
  }

  async function deleteProject(project: LocalRow) {
    await localDb.put("projects", { id: project.id as string, user_id: userId, deleted_at: new Date().toISOString() });
    await refresh();
    onChanged();
    onNotify(`Deleted "${project["name"] as string}"`, () => void undoDelete(project.id as string));
  }

  async function undoDelete(id: string) {
    await localDb.put("projects", { id, user_id: userId, deleted_at: null });
    await refresh();
    onChanged();
  }

  const visible = projects.filter((p) => {
    if (filter === "all") return true;
    if (filter === "active") return p["status"] === "active";
    return p["status"] === "done" || p["status"] === "archived";
  });

  return (
    <div className="projects-view">
      <div className="projects-view__header">
        <h1 className="projects-view__title">Projects</h1>
        <div className="task-list__filters" role="tablist">
          {(["active", "done", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`task-list__filter ${filter === f ? "task-list__filter--active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "active" ? "Active" : f === "done" ? "Done" : "All"}
            </button>
          ))}
        </div>
      </div>

      {adding ? (
        <form
          className="project-add"
          onSubmit={(e) => {
            e.preventDefault();
            void createProject();
          }}
        >
          <input
            className="project-add__name"
            autoFocus
            placeholder="Project name…"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <div className="project-add__row">
            <select className="project-add__kind" value={draftKind} onChange={(e) => setDraftKind(e.target.value)}>
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              className="project-add__stage"
              placeholder="Stage (e.g. Round 2)"
              value={draftStage}
              onChange={(e) => setDraftStage(e.target.value)}
            />
            <input
              type="date"
              className="project-add__deadline"
              value={draftDeadline}
              onChange={(e) => setDraftDeadline(e.target.value)}
            />
          </div>
          <div className="project-add__row">
            <input
              className="project-add__member"
              placeholder="Add teammate…"
              value={draftMemberName}
              onChange={(e) => setDraftMemberName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTeamMember();
                }
              }}
            />
            <button type="button" className="btn btn--secondary" onClick={addTeamMember}>
              Add
            </button>
          </div>
          {draftTeam.length > 0 && (
            <div className="project-add__team">
              {draftTeam.map((m, i) => (
                <span key={i} className="project-add__team-chip">
                  {m.name}
                  <button
                    type="button"
                    onClick={() => setDraftTeam((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="project-add__actions">
            <button type="submit" className="btn btn--primary">
              <Plus size={14} strokeWidth={2} />
              Create project
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn--secondary projects-view__add-trigger" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2} />
          New project
        </button>
      )}

      {visible.length === 0 ? (
        <p className="projects-view__empty">
          <Briefcase size={28} strokeWidth={1.5} />
          {filter === "active" ? "No active projects." : "Nothing here."}
        </p>
      ) : (
        <ul className="projects-view__list">
          {visible.map((project) => {
            const team = (project["team"] as TeamMember[] | null) ?? [];
            const deadline = project["deadline"] as string | null;
            const status = project["status"] as string;
            const overdue = isOverdue(deadline, status);
            return (
              <li key={project.id as string} className={`project-card ${overdue ? "project-card--overdue" : ""}`}>
                <div className="project-card__main">
                  <div className="project-card__title-row">
                    <button
                      className={`project-card__done ${status === "done" ? "project-card__done--active" : ""}`}
                      title={status === "done" ? "Mark active" : "Mark done"}
                      onClick={() => void updateProject(project, { status: status === "done" ? "active" : "done" })}
                    >
                      {status === "done" && <Check size={12} strokeWidth={3} />}
                    </button>
                    <span className="project-card__name">{project["name"] as string}</span>
                    <span className="project-card__kind">{kindLabel(project["kind"] as string)}</span>
                  </div>
                  <div className="project-card__meta">
                    {(project["stage"] as string | null) && (
                      <span className="project-card__stage">{project["stage"] as string}</span>
                    )}
                    {deadline && (
                      <span className={`project-card__deadline ${overdue ? "project-card__deadline--overdue" : ""}`}>
                        <Calendar size={11} strokeWidth={2} />
                        {new Date(deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                    {team.length > 0 && (
                      <span className="project-card__team">
                        <Users size={11} strokeWidth={2} />
                        {team.map((m) => m.name).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => void deleteProject(project)}>
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
