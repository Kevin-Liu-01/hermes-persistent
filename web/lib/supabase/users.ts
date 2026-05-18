import { supabaseAdmin } from "./client";

export type UserRow = {
	id: string;
	email: string | null;
	display_name: string | null;
	active_machine_id: string | null;
	setup_step: string;
	draft_agent_kind: string;
	draft_provider_kind: string;
	draft_model: string;
	draft_spec: Record<string, unknown>;
	active_loadout_preset_id: string;
	created_at: string;
	updated_at: string;
};

export async function ensureUser(
	userId: string,
	email?: string | null,
	displayName?: string | null,
): Promise<UserRow> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("users")
		.upsert(
			{
				id: userId,
				...(email ? { email } : {}),
				...(displayName ? { display_name: displayName } : {}),
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "id" },
		)
		.select()
		.single();

	if (error) throw new Error(`ensureUser: ${error.message}`);
	return data as UserRow;
}

export async function getUser(userId: string): Promise<UserRow | null> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("users")
		.select("*")
		.eq("id", userId)
		.maybeSingle();

	if (error) throw new Error(`getUser: ${error.message}`);
	return data as UserRow | null;
}

export async function updateUser(
	userId: string,
	patch: Partial<
		Pick<
			UserRow,
			| "active_machine_id"
			| "setup_step"
			| "draft_agent_kind"
			| "draft_provider_kind"
			| "draft_model"
			| "draft_spec"
			| "active_loadout_preset_id"
			| "email"
			| "display_name"
		>
	>,
): Promise<void> {
	const sb = supabaseAdmin();
	const { error } = await sb
		.from("users")
		.update({ ...patch, updated_at: new Date().toISOString() })
		.eq("id", userId);

	if (error) throw new Error(`updateUser: ${error.message}`);
}
