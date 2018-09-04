
/* eslint no-undef: "error" */
//const deployMath = require("@gnosis.pm/util-contracts/src/migrations/2_deploy_math")
const deployWeth = require("@gnosis.pm/util-contracts/src/migrations/3_deploy_WETH")


module.exports = function (deployer, network, accounts) {
  	if (network === "development") {
	    const deployParams = {
	      artifacts,
	      deployer,
	      network,
	      accounts
	    }
	     deployer
	    //  .then(() => deployMath(deployParams))
	      .then(() => deployWeth(deployParams))
	  	} else {
	    	console.log("Not in development, so nothing to do. Current network is %s", network)
	  	}		
}