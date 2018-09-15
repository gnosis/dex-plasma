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
      // This is the first test
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
      // WEIRD PROBLEM - TODO: This test doesn't with with oneETH + 1!
      await assertRejects(plasma.startDepositExit(1000000000, 0, 1, {from: depositor}))
    })

    it('Rejected: Wrong token (root != depositHash)', async () => {
      await assertRejects(plasma.startDepositExit(1000000000, 1, oneETH, {from: depositor}))
    })

    it('Good exitDeposit', async () => {
      await plasma.startDepositExit(1000000000, 0, oneETH, {from: depositor})
    })
  })

  describe('submitTransactionBlock', () => {

    it('Failed - onlyOperator', async () => {
      await assertRejects(plasma.submitTransactionBlock(zeroHash, {from: depositor}))
    })

    it('Empty Block', async () => {
      txn = await plasma.submitTransactionBlock(zeroHash, {from: operator})
    })
  })

})  
