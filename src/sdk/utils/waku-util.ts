import {
    createDecoder,
    createEncoder,
    type Decoder,
    type Encoder,
    type LightNode,
    Protocols,
    waitForRemotePeer
} from "@waku/sdk";
import type {ChatOptions} from "../types.ts";

// 尝试连接到本地节点
export async function connectToLocalNode(node: LightNode, nodeAddress: string): Promise<void> {
    await node.dial(nodeAddress);
}

// 尝试连接到远程节点，等待节点支持所需的协议
export async function connectToRemoteNodes(node: LightNode, options: ChatOptions): Promise<void> {
    await waitForRemotePeer(
        node,
        [
            Protocols.LightPush,
            Protocols.Filter,
            options.storeMessages ? Protocols.Store : undefined,
        ].filter(Boolean) as Protocols[],
        10000 // 10秒超时
    )
}

// 根据会话ID生成content topic的方法，确保每个会话使用不同的topic，并移除可能导致格式问题的特殊字符
export function genContentTopic(conversationId: string): string {
    const safeConversationId = conversationId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `/waku/chat/${safeConversationId}/proto`;
}

export function genDecoder(conversationId: string): Decoder {
    return createDecoder(
        genContentTopic(conversationId),
        "/waku/2/default-waku/proto",
    );
}

export function genEncoder(conversationId: string): Encoder {
    return createEncoder({
        contentTopic: genContentTopic(conversationId),
        pubsubTopic: "/waku/2/default-waku/proto",
    });
}