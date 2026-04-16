import "server-only";

type WikiModule = "clash" | "sim";

type WikiSessionUser = {
  role?: string | null;
  moduleAccess?: string[] | null;
};

function hasModuleAccess(user: WikiSessionUser, module: WikiModule) {
  if (user.role === "ADMIN") return true;
  return (user.moduleAccess ?? []).includes(module);
}

export function canReadWikiModule(user: WikiSessionUser, module: WikiModule) {
  return hasModuleAccess(user, module);
}

export function canEditWikiModule(user: WikiSessionUser, module: WikiModule) {
  if (!hasModuleAccess(user, module)) return false;
  return user.role === "ADMIN" || user.role === "EDITOR";
}

