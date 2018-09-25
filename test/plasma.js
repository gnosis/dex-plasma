const oneETH = 10**18
const zeroHash = 0x0
const one_zero = "0x0100"  // This is hex for the bit-array [1, 0]
const one_hash = "0x" + "1".repeat(64);

const MockContract = artifacts.require('./MockContract.sol');
const EtherToken = artifacts.require("EtherToken.sol")
const Plasma = artifacts.require("Plasma.sol")
const abi = require('ethereumjs-abi')

const {
  assertRejects,
  toHex,
  encodeUtxoPosition,
  BlockType,
} = require('./utilities.js');

contract('Plasma', (accounts) => {
  const [operator, depositor] = accounts
  describe('Deposit Tests', () => {
    it('deposit from approved account', async () => {
      const etherMock = await MockContract.new();
      const plasma = await Plasma.new(operator, etherMock.address)
      
      const etherToken = EtherToken.at(etherMock.address);
      const transfer = await etherToken.contract.transferFrom.getData(depositor, plasma.address, oneETH)
      await etherMock.givenReturn(transfer, abi.rawEncode(['bool'], [true]).toString())

      const currentDepositBlock = (await plasma.currentDepositBlock.call()).toNumber()

      await plasma.deposit(oneETH, 0, {from: depositor})

      const currentDepositBlockNew = (await plasma.currentDepositBlock.call()).toNumber()
      assert.equal(currentDepositBlock+1, currentDepositBlockNew, "new deposit has not been correctly credited")
    })
  })

  describe('exitDeposit', () => {
    let plasma;
    beforeEach(async () => {
      const etherMock = await MockContract.new();
      plasma = await Plasma.new(operator, etherMock.address)
      
      const etherToken = EtherToken.at(etherMock.address);
      const transfer = await etherToken.contract.transferFrom.getData(depositor, plasma.address, oneETH)
      await etherMock.givenReturn(transfer, abi.rawEncode(['bool'], [true]).toString())

      await plasma.deposit(oneETH, 0, {from: depositor})

    });

    it('Rejected: blknum % CHILD_BLOCK_INTERVAL == 0', async () => {
      badDepositPos = 1000 // (anything less that 10^9)
      await assertRejects(plasma.startDepositExit(badDepositPos, 0, oneETH, {from: depositor}))
    })

    it('Rejected: Wrong Sender (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(encodeUtxoPosition(1,0,0), 0, oneETH, {from: operator}))
    })

    it('Rejected: Wrong amount (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(encodeUtxoPosition(1,0,0), 0, 2 * oneETH, {from: depositor}))
    })

    it('Rejected: Wrong token (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(encodeUtxoPosition(1,0,0), 1, oneETH, {from: depositor}))
    })

    it('Good exitDeposit', async () => {
      const position = encodeUtxoPosition(1,0,0)
      before = (await plasma.exits.call(position))
      assert.equal(before[0], zeroHash);
      
      await plasma.startDepositExit(position, 0, oneETH, {from: depositor})
      
      after = (await plasma.exits.call(position))
      assert.equal(after[0], depositor);
    })
  })

  describe('submitBlock', () => {
    it('allows only the operator to submit blocks', async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.submitBlock(zeroHash, 0, {from: depositor}), "block is also permitted from non-operator")
    })

    it('accepts an empty block', async () => {
      const etherMock = await MockContract.new();
      const plasma = await Plasma.new(operator, etherMock.address)

      before = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator})
      after = (await plasma.currentChildBlock.call()).toNumber()
      assert.notEqual(before, after)
    })

    it('inserts non empty block in child chain', async () => {
      const etherMock = await MockContract.new();
      const plasma = await Plasma.new(operator, etherMock.address)

      const blockNumber = (await plasma.currentChildBlock.call()).toNumber();
      await plasma.submitBlock(one_hash, BlockType.Transaction, {from: operator})
      let hash, time, type;
      [hash, time, type] = await plasma.getChildChain.call(blockNumber)

      assert.equal(hash, one_hash)
      assert.equal(type, BlockType.Transaction)
    })

    it ('cannot submit a deposit block', async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Deposit, {from: operator}))
    })

    it ('cannot submit a transaction block, while the auction is ongoing', async () => {
      const plasma = await Plasma.new(operator, 0x0)

      await plasma.submitBlock(zeroHash, BlockType.Order, {from: operator})
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.OrderDoubleSign, {from: operator})
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.AuctionResult, {from: operator})
      await assertRejects(plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator}))

      await plasma.submitBlock(zeroHash, BlockType.AuctionOutput, {from: operator})
      
      // Eventually passing
      const blockNumber = (await plasma.currentChildBlock.call()).toNumber();
      await plasma.submitBlock(one_hash, BlockType.Transaction, {from: operator})
      assert.equal((await plasma.getChildChain.call(blockNumber))[0], one_hash)
    })

    it ('can submit order block after transaction block', async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator})
      
      const blockNumber = (await plasma.currentChildBlock.call()).toNumber();
      await plasma.submitBlock(one_hash, BlockType.Order, {from: operator})
      assert.equal((await plasma.getChildChain.call(blockNumber))[0], one_hash)
    })

    it ('can submit order block after deposit block', async () => {
      const etherMock = await MockContract.new();
      plasma = await Plasma.new(operator, etherMock.address)
      
      const etherToken = EtherToken.at(etherMock.address);
      const transfer = await etherToken.contract.transferFrom.getData(depositor, plasma.address, oneETH)
      await etherMock.givenReturn(transfer, abi.rawEncode(['bool'], [true]).toString())

      await plasma.deposit(oneETH, 0, {from: depositor})

      const blockNumber = (await plasma.currentChildBlock.call()).toNumber();
      await plasma.submitBlock(one_hash, BlockType.Order, {from: operator})
      assert.equal((await plasma.getChildChain.call(blockNumber))[0], one_hash)
    })

    it ('cannot submit auction blocks out or order', async () => {
      const plasma = await Plasma.new(operator, 0x0)

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

  describe('bitmapHasOneAtSpot:', () => {
    it('True & False', async () => {
      const plasma = await Plasma.new(operator, 0x0)
      be_true = await plasma.bitmapHasOneAtSpot(0, one_zero)
      assert.equal(be_true, true)
      be_false = await plasma.bitmapHasOneAtSpot(1, one_zero)
      assert.equal(be_false, false)
    })

    it('Index Out of Range', async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.bitmapHasOneAtSpot(2, one_zero))
    })
  })

})  
