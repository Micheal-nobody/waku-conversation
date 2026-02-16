export interface UserIdentity {
  peerId: string;
  privateKey: string;
  publicKey: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  participants: string[]; // 参与者的peerId
  name?: string; // 群聊名称
}

export interface Message {
  id: string;
  conversationId: string;
  sender: string; // 发送者的peerId
  content: string;
  timestamp: number;
  type: 'text' |'user-leave' | 'tombstone';
  tombstoneFor?: string; // 被撤回的消息ID
  signature?: string; // 消息签名，用于验证完整性
  mac?: string; // 消息认证码，用于确保消息完整性和防篡改
  payload?: Uint8Array; // 加密后的消息体（仅当经过 encrypt 时存在）
  isRevoked?: boolean; // 消息是否被撤回
}

export interface ChatOptions {
  storeMessages?: boolean;
  useLightNode?: boolean;
}

export type MessageHandler = (message: Message) => void;