import {useState, useEffect, useRef} from 'react';
import './App.css';
import ChatSDK from './sdk/chat-sdk';
import type {UserIdentity, Conversation, Message} from './sdk/types';
import {Toast} from './components/toast';

function App() {
    const [sdk, setSdk] = useState<ChatSDK | null>(null);
    const [identity, setIdentity] = useState<UserIdentity | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const [participantId, setParticipantId] = useState('');
    const [conversationName, setConversationName] = useState('');
    const [conversationType, setConversationType] = useState<'direct' | 'group'>('direct');
    const [joinGroupId, setJoinGroupId] = useState('');
    const [joinGroupName, setJoinGroupName] = useState('');
    const [lastCreatedConversationId, setLastCreatedConversationId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<'chat' | 'create'>('chat');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // 初始化SDK
        (async () => {
            try {
                setIsInitializing(true);
                const chatSDK = new ChatSDK({storeMessages: true});
                const userIdentity = await chatSDK.init();

                setSdk(chatSDK);
                setIdentity(userIdentity);
                setConversations(chatSDK.getAllConversations());
            } catch (err) {
                console.error('SDK 初始化失败：', err);
                setError('SDK 初始化失败，正在以离线模式运行。');
            } finally {
                setIsInitializing(false);
            }
        })();
    }, []);

    // 监听localStorage事件，实现跨标签页和跨浏览器通信
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            // 检查是否是我们的消息事件
            if (e.key && e.key.startsWith('waku-chat-message-') && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data.type === 'new-message' && data.message) {
                        // 处理来自其他标签页或浏览器的消息
                        if (sdk && identity) {
                            // 确保消息被正确处理
                            const message = data.message;

                            console.log(`收到来自其他浏览器的消息：${message.id}`);

                            if (!sdk.getConversation(message.conversationId)) {
                                const isDirect = !message.conversationId.includes("-");
                                const onJoined = () => {
                                    setConversations(sdk.getAllConversations());
                                    sdk.storeMessage(message);
                                    if (currentConversation && message.conversationId === currentConversation.id) {
                                        setMessages(sdk.getMessages(currentConversation.id));
                                    }
                                };
                                if (isDirect) {
                                    sdk.createConversation(
                                        [message.sender],
                                        "direct",
                                        `与 ${message.sender.slice(0, 6)}... 的聊天`
                                    ).then(onJoined).catch(err => console.error("自动创建双人会话失败：", err));
                                } else {
                                    sdk.joinGroupConversation(message.conversationId).then(onJoined).catch(err =>
                                        console.error("自动加入群聊失败：", err)
                                    );
                                }
                            } else {
                                sdk.storeMessage(message);
                                if (currentConversation && message.conversationId === currentConversation.id) {
                                    setMessages(sdk.getMessages(currentConversation.id));
                                }
                            }
                            setConversations(sdk.getAllConversations());
                        }
                    }
                } catch (err) {
                    console.error('解析 localStorage 消息失败：', err);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [sdk, currentConversation, identity]);

    // 滚动到最新消息
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    // 当会话列表变化时，确保所有会话都被订阅
    useEffect(() => {
        if (sdk) {
            const handleMessage = (message: Message) => {
                // 更新会话列表，确保新创建的会话能够显示在UI中
                setConversations(sdk.getAllConversations());

                // 如果当前会话是消息所属的会话，更新消息列表
                if (currentConversation && message.conversationId === currentConversation.id) {
                    setMessages(prev => {
                        // 避免重复消息
                        if (prev.some(mes => mes.id === message.id)) {
                            return prev;
                        }
                        return [...prev, message];
                    });
                }
            }

            // 订阅所有会话的消息
            sdk.getAllConversations().forEach(async conversation => {
                await sdk.subscribe(conversation.id, handleMessage);
            });
        }
    }, [sdk, conversations]);

    // 加载当前会话的消息
    useEffect(() => {
        if (sdk && currentConversation) {
            (async () => {
                const conversationMessages = sdk.getMessages(currentConversation.id);
                setMessages(conversationMessages);
            })();
        }
    }, [sdk, currentConversation]);

    const handleCreateConversation = async (e: React.FormEvent) => {
        e?.preventDefault?.();
        if (!sdk || !identity) {
            setError('SDK 未就绪');
            return;
        }

        if (conversationType === 'direct') {
            const otherId = participantId.trim();
            if (!otherId) {
                setError('请输入对方的 peerId');
                return;
            }
            try {
                const conversation = await sdk.createConversation(
                    [otherId],
                    'direct',
                    conversationName.trim() || `与 ${otherId.slice(0, 6)}... 的聊天`
                );
                setConversations(prev => [...prev, conversation]);
                setCurrentConversation(conversation);
                setParticipantId('');
                setConversationName('');
                setError(null);
            } catch (err) {
                console.error('创建双人会话失败：', err);
                setError('创建双人会话失败');
            }
            return;
        }

        if (conversationType === 'group') {
            try {
                const conversation = await sdk.createConversation(
                    [],
                    'group',
                    conversationName.trim() || '群聊'
                );
                setConversations(prev => [...prev, conversation]);
                setCurrentConversation(conversation);
                setLastCreatedConversationId(conversation.id);
                setConversationName('');
                setError(null);
            } catch (err) {
                console.error('创建群聊失败：', err);
                setError('创建群聊失败');
            }
        }
    };

    const handleJoinGroup = async (e: React.FormEvent) => {
        e?.preventDefault?.();
        if (!sdk || !identity) {
            setError('SDK 未就绪');
            return;
        }

        const id = joinGroupId.trim();
        if (!id) {
            setError('请输入要加入的群聊会话 ID');
            return;
        }
        try {
            const conversation = await sdk.joinGroupConversation(id, joinGroupName.trim() || undefined);
            setConversations(prev => [...prev, conversation]);
            setCurrentConversation(conversation);
            setJoinGroupId('');
            setJoinGroupName('');
            setError(null);
        } catch (err) {
            console.error('加入群聊失败：', err);
            setError('加入群聊失败');
        }
    };

    const handleCopyConversationId = () => {
        if (!lastCreatedConversationId) return;
        navigator.clipboard.writeText(lastCreatedConversationId);
    };

    const handleSendMessage = async () => {
        if (!sdk || !currentConversation || !messageInput.trim()) {
            return;
        }

        try {
            await sdk.sendMessage(currentConversation.id, messageInput.trim());
            setMessageInput('');
            setError(null);
        } catch (err) {
            console.error('发送消息失败：', err);
            setError('发送消息失败');
        }
    };

    const handleRevokeMessage = async (messageId: string) => {
        if (!sdk || !currentConversation) {
            return;
        }

        try {
            await sdk.revokeMessage(currentConversation.id, messageId);
            // 更新本地消息状态
            setMessages(prev => prev.map(msg =>
                msg.id === messageId ? {...msg, isRevoked: true, content: '该消息已被撤回。'} : msg
            ));
            setError(null);
        } catch (err) {
            console.error('撤回消息失败：', err);
            setError('撤回消息失败');
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!sdk || !currentConversation) {
            return;
        }

        try {
            // 本地删除消息
            sdk.deleteMessageLocally(currentConversation.id, messageId);
            // 更新本地消息状态
            setMessages(prev => prev.filter(msg => msg.id !== messageId));
            setError(null);
        } catch (err) {
            console.error('删除消息失败：', err);
            setError('删除消息失败');
        }
    };

    const handleCopyIdentity = () => {
        if (identity) {
            navigator.clipboard.writeText(identity.peerId)
                .then(() => setToastMessage('身份已复制到剪贴板'))
                .catch(err => console.error('复制身份失败：', err));
        }
    };

    const getDisplayMessages = (): Message[] => {
        if (!messages.length) return [];

        // 处理消息撤回
        const revokedMessageIds = new Set(
            messages.filter(msg => msg.type === 'tombstone').map(msg => msg.tombstoneFor!)
        );

        return messages
            .filter(msg => msg.type !== 'tombstone' || revokedMessageIds.has(msg.id)) // 过滤掉墓碑消息
            .map(msg => ({
                ...msg,
                isRevoked: revokedMessageIds.has(msg.id)
            }))
            .sort((a, b) => a.timestamp - b.timestamp); // 按时间排序;
    };

    const handleLeaveConversation = async () => {
        if (!sdk || !currentConversation) return;
        try {
            await sdk.leaveConversation(currentConversation.id);
            setCurrentConversation(null);
            setConversations(sdk.getAllConversations());
            setMessages([]);
            setError(null);
        } catch (err) {
            console.error('退出会话失败：', err);
            setError('退出会话失败');
        }
    };


    if (isInitializing) {
        return (
            <div className="app">
                <h1>迷你加密聊天</h1>
                <p>正在初始化 SDK...</p>
            </div>
        );
    }

    return <div className="app">
        {toastMessage && (
            <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
        )}
        <header className="app-header">
            <nav className="header-nav" aria-label="页面切换">
                <button
                    type="button"
                    className={`header-tab ${currentPage === 'chat' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('chat')}
                >
                    聊天
                </button>
                <button
                    type="button"
                    className={`header-tab ${currentPage === 'create' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('create')}
                >
                    创建 / 加入
                </button>
            </nav>
            <div className="header-identity">
                <span className="header-peer-id" title={identity?.peerId ?? ''}>
                    {identity?.peerId ? `${identity.peerId.slice(0, 12)}...` : '—'}
                </span>
                <button type="button" onClick={handleCopyIdentity} className="copy-button header-copy">
                    复制 peerId
                </button>
            </div>
        </header>

        {error && (
            <div className="error-message">
                {error}
            </div>
        )}

        {currentPage === 'create' && (
        <>
        <section className="create-conversation" aria-labelledby="create-conversation-heading">
            <h2 id="create-conversation-heading">创建会话</h2>
            <form onSubmit={handleCreateConversation} className="create-conversation-form">
                <div className="form-row conversation-type-row">
                    <span className="form-label">会话类型</span>
                    <div className="conversation-type-options" role="radiogroup" aria-label="会话类型">
                        <label className="conversation-type-option">
                            <input
                                type="radio"
                                name="conversationType"
                                value="direct"
                                checked={conversationType === 'direct'}
                                onChange={() => setConversationType('direct')}
                            />
                            <span>双人（单聊）</span>
                        </label>
                        <label className="conversation-type-option">
                            <input
                                type="radio"
                                name="conversationType"
                                value="group"
                                checked={conversationType === 'group'}
                                onChange={() => setConversationType('group')}
                            />
                            <span>群聊</span>
                        </label>
                    </div>
                </div>
                {conversationType === 'direct' && (
                    <>
                        <div className="form-row">
                            <label htmlFor="participant-id">对方 peerId</label>
                            <input
                                id="participant-id"
                                type="text"
                                placeholder="对方的 peerId"
                                value={participantId}
                                onChange={(e) => setParticipantId(e.target.value)}
                                className="participant-input"
                                autoComplete="off"
                            />
                        </div>
                        <div className="form-row">
                            <label htmlFor="conversation-name">会话名称（选填）</label>
                            <input
                                id="conversation-name"
                                type="text"
                                placeholder="例如：与张三的聊天"
                                value={conversationName}
                                onChange={(e) => setConversationName(e.target.value)}
                                className="conversation-name-input"
                                autoComplete="off"
                            />
                        </div>
                    </>
                )}
                {conversationType === 'group' && (
                    <div className="form-row">
                        <label htmlFor="conversation-name">群名称</label>
                        <input
                            id="conversation-name"
                            type="text"
                            placeholder="例如：项目组"
                            value={conversationName}
                            onChange={(e) => setConversationName(e.target.value)}
                            className="conversation-name-input"
                            autoComplete="off"
                        />
                    </div>
                )}
                <div className="form-actions">
                    <button type="submit" className="create-button">
                        {conversationType === 'direct' ? '创建双人会话' : '创建群聊'}
                    </button>
                </div>
            </form>
            {lastCreatedConversationId && lastCreatedConversationId.includes("-") && (
                <div className="created-conversation-id">
                    <label>群聊会话 ID（分享给他人输入以加入）</label>
                    <div className="conversation-id-row">
                        <code className="conversation-id-value">{lastCreatedConversationId}</code>
                        <button type="button" onClick={handleCopyConversationId} className="copy-button copy-id-button">
                            复制 ID
                        </button>
                    </div>
                </div>
            )}
        </section>

        <section className="join-group" aria-labelledby="join-group-heading">
            <h2 id="join-group-heading">加入群聊</h2>
            <p className="join-group-hint">输入他人分享的群聊会话 ID 即可加入，无需对方 peerId。</p>
            <form onSubmit={handleJoinGroup} className="join-group-form">
                <div className="form-row">
                    <label htmlFor="join-group-id">会话 ID</label>
                    <input
                        id="join-group-id"
                        type="text"
                        placeholder="粘贴群聊会话 ID（UUID 格式）"
                        value={joinGroupId}
                        onChange={(e) => setJoinGroupId(e.target.value)}
                        className="participant-input"
                        autoComplete="off"
                    />
                </div>
                <div className="form-row">
                    <label htmlFor="join-group-name">本地显示名称（选填）</label>
                    <input
                        id="join-group-name"
                        type="text"
                        placeholder="例如：项目组"
                        value={joinGroupName}
                        onChange={(e) => setJoinGroupName(e.target.value)}
                        className="conversation-name-input"
                        autoComplete="off"
                    />
                </div>
                <div className="form-actions">
                    <button type="submit" className="create-button">加入群聊</button>
                </div>
            </form>
        </section>
        </>
        )}

        {currentPage === 'chat' && (
        <div className="chat-container">
            <div className="conversations-list">
                <h2>会话列表</h2>
                {conversations.length === 0 ? (
                    <p>暂无会话，请在上方创建。</p>
                ) : (
                    <ul>
                        {conversations.map(conversation => (
                            <li
                                key={conversation.id}
                                onClick={() => setCurrentConversation(conversation)}
                                className={currentConversation?.id === conversation.id ? 'active' : ''}
                            >
                                <div className="conversation-name">
                                    {conversation.name || conversation.participants.filter(p => p !== identity?.peerId)[0]?.slice(0, 6)}...
                                </div>
                                <div className="conversation-participants">
                                    {conversation.participants.length} 位参与者
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="chat-area">
                {currentConversation ? (
                    <>
                        <div className="chat-header">
                            <div className="chat-header-main">
                                <h2>{currentConversation.name || `与 ${currentConversation.participants.filter(p => p !== identity?.peerId)[0]?.slice(0, 6)}... 的聊天`}</h2>
                                <button
                                    type="button"
                                    onClick={handleLeaveConversation}
                                    className="leave-conversation-button"
                                    title="退出当前会话"
                                >
                                    退出会话
                                </button>
                            </div>
                            <div className="conversation-id">
                                会话 ID：{currentConversation.id}
                            </div>
                        </div>

                        <div className="messages-list">
                            {getDisplayMessages().length === 0 ? (
                                <p>暂无消息，在下方发送一条。</p>
                            ) : (
                                getDisplayMessages().map(message => (
                                    message.type === 'user-leave' ? (
                                        <div key={message.id} className="message system">
                                            <span className="system-message-text">
                                                用户 {message.sender === identity?.peerId ? '我' : `${message.sender.slice(0, 6)}...`} 已退出会话
                                            </span>
                                            <span className="message-time">
                                                {new Date(message.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    ) : (
                                        <div
                                            key={message.id}
                                            className={`message ${message.sender === identity?.peerId ? 'own' : 'other'}`}
                                        >
                                            <div className="message-header">
                                                <span className="message-sender">
                                                    {message.sender === identity?.peerId ? '我' : message.sender.slice(0, 6)}...
                                                </span>
                                                <span className="message-time">
                                                    {new Date(message.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div className={`message-content ${message.isRevoked ? 'revoked' : ''}`}>
                                                {message.isRevoked ? '该消息已被撤回.' : message.content}
                                            </div>
                                            {message.sender === identity?.peerId && !message.isRevoked && (
                                                <div className="message-actions">
                                                    <button
                                                        onClick={() => handleRevokeMessage(message.id)}
                                                        className="message-action-button revoke-button"
                                                    >
                                                        撤回
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteMessage(message.id)}
                                                        className="message-action-button delete-button"
                                                    >
                                                        删除
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                ))
                            )}
                            <div ref={messagesEndRef}/>
                        </div>

                        <div className="message-input-area">
                            <input
                                type="text"
                                placeholder="输入消息..."
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                className="message-input"
                            />
                            <button onClick={handleSendMessage} className="send-button">
                                发送
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="no-conversation">
                        <p>请选择或创建一个会话。</p>
                    </div>
                )}
            </div>
        </div>
        )}
    </div>
}

export default App;