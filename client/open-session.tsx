import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { restoreAgent } from "../shared/contracts";
import { sourceKey } from "../shared/host-model";
import { shortDate } from "../shared/model";
import type { SessionResult } from "../shared/results";
import { rpcForHost } from "./federation";
import { Button, text, type Theme } from "./kit";

export type Navigation = PluginSurfaceProps["navigation"];

/**
 * Opens a session on its own host. An archived one is restored first, after a confirmation that
 * says what restoring does; the restore runs on that host and the screen's history refreshes.
 */
export function useOpenSession(navigation: Navigation, theme: Theme, compact: boolean) {
  const [pending, setPending] = useState<SessionResult | null>(null);
  const restoring = useRef(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const restoration = useMutation({
    mutationFn: (result: SessionResult) => rpcForHost(result.host.id)(restoreAgent, { agentId: sourceKey(result.key).id }),
    onSuccess: (_, result) => {
      setPending(null);
      navigation?.openAgent({ agentId: sourceKey(result.key).id, serverId: result.host.id });
    },
    onError: (error: Error) => toast.error(`Couldn't restore the session: ${error.message}`),
    onSettled: () => {
      restoring.current = false;
      void queryClient.invalidateQueries({ queryKey: ["agents-history", "list"] });
    },
  });

  const open = useCallback((result: SessionResult) => {
    if (!navigation) return;
    if (result.agent.archivedAt) setPending(result);
    else navigation.openAgent({ agentId: sourceKey(result.key).id, serverId: result.host.id });
  }, [navigation]);

  const openWorkspace = useCallback((result: SessionResult) => {
    if (!navigation || result.row.synthetic) return;
    navigation.openWorkspace({ workspaceId: sourceKey(result.row.workspace.workspaceId).id, serverId: result.host.id });
  }, [navigation]);

  const c = theme.colors;
  const t = text(c);
  const dialog = pending ? (
    <Modal title="Restore this session?" open onOpenChange={(open) => { if (!open && !restoring.current) setPending(null); }}>
      <Modal.Content>
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text style={t.body}>
              “{pending.info.title}” was archived {pending.agent.archivedAt ? `on ${shortDate(pending.agent.archivedAt, Date.now()).replace(/^(Today|Yesterday)$/, (day) => day.toLowerCase())}` : "earlier"}.
              {" "}Restoring brings it back to {pending.host.label}'s sidebar and opens it there.
            </Text>
            <Text style={t.meta}>Nothing in the conversation changes. You can archive it again from its menu.</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
            <Button theme={theme} kind="ghost" compact={compact} title="Cancel" disabled={restoration.isPending} onPress={() => setPending(null)} />
            <Button theme={theme} kind="primary" compact={compact} icon="ArchiveRestore" title={restoration.isPending ? "Restoring…" : "Restore and open"} loading={restoration.isPending}
              accessibilityLabel="Restore and open the session"
              onPress={() => { if (restoring.current) return; restoring.current = true; restoration.mutate(pending); }} />
          </View>
        </View>
      </Modal.Content>
    </Modal>
  ) : null;

  return { open, openWorkspace, dialog, canOpen: Boolean(navigation) };
}
