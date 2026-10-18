import { UserNode } from "./user";

export interface FollowLogEntry {
  readonly user: UserNode;
  readonly followedSuccessfully: boolean;
}
