import { UserNode } from "./user";

export type ReelLogReason = "sent" | "followers" | "bio" | "unknown_followers" | "already" | "lookup" | "dm";

export interface ReelLogEntry {
  readonly user: UserNode;
  readonly kind: "sent" | "skipped" | "failed";
  readonly reason: ReelLogReason;
  readonly followerCount: number | null;
}
