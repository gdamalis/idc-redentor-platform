import { getTranslations } from "next-intl/server";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { requirePermission } from "@src/lib/rbac/require-permission";
import { redirect } from "@src/i18n/routing";
import { listRoles } from "@src/service/role.service";
import { listUsers } from "@src/service/user.service";
import { UserTable } from "./user-table";
import { InviteDialog } from "./invite-dialog";

export default async function UsersPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requirePermission("users:read");
  if (!authz.ok) {
    if (authz.reason === "forbidden") return <PermissionDenied />;
    redirect({
      href: authz.reason === "unauthenticated" ? "/login" : "/no-access",
      locale,
    });
    // `redirect()` is typed `never` (it throws) but isn't the last statement
    // in this branch — an explicit `return` here (unlike the stub pages,
    // which never read `authz` again) is what lets TS narrow `authz` to
    // `Authorized` for the rest of this function.
    return;
  }

  const canManage = authz.permissions.has("users:manage");
  const [roles, users] = await Promise.all([listRoles(), listUsers()]);

  const roleItems = roles.map((role) => ({
    id: role._id.toHexString(),
    name: role.name,
    key: role.key,
  }));

  const userItems = users.map((user) => ({
    id: user._id.toHexString(),
    email: user.email,
    displayName: user.displayName,
    roleIds: user.roleIds,
    status: user.status,
  }));

  const t = await getTranslations("users");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && <InviteDialog roles={roleItems} />}
      </div>

      <UserTable users={userItems} roles={roleItems} canManage={canManage} />
    </div>
  );
}
