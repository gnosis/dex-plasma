/*eslint no-undef: "off"*/
const Migrations = artifacts.require("./Migrations.sol")

module.exports = function(deployer) {
  deployer.deploy(Migrations)
}
