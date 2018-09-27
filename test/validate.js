const ValidateWrapper = artifacts.require("ValidateWrapper")

const {
  assertRejects,
  keccak256
} = require("./utilities.js")

// const { sha3 } = require("ethereumjs-util")

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
      await assertRejects(validator.checkSigs(zeroHash32, zeroHash32, 0, zeroSig195))
    })

    it("Basic Pass & Fail: Single Input", async () => {
      const validator = await ValidateWrapper.new()

      const signer = accounts[1]
      const invalidSigner = accounts[2]

      const txHash = web3.sha3("tx bytes to be hashed")
      let sigs = await web3.eth.sign(signer, txHash)

      // padding with zeros because only one txn input
      sigs += Buffer.alloc(65).toString("hex")
      const rootHash = web3.sha3("merkle root hash")

      const confirmHash = keccak256(txHash, rootHash)

      const confirmSignature = await web3.eth.sign(signer, confirmHash)
      const invalidConfirmSignature = await web3.eth.sign(invalidSigner, confirmHash)

      // assert valid confirmSignatures will pass checkSigs
      assert.isTrue(
        await validator.checkSigs.call(txHash, rootHash, 0, sigs + confirmSignature.slice(2)),
        "checkSigs should pass."
      )

      // // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 0, sigs + invalidConfirmSignature.slice(2)), 
        "checkSigs should not pass given invalid confirmSignatures."
      )
    })
  })

})