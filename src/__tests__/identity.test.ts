/**
 * 身份与辅助接口测试
 * 对应 App.tsx: handleCopyIdentity 所需 identity，以及 getConversation / getAllConversations 等
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ChatSDK from '../sdk/chat-sdk';
import { resetIdentity } from '../sdk/utils/identity-util';

describe('身份与辅助接口', () => {
  let sdk: ChatSDK;
  let identity: { peerId: string };

  beforeAll(async () => {
    resetIdentity();
    sdk = new ChatSDK({ storeMessages: true });
    identity = await sdk.init();
  });

  afterAll(async () => {
    await sdk.close();
  });

  describe('handleCopyIdentity - init 返回的 identity', () => {
    it('identity.peerId 应为非空字符串', () => {
      expect(identity.peerId).toBeDefined();
      expect(typeof identity.peerId).toBe('string');
      expect(identity.peerId.length).toBeGreaterThan(0);
    });

    it('identity 应包含 privateKey 和 publicKey', () => {
      expect(identity).toHaveProperty('privateKey');
      expect(identity).toHaveProperty('publicKey');
    });
  });

  describe('getConversation - 获取会话', () => {
    it('存在的会话应能通过 id 获取', async () => {
      const created = await sdk.createConversation([], 'group', '测试群');
      const retrieved = sdk.getConversation(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('测试群');
    });

    it('不存在的会话应返回 undefined', () => {
      expect(sdk.getConversation('non-existent-id')).toBeUndefined();
    });
  });

  describe('getAllConversations - 获取所有会话', () => {
    it('初始时应返回空数组或已有会话', () => {
      const all = sdk.getAllConversations();
      expect(Array.isArray(all)).toBe(true);
    });

    it('创建会话后应出现在列表中', async () => {
      const before = sdk.getAllConversations().length;
      await sdk.createConversation([], 'group', '新群');
      const after = sdk.getAllConversations();
      expect(after.length).toBeGreaterThanOrEqual(before);
      expect(after.some((c) => c.name === '新群')).toBe(true);
    });
  });

  describe('getMessages - 获取消息列表', () => {
    it('无消息的会话应返回空数组', async () => {
      const conv = await sdk.createConversation([], 'group', '空会话');
      const messages = sdk.getMessages(conv.id);
      expect(messages).toEqual([]);
    });

    it('发送消息后应能通过 getMessages 获取', async () => {
      const conv = await sdk.createConversation([], 'group', '有消息的会话');
      await sdk.sendMessage(conv.id, '测试消息');
      const messages = sdk.getMessages(conv.id);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some((m) => m.content === '测试消息')).toBe(true);
    });
  });
});
