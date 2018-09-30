const ValidateWrapper = artifacts.require("ValidateWrapper")

const {
  assertRejects,
  keccak256,
  toHex
} = require("./utilities.js")

const { sha3 } = require("ethereumjs-util")

contract("Validate", (accounts) => {
  const zeroHash32 = "0x" + "00".repeat(32)
  const zeroSig195 = "0x" + "00".repeat(195)

  const txHash = toHex(sha3("tx bytes to be hashed"))
  const rootHash = toHex(sha3("merkle root hash"))
  const confirmHash = keccak256(txHash, rootHash)

  const [signer1, signer2, invalidSigner] = accounts

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

    it("accepts valid signature with one input", async () => {
      const validator = await ValidateWrapper.new()

      // padding with zeros because only one txn input
      const sigs = (await web3.eth.sign(signer1, txHash)) + Buffer.alloc(65).toString("hex")

      const confirmSignature = await web3.eth.sign(signer1, confirmHash)

      // assert valid confirmSignatures will pass checkSigs
      assert.isTrue(
        await validator.checkSigs.call(txHash, rootHash, 0, sigs + confirmSignature.slice(2)),
        "checkSigs should return true."
      )
    })

    it("fail invalid signature with one input", async () => {
      const validator = await ValidateWrapper.new()

      // padding with zeros because only one txn input
      const sigs = (await web3.eth.sign(signer1, txHash)) + Buffer.alloc(65).toString("hex")

      const invalidConfirmSignature = await web3.eth.sign(invalidSigner, confirmHash)

      // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 0, sigs + invalidConfirmSignature.slice(2)),
        "checkSigs doesn't return false with invalid confirm signature."
      )
    })

    it("Pass Two Inputs", async () => {
      const validator = await ValidateWrapper.new()

      // Same transaction signed by both 1 and 2
      const signature1 = await web3.eth.sign(signer1, txHash)
      const signature2 = await web3.eth.sign(signer2, txHash)

      const initialSigs = signature1 + signature2.slice(2)

      const confirmSignature1 = (await web3.eth.sign(signer1, confirmHash)).slice(2)
      const confirmSignature2 = (await web3.eth.sign(signer2, confirmHash)).slice(2)

      // assert valid confirmSignatures will pass checkSigs
      assert.isTrue(
        await validator.checkSigs.call(txHash, rootHash, 1, initialSigs + confirmSignature1 + confirmSignature2),
        "checkSigs doesn't return true when it should"
      )

    })

    it("Fail Two Inputs - reversed confirmation signatures", async () => {
      const validator = await ValidateWrapper.new()

      // Same transaction signed by both 1 and 2
      const signature1 = await web3.eth.sign(signer1, txHash)
      const signature2 = await web3.eth.sign(signer2, txHash)

      const initialSigs = signature1 + signature2.slice(2)
      const confirmSignature1 = (await web3.eth.sign(signer1, confirmHash)).slice(2)
      const confirmSignature2 = (await web3.eth.sign(signer2, confirmHash)).slice(2)

      const reverseConfirmSigs = confirmSignature2 + confirmSignature1

      // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 1, initialSigs + reverseConfirmSigs),
        "reversed confirmation signatures shouldn't pass"
      )
    })

    it("Fail Two Inputs - invalid confirmation signature on first input", async () => {
      const validator = await ValidateWrapper.new()

      // Same transaction signed by both 1 and 2
      const signature1 = await web3.eth.sign(signer1, txHash)
      const signature2 = await web3.eth.sign(signer2, txHash)

      const initialSigs = signature1 + signature2.slice(2)
      const confirmSignature2 = (await web3.eth.sign(signer2, confirmHash)).slice(2)

      const invalidConfirmSignature = (await web3.eth.sign(invalidSigner, confirmHash)).slice(2)

      // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 1, initialSigs + invalidConfirmSignature + confirmSignature2),
        "invalid confirm signature in first of two positions shouldn't pass"
      )
    })

    it("Fail Two Inputs - invalid confirmation signature on second input", async () => {
      const validator = await ValidateWrapper.new()

      // Same transaction signed by both 1 and 2
      const signature1 = await web3.eth.sign(signer1, txHash)
      const signature2 = await web3.eth.sign(signer2, txHash)

      const initialSigs = signature1 + signature2.slice(2)

      const confirmSignature1 = (await web3.eth.sign(signer1, confirmHash)).slice(2)
      const invalidConfirmSignature = (await web3.eth.sign(invalidSigner, confirmHash)).slice(2)

      // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 1, initialSigs + confirmSignature1 + invalidConfirmSignature),
        "invalid confirm signature in second of two positions shouldn't pass"
      )
    })


    it("Fail Two Inputs - reversed initial signatures", async () => {
      const validator = await ValidateWrapper.new()

      // Same transaction signed by both 1 and 2
      const signature1 = await web3.eth.sign(signer1, txHash)
      const signature2 = await web3.eth.sign(signer2, txHash)

      const confirmSignature1 = (await web3.eth.sign(signer1, confirmHash)).slice(2)
      const confirmSignature2 = (await web3.eth.sign(signer2, confirmHash)).slice(2)

      const legitConfirmSigs = confirmSignature1 + confirmSignature2

      // assert invalid confirmSignatures will not pass checkSigs
      assert.isFalse(
        await validator.checkSigs.call(txHash, rootHash, 1, signature2 + signature1.slice(2) + legitConfirmSigs),
        "wrong order transaction signatures shouldn't pass"
      )
    })











  })

})