import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Your Profile
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Account details for the currently signed-in team member.
      </p>

      <dl className="mt-6 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex justify-between px-5 py-4 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
          <dd className="font-medium text-zinc-900 dark:text-zinc-100">{user?.email}</dd>
        </div>
        <div className="flex justify-between px-5 py-4 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">User ID</dt>
          <dd className="font-mono text-xs text-zinc-900 dark:text-zinc-100">{user?.id}</dd>
        </div>
        <div className="flex justify-between px-5 py-4 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Last Signed In</dt>
          <dd className="font-medium text-zinc-900 dark:text-zinc-100">
            {user?.last_sign_in_at
              ? new Intl.DateTimeFormat("en-PK", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(user.last_sign_in_at))
              : "—"}
          </dd>
        </div>
      </dl>
    </main>
  );
}
