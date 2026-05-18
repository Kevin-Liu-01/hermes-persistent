import { PageHeader } from "@/components/dashboard/PageHeader";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { getUserConfig } from "@/lib/user-config/clerk";
import { toPublicConfig } from "@/lib/user-config/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const config = await getUserConfig();
	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="SETTINGS"
				title="Account configuration"
				description="Update reusable provider, gateway, agent, environment, bootstrap, and custom loadout settings that new machines inherit. Terminal edits can sync back through /home/machine/.agent-machines/settings.json."
			/>
			<SettingsPanel initialConfig={toPublicConfig(config)} />
		</div>
	);
}
