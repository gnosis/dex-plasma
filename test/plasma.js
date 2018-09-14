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

    it('Rejected exitDeposit', async () => {

      await assertRejects(plasma.startDepositExit(1000000000, 0, oneETH, {from: depositor}))

    })

    it('Rejected exitDeposit', async () => {

      await assertRejects(plasma.startDepositExit(1000000000, 0, oneETH, {from: depositor}))

    })

  })
})  
