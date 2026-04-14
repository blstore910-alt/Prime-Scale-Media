import { UserProfile } from "./user";

export type Tenant = {
  id: string;
  name: string;
  profile?: UserProfile;
};
