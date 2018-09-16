const ValidateWrapper = artifacts.require("ValidateWrapper");

let {
    assertRejects
} = require('./utilities.js');

contract('Validate', (accounts) => {
    const [operator, depositor] = accounts
    
    const zeroHash32 = "0x0000000000000000000000000000000000000000000000000000000000000000"
    const sig1 = "0x731a3d52ce034d799d1eb35a60092919402af1aa9f967d563864f16a8c971e5a"
    const sig2 = "0x21ca6f513bb5234003dfef377c6594c2a862940a70d1b47055c359287f36d719"
    before(async () => {
        validator = await ValidateWrapper.new();
    })

    describe('checkSigs', () => {

        it('Fail Length verification: Circuit 1', async () => {            
            await assertRejects(validator.checkSigs(zeroHash32, zeroHash32, 0, zeroHash32))
        })

        // it('Fail Length verification: Circuit 2', async () => {
        //     txn = await validator.checkSigs(zeroHash32, zeroHash32, 0, zeroHash65)
        //     console.log(txn)
        //     assert.ok(false)
        // })

        // TODO - Get Validator to pass


    })

})
