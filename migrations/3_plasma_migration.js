
const EtherToken = artifacts.require("EtherToken")
const Plasma = artifacts.require("Plasma.sol")
const PriorityQueue = artifacts.require("PriorityQueue.sol");

module.exports = function(deployer, networks, accounts) {
    deployer.deploy(PriorityQueue)
    deployer.deploy(Plasma, accounts[0], EtherToken.address)
}