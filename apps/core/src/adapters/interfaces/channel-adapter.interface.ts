export const CHANNEL_ADAPTER = Symbol('CHANNEL_ADAPTER');

export interface Message {
  id: string;
  threadId: string;
  content: string;
  author: string;
  timestamp: Date;
}

export interface SendMessageParams {
  threadId: string;
  content: string;
  attachments?: Array<{
    title: string;
    content: string;
    mimeType?: string;
  }>;
}

export interface ChannelAdapter {
  sendMessage(params: SendMessageParams): Promise<Message>;
  getThread(threadId: string): Promise<Message[]>;
  updateMessage(messageId: string, content: string): Promise<Message>;
  deleteMessage(messageId: string): Promise<void>;
  addReaction(messageId: string, emoji: string): Promise<void>;
}
