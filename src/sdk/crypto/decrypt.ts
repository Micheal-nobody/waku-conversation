import type {DecodedMessage} from "@waku/sdk";
import type {Message} from "../types.ts";
import {keccak256, toUtf8Bytes} from "ethers";

export function decryptMessage(wakuMessage: DecodedMessage, encryptionKey: string):Message {

    const message = decryptPayload(wakuMessage.payload, encryptionKey,);

    // 验证消息签名，确保消息完整性
    if (!verifySignature(message)) {
        throw new Error("消息签名无效");
    }

    // 验证消息认证码，确保消息完整性和防篡改
    if (!verifyMAC(message, encryptionKey)) {
        throw new Error("消息 MAC 无效");
    }

    return message;
}

/**
 * 使用会话密钥对密文进行解密。
 * 与实际加密方案对应，实际项目中建议使用 AES-256-GCM 等更安全的方案。
 */
export function decryptPayload(encryptedPayload: Uint8Array, key: string): Message {
    const textDecoder = new TextDecoder();
    const encoder = new TextEncoder();

    const plaintextBytes = new Uint8Array(encryptedPayload.length);

    const derivedKey = keccak256(toUtf8Bytes(key));
    const derivedKeyBytes = encoder.encode(derivedKey.slice(0, 32));

    for (let i = 0; i < encryptedPayload.length; i++) {
        plaintextBytes[i] =
            encryptedPayload[i] ^ derivedKeyBytes[i % derivedKeyBytes.length];
    }

    const decryptedPayload = textDecoder.decode(plaintextBytes);
    return JSON.parse(decryptedPayload);
}

// 验证消息签名，确保消息未被篡改（与 signMessage 一致：只对“业务字段”做 hash，排除 signature/mac）
function verifySignature(message: Message): boolean {
    if (!message.signature) {
        return false;
    }
    const messageData = JSON.stringify({
        ...message,
        signature: undefined,
        mac: undefined,
    });
    const hash = keccak256(toUtf8Bytes(messageData));
    // 注意：实际项目中应该使用更安全的签名验证方案
    return message.signature === hash;
}

// 验证消息的MAC，确保消息完整性
function verifyMAC(message: any, key: string): boolean {
    if (!message.mac) {
        return false;
    }
    const messageData = JSON.stringify({
        ...message,
        signature: undefined,
        mac: undefined,
    });
    const expectedMAC = keccak256(toUtf8Bytes(`${messageData}_${key}`));
    return message.mac === expectedMAC;
}

