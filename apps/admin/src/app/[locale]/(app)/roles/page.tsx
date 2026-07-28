import { getTranslations } from "next-intl/server";
import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { requirePermission } from "@src/lib/rbac/require-permission";
import { redirect } from "@src/i18n/routing";
import { listRoles } from "@src/service/role.service";
import { listUsers } from "@src/service/user.service";
import { RoleList } from "./role-list";
import { PermissionMatrix } from "./permission-matrix";

export default async function RolesPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const authz = await requirePermission("roles:read");
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

  const canManage = authz.permissions.has("roles:manage");
  const [roles, users] = await Promise.all([listRoles(), listUsers()]);

  const memberCounts = new Map<string, number>();
  for (const user of users) {
    for (const roleId of user.roleIds) {
      memberCounts.set(roleId, (memberCounts.get(roleId) ?? 0) + 1);
    }
  }

  const roleListItems = roles.map((role) => ({
    id: role._id.toHexString(),
    name: role.name,
    description: role.description,
    key: role.key,
    isSystem: role.isSystem,
    memberCount: memberCounts.get(role._id.toHexString()) ?? 0,
  }));

  const matrixRoles = roles.map((role) => ({
    id: role._id.toHexString(),
    name: role.name,
    key: role.key,
    permissions: role.permissions,
  }));

  const t = await getTranslations("roles");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <RoleList roles={roleListItems} canManage={canManage} />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("edit")}</h2>
        <PermissionMatrix roles={matrixRoles} canManage={canManage} />
      </div>
    </div>
  );
}
