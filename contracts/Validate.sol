pragma solidity ^0.4.24;

import "bytes/BytesLib.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";


/**
 * @title Validate
 * @dev Checks that the signatures on a transaction are valid
 */
library Validate {
    function checkSigs(bytes32 txHash, bytes32 rootHash, uint inputCount, bytes sigs)
        internal
        pure
        returns (bool)
    {
        require(sigs.length % 65 == 0 && sigs.length <= 260, "Signatures failed length verification");
        bytes memory sig1 = BytesLib.slice(sigs, 0, 65);
        bytes memory confSig1 = BytesLib.slice(sigs, 130, 65);
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, rootHash));

        bool check2 = true;

        address txHashSig1 = ECRecovery.recover(ECRecovery.toEthSignedMessageHash(txHash), sig1);
        require(txHashSig1 != 0, "Error 1: occured while evaluating ecrecover on transaction-sig1");

        bool check1 = txHashSig1 == ECRecovery.recover(ECRecovery.toEthSignedMessageHash(confirmationHash), confSig1);

        if (inputCount > 0 && check1) {  // && allows us to short circuit if check1 is already false.
            bytes memory sig2 = BytesLib.slice(sigs, 65, 65);
            bytes memory confSig2 = BytesLib.slice(sigs, 195, 65);

            address txHashSig2 = ECRecovery.recover(ECRecovery.toEthSignedMessageHash(txHash), sig2);
            require(txHashSig2 != 0, "Error 2: while evaluating ecrecover on transaction-sig2");
            check2 = txHashSig2 == ECRecovery.recover(ECRecovery.toEthSignedMessageHash(confirmationHash), confSig2);
        }
        return check1 && check2;
    }
}
