pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";

import "solidity-rlp/contracts/RLPReader.sol";
import "./utils/Merkle.sol";
import "./utils/PriorityQueue.sol";

import "./Validate.sol";

import "@gnosis.pm/util-contracts/contracts/Token.sol";

// TODO - remove these one by one!
// solhint-disable not-rely-on-time, func-order

/**
 * @title RootChain
 * @dev This contract secures a utxo payments plasma child chain to ethereum.
 */
contract Plasma {
    using SafeMath for uint;
    using Merkle for bytes32;
    using Math for uint;

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

    address public operator;

    uint public currentChildBlock;
    uint public currentDepositBlock;
    uint public currentFeeExit;

    mapping (uint => ChildBlock) public childChain;
    mapping (uint => Exit) public exits;

    address[] public listedTokens;
    mapping (uint => address) public exitsQueues;

    struct Exit {
        address owner;
        uint token;
        uint amount;
    }

    // TODO: make this contract agnositc about auction related block types
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

    modifier onlyOperator() {
        require(msg.sender == operator, "Sender is not Operator!");
        _;
    }

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

    /**
     * @dev Allows Plasma chain operator to submit block root.
     * @param _root The root of a child chain block.
     * @param _blockType Type of block to be submitted.
     */
    function submitBlock(bytes32 _root, BlockType _blockType) public onlyOperator {
        require(_blockType != BlockType.Deposit, "Deposits need to be submitted via main chain");
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
            owner == ECRecovery.recover(ECRecovery.toEthSignedMessageHash(confirmationHash), _confirmationSig),
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
        require(exitsQueues[_token] != address(0), "Token not recognized");
        uint utxoPos;
        uint exitableAt;
        (exitableAt, utxoPos) = getNextExit(_token);
        PriorityQueue queue = PriorityQueue(exitsQueues[_token]);
        Exit memory currentExit;
        while (exitableAt < block.timestamp) {
            currentExit = exits[utxoPos];
            queue.delMin();
            if (currentExit.owner != address(0)) {
                require(
                    Token(listedTokens[_token]).transfer(currentExit.owner, currentExit.amount),
                    "Failed token transfer on finalizeExits"
                );
                // Delete the owner but keep the amount to prevent another exit.
                delete exits[utxoPos].owner;
            }
            if (queue.currentSize() > 0) {
                (exitableAt, utxoPos) = getNextExit(_token);
            } else {
                return;
            }
        }
    }

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
        internal
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
}
