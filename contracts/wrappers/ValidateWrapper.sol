pragma solidity ^0.4.24;

import "../Validate.sol";


contract ValidateWrapper {
    function checkSigs(bytes32 txHash, bytes32 rootHash, uint256 inputCount, bytes sigs)
        public
        pure
        returns (bool)
    {   
        return Validate.checkSigs(txHash, rootHash, inputCount, sigs);
    }
}