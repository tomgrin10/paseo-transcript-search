import type { AgentSummary, ProjectSummary, WorkspaceSummary } from "./contracts";
import { agentLabel, projectLabel, providerLabel, workspaceLabel } from "./model";

/** What a person needs to recognise a session, in one place for the screen, chat rows and tools. */
export interface SessionInfo {
  title: string;
  provider: string;
  providerLabel: string;
  model: string | null;
  workspaceTitle: string | null;
  projectName: string | null;
  branch: string | null;
  /** `Invoice retry backoff · billing-service · feat/invoice-retries` */
  workspaceLine: string | null;
  cwd: string | null;
  lastActivityAt: string | null;
  archived: boolean;
}

export function describeSession(agent: AgentSummary, workspace: WorkspaceSummary | null, project: ProjectSummary | null): SessionInfo {
  const workspaceTitle = workspace ? workspace.title?.trim() || workspaceLabel(workspace) : null;
  const projectName = project ? projectLabel(project) : null;
  const branch = workspace?.branch?.trim() || null;
  const parts = [workspaceTitle, projectName, branch].filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
  return {
    title: agentLabel(agent),
    provider: agent.provider,
    providerLabel: providerLabel(agent.provider),
    model: agent.model,
    workspaceTitle,
    projectName,
    branch,
    workspaceLine: parts.length ? parts.join(" · ") : null,
    cwd: workspace?.cwd || null,
    lastActivityAt: agent.lastActivityAt ?? agent.createdAt,
    archived: Boolean(agent.archivedAt || workspace?.archivedAt || project?.archivedAt),
  };
}
