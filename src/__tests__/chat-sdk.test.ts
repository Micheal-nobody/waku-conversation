/**
 * Chat SDK 集成测试
 * 对应 App.tsx 初始化及跨端消息场景
 * 注意：部分测试需要本地运行 Waku 节点（start-waku-node.bat）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ChatSDK from '../sdk/chat-sdk';
import type { Message } from '../sdk/types';
import { resetIdentity } from '../sdk/utils/identity-util';

describe('Chat SDK 集成测试', () => {
  let sdk1: ChatSDK;
  let sdk2: ChatSDK;
  let sdk3: ChatSDK;
  let identity1: string;
  let identity2: string;
  let identity3: string;

  beforeAll(async () => {
    resetIdentity();
    sdk1 = new ChatSDK({ storeMessages: true });
    const user1 = await sdk1.init();
    identity1 = user1.peerId;

    resetIdentity();
    sdk2 = new ChatSDK({ storeMessages: true });
    const user2 = await sdk2.init();
    identity2 = user2.peerId;

    resetIdentity();
    sdk3 = new ChatSDK({ storeMessages: true });
    const user3 = await sdk3.init();
    identity3 = user3.peerId;
  });

  afterAll(async () => {
    await sdk1.close();
    await sdk2.close();
    await sdk3.close();
  });

  describe('init - 对应 handleCopyIdentity 所需 identity', () => {
    it('init 应返回包含 peerId 的 UserIdentity', async () => {
      resetIdentity();
      const sdk = new ChatSDK();
      const identity = await sdk.init();
      expect(identity).toBeDefined();
      expect(identity.peerId).toBeDefined();
      expect(typeof identity.peerId).toBe('string');
      expect(identity.privateKey).toBeDefined();
      expect(identity.publicKey).toBeDefined();
      await sdk.close();
    });
  });

  describe('单聊互发消息', () => {
    it('双人会话双方创建应得到相同 ID，且能互发消息（本地模拟，无需 Waku）', async () => {
      const conversation1 = await sdk1.createConversation(
        [identity2],
        'direct'
      );
      const conversation2 = await sdk2.createConversation(
        [identity1],
        'direct'
      );

      expect(conversation1.id).toBe(conversation2.id);
      const convId = conversation1.id;

      // user1 -> user2
      const msgId1 = await sdk1.sendMessage(convId, 'Hello from user 1');
      expect(msgId1).toBeDefined();

      const msg1 = sdk1.getMessages(convId).find((m) => m.id === msgId1);
      expect(msg1).toBeDefined();
      sdk2.storeMessage(msg1!); // 模拟 Waku 投递：user2 收到 user1 的消息

      expect(sdk2.getMessages(convId).some((m) => m.content === 'Hello from user 1')).toBe(true);
      expect(sdk2.getMessages(convId).find((m) => m.id === msgId1)?.sender).toBe(identity1);

      // user2 -> user1（互发）
      const msgId2 = await sdk2.sendMessage(convId, 'Hello from user 2');
      expect(msgId2).toBeDefined();

      const msg2 = sdk2.getMessages(convId).find((m) => m.id === msgId2);
      expect(msg2).toBeDefined();
      sdk1.storeMessage(msg2!); // 模拟 Waku 投递：user1 收到 user2 的消息

      expect(sdk1.getMessages(convId).some((m) => m.content === 'Hello from user 2')).toBe(true);
      expect(sdk1.getMessages(convId).find((m) => m.id === msgId2)?.sender).toBe(identity2);
    });

    it.skip('双人会话双方创建应得到相同 ID，且能互发消息（需运行 Waku 节点）', async () => {
      const conversation1 = await sdk1.createConversation(
        [identity2],
        'direct'
      );
      const conversation2 = await sdk2.createConversation(
        [identity1],
        'direct'
      );

      expect(conversation1.id).toBe(conversation2.id);

      const receivedMessages: Message[] = [];
      await sdk2.subscribe(conversation2.id, (message) => {
        receivedMessages.push(message);
      });

      const messageId = await sdk1.sendMessage(conversation1.id, 'Hello from user 1');
      expect(messageId).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(receivedMessages.length).toBeGreaterThan(0);
      expect(receivedMessages[0].content).toBe('Hello from user 1');
      expect(receivedMessages[0].sender).toBe(identity1);
    });
  });

  describe('群聊广播消息', () => {
    it('群聊消息应能广播给所有参与者（本地模拟，无需 Waku）', async () => {
      const conversation1 = await sdk1.createConversation(
        [],
        'group',
        'Test Group'
      );
      const conversation2 = await sdk2.joinGroupConversation(
        conversation1.id,
        'Test Group'
      );
      const conversation3 = await sdk3.joinGroupConversation(
        conversation1.id,
        'Test Group'
      );

      expect(conversation1.id).toBe(conversation2.id);
      expect(conversation1.id).toBe(conversation3.id);
      const convId = conversation1.id;

      // user1 发送群消息
      const msgId = await sdk1.sendMessage(convId, 'Hello from user 1 to group');
      expect(msgId).toBeDefined();

      const msg = sdk1.getMessages(convId).find((m) => m.id === msgId);
      expect(msg).toBeDefined();
      // 模拟 Waku 广播：user2、user3 均收到
      sdk2.storeMessage(msg!);
      sdk3.storeMessage(msg!);

      expect(sdk2.getMessages(convId).some((m) => m.content === 'Hello from user 1 to group')).toBe(true);
      expect(sdk3.getMessages(convId).some((m) => m.content === 'Hello from user 1 to group')).toBe(true);
      expect(sdk2.getMessages(convId).find((m) => m.id === msgId)?.sender).toBe(identity1);
      expect(sdk3.getMessages(convId).find((m) => m.id === msgId)?.sender).toBe(identity1);
    });

    it.skip('群聊消息应能广播给所有参与者（需运行 Waku 节点）', async () => {
      const conversation1 = await sdk1.createConversation(
        [],
        'group',
        'Test Group'
      );
      await sdk2.joinGroupConversation(conversation1.id, 'Test Group');
      await sdk3.joinGroupConversation(conversation1.id, 'Test Group');

      const receivedMessages2: Message[] = [];
      const receivedMessages3: Message[] = [];

      await sdk2.subscribe(conversation1.id, (message) => {
        receivedMessages2.push(message);
      });
      await sdk3.subscribe(conversation1.id, (message) => {
        receivedMessages3.push(message);
      });

      await sdk1.sendMessage(conversation1.id, 'Hello from user 1 to group');

      await new Promise((resolve) => setTimeout(resolve, 3000));

      expect(receivedMessages2.length).toBeGreaterThan(0);
      expect(receivedMessages3.length).toBeGreaterThan(0);
      expect(receivedMessages2[0].content).toBe('Hello from user 1 to group');
      expect(receivedMessages3[0].content).toBe('Hello from user 1 to group');
    });
  });

  describe('消息撤回后各端一致显示', () => {
    function filterVisibleMessages(messages: Message[]): Message[] {
      return messages.filter((m) => {
        if (m.type === 'tombstone') return false;
        const isRevoked = messages.some(
          (t) => t.type === 'tombstone' && t.tombstoneFor === m.id
        );
        return !isRevoked;
      });
    }

    it('撤回消息后双方都不应再显示原消息（本地模拟，无需 Waku）', async () => {
      const conversation1 = await sdk1.createConversation(
        [identity2],
        'direct'
      );
      const conversation2 = await sdk2.createConversation(
        [identity1],
        'direct'
      );
      const convId = conversation1.id;

      // user1 发送消息
      const messageId = await sdk1.sendMessage(convId, 'Message to be revoked');
      const msg = sdk1.getMessages(convId).find((m) => m.id === messageId);
      expect(msg).toBeDefined();
      sdk2.storeMessage(msg!); // 模拟 user2 收到

      expect(sdk2.getMessages(convId).find((m) => m.id === messageId)).toBeDefined();

      // user1 撤回
      await sdk1.revokeMessage(convId, messageId);

      const tombstone = sdk1.getMessages(convId).find(
        (m) => m.type === 'tombstone' && m.tombstoneFor === messageId
      );
      expect(tombstone).toBeDefined();
      sdk2.storeMessage(tombstone!); // 模拟 user2 收到墓碑

      const messages1 = sdk1.getMessages(convId);
      const messages2 = sdk2.getMessages(convId);
      const visible1 = filterVisibleMessages(messages1);
      const visible2 = filterVisibleMessages(messages2);

      expect(visible1.find((m) => m.id === messageId)).toBeUndefined();
      expect(visible2.find((m) => m.id === messageId)).toBeUndefined();
    });

    it.skip('撤回消息后双方都不应再显示原消息（需运行 Waku 节点）', async () => {
      const conversation1 = await sdk1.createConversation(
        [identity2],
        'direct'
      );
      const conversation2 = await sdk2.createConversation(
        [identity1],
        'direct'
      );

      const receivedMessages: Message[] = [];
      await sdk2.subscribe(conversation2.id, (message) => {
        receivedMessages.push(message);
      });

      const messageId = await sdk1.sendMessage(
        conversation1.id,
        'Message to be revoked'
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(receivedMessages.length).toBeGreaterThan(0);
      expect(receivedMessages.find((m) => m.id === messageId)).toBeDefined();

      await sdk1.revokeMessage(conversation1.id, messageId);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const tombstoneMessage = receivedMessages.find(
        (m) => m.type === 'tombstone' && m.tombstoneFor === messageId
      );
      expect(tombstoneMessage).toBeDefined();

      const messages1 = sdk1.getMessages(conversation1.id);
      const visibleMessages1 = filterVisibleMessages(messages1);

      const messages2 = sdk2.getMessages(conversation2.id);
      const visibleMessages2 = filterVisibleMessages(messages2);

      expect(visibleMessages1.find((m) => m.id === messageId)).toBeUndefined();
      expect(visibleMessages2.find((m) => m.id === messageId)).toBeUndefined();
    });
  });

  describe('本地删除消息', () => {
    it('deleteMessageLocally 应从本地 store 移除消息', async () => {
      const conversation1 = await sdk1.createConversation(
        [identity2],
        'direct'
      );

      const messageId = await sdk1.sendMessage(
        conversation1.id,
        'Message to be deleted'
      );

      let messages = sdk1.getMessages(conversation1.id);
      expect(messages.find((m) => m.id === messageId)).toBeDefined();

      sdk1.deleteMessageLocally(conversation1.id, messageId);

      messages = sdk1.getMessages(conversation1.id);
      expect(messages.find((m) => m.id === messageId)).toBeUndefined();
    });
  });
});
