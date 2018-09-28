pragma solidity ^0.4.24;

import "./Plasma.sol";


/**
* @title BatchAuctionPlasma
* @dev This contract deals with batch auction specific logic, 
* such as order/result block submission and auction specific exit gams.
*/
contract BatchAuctionPlasma is Plasma {

    event VolumeRequest(
        uint _utxoPos,
        bytes _orderBytes,
        uint orderIndex,
        uint blockNumber
    );

    uint public constant BOND_FOR_VOLUME_REQUEST  = 100000000000;

    constructor (address _operator, address wrappedETH) public Plasma(_operator, wrappedETH) {}

    /**
     * @dev Allows Plasma chain operator to submit block root.
     * @param _root The root of a child chain block.
     * @param _blockType Type of block to be submitted.
     */
    function submitBlock(bytes32 _root, BlockType _blockType) public onlyOperator {
        // Place if statement as if it were a switch for each block type
        // enforcing order of blocks:
        BlockType prevBlockType = childChain[currentChildBlock.sub(CHILD_BLOCK_INTERVAL)].blockType;
        if (_blockType == BlockType.Transaction) { 
            require(
                prevBlockType == BlockType.Transaction || prevBlockType == BlockType.AuctionOutput,
                "Transaction block submitted is wrong order!"
            );
        } else if (_blockType == BlockType.Order) {
            require(
                prevBlockType == BlockType.Transaction,
                "Order block must come immediately after Transaction Block"
            );
        } else if (_blockType == BlockType.OrderDoubleSign) {
            require(
                prevBlockType == BlockType.Order,
                "Confirmation signatures must come immediately after Order Block"
            );
        } else if (_blockType == BlockType.AuctionResult) {
            require(
                prevBlockType == BlockType.OrderDoubleSign,
                "Auction Result must come immediately after DoubleSig Block"
            );
        } else if (_blockType == BlockType.AuctionOutput) {
            require(
                prevBlockType == BlockType.AuctionResult,
                "Auction Output must come immediately after Auction Result Block"
            );
        }
        super.submitBlock(_root, _blockType);
    }

    /**
     * @dev Allows anyone to challenge an exiting transaction by submitting proof of a double spend on the child chain.
     * @param _cUtxoPos The position of the challenging utxo.
     * @param _eUtxoIndex The output position of the exiting utxo.
     * @param _txBytes The challenging transaction in bytes RLP form.
     * @param _proof Proof of inclusion for the transaction used to challenge.
     * @param _sigs Signatures for the transaction used to challenge.
     * @param _confirmationSig The confirmation signature for the transaction used to challenge.
     */
    function challengeTransactionExitWithOrder(
        uint _cUtxoPos,
        uint _eUtxoIndex,
        bytes _txBytes,
        bytes _proof,
        bytes _sigs,
        bytes _confirmationSig
    )
        public
    {
        uint eUtxoPos = getUtxoPos(_txBytes, _eUtxoIndex);
        uint txindex = (_cUtxoPos % 1000000000) / 10000;
        bytes32 root = childChain[_cUtxoPos / 1000000000].root;
        bytes32 txHash = keccak256(_txBytes);
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, root));
        bytes32 merkleHash = keccak256(abi.encodePacked(txHash, _sigs));
        address owner = exits[eUtxoPos].owner;

        // Validate the spending transaction.
        require(
            owner == ECRecovery.recover(confirmationHash, _confirmationSig),
            "Challenge failed at ECRecovery"
        );
        require(
            merkleHash.checkMembership(txindex, root, _proof, 16),
            "Challenge failed at Merkle Membership"
        );

        // Delete the owner but keep the amount to prevent another exit.
        delete exits[eUtxoPos].owner;
    }

    /**
     * @dev Starts to exit a specified order input */
    function startOrderInputExit(
        bytes _orderBytes,
        bytes _orderProof,
        bytes _volumeProof,
        bytes _doubleSig,
        bytes, // _doubleSignProof,
        bytes _priceTProof,
        bytes _priceSProof,
        bytes _sigs,
        uint[] inputs, // uint orderVolume, uint priceT, uint priceS,
        uint[] indexes // uint _orderPos, uint priceTIndex, uint priceSIndex,
    )
        public payable
    {

        uint blknum = indexes[0] / 1000000000;
        uint txindex = (indexes[0] % 1000000000) / 10000;
        bytes32 merkleHash = keccak256(abi.encodePacked(keccak256(_orderBytes), _sigs));
        require(
            merkleHash.checkMembership(txindex, childChain[blknum].root, _orderProof, 16),
            "Input Exit failed Merkle Membership constraint"
        );
        // Check supplied price
        require(
            bytes32(inputs[1]).checkMembership(indexes[1], childChain[blknum+2].root, _priceTProof, 16),
            "startOrderInputExit; failed priceT containment verification"
        );
        require(
            bytes32(inputs[2]).checkMembership(indexes[2], childChain[blknum+2].root, _priceSProof, 16),
            "startOrderInputExit; failed priceS containment verification"
        );

        require(
            Validate.checkSigs(keccak256(_orderBytes), childChain[blknum].root, 0, _sigs),
            "startOrderInputExit; Failed double signature verification"
        );

        // if double sig block is not available
        if (_doubleSig.length == 0) {
            // bitmap needs to be already be provided
            require(
                aggregatedSignatureBitmap[blknum][txindex] > 0 && bitmapHasOneAtSpot(txindex, aggregatedSignatureBitmap[blknum]),
                "TODO"
            );
        } else {
            // proof that signature is in block and is valid
            require(
                Validate.checkSigs(
                    keccak256(
                        abi.encodePacked(_orderBytes, childChain[blknum].root)), 
                        childChain[blknum+1].root, 0, _doubleSig
                ),
                "TODO"
            );
            // proof that signature is in block
            bytes32 merkleHash2 = keccak256(abi.encodePacked(keccak256(_orderBytes), _doubleSig));
            require(
                merkleHash2.checkMembership(indexes[2], childChain[blknum+2].root, _priceSProof, 16),
                "TODO"
            );
        }        
        startExitOrderPart2(_orderBytes, inputs, indexes, _volumeProof);
    }

    // function addToVolumeRequests(
    //     uint _utxoPos,
    //     bytes _orderBytes,
    //     uint orderIndex,
    //     uint blockNumber
    // )
    //     public
    // {
    // }
    /**
     * Challenge crypto-economic aggregation signature
     */
    // blockNr => time
    mapping (uint => uint) public aggregatedSignatureRequests;
    // blockNR => bitmap for Aggregated Signature
    mapping (uint => bytes) public aggregatedSignatureBitmap;

    // function challengeAggregationSignature(
    //     uint blockNr,
    //     uint indexOfIncorrectSig
    // )
    //     public 
    //     payable 
    // {
    //     // TODO
    // }
    // function completeASChallenge(
    //     uint blockNr,
    //     uint indexOfIncorrectSig
    // )
    //     public
    // {
    //     // TODO
    // }
    // function provideSigForASChallenge(
    //     uint blockNr,
    //     uint indexOfIncorrectSig,
    //     bytes merkleProof,
    //     bytes signature
    // )
    //     public 
    // {
    //     // TODO
    // }
    /*
     * Function to ask for specific data piece:
     */
    /**
     * @dev Anyone can provde the volume, if the exits request could not provide the trading volume
     * @param queueNr unique reference for the exit
     * @param volume supplied for the exit
     */
    // function provideVolumeForOrderInputExit(
    //     uint queueNr,
    //     uint volume,
    //     bytes32 volumeProof
    // )
    //     public 
    // {
    //     // TODO
    // }
    /**
     * @dev Allows anyone to challenge an exiting transaction by submitting proof of a double spend on the child chain.
     * @param _cUtxoPos The position of the challenging utxo.
     * @param _eUtxoIndex The output position of the exiting utxo.
     * @param _txBytes The challenging transaction in bytes RLP form.
     * @param _proof Proof of inclusion for the transaction used to challenge.
     * @param _sigs Signatures for the transaction used to challenge.
     * @param _confirmationSig The confirmation signature for the transaction used to challenge.
     */
    function challengeOrderInputExit(
        uint _cUtxoPos,
        uint _eUtxoIndex,
        bytes _txBytes,
        bytes _proof,
        bytes _sigs,
        bytes _confirmationSig
    )
        public
    {
        uint blknum = _cUtxoPos / 1000000000;
        uint txindex = (_cUtxoPos % 1000000000) / 10000;

        bytes32 root = childChain[_cUtxoPos / 1000000000].root;
        bytes32 txHash = keccak256(_txBytes);
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, root));
        bytes32 merkleHash = keccak256(abi.encodePacked(txHash, _sigs));
        address owner = exits[_eUtxoIndex].owner;

        // Validate the spending transaction.
        require(
            owner == ECRecovery.recover(confirmationHash, _confirmationSig),
            "TODO-challengeOrderInputExit-1"
        );
        require(
            merkleHash.checkMembership(txindex, childChain[blknum].root, _proof, 16),
            "TODO-challengeOrderInputExit-2"
        );

        // Delete the owner but keep the amount to prevent another exit.
        delete exits[_eUtxoIndex].owner;
    }

    function bitmapHasOneAtSpot(
        uint index,
        bytes bitmap
    ) 
        public pure returns (bool) 
    {
        require(index < bitmap.length, "Index out of range");
        return bitmap[index] == 1;
    }

    function createExitingOrder(bytes memory exitingOrderBytes)
        internal
        pure
        returns (ExitingOrder)
    {
        RLPReader.RLPItem[] memory txList = RLPReader.toList(RLPReader.toRlpItem(exitingOrderBytes));
        uint skeleton = RLPReader.toUint(txList[0]);
        uint _amount = skeleton % (1329227995784915872903807060280344576); //2**120
        skeleton = skeleton / 1329227995784915872903807060280344576;
        uint _sourceToken = skeleton % 8;
        skeleton = skeleton / 8;
        uint _targetToken = skeleton % 8;
        skeleton = skeleton / 8;
        uint _limitPrice = skeleton;
        return ExitingOrder({
            exitor: RLPReader.toAddress(txList[1]),
            targetToken:_targetToken,
            sourceToken: _sourceToken,
            amount: _amount,
            limitPrice: _limitPrice,
            utxo: RLPReader.toBytes(txList[2])
        });
    }

    function startExitOrderPart2(
        bytes _orderBytes,
        uint[] inputs,
        uint[] indexes,
        bytes _volumeProof
    ) 
        internal
    {
        uint blknum = indexes[0] / 1000000000;
        // Check the sender owns order.
        ExitingOrder memory exitingOrder = createExitingOrder(_orderBytes);
        require(
            msg.sender == exitingOrder.exitor,
            "TODO"
        );

        // process volumes
        if (inputs[0] == 0) {
            require(
                bytes32(inputs[0]).checkMembership(indexes[0] + 262144, childChain[blknum+1].root, _volumeProof, 16),
                "TODO"
            );
            // if order was touched
            if (inputs[1] <= exitingOrder.limitPrice * inputs[2])
                super.addExitToQueue(
                    indexes[0],
                    exitingOrder.exitor,
                    exitingOrder.targetToken,
                    inputs[0] * inputs[1] / inputs[2],
                    childChain[blknum].timestamp
                );
            if (inputs[0] != exitingOrder.amount) 
                super.addExitToQueue(
                    indexes[0],
                    exitingOrder.exitor,
                    exitingOrder.sourceToken,
                    exitingOrder.amount - inputs[0],
                    childChain[blknum].timestamp
                );
            else { // if order was not touched:
                super.addExitToQueue(
                    indexes[0],
                    exitingOrder.exitor,
                    exitingOrder.sourceToken,
                    exitingOrder.amount,
                    childChain[blknum].timestamp
                );
            }
        } else {
            //Append to list of reqests.
            require(
                msg.value >= BOND_FOR_VOLUME_REQUEST,
                "TODO"
            );
            // TODO - addToVolumeRequests( _utxoPos, _orderBytes, orderIndex, blknum+1);
            emit VolumeRequest(indexes[0], _orderBytes, indexes[0], blknum+1);
        }
    }
}