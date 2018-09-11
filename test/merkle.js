const MerkleWrapper = artifacts.require("MerkleWrapper");

const MerkleTree = require('merkletreejs');
const { sha3 } = require('ethereumjs-util')

let {
    assertRejects,
    toHex
} = require('./utilities.js');


contract('Merkle', (accounts) => {

  describe('Height 2 "all" permutations', function () {
    before(async () => {
      merkle = await MerkleWrapper.new();
    })
    

    const leaves = ['0', '1', '2', '3'].map(x => sha3(x))
    const tree = new MerkleTree(leaves, sha3)
    const proofs = leaves.map(x => tree.getProof(x))
    
    const concatenated_proofs = proofs.map(pf => Buffer.concat(pf.map(x => x.data)))

    const hex_root = toHex(tree.getRoot())
    const hex_proofs = concatenated_proofs.map(t => toHex(t))
    const hex_leaves = leaves.map(t => toHex(t))


    // Should all be True!
    it('correct proof at 0', async () => {
      res = (await merkle.checkMembership(hex_leaves[0], 0, hex_root, hex_proofs[0], 2));
      assert.equal(res, true, "Failed proof at 0-0-0");
    })

    it('correct proof at 1', async () => {
      res = (await merkle.checkMembership(hex_leaves[1], 1, hex_root, hex_proofs[1], 2));
      assert.equal(res, true, "Failed proof at 1-1-1");
    })

    it('correct proof at 2', async () => {
      res = (await merkle.checkMembership(hex_leaves[2], 2, hex_root, hex_proofs[2], 2));
      assert.equal(res, true, "Failed proof at 2-2-2");
    })

    it('correct proof at 3', async () => {
      res = (await merkle.checkMembership(hex_leaves[3], 3, hex_root, hex_proofs[3], 2));
      assert.equal(res, true, "Failed proof at 3-3-3");
    })

    // Should all be false
    it('Wrong leaf; 2-3-3', async () => {
      res = (await merkle.checkMembership(hex_leaves[2], 3, hex_root, hex_proofs[3], 2));
      assert.equal(res, false);
    })

    it('Wrong Index; 1-2-1', async () => {
      res = (await merkle.checkMembership(hex_leaves[1], 2, hex_root, hex_proofs[1], 2));
      assert.equal(res, false);
    })

    it('Wrong Proof; 0-0-3', async () => {
      res = (await merkle.checkMembership(hex_leaves[0], 0, hex_root, hex_proofs[3], 2));
      assert.equal(res, false);
    })

    it('Wrong Height [short]; 0-0-0', async () => {
      await assertRejects(merkle.checkMembership(hex_leaves[0], 0, hex_root, hex_proofs[0], 0));
    })

    it('Wrong Height [long]; 1-1-1', async () => {
      await assertRejects(merkle.checkMembership(hex_leaves[1], 1, hex_root, hex_proofs[1], 5));
    })

    it('Wrong Proof length; 0-0-0', async () => {
      bad_proof = hex_proofs[0].slice(0, 10)
      await assertRejects(merkle.checkMembership(hex_leaves[0], 0, hex_root, bad_proof, 2));
    })

  })

})  
