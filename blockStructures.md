Block structure overview:
=========================


Transactionblock:
----------------

- every transaciton block contains a merkle tree of height 16
- transaction are listed 0-#(Transactions), rest of merkle tree is filled with 0's

Orderblock:
-----------
- root = sha(MerkleRoot(skeletonOrder+generalOrder), MerkleRoot(skeletonOrder))
- these two MerkleRoots are made by a Merkle tree of height 16
- orders are listed 0-#(Orders), rest of merkle tree is filled with 0's


Each order is made of two parts: skeletonOrder, generalOrder


*skeletonOrder* 256 bits needed for snark proofs:

- Limit price (120 bits - i.e. pow(10,36) in base 2)
Note that this is meant to represent fractional values ranging between 10^{-18} and 10^18
- Target token (8 bits - i.e. we support 32 = 2^5 tokens)
- Source token (8 bits)
- Amount (120 bits)  - LSB


*generalInfo*:

- owner (integer id coming from the smart contract struct)
- UTXO (unique identifier of the referred orderOutput or transactionOutput)
- signature owner,
- double sig of previous owner (this is necessary for normal transactionsdue to the double spend attack:cf.: https://ethresear.ch/t/plasma-vulnerabiltity-sybil-txs-drained-contract/1654, for spending orderOutputs, this is not necessary, as the double signature should be either public or should be challenged via the bitmap-publishing-process)

skeletonOrder and the fields of generalInfo are packed into a RLP object.



ConfirmSignatureBlock:
----------------------

- root = sha(sha(bitmap),merkleroot(all confirm siguatres))
- the merkleroot of the confirm signatures is calculated by putting the confirm signatures in the same leave as the corresponding order

AuctionResultBlock (with AuctionOutputBlock):
--------------------------------------

- root = sha(sha(MerkleRoot(prices),MerkleRoot(Volumes)), MerkleRoot(auctionOutputBlock))
- auctionOutputBlocks contains all outputs created by an auction. Since we have for each order, potentially two auctionOutputs, this will be a tree of depth 17
- price are listed as a vector of size n-1, if we trade n tokens. The price of Ether should always be 1(=10**18)
- volumes will list for each order the actual trading volume. The volume is a the same place, as the order it is referring to. If an order was empty, then we insert the volume 0

