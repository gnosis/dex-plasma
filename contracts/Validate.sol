pragma solidity ^0.4.0;

import "bytes/BytesLib.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";


/**
 * @title Validate
 * @dev Checks that the signatures on a transaction are valid
 */
library Validate {
    function checkSigs(bytes32 txHash, bytes32 rootHash, uint256 inputCount, bytes sigs)
        internal
        view
        returns (bool)
    {
        require(sigs.length % 65 == 0 && sigs.length <= 260);
        bytes memory sig1 = BytesLib.slice(sigs, 0, 65);
        bytes memory sig2 = BytesLib.slice(sigs, 65, 65);
        bytes memory confSig1 = BytesLib.slice(sigs, 130, 65);
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, rootHash));

        bool check1 = true;
        bool check2 = true;

        check1 = ECRecovery.recover(txHash, sig1) == ECRecovery.recover(confirmationHash, confSig1);
        if (inputCount > 0) {
            bytes memory confSig2 = BytesLib.slice(sigs, 195, 65);
            check2 = ECRecovery.recover(txHash, sig2) == ECRecovery.recover(confirmationHash, confSig2);
        }
        return check1 && check2;
    }
}
