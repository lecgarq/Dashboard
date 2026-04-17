import { DefaultSession, DefaultUser } from "next-auth";
import { AdapterUser as BaseAdapterUser } from "@auth/core/adapters";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      providers: string[];
      isPrimaryAdmin?: boolean;
      hasCredentials?: boolean;
      moduleAccess?: string[];
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    providers: string[];
    isPrimaryAdmin?: boolean;
    hasCredentials: boolean;
    moduleAccess?: string[];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser extends BaseAdapterUser {
    role: string;
  }
}
