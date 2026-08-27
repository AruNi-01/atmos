import type { WsAction } from "./actions";
import type { AgentContract } from "./contract/agent";
import type { AutomationContract } from "./contract/automation";
import type { CanvasContract } from "./contract/canvas";
import type { CenterLayoutContract } from "./contract/center-layout";
import type { ConversationContract } from "./contract/conversation";
import type { DiskAnalyzerContract } from "./contract/disk-analyzer";
import type { FsContract } from "./contract/fs";
import type { GitContract } from "./contract/git";
import type { GithubContract } from "./contract/github";
import type { GroupContract } from "./contract/group";
import type { LinearContract } from "./contract/linear";
import type { LocalModelContract } from "./contract/local-model";
import type { LocalServicesContract } from "./contract/local-services";
import type { PermissionContract } from "./contract/permission";
import type { ProjectContract } from "./contract/project";
import type { QuotaContract } from "./contract/quota";
import type { ResourceMonitorContract } from "./contract/resource-monitor";
import type { ReviewContract } from "./contract/review";
import type { SettingsContract } from "./contract/settings";
import type { SimulatorContract } from "./contract/simulator";
import type { SkillsContract } from "./contract/skills";
import type { TerminalContract } from "./contract/terminal";
import type { TokenUsageContract } from "./contract/token-usage";
import type { WorkspaceContract } from "./contract/workspace";

export type WsContract = FsContract &
  GitContract &
  GithubContract &
  GroupContract &
  LinearContract &
  ProjectContract &
  WorkspaceContract &
  CanvasContract &
  CenterLayoutContract &
  QuotaContract &
  TokenUsageContract &
  PermissionContract &
  TerminalContract &
  ReviewContract &
  SkillsContract &
  AgentContract &
  ConversationContract &
  AutomationContract &
  SettingsContract &
  LocalServicesContract &
  LocalModelContract &
  DiskAnalyzerContract &
  SimulatorContract &
  ResourceMonitorContract;

export type MappedWsAction = keyof WsContract & WsAction;
/** Empty once every `WsAction` has a `WsContract` row. */
export type UnmappedWsAction = Exclude<WsAction, MappedWsAction>;

export type WsInput<A extends MappedWsAction> = WsContract[A]["input"];
export type WsOutput<A extends MappedWsAction> = WsContract[A]["output"];

type AssertNever<T extends never> = T;
type _NoMissingActions = AssertNever<UnmappedWsAction>;
type _NoExtraActions = AssertNever<Exclude<keyof WsContract, WsAction>>;
export type _AssertWsContractComplete = _NoMissingActions | _NoExtraActions;
