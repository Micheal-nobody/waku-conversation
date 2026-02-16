# waku-demo 架构与时序图

本文档使用 Mermaid 描述项目整体架构及核心流程时序。

---

## 一、系统架构图（分层）

```mermaid
flowchart TB
    subgraph Browser["浏览器运行时"]
        subgraph UI["UI 层"]
            main["main.tsx\n(入口)"]
            App["App.tsx\n(会话/消息/发送/撤回)"]
        end

        subgraph SDK["SDK / 领域层"]
            ChatSDK["ChatSDK\n(身份/会话/加密/收发)"]
            types["types.ts\n(UserIdentity / Conversation / Message)"]
        end

        subgraph Storage["本地存储"]
            LS["localStorage\n(身份持久化)"]
            Mem["内存 Map/Set\n(会话/消息/密钥/去重)"]
        end
    end

    subgraph Network["Waku 网络"]
        LightNode["Waku LightNode\n(LightPush + Filter + Store)"]
        nwaku["nim-waku 节点\n(Docker)"]
    end

    main --> App
    App --> ChatSDK
    ChatSDK --> types
    ChatSDK --> LS
    ChatSDK --> Mem
    ChatSDK --> LightNode
    LightNode <--> nwaku
```

---

## 二、组件与数据流

```mermaid
flowchart LR
    subgraph Client["客户端"]
        User["用户"]
        App["App.tsx"]
        ChatSDK["ChatSDK"]
    end

    subgraph Persist["持久化与同步"]
        LS["localStorage"]
        Mem["内存 store"]
    end

    subgraph Waku["Waku 协议层"]
        LP["LightPush"]
        Filter["Filter"]
        Store["Store"]
    end

    User --> App
    App --> ChatSDK
    ChatSDK --> LS
    ChatSDK --> Mem
    ChatSDK --> LP
    ChatSDK --> Filter
    ChatSDK --> Store
    LP --> WakuNet["P2P 网络"]
    Filter --> WakuNet
    Store --> WakuNet
```

---

## 三、发送消息时序图

```mermaid
sequenceDiagram
    actor User as 用户
    participant App as App.tsx
    participant SDK as ChatSDK
    participant Store as 内存 store
    participant LS as localStorage
    participant LP as LightPush
    participant Waku as Waku 网络

    User->>App: 输入内容并点击发送
    App->>SDK: sendMessage(conversationId, content)

    SDK->>SDK: 构造 Message(id, sender, content, timestamp)
    SDK->>SDK: signMessage(message)
    SDK->>SDK: generateMAC(message, encryptionKey)
    SDK->>Store: storeMessage(message)
    SDK->>App: notifyMessageHandlers(message)
    Note over App: setMessages(...) 更新 UI

    SDK->>LS: setItem(waku-chat-message-*, { type, message })
    Note over LS: 触发 storage 事件，跨标签页同步

    alt 已连接 Waku 节点
        SDK->>SDK: encrypt(JSON(message), key)
        SDK->>LP: send(encoder, { payload, contentTopic })
        LP->>Waku: 发布到 content topic
        Waku-->>LP: 确认
        LP-->>SDK: result
    else 离线
        SDK->>SDK: 仅本地存储，不发送网络
    end

    SDK-->>App: return message.id
    App-->>User: 消息出现在列表
```

---

## 四、接收消息时序图

```mermaid
sequenceDiagram
    participant Waku as Waku 网络
    participant Filter as Filter 订阅
    participant SDK as ChatSDK
    participant Store as 内存 store
    participant App as App.tsx
    actor User as 用户

    Note over Waku: 对端通过 LightPush 发布消息
    Waku->>Filter: 推送匹配 content topic 的消息
    Filter->>SDK: callback(wakuMessage)

    SDK->>SDK: decryptMessage(payload, encryptionKey)
    SDK->>SDK: verifySignature(message)
    SDK->>SDK: verifyMAC(message, key)

    alt 签名或 MAC 无效
        SDK->>SDK: 丢弃消息，return
    end

    alt 会话不存在（如新单聊）
        SDK->>SDK: 自动创建 Conversation + 生成加密密钥
    end

    SDK->>SDK: processedMessageIds.has(id) 去重
    SDK->>Store: storeMessage(message)
    SDK->>App: notifyMessageHandlers(message)
    App->>App: setMessages(sdk.getMessages(...))
    App-->>User: 新消息展示在界面
```

---

## 五、会话创建与订阅流程

```mermaid
sequenceDiagram
    actor User as 用户
    participant App as App.tsx
    participant SDK as ChatSDK
    participant Filter as Filter
    participant Waku as Waku 网络

    User->>App: 创建会话（单聊/群聊）
    App->>SDK: createConversation(participants, type, name?)

    SDK->>SDK: generateConversationId(participants, type)
    SDK->>SDK: generateEncryptionKey(conversationId)
    SDK->>SDK: conversations.set(id, conversation)
    SDK->>SDK: encryptionKeys.set(id, key)

    SDK->>SDK: subscribeToConversation(conversationId)
    alt 未订阅过该会话
        SDK->>Filter: filter.subscribe([decoder], callback)
        Filter->>Waku: 订阅 content topic
    end

    SDK-->>App: 返回 conversation
    App->>App: setConversations(...) / 选中当前会话
    App->>SDK: subscribe(conversationId, messageHandler)
    SDK->>SDK: messageHandlers.set(conversationId, [..., handler])
```

---

## 六、消息撤回（Tombstone）时序

```mermaid
sequenceDiagram
    actor User as 用户
    participant App as App.tsx
    participant SDK as ChatSDK
    participant Store as 内存 store
    participant LP as LightPush
    participant Waku as Waku 网络
    participant Other as 对端客户端

    User->>App: 点击撤回某条消息
    App->>SDK: revokeMessage(conversationId, messageId)

    SDK->>SDK: 校验 sender === identity.peerId
    SDK->>SDK: 构造 tombstone Message(type='tombstone', tombstoneFor=messageId)
    SDK->>SDK: signMessage(tombstoneMessage)
    SDK->>Store: storeMessage(tombstoneMessage)
    SDK->>App: notifyMessageHandlers(tombstoneMessage)
    Note over App: 将原消息标记为 isRevoked

    SDK->>LP: send(加密的 tombstone)
    LP->>Waku: 发布
    Waku->>Other: Filter 推送
    Other->>Other: storeMessage(tombstone), 标记原消息 isRevoked
    Other-->>User: 对端看到「消息已撤回」
```

---

## 七、数据模型关系（概念）

```mermaid
erDiagram
    UserIdentity ||--o{ Conversation : "参与"
    Conversation ||--o{ Message : "包含"
    Message }o--|| Message : "tombstoneFor 指向"

    UserIdentity {
        string peerId PK
        string privateKey
        string publicKey
    }

    Conversation {
        string id PK
        enum type "direct|group"
        string[] participants
        string name
    }

    Message {
        string id PK
        string conversationId FK
        string sender FK
        string content
        number timestamp
        enum type "text|tombstone"
        string tombstoneFor FK
        string signature
        string mac
        boolean isRevoked
    }
```

---

## 八、部署与运行时拓扑

```mermaid
flowchart TB
    subgraph Dev["开发/部署环境"]
        subgraph Static["静态托管"]
            Vite["Vite dev / 静态 dist"]
        end
        subgraph Docker["Docker"]
            nwaku["nim-waku 容器\n(Store + Relay)"]
        end
    end

    subgraph Client1["浏览器实例 A"]
        App1["React App"]
        SDK1["ChatSDK\nLightNode"]
    end

    subgraph Client2["浏览器实例 B"]
        App2["React App"]
        SDK2["ChatSDK\nLightNode"]
    end

    Browser["用户浏览器"] --> Static
    App1 --> SDK1
    App2 --> SDK2
    SDK1 <--> nwaku
    SDK2 <--> nwaku
    nwaku <--> P2P["Waku P2P 网络"]
```

---

以上图表可在支持 Mermaid 的 Markdown 预览（如 VS Code、GitHub、GitLab）中直接渲染。若需导出为 PNG/SVG，可使用 [Mermaid Live Editor](https://mermaid.live) 或 `@mermaid-js/mermaid-cli`。
