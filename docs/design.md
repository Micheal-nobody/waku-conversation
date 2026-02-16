# Mini Encrypted Chat 设计文档

本文档描述本项目的协议封装设计、Topic 规划、安全方案及撤回/删除的边界说明。

---

## 一、协议封装设计

### 1.1 协议层次

本项目在 Waku v2 协议之上构建应用层协议，层次关系如下：

| 层次 | 说明 |
|------|------|
| **应用层** | Message 业务对象（text / tombstone / user-leave） |
| **应用协议层** | 加密、签名、MAC、序列化 |
| **Waku 层** | LightPush 发送、Filter 订阅、Store 历史 |
| **传输层** | WebSocket（浏览器） |

### 1.2 消息封装格式

所有消息统一封装为 `Message` 类型，经加密后以 `payload`（Uint8Array）形式在 Waku 网络中传输：

```
Message (明文) → 签名 + MAC → 加密 → payload → WakuMessage
```

**消息类型：**

| type | 说明 | 特殊字段 |
|------|------|----------|
| `text` | 普通文本消息 | - |
| `tombstone` | 撤回标记（墓碑消息） | `tombstoneFor`: 被撤回的消息 ID |
| `user-leave` | 用户退出会话 | - |

**封装流程：**

1. 构造 `Message` 对象（含 id、conversationId、sender、content、timestamp、type 等）
2. 计算 `signature`：对业务字段做 keccak256，用于身份验证
3. 计算 `mac`：对业务字段 + 会话密钥做 keccak256，用于防篡改
4. 将明文 JSON（含 signature、mac）序列化后 XOR 加密，得到 `payload`
5. 通过 Waku LightPush 发送，仅携带 `payload`、`contentTopic`、`ephemeral`

**解封流程：**

1. 从 Waku 收到 `DecodedMessage`，提取 `payload`
2. 使用会话密钥 XOR 解密，得到明文 JSON
3. 验证 `signature`、`mac`，失败则丢弃
4. 解析为 `Message`，根据 `type` 做业务处理（展示 / 撤回 / 退出）

### 1.3 发送与接收链路

- **发送**：`sendMessage` / `revokeMessage` / `leaveConversation` → 加密 → `storeMessage` → `notifyMessageHandlers` → `localStorage`（跨标签页） → `sendMessageToWaku`（LightPush）
- **接收**：Waku Filter 推送 → `messageCallback` → 解密 → 去重 → `storeMessage` → `notifyMessageHandlers` → UI 更新

普通消息与墓碑消息共用同一套加密、存储、Waku 发送逻辑；仅在业务层根据 `type` / `tombstoneFor` 区分展示和撤回状态。

---

## 二、Topic 规划

### 2.1 Pubsub Topic

- **值**：`/waku/2/default-waku/proto`
- **用途**：所有聊天消息共用一个 pubsub topic，通过 content topic 区分会话
- **配置**：在 `createLightNode` 中指定，Filter / LightPush / Store 均使用此 topic
- **选择依据**: Waku v2 推荐使用固定 pubsub topic，简化网络层配置；通过 content topic 实现应用层的会话隔离，符合 Waku 的设计理念。

### 2.2 Content Topic

- **格式**：`/waku/chat/{conversationId}/proto`
- **生成规则**：`genContentTopic(conversationId)`，将 conversationId 中非法字符替换为 `_`
- **作用**：每个会话对应唯一 content topic，实现会话级消息隔离
- **选择依据**: 
 1. Waku v2 设计鼓励使用 content topic 实现应用层的消息分类和隔离，符合协议最佳实践。
 2. 通过 conversationId 生成 content topic，确保每个会话有独立的消息流，简化消息处理逻辑。
 3. 替换非法字符为 `_` 确保生成的 content topic 符合 Waku 的格式要求，避免潜在的解析问题。

### 2.3 ConversationId 规划

| 会话类型 | 生成规则 | 示例 |
|----------|----------|------|
| **双人会话** | `[peerId1, peerId2].sort().join("_")` | `0x123...abc_0x456...def` |
| **群聊** | 创建时用 UUID；加入时由调用方传入 | `550e8400-e29b-41d4-a716-446655440000` |

**设计要点：**

- 双人会话：双方使用相同的 conversationId，无需额外「加入」步骤
- 群聊：创建者生成 UUID，通过线下或其他渠道分享给其他成员，后者通过 `joinGroupConversation(conversationId, name)` 加入

### 2.4 Encoder / Decoder

- **Encoder**：`createEncoder({ contentTopic, pubsubTopic })`，用于 LightPush 发送
- **Decoder**：`createDecoder(contentTopic, pubsubTopic)`，用于 Filter 订阅和 Store 查询
- 两者均基于 `genContentTopic(conversationId)` 和固定 pubsub topic 生成

---

## 三、安全方案

### 3.1 身份与密钥

- **身份生成**：使用 `ethers.Wallet.createRandom()` 生成以太坊钱包
- **身份结构**：`{ peerId: address, privateKey, publicKey }`
- **持久化**：存储于 `localStorage`（`waku-chat-identity`），跨会话复用

### 3.2 会话加密密钥

- **双人会话**：`keccak256(conversationId + "_" + participants.sort().join("_"))`
- **群聊**：`keccak256(conversationId)`
- **密钥派生**：加密时使用 `keccak256(key)` 的前 32 字节作为 XOR 密钥

### 3.3 消息保护

| 机制 | 实现 | 用途 |
|------|------|------|
| **签名** | `signature = keccak256(JSON(业务字段))` | 身份验证、防冒充 |
| **MAC** | `mac = keccak256(JSON(业务字段) + "_" + 会话密钥)` | 完整性、防篡改 |
| **加密** | XOR + keccak256 派生密钥 | 机密性（演示用） |

### 3.4 撤回权限控制

- 只有**原发送者**（`message.sender === identity.peerId`）可以撤回消息
- 撤回时构造墓碑消息，经同样加密/签名/MAC 流程发送，接收方验证后将被撤回消息标记为 `isRevoked`

### 3.5 安全限制（已知）

- **加密**：当前为 XOR 方案，生产环境建议使用 AES-256-GCM
- **密钥交换**：使用会话 ID 派生密钥，建议引入 Diffie-Hellman 等密钥交换
- **签名**：当前为哈希而非数字签名，建议使用以太坊签名（如 ECDSA）验证发送者

---

## 四、撤回删除边界说明

### 4.1 撤回（Revoke）

**机制：**

- 发送者发起撤回时，创建一条 `type: "tombstone"`、`tombstoneFor: messageId` 的消息
- 该墓碑消息与普通消息一样加密、签名、发送到 Waku 网络
- 接收方收到后，将对应 `messageId` 的消息标记为 `isRevoked`，在 UI 上显示「消息已撤回」

**边界：**

| 层面 | 能力 | 说明 |
|------|------|------|
| **客户端** | ✅ 可撤回 | 发送者可发送墓碑消息，接收方可正确解析并标记 |
| **Waku 网络** | ⚠️ 无法物理删除 | 原消息和墓碑消息均已在网络中传播，无法从所有节点删除 |
| **Store 节点** | ⚠️ 可能保留历史 | 历史拉取可能仍返回原消息，客户端需根据墓碑做展示过滤 |
| **离线节点** | ⚠️ 可能错过墓碑 | 若先收到原消息、后长期离线，可能收不到墓碑，上线后仍显示原内容 |

**结论**：撤回是**展示层语义**，依赖客户端对墓碑消息的处理；无法保证所有节点、所有用户在任何时刻都「看不到」原消息。

### 4.2 本地删除（Delete Locally）

**机制：**

- 用户可在本地调用 `deleteMessageLocally(conversationId, messageId)`
- 仅从本地内存 store 中移除该消息，不再参与展示

**边界：**

| 层面 | 能力 | 说明 |
|------|------|------|
| **本客户端** | ✅ 可删除 | 消息不再显示 |
| **其他客户端** | ❌ 无影响 | 不发送任何网络消息，其他用户不受影响 |
| **Waku 网络** | ❌ 无影响 | 原消息仍在网络中，Store 仍可返回 |
| **跨设备** | ❌ 不同步 | 本地删除不同步到其他设备/标签页 |

**结论**：本地删除是**纯本地行为**，仅影响当前客户端展示，与网络无关。

### 4.3 设计取舍总结

- **撤回**：通过墓碑消息实现「逻辑撤回」，满足合规与产品需求；不依赖网络层物理删除，符合 Waku 去中心化特性。
- **本地删除**：满足用户「眼不见为净」的隐私需求，实现简单，无网络开销。
- **生产建议**：若需更强的撤回保证，可考虑：
  - 在应用层约定「收到墓碑后不再展示」的客户端策略
  - 历史拉取时根据墓碑过滤展示
  - 明确向用户说明：撤回无法保证所有节点删除，适用于日常聊天场景

---

## 附录：相关文件

| 文件 | 职责 |
|------|------|
| `src/sdk/chat-sdk.ts` | 核心 SDK：会话、消息、Waku 收发、撤回、本地删除 |
| `src/sdk/types.ts` | Message、Conversation、UserIdentity 等类型 |
| `src/sdk/utils/waku-util.ts` | genContentTopic、genEncoder、genDecoder |
| `src/sdk/crypto/encrypt.ts` | 加密、签名、MAC |
| `src/sdk/crypto/decrypt.ts` | 解密、签名验证、MAC 验证 |
