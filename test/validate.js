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

    it("Basic Pass & Fail - Single Input", async () => {
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
        "checkSigs doesn't return true when it should"
      )

      // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 0, sigs + invalidConfirmSignature.slice(2)),
        "checkSigs doesn't return false with invalid confirm signature."
      )
    })

    it("Basic Pass & Fail - Two Inputs", async () => {
      const validator = await ValidateWrapper.new()

      const signer1 = accounts[1]
      const signer2 = accounts[2]
      const invalidSigner = accounts[3]

      const txHash = web3.sha3("tx bytes to be hashed")
      // Same transaction signed by both 1 and 2
      const signature1 = await web3.eth.sign(signer1, txHash)
      const signature2 = await web3.eth.sign(signer2, txHash)

      const initialSigs = signature1 + signature2.slice(2)

      const rootHash = web3.sha3("merkle root hash")
      const confirmHash = keccak256(txHash, rootHash)

      const confirmSignature1 = await web3.eth.sign(signer1, confirmHash)
      const confirmSignature2 = await web3.eth.sign(signer2, confirmHash)

      const confirmSigs = confirmSignature1 + confirmSignature2.slice(2)
      const invalidConfirmSignature = await web3.eth.sign(invalidSigner, confirmHash)

      // assert valid confirmSignatures will pass checkSigs
      assert.isTrue(
        await validator.checkSigs.call(txHash, rootHash, 1, initialSigs + confirmSigs.slice(2)),
        "checkSigs doesn't return true when it should"
      )

      // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 1, initialSigs + confirmSignature1.slice(2) + invalidConfirmSignature.slice(2)),
        "checkSigs doesn't return false with invalid confirm signature."
      )

    })
  })

})