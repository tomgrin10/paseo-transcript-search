import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSummary, ExcerptMessage, HistoryList } from "../shared/contracts";
import { describeSession, type SessionInfo } from "../shared/session-info";
import { paseoHome } from "./paseo-home";

/** This daemon's stable id, the same one the app keys hosts by. */
export async function serverId(): Promise<string> {
  return process.env.PASEO_SERVER_ID?.trim() || (await readFile(join(paseoHome(), "server-id"), "utf8")).trim();
}

/** Session facts by agent id from one census, described only when asked for. */
export function sessionIndex(census: HistoryList): { get(agentId: string): { agent: AgentSummary; info: SessionInfo } | undefined } {
  const workspaces = new Map(census.workspaces.map((workspace) => [workspace.workspaceId, workspace]));
  const projects = new Map((census.projects ?? []).map((project) => [project.projectId, project]));
  const agents = new Map(census.agents.map((agent) => [agent.id, agent]));
  return {
    get(agentId) {
      const agent = agents.get(agentId);
      if (!agent) return undefined;
      const workspace = agent.workspaceId ? workspaces.get(agent.workspaceId) ?? null : null;
      const project = workspace?.projectId ? projects.get(workspace.projectId) ?? null : null;
      return { agent, info: describeSession(agent, workspace, project) };
    },
  };
}

const ROLE_NAMES: Record<ExcerptMessage["role"], string> = { user: "User", assistant: "Agent", tool: "Tool", other: "Note" };

/** Messages as plain text an agent can read: `User (line 12): …`. */
export function messagesAsText(messages: readonly ExcerptMessage[], target: number | null = null): string {
  return messages.map((message, index) => {
    const who = message.role === "tool" && message.tool ? `Tool ${message.tool}` : ROLE_NAMES[message.role];
    const mark = index === target ? " [match]" : "";
    return `${who} (line ${message.line})${mark}:\n${message.text}`;
  }).join("\n\n");
}

/** The heading block every attachment and read result starts with. */
export function sessionHeading(info: SessionInfo, agentId: string, host: string): string {
  return [
    `Session: ${info.title}`,
    `Agent ID: ${agentId} (${info.providerLabel}${info.model ? `, ${info.model}` : ""}) on Paseo host ${host}`,
    info.workspaceLine ? `Workspace: ${info.workspaceLine}` : null,
    info.cwd ? `Directory: ${info.cwd}` : null,
    `Last active: ${info.lastActivityAt ?? "unknown"}${info.archived ? " (archived)" : ""}`,
  ].filter((line): line is string => line !== null).join("\n");
}
