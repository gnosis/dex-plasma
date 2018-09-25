/*eslint no-undef: "off"*/

const EtherToken = artifacts.require("EtherToken")
const Plasma = artifacts.require("Plasma.sol")

module.exports = function(deployer, networks, accounts) {
  deployer.deploy(Plasma, accounts[0], EtherToken.address)
}