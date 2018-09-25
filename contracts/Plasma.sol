pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";

import "solidity-rlp/contracts/RLPReader.sol";
import "./utils/Merkle.sol";
import "./utils/PriorityQueue.sol";

import "./Validate.sol";

import "@gnosis.pm/util-contracts/contracts/Token.sol";

// TODO - remove these one by one!
// solhint-disable not-rely-on-time, func-order, separate-by-one-line-in-contract

/**
 * @title RootChain
 * @dev This contract secures a utxo payments plasma child chain to ethereum.
 */
contract Plasma {
    using SafeMath for uint;
    using Merkle for bytes32;
    using Math for uint;

    /*
     * Events
     */

    event Deposit(
        address indexed depositor,
        uint indexed depositBlock,
        address token,
        uint amount
    );

    event ExitStarted(
        address indexed exitor,
        uint indexed utxoPos,
        uint token,
        uint amount
    );

    event BlockSubmitted(
        bytes32 root,
        uint timestamp
    );

    event TokenAdded(
        address token
    );

    event VolumeRequest(
        uint _utxoPos,
        bytes _orderBytes,
        uint orderIndex,
        uint blockNumber
    );

    /*
     * Storage
     */
     // same structs as in library, bad practice
    struct ExitingTx {
        address exitor;
        uint token;
        uint amount;
        uint inputCount;
    }

    struct ExitingOrder {
        address exitor;
        uint targetToken;
        uint sourceToken;
        uint amount;
        uint limitPrice;
        bytes utxo;
    }

    uint public constant CHILD_BLOCK_INTERVAL = 1000;
    uint public constant BOND_FOR_VOLUME_REQUEST  = 100000000000;

    address public operator;

    uint public currentChildBlock;
    uint public currentDepositBlock;
    uint public currentFeeExit;
    // the chain can be reset to a certain blockheight, when the operator does not provide any data. 
    // chainRest = 0 equals to no chain reset
    uint public chainReset = 0;

    mapping (uint => ChildBlock) public childChain;
    mapping (uint => Exit) public exits;

    address[] public listedTokens;
    mapping (uint => address) public exitsQueues;

    struct Exit {
        address owner;
        uint token;
        uint amount;
    }

    enum BlockType {
        Transaction,
        Deposit,
        Order,
        OrderDoubleSign,
        AuctionResult,
        AuctionOutput
    }

    struct ChildBlock {
        bytes32 root;
        uint timestamp;
        BlockType blockType; 
    }

    /*
     * Modifiers
     */

    modifier onlyOperator() {
        require(msg.sender == operator, "Sender is not Operator!");
        _;
    }

    /*
     * Constructor
     */

    constructor (address _operator, address wrappedETH) public {
        operator = _operator;
        currentChildBlock = CHILD_BLOCK_INTERVAL;
        currentDepositBlock = 1;
        currentFeeExit = 1;
        // Support only ETH on deployment; other tokens need
        // to be added explicitly.
        listedTokens.push(wrappedETH);
        exitsQueues[0] = address(new PriorityQueue());
    }


    /*
     * Public Functions
     */

    /**
     * @dev Allows Plasma chain operator to submit block root.
     * @param _root The root of a child chain block.
     * @param _blockType Type of block to be submitted.
     */
    function submitBlock(bytes32 _root, BlockType _blockType) public onlyOperator {
        require(_blockType != BlockType.Deposit, "Deposits need to be submitted via main chain");

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

        // Create the block structure
        childChain[currentChildBlock] = ChildBlock({
            root: _root,
            timestamp: block.timestamp,
            blockType: _blockType
        });

        // Update block numbers.
        currentChildBlock = currentChildBlock.add(CHILD_BLOCK_INTERVAL);
        currentDepositBlock = 1;
        emit BlockSubmitted(_root, block.timestamp);
    }

    /**
     * @dev Allows anyone to deposit funds into the Plasma chain.
     */
    function deposit(uint amount, uint tokenNr) public {
        Token token = Token(listedTokens[tokenNr]);
        // Only allow up to CHILD_BLOCK_INTERVAL deposits per child block.
        require(currentDepositBlock < CHILD_BLOCK_INTERVAL, "Too many deposit blocks before next Transaction");
        require(token.transferFrom(msg.sender, this, amount), "Token transfer failure on deposit()");

        bytes32 root = keccak256(abi.encodePacked(msg.sender, token, amount));
        uint depositBlock = getDepositBlock();
        childChain[depositBlock] = ChildBlock({
            root: root,
            timestamp: block.timestamp,
            blockType: BlockType.Deposit
        });
        currentDepositBlock = currentDepositBlock.add(1);
        emit Deposit(msg.sender, depositBlock, address(token), amount);
    }

    /**
     * @dev Starts an exit from a deposit.
     * @param _depositPos UTXO position of the deposit.
     * @param _token Token type to deposit.
     * @param _amount Deposit amount.
     */
    function startDepositExit(uint _depositPos, uint _token, uint _amount) public {
        uint blknum = _depositPos / 1000000000;

        require(blknum % CHILD_BLOCK_INTERVAL != 0, "UTXO provided is not a deposit");

        // Validate the given owner and amount.
        bytes32 root = childChain[blknum].root;
        bytes32 depositHash = keccak256(abi.encodePacked(msg.sender, Token(listedTokens[_token]), _amount));

        require(root == depositHash, "Root and depositHash don't match");

        addExitToQueue(_depositPos, msg.sender, _token, _amount, childChain[blknum].timestamp);
    }


    /**
     * @dev Starts to exit a specified utxo.
     * @param _utxoPos The position of the exiting utxo in the format of blknum * 1000000000 + index * 10000 + oindex.
     * @param _txBytes The transaction being exited in RLP bytes format.
     * @param _proof Proof of the exiting transactions inclusion for the block specified by utxoPos.
     * @param _sigs Both transaction and confirmation signatures used to verify exiting transaction has been confirmed.
     */
    function startTransactionExit(
        uint _utxoPos,
        bytes _txBytes,
        bytes _proof,
        bytes _sigs
    )
        public
    {
        uint blknum = _utxoPos / 1000000000;
        uint txindex = (_utxoPos % 1000000000) / 10000;
        uint oindex = _utxoPos - blknum * 1000000000 - txindex * 10000; 

        require(_utxoPos < chainReset || chainReset == 0, "UTXO is expired! (i.e. older than chain-reset point)");

        ExitingTx memory exitingTx = createExitingTx(_txBytes, oindex);
        require(msg.sender == exitingTx.exitor, "Sender does not own UTXO");

        // Check the transaction was included in the chain and is correctly signed.
        bytes32 root = childChain[blknum].root; 
        bytes32 merkleHash = keccak256(abi.encodePacked(keccak256(_txBytes), BytesLib.slice(_sigs, 0, 130)));
        require(
            Validate.checkSigs(keccak256(_txBytes), root, exitingTx.inputCount, _sigs),
            "Failed Signature check on transaction exit. Bad double signature?"
        );

        require(merkleHash.checkMembership(txindex, root, _proof, 16), "Failed Merkle Membership check.");

        addExitToQueue(_utxoPos, exitingTx.exitor, exitingTx.token, exitingTx.amount, childChain[blknum].timestamp);
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
    function challengeTransactionExitWithTransaction(
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
        require(
            indexes[0] < chainReset || chainReset == 0, "OrderInput is expired! (i.e. older than chain-reset point)"
        );

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
                addExitToQueue(
                    indexes[0],
                    exitingOrder.exitor,
                    exitingOrder.targetToken,
                    inputs[0] * inputs[1] / inputs[2],
                    childChain[blknum].timestamp
                );
            if (inputs[0] != exitingOrder.amount) 
                addExitToQueue(
                    indexes[0],
                    exitingOrder.exitor,
                    exitingOrder.sourceToken,
                    exitingOrder.amount - inputs[0],
                    childChain[blknum].timestamp
                );
            else { // if order was not touched:
                addExitToQueue(
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

    /**
     * @dev Determines the next exit to be processed.
     * @param _token Asset type to be exited.
     * @return A tuple of the position and time when this exit can be processed.
     */
    function getNextExit(uint _token) public view returns (uint, uint) {
        return PriorityQueue(exitsQueues[_token]).getMin();
    }

    /**
     * @dev Processes any exits that have completed the challenge period. 
     * @param _token Token type to process.
     */
    function finalizeExits(uint _token)
        public
    {
        uint utxoPos;
        uint exitableAt;
        (exitableAt, utxoPos) = getNextExit(_token);
        PriorityQueue queue = PriorityQueue(exitsQueues[_token]);
        Exit memory currentExit = exits[utxoPos];
        while (exitableAt < block.timestamp) {
            currentExit = exits[utxoPos];
            require(
                Token(_token).transfer(currentExit.owner, currentExit.amount),
                "Failed token transfer on finalizeExits"
            );
            queue.delMin();
            delete exits[utxoPos].owner;

            if (queue.currentSize() > 0) {
                (exitableAt, utxoPos) = getNextExit(_token);
            } else {
                return;
            }
        }
    }


    /*
     * Public view functions
     */

    /**
     * @dev Queries the child chain.
     * @param _blockNumber Number of the block to return.
     * @return Child chain block at the specified block number.
     */
    function getChildChain(uint _blockNumber) public view returns (bytes32, uint, uint) {
        return (
            childChain[_blockNumber].root, 
            childChain[_blockNumber].timestamp, 
            uint(childChain[_blockNumber].blockType)
        );
    }

    /**
     * @dev Determines the next deposit block number.
     * @return Block number to be given to the next deposit block.
     */
    function getDepositBlock() public view returns (uint) {
        return currentChildBlock.sub(CHILD_BLOCK_INTERVAL).add(currentDepositBlock);
    }

    /**
     * @dev Returns information about an exit.
     * @param _utxoPos Position of the UTXO in the chain.
     * @return A tuple representing the active exit for the given UTXO.
     */
    function getExit(uint _utxoPos) public view returns (address, uint, uint) {
        return (exits[_utxoPos].owner, exits[_utxoPos].token, exits[_utxoPos].amount);
    }

    /*
     * Private functions
     */

    /**
     * @dev Adds an exit to the exit queue.
     * @param _utxoPos Position of the UTXO in the child chain.
     * @param _exitor Owner of the UTXO.
     * @param _token Token to be exited.
     * @param _amount Amount to be exited.
     * @param _createdAt Time when the UTXO was created.
     */
    function addExitToQueue(
        uint _utxoPos,
        address _exitor,
        uint _token,
        uint _amount,
        uint _createdAt
    )
        private
    {
        require(exitsQueues[_token] != address(0), "Token not recognized.");
        require(_amount > 0, "Must exit positive amount!");
        require(exits[_utxoPos].amount == 0, "exit already exists for this UTXO.");

        // Calculate priority.
        uint exitableAt = (_createdAt.add(2 weeks)).max256(block.timestamp.add(1 weeks));
        PriorityQueue queue = PriorityQueue(exitsQueues[_token]);
        queue.insert(exitableAt, _utxoPos);

        exits[_utxoPos] = Exit({
            owner: _exitor,
            token: _token,
            amount: _amount
        });

        emit ExitStarted(msg.sender, _utxoPos, _token, _amount);
    }
    event DebugBytes(bytes a, uint b);
    function bitmapHasOneAtSpot(
        uint index,
        bytes bitmap
    ) 
        public pure returns (bool) 
    {
        require(index < bitmap.length, "Index out of range");
        return bitmap[index] == 1;
    }

    function getUtxoPos(bytes memory challengingTxBytes, uint oIndex)
        internal
        pure
        returns (uint)
    {
        RLPReader.RLPItem[] memory txList = RLPReader.toList(RLPReader.toRlpItem(challengingTxBytes));
        uint oIndexShift = oIndex * 3;
        // solhint-disable-next-line max-line-length
        return RLPReader.toUint(txList[0 + oIndexShift]) + RLPReader.toUint(txList[1 + oIndexShift]) + RLPReader.toUint(txList[2 + oIndexShift]);
    }

    function createExitingTx(bytes memory exitingTxBytes, uint oindex)
        internal
        pure
        returns (ExitingTx)
    {
        RLPReader.RLPItem[] memory txList = RLPReader.toList(RLPReader.toRlpItem(exitingTxBytes));
        return ExitingTx({
            exitor: RLPReader.toAddress(txList[7 + 2 * oindex]),
            token: RLPReader.toUint(txList[6]),
            amount: RLPReader.toUint(txList[8 + 2 * oindex]),
            inputCount: RLPReader.toUint(txList[0]) * RLPReader.toUint(txList[3])
        });
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
}
