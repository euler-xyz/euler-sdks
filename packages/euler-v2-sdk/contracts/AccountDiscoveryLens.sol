// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.19;

/// @dev Minimal view surface of the Ethereum Vault Connector used for borrow
/// discovery. An account's enabled controllers are its borrow vaults.
interface IEVC {
    function getControllers(address account) external view returns (address[] memory);
}

/// @title AccountDiscoveryLens
/// @notice Deployless lens that brute-forces position discovery for a single
/// owner across a range of EVC sub-accounts and a fixed list of vaults, purely
/// over RPC — no subgraph.
///
/// It is never deployed. A caller performs an `eth_call` with **no `to`
/// address** and `data = creationCode ++ abi.encode(owner, subAccountIds,
/// vaults, evc)`. The EVM runs this constructor, which discovers positions and
/// returns the ABI-encoded result directly (the returned bytes take the place
/// of the contract's would-be runtime code). This is the well-known
/// "constructor returns data" deployless-lens pattern.
///
/// Discovery per sub-account:
///   - deposits: `vault.balanceOf(subAccount) > 0` for every vault in `vaults`
///     (the brute-force scan — a pure savings position leaves no other trace).
///   - borrows: `EVC.getControllers(subAccount)`, kept when `debtOf > 0`
///     (complete and cheap; independent of the vault list).
///
/// Return shape: `(address[][] deposits, address[][] borrows)`, where index `i`
/// aligns with `subAccountIds[i]`. Empty sub-accounts contribute empty inner
/// arrays, so the response stays compact.
///
/// The heavy `balanceOf` scan runs in inline assembly against a fixed scratch
/// region so memory never grows across the O(subAccounts * vaults) staticcalls
/// — this keeps per-call gas roughly linear in the number of probes and lets
/// the client size chunks predictably.
contract AccountDiscoveryLens {
    constructor(
        address owner,
        uint256[] memory subAccountIds,
        address[] memory vaults,
        address evc
    ) {
        uint256 m = subAccountIds.length;
        uint256 n = vaults.length;

        address[][] memory deposits = new address[][](m);
        address[][] memory borrows = new address[][](m);

        for (uint256 s = 0; s < m; ++s) {
            // EVC sub-account address: owner with its low byte XOR'd by the id.
            // Valid for ids in [0, 255]; the caller is responsible for the range.
            address account = address(uint160(owner) ^ uint160(subAccountIds[s]));

            // ---- deposits: brute-force balanceOf(account) on every vault ----
            address[] memory depHits = new address[](n);
            uint256 depCount = 0;
            for (uint256 v = 0; v < n; ++v) {
                address vault = vaults[v];
                uint256 bal;
                assembly {
                    // Reuse the free-memory region as flat scratch; never bump
                    // the free pointer, so memory stays constant across probes.
                    let p := mload(0x40)
                    // balanceOf(address) selector, left-aligned.
                    mstore(p, 0x70a0823100000000000000000000000000000000000000000000000000000000)
                    mstore(add(p, 0x04), account)
                    let ok := staticcall(gas(), vault, p, 0x24, p, 0x20)
                    if and(ok, gt(returndatasize(), 0x1f)) {
                        bal := mload(p)
                    }
                }
                if (bal != 0) {
                    depHits[depCount] = vault;
                    unchecked { ++depCount; }
                }
            }
            // Shrink the over-allocated buffer to the real hit count.
            assembly {
                mstore(depHits, depCount)
            }
            deposits[s] = depHits;

            // ---- borrows: EVC controllers with debtOf(account) > 0 ----
            address[] memory controllers;
            try IEVC(evc).getControllers(account) returns (address[] memory c) {
                controllers = c;
            } catch {
                controllers = new address[](0);
            }
            uint256 cn = controllers.length;
            address[] memory borHits = new address[](cn);
            uint256 borCount = 0;
            for (uint256 c = 0; c < cn; ++c) {
                address ctrl = controllers[c];
                uint256 debt;
                assembly {
                    let p := mload(0x40)
                    // debtOf(address) selector, left-aligned.
                    mstore(p, 0xd283e75f00000000000000000000000000000000000000000000000000000000)
                    mstore(add(p, 0x04), account)
                    let ok := staticcall(gas(), ctrl, p, 0x24, p, 0x20)
                    if and(ok, gt(returndatasize(), 0x1f)) {
                        debt := mload(p)
                    }
                }
                if (debt != 0) {
                    borHits[borCount] = ctrl;
                    unchecked { ++borCount; }
                }
            }
            assembly {
                mstore(borHits, borCount)
            }
            borrows[s] = borHits;
        }

        bytes memory out = abi.encode(deposits, borrows);
        assembly {
            return(add(out, 0x20), mload(out))
        }
    }
}
