const oneETH = 10**18
const zeroHash = 0x0
const one_zero = "0x0100"  // This is hex for the bit-array [1, 0]

const MockContract = artifacts.require('./MockContract.sol');
const EtherToken = artifacts.require("EtherToken.sol")
const Plasma = artifacts.require("Plasma.sol")
const abi = require('ethereumjs-abi')

const {
  assertRejects,
  toHex
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
      await assertRejects(plasma.startDepositExit(1000000000, 0, oneETH, {from: operator}))
    })

    it('Rejected: Wrong amount (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(1000000000, 0, 2 * oneETH, {from: depositor}))
    })

    it('Rejected: Wrong token (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(1000000000, 1, oneETH, {from: depositor}))
    })

    it('Good exitDeposit', async () => {
      before = (await plasma.exits.call(1000000000))
      assert.equal(before[0], zeroHash);
      await plasma.startDepositExit(1000000000, 0, oneETH, {from: depositor})
      after = (await plasma.exits.call(1000000000))
      assert.equal(after[0], depositor);
    })
  })

  describe('submitBlock: Trivial Tests', () => {
    BlockType = {
      Transaction: 0,
    }

    it('Only Operator', async () => {
      const plasma = await Plasma.new(operator, 0x0)
      await assertRejects(plasma.submitBlock(zeroHash, 0, {from: depositor}), "block is also permitted from non-operator")
    })

    it('Empty Block', async () => {
      const etherMock = await MockContract.new();
      const plasma = await Plasma.new(operator, etherMock.address)

      before = (await plasma.currentChildBlock.call()).toNumber()
      await plasma.submitBlock(zeroHash, BlockType.Transaction, {from: operator})
      after = (await plasma.currentChildBlock.call()).toNumber()
      assert.notEqual(before, after)
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
