import {
	type Address,
	encodeFunctionData,
	getAddress,
	type Hex,
	maxUint48,
	maxUint160,
	maxUint256,
	zeroAddress,
} from "viem";
import { ethereumVaultConnectorAbi } from "./abis/ethereumVaultConnectorAbi.js";
import { eVaultAbi } from "./abis/eVaultAbi.js";
import { permit2PermitAbi } from "./abis/permit2PermitAbi.js";
import { swapVerifierAbi } from "./abis/swapVerifierAbi.js";
import {
	type EVCBatchItem,
	type EncodeBorrowArgs,
	type EncodeDepositArgs,
	type EncodeDepositWithSwapFromWalletArgs,
	type EncodeLiquidationArgs,
	type EncodeMigrateSameAssetCollateralArgs,
	type EncodeMigrateSameAssetDebtArgs,
	type EncodeMintArgs,
	type EncodeMultiplySameAssetArgs,
	type EncodeMultiplyWithSwapArgs,
	type EncodePermit2CallArgs,
	type EncodePullDebtArgs,
	type EncodeRedeemArgs,
	type EncodeRepayFromDepositArgs,
	type EncodeRepayFromWalletArgs,
	type EncodeRepayWithSwapArgs,
	type EncodeSwapCollateralArgs,
	type EncodeSwapDebtArgs,
	type EncodeSwapFromWalletArgs,
	type EncodeTransferArgs,
	type EncodeWithdrawArgs,
	type GetPermit2TypedDataArgs,
	PERMIT2_TYPES,
	type PermitSingleMessage,
	type PermitSingleTypedData,
} from "./executionServiceTypes.js";

const PERMIT2_SIG_WINDOW = 60n * 60n;
const INTEREST_CUSHION_NUMERATOR = 10_001n;
const INTEREST_CUSHION_DENOMINATOR = 10_000n;

export function encodeBatch(items: EVCBatchItem[]): Hex {
	return encodeFunctionData({
		abi: ethereumVaultConnectorAbi,
		functionName: "batch",
		args: [items],
	});
}

export function encodePermit2Call(
	permit2: Address,
	{ owner, message, signature }: EncodePermit2CallArgs,
): EVCBatchItem {
	return {
		targetContract: permit2,
		onBehalfOfAccount: owner,
		value: 0n,
		data: encodeFunctionData({
			abi: permit2PermitAbi,
			functionName: "permit",
			args: [owner, message, signature],
		}),
	};
}

export function encodeEnableCollateral(
	evc: Address,
	account: Address,
	vault: Address,
): EVCBatchItem {
	return {
		targetContract: evc,
		onBehalfOfAccount: zeroAddress,
		value: 0n,
		data: encodeFunctionData({
			abi: ethereumVaultConnectorAbi,
			functionName: "enableCollateral",
			args: [account, vault],
		}),
	};
}

export function encodeDisableCollateral(
	evc: Address,
	account: Address,
	vault: Address,
): EVCBatchItem {
	return {
		targetContract: evc,
		onBehalfOfAccount: zeroAddress,
		value: 0n,
		data: encodeFunctionData({
			abi: ethereumVaultConnectorAbi,
			functionName: "disableCollateral",
			args: [account, vault],
		}),
	};
}

export function encodeEnableController(
	evc: Address,
	account: Address,
	vault: Address,
): EVCBatchItem {
	return {
		targetContract: evc,
		onBehalfOfAccount: zeroAddress,
		value: 0n,
		data: encodeFunctionData({
			abi: ethereumVaultConnectorAbi,
			functionName: "enableController",
			args: [account, vault],
		}),
	};
}

export function encodeDisableController(
	vault: Address,
	account: Address,
): EVCBatchItem {
	return {
		targetContract: vault,
		onBehalfOfAccount: account,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "disableController",
			args: [],
		}),
	};
}

export function encodeTransferFromMax(
	vault: Address,
	from: Address,
	to: Address,
): EVCBatchItem {
	return {
		targetContract: vault,
		onBehalfOfAccount: from,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "transferFromMax",
			args: [from, to],
		}),
	};
}

export function getPermit2TypedData(
	permit2: Address,
	args: GetPermit2TypedDataArgs,
): PermitSingleTypedData {
	const nowInSeconds = () => BigInt(Math.floor(Date.now() / 1000));
	const { chainId, token, amount, spender, nonce, sigDeadline, expiration } =
		args;

	const permitSingle = {
		details: {
			token,
			amount: amount > maxUint160 ? maxUint160 : amount,
			expiration: expiration ?? Number(maxUint48),
			nonce,
		},
		spender,
		sigDeadline: sigDeadline ?? nowInSeconds() + PERMIT2_SIG_WINDOW,
	};

	return {
		domain: {
			name: "Permit2",
			chainId,
			verifyingContract: permit2,
		},
		types: PERMIT2_TYPES,
		primaryType: "PermitSingle",
		message: permitSingle as PermitSingleMessage,
	};
}

export function encodeDeposit(
	evc: Address,
	permit2: Address,
	{
		chainId,
		vault,
		amount,
		receiver,
		owner,
		enableCollateral,
		permit2: permit2Data,
	}: EncodeDepositArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (permit2Data) {
		items.push(
			encodePermit2Call(permit2, {
				chainId,
				owner,
				message: permit2Data.message,
				signature: permit2Data.signature,
			}),
		);
	}

	if (enableCollateral) {
		items.push(encodeEnableCollateral(evc, receiver, vault));
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: owner,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "deposit",
			args: [amount, receiver],
		}),
	});

	return items;
}

export function encodeMint(
	evc: Address,
	permit2: Address,
	{
		chainId,
		vault,
		shares,
		receiver,
		owner,
		enableCollateral,
		permit2: permit2Data,
	}: EncodeMintArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (permit2Data) {
		items.push(
			encodePermit2Call(permit2, {
				chainId,
				owner,
				message: permit2Data.message,
				signature: permit2Data.signature,
			}),
		);
	}

	if (enableCollateral) {
		items.push(encodeEnableCollateral(evc, receiver, vault));
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: owner,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "mint",
			args: [shares, receiver],
		}),
	});

	return items;
}

export function encodeWithdraw(
	evc: Address,
	{ vault, assets, receiver, owner, disableCollateral }: EncodeWithdrawArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (disableCollateral) {
		items.push(encodeDisableCollateral(evc, owner, vault));
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: owner,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "withdraw",
			args: [assets, receiver, owner],
		}),
	});

	return items;
}

export function encodeRedeem(
	evc: Address,
	{ vault, shares, receiver, owner, disableCollateral }: EncodeRedeemArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (disableCollateral) {
		items.push(encodeDisableCollateral(evc, owner, vault));
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: owner,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "redeem",
			args: [shares, receiver, owner],
		}),
	});

	return items;
}

export function encodeBorrow(
	evc: Address,
	permit2: Address,
	args: EncodeBorrowArgs,
): EVCBatchItem[] {
	const {
		vault,
		amount,
		owner,
		borrowAccount,
		receiver,
		enableController = true,
		currentController,
		collateralVault,
		collateralAmount,
		enableCollateral = true,
		collateralPermit2,
	} = args;
	const items: EVCBatchItem[] = [];

	if (
		collateralVault &&
		collateralAmount !== undefined &&
		collateralAmount > 0n
	) {
		items.push(
			...encodeDeposit(evc, permit2, {
				...args,
				vault: collateralVault,
				amount: collateralAmount,
				receiver: borrowAccount,
				owner,
				enableCollateral,
				permit2: collateralPermit2,
			}),
		);
	}

	if (currentController && currentController !== vault) {
		items.push(encodeDisableController(currentController, borrowAccount));
	}

	if (enableController) {
		items.push(encodeEnableController(evc, borrowAccount, vault));
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: borrowAccount,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "borrow",
			args: [amount, receiver],
		}),
	});

	return items;
}

export function encodeLiquidation(
	evc: Address,
	{
		vault,
		violator,
		collateral,
		repayAssets,
		minYieldBalance,
		liquidatorSubAccountAddress,
		enableCollateral = true,
		enableController = true,
	}: EncodeLiquidationArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (enableController) {
		items.push(
			encodeEnableController(evc, liquidatorSubAccountAddress, vault),
		);
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: liquidatorSubAccountAddress,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "liquidate",
			args: [violator, collateral, repayAssets, minYieldBalance],
		}),
	});

	if (enableCollateral) {
		items.push(
			encodeEnableCollateral(evc, liquidatorSubAccountAddress, collateral),
		);
	}

	return items;
}

export function encodePullDebt(
	evc: Address,
	{ vault, amount, from, to, enableController = true }: EncodePullDebtArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (enableController) {
		items.push(encodeEnableController(evc, to, vault));
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: to,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "pullDebt",
			args: [amount, from],
		}),
	});

	return items;
}

export function encodeMultiplyWithSwap(
	evc: Address,
	permit2: Address,
	{
		chainId,
		collateralVault,
		collateralAmount,
		liabilityVault,
		liabilityAmount,
		longVault,
		owner,
		receiver,
		enableCollateral = true,
		enableCollateralLong = true,
		currentController,
		enableController = true,
		collateralPermit2,
		swapQuote,
	}: EncodeMultiplyWithSwapArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (collateralPermit2) {
		items.push(
			encodePermit2Call(permit2, {
				chainId,
				owner,
				message: collateralPermit2.message,
				signature: collateralPermit2.signature,
			}),
		);
	}

	if (collateralAmount > 0n) {
		if (enableCollateral) {
			items.push(encodeEnableCollateral(evc, receiver, collateralVault));
		}
		items.push({
			targetContract: collateralVault,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "deposit",
				args: [collateralAmount, receiver],
			}),
		});
	}

	if (currentController && currentController !== liabilityVault) {
		items.push(encodeDisableController(currentController, receiver));
	}

	if (enableController) {
		items.push(encodeEnableController(evc, receiver, liabilityVault));
	}

	items.push({
		targetContract: liabilityVault,
		onBehalfOfAccount: receiver,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "borrow",
			args: [liabilityAmount, swapQuote.swap.swapperAddress],
		}),
	});

	items.push({
		targetContract: swapQuote.swap.swapperAddress,
		onBehalfOfAccount: receiver,
		value: 0n,
		data: swapQuote.swap.swapperData,
	});

	if (swapQuote.verify.type !== "skimMin") {
		throw new Error("Invalid swap quote type for multiply - must be skimMin");
	}

	items.push({
		targetContract: swapQuote.verify.verifierAddress,
		onBehalfOfAccount: receiver,
		value: 0n,
		data: swapQuote.verify.verifierData,
	});

	if (enableCollateralLong && collateralVault !== longVault) {
		items.push(encodeEnableCollateral(evc, receiver, longVault));
	}

	return items;
}

export function encodeMultiplySameAsset(
	evc: Address,
	permit2: Address,
	{
		chainId,
		collateralVault,
		collateralAmount,
		liabilityVault,
		liabilityAmount,
		longVault,
		owner,
		receiver,
		enableCollateral = true,
		enableCollateralLong = true,
		enableController = true,
		currentController,
		collateralPermit2,
	}: EncodeMultiplySameAssetArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (collateralPermit2) {
		items.push(
			encodePermit2Call(permit2, {
				chainId,
				owner,
				message: collateralPermit2.message,
				signature: collateralPermit2.signature,
			}),
		);
	}

	if (collateralAmount > 0n) {
		if (enableCollateral) {
			items.push(encodeEnableCollateral(evc, receiver, collateralVault));
		}
		items.push({
			targetContract: collateralVault,
			onBehalfOfAccount: owner,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "deposit",
				args: [collateralAmount, receiver],
			}),
		});
	}

	if (currentController && currentController !== liabilityVault) {
		items.push(encodeDisableController(currentController, receiver));
	}

	if (enableController) {
		items.push(encodeEnableController(evc, receiver, liabilityVault));
	}

	items.push({
		targetContract: liabilityVault,
		onBehalfOfAccount: receiver,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "borrow",
			args: [liabilityAmount, longVault],
		}),
	});

	items.push({
		targetContract: longVault,
		onBehalfOfAccount: receiver,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "skim",
			args: [liabilityAmount, receiver],
		}),
	});

	if (enableCollateralLong) {
		items.push(encodeEnableCollateral(evc, receiver, longVault));
	}

	return items;
}

export function encodeRepayFromWallet(
	permit2: Address,
	{
		chainId,
		sender,
		liabilityVault,
		liabilityAmount,
		receiver,
		disableControllerOnMax = true,
		isMax = false,
		permit2: permit2Data,
	}: EncodeRepayFromWalletArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (permit2Data) {
		items.push(
			encodePermit2Call(permit2, {
				chainId,
				owner: sender,
				message: permit2Data.message,
				signature: permit2Data.signature,
			}),
		);
	}

	items.push({
		targetContract: liabilityVault,
		onBehalfOfAccount: sender,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "repay",
			args: [isMax ? maxUint256 : liabilityAmount, receiver],
		}),
	});

	if (disableControllerOnMax && isMax) {
		items.push(encodeDisableController(liabilityVault, receiver));
	}

	return items;
}

function encodeRepayWithSharesSameAssetAndVault(
	vault: Address,
	amount: bigint,
	from: Address,
	receiver: Address,
	disableController: boolean,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [
		{
			targetContract: vault,
			onBehalfOfAccount: from,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "repayWithShares",
				args: [amount, receiver],
			}),
		},
	];

	if (disableController) {
		items.push(encodeDisableController(vault, receiver));
	}

	return items;
}

function encodeRepayWithSharesSameAssetDifferentVault(
	fromVault: Address,
	toVault: Address,
	amount: bigint,
	receiver: Address,
	from: Address,
	isMax: boolean,
	disableControllerOnMax: boolean,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (isMax) {
		if (amount === maxUint256) {
			throw new Error("Amount is maxUint256, cannot be used for max repay");
		}
		const amountWithExtra =
			(amount * INTEREST_CUSHION_NUMERATOR) / INTEREST_CUSHION_DENOMINATOR;

		if (amountWithExtra >= maxUint256) {
			throw new Error("Amount with extra exceeds maxUint256");
		}

		items.push({
			targetContract: fromVault,
			onBehalfOfAccount: from,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "withdraw",
				args: [amountWithExtra, toVault, from],
			}),
		});
		items.push({
			targetContract: toVault,
			onBehalfOfAccount: receiver,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "skim",
				args: [amountWithExtra, receiver],
			}),
		});
		items.push({
			targetContract: toVault,
			onBehalfOfAccount: receiver,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "repayWithShares",
				args: [maxUint256, receiver],
			}),
		});
		if (disableControllerOnMax) {
			items.push(encodeDisableController(toVault, receiver));
		}
		return items;
	}

	items.push({
		targetContract: fromVault,
		onBehalfOfAccount: from,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "withdraw",
			args: [amount, toVault, from],
		}),
	});
	items.push({
		targetContract: toVault,
		onBehalfOfAccount: receiver,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "skim",
			args: [amount, receiver],
		}),
	});
	items.push({
		targetContract: toVault,
		onBehalfOfAccount: receiver,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "repayWithShares",
			args: [amount > 0n ? amount - 1n : 0n, receiver],
		}),
	});

	return items;
}

export function encodeRepayFromDeposit(
	{
		liabilityVault,
		liabilityAsset,
		liabilityAmount,
		from,
		receiver,
		fromVault,
		fromAsset,
		disableControllerOnMax = true,
		isMax = false,
	}: EncodeRepayFromDepositArgs,
): EVCBatchItem[] {
	if (fromAsset === liabilityAsset && fromVault === liabilityVault) {
		return encodeRepayWithSharesSameAssetAndVault(
			liabilityVault,
			liabilityAmount,
			from,
			receiver,
			isMax && disableControllerOnMax,
		);
	}

	if (fromAsset === liabilityAsset) {
		return encodeRepayWithSharesSameAssetDifferentVault(
			fromVault,
			liabilityVault,
			liabilityAmount,
			receiver,
			from,
			isMax,
			disableControllerOnMax,
		);
	}

	throw new Error("encodeRepayFromDeposit only supports same-asset paths");
}

export function encodeRepayWithSwap({
	swapQuote,
	maxWithdraw,
	isMax = false,
	disableControllerOnMax = true,
}: EncodeRepayWithSwapArgs): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];
	const withdrawAmount =
		maxWithdraw && maxWithdraw < BigInt(swapQuote.amountInMax || swapQuote.amountIn)
			? maxWithdraw
			: BigInt(swapQuote.amountInMax || swapQuote.amountIn);

	items.push({
		targetContract: swapQuote.vaultIn,
		onBehalfOfAccount: swapQuote.accountIn,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "withdraw",
			args: [withdrawAmount, swapQuote.swap.swapperAddress, swapQuote.accountIn],
		}),
	});
	items.push({
		targetContract: swapQuote.swap.swapperAddress,
		onBehalfOfAccount: swapQuote.accountIn,
		value: 0n,
		data: swapQuote.swap.swapperData,
	});

	if (swapQuote.verify.type !== "debtMax") {
		throw new Error("Invalid swap quote type for repay - must be debtMax");
	}

	items.push({
		targetContract: swapQuote.verify.verifierAddress,
		onBehalfOfAccount: swapQuote.verify.account,
		value: 0n,
		data: swapQuote.verify.verifierData,
	});

	if (isMax && disableControllerOnMax) {
		items.push(encodeDisableController(swapQuote.receiver, swapQuote.accountOut));
	}

	return items;
}

export function encodeDepositWithSwapFromWallet(
	evc: Address,
	{ swapQuote, amount, sender, enableCollateral = true }: EncodeDepositWithSwapFromWalletArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [
		{
			targetContract: swapQuote.verify.verifierAddress,
			onBehalfOfAccount: sender,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "transferFromSender",
				args: [swapQuote.tokenIn.address, amount, swapQuote.swap.swapperAddress],
			}),
		},
		{
			targetContract: swapQuote.swap.swapperAddress,
			onBehalfOfAccount: sender,
			value: 0n,
			data: swapQuote.swap.swapperData,
		},
		{
			targetContract: swapQuote.verify.verifierAddress,
			onBehalfOfAccount: swapQuote.accountOut || sender,
			value: 0n,
			data: swapQuote.verify.verifierData,
		},
	];

	if (enableCollateral && swapQuote.receiver) {
		items.push(
			encodeEnableCollateral(evc, swapQuote.accountOut || sender, swapQuote.receiver),
		);
	}

	return items;
}

export function encodeSwapFromWallet({
	swapQuote,
	amount,
	sender,
}: EncodeSwapFromWalletArgs): EVCBatchItem[] {
	if (swapQuote.verify.type !== "transferMin") {
		throw new Error(
			"Invalid swap quote type for wallet swap - must be transferMin",
		);
	}

	return [
		{
			targetContract: swapQuote.verify.verifierAddress,
			onBehalfOfAccount: sender,
			value: 0n,
			data: encodeFunctionData({
				abi: swapVerifierAbi,
				functionName: "transferFromSender",
				args: [swapQuote.tokenIn.address, amount, swapQuote.swap.swapperAddress],
			}),
		},
		{
			targetContract: swapQuote.swap.swapperAddress,
			onBehalfOfAccount: sender,
			value: 0n,
			data: swapQuote.swap.swapperData,
		},
		{
			targetContract: swapQuote.verify.verifierAddress,
			onBehalfOfAccount: sender,
			value: 0n,
			data: swapQuote.verify.verifierData,
		},
	];
}

export function encodeSwapCollateral(
	evc: Address,
	{
		swapQuote,
		enableCollateral = true,
		disableCollateralOnMax = true,
		isMax = false,
	}: EncodeSwapCollateralArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];
	const withdrawAmount = BigInt(swapQuote.amountInMax || swapQuote.amountIn);

	items.push({
		targetContract: swapQuote.vaultIn,
		onBehalfOfAccount: swapQuote.accountIn,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "withdraw",
			args: [withdrawAmount, swapQuote.swap.swapperAddress, swapQuote.accountIn],
		}),
	});
	items.push({
		targetContract: swapQuote.swap.swapperAddress,
		onBehalfOfAccount: swapQuote.accountIn,
		value: 0n,
		data: swapQuote.swap.swapperData,
	});

	if (swapQuote.verify.type !== "skimMin") {
		throw new Error(
			"Invalid swap quote type for swap collateral - must be skimMin",
		);
	}

	items.push({
		targetContract: swapQuote.verify.verifierAddress,
		onBehalfOfAccount: swapQuote.accountOut,
		value: 0n,
		data: swapQuote.verify.verifierData,
	});

	if (isMax && disableCollateralOnMax) {
		items.push(encodeDisableCollateral(evc, swapQuote.accountIn, swapQuote.vaultIn));
	}
	if (enableCollateral) {
		items.push(encodeEnableCollateral(evc, swapQuote.accountOut, swapQuote.receiver));
	}

	return items;
}

export function encodeSwapDebt(
	evc: Address,
	{
		swapQuote,
		enableController = true,
		disableControllerOnMax = true,
		isMax = false,
	}: EncodeSwapDebtArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (enableController) {
		items.push(encodeEnableController(evc, swapQuote.accountOut, swapQuote.vaultIn));
	}

	items.push({
		targetContract: swapQuote.vaultIn,
		onBehalfOfAccount: swapQuote.accountIn,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "borrow",
			args: [BigInt(swapQuote.amountInMax), swapQuote.swap.swapperAddress],
		}),
	});
	items.push({
		targetContract: swapQuote.swap.swapperAddress,
		onBehalfOfAccount: swapQuote.accountIn,
		value: 0n,
		data: swapQuote.swap.swapperData,
	});

	if (swapQuote.verify.type !== "debtMax") {
		throw new Error("Invalid swap quote type for repay - must be debtMax");
	}

	items.push({
		targetContract: swapQuote.verify.verifierAddress,
		onBehalfOfAccount: swapQuote.accountOut,
		value: 0n,
		data: swapQuote.verify.verifierData,
	});

	if (isMax && disableControllerOnMax) {
		items.push(encodeDisableController(swapQuote.receiver, swapQuote.accountIn));
	}

	return items;
}

export function encodeMigrateSameAssetCollateral(
	evc: Address,
	{
		fromVault,
		toVault,
		amount,
		account,
		isMax = false,
		maxShares,
		enableCollateralTo = false,
		disableCollateralFrom = false,
	}: EncodeMigrateSameAssetCollateralArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [
		{
			targetContract: fromVault,
			onBehalfOfAccount: account,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: isMax ? "redeem" : "withdraw",
				args: isMax ? [maxShares ?? maxUint256, toVault, account] : [amount, toVault, account],
			}),
		},
		{
			targetContract: toVault,
			onBehalfOfAccount: account,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "skim",
				args: [amount, account],
			}),
		},
	];

	if (enableCollateralTo) {
		items.push(encodeEnableCollateral(evc, account, toVault));
	}
	if (disableCollateralFrom) {
		items.push(encodeDisableCollateral(evc, account, fromVault));
	}

	return items;
}

export function encodeMigrateSameAssetDebt(
	evc: Address,
	{
		oldLiabilityVault,
		newLiabilityVault,
		amount,
		account,
		enableController = true,
		disableController = true,
		sweepExcess = true,
		transferRemainingSharesTo,
	}: EncodeMigrateSameAssetDebtArgs,
): EVCBatchItem[] {
	if (amount === maxUint256) {
		throw new Error("Amount is maxUint256, cannot size debt migration");
	}

	const amountWithExtra =
		(amount * INTEREST_CUSHION_NUMERATOR) / INTEREST_CUSHION_DENOMINATOR;

	if (amountWithExtra >= maxUint256) {
		throw new Error("Amount with extra exceeds maxUint256");
	}

	const items: EVCBatchItem[] = [];

	if (enableController) {
		items.push(encodeEnableController(evc, account, newLiabilityVault));
	}

	items.push({
		targetContract: newLiabilityVault,
		onBehalfOfAccount: account,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "borrow",
			args: [amountWithExtra, oldLiabilityVault],
		}),
	});
	items.push({
		targetContract: oldLiabilityVault,
		onBehalfOfAccount: account,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "skim",
			args: [amountWithExtra, account],
		}),
	});
	items.push({
		targetContract: oldLiabilityVault,
		onBehalfOfAccount: account,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "repayWithShares",
			args: [maxUint256, account],
		}),
	});

	if (disableController) {
		items.push(encodeDisableController(oldLiabilityVault, account));
	}

	if (sweepExcess) {
		items.push({
			targetContract: oldLiabilityVault,
			onBehalfOfAccount: account,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "redeem",
				args: [maxUint256, newLiabilityVault, account],
			}),
		});
		items.push({
			targetContract: newLiabilityVault,
			onBehalfOfAccount: account,
			value: 0n,
			data: encodeFunctionData({
				abi: eVaultAbi,
				functionName: "skim",
				args: [maxUint256, account],
			}),
		});
	}

	if (
		transferRemainingSharesTo &&
		getAddress(transferRemainingSharesTo) !== getAddress(account)
	) {
		items.push(encodeTransferFromMax(newLiabilityVault, account, transferRemainingSharesTo));
	}

	return items;
}

export function encodeTransfer(
	evc: Address,
	{ vault, to, amount, from, enableCollateralTo, disableCollateralFrom }: EncodeTransferArgs,
): EVCBatchItem[] {
	const items: EVCBatchItem[] = [];

	if (disableCollateralFrom) {
		items.push(encodeDisableCollateral(evc, from, vault));
	}

	items.push({
		targetContract: vault,
		onBehalfOfAccount: from,
		value: 0n,
		data: encodeFunctionData({
			abi: eVaultAbi,
			functionName: "transfer",
			args: [to, amount],
		}),
	});

	if (enableCollateralTo) {
		items.push(encodeEnableCollateral(evc, to, vault));
	}

	return items;
}
