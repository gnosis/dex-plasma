
In order to eliminate duplication of standard contracts, the following contracts should be sourced appropriately form their origin or, at least, included in a core utility directory maintained by ourselves.


Summary
=======

The following can be sourced directly from `Open Zeppelin <https://github.com/OpenZeppelin/openzeppelin-solidity>`_

- `ECRecovery <https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/ECRecovery.sol>`_
- `Math <https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/math/Math.sol>`_
- `SafeMath <https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/math/SafeMath.sol>`_

Furthermore, 

- *PlasmaRLP* is no longer necessary (its functions are included in Plasma.sol)
- *BytesUtils* can be taken from `GNSPS <https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol>`_ OR `GridPlus <https://github.com/GridPlus/cryptobridge-contracts/blob/master/contracts/BytesLib.sol>`_

Unclear how to proceed,

- *Merkle* could remain as our own contract (and possibly be simplified) 
- *PriorityQueue* could reference a base contract because it doesn't appear to change much. 
- *RLP* is copied for a fourth state guy.
- *RLPEncode* Can't find original source!
- *RLPTest* Should contracts like this be here?

Detailed Overview
=================

BytesUtils
----------

Borrows only a single function from
`GNSPS <https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol>`_
which also duplicates
`GridPlus <https://github.com/GridPlus/cryptobridge-contracts/blob/master/contracts/BytesLib.sol>`_

ECRecovery
----------
Taken from `Open Zeppelin <https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/ECRecovery.sol>`_. This library will apparently not be necessary once `This <https://github.com/ethereum/solidity/issues/864>`_ "Ethereum Issue" is handled. More information about this is being tracked `Here <https://gist.github.com/axic/5b33912c6f61ae6fd96d6c4a47afde6d>`_

Math
----
Only contains a function for max(a, b). Duplicated from `Open Zeppelin <https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/math/Math.sol>`_

Merkle
------
Inspired by, but not directly coppied from `Open Zeppelin <https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/MerkleProof.sol>`_.

PlasmaRLP
---------
Currently only referred to in commented import statement in Plasma.sol. It appears the three functions from this file have been included in Plasma.sol

PriorityQueue
-------------
Seems Like we should reference the `Omesigo Version <https://github.com/omisego/plasma-contracts/blob/master/contracts/PriorityQueue.sol>`_

RLP
---
Our version is coming from hamdiallam with `FourthState <https://github.com/hamdiallam/Solidity-RLP/blob/master/contracts/RLPReader.sol>`_

RLPEncode
---------

This is difficult to track down! The file itself claims to be taken from `bakaoh <https://github.com/bakaoh>`_, but I can't find it anywhere.

There is avery slight resemblance to `sammayos contract <https://github.com/sammayo/solidity-rlp-encoder/blob/master/RLPEncode.sol>`_ following contract, but not enough to say this is the source. 

RLPTest
-------
Appears to be a contract whose only purpose is for testing.

SafeMath
--------
It is safe to say that this is a very standard contract coming from `Open Zeppelin <https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/contracts/math/SafeMath.sol>`_




