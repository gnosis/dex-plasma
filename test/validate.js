const ValidateWrapper = artifacts.require("ValidateWrapper");

let {
    assertRejects
} = require('./utilities.js');

contract('Validate', (accounts) => {
    const [operator, depositor] = accounts
    
    const zeroHash32 = "0x" + '00'.repeat(32)

    const short_sig = "0x7226EB9E77E58C172BDC510C76E15B4BF9A81EF"

    zeroSig195 = "0x" + '00'.repeat(195)
    zeroSig260 = "0x" + '00'.repeat(260)

    before(async () => {
        validator = await ValidateWrapper.new();
    })

    describe('checkSigs', () => {

        it('Fail: sig length not a multiple of 65', async () => {
            await assertRejects(validator.checkSigs(zeroHash32, zeroHash32, 0, zeroHash32))
        })

        it('Fail: sig length greater than 260', async () => {
            await assertRejects(validator.checkSigs(zeroHash32, zeroHash32, 0, "0x" + '00'.repeat(261)))
        })

        it('Fail: signatures not correct', async () => {
            res = await validator.checkSigs.call(zeroHash32, zeroHash32, 0, zeroSig195)
            assert.equal(res, false)
        })

        // TODO - Get Validator to pass


    })

})
