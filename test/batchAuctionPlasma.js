const oneETH = 10**18
const zeroHash = 0x0
const one_hash = "0x" + "1".repeat(64)
const one_zero = "0x0100"  // This is hex for the bit-array [1, 0]

const abi = require("ethereumjs-abi")
const MockContract = artifacts.require("./MockContract.sol")
const EtherToken = artifacts.require("EtherToken.sol")
const BatchAuctionPlasma = artifacts.require("BatchAuctionPlasma.sol")

const {
  assertRejects,
  BlockType,
} = require("./utilities.js")

contract("BatchAuctionPlasma", (accounts) => {
  const [operator, depositor] = accounts
  describe("submitBlock", () => {
    it("allows only the operator to submit blocks", async () => {
      const plasma = await BatchAuctionPlasma.new(operator, 0x0)
      await assertRejects(plasma.submitBlock(zeroHash, 0, {from: depositor}), "block is also permitted from non-operator")
    })

    it("accepts an empty block", async () => {
      const etherMock = await MockContract.new()
      const plasma = await BatchAuctionPlasma.new(operator, etherMock.address)

      const before = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator})
      const after = (await plasma.currentChildBlock.call()).toNumber()
      assert.notEqual(before, after)
    })

    it("inserts non empty block in child chain", async () => {
      const etherMock = await MockContract.new()
      const plasma = await BatchAuctionPlasma.new(operator, etherMock.address)

      const blockNumber = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(one_hash, BlockType.Transaction, {from: operator})
      const [hash, , type] = await plasma.getChildChain.call(blockNumber)

      assert.equal(hash, one_hash)
      assert.equal(type, BlockType.Transaction)
    })

    it ("cannot submit a deposit block", async () => {
      const plasma = await BatchAuctionPlasma.new(operator, 0x0)
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Deposit, {from: operator}))
    })

    it ("cannot submit a transaction block, while the auction is ongoing", async () => {
      const plasma = await BatchAuctionPlasma.new(operator, 0x0)

      await plasma.submitBlock(zeroHash, BlockType.Order, {from: operator})
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.OrderDoubleSign, {from: operator})
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.AuctionResult, {from: operator})
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.AuctionOutput, {from: operator})
      
      // Eventually passing
      const blockNumber = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(one_hash, BlockType.Transaction, {from: operator})
      assert.equal((await plasma.getChildChain.call(blockNumber))[0], one_hash)
    })

    it ("can submit order block after transaction block", async () => {
      const plasma = await BatchAuctionPlasma.new(operator, 0x0)
      await plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator})
      
      const blockNumber = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(one_hash, BlockType.Order, {from: operator})
      assert.equal((await plasma.getChildChain.call(blockNumber))[0], one_hash)
    })

    it ("can submit order block after deposit block", async () => {
      const etherMock = await MockContract.new()
      const plasma = await BatchAuctionPlasma.new(operator, etherMock.address)
      
      const etherToken = EtherToken.at(etherMock.address)
      const transfer = await etherToken.contract.transferFrom.getData(depositor, plasma.address, oneETH)
      await etherMock.givenReturn(transfer, abi.rawEncode(["bool"], [true]).toString())

      await plasma.deposit(oneETH, 0, {from: depositor})

      const blockNumber = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(one_hash, BlockType.Order, {from: operator})
      assert.equal((await plasma.getChildChain.call(blockNumber))[0], one_hash)
    })

    it ("cannot submit auction blocks out of order", async () => {
      const plasma = await BatchAuctionPlasma.new(operator, 0x0)

      // Only order block allowed
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.OrderDoubleSign, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionResult, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionOutput, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.Order, {from: operator})

      // Only double signature allowed
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Order, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionResult, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionOutput, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.OrderDoubleSign, {from: operator})

      // Only AuctionResult block
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Order, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.OrderDoubleSign, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionOutput, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.AuctionResult, {from: operator})

      // Only AuctionOutput block
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Order, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.OrderDoubleSign, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionResult, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.AuctionOutput, {from: operator})

      // As in beginning
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.OrderDoubleSign, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionResult, {from: operator}))
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.AuctionOutput, {from: operator}))
    })
  })

  describe("bitmapHasOneAtSpot:", () => {
    it("True & False", async () => {
      const plasma = await BatchAuctionPlasma.new(operator, 0x0)
      const be_true = await plasma.bitmapHasOneAtSpot(0, one_zero)
      assert.equal(be_true, true)
      const be_false = await plasma.bitmapHasOneAtSpot(1, one_zero)
      assert.equal(be_false, false)
    })

    it("Index Out of Range", async () => {
      const plasma = await BatchAuctionPlasma.new(operator, 0x0)
      await assertRejects(plasma.bitmapHasOneAtSpot(2, one_zero))
    })
  })
})