/**
 * POST /functions/v1/delete-me — the server half of "Delete everything" (ADR 0001).
 * Deletes the calling anonymous student's auth user; the on_auth_user_deleted trigger then removes their
 * check-ins and meal analyses and unlinks their ai_usage rows. Staff accounts are refused: they are created
 * and removed through the Admin API, never from the student app.
 * verify_jwt is off (supabase/config.toml) like analyze-meal; withSupabase verifies the user's JWT itself.
 */
import { withSupabase } from '@supabase/server';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const id = ctx.userClaims?.id;
    if (!id || ctx.jwtClaims?.is_anonymous !== true) return Response.json({ error: 'students_only' }, { status: 403 });
    const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return Response.json({ error: 'delete_failed' }, { status: 500 });
    return Response.json({ status: 'deleted' });
  }),
};
