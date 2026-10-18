import { UserNode } from "./user";
import { ScanningTab } from "./scanning-tab";
import { ScanningFilter } from "./scanning-filter";
import { UnfollowLogEntry } from "./unfollow-log-entry";
import { UnfollowFilter } from "./unfollow-filter";
import { FollowLogEntry } from "./follow-log-entry";
import { ReelLogEntry } from "./reel-log-entry";

type ScanningState = {
  readonly status: 'scanning';
  readonly page: number;
  readonly currentTab: ScanningTab;
  readonly searchTerm: string;
  readonly percentage: number;
  readonly results: readonly UserNode[];
  readonly whitelistedResults: readonly UserNode[];
  readonly selectedResults: readonly UserNode[];
  readonly filter: ScanningFilter;
  readonly scanIncomplete?: boolean;
  readonly isScanningActive?: boolean;
  readonly totalScanned?: number;
};

type UnfollowingState = {
  readonly status: 'unfollowing';
  readonly searchTerm: string;
  readonly percentage: number;
  readonly selectedResults: readonly UserNode[];
  readonly unfollowLog: readonly UnfollowLogEntry[];
  readonly filter: UnfollowFilter;
};

type FollowingState = {
  readonly status: 'following';
  readonly targets: readonly string[];
  readonly targetIndex: number;
  readonly targetUsername: string;
  readonly missedTargets: readonly string[];
  readonly searchTerm: string;
  readonly percentage: number;
  readonly followLog: readonly FollowLogEntry[];
  readonly filter: UnfollowFilter;
  readonly outcome: 'running' | 'completed' | 'blocked' | 'failed' | 'incomplete';
  readonly error: 'missing' | 'list' | 'lookup' | null;
  readonly followedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
};

type ReelsState = {
  readonly status: 'reels';
  readonly searchTerm: string;
  readonly percentage: number;
  readonly outcome: 'running' | 'completed' | 'blocked' | 'failed';
  readonly banner: 'done' | 'limit' | 'interrupted' | 'blocked' | 'failed' | null;
  readonly log: readonly ReelLogEntry[];
  readonly showSent: boolean;
  readonly showSkipped: boolean;
  readonly showFailed: boolean;
  readonly checkedCount: number;
  readonly sentCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly currentUsername: string;
};

//TODO THIS TYPE OF MULTIPLE STATE NEEDS TO BE SEPARETED IN DIFFERENT FILES ASAP (Global state,unfollowing state, scanning state etc...)
export type State = { readonly status: 'initial' } | ScanningState | UnfollowingState | FollowingState | ReelsState;
