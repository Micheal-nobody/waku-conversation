import type {UserIdentity} from "../types.ts";

export class Asserts {
    public static isIdentify(identity: UserIdentity | null): asserts identity is UserIdentity {
        if (!identity) {
            throw new Error("SDK 未初始化");
        }
    }

    public static isExist(value: unknown, message: string = "对象为 null/undefined！"): asserts value is NonNullable<unknown>  {
        if (value === null || value === undefined) {
            throw new Error(message);
        }
    }
}