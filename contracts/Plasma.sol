pragma solidity ^0.4.0;

import "./SafeMath.sol";
import "./Math.sol";
import "./PlasmaRLP.sol";
import "./Merkle.sol";
import "./Validate.sol";
import "./PriorityQueue.sol";
import "@gnosis.pm/util-contracts/contracts/Token.sol";



/**
 * @title RootChain
 * @dev This contract secures a utxo payments plasma child chain to ethereum.
 */


contract Plasma {
    using SafeMath for uint256;
    using Merkle for bytes32;
    using PlasmaRLP for bytes;


    /*
     * Events
     */


    event Deposit(
        address indexed depositor,
        uint256 indexed depositBlock,
        address token,
        uint256 amount
    );

    event ExitStarted(
        address indexed exitor,
        uint256 indexed utxoPos,
        address token,
        uint256 amount
    );

    event BlockSubmitted(
        bytes32 root,
        uint256 timestamp
    );

    event TokenAdded(
        address token
    );


    event VolumeRequest(
        uint256 _utxoPos,
        bytes _orderBytes,
        uint256 orderIndex,
        uint blockNumber
    );

    /*
     * Storage
     */


    uint256 public constant CHILD_BLOCK_INTERVAL = 1000;
    uint256 public constant BOND_FOR_VOLUME_REQUEST  = 100000000000;

    address public operator;

    uint256 public currentChildBlock;
    uint256 public currentDepositBlock;
    uint256 public currentFeeExit;
    // the chain can be reset to a certain blockheight, when the operator does not provide any data. 
    // chainRest = 0 equals to no chain reset
    uint256 public chainReset =0;

    mapping (uint256 => ChildBlock) public childChain;
    mapping (uint256 => Exit) public exits;

    address [] public listedTokens;
    mapping (uint256 => address) public exitsQueues;

    struct Exit {
        address owner;
        address token;
        uint256 amount;
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
        uint256 timestamp;
        BlockType blockType; 
    }


    /*
     * Modifiers
     */

    modifier onlyOperator() {
        require(msg.sender == operator);
        _;
    }


    /*
     * Constructor
     */

    constructor(address _operator, address WETH)
        public
    {
        operator = _operator;
        currentChildBlock = CHILD_BLOCK_INTERVAL;
        currentDepositBlock = 1;
        currentFeeExit = 1;
        // Support only ETH on deployment; other tokens need
        // to be added explicitly.
        listedTokens[0] = WETH;
        exitsQueues[WETH] = address(new PriorityQueue());
    }


    /*
     * Public Functions
     */

    /**
     * @dev Allows Plasma chain operator to submit block root.
     * @param _root The root of a child chain block.
     */
    function submitTransactionBlock(bytes32 _root)
        public
        onlyOperator
    {   

        //enforcing order of blocks:
        require( childChain[currentChildBlock.sub( CHILD_BLOCK_INTERVAL)].blockType == BlockType.Transaction
            || childChain[currentChildBlock.sub(CHILD_BLOCK_INTERVAL)].blockType == BlockType.AuctionResult);

        childChain[currentChildBlock] = ChildBlock({
            root: _root,
            timestamp: block.timestamp,
            blockType: BlockType.Transaction
        });

        // Update block numbers.
        currentChildBlock = currentChildBlock.add(CHILD_BLOCK_INTERVAL);
        currentDepositBlock = 1;

        emit BlockSubmitted(_root, block.timestamp);
    }


    /**
     * @dev Allows Plasma chain operator to submit block root.
     * @param _root The root of a child chain block.
     */
    function submitOrderBlock(bytes32 _root)
        public
        onlyOperator
    {   
        //enforcing order of blocks:
        require(childChain[currentChildBlock.sub(CHILD_BLOCK_INTERVAL)].blockType == BlockType.Transaction);
        
        // processing block
        childChain[currentChildBlock] = ChildBlock({
            root: _root,
            timestamp: block.timestamp,
            blockType: BlockType.Order
        });

        // Update block numbers.
        currentChildBlock = currentChildBlock.add(CHILD_BLOCK_INTERVAL);
        currentDepositBlock = 1;

        emit BlockSubmitted(_root, block.timestamp);
    }

    /**
     * @dev Allows Plasma chain operator to submit block root.
     * @param _root The root of a child chain block.
     */
    function submitOrderDoubleSignBlock(bytes32 _root)
        public
        onlyOperator
    {   
        //enforcing order of blocks:
        require(childChain[currentChildBlock.sub(CHILD_BLOCK_INTERVAL)].blockType == BlockType.Order);
        
        // processing block
        childChain[currentChildBlock] = ChildBlock({
            root: _root,
            timestamp: block.timestamp,
            blockType: BlockType.OrderDoubleSign
        });

        // Update block numbers.
        currentChildBlock = currentChildBlock.add(CHILD_BLOCK_INTERVAL);
        currentDepositBlock = 1;

        emit BlockSubmitted(_root, block.timestamp);
    }
    /**
     * @dev Allows Plasma chain operator to submit block root.
     * @param _root The root of a child chain block.
     */
    function submitAuctionResultBlock(bytes32 _root)
        public
        onlyOperator
    {   

        //enforcing order of blocks:
        require(childChain[currentChildBlock.sub(CHILD_BLOCK_INTERVAL)].blockType == BlockType.OrderDoubleSign);

        childChain[currentChildBlock] = ChildBlock({
            root: _root,
            timestamp: block.timestamp,
            blockType: BlockType.AuctionResult
        });

        // Update block numbers.
        currentChildBlock = currentChildBlock.add(CHILD_BLOCK_INTERVAL);
        currentDepositBlock = 1;

        emit BlockSubmitted(_root, block.timestamp);
    }

    /**
     * @dev Allows anyone to deposit funds into the Plasma chain.
     */
    function deposit(uint256 amount, uint tokenNr)
        public
    {
        Token token = listedTokens[tokenNr];
        // Only allow up to CHILD_BLOCK_INTERVAL deposits per child block.
        require(currentDepositBlock < CHILD_BLOCK_INTERVAL);
        
        require(token.transferFrom(msg.sender, this, amount));


        bytes32 root = keccak256(msg.sender, token, msg.value);
        uint256 depositBlock = getDepositBlock();
        childChain[depositBlock] = ChildBlock({
            root: root,
            timestamp: block.timestamp,
            blockType: BlockType.Deposit
        });
        currentDepositBlock = currentDepositBlock.add(1);

        emit Deposit(msg.sender, depositBlock, address(token), msg.value);
    }

    /**
     * @dev Starts an exit from a deposit.
     * @param _depositPos UTXO position of the deposit.
     * @param _token Token type to deposit.
     * @param _amount Deposit amount.
     */
    function startDepositExit(uint256 _depositPos, address _token, uint256 _amount)
        public
    {
        uint256 blknum = _depositPos / 1000000000;

        // Check that the given UTXO is a deposit.
        require(blknum % CHILD_BLOCK_INTERVAL != 0);

        // Validate the given owner and amount.
        bytes32 root = childChain[blknum].root;
        bytes32 depositHash = keccak256(msg.sender, _token, _amount);
        require(root == depositHash);

        addExitToQueue(_depositPos, msg.sender, _token, _amount, childChain[blknum].timestamp);
    }


    /**
     * @dev Starts to exit a specified utxo.
     * @param _utxoPos The position of the exiting utxo in the format of blknum * 1000000000 + index * 10000 + oindex.
     * @param _txBytes The transaction being exited in RLP bytes format.
     * @param _proof Proof of the exiting transactions inclusion for the block specified by utxoPos.
     * @param _sigs Both transaction signatures and confirmations signatures used to verify that the exiting transaction has been confirmed.
     */
    function startTransactionExit(
        uint256 _utxoPos,
        bytes _txBytes,
        bytes _proof,
        bytes _sigs
    )
        public
    {
        uint256 blknum = _utxoPos / 1000000000;
        uint256 txindex = (_utxoPos % 1000000000) / 10000;
        uint256 oindex = _utxoPos - blknum * 1000000000 - txindex * 10000; 

        // require that exit is before a chain reset-point, if set
        require( _utxoPos < chainReset || chainReset ==0);

        // Check the sender owns this UTXO.
        var exitingTx = _txBytes.createExitingTx(oindex);
        require(msg.sender == exitingTx.exitor);

        // Check the transaction was included in the chain and is correctly signed.
        bytes32 root = childChain[blknum].root; 
        bytes32 merkleHash = keccak256(abi.encodePacked(keccak256(_txBytes), ByteUtils.slice(_sigs, 0, 130)));
        require(Validate.checkSigs(keccak256(_txBytes), root, exitingTx.inputCount, _sigs));
        require(merkleHash.checkMembership(txindex, root, _proof));

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
        uint256 _cUtxoPos,
        uint256 _eUtxoIndex,
        bytes _txBytes,
        bytes _proof,
        bytes _sigs,
        bytes _confirmationSig
    )
        public
    {
        uint256 eUtxoPos = _txBytes.getUtxoPos(_eUtxoIndex);
        uint256 txindex = (_cUtxoPos % 1000000000) / 10000;
        bytes32 root = childChain[_cUtxoPos / 1000000000].root;
        bytes32 txHash = keccak256(_txBytes);
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, root));
        bytes32 merkleHash = keccak256(txHash, _sigs);
        address owner = exits[eUtxoPos].owner;

        // Validate the spending transaction.
        require(owner == ECRecovery.recover(confirmationHash, _confirmationSig));
        require(merkleHash.checkMembership(txindex, root, _proof));

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
        uint256 _cUtxoPos,
        uint256 _eUtxoIndex,
        bytes _txBytes,
        bytes _proof,
        bytes _sigs,
        bytes _confirmationSig
    )
        public
    {
        uint256 eUtxoPos = _txBytes.getUtxoPos(_eUtxoIndex);
        uint256 txindex = (_cUtxoPos % 1000000000) / 10000;
        bytes32 root = childChain[_cUtxoPos / 1000000000].root;
        var txHash = keccak256(_txBytes);
        var confirmationHash = keccak256(abi.encodePacked(txHash, root));
        var merkleHash = keccak256(abi.encodePacked(txHash, _sigs));
        address owner = exits[eUtxoPos].owner;

        // Validate the spending transaction.
        require(owner == ECRecovery.recover(confirmationHash, _confirmationSig));
        require(merkleHash.checkMembership(txindex, root, _proof));

        // Delete the owner but keep the amount to prevent another exit.
        delete exits[eUtxoPos].owner;
    }


    /**
     * @dev Starts to exit a specified utxo.
     * @param _utxoPos The position of the exiting utxo in the format of blknum * 1000000000 + index * 10000 + oindex.
     * @param _txBytes The transaction being exited in RLP bytes format.
     * @param _proof Proof of the exiting transactions inclusion for the block specified by utxoPos.
     * @param _sigs Both transaction signatures and confirmations signatures used to verify that the exiting transaction has been confirmed.
     */
    function startOrderInputExit(
        uint256 _orderPos,
        bytes _orderBytes,
        uint256 orderIndex,
        bytes _orderProof,
        bool orderVolumeKnown,
        uint256 orderVolume,
        bytes _volumeProof,
        bytes _doubleSig,
        bytes _doubleSignProof,
        uint256 priceT,
        uint256 priceTIndex,
        bytes _priceTProof,
        uint256 priceS,
        uint256 priceSIndex,
        bytes _priceSProof,
        bytes _sigs
    )
        public payable
    {
        uint256 blknum = _orderPos / 1000000000;
        uint256 txindex = (_orderPos % 1000000000) / 10000;

        // Check the sender owns order.
        var exitingOrder = _orderBytes.createExitingOrder();
        require(msg.sender == exitingOrder.exitor);

        // require that exit is after a chain reset
        require( _orderPos < chainReset || chainReset ==0);


        //Check that order is in block:
        bytes32 root = childChain[blknum].root; 
        bytes32 txHash = keccak256(_orderBytes);
        bytes32 merkleHash = keccak256(abi.encodePacked(txHash, _sigs));
        require(merkleHash.checkMembership(txindex, root, _orderProof));
        
        // Check supplied price
        require(bytes32(priceT).checkMembership(priceTIndex, childChain[blknum+2].root, _priceTProof));
        require(bytes32(priceS).checkMembership(priceSIndex, childChain[blknum+2].root, _priceSProof));

        // Check double sign
        require(Validate.checkSigs(keccak256(_orderBytes), root, _sigs));

        // if double sig block is not available
        if(uint(_doubleSig)==0){
            //bitmap needs to be already be provided
            require(ASbitmap[blknum]>0);
            require(bitmapHasOneAtSpot(txindex,ASbitmap[blknum]));
        }
        else{
            //proof that signature is in block:
            // proof that the signature is valid
            bytes32 doubleSignMessage = keccak256(abi.encodePacked(_orderBytes,childChain[blknum].root));
            require(Validate.checkSigs(doubleSignMessage, childChain[blknum+1].root, _doubleSig));
            //proof that signature is in block
            bytes32 merkleHash = keccak256(abi.encodePacked(txHash, _doubleSig));
            require(merkleHash.checkMembership(priceSIndex, childChain[blknum+2].root, _priceSProof));
        }

        // process volumes
        if(orderVolumeKnown){
            require(bytes32(orderVolume).checkMembership(orderIndex+262144, childChain[blknum+1].root, _volumeProof));
            // if order was touched
            if(priceT <= exitingOrder.limitPrice * priceS)
                addExitToQueue(_orderPos, exitingOrder.exitor, exitingOrder.targetToken, orderVolume * priceT/priceS, childChain[blknum].timestamp);
                if(orderVolume!=exitingOrder.amount){
                    addExitToQueue(_orderPos, exitingOrder.exitor, exitingOrder.sourceToken, (exitingOrder.amount - orderVolume), childChain[blknum].timestamp); 
                }
            // if order was not touched:
            else{
               addExitToQueue(_orderPos, exitingOrder.exitor, exitingOrder.sourceToken, exitingOrder.amount, childChain[blknum].timestamp);
            }
        }else{
            //Append to list of reqests.
            require(msg.value>= BOND_FOR_VOLUME_REQUEST);
            //TODO
            //addToVolumeRequests( _utxoPos, _orderBytes, orderIndex, blknum+1);
            emit VolumeRequest( _orderPos, _orderBytes, orderIndex, blknum+1);
        }
        
    }


    function addToVolumeRequests(
        uint256 _utxoPos,
        bytes _orderBytes,
        uint256 orderIndex,
        uint blockNumber)
    public{

    }



    /*****
    Challenge crypto-economic aggrecation signature
    */
    // blockNr => time
    mapping (uint256 => uint256) ASrequests;
    // blockNR => bitmap for Aggregated Signature
    mapping (uint256 => bytes) ASbitmap;

    function challengeAggregationSignature(
        uint blockNr,
        uint indexOfIncorrectSig
    )
    public payable {

    }

    function completeASChallenge(
        uint blockNr,
        uint indexOfIncorrectSig)
    public{


    }

    function provideSigForASChallenge(
        uint blockNr,
        uint indexOfIncorrectSig,
        bytes merkleProof,
        bytes signature)
    public {

        
    }

    /*****
    Function to ask for specific data piece:

    */



    /**
     * @dev Anyone can provde the volume, if the exits request could not provide the trading volume
     * @param queueNr unique reference for the exit
     * @param volume supplied for the exit
     * @param _proof Proof of the volume, that it fits to the provided submitted VolumeHash.
     */

    function provideVolumeForOrderInputExit(
        uint256 queueNr,
        uint256 volume,
        bytes32 volumeProof)
    public {

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
    function challengeOrderInputExit(
        uint256 _cUtxoPos,
        uint256 _eUtxoIndex,
        bytes _txBytes,
        bytes _proof,
        bytes _sigs,
        bytes _confirmationSig
    )
        public
    {
        uint256 blknum = _cUtxoPos / 1000000000;
        uint256 txindex = (_cUtxoPos % 1000000000) / 10000;

        bytes32 root = childChain[_cUtxoPos / 1000000000].root;
        bytes32 txHash = keccak256(_txBytes);
        bytes32 confirmationHash = keccak256(abi.encodePacked(txHash, root));
        bytes32 merkleHash = keccak256(abi.encodePacked(txHash, _sigs));
        address owner = exits[_eUtxoIndex].owner;

        // Validate the spending transaction.
        require(owner == ECRecovery.recover(confirmationHash, _confirmationSig));
        require(merkleHash.checkMembership(txindex, childChain[blknum].root, _proof));

        // Delete the owner but keep the amount to prevent another exit.
        delete exits[_eUtxoIndex].owner;
    }

    /**
     * @dev Determines the next exit to be processed.
     * @param _token Asset type to be exited.
     * @return A tuple of the position and time when this exit can be processed.
     */
    function getNextExit(address _token)
        public
        view
        returns (uint256, uint256)
    {
        return PriorityQueue(exitsQueues[_token]).getMin();
    }

    /**
     * @dev Processes any exits that have completed the challenge period. 
     * @param _token Token type to process.
     */
    function finalizeExits(address _token)
        public
    {
        uint256 utxoPos;
        uint256 exitableAt;
        (exitableAt, utxoPos) = getNextExit(_token);
        PriorityQueue queue = PriorityQueue(exitsQueues[_token]);
        Exit memory currentExit = exits[utxoPos];
        while (exitableAt < block.timestamp) {
            currentExit = exits[utxoPos];

            // FIXME: handle ERC-20 transfer
            require(address(0) == _token);

            require(Token(_token).transfer(currentExit.owner, currentExit.amount));
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
    function getChildChain(uint256 _blockNumber)
        public
        view
        returns (bytes32, uint256, uint256)
    {
        return (childChain[_blockNumber].root, childChain[_blockNumber].timestamp, uint256(childChain[_blockNumber].blockType));
    }

    /**
     * @dev Determines the next deposit block number.
     * @return Block number to be given to the next deposit block.
     */
    function getDepositBlock()
        public
        view
        returns (uint256)
    {
        return currentChildBlock.sub(CHILD_BLOCK_INTERVAL).add(currentDepositBlock);
    }

    /**
     * @dev Returns information about an exit.
     * @param _utxoPos Position of the UTXO in the chain.
     * @return A tuple representing the active exit for the given UTXO.
     */
    function getExit(uint256 _utxoPos)
        public
        view
        returns (address, address, uint256)
    {
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
     * @param _created_at Time when the UTXO was created.
     */
    function addExitToQueue(
        uint256 _utxoPos,
        address _exitor,
        address _token,
        uint256 _amount,
        uint256 _created_at
    )
        private
    {
        // Check that we're exiting a known token.
        require(exitsQueues[_token] != address(0));

        // Check exit is valid and doesn't already exist.
        require(_amount > 0);
        require(exits[_utxoPos].amount == 0);

        // Calculate priority.
        uint256 exitableAt = Math.max(_created_at + 2 weeks, block.timestamp + 1 weeks);
        PriorityQueue queue = PriorityQueue(exitsQueues[_token]);
        queue.insert(exitableAt, _utxoPos);

        exits[_utxoPos] = Exit({
            owner: _exitor,
            token: _token,
            amount: _amount
        });

        emit ExitStarted(msg.sender, _utxoPos, _token, _amount);
    }

    function bitmapHasOneAtSpot(uint index, bytes bitmap)
    public view returns(bool){
        return bitmap[index]==1;
    }
}
