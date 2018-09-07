const MerkleMock = artifacts.require("MerkleMock");

contract('Merkle', (accounts) => {
  // const [operator, depositor] = accounts

  // beforeEach(async function () {
  //   merkle = await MerkleMock.new();
  // });

  before(async () => {
    merkle = await MerkleMock.new();
  })

  describe('containment proofs', function () {

    it('Height 3, leaf 1', async () => {
      var leaf = '0x044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d'
      var index = 1
      var tree_root = '0x568ff5eb286f51b8a3e8de4e53aa8daed44594a246deebbde119ea2eb27acd6b'
      var proof = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc627c2feed9df4c4903bfc9f1bda886662bebc8ba175ccdb3d1da20ce3a32441ba519d76fbbd63a3ac72cdfee0c0e650d76e933ef34227d72ef272a397ee3ce5ba'
      res = (await merkle.checkMembership(leaf, index, tree_root, proof, 3));
      assert.equal(res, false, "Failed submission of proof height");
    })

    it('Height 3, leaf 0', async () => {
      var leaf = '0x044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d'
      var index = 0
      var tree_root = '0x568ff5eb286f51b8a3e8de4e53aa8daed44594a246deebbde119ea2eb27acd6b'
      var proof = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc627c2feed9df4c4903bfc9f1bda886662bebc8ba175ccdb3d1da20ce3a32441ba519d76fbbd63a3ac72cdfee0c0e650d76e933ef34227d72ef272a397ee3ce5ba'
      res = (await merkle.checkMembership(leaf, index, tree_root, proof, 3));
      assert.equal(res, true, "Successful submission of proof height");
    })
  })



  // it('Merkle Test 2', async () => { 
  //   var currentDepositBlock = (await plasma.currentDepositBlock.call()).toNumber()

  //   await plasma.deposit(ether, 0, {from: depositor})

  //   var currentDepositBlockNew = (await plasma.currentDepositBlock.call()).toNumber()

  //   assert.equal(currentDepositBlock+1, currentDepositBlockNew, "new deposit has not been correctly credited")
  // })

})  
