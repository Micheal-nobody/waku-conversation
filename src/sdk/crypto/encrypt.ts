import type {Message} from "../types.ts";
import {keccak256, toUtf8Bytes} from "ethers";

export function encrypt(message: Message, encryptionKey: string): Message {
    const signature = signMessage(message);
    const mac = generateMAC(message, encryptionKey);
    // 将 signature、mac 一并加密，接收方解密后可验证
    const messageWithAuth: Message = {...message, signature, mac};

    const ciphertext = encryptPayload(messageWithAuth, encryptionKey);

    return {
        ...messageWithAuth,
        payload: ciphertext,
    };
}

/**
 * 使用会话密钥对明文进行加密（XOR + keccak256 派生密钥）。
 * 实际项目中建议使用 AES-256-GCM 等更安全的方案。
 */
function encryptPayload(message: Message, key: string): Uint8Array {
    const textEncoder = new TextEncoder();
    const encoder = new TextEncoder();

    const plaintextBytes = textEncoder.encode(JSON.stringify(message));
    const ciphertextBytes = new Uint8Array(plaintextBytes.length);

    const derivedKey = keccak256(toUtf8Bytes(key));
    const derivedKeyBytes = encoder.encode(derivedKey.slice(0, 32));

    for (let i = 0; i < plaintextBytes.length; i++) {
        ciphertextBytes[i] =
            plaintextBytes[i] ^ derivedKeyBytes[i % derivedKeyBytes.length];
    }

    return ciphertextBytes;
}

// 对消息进行签名，验证发送方身份，防止冒充
function signMessage(message: Message): string {
    const messageData = JSON.stringify({...message, signature: undefined});
    // 注意：实际项目中应该使用更安全的签名方案
    return keccak256(toUtf8Bytes(messageData));
}

// 生成消息的MAC（消息认证码），用于确保消息完整性，防止消息被篡改
function generateMAC(message: Message, key: string): string {
    const messageData = JSON.stringify({
        ...message,
        signature: undefined,
        mac: undefined,
    });
    return keccak256(toUtf8Bytes(`${messageData}_${key}`));
}

