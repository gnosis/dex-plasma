const ValidateWrapper = artifacts.require("ValidateWrapper")

const {
  assertRejects
} = require("./utilities.js")

contract("Validate", () => {
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

    // TODO - Get Validator to pass
  })
})