#!/usr/bin/env node

/**
 * 演示脚本：2用户 + 1群组的聊天场景
 * 此脚本模拟了两个用户之间的直接聊天和一个群组聊天
 */

import ChatSDK from './src/sdk/chat-sdk.js';
import type {Message} from "./src/sdk/types.ts";
import {genDecoder} from "./src/sdk/utils/waku-util.ts";
import {Asserts} from "./src/sdk/utils/validation-utils";

// 从Store节点拉取历史消息的方法，优先从网络拉取，如果失败则使用本地存储
async function testFetchHistory(sdk: ChatSDK, conversationId: string): Promise<Message[]> {

    Asserts.isIdentify(sdk.identity);

    // 如果有网络连接且启用了Store，则从Store节点拉取历史消息
    if (sdk.node && sdk.options.storeMessages) {
        try {
            // 仅尝试一次：无 Store 节点时会立即抛 "No peers available to query"，无需重试
            await sdk.node!.store.queryWithOrderedCallback(
                [genDecoder(conversationId)],
                sdk.messageCallback(conversationId)
            );

            console.log(`从Store节点拉取历史消息成功，消息总数: ${sdk.getMessages(conversationId).length}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("No peers available to query")) {
                console.log("没有可用的Store节点，仅使用本地消息。");
            } else {
                console.warn("Store节点查询失败，仅使用本地消息。", error);
            }
        }
    }

// 离线模式或Store未启用：返回本地存储的消息
    return sdk.getMessages(conversationId);
}

async function runDemo() {
    console.log('=== Mini Encrypted Chat Demo ===\n');

    try {
        // 创建用户1
        console.log('1. Creating User 1...');
        const user1SDK = new ChatSDK({storeMessages: true});
        const user1Identity = await user1SDK.init();
        console.log(`   User 1 ID: ${user1Identity.peerId}\n`);

        // 创建用户2
        console.log('2. Creating User 2...');
        const user2SDK = new ChatSDK({storeMessages: true});
        const user2Identity = await user2SDK.init();
        console.log(`   User 2 ID: ${user2Identity.peerId}\n`);

        // 用户1创建与用户2的直接聊天
        console.log('3. User 1 creates direct chat with User 2...');
        const directChat = await user1SDK.createConversation(
            [user2Identity.peerId],
            'direct'
        );
        console.log(`   Direct chat created: ${directChat.id}\n`);

        // 用户2加入直接聊天
        console.log('4. User 2 joins direct chat...');
        const user2DirectChat = await user2SDK.createConversation(
            [user1Identity.peerId],
            'direct'
        );
        console.log(`   User 2 joined direct chat: ${user2DirectChat.id}\n`);

        // 订阅消息
        console.log('5. Setting up message listeners...');

        user1SDK.subscribe(directChat.id, (message) => {
            console.log(`\n   [User 1 received] ${message.sender}: ${message.content}`);
        });

        user2SDK.subscribe(user2DirectChat.id, (message) => {
            console.log(`\n   [User 2 received] ${message.sender}: ${message.content}`);
        });

        console.log('   Message listeners set up\n');

        // 用户1发送消息给用户2
        console.log('6. User 1 sends message to User 2...');
        const messageId1 = await user1SDK.sendMessage(
            directChat.id,
            'Hello User 2! This is a direct message.'
        );
        console.log(`   Message sent: ${messageId1}\n`);

        // 等待消息传递
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 用户2回复消息
        console.log('7. User 2 replies to User 1...');
        const messageId2 = await user2SDK.sendMessage(
            user2DirectChat.id,
            'Hi User 1! Nice to meet you.'
        );
        console.log(`   Message sent: ${messageId2}\n`);

        // 等待消息传递
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 创建群组聊天
        console.log('8. Creating group chat...');
        const groupChat = await user1SDK.createConversation(
            [user2Identity.peerId],
            'group',
            'Demo Group'
        );
        console.log(`   Group chat created: ${groupChat.id}\n`);

        // 用户2加入群组
        console.log('9. User 2 joins group chat...');
        const user2GroupChat = await user2SDK.createConversation(
            [user1Identity.peerId],
            'group',
            'Demo Group'
        );
        console.log(`   User 2 joined group chat: ${user2GroupChat.id}\n`);

        // 订阅群组消息
        console.log('10. Setting up group message listeners...');

        user1SDK.subscribe(groupChat.id, (message) => {
            console.log(`\n   [Group - User 1 received] ${message.sender}: ${message.content}`);
        });

        user2SDK.subscribe(user2GroupChat.id, (message) => {
            console.log(`\n   [Group - User 2 received] ${message.sender}: ${message.content}`);
        });

        console.log('   Group message listeners set up\n');

        // 用户1在群组发送消息
        console.log('11. User 1 sends message to group...');
        const groupMessageId1 = await user1SDK.sendMessage(
            groupChat.id,
            'Hello everyone! Welcome to the demo group.'
        );
        console.log(`   Group message sent: ${groupMessageId1}\n`);

        // 等待消息传递
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 用户2在群组回复
        console.log('12. User 2 replies to group...');
        const groupMessageId2 = await user2SDK.sendMessage(
            user2GroupChat.id,
            'Hi all! Glad to be here.'
        );
        console.log(`   Group message sent: ${groupMessageId2}\n`);

        // 等待消息传递
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 测试撤回消息
        console.log('13. User 1 revokes a message...');
        const revokeMessageId = await user1SDK.revokeMessage(
            directChat.id,
            messageId1
        );
        console.log(`   Message revoked: ${revokeMessageId}\n`);

        // 等待消息传递
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 测试历史消息拉取
        console.log('14. User 1 fetches message history...');
        const historyMessages = await testFetchHistory(user1SDK,directChat.id);
        console.log(`   Fetched ${historyMessages.length} messages\n`);

        // 清理
        console.log('15. Cleaning up...');
        await user1SDK.close();
        await user2SDK.close();
        console.log('   Done!\n');

        console.log('=== Demo completed successfully! ===');
        console.log('\nKey features demonstrated:');
        console.log('- ✅ Direct messaging between two users');
        console.log('- ✅ Group messaging with multiple users');
        console.log('- ✅ Message sending and receiving');
        console.log('- ✅ Message revocation');
        console.log('- ✅ Message history fetching');
        console.log('- ✅ Encrypted messaging');
        console.log('- ✅ P2P communication using Waku');

    } catch (error) {
        console.error('Demo failed:', error);
    }
}

// 运行演示
runDemo();
