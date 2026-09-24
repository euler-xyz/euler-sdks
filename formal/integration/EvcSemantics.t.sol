// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Copy to test/integration/EvcSemantics.t.sol in the pinned upstream EVC checkout.
import {Test} from "forge-std/Test.sol";
import {EthereumVaultConnector} from "../../src/EthereumVaultConnector.sol";
import {IEVC} from "../../src/interfaces/IEthereumVaultConnector.sol";

contract CollateralRequiredController {
    EthereumVaultConnector immutable evc;
    address immutable collateral;

    constructor(EthereumVaultConnector evc_, address collateral_) {
        evc = evc_;
        collateral = collateral_;
    }

    function checkAccountStatus(address account, address[] calldata) external view returns (bytes4) {
        require(evc.isCollateralEnabled(account, collateral), "collateral disabled");
        return this.checkAccountStatus.selector;
    }
}

contract ReadEnrichmentTarget {
    function update() external pure {
        revert("update failed");
    }

    function read() external pure returns (uint256) {
        return 42;
    }
}

contract SdkEvcSemanticsTest is Test {
    EthereumVaultConnector evc;
    address constant COLLATERAL = address(0xCAFE);

    function setUp() public {
        evc = new EthereumVaultConnector();
    }

    function transition(bool enabled) internal view returns (IEVC.BatchItem memory) {
        return IEVC.BatchItem({
            targetContract: address(evc), onBehalfOfAccount: address(0), value: 0,
            data: enabled
                ? abi.encodeCall(evc.enableCollateral, (address(this), COLLATERAL))
                : abi.encodeCall(evc.disableCollateral, (address(this), COLLATERAL))
        });
    }

    function testHistoricalCancellationChangesActualEvcState() public {
        evc.enableCollateral(address(this), COLLATERAL);
        IEVC.BatchItem[] memory original = new IEVC.BatchItem[](2);
        original[0] = transition(true);
        original[1] = transition(false);
        evc.batch(original);
        assertFalse(evc.isCollateralEnabled(address(this), COLLATERAL));

        evc.enableCollateral(address(this), COLLATERAL);
        evc.batch(new IEVC.BatchItem[](0));
        assertTrue(evc.isCollateralEnabled(address(this), COLLATERAL));
    }

    function testSeparateAndMergedBatchesHaveDifferentStatusCheckBoundaries() public {
        evc.enableCollateral(address(this), COLLATERAL);
        CollateralRequiredController controller = new CollateralRequiredController(evc, COLLATERAL);
        evc.enableController(address(this), address(controller));

        IEVC.BatchItem[] memory first = new IEVC.BatchItem[](1);
        first[0] = transition(false);
        vm.expectRevert(bytes("collateral disabled"));
        evc.batch(first);
        assertTrue(evc.isCollateralEnabled(address(this), COLLATERAL));

        IEVC.BatchItem[] memory combined = new IEVC.BatchItem[](2);
        combined[0] = transition(false);
        combined[1] = transition(true);
        evc.batch(combined);
        assertTrue(evc.isCollateralEnabled(address(this), COLLATERAL));
    }

    function testEvcOnlyTransitionSchedulesControllerCheckEvenWhenIdempotent() public {
        evc.enableCollateral(address(this), COLLATERAL);
        CollateralRequiredController controller = new CollateralRequiredController(evc, COLLATERAL);
        evc.enableController(address(this), address(controller));
        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](1);
        items[0] = transition(true);
        (, IEVC.StatusCheckResult[] memory checks,) = evc.batchSimulation(items);
        assertEq(checks.length, 1);
        assertEq(checks[0].checkedAddress, address(this));
        assertTrue(checks[0].isValid);
    }

    function testSimulationContinuesToSuccessfulReadAfterFailedPrepend() public {
        ReadEnrichmentTarget target = new ReadEnrichmentTarget();
        IEVC.BatchItem[] memory items = new IEVC.BatchItem[](2);
        items[0] = IEVC.BatchItem(address(target), address(this), 0, abi.encodeCall(target.update, ()));
        items[1] = IEVC.BatchItem(address(target), address(this), 0, abi.encodeCall(target.read, ()));
        (IEVC.BatchItemResult[] memory results,,) = evc.batchSimulation(items);
        assertEq(results.length, 2);
        assertFalse(results[0].success);
        assertTrue(results[1].success);
        assertEq(abi.decode(results[1].result, (uint256)), 42);
        vm.expectRevert(bytes("update failed"));
        evc.batch(items);
    }
}
