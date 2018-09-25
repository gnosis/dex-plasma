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

// Fast forward 1 week
// let fastForward = async function() {
//   let oldTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
//   await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [804800], id: 0});
//   await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0});
//   let currTime = (await web3.eth.getBlock(await web3.eth.blockNumber)).timestamp;
//   let diff = (currTime - oldTime) - 804800;
//   assert.isBelow(diff, 3, "Block time was not fast forwarded by 1 week");
// };


module.exports = {
  assertRejects,
  catchError,
  toHex,
  waitForNBlocks,
  encodeUtxoPosition,
  BlockType,
  // fastForward: fastForward,
}