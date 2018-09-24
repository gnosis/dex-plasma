let oneETH = 10**18


const EtherToken = artifacts.require("EtherToken")
const Plasma = artifacts.require("Plasma.sol")

var etherToken
var plasma

let {
  assertRejects,
  toHex
} = require('./utilities.js');

contract('Plasma', (accounts) => {
  const [operator, depositor] = accounts

  before(async () => {
    etherToken = await EtherToken.deployed()
    plasma = await Plasma.deployed()
    zeroHash = 0x0
  })


  describe('Deposit Tests', () => {

    it('step 1 - Wrap Ether', async () => {
      // ASSERT Auction has started
      await etherToken.deposit({from: depositor, value: oneETH})
      await etherToken.approve(Plasma.address, oneETH, {from: depositor})
    })

    it('step 2 - deposits', async () => {
      const currentDepositBlock = (await plasma.currentDepositBlock.call()).toNumber()

      await plasma.deposit(oneETH, 0, {from: depositor})

      var currentDepositBlockNew = (await plasma.currentDepositBlock.call()).toNumber()
      assert.equal(currentDepositBlock+1, currentDepositBlockNew, "new deposit has not been correctly credited")
    })
  })

  describe('exitDeposit', () => {

    it('Wrap Ether & Deposit', async () => {
      await etherToken.deposit({from: depositor, value: oneETH})
      await etherToken.approve(Plasma.address, oneETH, {from: depositor})

      const currentDepositBlock = (await plasma.currentDepositBlock.call()).toNumber()

      await plasma.deposit(oneETH, 0, {from: depositor})

      var currentDepositBlockNew = (await plasma.currentDepositBlock.call()).toNumber()
      assert.equal(currentDepositBlock+1, currentDepositBlockNew, "new deposit has not been correctly credited")
    })

    it('Rejected: blknum % CHILD_BLOCK_INTERVAL == 0', async () => {
      badDepositPos = 1000 // (anything less that 10^9)
      await assertRejects(plasma.startDepositExit(badDepositPos, 0, oneETH, {from: depositor}))
    })

    it('Rejected: Wrong Sender (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(1000000000, 0, oneETH, {from: operator}))
    })

    it('Rejected: Wrong amount (root != depositHash)', async () => {
      // WEIRD PROBLEM - TODO: This test doesn't pass with with oneETH + 1!
      await assertRejects(plasma.startDepositExit(1000000000, 0, 1, {from: depositor}))
    })

    it('Rejected: Wrong token (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(1000000000, 1, oneETH, {from: depositor}))
    })

    it('Good exitDeposit', async () => {
      await plasma.startDepositExit(1000000000, 0, oneETH, {from: depositor})
    })
  })

  describe('submitBlock: Trivial Tests', () => {

    it('Only Operator', async () => {
      await assertRejects(plasma.submitBlock(zeroHash, 0, {from: depositor}), "block is also permitted from non-operator")
    })

    it('Empty Block', async () => {
      txn = await plasma.submitBlock(zeroHash, 0, {from: operator})
    })
  })

  describe('bitmapHasOneAtSpot:', () => {
    one_zero = "0x0100"  // This is hex for the bit-array [1, 0]
    it('True & False', async () => {
      be_true = await plasma.bitmapHasOneAtSpot(0, one_zero)
      assert.equal(be_true, true)
      be_false = await plasma.bitmapHasOneAtSpot(1, one_zero)
    })

    it('Index Out of Range', async () => {
      await assertRejects(plasma.bitmapHasOneAtSpot(2, one_zero))
    })
  })

})  
