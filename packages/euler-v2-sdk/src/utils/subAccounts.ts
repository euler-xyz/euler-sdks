import { Address, pad, toHex } from "viem";

const SUB_ACCOUNT_MAX_ID = 255;

export function getSubAccountId(primary: Address, subAccount: Address) {
  const xor = Number(BigInt(primary) ^ BigInt(subAccount));
  if (xor > SUB_ACCOUNT_MAX_ID) {
    throw new Error("Addresses are not related");
  }
  return xor
}

export function getSubAccount(primary: Address, subAccountId: number) {
  if (subAccountId > SUB_ACCOUNT_MAX_ID) {
    throw new Error("Sub account ID too large");
  }
  return pad(toHex(BigInt(primary) ^ BigInt(subAccountId)), {
    size: 20,
  });
}

export function isSubAccount(primary: Address, subAccount: Address) {
  return Number(BigInt(primary) ^ BigInt(subAccount)) < SUB_ACCOUNT_MAX_ID
}