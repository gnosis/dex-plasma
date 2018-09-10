const MerkleMock = artifacts.require("MerkleMock");

contract('Merkle', (accounts) => {

  before(async () => {
    merkle = await MerkleMock.new();
  })

  describe('Containment proofs', function () {

    it('Height 3, leaf 0, proof 0', async () => {
      var leaf = '0x044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d'
      var index = 0
      var tree_root = '0x568ff5eb286f51b8a3e8de4e53aa8daed44594a246deebbde119ea2eb27acd6b'
      var proof = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc627c2feed9df4c4903bfc9f1bda886662bebc8ba175ccdb3d1da20ce3a32441ba519d76fbbd63a3ac72cdfee0c0e650d76e933ef34227d72ef272a397ee3ce5ba'
      res = (await merkle.checkMembership(leaf, index, tree_root, proof, 3));
      assert.equal(res, true, "Successful submission of proof height");
    })

    it('Height 3, bad index', async () => {
      var leaf = '0x044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d'
      var index = 1
      var tree_root = '0x568ff5eb286f51b8a3e8de4e53aa8daed44594a246deebbde119ea2eb27acd6b'
      var proof = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc627c2feed9df4c4903bfc9f1bda886662bebc8ba175ccdb3d1da20ce3a32441ba519d76fbbd63a3ac72cdfee0c0e650d76e933ef34227d72ef272a397ee3ce5ba'
      res = (await merkle.checkMembership(leaf, index, tree_root, proof, 3));
      assert.equal(res, false, "Not contained! Good proof, bad index");
    })

    it('Height 16, leaf 0, correct proof', async () => {
      var leaf = '0x044852b2a670ade5407e78fb2863c51de9fcb96542a07186fe3aeda6bb8a116d'
      var index = 0
      var tree_root = '0x08732cb2d07c0e507a3ac2caa6ca82cb9e12d152327ed980ed0dd7c62ebe04cb'
      var proof = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc627c2feed9df4c4903bfc9f1bda886662bebc8ba175ccdb3d1da20ce3a32441ba519d76fbbd63a3ac72cdfee0c0e650d76e933ef34227d72ef272a397ee3ce5ba0b4a15690ab643f9f8b8b83011b19a76b3d7805b9a7e29b3163539682b16263bcf55ad00a9e9e0f3bc0aa4f3add0a48802054fb6454bef7f666b069242fbdeca132163a255e4d8b1474860c6a8fef6daa77f37bfcb8e16a15c5c2f0189e40391e60dfb9904aa3e481bbd90a76ddff3c69c398512d14391ecfb9dbeabd5cb47b6566e94ae5414f6302339390d91cf2b436e1b8433874efeef25712f4bc3186634fbdd08b3de8b9ad6421a70c4ffac012498ff5fafd85a1cee26af8afdf2c849fffa7bb0594b7254d499c6f9e254f8e1c847547f562be014cb514c5c277e1fb4a669424f34b8ac3adacddec5feb8b5ea400c6190ca2c9b5f74b794c3e677e976934cdb8a1c13bfca30d7f71264b28df23fbc48605d9bb1627f5b238b546c8bb79449c4e6601245b29f3921839adad23b6ac0d546c42fefa7807db9bd783f14326d06ddc2ddca3b8f4338acaab1090d990624bd5d4108864d17332c87d79b151069dfea8e3c6f8e25cc13a8db4ff08684c10d0fc64c1156636979c097aefbbb14f005a1df3d73540926c2e0c322b30824234ad7a4b5f47f7e8e7193683ab2d0177c'

      res = (await merkle.checkMembership(leaf, index, tree_root, proof, 16));
      assert.equal(res, true);
    })

    it('Height 16, leaf 3, correct proof', async () => {
      var leaf = '0x2a80e1ef1d7842f27f2e6be0972bb708b9a135c38860dbe73c27c3486c34f4de'
      var index = 3
      var tree_root = '0x08732cb2d07c0e507a3ac2caa6ca82cb9e12d152327ed980ed0dd7c62ebe04cb'
      var proof = '0xad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a50b4aa17bff8fc189efb37609ac5ea9fca0df4c834a6fbac74b24c8119c40fef2519d76fbbd63a3ac72cdfee0c0e650d76e933ef34227d72ef272a397ee3ce5ba0b4a15690ab643f9f8b8b83011b19a76b3d7805b9a7e29b3163539682b16263bcf55ad00a9e9e0f3bc0aa4f3add0a48802054fb6454bef7f666b069242fbdeca132163a255e4d8b1474860c6a8fef6daa77f37bfcb8e16a15c5c2f0189e40391e60dfb9904aa3e481bbd90a76ddff3c69c398512d14391ecfb9dbeabd5cb47b6566e94ae5414f6302339390d91cf2b436e1b8433874efeef25712f4bc3186634fbdd08b3de8b9ad6421a70c4ffac012498ff5fafd85a1cee26af8afdf2c849fffa7bb0594b7254d499c6f9e254f8e1c847547f562be014cb514c5c277e1fb4a669424f34b8ac3adacddec5feb8b5ea400c6190ca2c9b5f74b794c3e677e976934cdb8a1c13bfca30d7f71264b28df23fbc48605d9bb1627f5b238b546c8bb79449c4e6601245b29f3921839adad23b6ac0d546c42fefa7807db9bd783f14326d06ddc2ddca3b8f4338acaab1090d990624bd5d4108864d17332c87d79b151069dfea8e3c6f8e25cc13a8db4ff08684c10d0fc64c1156636979c097aefbbb14f005a1df3d73540926c2e0c322b30824234ad7a4b5f47f7e8e7193683ab2d0177c'

      res = (await merkle.checkMembership(leaf, index, tree_root, proof, 16));
      assert.equal(res, true);
    })


  })

})  
