import {webSockets} from "@libp2p/websockets";
import {all as filterAll} from "@libp2p/websockets/filters";
import type {DecodedMessage, LightNode} from "@waku/sdk";
import {
    createLightNode,

} from "@waku/sdk";
import {keccak256, toUtf8Bytes} from "ethers";
import type {
    ChatOptions,
    Conversation,
    Message,
    MessageHandler,
    UserIdentity,
} from "./types";
import {v4 as uuidv4} from "uuid";
import {
    generateIdentity,
    loadIdentity,
    saveIdentity,
} from "./utils/identity-util";
import {
    genContentTopic,
    genDecoder,
    genEncoder,
    connectToLocalNode,
    connectToRemoteNodes
} from "./utils/waku-util.ts";
import {Asserts} from "./utils/validation-utils.ts";
import {encrypt} from "./crypto/encrypt.ts";
import {decryptMessage} from "./crypto/decrypt.ts";

class ChatSDK {
    node: LightNode | null = null;
    identity: UserIdentity | null = null;
    private conversations: Map<string, Conversation> = new Map();
    private messageHandlers: Map<string, MessageHandler[]> = new Map();
    options: ChatOptions = {};
    private store: Map<string, Message[]> = new Map(); // 本地消息存储
    private encryptionKeys: Map<string, string> = new Map(); // 会话加密密钥
    private processedMessageIds: Set<string> = new Set(); // 已处理的消息ID，用于去重

    constructor(options?: ChatOptions) {
        this.options = options || {};
    }

    async init(): Promise<UserIdentity> {
        // 首先加载身份，如果加载失败则生成新身份
        this.identity = loadIdentity() || generateIdentity();
        saveIdentity(this.identity);

        try {
            // 启动Waku节点，指定默认的 pubsubTopic
            // 使用 filterAll 允许 ws（非加密）连接；connectionGater 允许私有 IP，以便连接本地 nim-waku
            this.node = await createLightNode({
                pubsubTopics: ["/waku/2/default-waku/proto"],
                libp2p: {
                    transports: [webSockets({filter: filterAll})],
                    connectionGater: {
                        denyDialMultiaddr: async () => false, // 允许连接 127.0.0.1 等私有 IP
                    },
                },
            });
            await this.node.start();

            //? 浏览器只能使用 WebSocket 传输，不能使用 TCP。本地节点需在 start-waku-node.bat 中启用 --websocket-support=true
            const localNode = "/ip4/127.0.0.1/tcp/8000/ws/p2p/16Uiu2HAm6n4hGA4FvBp3mzgwjsr1nfbL4HkEnu8eiTi33w4exGgt"
            await connectToLocalNode(this.node, localNode);

            // 尝试等待远程对等节点，使用较短的超时时间
            try {
                await connectToRemoteNodes(this.node, this.options);
            } catch (error) {
                console.warn("已连接本地节点但无法等待远程节点，继续使用基础功能", error);
            }
        } catch (error) {
            console.warn("Waku 节点初始化失败，正在以离线模式运行：", error,);
            this.node = null; // 确保在严重错误时设置为null
        }

        return this.identity;
    }


    /**
     * 双人会话：根据自己与对方的 peerId 生成 conversationId（双方一致）。
     * 群聊创建：仅传 name，conversationId 由 UUID 生成。
     * 群聊加入：调用 joinGroupConversation(conversationId, name)。
     */
    async createConversation(
        participantIds: string[],
        type: "direct" | "group",
        name?: string,
        conversationId?: string,
    ): Promise<Conversation> {
        Asserts.isIdentify(this.identity);

        let id: string;
        let allParticipants: string[];

        if (type === "direct") {
            if (participantIds.length !== 1) {
                throw new Error("双人会话必须传入且仅传入对方的 peerId");
            }
            allParticipants = [this.identity.peerId, participantIds[0]].sort();
            id = allParticipants.join("_");
        } else {
            // 群聊：创建时 conversationId 为 uuid，加入时由调用方传入
            id = conversationId ?? uuidv4();
            allParticipants = [this.identity.peerId];
        }

        if (this.conversations.has(id)) {
            return this.conversations.get(id)!;
        }

        const conversation: Conversation = {
            id,
            type,
            participants: allParticipants,
            name,
        };

        this.conversations.set(id, conversation);
        this.encryptionKeys.set(id, this.genEncryptionKey(conversation));
        await this.subscribeToConversation(id);

        return conversation;
    }

    /** 通过会话 ID 加入已有群聊（仅群聊，双人会话无需加入、创建时即确定 ID）。 */
    async joinGroupConversation(conversationId: string, name: string = "群聊1"): Promise<Conversation> {
        return this.createConversation([], "group", name, conversationId);
    }

    private genEncryptionKey(conversation: Conversation): string {
        const keyMaterial =
            conversation.type === "group"
                ? conversation.id
                : `${conversation.id}_${[...conversation.participants].sort().join("_")}`;
        const hash = keccak256(toUtf8Bytes(keyMaterial));
        return hash.slice(0, 32);
    }

    // 发送消息的方法，首先验证SDK是否初始化，然后检查会话是否存在；接着创建消息对象，添加签名和MAC，并本地存储消息；通过localStorage发送消息给其他标签页和浏览器；如果有网络连接，则发送消息到Waku网络。
    // 注意：即使网络发送失败，消息也已经成功存储在本地，并且会通过localStorage通知其他标签页。
    async sendMessage(conversationId: string, content: string): Promise<string> {
        Asserts.isIdentify(this.identity);

        const conversation = this.conversations.get(conversationId);
        Asserts.isExist(conversation, "会话不存在");

        // 创建消息对象
        const message: Message = {
            id: uuidv4(),
            conversationId,
            sender: this.identity.peerId,
            content,
            timestamp: Date.now(),
            type: "text",
        };

        // 获取会话加密密钥
        const encryptionKey = this.encryptionKeys.get(conversationId);
        Asserts.isExist(encryptionKey, "未找到会话加密密钥");

        // 与墓碑消息共用：加密（含签名、MAC），加密后 payload 用于网络发送
        const encryptedMessage = encrypt(message, encryptionKey);

        // 本地存储消息
        this.storeMessage(encryptedMessage);
        this.notifyMessageHandlers(encryptedMessage);

        // 通过 localStorage 发送消息给其他标签页和浏览器
        try {
            const uniqueKey = `waku-chat-message-${Date.now()}`;
            localStorage.setItem(
                uniqueKey,
                JSON.stringify({
                    type: "new-message",
                    message: encryptedMessage,
                    timestamp: Date.now(),
                }),
            );
            setTimeout(() => localStorage.removeItem(uniqueKey), 0);
            console.log(`已通过 localStorage 向其他浏览器发送消息：${encryptedMessage.id}`,);
        } catch (error) {
            console.warn("通过 localStorage 向其他标签页发送消息失败：", error,);
        }

        // 与墓碑消息共用：发送到 Waku 网络（使用同一套发送逻辑）
        await this.sendMessageToWaku(conversationId, encryptedMessage);

        return encryptedMessage.id;
    }

    /** 普通消息与墓碑消息共用的 Waku 发送逻辑：使用已加密消息的 payload 发送 */
    private async sendMessageToWaku(conversationId: string, encryptedMessage: Message): Promise<void> {
        if (!this.node || !encryptedMessage.payload) return;
        try {
            const contentTopic = genContentTopic(conversationId);
            const encoder = genEncoder(conversationId);

            const wakuMessage = {
                payload: encryptedMessage.payload,
                contentTopic,
                ephemeral: false,
            };

            const result = await this.node.lightPush.send(encoder, wakuMessage);
            if (result) {
                console.log(`消息已发送到 Waku 网络：${encryptedMessage.id}`);
            } else {
                console.warn("LightPush 发送失败，消息仅存储在本地");
            }

        } catch (error) {
            console.warn("向 Waku 网络发送消息失败，消息仅存储在本地：", error,);
        }
    }

    // 撤回消息的方法，首先验证消息发送者是否为当前用户，然后创建一个墓碑消息（tombstone message）来标记该消息已被撤回，并通过localStorage通知其他标签页和浏览器；如果有网络连接，则发送墓碑消息到Waku网络。
    // 注意：由于Waku的去中心化特性，无法保证所有节点都真正删除消息，因此撤回操作主要依赖于客户端的处理逻辑。
    async revokeMessage(conversationId: string, messageId: string,): Promise<string> {
        Asserts.isIdentify(this.identity);

        const conversation = this.conversations.get(conversationId);
        if (!conversation) {
            throw new Error("会话不存在");
        }

        // 验证只有原发送者能撤回消息
        const messages = this.getMessages(conversationId);
        const messageToRevoke = messages.find((msg) => msg.id === messageId);
        if (messageToRevoke && messageToRevoke.sender !== this.identity.peerId) {
            throw new Error("仅原发送者可撤回该消息");
        }

        // 创建墓碑消息（与普通消息共用类型，仅 type/tombstoneFor 不同）
        const tombstoneMessage: Message = {
            id: uuidv4(),
            conversationId,
            sender: this.identity.peerId,
            content: "",
            timestamp: Date.now(),
            type: "tombstone",
            tombstoneFor: messageId,
        };

        const encryptionKey = this.encryptionKeys.get(conversationId);
        Asserts.isExist(encryptionKey, "未找到会话加密密钥");


        // 与普通消息共用：加密（含签名、MAC）、存储、通知、localStorage、Waku 发送
        const encryptedTombstone = encrypt(tombstoneMessage, encryptionKey);
        console.log(
            `已创建墓碑消息：${encryptedTombstone.id}，对应消息：${messageId}`,
        );

        this.storeMessage(encryptedTombstone);
        this.notifyMessageHandlers(encryptedTombstone);

        try {
            const uniqueKey = `waku-chat-message-${Date.now()}`;
            localStorage.setItem(
                uniqueKey,
                JSON.stringify({
                    type: "new-message",
                    message: encryptedTombstone,
                    timestamp: Date.now(),
                }),
            );
            setTimeout(() => localStorage.removeItem(uniqueKey), 0);
        } catch (error) {
            console.warn(
                "通过 localStorage 向其他标签页发送墓碑消息失败：",
                error,
            );
        }

        await this.sendMessageToWaku(conversationId, encryptedTombstone);

        // 注意：无法保证所有节点都真正删除消息
        // 原因与边界：
        // 1. Waku是一个去中心化网络，消息可能已经被多个节点存储
        // 2. 墓碑消息可能无法及时传播到所有节点
        // 3. 离线节点重新上线后可能仍然有旧消息的副本
        // 4. Store节点可能会保留历史消息的备份

        return encryptedTombstone.id;
    }

    /** 退出会话：发送 user-leave 消息通知其他人，并从本地移除该会话。 */
    async leaveConversation(conversationId: string): Promise<void> {
        Asserts.isIdentify(this.identity);

        const conversation = this.conversations.get(conversationId);
        Asserts.isExist(conversation);

        const encryptionKey = this.encryptionKeys.get(conversationId);
        Asserts.isExist(encryptionKey, "未找到会话加密密钥");


        const leaveMessage: Message = {
            id: uuidv4(),
            conversationId,
            sender: this.identity.peerId,
            content: "",
            timestamp: Date.now(),
            type: "user-leave",
        };

        const encryptedLeave = encrypt(leaveMessage, encryptionKey);

        try {
            const uniqueKey = `waku-chat-message-${Date.now()}`;
            localStorage.setItem(
                uniqueKey,
                JSON.stringify({
                    type: "new-message",
                    message: encryptedLeave,
                    timestamp: Date.now(),
                }),
            );
            setTimeout(() => localStorage.removeItem(uniqueKey), 0);
        } catch (error) {
            console.warn("通过 localStorage 发送 user-leave 失败：", error);
        }

        await this.sendMessageToWaku(conversationId, encryptedLeave);

        // 本地移除会话，立即生效；网络通知其他标签页和浏览器；如果有网络连接，则发送 user-leave 消息到 Waku 网络
        this.removeConversationLocally(conversationId);
    }

    private removeConversationLocally(conversationId: string): void {
        this.conversations.delete(conversationId);
        this.encryptionKeys.delete(conversationId);
        this.messageHandlers.delete(conversationId);
        this.store.delete(conversationId);
        this.subscribedConversations.delete(conversationId);
    }

    // 订阅会话消息的方法，首先添加消息处理函数到messageHandlers中，然后调用subscribeToConversation方法订阅Waku网络消息
    async subscribe(conversationId: string, handler: MessageHandler,): Promise<void> {
        // 添加消息处理函数
        this.messageHandlers.set(conversationId, this.messageHandlers.get(conversationId) || []);

        const handlers = this.messageHandlers.get(conversationId)!
        if (!handlers.includes(handler)) {
            handlers.push(handler);
            console.log(
                `已订阅会话 ${conversationId}，处理函数数量：${this.messageHandlers.get(conversationId)?.length}`,
            );
        } else {
            console.log(
                `处理函数已订阅会话 ${conversationId}`,
            );
        }

        // 订阅Waku网络消息
        await this.subscribeToConversation(conversationId);
    }


    messageCallback = (conversationId: string) => {
        return (wakuMessage: DecodedMessage) => {
            if (!wakuMessage.payload) return;

            try {
                // 获取当前会话的加密密钥
                const encryptionKey = this.encryptionKeys.get(conversationId);
                if (!encryptionKey) {
                    console.log(`未找到会话 ${conversationId} 的加密密钥`);
                    return;
                }

                // 尝试解密消息
                const message = decryptMessage(wakuMessage, encryptionKey);

                // 确保会话ID匹配
                if (message.conversationId !== conversationId) {
                    console.warn("会话 ID 不匹配，丢弃消息：", message.id,);
                    return;
                }

                // 检查会话是否存在，如果不存在则自动创建
                //? 实际上不会发生，因为 encryptionKey 的生成依赖于会话对象，只有存在会话时才会有加密密钥；但保留此逻辑以防万一（例如，收到旧消息时会话已被删除）
                // if (!this.conversations.has(message.conversationId)) {
                //     this.createConversation([message.sender], "direct", `与 ${message.sender.slice(0, 6)}... 的聊天`)
                //         .catch((error) => {
                //             console.error("自动创建会话失败：", error);
                //         });
                // }

                // 普通消息与墓碑消息共用解密与存储；业务层在展示时忽略墓碑（仅用 type/tombstoneFor 做撤回处理）
                this.storeMessage(message);
                this.notifyMessageHandlers(message);
                console.log(`从 Waku 网络收到消息：${message.id}`);
            } catch (error) {
                console.error("处理网络消息失败:", error);
            }
        };
    }

    // 订阅会话消息的方法，首先检查是否已经订阅过该会话，避免重复订阅；如果有网络连接，则订阅Waku网络消息，并自动拉取历史消息（如果启用了Store）
    private subscribedConversations: Set<string> = new Set(); // 已订阅的会话ID
    private async subscribeToConversation(conversationId: string): Promise<void> {
        if (this.subscribedConversations.has(conversationId)) {
            console.log(`已在 Waku 网络上订阅会话 ${conversationId}`);
            return;
        }

        // 标记会话为已订阅
        this.subscribedConversations.add(conversationId);

        // 如果有网络连接，订阅 Waku 网络消息
        if (this.node) {
            try {
                // 订阅消息
                await this.node.filter.subscribe(
                    [genDecoder(conversationId)],
                    this.messageCallback(conversationId)
                );

                console.log(`已在 Waku 网络上订阅会话 ${conversationId}`,);
            } catch (error) {
                console.error(`在 Waku 网络上订阅会话 ${conversationId} 失败：`, error,);
            }
        }

        // 自动拉取历史消息（如果需要）
        if (this.node && this.options.storeMessages) {
            try {

                // 仅尝试一次：无 Store 节点时会立即抛 "No peers available to query"，无需重试
                await this.node!.store.queryWithOrderedCallback(
                    [genDecoder(conversationId)],
                    this.messageCallback(conversationId)
                );

                console.log(`已自动拉取会话 ${conversationId} 的历史`);
            } catch (error) {
                console.error(`拉取会话 ${conversationId} 历史失败：`, error,);
            }
        }

        console.log(`已订阅会话 ${conversationId}`);
    }

    // 消息存储方法，首先检查消息ID是否已处理过，如果没有则存储消息，并清理旧消息以节省空间
    storeMessage(message: Message): void {
        // 消息去重：如果消息ID已处理，跳过
        if (this.processedMessageIds.has(message.id)) {
            return;
        }

        this.processedMessageIds.add(message.id);

        this.store.set(message.conversationId, this.store.get(message.conversationId) || []);
        const messages = this.store.get(message.conversationId)!;

        messages.push(message);
        // 清理旧消息，只保留最近的100条消息
        if (messages.length > 100) {
            const trimmedMessages = messages.slice(-100);
            this.store.set(message.conversationId, trimmedMessages);
            console.log(
                `已裁剪会话 ${message.conversationId} 的消息，保留 ${trimmedMessages.length} 条`,
            );
        }
    }

    // 通知消息处理函数的方法，根据会话ID获取对应的处理函数数组，并调用每个处理函数处理消息
    private notifyMessageHandlers(message: Message): void {
        const handlers = this.messageHandlers.get(message.conversationId);
        handlers?.forEach((handler) => handler(message));
    }

    // 本地删除消息的方法，根据会话ID和消息ID删除消息
    deleteMessageLocally(conversationId: string, messageId: string): void {
        const messages = this.store.get(conversationId);
        if (messages) {
            const filteredMessages = messages.filter((msg) => msg.id !== messageId);
            this.store.set(conversationId, filteredMessages);
        }
    }

    // 获取会话消息的方法，根据会话ID返回消息数组，如果没有消息则返回空数组
    getMessages(conversationId: string): Message[] {
        return this.store.get(conversationId) || [];
    }

    // 获取会话信息的方法，根据会话ID返回会话对象，如果会话不存在则返回undefined
    getConversation(conversationId: string): Conversation | undefined {
        return this.conversations.get(conversationId);
    }

    // 获取所有会话的方法，返回一个包含所有会话对象的数组
    getAllConversations(): Conversation[] {
        return Array.from(this.conversations.values());
    }

    // 关闭SDK，清理资源
    async close(): Promise<void> {
        if (this.node) {
            try {
                await this.node.stop();
                console.log("Waku 节点已成功停止");
            } catch (error) {
                console.error("停止 Waku 节点失败：", error);
            }
            this.node = null;
        }
        console.log("SDK 已关闭");
    }
}

export default ChatSDK;
