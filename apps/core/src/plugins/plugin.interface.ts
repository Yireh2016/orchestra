export type PluginType =
  | 'pm'
  | 'code-host'
  | 'channel'
  | 'coding-agent'
  | 'phase';

export interface Plugin {
  name: string;
  version: string;
  type: PluginType;
  register(): Promise<void>;
  unregister(): Promise<void>;
}
