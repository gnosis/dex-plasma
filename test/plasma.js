const oneETH = 10**18
const zeroHash = 0x0
const one_hash = "0x" + "1".repeat(64)
const one_week = 7*24*60*60

const MockContract = artifacts.require("./MockContract.sol")
const EtherToken = artifacts.require("EtherToken.sol")
const Plasma = artifacts.require("Plasma.sol")

const {
  assertRejects,
  encodeUtxoPosition,
  BlockType,
  toHex,
  generateTransactionWithOutput,
  generateTransactionWithInput,
  generateDoubleSignature,
  generateMerkleTree,
  fastForward,
} = require("./utilities.js")

contract("Plasma", (accounts) => {
  const [operator, depositor] = accounts
  describe("Deposit Tests", () => {
    it("deposit from approved account", async () => {
      const etherMock = await MockContract.new()
      await etherMock.givenAnyReturnBool(true)

      const plasma = await Plasma.new(operator, etherMock.address)

      const currentDepositBlock = (await plasma.currentDepositBlock.call()).toNumber()

      await plasma.deposit(oneETH, 0, {from: depositor})

      const currentDepositBlockNew = (await plasma.currentDepositBlock.call()).toNumber()
      assert.equal(currentDepositBlock+1, currentDepositBlockNew, "new deposit has not been correctly credited")
    })
  })

  describe("exitDeposit", () => {
    let plasma
    beforeEach(async () => {
      const etherMock = await MockContract.new()
      await etherMock.givenAnyReturnBool(true)

      plasma = await Plasma.new(operator, etherMock.address)
      await plasma.deposit(oneETH, 0, {from: depositor})
    })

    it("Rejected: blknum % CHILD_BLOCK_INTERVAL == 0", async () => {
      const badDepositPos = 1000 // (anything less that 10^9)
      await assertRejects(plasma.startDepositExit(badDepositPos, 0, oneETH, {from: depositor}))
    })

    it("Rejected: Wrong Sender (root != depositHash)", async () => {
      await assertRejects(plasma.startDepositExit(encodeUtxoPosition(1,0,0), 0, oneETH, {from: operator}))
    })

    it("Rejected: Wrong amount (root != depositHash)", async () => {
      await assertRejects(plasma.startDepositExit(encodeUtxoPosition(1,0,0), 0, 2 * oneETH, {from: depositor}))
    })

    it("Rejected: Wrong token (root != depositHash)", async () => {
      await assertRejects(plasma.startDepositExit(encodeUtxoPosition(1,0,0), 1, oneETH, {from: depositor}))
    })

    it("Good exitDeposit", async () => {
      const position = encodeUtxoPosition(1,0,0)
      const before = (await plasma.exits.call(position))
      assert.equal(before[0], zeroHash)
      
      await plasma.startDepositExit(position, 0, oneETH, {from: depositor})
      
      const after = (await plasma.exits.call(position))
      assert.equal(after[0], depositor)
    })
  })

  describe("submitBlock", () => {
    it("allows only the operator to submit blocks", async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.submitBlock(zeroHash, 0, {from: depositor}), "block is also permitted from non-operator")
    })

    it("accepts an empty block", async () => {
      const etherMock = await MockContract.new()
      const plasma = await Plasma.new(operator, etherMock.address)

      const before = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator})
      const after = (await plasma.currentChildBlock.call()).toNumber()
      assert.notEqual(before, after)
    })

    it("inserts non empty block in child chain", async () => {
      const etherMock = await MockContract.new()
      const plasma = await Plasma.new(operator, etherMock.address)

      const blockNumber = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(one_hash, BlockType.Transaction, {from: operator})
      const [hash, , type] = await plasma.getChildChain.call(blockNumber)

      assert.equal(hash, one_hash)
      assert.equal(type, BlockType.Transaction)
    })

    it ("cannot submit a deposit block", async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Deposit, {from: operator}))
    })
  })

  describe("exitTransaction", () => {
    it("can exit a valid transaction", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // Attempt exit for submitted block
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      // Inspect exit
      const exit = await plasma.getExit.call(utxoPosition)
      assert.equal(exit[0], operator)
      assert.equal(exit[1], 0) // Token
      assert.equal(exit[2], 10) // Amount
    })

    it("cannot exit someone else's UTXO", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // Attempt exit for submitted block as DEPOSITOR (instead of operator)
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await assertRejects(
        plasma.startTransactionExit(
          utxoPosition, tx.tx, toHex(proof), doubleSignature, {from: depositor}
        )
      )
    })

    it("cannot exit own transaction with signatures not matching", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0

      // Double signature != txSignature
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, depositor)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // Attempt exit for submitted block
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await assertRejects(
        plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)
      )
    })

    it("cannot exit transaction with invalid proof", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate two Transactions
      const outputIndex = 0
      const txIndex = 0
      const otherTxIndex = 1
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const otherTx = await generateTransactionWithOutput(operator, 0, 11, outputIndex)

      const tree = generateMerkleTree(txIndex, tx.signedTxHash, otherTxIndex, otherTx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // Attempt exit for tx with proof of otherTx
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)
      const proof = Buffer.concat(tree.getProof(otherTx.signedTxHash).map(x => x.data))
      await assertRejects(
        plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)
      )
    })

    it("cannot exit an unregistered token", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 1 /* unregistered token */, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // Attempt exit for submitted block
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await assertRejects(
        plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)
      )
    })

    it("cannot exit a transaction twice", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // Exit for submitted block
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      // Attempt same exit again
      await assertRejects(
        plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)
      )
    })
  })

  describe("challengeTransactionExitWithTransaction", () => {
    it("can challenge a tx if output was spent", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)

      // Generate and submit a transaction spending the previous
      const inputIndex = 0
      const spendingTx = await generateTransactionWithInput(utxoPosition, inputIndex, 0, operator)
      const spendingTree = generateMerkleTree(txIndex, spendingTx.signedTxHash)
      const spendingDoubleSignature = await generateDoubleSignature(spendingTx, spendingTree, operator)
      const spendingBlknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(spendingTree.getRoot()), BlockType.Transaction)

      // Exit for first transaction
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)
      
      // Make sure exit is recorded
      let [ owner ] = await plasma.getExit.call(utxoPosition)
      assert.equal(owner, operator)

      // Challenge the exit
      const challengeUtxoPosition = encodeUtxoPosition(spendingBlknum, txIndex, inputIndex)
      const challengeProof = Buffer.concat(spendingTree.getProof(spendingTx.signedTxHash).map(x => x.data))
      await plasma.challengeTransactionExitWithTransaction(
        challengeUtxoPosition, 
        inputIndex, 
        spendingTx.tx, 
        toHex(challengeProof), 
        spendingTx.txSignature, 
        "0x" + spendingDoubleSignature.slice(spendingTx.txSignature.length)
      )

      // Exit is now aborted
      owner = (await plasma.getExit.call(utxoPosition))[0]
      assert.notEqual(owner, operator)
    })

    it("cannot challenge a tx with self-signed confirmation", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)

      // Generate and submit a transaction spending the previous
      const inputIndex = 0
      const spendingTx = await generateTransactionWithInput(utxoPosition, inputIndex, 0, operator)
      const spendingTree = generateMerkleTree(txIndex, spendingTx.signedTxHash)
      const spendingBlknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(spendingTree.getRoot()), BlockType.Transaction)

      // Exit for first transaction
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      // Challenge the exit WITH INCORRECT DOUBLE SIGNATURE
      const spendingDoubleSignature = await generateDoubleSignature(spendingTx, spendingTree, depositor)
      const challengeUtxoPosition = encodeUtxoPosition(spendingBlknum, txIndex, inputIndex)
      const challengeProof = Buffer.concat(spendingTree.getProof(spendingTx.signedTxHash).map(x => x.data))
      await assertRejects(
        plasma.challengeTransactionExitWithTransaction(
          challengeUtxoPosition, 
          inputIndex, 
          spendingTx.tx, 
          toHex(challengeProof), 
          spendingTx.txSignature, 
          "0x" + spendingDoubleSignature.slice(spendingTx.txSignature.length)
        )
      )
    })

    it("cannot resubmit a challenged exit", async () => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)

      // Generate and submit a transaction spending the previous
      const inputIndex = 0
      const spendingTx = await generateTransactionWithInput(utxoPosition, inputIndex, 0, operator)
      const spendingTree = generateMerkleTree(txIndex, spendingTx.signedTxHash)
      const spendingDoubleSignature = await generateDoubleSignature(spendingTx, spendingTree, operator)
      const spendingBlknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(spendingTree.getRoot()), BlockType.Transaction)

      // Exit for first transaction
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      // Challenge the exit
      const challengeUtxoPosition = encodeUtxoPosition(spendingBlknum, txIndex, inputIndex)
      const challengeProof = Buffer.concat(spendingTree.getProof(spendingTx.signedTxHash).map(x => x.data))
      await plasma.challengeTransactionExitWithTransaction(
        challengeUtxoPosition, 
        inputIndex, 
        spendingTx.tx, 
        toHex(challengeProof), 
        spendingTx.txSignature, 
        "0x" + spendingDoubleSignature.slice(spendingTx.txSignature.length)
      )

      // Resubmit Exit Request
      await assertRejects(
        plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)
      )
    })
  })

  describe("finalizeExits", () => {
    it("cannot be called on an empty queue", async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.finalizeExits(0))
    })

    it("cannot be called with a non existant token", async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.finalizeExits(42))
    })

    it("does nothing if most recent tx not exitable", async() => {
      const plasma = await Plasma.new(operator, 0x0)

      // Generate Transaction
      const tx = await generateTransactionWithOutput(operator, 0, 10, 0)
      const tree = generateMerkleTree(0, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // startExit
      const utxoPosition = encodeUtxoPosition(blknum, 0, 0)
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      const nextExitBefore = await plasma.getNextExit.call(0)
      await plasma.finalizeExits(0)
      const nextExitAfter = await plasma.getNextExit.call(0)
      assert.deepEqual(nextExitBefore, nextExitAfter)
    })

    it("exits transactions that are exitable", async() => {
      const etherMock = await MockContract.new()
      await etherMock.givenAnyReturnBool(true)

      const plasma = await Plasma.new(operator, etherMock.address)

      // First Transaction
      const tx = await generateTransactionWithOutput(operator, 0, 10, 0)
      let tree = generateMerkleTree(0, tx.signedTxHash)
      let doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      let blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // startExit
      let utxoPosition = encodeUtxoPosition(blknum, 0, 0)
      let proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      await fastForward(one_week)

      // Another transaction/exit, this time from depositor
      const anotherTx = await generateTransactionWithOutput(depositor, 0, 10, 0)
      tree = generateMerkleTree(0, anotherTx.signedTxHash)
      doubleSignature = await generateDoubleSignature(anotherTx, tree, depositor)
      blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)
      utxoPosition = encodeUtxoPosition(blknum, 0, 0)
      proof = Buffer.concat(tree.getProof(anotherTx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, anotherTx.tx, toHex(proof), doubleSignature, {from: depositor})

      await fastForward(one_week)

      // Now first exit should be exitable and second exit should not.
      const nextExitBefore = await plasma.getNextExit.call(0)
      await plasma.finalizeExits(0)
      const nextExitAfter = await plasma.getNextExit.call(0)
      assert.notDeepEqual(nextExitBefore, nextExitAfter)
    })

    it("cannot exit if transfer fails", async() => {
      const etherMock = await MockContract.new()
      const plasma = await Plasma.new(operator, etherMock.address)

      // Make sure we cannot transfer exit funds
      const amount = 10
      const etherToken = EtherToken.at(etherMock.address)
      const transfer = await etherToken.contract.transfer.getData(operator, amount)
      await etherMock.givenCalldataReturnBool(transfer, false)

      // First Transaction
      const tx = await generateTransactionWithOutput(operator, 0, amount, 0)
      const tree = generateMerkleTree(0, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)

      // startExit
      const utxoPosition = encodeUtxoPosition(blknum, 0, 0)
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      await fastForward(2*one_week)
      await assertRejects(plasma.finalizeExits(0))
    })

    it("cannot finalize exit if it succesfully challenged", async() => {
      const etherMock = await MockContract.new()
      const plasma = await Plasma.new(operator, etherMock.address)

      // Generate Transaction
      const outputIndex = 0
      const txIndex = 0
      const tx = await generateTransactionWithOutput(operator, 0, 10, outputIndex)
      const tree = generateMerkleTree(txIndex, tx.signedTxHash)
      const doubleSignature = await generateDoubleSignature(tx, tree, operator)

      // Submit Merkle Root
      const blknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(tree.getRoot()), BlockType.Transaction)
      const utxoPosition = encodeUtxoPosition(blknum, outputIndex, txIndex)

      // Generate and submit a transaction spending the previous
      const inputIndex = 0
      const spendingTx = await generateTransactionWithInput(utxoPosition, inputIndex, 0, operator)
      const spendingTree = generateMerkleTree(txIndex, spendingTx.signedTxHash)
      const spendingDoubleSignature = await generateDoubleSignature(spendingTx, spendingTree, operator)
      const spendingBlknum = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(toHex(spendingTree.getRoot()), BlockType.Transaction)

      // Exit for first transaction
      const proof = Buffer.concat(tree.getProof(tx.signedTxHash).map(x => x.data))
      await plasma.startTransactionExit(utxoPosition, tx.tx, toHex(proof), doubleSignature)

      // Challenge the exit
      const challengeUtxoPosition = encodeUtxoPosition(spendingBlknum, txIndex, inputIndex)
      const challengeProof = Buffer.concat(spendingTree.getProof(spendingTx.signedTxHash).map(x => x.data))
      await plasma.challengeTransactionExitWithTransaction(
        challengeUtxoPosition, 
        inputIndex, 
        spendingTx.tx, 
        toHex(challengeProof), 
        spendingTx.txSignature, 
        "0x" + spendingDoubleSignature.slice(spendingTx.txSignature.length)
      )

      await fastForward(2*one_week)

      // Make sure no funds are transferred on exit
      await plasma.finalizeExits(0)
      const count = await etherMock.invocationCount.call()
      assert.equal(0, count)
    })
  })
})  
