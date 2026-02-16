/**
 * 会话相关接口测试
 * 对应 App.tsx: handleCreateConversation, handleJoinGroup, handleLeaveConversation
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ChatSDK from '../sdk/chat-sdk';
import { resetIdentity } from '../sdk/utils/identity-util';

describe('会话接口 - handleCreateConversation / handleJoinGroup / handleLeaveConversation', () => {
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

  describe('handleCreateConversation - 创建双人会话', () => {
    it('应成功创建双人会话', async () => {
      const conversation = await sdk1.createConversation(
        [identity2],
        'direct',
        '与 对方 的聊天'
      );
      expect(conversation).toBeDefined();
      expect(conversation.type).toBe('direct');
      expect(conversation.participants).toContain(identity1);
      expect(conversation.participants).toContain(identity2);
      expect(conversation.name).toBe('与 对方 的聊天');
      expect(conversation.id).toContain(identity1);
      expect(conversation.id).toContain(identity2);
    });

    it('双方创建同一会话应得到相同 conversationId', async () => {
      const conv1 = await sdk1.createConversation([identity2], 'direct');
      const conv2 = await sdk2.createConversation([identity1], 'direct');
      expect(conv1.id).toBe(conv2.id);
    });

    it('双人会话缺少 participantId 应抛出错误', async () => {
      await expect(
        sdk1.createConversation([], 'direct')
      ).rejects.toThrow('双人会话必须传入且仅传入对方的 peerId');
    });

    it('双人会话传入多个 participant 应抛出错误', async () => {
      await expect(
        sdk1.createConversation([identity2, 'peer3'], 'direct')
      ).rejects.toThrow('双人会话必须传入且仅传入对方的 peerId');
    });
  });

  describe('handleCreateConversation - 创建群聊', () => {
    it('应成功创建群聊', async () => {
      const conversation = await sdk1.createConversation(
        [],
        'group',
        '测试群聊'
      );
      expect(conversation).toBeDefined();
      expect(conversation.type).toBe('group');
      expect(conversation.name).toBe('测试群聊');
      expect(conversation.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('群聊会话 ID 应为 UUID 格式（便于分享加入）', async () => {
      const conversation = await sdk1.createConversation([], 'group', '群聊');
      expect(conversation.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('handleJoinGroup - 加入群聊', () => {
    it('应能通过会话 ID 加入已有群聊', async () => {
      const created = await sdk1.createConversation([], 'group', '可加入的群');
      const joined = await sdk2.joinGroupConversation(
        created.id,
        '本地显示名称'
      );
      expect(joined.id).toBe(created.id);
      expect(joined.name).toBe('本地显示名称');
      expect(joined.type).toBe('group');
      expect(joined.participants).toContain(identity2);
    });

    it('加入时可省略显示名称', async () => {
      const created = await sdk1.createConversation([], 'group', '无名群');
      const joined = await sdk2.joinGroupConversation(created.id);
      expect(joined.id).toBe(created.id);
      expect(joined.type).toBe('group');
    });
  });

  describe('handleLeaveConversation - 退出会话', () => {
    it('应能成功退出会话', async () => {
      const conversation = await sdk1.createConversation([identity2], 'direct');
      await sdk1.leaveConversation(conversation.id);
      expect(sdk1.getConversation(conversation.id)).toBeUndefined();
      expect(sdk1.getAllConversations()).not.toContainEqual(
        expect.objectContaining({ id: conversation.id })
      );
    });

    it('退出不存在的会话应静默完成', async () => {
      await expect(
        sdk1.leaveConversation('non-existent-id')
      ).resolves.not.toThrow();
    });
  });
});
