pragma solidity ^0.4.24;

import "../utils/Merkle.sol";


contract MerkleMock {
    
    function checkMembership(bytes32 leaf, uint256 index, bytes32 rootHash, bytes proof, uint height) 
        public
        pure
        returns (bool)
    {   
        return Merkle.checkMembership(leaf, index, rootHash, proof, height);
    }
}