import { ChatShell } from "@/components/dashboard/ChatShell";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getUserConfig } from "@/lib/user-config/clerk";
import { AGENT_LABEL } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function DashboardChatPage() {
	const config = await getUserConfig();
	const active = config.machines.find((m) => m.id === config.activeMachineId);
	const agentLabel = active?.agentKind ? AGENT_LABEL[active.agentKind] : "agent";
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker={`LIVE -- ${agentLabel} gateway`}
				title="Chat"
				description="Streams from the resolved gateway profile for your active machine. Existing machines keep their installed agent; new machines inherit the account's agent profile, gateway, tools, and environment. Persistent-machine chats live under /home/machine/.agent-machines; ephemeral sandboxes use the external storage backend configured for the account."
			/>
			<ChatShell
				activeMachineId={active?.id ?? null}
				model={active?.model ?? null}
			/>
		</div>
	);
}
