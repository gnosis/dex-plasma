const RLP = require("rlp")
const { sha3 } = require("ethereumjs-util")
const MerkleTree = require("merkletreejs")

/*
 How to avoid using try/catch blocks with promises' that could fail using async/await
 - https://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
 */

const assertRejects = async (q, msg) => {
  let res, catchFlag = false
  try {
    res = await q
    // checks if there was a Log event and its argument l contains string "R<number>"
    catchFlag = res.logs && !!res.logs.find(log => log.event === "Log" && /\bR(\d+\.?)+/.test(log.args.l))
  } catch (e) {
    catchFlag = true
  } finally {
    if (!catchFlag) {
      assert.fail(res, null, msg)
    }
  }
}

const catchError = function(promise) {
  return promise.then(result => [null, result])
    .catch(err => [err])
}

const toHex = function(buffer) {
  buffer = buffer.toString("hex")
  if (buffer.substring(0, 2) == "0x")
    return buffer
  return "0x" + buffer.toString("hex")
}

const fromHex = function(hexString) {
  return Buffer.from(hexString.slice(2), "hex")
}

// Wait for n blocks to pass
const waitForNBlocks = async function(numBlocks, authority) {
  for (let i = 0; i < numBlocks; i++) {
    await web3.eth.sendTransaction({from: authority, "to": authority, value: 100})
  }
}

const encodeUtxoPosition = function(block, tx, oindex) {
  return block * 10**9 + tx * 10**4 + oindex
}

const BlockType = {
  Transaction: 0,
  Deposit: 1,
  Order: 2,
  OrderDoubleSign: 3,
  AuctionResult: 4,
  AuctionOutput: 5,
}

/**
 * Generates a transaction object for the given parameters.
 * The object consists of:
 * 1.) the RLP representation of that transaction (as a hex string)
 * 2.) the hash of that representation
 * 3.) the signature of that transaction signed by signer (exitor if signer is not specified)
 * 4.) the hash of the concetanation of txHash and signature (leaf element in the plasma merkle tree)
 */
const generateTransaction = async function(exitor, token, amount, inputCount, oindex, signer) {
  if (!signer) {
    signer = exitor
  }
  const tx = rlpEncodeTransaction(exitor, token, amount, inputCount, oindex)
  const txHash = sha3(tx)
  const txSignature = await web3.eth.sign(signer, toHex(txHash)) + "00".repeat(65)
  const signedTxHash = sha3(Buffer.concat([txHash, fromHex(txSignature)]))
  return {
    tx: toHex(tx),
    txHash,
    txSignature,
    signedTxHash,
  }
}

/**
 * Given an existing tx including a signature and the tree this transaction appears in,
 * this function generates and returns the concatenated double signature.
 */
const generateDoubleSignature = async function(tx, tree, signer) {
  const confirmationHash = sha3(toHex(Buffer.concat([tx.txHash, tree.getRoot()])))
  const confSignature = await web3.eth.sign(signer, toHex(confirmationHash))
  return tx.txSignature + confSignature.slice(2)
}

/**
 * Given a sequence of index1, elements1, ..., indexN elementN this function returns 
 * the corresponding MerkleTree of height 16.
 */
const generateMerkleTree = function(...args) {
  const txs = Array(2**16).fill(sha3(0x0))
  for (let i=0; i<args.length; i+=2) {
    txs[args[i]] = args[i+1]
  }
  return new MerkleTree(txs, sha3)
}

const rlpEncodeTransaction = function(exitor, token, amount, inputCount, oindex) {
  const list = [inputCount, null, null, null, null, null, token, null, null, null, null]
  if (oindex) {
    list[9] = exitor
    list[10] = amount
  } else {
    list[7] = exitor
    list[8] = amount
  }
  return RLP.encode(list)
}

function keccak256(...args) {
  args = args.map(arg => {
    if (typeof arg === "string") {
      if (arg.substring(0, 2) === "0x") {
        return arg.slice(2)
      } else {
        return web3.toHex(arg).slice(2)
      }
    }

    if (typeof arg === "number") {
      return leftPad((arg).toString(16), 64, 0)
    } else {
      return ""
    }
  })

  args = args.join("")

  return web3.sha3(args, { encoding: "hex" })
}

const fastForward = async function(seconds) {
  const oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp
  await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [seconds], id: 0})
  await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0})
  const currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp
  const diff = (currTime - oldTime) - seconds
  assert.isAbove(diff, 0, "Block time was not fast forwarded enough")
}


module.exports = {
  assertRejects,
  catchError,
  keccak256,
  fromHex,
  toHex,
  waitForNBlocks,
  encodeUtxoPosition,
  BlockType,
  rlpEncodeTransaction,
  generateTransaction,
  generateDoubleSignature,
  generateMerkleTree,
  fastForward,
}