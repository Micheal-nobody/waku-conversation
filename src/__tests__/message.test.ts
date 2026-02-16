/**
 * 消息相关接口测试
 * 对应 App.tsx: handleSendMessage, handleRevokeMessage, handleDeleteMessage
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ChatSDK from '../sdk/chat-sdk';
import type { Message } from '../sdk/types';
import { resetIdentity } from '../sdk/utils/identity-util';

describe('消息接口 - handleSendMessage / handleRevokeMessage / handleDeleteMessage', () => {
  let sdk1: ChatSDK;
  let sdk2: ChatSDK;
  let identity1: string;
  let identity2: string;

  beforeAll(async () => {
    resetIdentity();
    sdk1 = new ChatSDK({ storeMessages: true });
    const user1 = await sdk1.init();
    identity1 = user1.peerId;

    resetIdentity();
    sdk2 = new ChatSDK({ storeMessages: true });
    const user2 = await sdk2.init();
    identity2 = user2.peerId;
  });

  afterAll(async () => {
    await sdk1.close();
    await sdk2.close();
  });

  describe('handleSendMessage - 发送消息', () => {
    it('应成功发送消息并返回消息 ID', async () => {
      const conversation = await sdk1.createConversation([identity2], 'direct');
      const messageId = await sdk1.sendMessage(conversation.id, 'Hello World');
      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe('string');

      const messages = sdk1.getMessages(conversation.id);
      expect(messages.some((m) => m.id === messageId)).toBe(true);
      expect(messages.find((m) => m.id === messageId)?.content).toBe(
        'Hello World'
      );
      expect(messages.find((m) => m.id === messageId)?.sender).toBe(identity1);
    });

    it('发送的消息应出现在本地 store 中', async () => {
      const conversation = await sdk1.createConversation([identity2], 'direct');
      const messageId = await sdk1.sendMessage(
        conversation.id,
        '测试本地存储消息'
      );
      const messages = sdk1.getMessages(conversation.id);
      const msg = messages.find((m) => m.id === messageId);
      expect(msg).toBeDefined();
      expect(msg?.content).toBe('测试本地存储消息');
      expect(msg?.type).toBe('text');
    });

    it('不存在的会话发送消息应抛出错误', async () => {
      await expect(
        sdk1.sendMessage('non-existent-conversation-id', 'test')
      ).rejects.toThrow('会话不存在');
    });
  });

  describe('handleRevokeMessage - 撤回消息', () => {
    it('发送者应能撤回自己的消息', async () => {
      const conversation = await sdk1.createConversation([identity2], 'direct');
      await sdk2.subscribe(conversation.id, () => {});
      // const conversation2 = await sdk2.createConversation([identity1], 'direct');

      const messageId = await sdk1.sendMessage(
        conversation.id,
        '将要撤回的消息'
      );
      const tombstoneId = await sdk1.revokeMessage(conversation.id, messageId);

      expect(tombstoneId).toBeDefined();
      const messages = sdk1.getMessages(conversation.id);
      const tombstone = messages.find(
        (m) => m.type === 'tombstone' && m.tombstoneFor === messageId
      );
      expect(tombstone).toBeDefined();
    });

    it('撤回不存在的消息仍会创建墓碑（SDK 当前行为）', async () => {
      const conversation = await sdk1.createConversation([identity2], 'direct');
      const tombstoneId = await sdk1.revokeMessage(
        conversation.id,
        'non-existent-message-id'
      );
      expect(typeof tombstoneId).toBe('string');
      const messages = sdk1.getMessages(conversation.id);
      expect(
        messages.some(
          (m) =>
            m.type === 'tombstone' && m.tombstoneFor === 'non-existent-message-id'
        )
      ).toBe(true);
    });

    it('撤回不存在的会话中的消息应抛出错误', async () => {
      await expect(
        sdk1.revokeMessage('non-existent-conversation', 'some-msg-id')
      ).rejects.toThrow('会话不存在');
    });
  });

  describe('handleDeleteMessage - 本地删除消息', () => {
    it('应能本地删除消息', async () => {
      const conversation = await sdk1.createConversation([identity2], 'direct');
      const messageId = await sdk1.sendMessage(
        conversation.id,
        '将被本地删除的消息'
      );

      let messages = sdk1.getMessages(conversation.id);
      expect(messages.find((m) => m.id === messageId)).toBeDefined();

      sdk1.deleteMessageLocally(conversation.id, messageId);

      messages = sdk1.getMessages(conversation.id);
      expect(messages.find((m) => m.id === messageId)).toBeUndefined();
    });

    it('删除不存在的消息应静默完成', () => {
      const conversation = sdk1.getAllConversations()[0];
      if (conversation) {
        expect(() =>
          sdk1.deleteMessageLocally(conversation.id, 'non-existent')
        ).not.toThrow();
      }
    });
  });

  describe('消息订阅 - handleMessage 回调', () => {
    it('subscribe 应能成功注册回调', async () => {
      const conversation = await sdk1.createConversation([identity2], 'direct');
      const receivedMessages: Message[] = [];
      await sdk1.subscribe(conversation.id, (msg) => {
        receivedMessages.push(msg);
      });
      const messageId = await sdk1.sendMessage(
        conversation.id,
        '同 SDK 内订阅测试'
      );
      expect(receivedMessages.length).toBeGreaterThan(0);
      expect(receivedMessages.some((m) => m.id === messageId)).toBe(true);
    });
  });
});
