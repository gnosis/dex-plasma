pragma solidity ^0.4.0;

import "./RLP.sol";


library PlasmaRLP {

    struct ExitingTx {
        address exitor;
        uint256 token;
        uint256 amount;
        uint256 inputCount;
    }

    struct ExitingOrder {
        address exitor;
        uint256 targetToken;
        uint256 sourceToken;
        uint256 amount;
        uint256 limitPrice;
        bytes utxo;
    }
    /* Public Functions */

    function getUtxoPos(bytes memory challengingTxBytes, uint256 oIndex)
        internal
        constant
        returns (uint256)
    {
        var txList = RLP.toList(RLP.toRlpItem(challengingTxBytes));
        uint256 oIndexShift = oIndex * 3;
        return
            RLP.toUint(txList[0 + oIndexShift]) +
            RLP.toUint(txList[1 + oIndexShift]) +
            RLP.toUint(txList[2 + oIndexShift]);
    }

    function createExitingTx(bytes memory exitingTxBytes, uint256 oindex)
        internal
        constant
        returns (ExitingTx)
    {
        var txList = RLP.toList(RLP.toRlpItem(exitingTxBytes));
        return ExitingTx({
            exitor: RLP.toAddress(txList[7 + 2 * oindex]),
            token: RLP.toUint(txList[6]),
            amount: RLP.toUint(txList[8 + 2 * oindex]),
            inputCount: RLP.toUint(txList[0]) * RLP.toUint(txList[3])
        });
    }

    function createExitingOrder(bytes memory exitingOrderBytes)
        internal
        constant
        returns (ExitingOrder)
    {
        var txList = RLP.toList(RLP.toRlpItem(exitingOrderBytes));
        uint skeleton = RLP.toUint(txList[0]);
        uint _amount = skeleton%(1329227995784915872903807060280344576); //2**120
        skeleton = skeleton/ 1329227995784915872903807060280344576;
        uint _sourceToken = skeleton%8;
        skeleton = skeleton / 8;
        uint _targetToken = skeleton%8;
        skeleton = skeleton / 8;
        uint _limitPrice = skeleton;
        return ExitingOrder({
            exitor: RLP.toAddress(txList[1]),
            targetToken:_targetToken,
            sourceToken: _sourceToken,
            amount: _amount,
            limitPrice: _limitPrice,
            utxo: RLP.toBytes(txList[2])
        });
    }
}
