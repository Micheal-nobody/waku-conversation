import type {UserIdentity} from "../types.ts";
import {ethers} from "ethers";

export function saveIdentity(identity: UserIdentity): void {
    try {
        localStorage.setItem('waku-chat-identity', JSON.stringify(identity));
        console.log('身份已保存到本地存储');
    } catch (error) {
        console.error('保存身份到本地存储失败：', error);
    }
}

export function loadIdentity(): UserIdentity | null {
    try {
        const storedIdentity = localStorage.getItem('waku-chat-identity');
        if (storedIdentity) {
            const identity = JSON.parse(storedIdentity) as UserIdentity;
            console.log('已从本地存储加载身份');
            return identity;
        }
    } catch (error) {
        console.error('从本地存储加载身份失败：', error);
    }
    return null;
}

export function resetIdentity(): void {
    try {
        localStorage.removeItem('waku-chat-identity');
        console.log('身份已重置');
    } catch (error) {
        console.error('重置身份失败：', error);
    }
}

export function generateIdentity(): UserIdentity {
    console.log('正在生成身份...');
    const wallet = ethers.Wallet.createRandom();
    return {
        peerId: wallet.address,
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey,
    };
}

