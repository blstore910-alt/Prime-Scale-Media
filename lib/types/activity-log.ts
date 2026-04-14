import { ActivityLogDbAction } from "@/lib/activity-log-actions";

export type ActivityLogAuthor = {
  full_name?: string | null;
  email?: string | null;
} | null;

export type ActivityLog = {
  id: string;
  created_at: string;
  action: string | null;
  db_action: ActivityLogDbAction | string | null;
  table_name: string | null;
  data_snapshot: unknown | null;
  reference_record_id: string | null;
  author?: ActivityLogAuthor;
};
