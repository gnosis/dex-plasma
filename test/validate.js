const ValidateWrapper = artifacts.require("ValidateWrapper")

const {
  assertRejects,
  toHex
} = require("./utilities.js")

contract("Validate", (accounts) => {
  const zeroHash32 = "0x" + "00".repeat(32)
  const zeroSig195 = "0x" + "00".repeat(195)

  describe("checkSigs", () => {

    it("Fail: sig length not a multiple of 65", async () => {
      const validator = await ValidateWrapper.new()
      await assertRejects(validator.checkSigs(zeroHash32, zeroHash32, 0, zeroHash32))
    })

    it("Fail: sig length greater than 260", async () => {
      const validator = await ValidateWrapper.new()
      await assertRejects(validator.checkSigs(zeroHash32, zeroHash32, 0, "0x" + "00".repeat(261)))
    })

    it("Fail: signatures not correct", async () => {
      const validator = await ValidateWrapper.new()
      const res = await validator.checkSigs.call(zeroHash32, zeroHash32, 0, zeroSig195)
      assert.equal(res, false)
    })

    // it("Test checkSigs naive", async () => {
    //   const validator = await ValidateWrapper.new()
    //   const signer = accounts[5]
    //   const invalidSigner = accounts[6]

    //   const txHash = web3.sha3("tx bytes to be hashed")
    //   const sigs = await web3.eth.sign(signer, txHash)

    //   // sigs += Buffer.alloc(65).toString("hex")

    //   const confirmationHash = web3.sha3("merkle leaf hash concat with root hash")

    //   const confirmSignatures = await web3.eth.sign(signer, confirmationHash)

    //   const invalidConfirmSignatures = await web3.eth.sign(invalidSigner, confirmationHash)
    //   // assert valid confirmSignatures will pass checkSigs
    //   assert.isTrue(
    //     await validator.checkSigs.call(txHash, toHex(confirmationHash), 0, toHex(sigs + confirmSignatures.slice(2))), 
    //     "checkSigs should pass."
    //   )

    //   // assert invalid confirmSignatures will not pass checkSigs
    //   assert.isFalse(
    //     await validator.checkSigs.call(txHash, toHex(confirmationHash), 0, toHex(sigs), toHex(invalidConfirmSignatures)), 
    //     "checkSigs should not pass given invalid confirmSignatures."
    //   )
    // })
  })
})